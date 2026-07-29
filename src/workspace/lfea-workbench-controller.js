/**
 * Controller for LFEA package editing, qualified solving, review, and export.
 *
 * No Workspace event or state is consumed; all changes originate from explicit
 * package imports and local editor actions.
 */
import { createLfeaWorkbenchStore } from './lfea-workbench-store.js';
import { LfeaWorkbenchView } from './lfea-workbench-view.js';
import { FeaBenchmarkPanel } from './fea-benchmark-panel.js';
import {
  createLfeaWorkbenchAdapterProfile,
  createLfeaWorkbenchReviewProfile,
} from './lfea-pipeline-profiles.js';
import { createLfeaWorkerClient } from './lfea-worker-client.js';
import { LfeaConvergenceController } from './lfea-convergence-controller.js';
import {
  downloadLfeaJson,
  installLfeaWorkbenchStyles,
  parseLfeaJsonObject,
  readLfeaUtf8,
  serializableLfeaError,
} from './lfea-workbench-controller-utils.js';

export class LfeaWorkbenchController {
  /**
   * @param {Element|null} rootElement Workbench host.
   * @param {{initialDocument?:unknown,resultMode?:string,deformationScale?:number,pipelineOptions?:unknown,workerFactory?:Function}|undefined} options Explicit initial state.
   */
  constructor(rootElement, options) {
    this.rootElement = rootElement;
    this.documentRef = rootElement?.ownerDocument ?? globalThis.document;
    this.pipelineOptions = options?.pipelineOptions ?? {};
    this.workerClient = typeof Worker === 'function'
      ? createLfeaWorkerClient(options?.workerFactory ?? null)
      : null;
    this.store = createLfeaWorkbenchStore({
      ...options,
      beforeCommittedMutation: (activeRun) => this.workerClient?.cancel('MODEL_CHANGED')
        ?? {
          type: 'CANCELLED',
          ...activeRun,
          reason: 'MODEL_CHANGED',
          code: 'LFEA_RUN_CANCELLED_MODEL_CHANGED',
        },
    });
    this.view = new LfeaWorkbenchView(rootElement);
    this.benchmarkHost = this.documentRef.createElement('div');
    this.benchmarkHost.dataset.role = 'lfea-benchmark-host';
    this.benchmarkPanel = new FeaBenchmarkPanel(this.benchmarkHost, { surface: 'LFEA' });
    this.convergenceHost = this.documentRef.createElement('div');
    this.convergenceHost.dataset.role = 'lfea-convergence-host';
    this.convergenceController = new LfeaConvergenceController(
      this.convergenceHost,
      {
        onQualified: (evidence) => {
          this.pipelineOptions = {
            ...this.pipelineOptions,
            convergenceStudy: evidence.study,
            convergenceResult: evidence.interpretation,
          };
        },
      },
    );
    this.view.setBenchmarkHost(this.benchmarkHost);
    this.view.setConvergenceHost(this.convergenceHost);
    this.unsubscribe = null;
  }

  init() {
    if (this.unsubscribe) return this;
    installLfeaWorkbenchStyles(this.documentRef);
    this.view.init({
      onMock: () => this.loadMockData(),
      onFile: (file) => this.loadFile(file),
      onRun: () => this.run(),
      onCancelRun: () => this.cancelRun(),
      onExportDocument: () => this.downloadDocument(),
      onExportEvidence: () => this.downloadEvidence(),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onResultMode: (mode) => this.store.setResultMode(mode),
      onDeformationScale: (scale) => this.store.setDeformationScale(scale),
      onApplyJson: (text) => this.applyDocumentText(text),
      onAddRecord: (path, text) => this.addRecordText(path, text),
      onUpdateRecord: (path, index, text) => this.updateRecordText(path, index, text),
      onDeleteRecord: (path, index) => this.deleteRecord(path, index),
      onPreviewNode: (nodeId, x, y) =>
        this.store.previewNodeMove(nodeId, x, y),
      onCommitNode: () => this.commitNodeMove(),
      onCancelNode: () => this.store.cancelNodeMove(),
      onBenchmark: () => this.runBenchmark(),
    });
    this.benchmarkPanel.render();
    this.convergenceController.init();
    this.unsubscribe = this.store.subscribe((state) => this.view.render(state));
    this.view.render(this.store.getState());
    return this;
  }

  async loadFile(file) {
    if (!file) return this.getState();
    try {
      const text = await readLfeaUtf8(file);
      return this.importDocument(JSON.parse(text));
    } catch (error) {
      return this.store.reportEditError('document', null, error);
    }
  }

