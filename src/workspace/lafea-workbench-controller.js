/**
 * Controller for the independent LAFEA editor and qualified calculation stages.
 *
 * The controller translates DOM/file actions into immutable store operations and
 * deliberately has no dependency on Workspace state or its event bus.
 */
import { createLafeaWorkbenchStore } from './lafea-workbench-store.js';
import { LAFEA_WORKBENCH_STYLES } from './lafea-workbench-styles.js';
import { FeaBenchmarkPanel } from './fea-benchmark-panel.js';
import { FEA_BENCHMARK_STYLES } from './fea-benchmark-styles.js';
import { LafeaWorkbenchView } from './lafea-workbench-view.js';

export class LafeaWorkbenchController {
  /**
   * @param {Element|null} rootElement Workbench host.
   * @param {{initialStage?:string,initialDocument?:unknown}|undefined} options Explicit initial state.
   */
  constructor(rootElement, options) {
    this.rootElement = rootElement;
    this.documentRef = rootElement?.ownerDocument ?? globalThis.document;
    this.store = createLafeaWorkbenchStore(options);
    this.view = new LafeaWorkbenchView(rootElement);
    this.benchmarkHost = this.documentRef.createElement('div');
    this.benchmarkHost.dataset.role = 'lafea-benchmark-host';
    this.benchmarkPanel = new FeaBenchmarkPanel(this.benchmarkHost, { surface: 'LAFEA' });
    this.view.setBenchmarkHost(this.benchmarkHost);
    this.unsubscribe = null;
  }

  init() {
    if (this.unsubscribe) return this;
    installStyles(this.documentRef);
    this.view.init({
      onStage: (stageId) => this.store.selectStage(stageId),
      onMock: (stageId) => this.loadMockData(stageId),
      onFile: (file) => this.loadFile(file),
      onRun: () => this.run(),
      onExport: () => this.downloadDocument(),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onApplyJson: (text) => this.applyDocumentText(text),
      onAddRecord: (path, text) => this.addRecordText(path, text),
      onUpdateRecord: (path, index, text) => this.updateRecordText(path, index, text),
      onDeleteRecord: (path, index) => this.store.deleteRecord(path, index),
      onMoveNode: (path, nodeId, x, y) => this.store.moveNode(path, nodeId, x, y),
      onBenchmark: () => this.runBenchmark(),
    });
    this.benchmarkPanel.render();
    this.unsubscribe = this.store.subscribe((state) => this.view.render(state));
    this.view.render(this.store.getState());
    return this;
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

  async loadFile(file) {
    if (!file) return this.getState();
    try {
      const text = await readUtf8(file);
      return this.importDocument(JSON.parse(text));
    } catch (error) {
      return this.store.importDocument(invalidImport(error));
    }
  }

  importDocument(value, stageId) {
    return this.store.importDocument(value, stageId);
  }

  /**
   * Load one deterministic demonstration document through the normal importer.
   *
   * @param {string} stageId Exact active LAFEA stage.
   * @returns {Readonly<Record<string, unknown>>} Updated workbench state.
   */
  async loadMockData(stageId) {
    const { createLafeaMockDocument } = await import('./advanced-mock-data.js');
    return this.importDocument(createLafeaMockDocument(stageId), stageId);
  }

  exportDocument() {
    return this.store.exportDocument();
  }

  applyDocumentText(text) {
    try {
      return this.store.replaceDocument(parseJsonObject(text, 'LAFEA document'));
    } catch (error) {
      return this.store.reportEditError('document', -1, error);
    }
  }

  addRecordText(path, text) {
    try {
      return this.store.addRecord(path, parseJsonObject(text, 'LAFEA record'));
    } catch (error) {
      return this.store.reportEditError(path, -1, error);
    }
  }

  updateRecordText(path, index, text) {
    try {
      return this.store.updateRecord(path, index, parseJsonObject(text, 'LAFEA record'));
    } catch (error) {
      return this.store.reportEditError(path, index, error);
    }
  }

  run() {
    return this.store.run();
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
    const value = this.exportDocument();
    downloadJson(this.documentRef, value, `${value.stageId.toLowerCase().replace('.', '-')}-document.json`);
    return value;
  }

  destroy() {
    this.benchmarkPanel.destroy();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.store.destroy();
    this.view.destroy();
    this.rootElement = null;
  }
}

function installStyles(documentRef) {
  if (!documentRef || documentRef.querySelector('[data-lafea-workbench-styles]')) return;
  const style = documentRef.createElement('style');
  style.dataset.lafeaWorkbenchStyles = 'true';
  style.textContent = `${LAFEA_WORKBENCH_STYLES}\n${FEA_BENCHMARK_STYLES}`;
  documentRef.head?.append(style);
}

async function readUtf8(file) {
  if (typeof file.arrayBuffer === 'function') {
    return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  }
  if (typeof file.text === 'function') return file.text();
  throw new TypeError('Selected LAFEA source cannot be read.');
}

function parseJsonObject(text, label) {
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object.`);
  }
  return value;
}

function invalidImport(error) {
  return {
    schema: 'lafea-invalid-import/v1',
    error: error instanceof Error ? error.message : 'Unknown import failure.',
  };
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
  revokeObjectUrlAfterDownload(documentRef, url);
}

function revokeObjectUrlAfterDownload(documentRef, url) {
  let revoked = false;
  const revoke = () => {
    if (revoked) return;
    revoked = true;
    URL.revokeObjectURL(url);
    globalThis.clearTimeout(timeout);
    globalThis.removeEventListener?.('focus', revoke);
  };
  const timeout = globalThis.setTimeout(revoke, 30_000);
  globalThis.addEventListener?.('focus', revoke, { once: true });
}
