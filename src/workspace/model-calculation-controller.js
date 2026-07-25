import {
  createModelCalculationExportArtifact, createModelCalculationPackage,
} from '../core/model-calculation-package/index.js';
import { applyReportTimestampPolicy } from '../core/settings-authority/index.js';
import { EVENT_TOPICS } from './event-topics.js';
import { EventBus } from './event-bus.js';
import { ModelLoadStore } from './model-load-store.js';
import { MODEL_CALCULATION_EVENTS } from './model-calculation-events.js';
import { triggerModelCalculationDownload } from './model-calculation-export.js';
import { ModelCalculationStore } from './model-calculation-store.js';
import { SupportLoadScreeningStore } from './support-load-screening-store.js';
import { SUPPORT_LOAD_SCREENING_EVENTS } from './support-load-screening-events.js';
import { SupportRestraintStore } from './support-restraint-store.js';
import { TopologyStore } from './topology-store.js';
import { VerticalBeamStore } from './vertical-beam-store.js';
import { VERTICAL_BEAM_EVENTS } from './vertical-beam-events.js';
import { WorkspaceState } from './workspace-state.js';

export class ModelCalculationController {
  constructor(
    eventBus = EventBus,
    store = ModelCalculationStore,
    documentRef = globalThis.document,
    settingsProfileProvider = () => null,
    clock = () => new globalThis.Date().toISOString(),
  ) {
    this.eventBus = eventBus;
    this.store = store;
    this.documentRef = documentRef;
    this.settingsProfileProvider = settingsProfileProvider;
    this.clock = clock;
    this.screeningSnapshot = null;
    this.beamSnapshot = null;
    this.unsubscribeCallbacks = [];
  }
  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_LOADED, ({ datasetId }) => this.handleDataset(datasetId)),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_CLEARED, () => this.handleClear()),
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.CHANGED, (payload) => this.updateScreening(payload)),
      this.eventBus.subscribe(VERTICAL_BEAM_EVENTS.CHANGED, (payload) => this.updateBeam(payload)),
      this.eventBus.subscribe(MODEL_CALCULATION_EVENTS.MODE_REQUESTED, ({ mode }) => this.setMode(mode)),
      this.eventBus.subscribe(MODEL_CALCULATION_EVENTS.CREATE_REQUESTED, () => this.createPackage()),
      this.eventBus.subscribe(MODEL_CALCULATION_EVENTS.SELECT_REQUESTED, ({ entryId }) => this.selectEntry(entryId)),
      this.eventBus.subscribe(MODEL_CALCULATION_EVENTS.EXPORT_REQUESTED, ({ format }) => this.exportActive(format)),
      this.eventBus.subscribe(MODEL_CALCULATION_EVENTS.CLEAR_REQUESTED, () => this.clearHistory()),
    ];
  }
  handleDataset(datasetId) {
    this.store.setDataset(datasetId); this.screeningSnapshot = null; this.beamSnapshot = null;
    this.updateAvailability('dataset-loaded');
  }
  handleClear() { this.screeningSnapshot = null; this.beamSnapshot = null; this.store.clear(); this.publishChanged('dataset-cleared'); }
  updateScreening(payload) { this.screeningSnapshot = completeScreening(payload) ? screeningSnapshot(payload) : null; this.updateAvailability('screening'); }
  updateBeam(payload) { this.beamSnapshot = completeBeam(payload) ? beamSnapshot(payload) : null; this.updateAvailability('vertical-beam'); }
  updateAvailability(reason) {
    const screeningAvailable = Boolean(this.screeningSnapshot), beamAvailable = Boolean(this.beamSnapshot);
    this.store.setAvailability({ screeningAvailable, beamAvailable, packageable: screeningAvailable || beamAvailable });
    this.publishChanged(reason);
  }
  setMode(mode) {
    try { this.store.setPackageMode(mode); this.publishChanged('mode-selected'); }
    catch (error) { this.publishFailure(MODEL_CALCULATION_EVENTS.CREATE_FAILED, 'MODEL_CALCULATION_MODE_INVALID', error); }
  }
  createPackage() {
    try {
      const mode = this.store.getPackageMode();
      const packageValue = createModelCalculationPackage({
        packageMode: mode,
        screeningSnapshot: mode === 'VERTICAL_BEAM_ONLY' ? null : this.screeningSnapshot,
        verticalBeamSnapshot: mode === 'TRIBUTARY_SCREENING_ONLY' ? null : this.beamSnapshot,
        modelReference: currentModelReference(),
      });
      this.store.archive(packageValue); this.publishChanged('package-created');
    } catch (error) { this.publishFailure(MODEL_CALCULATION_EVENTS.CREATE_FAILED, 'MODEL_CALCULATION_PACKAGE_FAILED', error); }
  }
  selectEntry(entryId) {
    try { this.store.select(entryId); this.publishChanged('package-selected'); }
    catch (error) { this.publishFailure(MODEL_CALCULATION_EVENTS.SELECT_FAILED, 'MODEL_CALCULATION_SELECTION_FAILED', error); }
  }
  exportActive(format) {
    try {
      const packageValue = this.store.getActivePackage(), report = this.store.getActiveReport();
      if (!packageValue || !report) throw new TypeError('Select an archived calculation package before export.');
      const baseArtifact = createModelCalculationExportArtifact(packageValue, report, format);
      const profile = this.settingsProfileProvider?.() || null;
      const artifact = profile ? applyReportTimestampPolicy(baseArtifact, profile, this.clock()) : baseArtifact;
      triggerModelCalculationDownload(this.documentRef, artifact);
      this.eventBus.publish(MODEL_CALCULATION_EVENTS.EXPORT_COMPLETED, { artifact });
    } catch (error) { this.publishFailure(MODEL_CALCULATION_EVENTS.EXPORT_FAILED, 'MODEL_CALCULATION_EXPORT_FAILED', error); }
  }
  clearHistory() { this.store.clearHistory(); this.publishChanged('history-cleared'); }
  publishChanged(reason) { this.eventBus.publish(MODEL_CALCULATION_EVENTS.CHANGED, { ...this.store.getSnapshot(), reason }); }
  publishFailure(topic, code, error) { this.eventBus.publish(topic, { code, message: messageOf(error) }); }
  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.screeningSnapshot = null;
    this.beamSnapshot = null;
    this.settingsProfileProvider = null;
    this.clock = null;
    this.store.clear();
  }
}

