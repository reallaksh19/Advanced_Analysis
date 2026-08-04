import { semanticHash } from '../core/shared-piping-model/canonical-json.js';
import { freezeDeep } from './dataset-utils.js';
import { projectDataStore } from './project-data/project-data-store.js';
import { validateProjectDataProfile } from './project-data/project-data-contract.js';
import { buildRoutePartitionModel } from './routes/route-partition-model.js';
import { buildSupportSiteModel, findSupportSiteByEntityId } from './support-sites/support-site-model.js';
import { engineeringSupportLoadStore } from './engineering-loads/engineering-support-load-store.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
  buildAuthorizedEmpiricalLoadProfile,
} from './engineering-loads/authorized-empirical-load-execution.js';
import { authorizedEmpiricalRuntimeStore } from './engineering-loads/authorized-empirical-runtime-store.js';

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

  /** @deprecated Ordinary production callers shall use executeConfiguredAuthorized(). */
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

  /** @deprecated Low-level seam retained for focused contract checks only. */
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

  configureAuthorizedEmpiricalPackage(runtimePackage, masterData) {
    this.#requireActiveModels();
    const bindings = this.#currentEmpiricalBindings(masterData);
    const configured = authorizedEmpiricalRuntimeStore.configure(runtimePackage, bindings);
    try {
      const blockers = this.#currentEmpiricalReadiness(masterData, runtimePackage);
      return blockers.length > 0
        ? authorizedEmpiricalRuntimeStore.markBlockedNotReady('EMPIRICAL_INPUT_NOT_READY', blockers)
        : configured;
    } catch (error) {
      return authorizedEmpiricalRuntimeStore.markBlockedNotReady(
        error.code || 'EMPIRICAL_INPUT_NOT_READY',
        [{ message: error instanceof Error ? error.message : String(error) }],
      );
    }
  }

  refreshAuthorizedEmpiricalPackage(masterData) {
    if (!this.#dataset || !this.#supportSiteModel || !this.#routePartitionModel) {
      return authorizedEmpiricalRuntimeStore.refresh(null);
    }
    const runtimePackage = authorizedEmpiricalRuntimeStore.getPackage();
    if (!runtimePackage) {
      try {
        this.#currentEmpiricalBindings(masterData);
        const mechanicalBlockers = this.#currentMechanicalReadiness();
        return mechanicalBlockers.length > 0
          ? authorizedEmpiricalRuntimeStore.markBlockedNotReady('EMPIRICAL_MODELS_NOT_READY', mechanicalBlockers)
          : authorizedEmpiricalRuntimeStore.refresh({});
      } catch (error) {
        return authorizedEmpiricalRuntimeStore.markBlockedNotReady(
          error.code || 'EMPIRICAL_RUNTIME_BINDINGS_UNAVAILABLE',
          [{ message: error instanceof Error ? error.message : String(error) }],
        );
      }
    }
    try {
      const refreshed = authorizedEmpiricalRuntimeStore.refresh(this.#currentEmpiricalBindings(masterData));
      if (!refreshed.calculationEligible) return refreshed;
      const blockers = this.#currentEmpiricalReadiness(masterData, runtimePackage);
      return blockers.length > 0
        ? authorizedEmpiricalRuntimeStore.markBlockedNotReady('EMPIRICAL_INPUT_NOT_READY', blockers)
        : refreshed;
    } catch (error) {
      return authorizedEmpiricalRuntimeStore.markBlockedNotReady(
        error.code || 'EMPIRICAL_RUNTIME_BINDINGS_UNAVAILABLE',
        [{ message: error instanceof Error ? error.message : String(error) }],
      );
    }
  }

  markEmpiricalStale(reason, datasetVersion = null) {
    engineeringSupportLoadStore.markStale(reason, datasetVersion);
    return authorizedEmpiricalRuntimeStore.markStale(reason, [{ datasetVersion }]);
  }

  executeConfiguredAuthorized(masterData) {
    this.#requireActiveModels();
    this.refreshAuthorizedEmpiricalPackage(masterData);
    const runtimePackage = authorizedEmpiricalRuntimeStore.requireCurrentPackage();
    const execution = engineeringSupportLoadStore.calculateAuthorized({
      schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
      executionId: runtimePackage.executionId,
      executedAt: runtimePackage.executedAt,
      authorizedInput: runtimePackage.authorizedInput,
      dataset: this.#dataset,
      profile: projectDataStore.getProfile(),
      supportSiteModel: this.#supportSiteModel,
      routePartitionModel: this.#routePartitionModel,
      masterData,
    });
    authorizedEmpiricalRuntimeStore.recordExecution(execution);
    return execution;
  }

  deactivate(reason = 'NO_ACTIVE_DATASET') {
    this.rebuild(null);
    engineeringSupportLoadStore.markStale(reason, null);
    return authorizedEmpiricalRuntimeStore.getPackage()
      ? authorizedEmpiricalRuntimeStore.markStale(reason, [{ datasetVersion: null }])
      : authorizedEmpiricalRuntimeStore.refresh(null);
  }

  #currentEmpiricalBindings(masterData) {
    this.#requireActiveModels();
    const profile = projectDataStore.getProfile();
    const sourceDatasetHash = sha256(this.#dataset.sourceSha256, 'dataset.sourceSha256');
    if (!this.#dataset.sharedModel || typeof this.#dataset.sharedModel !== 'object') {
      fail('The active dataset has no materialized shared model.', 'EMPIRICAL_RUNTIME_SHARED_MODEL_MISSING');
    }
    return freezeDeep({
      projectId: identity(profile?.projectId, 'projectData.projectId'),
      datasetId: identity(this.#dataset.datasetId, 'dataset.datasetId'),
      datasetVersion: nullableVersion(this.#dataset.version),
      sourceDatasetHash,
      sharedModelSemanticHash: semanticHash(this.#dataset.sharedModel),
      supportSiteModelSemanticHash: semanticHash(this.#supportSiteModel),
      routePartitionModelSemanticHash: semanticHash(this.#routePartitionModel),
      projectDataProfileSemanticHash: semanticHash(profile),
      masterSourceHashes: {
        dataset: sourceDatasetHash,
        lineList: sha256(masterData?.lineList?.sourceHash, 'masterData.lineList.sourceHash'),
        pipingClass: sha256(masterData?.pipingClass?.sourceHash, 'masterData.pipingClass.sourceHash'),
        componentWeight: sha256(masterData?.weight?.sourceHash, 'masterData.weight.sourceHash'),
      },
    });
  }

  #currentMechanicalReadiness() {
    const blockers = [];
    if (this.#supportSiteModel?.status && this.#supportSiteModel.status !== 'READY') {
      blockers.push(...(this.#supportSiteModel.blockers || [{ code: 'SUPPORT_SITE_MODEL_NOT_READY' }]));
    }
    if (this.#routePartitionModel?.status && this.#routePartitionModel.status !== 'READY') {
      blockers.push(...(this.#routePartitionModel.blockers || [{ code: 'ROUTE_PARTITION_MODEL_NOT_READY' }]));
    }
    return freezeDeep(blockers.map((row) => ({ ...row })));
  }

  #currentEmpiricalReadiness(masterData, runtimePackage) {
    const blockers = [...this.#currentMechanicalReadiness()];
    const profile = buildAuthorizedEmpiricalLoadProfile(
      projectDataStore.getProfile(),
      runtimePackage.authorizedInput,
    );
    const activeHashes = currentMasterHashes(masterData, this.#dataset);
    blockers.push(...validateProjectDataProfile(profile, 'loads', activeHashes).errors);
    blockers.push(...validateProjectDataProfile(profile, 'topology', activeHashes).errors);
    return freezeDeep(dedupeBlockers(blockers));
  }

  #requireActiveModels() {
    if (!this.#dataset || !this.#supportSiteModel || !this.#routePartitionModel) {
      throw codedError('Load calculation requires an active normalized dataset.', 'EMPIRICAL_RUNTIME_ACTIVE_MODEL_MISSING');
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
    const authorizedExecution = authorizedEmpiricalRuntimeStore.getExecution() || engineeringSupportLoadStore.getAuthorizedExecution();
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
          authority: authorizedExecution ? 'AUTHORIZED_HANDOFF' : 'UNAUTHORIZED_LEGACY_RESULT',
          authorizationState: authorizedEmpiricalRuntimeStore.getSnapshot().state,
          freshness: distribution.freshness,
          sourceAxisBasis: distribution.sourceAxisBasis,
          loadCases,
        } : {
          authority: authorizedEmpiricalRuntimeStore.getPackage() ? 'AUTHORIZED_HANDOFF' : 'NOT_CALCULATED',
          authorizationState: authorizedEmpiricalRuntimeStore.getSnapshot().state,
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
  getAuthorizedExecution() { return authorizedEmpiricalRuntimeStore.getExecution() || engineeringSupportLoadStore.getAuthorizedExecution(); }
  getEmpiricalAuthorizationState() { return authorizedEmpiricalRuntimeStore.getSnapshot(); }
  getAuthorizedEmpiricalPackage() { return authorizedEmpiricalRuntimeStore.getPackage(); }
  clear() {
    this.rebuild(null);
    engineeringSupportLoadStore.clear();
    authorizedEmpiricalRuntimeStore.clear();
  }
}

function identity(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    fail(`${label} must be a non-empty trimmed string.`, 'EMPIRICAL_RUNTIME_IDENTITY_INVALID');
  }
  return value;
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest.`, 'EMPIRICAL_RUNTIME_SHA256_INVALID');
  }
  return value;
}

function nullableVersion(value) {
  if (value === null || value === undefined) return null;
  if (Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.length > 0 && value.trim() === value) return value;
  fail('dataset.version must be null, an integer, or a non-empty trimmed string.', 'EMPIRICAL_RUNTIME_VERSION_INVALID');
}

function currentMasterHashes(masterData, dataset) {
  return {
    dataset: dataset?.sourceSha256 || '',
    lineList: masterData?.lineList?.sourceHash || '',
    pipingClass: masterData?.pipingClass?.sourceHash || '',
    componentWeight: masterData?.weight?.sourceHash || '',
  };
}

function dedupeBlockers(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function fail(message, code) {
  throw codedError(message, code);
}

export const engineeringModelStore = new EngineeringModelStore();
