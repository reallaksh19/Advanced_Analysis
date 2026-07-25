import { buildVerticalBeamFoundation, runVerticalBeamSolution } from '../core/vertical-beam-solver/index.js';
import { EventBus } from './event-bus.js';
import { MODEL_LOAD_EVENTS } from './model-load-events.js';
import { SHARED_MODEL_EVENTS } from './shared-model-events.js';
import { SUPPORT_LOAD_SCREENING_EVENTS } from './support-load-screening-events.js';
import { createVerticalBeamExportArtifact, triggerVerticalBeamDownload } from './vertical-beam-export.js';
import { VERTICAL_BEAM_EVENTS } from './vertical-beam-events.js';
import { VerticalBeamStore } from './vertical-beam-store.js';

export class VerticalBeamController {
  constructor(eventBus = EventBus, store = VerticalBeamStore, documentRef = globalThis.document) {
    this.eventBus = eventBus; this.store = store; this.documentRef = documentRef;
    this.inputs = emptyInputs(); this.unsubscribeCallbacks = [];
  }
  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(SHARED_MODEL_EVENTS.CHANGED, ({ model }) => this.updateInput('sharedModel', model, 'shared-model')),
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.CHANGED, ({ pathModel }) => this.updateInput('pathModel', pathModel, 'vertical-paths')),
      this.eventBus.subscribe(MODEL_LOAD_EVENTS.CHANGED, ({ foundation }) => this.updateInput('loadFoundation', foundation, 'model-load')),
      this.eventBus.subscribe(VERTICAL_BEAM_EVENTS.REBUILD_REQUESTED, () => this.rebuild('explicit')),
      this.eventBus.subscribe(VERTICAL_BEAM_EVENTS.SOLVE_REQUESTED, () => this.solve()),
      this.eventBus.subscribe(VERTICAL_BEAM_EVENTS.EXPORT_REQUESTED, () => this.exportCurrent()),
    ];
  }
  updateInput(field, value, reason) {
    this.inputs[field] = value;
    if (!value) return this.clearAndPublish(reason);
    this.store.clearSolution();
    if (this.inputsReady()) this.rebuild(reason);
    else this.publishChanged(reason);
  }
  rebuild(reason = 'explicit') {
    if (!this.inputsReady()) return this.publishFailure(VERTICAL_BEAM_EVENTS.REBUILD_FAILED, 'VERTICAL_BEAM_INPUT_UNAVAILABLE', 'Build shared model, vertical paths and model loads first.');
    try {
      const foundation = buildVerticalBeamFoundation(beamInputs(this.inputs));
      this.store.setFoundation(foundation.profile, foundation.flexuralProjection, foundation.beamModel);
      this.publishChanged(reason);
    } catch (error) {
      this.store.clear();
      this.publishFailure(VERTICAL_BEAM_EVENTS.REBUILD_FAILED, 'VERTICAL_BEAM_REBUILD_FAILED', messageOf(error));
    }
  }
  solve() {
    const foundation = currentFoundation(this.store);
    if (!foundation) {
      this.store.clearSolution(); this.publishChanged('solution-cleared');
      return this.publishFailure(VERTICAL_BEAM_EVENTS.SOLVE_FAILED, 'VERTICAL_BEAM_MODEL_UNAVAILABLE', 'Rebuild the vertical beam model before solving.');
    }
    try {
      const result = runVerticalBeamSolution(foundation);
      this.store.setSolution(result.solution, result.audit);
      this.publishChanged('solved');
    } catch (error) {
      this.store.clearSolution(); this.publishChanged('solution-cleared');
      this.publishFailure(VERTICAL_BEAM_EVENTS.SOLVE_FAILED, 'VERTICAL_BEAM_SOLVE_FAILED', messageOf(error));
    }
  }
  exportCurrent() {
    try {
      const artifact = createVerticalBeamExportArtifact(this.store.getSnapshot());
      triggerVerticalBeamDownload(this.documentRef, artifact);
      this.eventBus.publish(VERTICAL_BEAM_EVENTS.EXPORT_COMPLETED, { artifact });
    } catch (error) {
      this.publishFailure(VERTICAL_BEAM_EVENTS.EXPORT_FAILED, 'VERTICAL_BEAM_EXPORT_FAILED', messageOf(error));
    }
  }
  inputsReady() {
    const { sharedModel, pathModel, loadFoundation } = this.inputs;
    return Boolean(sharedModel && pathModel && loadFoundation?.loadCaseSet
      && loadFoundation?.loadPrimitiveSet && loadFoundation?.readinessAudit
      && pathModel.sharedModelSemanticHash === sharedModel.semanticHash
      && loadFoundation.loadPrimitiveSet.datasetId === pathModel.datasetId);
  }
  clearAndPublish(reason) { this.store.clear(); this.publishChanged(reason || 'clear'); }
  publishChanged(reason) { this.eventBus.publish(VERTICAL_BEAM_EVENTS.CHANGED, { ...this.store.getSnapshot(), reason }); }
  publishFailure(topic, code, message) { this.eventBus.publish(topic, { code, message }); }
  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = []; this.inputs = emptyInputs(); this.store.clear();
  }
}
function emptyInputs() { return { sharedModel: null, pathModel: null, loadFoundation: null }; }
function beamInputs(input) {
  return { sharedModel: input.sharedModel, pathModel: input.pathModel, loadCaseSet: input.loadFoundation.loadCaseSet, loadPrimitiveSet: input.loadFoundation.loadPrimitiveSet, modelLoadReadinessAudit: input.loadFoundation.readinessAudit };
}
function currentFoundation(store) {
  const profile = store.getProfile(), flexuralProjection = store.getFlexuralProjection(), beamModel = store.getBeamModel();
  return profile && flexuralProjection && beamModel ? { profile, flexuralProjection, beamModel } : null;
}
function messageOf(error) { return error instanceof Error ? error.message : String(error); }
