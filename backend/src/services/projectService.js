import { crmClient } from '../crm/crmClient.js';
import { resolveTechnicalId } from '../utils/resolveId.js';
import { logger } from '../logger.js';

const OPPORTUNITIES_PATH =
  "/sap/c4c/api/v1/opportunity-service/opportunities?$filter=extensions/Z_opp_group eq '2'";

/**
 * Lists the Opportunities eligible to be an import "Project", per spec
 * section 3. Displays the Opportunity name; internally retains the
 * Opportunity technical ID, which IS the Project ID (no artificial
 * project identifier is ever created).
 */
export async function listProjects() {
  const { data } = await crmClient.get(OPPORTUNITIES_PATH);
  const rawList = data?.value ?? data?.d?.results ?? (Array.isArray(data) ? data : []);

  const projects = rawList.map((opp) => ({
    id: resolveTechnicalId(opp, { entityName: 'Opportunity' }),
    name: opp.name ?? opp.Name ?? '(ללא שם)',
  }));

  logger.info('projectService', `Loaded ${projects.length} project(s) from CRM`);
  return projects;
}

/**
 * Fetches a single Opportunity by technical ID along with its current
 * ETag. Used immediately before every Opportunity PATCH - never cached,
 * never reused across requests.
 */
export async function getOpportunityWithEtag(opportunityId) {
  const { data, etag } = await crmClient.get(
    `/sap/c4c/api/v1/opportunity-service/opportunities/${encodeURIComponent(opportunityId)}`
  );
  if (!etag) {
    throw new Error(`Opportunity ${opportunityId}: CRM did not return an ETag on GET.`);
  }
  return { opportunity: data, etag };
}
