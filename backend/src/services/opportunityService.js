import { crmClient } from '../crm/crmClient.js';
import { resolveTechnicalId } from '../utils/resolveId.js';
import { assertPatchIsSafe } from '../utils/validation.js';
import { logger } from '../logger.js';

const OPPORTUNITY_PATH = '/sap/c4c/api/v1/opportunity-service/opportunities';

/**
 * Fetches the Opportunity fresh and verifies it exists before an import
 * starts (spec section 23 pre-flight checks).
 */
export async function verifyOpportunityExists(opportunityId) {
  await crmClient.get(`${OPPORTUNITY_PATH}/${encodeURIComponent(opportunityId)}`);
  return opportunityId;
}

/**
 * Generic, safe Opportunity PATCH helper.
 *
 * The Registered Product <-> Opportunity relationship in THIS
 * implementation is established through the Registered Product's own
 * `opportunity: { id }` field (see registeredProductService), which is the
 * one supported mechanism per spec section 15. This function is therefore
 * NOT called for that purpose - it exists only as a safe, correctly-ETagged
 * primitive for any other Opportunity field update, and it hard-refuses any
 * payload that attempts to carry Registered Product subnodes, since SAP
 * has been observed to reject that shape (opportunity.2042).
 */
export async function patchOpportunity(opportunityId, patchBody) {
  if ('registeredProducts' in patchBody) {
    throw new Error(
      'Refusing Opportunity PATCH: payload contains a "registeredProducts" subnode, which SAP rejects ' +
        '(opportunity.2042 - subnodes must not be present in Opportunity header patch payload).'
    );
  }

  const patchUrl = `${OPPORTUNITY_PATH}/${opportunityId}`;

  // Fresh GET immediately before PATCH - never reuse an ETag across
  // requests or imports (spec section 14 / 16).
  const { data: current, etag } = await crmClient.get(patchUrl);
  if (!etag) {
    throw new Error(`Opportunity ${opportunityId}: CRM did not return an ETag on GET.`);
  }
  const currentId = resolveTechnicalId(current, { entityName: 'Opportunity (GET)' });
  if (currentId !== opportunityId) {
    throw new Error(
      `Opportunity ETag/GET mismatch: expected technical ID ${opportunityId}, GET returned ${currentId}.`
    );
  }

  assertPatchIsSafe({ targetId: opportunityId, etag, patchUrl, ifMatch: etag });

  logger.debug('opportunityService', 'PATCH Opportunity', { opportunityId, etag, patchUrl, patchBody });
  await crmClient.patch(patchUrl, patchBody, etag);
  logger.info('opportunityService', 'Updated Opportunity', { opportunityId });
}

/**
 * Checks whether a Registered Product is already associated with the
 * Opportunity, using the SAME child-collection endpoint the association
 * itself is created through (just as a GET instead of a POST) - this is
 * SAP itself as the authoritative source, not an in-memory cache and not
 * an assumption based on "we just created this RP" or "this is the same
 * import batch".
 */
async function findOpportunityRegisteredProductAssociation(opportunityId, registeredProductId) {
  const url = `${OPPORTUNITY_PATH}/${encodeURIComponent(opportunityId)}/registeredProducts`;
  const { data } = await crmClient.get(url);
  const rawList = data?.value ?? data?.d?.results ?? (Array.isArray(data) ? data : []);

  return rawList.some((item) => {
    const candidate = item?.registeredProductId ?? item?.registeredProduct?.id ?? item?.id;
    return candidate === registeredProductId;
  });
}

/**
 * Associates ONE Registered Product with the selected Opportunity via the
 * confirmed-working child-collection endpoint:
 *
 *   POST /sap/c4c/api/v1/opportunity-service/opportunities/{opportunityId}/registeredProducts
 *   { "registeredProductId": "<technical Registered Product ID>" }
 *
 * This REPLACES the earlier attempt to PATCH the Opportunity root with a
 * `registeredProducts` subnode, which SAP rejects outright with
 * "opportunity.2042 - Subnodes must not be present in Opportunity header
 * patch payload" - that is not a malformed-payload issue, it's the wrong
 * endpoint entirely. That PATCH-based approach has been removed so it
 * cannot be called by mistake.
 *
 * DUPLICATE CHECK: before every POST, this queries SAP (via the function
 * above) for whether the exact Opportunity + Registered Product
 * association already exists. If it does, the POST is skipped entirely
 * and 'already_exists' is returned. This check runs on every call - even
 * if the same association is requested five times in one import run, only
 * the first call POSTs; every subsequent call sees it in SAP (since these
 * calls run sequentially, not in parallel) and reports 'already_exists'.
 *
 * Uses the Registered Product's TECHNICAL id only - never displayId, never
 * serialId. This is a plain POST (not a PATCH), so no ETag/If-Match is
 * involved here; Basic Auth, Accept and Content-Type all come from the
 * existing crmClient exactly as for any other POST in this codebase.
 *
 * Returns 'created' | 'already_exists'.
 */
export async function associateRegisteredProductWithOpportunity(opportunityId, registeredProductId) {
  const alreadyExists = await findOpportunityRegisteredProductAssociation(opportunityId, registeredProductId);

  if (alreadyExists) {
    logger.info('opportunityService', 'Registered Product already associated with Opportunity - skipping POST', {
      opportunityId,
      registeredProductId,
    });
    return 'already_exists';
  }

  const url = `${OPPORTUNITY_PATH}/${encodeURIComponent(opportunityId)}/registeredProducts`;
  const body = { registeredProductId };

  // Clear, always-on debug logging of the full JSON body (not "[Object]").
  logger.info('opportunityService', `POST ${url}\n${JSON.stringify(body, null, 2)}`);

  await crmClient.post(url, body);

  logger.info('opportunityService', 'Associated Registered Product with Opportunity', {
    opportunityId,
    registeredProductId,
  });
  return 'created';
}
