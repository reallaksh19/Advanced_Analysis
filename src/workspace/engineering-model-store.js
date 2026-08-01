import { freezeDeep } from './dataset-utils.js';
import { projectDataStore } from './project-data/project-data-store.js';
import { buildRoutePartitionModel } from './routes/route-partition-model.js';
import { buildSupportSiteModel, findSupportSiteByEntityId } from './support-sites/support-site-model.js';
import { engineeringSupportLoadStore } from './engineering-loads/engineering-support-load-store.js';

/**
 * Holds canonical support sites and route partitions for the active dataset and
 * decorates any support member with the same canonical calculation evidence.
 */
export class EngineeringModelStore {
  #dataset = null;
  #supportSiteModel = null;
  #routePartitionModel = null;

  rebuild(dataset) {
    this.#dataset = dataset;
    if (!dataset) {
      this.#supportSiteModel = null;
      this.#routePartitionModel = null;
      return;
    }
    const profile = projectDataStore.getProfile();
    this.#supportSiteModel = buildSupportSiteModel(dataset, profile);
    this.#routePartitionModel = buildRoutePartitionModel(dataset, profile);
  }

  calculate(masterData) {
    if (!this.#dataset || !this.#supportSiteModel || !this.#routePartitionModel) {
      throw new Error('Load calculation requires an active normalized dataset.');
    }
    return engineeringSupportLoadStore.calculate({
      dataset: this.#dataset,
      profile: projectDataStore.getProfile(),
      supportSiteModel: this.#supportSiteModel,
      routePartitionModel: this.#routePartitionModel,
      masterData,
    });
  }

  canonicalEntityId(entityId) {
    return findSupportSiteByEntityId(this.#supportSiteModel, entityId)?.primaryEntityId || entityId;
  }

  decorateEntity(entity) {
    if (!entity) return null;
    const site = findSupportSiteByEntityId(this.#supportSiteModel, entity.entityId);
    if (!site) return entity;
    const distribution = engineeringSupportLoadStore.getDistribution();
    const loadCases = (distribution?.loadCases || []).map((loadCase) => {
      const result = loadCase.supportResults.find((row) => row.supportSiteId === site.siteId);
      const ledgers = loadCase.contributionLedger.filter((row) => row.allocations.some((allocation) => allocation.siteId === site.siteId));
      return {
        loadCaseId: loadCase.loadCaseId,
        status: result?.status || loadCase.status,
        verticalForceN: result?.verticalForceN ?? null,
        contributorIds: result?.contributorIds || [],
        formulasAndSources: ledgers.map((row) => ({ contributionId: row.contributionId, formula: row.formula, source: row.source })),
        excludedInputs: loadCase.excludedInputs,
      };
    });
    return freezeDeep({
      ...entity,
      entityId: site.primaryEntityId,
      name: site.tags.join(' / '),
      properties: {
        ...entity.properties,
        supportSite: {
          schema: this.#supportSiteModel.schema,
          siteId: site.siteId,
          tags: site.tags,
          positionMm: site.positionMm,
          assemblyIds: site.assemblyIds,
          memberEntityIds: site.memberEntityIds,
        },
        engineeringSupportLoads: distribution ? { freshness: distribution.freshness, sourceAxisBasis: distribution.sourceAxisBasis, loadCases } : { freshness: { status: 'NOT_CALCULATED' }, sourceAxisBasis: 'Z_UP', loadCases: [] },
      },
    });
  }

  getSupportSiteModel() { return this.#supportSiteModel; }
  getRoutePartitionModel() { return this.#routePartitionModel; }
  getDistribution() { return engineeringSupportLoadStore.getDistribution(); }
  clear() { this.rebuild(null); engineeringSupportLoadStore.clear(); }
}

export const engineeringModelStore = new EngineeringModelStore();
