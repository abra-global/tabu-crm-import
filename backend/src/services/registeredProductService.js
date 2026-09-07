import { config } from '../config.js';
import { crmClient, CrmApiError } from '../crm/crmClient.js';
import { resolveTechnicalId, assertNonEmptyId } from '../utils/resolveId.js';
import { assertPatchIsSafe, assertRegisteredProductInputIsSafe } from '../utils/validation.js';
import { logger } from '../logger.js';

const RP_PATH = '/sap/c4c/api/v1/registered-product-service/registeredProducts';

export function buildSerialId({ block, parcel, subParcel }) {
  return `${block}-${parcel}-${subParcel}`;
}

export async function findRegisteredProductBySerialId(serialId) {
  const { data } = await crmClient.get(`${RP_PATH}?$filter=${encodeURIComponent(`serialId eq '${serialId}'`)}`);
  const rawList = data?.value ?? data?.d?.results ?? (Array.isArray(data) ? data : []);
  if (rawList.length === 0) return null;
  return rawList[0];
}

function buildExtensions(unit) {
  return {
    Z_Block: unit.block,
    Z_Parcel: unit.parcel,
    Z_SubParcel: unit.subParcel,
    Z_AreaSqm: unit.area || null,
    Z_Floor: unit.floor || null,
    Z_Entrance: unit.entrance || null,
    // Apartment Number stays empty unless explicitly supplied by the
    // source - never derived from Sub-Parcel (spec section 4 / 10).
    Z_ApartmentNumber: unit.apartmentNumber || null,
  };
}

/**
 * Builds the account association block for the Registered Product.
 * Only the fields confirmed by the specification are sent - no invented
 * fields such as internalId/displayId.
 */
function buildAccountCustomParties(accountId) {
  if (!accountId) return undefined;
  return [{ id: accountId, roleCode: 'Z1' }];
}

/**
 * Builds the Hebrew description entry for the Registered Product, using
 * only real extracted data (Block/Parcel/Sub-Parcel) - never invented
 * text. Structure confirmed against the working example (Jason.docx):
 * descriptions is an array of { content, languageCode }.
 */
function buildDescriptions(unit) {
  return [
    {
      content: `גוש ${unit.block} חלקה ${unit.parcel} תת חלקה ${unit.subParcel}`,
      languageCode: 'he',
    },
  ];
}

/**
 * Fixed Registered Product address. Per the confirmed-working CREATE/PATCH
 * structure, these values are hardcoded and NEVER derived from the PDF,
 * the Preview, configuration, or extracted data - there is nothing
 * dynamic in this object.
 */
function buildAddress() {
  return {
    postalAddress: {
      countryCode: 'IL',
      countryName: 'Israel',
      stateCode: '02',
      stateName: 'Haifa',
      streetPostalCode: '00000',
      formattedPostalAddress: '00000 / IL',
    },
  };
}

export async function createRegisteredProduct({ unit, referenceProductId, accountId, opportunityId, log }) {
  const serialId = buildSerialId(unit);
  assertRegisteredProductInputIsSafe({ serialId, block: unit.block, parcel: unit.parcel, subParcel: unit.subParcel });
  assertNonEmptyId(referenceProductId, 'reference Product ID');

  const body = {
    serialId,
    status: 'ACTIVE',
    typeCode: 'REGISTERED_PRODUCT',
    // referenceProduct includes both `id` and `displayId`, matching the
    // confirmed working example structure (Jason.docx). displayId is the
    // same known constant already used to look this Product up.
    referenceProduct: { id: referenceProductId, displayId: config.sap.referenceProductDisplayId },
    extensions: buildExtensions(unit),
    descriptions: buildDescriptions(unit),
    address: buildAddress(),
    // IMPORTANT: do not arbitrarily remove the root-level `account` field -
    // this SAP tenant requires it to create/update the Registered Product
    // (spec section 11).
    ...(accountId ? { account: { id: accountId } } : {}),
    ...(accountId ? { accountCustomParties: buildAccountCustomParties(accountId) } : {}),
    // NOTE: the Registered Product <-> Opportunity association is NOT made
    // here. It is done via a dedicated POST to the Opportunity's
    // registeredProducts child-collection endpoint after this Registered
    // Product has been created/updated - see
    // opportunityService.associateRegisteredProductWithOpportunity.
  };

  log?.(`יוצר מוצר רשום חדש (${serialId})...`);
  const { data } = await crmClient.post(RP_PATH, body);
  // SAP's Registered Product POST response wraps the created entity as
  // `{ value: { id, ... } }` (confirmed working pattern), not a flat entity
  // body. Check response.value.id first; fall back to response.id if the
  // response wasn't wrapped; resolveTechnicalId throws (a real error) if
  // neither is present.
  const id = resolveTechnicalId(data?.value ?? data, { entityName: 'Registered Product' });
  logger.info('registeredProductService', 'Created Registered Product', { serialId, id });
  return { id, serialId, created: true };
}

