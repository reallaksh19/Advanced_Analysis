import {
  buildPipingPortTopologyGraph,
  createExactTopologyProfile,
  createToleranceTopologyProfile,
} from '../core/piping-topology/index.js';
import { EventBus } from './event-bus.js';
import { SHARED_MODEL_EVENTS } from './shared-model-events.js';
import { createTopologyExportArtifact, triggerTopologyDownload } from './topology-export.js';
import { TOPOLOGY_EVENTS } from './topology-events.js';
import { TopologyStore } from './topology-store.js';

export class TopologyController {
  constructor(eventBus = EventBus, store = TopologyStore, documentRef = globalThis.document) {
    this.eventBus = eventBus;
    this.store = store;
    this.documentRef = documentRef;
    this.sharedModel = null;
    this.unsubscribeCallbacks = [];
  }

  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(SHARED_MODEL_EVENTS.CHANGED, ({ model }) => this.handleSharedModel(model)),
      this.eventBus.subscribe(TOPOLOGY_EVENTS.REBUILD_EXACT_REQUESTED, () => this.rebuildExact()),
      this.eventBus.subscribe(TOPOLOGY_EVENTS.REBUILD_TOLERANCE_REQUESTED, (payload) => this.rebuildTolerance(payload)),
      this.eventBus.subscribe(TOPOLOGY_EVENTS.EXPORT_REQUESTED, () => this.exportCurrentGraph()),
    ];
  }

  handleSharedModel(model) {
    this.sharedModel = model;
    if (!model) {
      this.store.clear();
      this.publishGraph(null, 'clear');
      return;
    }
    this.rebuildExact();
  }

  rebuildExact() {
    if (!this.sharedModel) return this.publishFailure('TOPOLOGY_MODEL_UNAVAILABLE', 'Import a dataset before rebuilding topology.');
    this.buildAndCommit(createExactTopologyProfile(this.sharedModel.units.length), 'exact');
  }

  rebuildTolerance(payload = {}) {
    if (!this.sharedModel) return this.publishFailure('TOPOLOGY_MODEL_UNAVAILABLE', 'Import a dataset before rebuilding topology.');
    const tolerance = parsePositiveTolerance(payload.tolerance);
    if (tolerance === null) {
      this.publishFailure('TOPOLOGY_TOLERANCE_INVALID', 'Tolerance must be a visible positive number.');
      return;
    }
    this.buildAndCommit(createToleranceTopologyProfile(this.sharedModel.units.length, tolerance), 'tolerance');
  }

  buildAndCommit(profile, reason) {
    try {
      const graph = buildPipingPortTopologyGraph(this.sharedModel, profile);
      this.store.setGraph(graph);
      this.publishGraph(graph, reason);
    } catch (error) {
      this.publishFailure('TOPOLOGY_REBUILD_FAILED', error instanceof Error ? error.message : String(error));
    }
  }

  exportCurrentGraph() {
    try {
      const graph = this.store.getGraph();
      if (!graph) throw new Error('Build topology before exporting the graph.');
      const artifact = createTopologyExportArtifact(graph);
      triggerTopologyDownload(this.documentRef, artifact);
      this.eventBus.publish(TOPOLOGY_EVENTS.EXPORT_COMPLETED, { artifact });
    } catch (error) {
      this.eventBus.publish(TOPOLOGY_EVENTS.EXPORT_FAILED, {
        code: 'TOPOLOGY_EXPORT_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  publishGraph(graph, reason) {
    this.eventBus.publish(TOPOLOGY_EVENTS.CHANGED, { graph, reason });
  }

  publishFailure(code, message) {
    this.eventBus.publish(TOPOLOGY_EVENTS.REBUILD_FAILED, { code, message });
  }

  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.sharedModel = null;
    this.store.clear();
  }
}

function parsePositiveTolerance(value) {
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
