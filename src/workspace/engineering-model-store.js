import { freezeDeep } from './dataset-utils.js';
import { projectDataStore } from './project-data/project-data-store.js';
import { buildRoutePartitionModel } from './routes/route-partition-model.js';
import { buildSupportSiteModel, findSupportSiteByEntityId } from './support-sites/support-site-model.js';
import { engineeringSupportLoadStore } from './engineering-loads/engineering-support-load-store.js';
import { AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA } from './engineering-loads/authorized-empirical-load-execution.js';
import { markWorkspaceInvocation, measureWorkspaceStage } from './workspace-performance.js';

/**
 * Holds canonical support sites and route partitions for the active dataset and
 * decorates any support member with the same canonical calculation evidence.
 */
export class EngineeringModelStore {
  #dataset = null;
  #supportSiteModel = null;
  #routePartitionModel = null;

  rebuild(dataset) {
    markWorkspaceInvocation('engineering-model-rebuild', { datasetId: dataset?.datasetId || null });
    this.#dataset = dataset;
    if (!dataset) {
      this.#supportSiteModel = null;
      this.#routePartitionModel = null;
      return;
    }
    const profile = projectDataStore.getProfile();
    this.#supportSiteModel = measureWorkspaceStage(
      'support-site-construction',
      () => buildSupportSiteModel(dataset, profile),
      { datasetId: dataset.datasetId },
    );
    this.#routePartitionModel = measureWorkspaceStage(
      'route-construction',
      () => buildRoutePartitionModel(dataset, profile),
      { datasetId: dataset.datasetId },
    );
  }

  calculate(masterData) {
    this.#requireActiveModels();
    return engineeringSupportLoadStore.calculate({
      dataset: this.#dataset,
      profile: projectDataStore.getProfile(),
      supportSiteModel: this.#supportSiteModel,
      routePartitionModel: this.#routePartitionModel,
      masterData,
    });
  }

  calculateAuthorized({ executionId, executedAt, authorizedInput, masterData }) {
    this.#requireActiveModels();
    return engineeringSupportLoadStore.calculateAuthorized({
      schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
      executionId,
      executedAt,
      authorizedInput,
      dataset: this.#dataset,
      profile: projectDataStore.getProfile(),
      supportSiteModel: this.#supportSiteModel,
      routePartitionModel: this.#routePartitionModel,
      masterData,
    });
  }

  #requireActiveModels() {
    if (!this.#dataset || !this.#supportSiteModel || !this.#routePartitionModel) {
      throw new Error('Load calculation requires an active normalized dataset.');
    }
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
        supportSiteId: site.siteId,
        status: result?.status || loadCase.status,
        verticalForceN: result?.verticalForceN ?? null,
        contributorIds: result?.contributorIds || [],
        formulasAndSources: ledgers.map((row) => ({ contributionId: row.contributionId, formula: row.formula, source: row.source })),
        excludedInputs: loadCase.excludedInputs,
      };
    });
    const authorizedExecution = engineeringSupportLoadStore.getAuthorizedExecution();
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
        engineeringSupportLoads: distribution ? {
          method: distribution.method,
          authority: authorizedExecution ? 'AUTHORIZED_HANDOFF' : 'LEGACY_PROJECT_DATA',
          freshness: distribution.freshness,
          sourceAxisBasis: distribution.sourceAxisBasis,
          loadCases,
        } : {
          freshness: { status: 'NOT_CALCULATED' },
          sourceAxisBasis: 'Z_UP',
          loadCases: [],
        },
      },
    });
  }

  getSupportSiteModel() { return this.#supportSiteModel; }
  getRoutePartitionModel() { return this.#routePartitionModel; }
  getDistribution() { return engineeringSupportLoadStore.getDistribution(); }
  getAuthorizedExecution() { return engineeringSupportLoadStore.getAuthorizedExecution(); }
  clear() { this.rebuild(null); engineeringSupportLoadStore.clear(); }
}

export const engineeringModelStore = new EngineeringModelStore();
