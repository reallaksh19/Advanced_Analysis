import './index.css';
import './workspace/workspace.css';
import './workspace/dataset.css';
import './workspace/viewport-renderer.css';
import './workspace/analysis-session.css';
import './workspace/analysis-ledger.css';
import './workspace/enrichment/first-cut-workbench.css';
import './workspace/linear-piping-results-workbench.css';
import { bootstrapAnalysisWorkspace } from './workspace/bootstrap.js';
import { authorizedEnrichmentConsumerController } from './workspace/enrichment/authorized-enrichment-runtime.js';
import { createAuthorizedEnrichmentWorkspaceApi } from './workspace/enrichment/authorized-enrichment-workspace-api.js';
import { ENGINEERING_MODEL_EVENTS } from './workspace/engineering-model-controller.js';
import { EventBus } from './workspace/event-bus.js';
import { mountLinearPipingResultsWorkbench } from './workspace/linear-piping-results-workbench.js';

const applicationRoot = document.getElementById('root');
const coreWorkspace = bootstrapAnalysisWorkspace(applicationRoot);
const authorizedEnrichmentApi = createAuthorizedEnrichmentWorkspaceApi({
  documentRef: applicationRoot.ownerDocument,
  controller: authorizedEnrichmentConsumerController,
  onEmpiricalAuthorizationChanged(state) {
    EventBus.publish(ENGINEERING_MODEL_EVENTS.CHANGED, {
      reason: 'authorization-changed',
      authorizationState: state,
    });
  },
  onEmpiricalChanged(execution) {
    EventBus.publish(ENGINEERING_MODEL_EVENTS.CHANGED, {
      reason: 'calculated',
      distribution: execution.distribution,
      execution,
    });
  },
  onEmpiricalFailed(error) {
    EventBus.publish(ENGINEERING_MODEL_EVENTS.FAILED, {
      message: error instanceof Error ? error.message : String(error),
      code: error?.code || 'EMPIRICAL_RUNTIME_EXECUTION_FAILED',
    });
  },
});
const linearPipingResults = mountLinearPipingResultsWorkbench(applicationRoot, {
  documentRef: applicationRoot.ownerDocument,
  urlApi: applicationRoot.ownerDocument.defaultView?.URL,
});

const workspace = Object.freeze({
  ...coreWorkspace,
  ...authorizedEnrichmentApi,
  importLinearPipingResultPackage(value) {
    return linearPipingResults.loadPackage(value);
  },
  clearLinearPipingResultPackage() {
    linearPipingResults.clear();
  },
  getLinearPipingResultState() {
    return linearPipingResults.getSnapshot();
  },
  getLinearPipingPresentation() {
    return linearPipingResults.getPresentation();
  },
  createLinearPipingAuditExportRecord() {
    return linearPipingResults.createAuditExport();
  },
  createLinearPipingEngineeringExportRecords() {
    return linearPipingResults.createEngineeringExports();
  },
  destroy() {
    linearPipingResults.destroy();
    coreWorkspace.destroy();
  },
});

globalThis.AnalysisWorkspace = workspace;

if (import.meta.hot) {
  import.meta.hot.dispose(() => workspace.destroy());
}
