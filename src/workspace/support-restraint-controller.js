import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
  createEvidenceOnlyAttachmentProfile,
  createGeometricAttachmentProfile,
} from '../core/support-restraints/index.js';
import { canonicalLengthFactor } from '../core/piping-topology/index.js';
import { EventBus } from './event-bus.js';
import { SHARED_MODEL_EVENTS } from './shared-model-events.js';
import { TOPOLOGY_EVENTS } from './topology-events.js';
import { TopologyStore } from './topology-store.js';
import {
  createSupportRestraintExportArtifact,
  triggerSupportRestraintDownload,
} from './support-restraint-export.js';
import { SUPPORT_RESTRAINT_EVENTS } from './support-restraint-events.js';
import { SupportRestraintStore } from './support-restraint-store.js';

export class SupportRestraintController {
  constructor(
    eventBus = EventBus,
    store = SupportRestraintStore,
    topologyStore = TopologyStore,
    documentRef = globalThis.document,
  ) {
    this.eventBus = eventBus;
    this.store = store;
    this.topologyStore = topologyStore;
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
      this.eventBus.subscribe(SUPPORT_RESTRAINT_EVENTS.REBUILD_EVIDENCE_REQUESTED, () => this.rebuildEvidence()),
      this.eventBus.subscribe(SUPPORT_RESTRAINT_EVENTS.REBUILD_PROJECTION_REQUESTED, (payload) => this.rebuildProjection(payload)),
      this.eventBus.subscribe(SUPPORT_RESTRAINT_EVENTS.EXPORT_REQUESTED, () => this.exportCurrentModels()),
    ];
  }

  handleSharedModel(model) {
    this.sharedModel = model;
    this.topologyGraph = this.topologyStore.getGraph();
    if (!model) return this.clearAndPublish();
    if (this.topologyGraph) this.rebuildEvidence();
  }

  handleTopology(graph) {
    this.topologyGraph = graph;
    if (!graph) return this.clearAndPublish();
    if (this.sharedModel) this.rebuildEvidence();
  }

  rebuildEvidence() {
    if (!this.inputsReady()) return this.publishFailure(
      'SUPPORT_RESTRAINT_INPUT_UNAVAILABLE',
      'Import a dataset and build topology before rebuilding support evidence.',
    );
    this.buildAndCommit(
      createEvidenceOnlyAttachmentProfile(this.sharedModel.units.length),
      'evidence',
    );
  }

  rebuildProjection(payload = {}) {
    if (!this.inputsReady()) return this.publishFailure(
      'SUPPORT_RESTRAINT_INPUT_UNAVAILABLE',
      'Import a dataset and build topology before projecting supports.',
    );
    const tolerance = parsePositiveTolerance(payload.tolerance);
    if (tolerance === null) return this.publishFailure(
      'SUPPORT_PROJECTION_TOLERANCE_INVALID',
      'Projection tolerance must be a visible positive number.',
    );
    if (canonicalLengthFactor(this.sharedModel.units.length) === null) return this.publishFailure(
      'SUPPORT_PROJECTION_UNIT_BLOCKED',
      'Unknown length units block geometric support projection.',
    );
    this.buildAndCommit(
      createGeometricAttachmentProfile(this.sharedModel.units.length, tolerance),
      'projection',
    );
  }

  buildAndCommit(profile, reason) {
    try {
      const attachmentModel = buildSupportAttachmentModel(
        this.sharedModel,
        this.topologyGraph,
        profile,
      );
      const restraintModel = buildRestraintCapabilityModel(attachmentModel);
      this.store.setModels(attachmentModel, restraintModel);
      this.eventBus.publish(SUPPORT_RESTRAINT_EVENTS.CHANGED, {
        attachmentModel,
        restraintModel,
        reason,
      });
    } catch (error) {
      this.publishFailure(
        'SUPPORT_RESTRAINT_REBUILD_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  exportCurrentModels() {
    try {
      const attachmentModel = this.store.getAttachmentModel();
      const restraintModel = this.store.getRestraintModel();
      if (!attachmentModel || !restraintModel) {
        throw new Error('Build support/restraint models before exporting.');
      }
      const artifact = createSupportRestraintExportArtifact(attachmentModel, restraintModel);
      triggerSupportRestraintDownload(this.documentRef, artifact);
      this.eventBus.publish(SUPPORT_RESTRAINT_EVENTS.EXPORT_COMPLETED, { artifact });
    } catch (error) {
      this.eventBus.publish(SUPPORT_RESTRAINT_EVENTS.EXPORT_FAILED, {
        code: 'SUPPORT_RESTRAINT_EXPORT_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  inputsReady() {
    return Boolean(
      this.sharedModel
      && this.topologyGraph
      && this.topologyGraph.sharedModelSemanticHash === this.sharedModel.semanticHash,
    );
  }

  clearAndPublish() {
    this.store.clear();
    this.eventBus.publish(SUPPORT_RESTRAINT_EVENTS.CHANGED, {
      attachmentModel: null,
      restraintModel: null,
      reason: 'clear',
    });
  }

  publishFailure(code, message) {
    this.eventBus.publish(SUPPORT_RESTRAINT_EVENTS.REBUILD_FAILED, { code, message });
  }

  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.sharedModel = null;
    this.topologyGraph = null;
    this.store.clear();
  }
}

function parsePositiveTolerance(value) {
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
