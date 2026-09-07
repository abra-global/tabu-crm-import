import { crmClient } from '../crm/crmClient.js';
import { resolveTechnicalId } from '../utils/resolveId.js';
import { logger } from '../logger.js';

const ACCOUNTS_PATH = '/sap/c4c/api/v1/account-service/accounts';

// Known-safe technical defaults required by mandatory SAP address fields.
// These are NOT fake personal data - they are structural placeholders the
// spec explicitly authorizes (spec section 6).
//
// NOTE on `region`: the existing, confirmed-working SAP integration
// (project-data-import's buildAccountPayload) does NOT construct a
// `region` object at all during Account creation - its `defaultAddress`
// is just `{ country }`. Removed here to match that proven structure.
const SAFE_ADDRESS_DEFAULTS = {
  country: 'IL',
  countryDescription: 'Israel',
  postalCode: '00000',
  isPostOfficeBoxAddress: false,
};

/**
 * Looks up a private-owner Account strictly by Israeli ID (extensions/Z_IdNum).
 * Never matches or creates by name alone.
 */
export async function findAccountByIdNumber(idNumber) {
  const filter = `extensions/Z_IdNum eq '${idNumber}'`;
  const { data } = await crmClient.get(`${ACCOUNTS_PATH}?$filter=${encodeURIComponent(filter)}`);
  const rawList = data?.value ?? data?.d?.results ?? (Array.isArray(data) ? data : []);
  if (rawList.length === 0) return null;
  return rawList[0];
}

/**
 * Creates a new private-owner Account using the fixed defaults mandated by
 * spec section 6. Only the Israeli ID and owner name come from extracted
 * data; everything else is a structural default, never invented personal
 * contact information.
 */
export async function createAccount({ idNumber, ownerName }) {
  const body = {
    firstLineName: ownerName,
    customerRole: 'CRM000',
    lifeCycleStatus: 'ACTIVE',
    isProspect: false,
    extensions: {
      Z_Account_Group: '4',
      Z_IdNum: idNumber,
    },
    defaultAddress: { ...SAFE_ADDRESS_DEFAULTS },
  };

  const { data } = await crmClient.post(ACCOUNTS_PATH, body);
  // SAP's Account POST response wraps the created entity as
  // `{ value: { id, displayId, ... } }` (confirmed from an actual response),
  // unlike a flat entity body. Unwrap that envelope before resolving the
  // technical ID; fall back to `data` itself if it isn't wrapped, so the
  // existing generic id/ID/ObjectID/objectId resolution still applies.
  const accountId = resolveTechnicalId(data?.value ?? data, { entityName: 'Account' });
  logger.info('accountService', 'Created new Account', { idNumber, accountId });
  return { id: accountId, raw: data };
}

/**
 * Finds-or-creates a private-owner Account by Israeli ID. Returns
 * { id, created: boolean }.
 */
export async function resolveAccountForOwner({ idNumber, ownerName }) {
  const existing = await findAccountByIdNumber(idNumber);
  if (existing) {
    const id = resolveTechnicalId(existing, { entityName: 'Account (lookup)' });
    logger.debug('accountService', 'Reusing existing Account', { idNumber, accountId: id });
    return { id, created: false };
  }
  const created = await createAccount({ idNumber, ownerName });
  return { id: created.id, created: true };
}
