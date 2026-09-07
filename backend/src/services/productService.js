import { crmClient } from '../crm/crmClient.js';
import { resolveTechnicalId } from '../utils/resolveId.js';
import { config } from '../config.js';

/**
 * Resolves the technical ID of the reference Product (displayId 999) used
 * for every Registered Product. Never hardcode this technical ID - always
 * resolve it live through the Product API, per spec section 10.
 */
export async function getReferenceProductId() {
  const displayId = config.sap.referenceProductDisplayId;
  const { data } = await crmClient.get(
    `/sap/c4c/api/v1/product-service/products?$filter=displayId eq '${displayId}'`
  );
  const rawList = data?.value ?? data?.d?.results ?? (Array.isArray(data) ? data : []);

  if (rawList.length === 0) {
    throw new Error(`Reference Product with displayId '${displayId}' was not found in CRM.`);
  }

  return resolveTechnicalId(rawList[0], { entityName: 'reference Product' });
}
