import { config, isGovernmentAuthorityName } from '../config.js';
import { logger } from '../logger.js';
import { assertImportCanStart } from '../utils/validation.js';
import { verifyOpportunityExists, associateRegisteredProductWithOpportunity } from './opportunityService.js';
import { getReferenceProductId } from './productService.js';
import { resolveAccountForOwner } from './accountService.js';
import { resolveContactForOwner } from './contactService.js';
import { upsertRegisteredProduct, buildSerialId } from './registeredProductService.js';

function unitLabel(unit) {
  return `גוש ${unit.block} · חלקה ${unit.parcel} · תת חלקה ${unit.subParcel}`;
}

function isValidOwner(owner) {
  return Boolean(owner.idNumber) && owner.idNumberConfident === true;
}

/**
 * Resolves the Account/Contact identity for one Sub-Parcel's owners
 * according to spec sections 5, 6 and 7.
 *
 * Every Account/Contact association is checked against SAP (via
 * resolveAccountForOwner/resolveContactForOwner, which look up before
 * creating) and reported individually in `associationResults` as
 * 'created' or 'already_exists' - never silently treated as a fresh
 * success when SAP already had it.
 *
 * Returns:
 *   {
 *     primaryAccountId: string | null,
 *     accountsCreated, accountsReused, contactsCreated, contactsReused: number,
 *     skippedOwners: [{ name }],
 *     isGovernmentAuthority: boolean,
 *     associationResults: [{ label, status }],
 *   }
 */
async function resolveOwnersForUnit(unit, { separateAccountPerResident, log }) {
  const counters = { accountsCreated: 0, accountsReused: 0, contactsCreated: 0, contactsReused: 0 };
  const skippedOwners = [];
  const associationResults = [];

  if (!unit.owners || unit.owners.length === 0) {
    // No owners at all - Registered Product is created/updated with no
    // Account and no Contact, per spec / existing UI copy. Nothing to
    // check for duplicates.
    return { primaryAccountId: null, ...counters, skippedOwners, isGovernmentAuthority: false, associationResults };
  }

  const govtOwner = unit.owners.find((o) => o.isGovernmentAuthority || isGovernmentAuthorityName(o.name));
  if (govtOwner) {
    // Spec section 5: fixed Account, no lookup, no Account creation, no
    // Contact. Never infer this from an unrelated SAP error later. The
    // fixed Government Account is a static constant, not something SAP
    // lookup can return "created"/"already_exists" for, so it is not
    // added to associationResults.
    log(`בעלים ציבורי (${govtOwner.name}) - משתמש בחשבון קבוע של רשות הפתוח.`);
    logger.info('importService', 'Using fixed Government Authority Account', {
      accountId: config.sap.governmentAccountId,
      unit: unitLabel(unit),
    });
    return {
      primaryAccountId: config.sap.governmentAccountId,
      ...counters,
      skippedOwners,
      isGovernmentAuthority: true,
      associationResults,
    };
  }

  const validOwners = [];
  for (const owner of unit.owners) {
    if (isValidOwner(owner)) {
      validOwners.push(owner);
    } else {
      skippedOwners.push({ name: owner.name });
    }
  }

  if (validOwners.length === 0) {
    // Every owner on this unit has a missing/uncertain ID - cannot safely
    // resolve any Account. Clear validation error, no guessing.
    throw Object.assign(new Error('כל בעלי תת-החלקה חסרי מספר ת"ז ודאי - לא ניתן ליצור/לאתר חשבון.'), {
      skippedOwners,
      associationResults,
    });
  }

  let primaryAccountId = null;

  async function resolveOwnerAccount(owner, { isIdentityOwner }) {
    const label = `דייר ${owner.name} ← חשבון (Account)`;
    try {
      log(`מאתר/יוצר חשבון עבור ${owner.name}...`);
      const account = await resolveAccountForOwner({ idNumber: owner.idNumber, ownerName: owner.name });
      if (account.created) counters.accountsCreated += 1;
      else counters.accountsReused += 1;
      associationResults.push({ label, status: account.created ? 'created' : 'already_exists' });
      return account;
    } catch (err) {
      associationResults.push({ label, status: 'failed' });
      throw err;
    }
  }

  async function resolveOwnerContact(owner, accountId) {
    const label = `דייר ${owner.name} ← איש קשר (Contact)`;
    try {
      log(`מאתר/יוצר איש קשר עבור ${owner.name}...`);
      const contact = await resolveContactForOwner({ idNumber: owner.idNumber, name: owner.name, accountId });
      if (contact.created) counters.contactsCreated += 1;
      else counters.contactsReused += 1;
      associationResults.push({ label, status: contact.created ? 'created' : 'already_exists' });
      return contact;
    } catch (err) {
      associationResults.push({ label, status: 'failed' });
      throw err;
    }
  }

  if (separateAccountPerResident) {
    try {
      for (const owner of validOwners) {
        const account = await resolveOwnerAccount(owner, { isIdentityOwner: true });
        await resolveOwnerContact(owner, account.id);
        if (primaryAccountId === null) primaryAccountId = account.id;
      }
    } catch (err) {
      // Whatever association results were already collected before the
      // failure (including the 'failed' entry just pushed above) must
      // still reach the caller, even though this function is about to
      // throw and lose its local scope.
      err.associationResults = associationResults;
      err.skippedOwners = skippedOwners;
      throw err;
    }
  } else {
    const [first, ...rest] = validOwners;
    try {
      const account = await resolveOwnerAccount(first, { isIdentityOwner: true });
      primaryAccountId = account.id;

      for (const owner of rest) {
        await resolveOwnerContact(owner, account.id);
      }
    } catch (err) {
      err.associationResults = associationResults;
      err.skippedOwners = skippedOwners;
      throw err;
    }
  }

  return { primaryAccountId, ...counters, skippedOwners, isGovernmentAuthority: false, associationResults };
}