/**
 * Updates an existing Registered Product.
 *
 * Uses the manually confirmed-working PATCH structure (HTTP 204 verified
 * against SAP): `status`, `extensions`, the fixed `address`, and
 * `account.id`. Does NOT send `accountCustomParties` or `opportunity` -
 * the previous broader PATCH body caused SAP to reject the request with
 * "422 State Code is not valid".
 *
 * Flow (unchanged): fresh GET immediately before PATCH -> read ETag from
 * THAT GET -> PATCH the SAME technical ID with that SAME (normalized)
 * ETag. On a 412, exactly one fresh retry cycle.
 */
export async function updateRegisteredProduct({
  technicalId,
  unit,
  accountId,
  opportunityId,
  log,
  attempt = 1,
  firstAttemptEtag = null,
}) {
  const serialId = buildSerialId(unit);
  const patchUrl = `${RP_PATH}/${technicalId}`;

  // STEP 1 + 2: fresh GET, read the current ETag from THIS response. The
  // technical ID is already known (it's the ID used to build this GET
  // URL) - it is not re-derived from the response body.
  const { etag } = await crmClient.get(patchUrl);
  logger.debug('registeredProductService', '[registered-product][DEBUG] RP ID:', { technicalId });
  logger.debug('registeredProductService', '[registered-product][DEBUG] GET ETag:', { etag });

  if (!etag) {
    throw new Error(`Registered Product ${technicalId}: CRM did not return an ETag on GET.`);
  }

  // ---- TEMPORARY DIAGNOSTIC LOGGING (investigating repeated 412s) ----
  // Always-on (not gated by CRM_DEBUG) so it is visible during the real run.
  // Remove once the 412 root cause is confirmed and fixed.
  if (attempt === 2) {
    logger.warn('RP-DIAG-TEMP', '412 retry - GET ETag comparison', {
      technicalId,
      firstGetEtag: firstAttemptEtag,
      retryGetEtag: etag,
      retryIfMatch: etag,
    });
  }
  // ---------------------------------------------------------------------

  // Confirmed-working PATCH body ONLY: status, extensions, the fixed
  // address, and account.id when an Account is known. No
  // accountCustomParties, no opportunity, no other fields.
  const body = {
    status: 'ACTIVE',
    extensions: buildExtensions(unit),
    address: buildAddress(),
    ...(accountId ? { account: { id: accountId } } : {}),
  };

  // STEP 3 + 4: PATCH the SAME technical ID with that SAME ETag.
  assertPatchIsSafe({ targetId: technicalId, etag, patchUrl, ifMatch: etag });

  logger.debug('registeredProductService', '[registered-product][DEBUG] PATCH If-Match:', { etag });
  logger.debug('registeredProductService', '[registered-product][DEBUG] PATCH URL:', { patchUrl });
  logger.debug('registeredProductService', '[registered-product][DEBUG] PATCH body:', { body });

  // ---- TEMPORARY DIAGNOSTIC LOGGING (investigating repeated 412s) ----
  // Always-on (not gated by CRM_DEBUG) so it is visible during the real run.
  // Remove once the 412 root cause is confirmed and fixed.
  logger.warn('RP-DIAG-TEMP', 'Immediately before Registered Product PATCH', {
    technicalId,
    attempt,
    getEtag: etag,
    ifMatch: etag,
    patchUrl,
  });
  // ---------------------------------------------------------------------

  try {
    log?.(`מעדכן מוצר רשום קיים (${serialId})...`);
    await crmClient.patch(patchUrl, body, etag);
    logger.info('registeredProductService', 'Updated Registered Product', { serialId, technicalId });
    return { id: technicalId, serialId, created: false };
  } catch (err) {
    if (err instanceof CrmApiError && err.status === 412 && attempt === 1) {
      logger.warn('registeredProductService', 'Registered Product PATCH got 412, retrying once with a fresh GET', {
        technicalId,
      });
      // ---- TEMPORARY DIAGNOSTIC LOGGING (investigating repeated 412s) ----
      logger.warn('RP-DIAG-TEMP', '412 received on first attempt - about to perform retry GET', {
        technicalId,
        firstGetEtag: etag,
      });
      // ---------------------------------------------------------------------
      return updateRegisteredProduct({
        technicalId,
        unit,
        accountId,
        opportunityId,
        log,
        attempt: 2,
        firstAttemptEtag: etag,
      });
    }
    if (err instanceof CrmApiError && err.status === 412) {
      // Second 412 in a row - stop, per spec section 12. Surface real error.
      throw new Error(
        `Registered Product update failed due to a SAP concurrency/version conflict (HTTP 412) after one retry: ${err.message}`
      );
    }
    throw err;
  }
}

/**
 * Full find-or-create-or-update flow for one Sub-Parcel's Registered
 * Product. Never creates a duplicate Registered Product for the same
 * serialId.
 */
export async function upsertRegisteredProduct({ unit, referenceProductId, accountId, opportunityId, log }) {
  const serialId = buildSerialId(unit);
  const existing = await findRegisteredProductBySerialId(serialId);

  if (!existing) {
    return createRegisteredProduct({ unit, referenceProductId, accountId, opportunityId, log });
  }

  const technicalId = resolveTechnicalId(existing, { entityName: 'Registered Product (lookup)' });
  return updateRegisteredProduct({ technicalId, unit, accountId, opportunityId, log });
}