  importDocument(value) {
    return this.store.importDocument(value);
  }

  /**
   * Load a deterministic hash-valid mesh through the normal import boundary.
   *
   * @returns {Readonly<Record<string, unknown>>} Updated workbench state.
   */
  async loadMockData() {
    const { createLfeaMockPackage } = await import('./advanced-mock-data.js');
    return this.importDocument(createLfeaMockPackage());
  }

  exportDocument() {
    return this.store.exportDocument();
  }

  exportPackage() {
    return this.store.exportPackage();
  }

  exportEvidence() {
    return this.store.exportEvidence();
  }

  applyDocumentText(text) {
    try {
      return this.store.replaceDocument(parseLfeaJsonObject(text, 'LFEA package'));
    } catch (error) {
      return this.store.reportEditError('document', null, error);
    }
  }

  addRecordText(path, text) {
    try {
      return this.store.addRecord(path, parseLfeaJsonObject(text, 'LFEA record'));
    } catch (error) {
      return this.store.reportEditError(path, null, error);
    }
  }

  updateRecordText(path, index, text) {
    try {
      return this.store.updateRecord(path, index, parseLfeaJsonObject(text, 'LFEA record'));
    } catch (error) {
      return this.store.reportEditError(path, index, error);
    }
  }

  deleteRecord(path, index) {
    try {
      return this.store.deleteRecord(path, index);
    } catch (error) {
      return this.store.reportEditError(path, index, error);
    }
  }

  commitNodeMove() {
    return this.store.commitNodeMove();
  }

  async run() {
    if (!this.workerClient) return this.store.run();
    const running = this.store.beginRun();
    const identity = running.activeRun;
    const packageInput = running.packageValue;
    const includeProjectedStress =
      this.pipelineOptions.includeProjectedStress ?? true;
    const input = {
      packageInput,
      adapterProfile: this.pipelineOptions.adapterProfile
        ?? createLfeaWorkbenchAdapterProfile(),
      reviewProfile: this.pipelineOptions.reviewProfile
        ?? createLfeaWorkbenchReviewProfile(
          includeProjectedStress,
          Boolean(this.pipelineOptions.convergenceStudy),
        ),
      includeProjectedStress,
      convergenceStudy: this.pipelineOptions.convergenceStudy ?? null,
      convergenceResult: this.pipelineOptions.convergenceResult ?? null,
      untilStage: null,
    };
    try {
      const message = await this.workerClient.run(input, identity, {
        onProgress: (progressMessage) =>
          this.store.updateRunProgress(progressMessage),
        onLateMessage: (lateMessage) =>
          this.handleWorkerMessage(lateMessage),
      });
      return this.store.completeRun(message);
    } catch (error) {
      if (error?.name === 'AbortError') {
        return this.store.cancelRun(error.cancellation);
      }
      return this.store.failRun(error.workerMessage ?? {
        type: 'FAILURE',
        ...identity,
        error: serializableLfeaError(error),
      });
    }
  }

  handleWorkerMessage(message) {
    if (message?.type === 'PROGRESS') {
      return this.store.updateRunProgress(message);
    }
    if (message?.type === 'COMPLETE') {
      return this.store.completeRun(message);
    }
    if (message?.type === 'FAILURE') {
      return this.store.failRun(message);
    }
    return this.store.getState();
  }

  cancelRun() {
    const cancellation = this.workerClient?.cancel('USER');
    if (!cancellation) return this.store.getState();
    return this.store.cancelRun(cancellation);
  }

  /**
   * Run the FEA verification suite against the live code paths.
   *
   * @returns {Promise<Record<string, unknown>>} Benchmark report.
   */
  runBenchmark() {
    return this.benchmarkPanel.run();
  }

  /**
   * @returns {Record<string, unknown>|null} Last benchmark report, if any.
   */
  getBenchmarkReport() {
    return this.benchmarkPanel.getReport();
  }

  undo() {
    return this.store.undo();
  }

  redo() {
    return this.store.redo();
  }

  getState() {
    return this.store.getState();
  }

  downloadDocument() {
    const value = this.exportPackage();
    downloadLfeaJson(this.documentRef, value, 'lfea-mesh-package.json');
    return value;
  }

  downloadEvidence() {
    const value = this.exportEvidence();
    downloadLfeaJson(this.documentRef, value, 'lfea-evidence-export.json');
    return value;
  }

  destroy() {
    this.convergenceController.destroy();
    this.workerClient?.destroy();
    this.benchmarkPanel.destroy();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.store.destroy();
    this.view.destroy();
    this.rootElement = null;
  }
}