/**
 * Runs the full import for every Sub-Parcel independently. `emit` is called
 * with SSE-shaped events; one failed Sub-Parcel never prevents the others
 * from completing (spec section 17).
 */
export async function runImport({ projectId, subParcels, separateAccountPerResident }, emit) {
  assertImportCanStart({ projectId, subParcels });

  // Confirms the Project (Opportunity) really exists in CRM - this is also
  // where "Project name exists" from the spec's pre-flight checks is
  // effectively verified, since a non-existent Opportunity has no name to
  // return and the GET will fail.
  await verifyOpportunityExists(projectId);
  const referenceProductId = await getReferenceProductId();

  const unitResults = [];
  const associationResults = [];
  const totals = {
    registeredProductsCreated: 0,
    registeredProductsUpdated: 0,
    accountsCreated: 0,
    accountsReused: 0,
    contactsCreated: 0,
    contactsReused: 0,
  };

  for (const unit of subParcels) {
    const label = unitLabel(unit);
    emit({ type: 'unit_start', subParcelId: unit.id });

    const log = (message) => emit({ type: 'unit_status', subParcelId: unit.id, message });

    try {
      const ownerResolution = await resolveOwnersForUnit(unit, { separateAccountPerResident, log });
      associationResults.push(...ownerResolution.associationResults);

      totals.accountsCreated += ownerResolution.accountsCreated;
      totals.accountsReused += ownerResolution.accountsReused;
      totals.contactsCreated += ownerResolution.contactsCreated;
      totals.contactsReused += ownerResolution.contactsReused;

      log(`בונה מוצר רשום (${buildSerialId(unit)})...`);
      const rpResult = await upsertRegisteredProduct({
        unit,
        referenceProductId,
        accountId: ownerResolution.primaryAccountId,
        opportunityId: projectId,
        log,
      });

      if (rpResult.created) totals.registeredProductsCreated += 1;
      else totals.registeredProductsUpdated += 1;

      if (rpResult.accountAssociation) {
        associationResults.push({
          label: `דירה ${rpResult.serialId} ← שיוך לחשבון (Account)`,
          status: rpResult.accountAssociation,
        });
      }

      // Associate this Registered Product with the selected Opportunity.
      // associateRegisteredProductWithOpportunity performs its own SAP
      // duplicate check before ever POSTing (see opportunityService) - it
      // never relies on whether the RP was "just created" or on this
      // being the same import batch. If this fails, the Registered
      // Product itself was still created/updated successfully, but this
      // Sub-Parcel's overall result must still be reported as failed - it
      // is not falsely reported as a success just because the RP write
      // succeeded.
      log(`משייך מוצר רשום לפרויקט (Opportunity)...`);
      const opportunityAssociationLabel = `דירה ${rpResult.serialId} ← שיוך לפרויקט (Opportunity)`;
      let opportunityAssociationStatus;
      try {
        opportunityAssociationStatus = await associateRegisteredProductWithOpportunity(projectId, rpResult.id);
      } catch (err) {
        associationResults.push({ label: opportunityAssociationLabel, status: 'failed' });
        throw err;
      }
      associationResults.push({ label: opportunityAssociationLabel, status: opportunityAssociationStatus });

      unitResults.push({
        subParcelId: unit.id,
        label,
        success: true,
        error: null,
        skippedOwners: ownerResolution.skippedOwners,
      });
      emit({ type: 'unit_done', subParcelId: unit.id, success: true });
    } catch (err) {
      logger.error('importService', `Sub-Parcel failed: ${label}`, { message: err.message });
      if (err.associationResults?.length) {
        associationResults.push(...err.associationResults);
      }
      unitResults.push({
        subParcelId: unit.id,
        label,
        success: false,
        error: err.message,
        skippedOwners: err.skippedOwners ?? [],
      });
      emit({ type: 'unit_done', subParcelId: unit.id, success: false, error: err.message });
    }
  }

  const successfulRecords = unitResults.filter((u) => u.success).length;
  const failedRecords = unitResults.filter((u) => !u.success).length;
  const skippedOwnersCount = unitResults.reduce((sum, u) => sum + (u.skippedOwners?.length ?? 0), 0);

  const summary = {
    ...totals,
    subParcelsProcessed: unitResults.length,
    successfulRecords,
    failedRecords,
    skippedOwnersCount,
    unitResults,
    associationResults,
  };

  emit({ type: 'import_done', summary });
  return summary;
}
