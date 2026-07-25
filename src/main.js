import './index.css';
import './workspace/workspace.css';
import './workspace/dataset.css';
import './workspace/viewport-renderer.css';
import './workspace/analysis-session.css';
import './workspace/analysis-ledger.css';
import { bootstrapAnalysisWorkspace } from './workspace/bootstrap.js';

const applicationRoot = document.getElementById('root');
const workspace = bootstrapAnalysisWorkspace(applicationRoot);

globalThis.AnalysisWorkspace = workspace;

if (import.meta.hot) {
  import.meta.hot.dispose(() => workspace.destroy());
}
