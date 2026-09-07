import { crmClient } from '../crm/crmClient.js';
import { resolveTechnicalId } from '../utils/resolveId.js';
import { assertContactCreationIsSafe } from '../utils/validation.js';
import { logger } from '../logger.js';

const CONTACTS_PATH = '/sap/c4c/api/v1/contact-person-service/contactPersons';

/**
 * Duplicate lookup key is Israeli ID + Account ID (NOT Israeli ID alone).
 * The same person may legitimately exist as a Contact under different
 * Accounts. SAP is the sole authority for this check - there is
 * deliberately no in-memory cache here, so this is correct across
 * separate application runs as required by spec section 8.
 */
export async function findContactByIdAndAccount(idNumber, accountId) {
  const filter = `extensions/Z_ID_Number eq '${idNumber}' and isContactPersonFor/accountId eq '${accountId}'`;
  const { data } = await crmClient.get(`${CONTACTS_PATH}?$filter=${encodeURIComponent(filter)}`);
  const rawList = data?.value ?? data?.d?.results ?? (Array.isArray(data) ? data : []);
  if (rawList.length === 0) return null;
  return rawList[0];
}

export async function createContact({ idNumber, name, accountId }) {
  assertContactCreationIsSafe({ accountId, idNumber, duplicateLookupPerformed: true });

  // Z_ID_Number is a STRING, max length 10 (spec section 8).
  const trimmedId = String(idNumber).slice(0, 10);
  const { givenName, familyName } = splitName(name);

  // Structure confirmed against the existing working SAP integration
  // (project-data-import): a flat `accountId` field, and `givenName` /
  // `familyName` rather than a single `name`. The tenant rejected our
  // previous shape with "Data is required -> givenName" and
  // "DataTypeMismatch -> isContactPersonFor".
  const body = {
    givenName,
    familyName,
    accountId,
    extensions: { Z_ID_Number: trimmedId },
  };

  const { data } = await crmClient.post(CONTACTS_PATH, body);
  const contactId = resolveTechnicalId(data?.value ?? data, { entityName: 'Contact' });
  logger.info('contactService', 'Created new Contact', { idNumber: trimmedId, accountId, contactId });
  return { id: contactId, raw: data };
}

/**
 * Splits a single extracted owner name into SAP's required `givenName` /
 * `familyName` fields. The Tabu extraction only ever provides one full
 * name string, so this is a structural mapping (not a business-rule
 * change): the first token is the given name, everything after it is the
 * family name. If only one token is present, it is used for both, since
 * SAP requires both fields to be non-empty.
 */
function splitName(fullName) {
  const trimmed = String(fullName || '').trim();
  if (!trimmed) return { givenName: trimmed, familyName: trimmed };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { givenName: parts[0], familyName: parts[0] };
  return { givenName: parts[0], familyName: parts.slice(1).join(' ') };
}

/**
 * Finds-or-creates a Contact keyed on Israeli ID + Account ID. The SAP GET
 * above is always performed first and is authoritative; this function
 * never skips it.
 */
export async function resolveContactForOwner({ idNumber, name, accountId }) {
  const existing = await findContactByIdAndAccount(idNumber, accountId);
  if (existing) {
    const id = resolveTechnicalId(existing, { entityName: 'Contact (lookup)' });
    logger.debug('contactService', 'Reusing existing Contact', { idNumber, accountId, contactId: id });
    return { id, created: false };
  }
  const created = await createContact({ idNumber, name, accountId });
  return { id: created.id, created: true };
}
