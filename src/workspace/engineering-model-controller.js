import { EVENT_TOPICS } from './event-topics.js';
import { engineeringModelStore } from './engineering-model-store.js';
import { projectDataStore } from './project-data/project-data-store.js';
import { authorizedEnrichmentConsumerController } from './enrichment/authorized-enrichment-runtime.js';

export const ENGINEERING_MODEL_EVENTS = Object.freeze({
  CALCULATE_REQUESTED: 'engineering-support-loads:calculate-requested',
  CHANGED: 'engineering-support-loads:changed',
  FAILED: 'engineering-support-loads:failed',
});

/** Rebuilds derived contracts and runs loads only on an explicit request. */
export class EngineeringModelController {
  constructor(eventBus, workspaceState, candidateController = authorizedEnrichmentConsumerController) {
    const isAuthorizedConsumer = candidateController
      && typeof candidateController.executeEmpirical === 'function'
      && typeof candidateController.refreshEmpirical === 'function';
    const isLegacyMasterDataDependency = candidateController
      && typeof candidateController.getMasterData === 'function';
    const authorizedConsumerController = isAuthorizedConsumer
      ? candidateController
      : isLegacyMasterDataDependency ? authorizedEnrichmentConsumerController : candidateController;
    if (!authorizedConsumerController
        || typeof authorizedConsumerController.executeEmpirical !== 'function'
        || typeof authorizedConsumerController.refreshEmpirical !== 'function') {
      const error = new TypeError('Engineering model controller requires the authorized empirical consumer.');
      error.code = 'EMPIRICAL_RUNTIME_AUTHORIZED_CONSUMER_REQUIRED';
      throw error;
    }
    this.eventBus = eventBus;
    this.workspaceState = workspaceState;
    this.authorizedConsumerController = authorizedConsumerController;
    this.unsubscribers = [];
    this.datasetId = '';
    this.datasetVersion = null;
    this.lastRebuiltDataset = null;
  }

  init() {
    if (this.unsubscribers.length) return;
    this.unsubscribers = [
      this.eventBus.subscribe(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, ({ snapshot }) => this.handleSnapshot(snapshot)),
      this.eventBus.subscribe(ENGINEERING_MODEL_EVENTS.CALCULATE_REQUESTED, () => this.calculate()),
      this.eventBus.subscribe('MASTER_DATA_UPDATED', () => this.handleMasterDataChanged()),
      this.eventBus.subscribe('MASTER_DATA_CLEARED', () => this.handleMasterDataChanged()),
      projectDataStore.subscribe(() => this.handleProjectDataChanged()),
    ];
  }

  handleSnapshot(snapshot) {
    const dataset = snapshot?.status === 'ready' ? snapshot.dataset : null;
    if (!dataset) {
      engineeringModelStore.deactivate('NO_ACTIVE_DATASET');
      this.datasetId = '';
      this.datasetVersion = null;
      this.lastRebuiltDataset = null;
      return;
    }
    const distribution = engineeringModelStore.getDistribution();
    let refreshRequired = false;
    if (distribution && distribution.datasetId !== dataset.datasetId) {
      engineeringModelStore.markEmpiricalStale('DATASET_REPLACED', dataset.version || null);
      refreshRequired = true;
    } else if (distribution && distribution.datasetVersion !== (dataset.version || null)) {
      engineeringModelStore.markEmpiricalStale('DATASET_EDITED', dataset.version || null);
      refreshRequired = true;
    } else if (distribution && dataset !== this.lastRebuiltDataset) {
      engineeringModelStore.markEmpiricalStale('DATASET_REBUILT', dataset.version || null);
      refreshRequired = true;
    }
    this.datasetId = dataset.datasetId;
    this.datasetVersion = dataset.version || null;
    if (dataset !== this.lastRebuiltDataset) {
      engineeringModelStore.rebuild(dataset);
      this.lastRebuiltDataset = dataset;
      refreshRequired = true;
    }
    if (refreshRequired) this.authorizedConsumerController.refreshEmpirical();
  }

  handleProjectDataChanged() {
    const dataset = this.workspaceState.getSnapshot()?.dataset || null;
    engineeringModelStore.markEmpiricalStale('PROJECT_DATA_CHANGED', dataset?.version || null);
    engineeringModelStore.rebuild(dataset);
    this.authorizedConsumerController.refreshEmpirical();
    this.eventBus.publish(ENGINEERING_MODEL_EVENTS.CHANGED, { reason: 'project-data-changed' });
  }

  handleMasterDataChanged() {
    const dataset = this.workspaceState.getSnapshot()?.dataset || null;
    engineeringModelStore.markEmpiricalStale('MASTER_DATA_CHANGED', dataset?.version || null);
    this.authorizedConsumerController.refreshEmpirical();
    this.eventBus.publish(ENGINEERING_MODEL_EVENTS.CHANGED, { reason: 'master-data-changed' });
  }

  calculate() {
    try {
      const execution = this.authorizedConsumerController.executeEmpirical();
      const distribution = execution.distribution;
      this.eventBus.publish(ENGINEERING_MODEL_EVENTS.CHANGED, { reason: 'calculated', distribution, execution });
      return execution;
    } catch (error) {
      this.eventBus.publish(ENGINEERING_MODEL_EVENTS.FAILED, {
        message: error instanceof Error ? error.message : String(error),
        code: error?.code || 'EMPIRICAL_RUNTIME_EXECUTION_FAILED',
      });
      return null;
    }
  }

  destroy() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.lastRebuiltDataset = null;
    engineeringModelStore.clear();
  }
}
