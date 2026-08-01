import { normalizeWorkspaceDataset } from './dataset-adapter.js';
import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';
import { WorkspaceState } from './workspace-state.js';
import { engineeringModelStore } from './engineering-model-store.js';

export class DatasetController {
  constructor(eventBus = EventBus, workspaceState = WorkspaceState) {
    this.eventBus = eventBus;
    this.workspaceState = workspaceState;
    this.unsubscribeCallbacks = [];
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(
        EVENT_TOPICS.DATASET_LOAD_REQUESTED,
        (payload) => this.load(payload),
      ),
      this.eventBus.subscribe(
        EVENT_TOPICS.DATASET_CLEAR_REQUESTED,
        () => this.clear(),
      ),
      this.eventBus.subscribe(
        EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED,
        (payload) => this.select(payload.entityId, payload.source, payload.entity),
      ),
    ];
    this.initialized = true;
  }

  load({ rawPackage, sourceName = '', sourceBytes = null, sourceSha256 = '' }) {
    try {
      const dataset = normalizeWorkspaceDataset(rawPackage, sourceName, { sourceBytes, sourceSha256 });
      const snapshot = this.workspaceState.loadDataset(dataset);
      this.publishSnapshot(snapshot);
      this.eventBus.publish(EVENT_TOPICS.DATASET_LOADED, {
        datasetId: dataset.datasetId,
        nodeCount: dataset.summary.nodeCount,
      });
    } catch (error) {
      this.eventBus.publish(EVENT_TOPICS.DATASET_LOAD_FAILED, {
        message: error instanceof Error ? error.message : String(error),
        sourceName,
      });
    }
  }

  clear() {
    const snapshot = this.workspaceState.clearDataset();
    this.publishSnapshot(snapshot);
    this.eventBus.publish(EVENT_TOPICS.DATASET_CLEARED, { version: snapshot.version });
  }

  select(entityId, source = 'api', fallbackEntity = null) {
    const canonicalEntityId = engineeringModelStore.canonicalEntityId(entityId);
    const stateEntity = this.workspaceState.selectEntity(canonicalEntityId);
    const entity = stateEntity || fallbackEntity;
    if (!entity) return null;

    this.publishSnapshot(this.workspaceState.getSnapshot());
    this.eventBus.publish(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED, {
      entityId: entity.entityId,
      type: entity.selectionType || entity.entityType,
      properties: entity.properties || {},
      entity,
      source,
    });
    return entity;
  }

  publishSnapshot(snapshot) {
    this.eventBus.publish(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, { snapshot });
  }

  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.initialized = false;
  }
}
