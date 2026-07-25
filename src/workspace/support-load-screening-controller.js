import {
  buildVerticalLoadPathFoundation,
  runTributarySupportLoadScreening,
} from '../core/support-load-screening/index.js';
import { EventBus } from './event-bus.js';
import { MODEL_LOAD_EVENTS } from './model-load-events.js';
import { SHARED_MODEL_EVENTS } from './shared-model-events.js';
import { SUPPORT_RESTRAINT_EVENTS } from './support-restraint-events.js';
import { TOPOLOGY_EVENTS } from './topology-events.js';
import {
  createSupportLoadScreeningExportArtifact,
  triggerSupportLoadScreeningDownload,
} from './support-load-screening-export.js';
import { SUPPORT_LOAD_SCREENING_EVENTS } from './support-load-screening-events.js';
import { SupportLoadScreeningStore } from './support-load-screening-store.js';

export class SupportLoadScreeningController {
  constructor(eventBus = EventBus, store = SupportLoadScreeningStore, documentRef = globalThis.document) {
    this.eventBus = eventBus;
    this.store = store;
    this.documentRef = documentRef;
    this.inputs = emptyInputs();
    this.unsubscribeCallbacks = [];
  }

  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(SHARED_MODEL_EVENTS.CHANGED, ({ model }) => this.updateInput('sharedModel', model, 'shared-model')),
      this.eventBus.subscribe(TOPOLOGY_EVENTS.CHANGED, ({ graph }) => this.updateInput('topologyGraph', graph, 'topology')),
      this.eventBus.subscribe(SUPPORT_RESTRAINT_EVENTS.CHANGED, (payload) => this.updateSupports(payload)),
      this.eventBus.subscribe(MODEL_LOAD_EVENTS.CHANGED, ({ foundation }) => this.updateInput('loadFoundation', foundation, 'model-load')),
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.REBUILD_PATHS_REQUESTED, () => this.rebuildPaths('explicit')),
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.RUN_REQUESTED, () => this.runScreening()),
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.EXPORT_REQUESTED, () => this.exportCurrent()),
    ];
  }

  updateInput(field, value, reason) {
    this.inputs[field] = value;
    if (!value) return this.clearAndPublish(reason);
    this.store.clearScreening();
    this.rebuildWhenReady(reason);
  }

  updateSupports({ attachmentModel, restraintModel }) {
    this.inputs.attachmentModel = attachmentModel;
    this.inputs.restraintModel = restraintModel;
    if (!attachmentModel || !restraintModel) return this.clearAndPublish('support-restraint');
    this.store.clearScreening();
    this.rebuildWhenReady('support-restraint');
  }

  rebuildWhenReady(reason) {
    if (this.pathInputsReady()) this.rebuildPaths(reason);
    else this.publishChanged(reason);
  }

  rebuildPaths(reason = 'explicit') {
    if (!this.pathInputsReady()) return this.publishPathFailure('SCREENING_PATH_INPUT_UNAVAILABLE', 'Build topology and support/restraint models first.');
    try {
      const foundation = buildVerticalLoadPathFoundation(this.inputs);
      this.store.setPathFoundation(foundation.profile, foundation.pathModel);
      this.publishChanged(reason);
    } catch (error) {
      this.store.clear();
      this.publishPathFailure('VERTICAL_LOAD_PATH_REBUILD_FAILED', messageOf(error));
    }
  }

  runScreening() {
    const pathFoundation = this.currentPathFoundation();
    if (!pathFoundation || !this.screeningInputsReady()) {
      this.store.clearScreening();
      this.publishChanged('screening-cleared');
      return this.publishRunFailure('SCREENING_INPUT_UNAVAILABLE', 'Build paths and model loads before screening.');
    }
    try {
      const result = runTributarySupportLoadScreening(pathFoundation, screeningInputs(this.inputs));
      this.store.setScreening(result.screening, result.audit);
      this.publishChanged('screened');
    } catch (error) {
      this.store.clearScreening();
      this.publishChanged('screening-cleared');
      this.publishRunFailure('TRIBUTARY_SCREENING_FAILED', messageOf(error));
    }
  }

  exportCurrent() {
    try {
      const artifact = createSupportLoadScreeningExportArtifact(this.store.getSnapshot());
      triggerSupportLoadScreeningDownload(this.documentRef, artifact);
      this.eventBus.publish(SUPPORT_LOAD_SCREENING_EVENTS.EXPORT_COMPLETED, { artifact });
    } catch (error) {
      this.eventBus.publish(SUPPORT_LOAD_SCREENING_EVENTS.EXPORT_FAILED, {
        code: 'SUPPORT_LOAD_SCREENING_EXPORT_FAILED', message: messageOf(error),
      });
    }
  }

  pathInputsReady() {
    const input = this.inputs;
    return Boolean(input.sharedModel && input.topologyGraph && input.attachmentModel && input.restraintModel
      && input.topologyGraph.sharedModelSemanticHash === input.sharedModel.semanticHash
      && input.attachmentModel.topologySemanticHash === input.topologyGraph.semanticHash
      && input.restraintModel.attachmentModelSemanticHash === input.attachmentModel.semanticHash);
  }

  screeningInputsReady() {
    return Boolean(this.inputs.loadFoundation?.loadCaseSet
      && this.inputs.loadFoundation?.loadPrimitiveSet
      && this.inputs.loadFoundation?.readinessAudit);
  }

  currentPathFoundation() {
    const profile = this.store.getProfile(), pathModel = this.store.getPathModel();
    return profile && pathModel ? { profile, pathModel } : null;
  }

  clearAndPublish(reason) {
    this.store.clear();
    this.publishChanged(reason || 'clear');
  }

  publishChanged(reason) {
    this.eventBus.publish(SUPPORT_LOAD_SCREENING_EVENTS.CHANGED, { ...this.store.getSnapshot(), reason });
  }

  publishPathFailure(code, message) {
    this.eventBus.publish(SUPPORT_LOAD_SCREENING_EVENTS.PATH_REBUILD_FAILED, { code, message });
  }

  publishRunFailure(code, message) {
    this.eventBus.publish(SUPPORT_LOAD_SCREENING_EVENTS.RUN_FAILED, { code, message });
  }

  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.inputs = emptyInputs();
    this.store.clear();
  }
}

function emptyInputs() { return { sharedModel: null, topologyGraph: null, attachmentModel: null, restraintModel: null, loadFoundation: null }; }
function screeningInputs(input) { return { loadCaseSet: input.loadFoundation.loadCaseSet, loadPrimitiveSet: input.loadFoundation.loadPrimitiveSet, modelLoadReadinessAudit: input.loadFoundation.readinessAudit }; }
function messageOf(error) { return error instanceof Error ? error.message : String(error); }
