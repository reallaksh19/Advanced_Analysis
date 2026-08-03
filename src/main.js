import './index.css';
import './workspace/workspace.css';
import './workspace/dataset.css';
import './workspace/viewport-renderer.css';
import './workspace/analysis-session.css';
import './workspace/analysis-ledger.css';
import './workspace/enrichment/first-cut-workbench.css';
import './workspace/linear-piping-results-workbench.css';
import { bootstrapAnalysisWorkspace } from './workspace/bootstrap.js';
import { AuthorizedEnrichmentConsumerController } from './workspace/enrichment/authorized-enrichment-consumer-controller.js';
import { createAuthorizedEnrichmentWorkspaceApi } from './workspace/enrichment/authorized-enrichment-workspace-api.js';
import { engineeringModelStore } from './workspace/engineering-model-store.js';
import { masterDataController } from './workspace/master-data-controller.js';
import { mountLinearPipingResultsWorkbench } from './workspace/linear-piping-results-workbench.js';

const applicationRoot = document.getElementById('root');
const coreWorkspace = bootstrapAnalysisWorkspace(applicationRoot);
const authorizedEnrichmentController = new AuthorizedEnrichmentConsumerController({
  engineeringModelStore,
  masterDataController,
});
const authorizedEnrichmentApi = createAuthorizedEnrichmentWorkspaceApi({
  documentRef: applicationRoot.ownerDocument,
  controller: authorizedEnrichmentController,
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
