import { normalizeWorkspaceDataset } from './dataset-adapter.js';
import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';
import { WorkspaceState } from './workspace-state.js';
import { engineeringModelStore } from './engineering-model-store.js';
import { createNativeModelBootstrap } from './topology-edit/native-model-bootstrap.js';

const IDENTITY_TRANSFORM = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);
const NATIVE_CATALOGUE_BASIS = Object.freeze({
  catalogueId: 'DEMO-PIPING-CATALOGUE',
  catalogueVersion: '2026.08.06',
  catalogueHash: 'sha256:2113a7de4b1db5cc1df88d974684ffb93dbedc1f4bdb21fdde2097286c496e1f',
  sourceHash: 'sha256:46ca94c8eb55fbb66e206ca2eed11b23440f4be93b9e83b8dca0f8d35e54bf86',
});
const NATIVE_AUTHORING_POLICY_HASH =
  'sha256:33f78a16b6b8368492d23d48a31b90e657155983f7bdf5a15339b6ceee7673b4';

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
        EVENT_TOPICS.NATIVE_MODEL_CREATE_REQUESTED,
        (payload) => this.createNativeModel(payload),
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

  /** Creates an empty, governed native-authoring dataset for first-route entry. */
  createNativeModel({ modelKey, documentId, revision }) {
    try {
      const bootstrap = createNativeModelBootstrap({
        modelKey,
        documentId,
        revision,
        unitSystem: { length: 'MM', angle: 'DEG' },
        coordinateSystem: {
          coordinateSystemId: 'MODEL_XYZ_RIGHT_HANDED',
          datumId: 'MODEL_ORIGIN',
          transformToModel: IDENTITY_TRANSFORM,
        },
        catalogueBasis: NATIVE_CATALOGUE_BASIS,
        authoringPolicyHash: NATIVE_AUTHORING_POLICY_HASH,
      });
      const snapshot = this.workspaceState.loadDataset(bootstrap.dataset);
      this.publishSnapshot(snapshot);
      this.eventBus.publish(EVENT_TOPICS.DATASET_LOADED, {
        datasetId: bootstrap.dataset.datasetId,
        nodeCount: 0,
      });
      return bootstrap;
    } catch (error) {
      this.eventBus.publish(EVENT_TOPICS.DATASET_LOAD_FAILED, {
        message: error instanceof Error ? error.message : String(error),
        sourceName: documentId,
      });
      return null;
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
