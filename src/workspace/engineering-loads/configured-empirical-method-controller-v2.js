import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import { engineeringModelStore } from '../engineering-model-store.js';
import { projectDataStore } from '../project-data/project-data-store.js';
import { engineeringSupportLoadStore } from './engineering-support-load-store.js';
import {
  projectAuthorizedEmpiricalExecutionV2Request,
  requireAuthorizedEmpiricalRuntimePackageV2,
} from './authorized-empirical-runtime-package-v2.js';
import {
  AuthorizedEmpiricalRuntimeStoreV2,
} from './authorized-empirical-runtime-store-v2.js';

/** Explicit opt-in configured execution; ordinary V1 model-store methods remain unchanged. */
export class ConfiguredEmpiricalMethodControllerV2 {
  constructor({
    modelStore = engineeringModelStore,
    profileStore = projectDataStore,
    supportLoadStore = engineeringSupportLoadStore,
    runtimeStore = new AuthorizedEmpiricalRuntimeStoreV2(),
  } = {}) {
    requireFunction(modelStore, 'getDataset');
    requireFunction(modelStore, 'getSupportSiteModel');
    requireFunction(modelStore, 'getRoutePartitionModel');
    requireFunction(profileStore, 'getProfile');
    requireFunction(supportLoadStore, 'calculateAuthorizedV2');
    requireFunction(runtimeStore, 'configure');
    this.modelStore = modelStore;
    this.profileStore = profileStore;
    this.supportLoadStore = supportLoadStore;
    this.runtimeStore = runtimeStore;
  }

  configure(runtimePackage, masterData) {
    const packageV2 = requireAuthorizedEmpiricalRuntimePackageV2(runtimePackage);
    const current = this.#current(masterData);
    if (!current) {
      return this.runtimeStore.markBlockedNotReady(
        'EMPIRICAL_RUNTIME_V2_CONTEXT_NOT_READY',
        [{ code: 'EMPIRICAL_RUNTIME_V2_CONTEXT_NOT_READY' }],
      );
    }
    return this.runtimeStore.configure(packageV2, current.bindings);
  }

  refresh(masterData) {
    const current = this.#current(masterData);
    return this.runtimeStore.refresh(current?.bindings || null);
  }

  execute(masterData) {
    const current = this.#current(masterData);
    const state = this.runtimeStore.refresh(current?.bindings || null);
    if (!state.calculationEligible || !current) {
      fail(
        'Configured empirical method execution is not current and eligible.',
        'EMPIRICAL_RUNTIME_V2_NOT_CALCULATION_ELIGIBLE',
        state,
      );
    }
    const runtimePackage = this.runtimeStore.requireCurrentPackage();
    const request = projectAuthorizedEmpiricalExecutionV2Request({
      runtimePackage,
      dataset: current.dataset,
      profile: current.profile,
      supportSiteModel: current.supportSiteModel,
      routePartitionModel: current.routePartitionModel,
      masterData: current.masterData,
    });
    const execution = this.supportLoadStore.calculateAuthorizedV2(request);
    this.runtimeStore.recordExecution(execution);
    return execution;
  }

  markStale(reason, datasetVersion = null) {
    this.supportLoadStore.markStale(reason, datasetVersion);
    return this.runtimeStore.markStale(reason, [{ datasetVersion }]);
  }

  getState() { return this.runtimeStore.getSnapshot(); }
  getPackage() { return this.runtimeStore.getPackage(); }
  getExecution() { return this.runtimeStore.getExecution(); }

  clear() {
    this.runtimeStore.clear();
    this.supportLoadStore.clear();
  }

  #current(masterData) {
    const dataset = this.modelStore.getDataset();
    const supportSiteModel = this.modelStore.getSupportSiteModel();
    const routePartitionModel = this.modelStore.getRoutePartitionModel();
    const profile = this.profileStore.getProfile();
    if (!dataset || !supportSiteModel || !routePartitionModel || !profile
      || !masterData || typeof masterData !== 'object') return null;
    return deepFreeze({
      dataset,
      supportSiteModel,
      routePartitionModel,
      profile,
      masterData,
      bindings: currentBindings({
        dataset,
        supportSiteModel,
        routePartitionModel,
        profile,
        masterData,
      }),
    });
  }
}

function currentBindings({ dataset, supportSiteModel, routePartitionModel, profile, masterData }) {
  return {
    projectId: profile.projectId,
    datasetId: dataset.datasetId,
    datasetVersion: dataset.version ?? null,
    sourceDatasetHash: dataset.sourceSha256,
    sharedModelSemanticHash: semanticHash(dataset.sharedModel),
    supportSiteModelSemanticHash: semanticHash(supportSiteModel),
    routePartitionModelSemanticHash: semanticHash(routePartitionModel),
    projectDataProfileSemanticHash: semanticHash(profile),
    masterSourceHashes: {
      dataset: dataset.sourceSha256,
      lineList: masterData?.lineList?.sourceHash || '',
      pipingClass: masterData?.pipingClass?.sourceHash || '',
      componentWeight: masterData?.weight?.sourceHash || '',
    },
  };
}

function requireFunction(value, name) {
  if (!value || typeof value[name] !== 'function') {
    fail(
      `Configured empirical method dependency must expose ${name}().`,
      'EMPIRICAL_RUNTIME_V2_DEPENDENCY_INVALID',
      { name },
    );
  }
}

function fail(message, code, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details === null ? null : deepFreeze(details);
  throw error;
}

export const configuredEmpiricalMethodControllerV2 =
  new ConfiguredEmpiricalMethodControllerV2();
