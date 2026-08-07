import { LFEA_COLLECTION_PATHS } from '../lfea-workbench-model.js';
import {
  captureWorkbenchFocus,
  restoreWorkbenchFocus,
  workbenchElement,
} from '../workbench-dom.js';
import { renderLfeaAnalysisNavigator } from './analysis-navigator.js';
import { renderLfeaCommandBar } from './command-bar.js';
import { renderLfeaDiagnosticsDrawer } from './diagnostics-drawer.js';
import { renderLfeaInspector } from './inspector.js';
import { renderLfeaPipelineStepper } from './pipeline-stepper.js';
import {
  captureRunTrace,
  createLfeaShellViewModel,
} from './shell-view-model.js';
import { renderLfeaSourceDrawer } from './source-drawer.js';
import { renderLfeaVerificationArea } from './verification-hosts.js';
import { renderLfeaViewportPanel } from './viewport-panel.js';

export class LfeaShellV2View {
  constructor(rootElement) {
    this.rootElement = rootElement;
    this.handlers = null;
    this.benchmarkHost = null;
    this.convergenceHost = null;
    this.lastState = null;
    this.runTrace = null;
    this.uiState = {
      activeSection: 'MODEL',
      collectionPath: LFEA_COLLECTION_PATHS[0],
      selectedIndex: -1,
    };
  }

  setBenchmarkHost(hostElement) {
    this.benchmarkHost = hostElement;
  }

  setConvergenceHost(hostElement) {
    this.convergenceHost = hostElement;
  }

  init(handlers) {
    this.handlers = handlers;
  }

  render(state) {
    if (!this.rootElement || !this.handlers) return;
    const focused = captureWorkbenchFocus(this.rootElement);
    this.updateRunTrace(state);
    this.lastState = state;
    const model = createLfeaShellViewModel(state, this.runTrace);
    const section = workbenchElement(this.rootElement, 'section', 'lfea-workbench lfea-shell-v2');
    section.dataset.role = 'lfea-workbench';

    section.append(renderLfeaCommandBar(this.rootElement, state, model, this.handlers));

    const workbench = workbenchElement(this.rootElement, 'div', 'lfea-shell-v2__workbench');
    workbench.append(
      renderLfeaAnalysisNavigator(
        this.rootElement,
        model,
        this.uiState.activeSection,
        {
          onSelect: (id) => this.selectSection(id),
          onMock: this.handlers.onMock,
        },
      ),
      renderLfeaViewportPanel(this.rootElement, state, this.handlers),
      renderLfeaInspector(
        this.rootElement,
        state,
        this.uiState,
        this.inspectorHandlers(),
      ),
    );
    section.append(workbench);
    section.append(renderLfeaPipelineStepper(this.rootElement, model.pipeline));
    section.append(renderLfeaDiagnosticsDrawer(this.rootElement, state));
    section.append(renderLfeaVerificationArea(
      this.rootElement,
      this.benchmarkHost,
      this.convergenceHost,
      this.uiState.activeSection === 'VERIFICATION',
    ));
    section.append(renderLfeaSourceDrawer(
      this.rootElement,
      state,
      this.handlers,
      true,
    ));
    section.append(legacyReviewSummary(this.rootElement, state.execution));

    this.rootElement.replaceChildren(section);
    restoreWorkbenchFocus(this.rootElement, focused);
  }

  selectSection(id) {
    this.uiState.activeSection = id;
    if (id === 'MODEL') this.uiState.collectionPath = 'nodes';
    if (id === 'MATERIALS') this.uiState.collectionPath = 'materials';
    if (id === 'LOADS') this.uiState.collectionPath = 'analysisDefinition.constraints';
    this.uiState.selectedIndex = -1;
    this.render(this.lastState);
  }

  inspectorHandlers() {
    return {
      ...this.handlers,
      onCollectionPath: (path) => {
        this.uiState.collectionPath = path;
        this.uiState.selectedIndex = -1;
        this.render(this.lastState);
      },
      onRecordSelect: (index) => {
        this.uiState.selectedIndex = index;
        this.render(this.lastState);
      },
    };
  }

  updateRunTrace(state) {
    const previousIdentity = this.lastState
      ? `${this.lastState.packageValue?.semanticHash ?? ''}:${this.lastState.modelVersion}`
      : null;
    const currentIdentity = `${state.packageValue?.semanticHash ?? ''}:${state.modelVersion}`;
    if (previousIdentity !== null && previousIdentity !== currentIdentity) this.runTrace = null;
    this.runTrace = captureRunTrace(state, this.runTrace);
  }

  destroy() {
    this.rootElement?.replaceChildren();
    this.handlers = null;
    this.benchmarkHost = null;
    this.convergenceHost = null;
    this.lastState = null;
    this.runTrace = null;
  }
}

function legacyReviewSummary(root, execution) {
  const value = workbenchElement(root, 'pre');
  value.dataset.role = 'lfea-review-summary';
  value.className = 'lfea-shell-v2__contract-only';
  value.textContent = execution ? JSON.stringify({
    pipelineStatus: execution.status,
    failedStage: execution.failedStage,
    solverStatus: execution.result?.status ?? null,
    reviewStatus: execution.review?.status ?? null,
    evidenceExportStatus: execution.evidenceExport?.status ?? null,
    authorityPolicy: execution.authorityPolicy,
    equilibriumTotals: execution.result?.equilibriumTotals ?? null,
    energyConsistency: execution.result?.energyConsistency ?? null,
  }, null, 2) : '';
  return value;
}