function completeScreening(value) { return Boolean(value?.profile && value?.pathModel && value?.screening && value?.audit); }
function screeningSnapshot(value) { return { profile: value.profile, pathModel: value.pathModel, screening: value.screening, audit: value.audit }; }
function completeBeam(value) { return Boolean(value?.profile && value?.flexuralProjection && value?.beamModel && value?.solution && value?.audit); }
function beamSnapshot(value) { return { profile: value.profile, flexuralProjection: value.flexuralProjection, beamModel: value.beamModel, solution: value.solution, audit: value.audit }; }
function currentModelReference() {
  const dataset = WorkspaceState.getSnapshot().dataset;
  return {
    datasetId: dataset?.datasetId || null,
    sharedModelSemanticHash: dataset?.sharedModel?.semanticHash || null,
    topologySemanticHash: TopologyStore.getGraph()?.semanticHash || null,
    supportAttachmentSemanticHash: SupportRestraintStore.getAttachmentModel()?.semanticHash || null,
    restraintCapabilitySemanticHash: SupportRestraintStore.getRestraintModel()?.semanticHash || null,
    loadCaseSetSemanticHash: ModelLoadStore.getLoadCaseSet()?.semanticHash || null,
    loadPrimitiveSetSemanticHash: ModelLoadStore.getLoadPrimitiveSet()?.semanticHash || null,
    modelLoadReadinessSemanticHash: ModelLoadStore.getReadinessAudit()?.semanticHash || null,
    verticalLoadPathModelSemanticHash: SupportLoadScreeningStore.getPathModel()?.semanticHash || VerticalBeamStore.getFlexuralProjection()?.pathModelSemanticHash || null,
  };
}
function messageOf(error) { return error instanceof Error ? error.message : String(error); }
