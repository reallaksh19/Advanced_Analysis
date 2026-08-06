/**
 * Controller for the independent LAFEA editor and qualified calculation stages.
 *
 * DOM/file actions are translated into store-owned immutable edit commands. The
 * controller has no Workspace coupling and no numerical calculation logic.
 * Lifecycle evidence enters only through explicit producer-owned records/events.
 */
import { createLafeaWorkbenchStore } from './lafea-lifecycle-workbench-store.js';
import { LAFEA_WORKBENCH_STYLES } from './lafea-workbench-styles.js';
import { FeaBenchmarkPanel } from './fea-benchmark-panel.js';
import { FEA_BENCHMARK_STYLES } from './fea-benchmark-styles.js';
import {
  createLafeaAccessoryPanelManager,
  lafeaAccessoryPanelConfigurationRequiresHost,
} from './lafea-workbench-accessory-panels.js';
import {
  bindLafeaWorkbenchDisplayRenderPacket,
  clearLafeaWorkbenchDisplayRenderPacket,
  destroyLafeaWorkbenchRenderEvidence,
  initializeLafeaWorkbenchRenderEvidence,
  lafeaWorkbenchDisplayRenderPacket,
  lafeaWorkbenchThreeNamespace,
} from './lafea-workbench-render-evidence.js';
import { LafeaWorkbenchView } from './lafea-workbench-view.js';

const ACCESSORY_PANEL_MANAGERS = new WeakMap();
const DESTROYED_CONTROLLERS = new WeakSet();

export class LafeaWorkbenchController {
  constructor(rootElement, options) {
    const configuration = isRecord(options) ? options : {};
    const { accessoryPanels, THREE, ...storeOptions } = configuration;
    this.rootElement = rootElement;
    this.documentRef = rootElement?.ownerDocument ?? globalThis.document;
    this.store = createLafeaWorkbenchStore(storeOptions);
    initializeLafeaWorkbenchRenderEvidence(this, THREE ?? null);
    this.view = new LafeaWorkbenchView(rootElement, {
      getRenderPacket: (stageId) => lafeaWorkbenchDisplayRenderPacket(this, stageId),
      THREE: lafeaWorkbenchThreeNamespace(this),
    });
    this.benchmarkHost = this.documentRef.createElement('div');
    this.benchmarkHost.dataset.role = 'lafea-benchmark-host';
    this.benchmarkPanel = new FeaBenchmarkPanel(this.benchmarkHost, { surface: 'LAFEA' });
    this.view.setBenchmarkHost(this.benchmarkHost);
    if (lafeaAccessoryPanelConfigurationRequiresHost(configuration)) {
      ACCESSORY_PANEL_MANAGERS.set(
        this,
        createLafeaAccessoryPanelManager(this.documentRef, accessoryPanels),
      );
    }
    this.unsubscribe = null;
  }

