/**
 * Controller for LFEA package editing, qualified solving, review, and export.
 *
 * No Workspace event or state is consumed; all changes originate from explicit
 * package imports and local editor actions.
 */
import { createLfeaWorkbenchStore } from './lfea-workbench-store.js';
import { LFEA_WORKBENCH_STYLES } from './lfea-workbench-styles.js';
import { LfeaWorkbenchView } from './lfea-workbench-view.js';
import { FeaBenchmarkPanel } from './fea-benchmark-panel.js';
import { FEA_BENCHMARK_STYLES } from './fea-benchmark-styles.js';
import {
  createLfeaWorkbenchAdapterProfile,
  createLfeaWorkbenchReviewProfile,
} from './lfea-pipeline-profiles.js';
import { createLfeaWorkerClient } from './lfea-worker-client.js';
import { LfeaConvergenceController } from './lfea-convergence-controller.js';

export class LfeaWorkbenchController {
  /**
   * @param {Element|null} rootElement Workbench host.
   * @param {{initialDocument?:unknown,resultMode?:string,pipelineOptions?:unknown}|undefined} options Explicit initial state.
   */
  constructor(rootElement, options) {
    this.rootElement = rootElement;
    this.documentRef = rootElement?.ownerDocument ?? globalThis.document;
    this.store = createLfeaWorkbenchStore(options);
    this.pipelineOptions = options?.pipelineOptions ?? {};
    this.workerClient = typeof Worker === 'function'
      ? createLfeaWorkerClient(null)
      : null;
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
    installStyles(this.documentRef);
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
      onApplyJson: (text) => this.applyDocumentText(text),
      onAddRecord: (path, text) => this.addRecordText(path, text),
      onUpdateRecord: (path, index, text) => this.updateRecordText(path, index, text),
      onDeleteRecord: (path, index) => this.store.deleteRecord(path, index),
      onPreviewNode: (nodeId, x, y) =>
        this.store.previewNodeMove(nodeId, x, y),
      onCommitNode: () => this.store.commitNodeMove(),
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
      const text = await readUtf8(file);
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
      return this.store.replaceDocument(parseJsonObject(text, 'LFEA package'));
    } catch (error) {
      return this.store.reportEditError('document', null, error);
    }
  }

  addRecordText(path, text) {
    try {
      return this.store.addRecord(path, parseJsonObject(text, 'LFEA record'));
    } catch (error) {
      return this.store.reportEditError(path, null, error);
    }
  }

  updateRecordText(path, index, text) {
    try {
      return this.store.updateRecord(path, index, parseJsonObject(text, 'LFEA record'));
    } catch (error) {
      return this.store.reportEditError(path, index, error);
    }
  }

  async run() {
    if (!this.workerClient) return this.store.run();
    const packageInput = this.store.getState().packageValue;
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
    this.store.beginRun();
    try {
      const execution = await this.workerClient.run(input, {
        onProgress: (progress) => this.store.updateRunProgress(progress),
      });
      return this.store.completeRun(execution);
    } catch (error) {
      if (error?.name === 'AbortError') return this.store.cancelRun();
      return this.store.failRun(error);
    }
  }

  cancelRun() {
    if (!this.workerClient?.cancel()) return this.store.getState();
    return this.store.getState();
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
    downloadJson(this.documentRef, value, 'lfea-mesh-package.json');
    return value;
  }

  downloadEvidence() {
    const value = this.exportEvidence();
    downloadJson(this.documentRef, value, 'lfea-evidence-export.json');
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

function installStyles(documentRef) {
  if (!documentRef || documentRef.querySelector('[data-lfea-workbench-styles]')) return;
  const style = documentRef.createElement('style');
  style.dataset.lfeaWorkbenchStyles = 'true';
  style.textContent = `${LFEA_WORKBENCH_STYLES}\n${FEA_BENCHMARK_STYLES}`;
  documentRef.head?.append(style);
}

async function readUtf8(file) {
  if (typeof file.arrayBuffer === 'function') {
    return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  }
  if (typeof file.text === 'function') return file.text();
  throw new TypeError('Selected LFEA source cannot be read.');
}

function parseJsonObject(text, label) {
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be a JSON object.`);
  return value;
}

function downloadJson(documentRef, value, filename) {
  if (!documentRef || typeof Blob === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  documentRef.body?.append(anchor);
  anchor.click();
  anchor.remove();
  let revoked = false;
  const revoke = () => {
    if (revoked) return;
    revoked = true;
    URL.revokeObjectURL(url);
    clearTimeout(timeout);
  };
  const timeout = setTimeout(revoke, 30000);
  documentRef.defaultView?.addEventListener('focus', revoke, { once: true });
}
