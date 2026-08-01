import { freezeDeep, stringValue } from './dataset-utils.js';
import { WORKSPACE_DATASET_SCHEMA } from './dataset-adapter.js';

export class WorkspaceStateStore {
  #snapshot = null;
  #entities = new Map();

  #ensureInit() {
    if (!this.#snapshot) {
      this.#snapshot = emptySnapshot(0);
    }
  }

  loadDataset(dataset) {
    this.#ensureInit();
    assertDataset(dataset);
    this.#entities = new Map(dataset.entities.map((entity) => [entity.entityId, entity]));
    this.#snapshot = freezeDeep({
      status: 'ready',
      dataset,
      selectedEntityId: '',
      version: this.#snapshot.version + 1,
    });
    return this.#snapshot;
  }

  clearDataset() {
    this.#ensureInit();
    this.#entities = new Map();
    this.#snapshot = emptySnapshot(this.#snapshot.version + 1);
    return this.#snapshot;
  }

  patchSharedModel(sharedModel) {
    this.#ensureInit();
    if (this.#snapshot.status !== 'ready') return null;
    const newDataset = { ...this.#snapshot.dataset, sharedModel };
    this.#snapshot = freezeDeep({
      ...this.#snapshot,
      dataset: newDataset,
      version: this.#snapshot.version + 1,
    });
    return this.#snapshot;
  }

  selectEntity(entityId) {
    this.#ensureInit();
    const normalizedId = stringValue(entityId);
    const entity = this.#entities.get(normalizedId) || null;
    if (!entity) return null;

    if (this.#snapshot.selectedEntityId !== normalizedId) {
      this.#snapshot = freezeDeep({
        ...this.#snapshot,
        selectedEntityId: normalizedId,
        version: this.#snapshot.version + 1,
      });
    }
    return entity;
  }

  getSnapshot() {
    this.#ensureInit();
    return this.#snapshot;
  }

  getEntity(entityId) {
    this.#ensureInit();
    return this.#entities.get(stringValue(entityId)) || null;
  }
}

function emptySnapshot(version) {
  return freezeDeep({
    status: 'empty',
    dataset: null,
    selectedEntityId: '',
    version,
  });
}

function assertDataset(dataset) {
  if (!dataset || dataset.schema !== WORKSPACE_DATASET_SCHEMA || !Array.isArray(dataset.entities)) {
    throw new TypeError(`WorkspaceState requires ${WORKSPACE_DATASET_SCHEMA}.`);
  }
}

export const WorkspaceState = new WorkspaceStateStore();