  init() {
    if (DESTROYED_CONTROLLERS.has(this)) {
      throw new TypeError('LAFEA_WORKBENCH_CONTROLLER_DESTROYED');
    }
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
      onSetScalar: (descriptorId, entityId, rawText) => this.setScalar(descriptorId, entityId, rawText),
      onApplyJson: (text) => this.applyDocumentText(text),
      onMoveNode: (path, nodeId, x, y) => this.store.moveNode(path, nodeId, x, y),
      onBenchmark: () => this.runBenchmark(),
    });
    this.benchmarkPanel.render();
    this.unsubscribe = this.store.subscribe((state) => this.view.render(state));
    this.view.render(this.store.getState());
    const accessoryPanelManager = ACCESSORY_PANEL_MANAGERS.get(this);
    if (accessoryPanelManager) {
      this.rootElement.append(accessoryPanelManager.hostElement);
      accessoryPanelManager.mount(this);
    }
    return this;
  }

  runBenchmark() { return this.benchmarkPanel.run(); }
  getBenchmarkReport() { return this.benchmarkPanel.getReport(); }

  async loadFile(file) {
    if (!file) return this.getState();
    try {
      const text = await readUtf8(file);
      return this.importDocument(JSON.parse(text));
    } catch (error) {
      return this.store.reportEditError('document', null, error);
    }
  }

  importDocument(value, stageId, sourceHash = null) {
    return this.store.importDocument(value, stageId, sourceHash);
  }

  async loadMockData(stageId) {
    const { createLafeaMockDocument } = await import('./advanced-mock-data.js');
    return this.importDocument(createLafeaMockDocument(stageId), stageId);
  }

  exportDocument() { return this.store.exportDocument(); }
  exportLifecycle() { return this.store.exportLifecycle(); }
  initializeLifecycle(sourceHash, originRef) {
    return this.store.initializeLifecycle(sourceHash, originRef);
  }
  applyLifecycleEvent(event) { return this.store.applyLifecycleEvent(event); }
  registerLifecycleArtifact(record, registrationId) {
    return this.store.registerLifecycleArtifact(record, registrationId);
  }
  revalidateLifecycleBinding(sourceHash, originRef) {
    return this.store.revalidateLifecycleBinding(sourceHash, originRef);
  }
  validateLafeaAnalysisMeshEvidence(value) {
    return this.store.validateLafeaAnalysisMeshEvidence(value);
  }
  registerAnalysisMeshEvidence(value) {
    return this.store.registerAnalysisMeshEvidence(value);
  }
  selectRetainedAnalysisMeshEvidence(stageId) {
    return this.store.selectRetainedAnalysisMeshEvidence(stageId);
  }

  buildAnalysisMeshCustodyProjection(stageId = this.getState().activeStageId) {
    const stage = this.getState().stages[stageId];
    return this.store.buildAnalysisMeshCustodyProjection(
      stage,
      stage?.retainedAnalysisMeshEvidence ?? null,
    );
  }

  exportAnalysisMeshEvidence(stageId = this.getState().activeStageId) {
    return this.store.exportAnalysisMeshEvidence(stageId);
  }
  recoverAnalysisMeshEvidence(value) {
    return this.store.recoverAnalysisMeshEvidence(value);
  }

  getDisplayViewportContext() {
    const viewport = this.view.activeViewport;
    if (!viewport) return null;
    const state = viewport.getState();
    return Object.freeze({
      schema: 'lafea-workbench-display-context/v1',
      stageId: state.stageId,
      sceneRevision: state.sceneRevision,
      sourceSemanticHash: viewport.scene.sourceSemanticHash,
      mode: state.mode,
      status: state.status,
    });
  }

  setDisplayRenderPacket(packetValue) {
    const binding = bindLafeaWorkbenchDisplayRenderPacket(this, packetValue);
    this.renderActiveStageIf(binding.stageId);
    return binding;
  }

  clearDisplayRenderPacket(stageId = this.getState().activeStageId) {
    const binding = clearLafeaWorkbenchDisplayRenderPacket(this, stageId);
    if (binding.status === 'CLEARED') this.renderActiveStageIf(binding.stageId);
    return binding;
  }

  renderActiveStageIf(stageId) {
    if (this.unsubscribe && this.getState().activeStageId === stageId) {
      this.view.render(this.getState());
    }
  }

  setScalar(descriptorId, entityId, rawText) {
    try {
      return this.store.setScalar(descriptorId, entityId, rawText, 'FORM');
    } catch (error) {
      return this.store.reportEditError(descriptorId, entityId, error);
    }
  }

  applyDocumentText(text) {
    try {
      return this.store.replaceDocument(parseJsonObject(text, 'LAFEA document'), 'RAW_JSON');
    } catch (error) {
      return this.store.reportEditError('document', null, error);
    }
  }

  run() { return this.store.run(); }
  undo() { return this.store.undo(); }
  redo() { return this.store.redo(); }
  getState() { return this.store.getState(); }

  downloadDocument() {
    const value = this.exportDocument();
    downloadJson(
      this.documentRef,
      value,
      `${value.stageId.toLowerCase().replace('.', '-')}-document.json`,
    );
    return value;
  }

  destroy() {
    if (DESTROYED_CONTROLLERS.has(this)) return;
    DESTROYED_CONTROLLERS.add(this);
    const accessoryPanelManager = ACCESSORY_PANEL_MANAGERS.get(this);
    accessoryPanelManager?.destroy();
    ACCESSORY_PANEL_MANAGERS.delete(this);
    this.benchmarkPanel.destroy();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.store.destroy();
    this.view.destroy();
    destroyLafeaWorkbenchRenderEvidence(this);
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

function downloadJson(documentRef, value, filename) {
  if (!documentRef || typeof Blob === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(new Blob(
    [JSON.stringify(value, null, 2)],
    { type: 'application/json' },
  ));
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

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
