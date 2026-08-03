import { EVENT_TOPICS } from './event-topics.js';
import { engineeringModelStore } from './engineering-model-store.js';
import { engineeringSupportLoadStore } from './engineering-loads/engineering-support-load-store.js';
import { projectDataStore } from './project-data/project-data-store.js';

export const ENGINEERING_MODEL_EVENTS = Object.freeze({
  CALCULATE_REQUESTED: 'engineering-support-loads:calculate-requested',
  CHANGED: 'engineering-support-loads:changed',
  FAILED: 'engineering-support-loads:failed',
});

/** Rebuilds derived contracts and runs loads only on an explicit request. */
export class EngineeringModelController {
  constructor(eventBus, workspaceState, masterDataController) {
    this.eventBus = eventBus;
    this.workspaceState = workspaceState;
    this.masterDataController = masterDataController;
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
      engineeringModelStore.clear();
      this.datasetId = '';
      this.datasetVersion = null;
      this.lastRebuiltDataset = null;
      return;
    }
    const distribution = engineeringSupportLoadStore.getDistribution();
    if (distribution && distribution.datasetId !== dataset.datasetId) engineeringSupportLoadStore.clear();
    else if (distribution && distribution.datasetVersion !== (dataset.version || null)) engineeringSupportLoadStore.markStale('DATASET_EDITED', dataset.version || null);
    this.datasetId = dataset.datasetId;
    this.datasetVersion = dataset.version || null;
    if (dataset === this.lastRebuiltDataset) return;
    engineeringModelStore.rebuild(dataset);
    this.lastRebuiltDataset = dataset;
  }

  handleProjectDataChanged() {
    const dataset = this.workspaceState.getSnapshot()?.dataset || null;
    engineeringSupportLoadStore.markStale('PROJECT_DATA_CHANGED', dataset?.version || null);
    engineeringModelStore.rebuild(dataset);
    this.eventBus.publish(ENGINEERING_MODEL_EVENTS.CHANGED, { reason: 'project-data-changed' });
  }

  handleMasterDataChanged() {
    const dataset = this.workspaceState.getSnapshot()?.dataset || null;
    engineeringSupportLoadStore.markStale('MASTER_DATA_CHANGED', dataset?.version || null);
    this.eventBus.publish(ENGINEERING_MODEL_EVENTS.CHANGED, { reason: 'master-data-changed' });
  }

  calculate() {
    try {
      const distribution = engineeringModelStore.calculate(this.masterDataController.getMasterData());
      this.eventBus.publish(ENGINEERING_MODEL_EVENTS.CHANGED, { reason: 'calculated', distribution });
      return distribution;
    } catch (error) {
      this.eventBus.publish(ENGINEERING_MODEL_EVENTS.FAILED, { message: error instanceof Error ? error.message : String(error) });
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
