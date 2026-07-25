import { buildModelLoadFoundation } from '../core/model-loads/index.js';
import { EventBus } from './event-bus.js';
import { SHARED_MODEL_EVENTS } from './shared-model-events.js';
import { TOPOLOGY_EVENTS } from './topology-events.js';
import { createModelLoadExportArtifact, triggerModelLoadDownload } from './model-load-export.js';
import { MODEL_LOAD_EVENTS } from './model-load-events.js';
import { ModelLoadStore } from './model-load-store.js';

export class ModelLoadController {
  constructor(eventBus = EventBus, store = ModelLoadStore, documentRef = globalThis.document) {
    this.eventBus = eventBus;
    this.store = store;
    this.documentRef = documentRef;
    this.sharedModel = null;
    this.topologyGraph = null;
    this.unsubscribeCallbacks = [];
  }

  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(SHARED_MODEL_EVENTS.CHANGED, ({ model }) => this.handleSharedModel(model)),
      this.eventBus.subscribe(TOPOLOGY_EVENTS.CHANGED, ({ graph }) => this.handleTopology(graph)),
      this.eventBus.subscribe(MODEL_LOAD_EVENTS.REBUILD_REQUESTED, () => this.rebuild()),
      this.eventBus.subscribe(MODEL_LOAD_EVENTS.EXPORT_REQUESTED, () => this.exportCurrent()),
    ];
  }

  handleSharedModel(model) {
    this.sharedModel = model;
    if (!model) return this.clearAndPublish();
    this.rebuildWhenReady('shared-model');
  }

  handleTopology(graph) {
    this.topologyGraph = graph;
    if (!graph) return this.clearAndPublish();
    this.rebuildWhenReady('topology');
  }

  rebuild() {
    if (!this.inputsReady()) return this.publishFailure('MODEL_LOAD_INPUT_UNAVAILABLE', 'Import a dataset and build topology first.');
    this.buildAndCommit('explicit');
  }

  rebuildWhenReady(reason) {
    if (this.inputsReady()) this.buildAndCommit(reason);
  }

  inputsReady() {
    return Boolean(this.sharedModel && this.topologyGraph
      && this.topologyGraph.sharedModelSemanticHash === this.sharedModel.semanticHash);
  }

  buildAndCommit(reason) {
    try {
      const foundation = buildModelLoadFoundation(this.sharedModel, this.topologyGraph);
      this.store.setFoundation(foundation);
      this.eventBus.publish(MODEL_LOAD_EVENTS.CHANGED, { foundation, reason });
    } catch (error) {
      this.publishFailure('MODEL_LOAD_REBUILD_FAILED', messageOf(error));
    }
  }

  exportCurrent() {
    try {
      const foundation = this.store.getFoundation();
      if (!foundation) throw new Error('Build model loads before exporting.');
      const artifact = createModelLoadExportArtifact(foundation);
      triggerModelLoadDownload(this.documentRef, artifact);
      this.eventBus.publish(MODEL_LOAD_EVENTS.EXPORT_COMPLETED, { artifact });
    } catch (error) {
      this.eventBus.publish(MODEL_LOAD_EVENTS.EXPORT_FAILED, {
        code: 'MODEL_LOAD_EXPORT_FAILED', message: messageOf(error),
      });
    }
  }

  clearAndPublish() {
    this.store.clear();
    this.eventBus.publish(MODEL_LOAD_EVENTS.CHANGED, { foundation: null, reason: 'clear' });
  }

  publishFailure(code, message) {
    this.eventBus.publish(MODEL_LOAD_EVENTS.REBUILD_FAILED, { code, message });
  }

  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.sharedModel = null;
    this.topologyGraph = null;
    this.store.clear();
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
