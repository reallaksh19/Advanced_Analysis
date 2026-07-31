import { renderStandaloneResolverJsonTracePanel } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-resolver-json-trace.js';
import { runStandaloneResolverJsonTrace } from '../calc-workspace/cii-standalone-port/xml-cii-resolver-json-trace.js';
import { WorkspaceState } from './workspace-state.js';

export function renderJsonTraceUI() {
  const container = document.createElement('div');
  container.className = 'json-trace-ui';
  container.style.cssText = 'display:flex; flex-direction:column; height:100%; overflow:hidden; background:#0b1120; color:#e2e8f0; padding:20px;';

  const snapshot = WorkspaceState.getSnapshot();
  const activeDataset = snapshot?.dataset || null;

  const stateRef = {
    current: {
      jsonTraceActiveSubTabId: 'tree', // Default directly to Evidence Tree!
      sourceKind: 'json',
      resolverJsonTraceConfig: {},
      supportConfigJson: '{}',
      sourceText: '',
      stagedJsonText: '',
      resolverJsonTraceResult: null,
      jsonTraceTableRows: []
    }
  };

  // Automatically form JSON Trace from WorkspaceState dataset on open!
  const generateTraceFromDataset = (datasetOverride = null) => {
    const ds = datasetOverride || activeDataset;
    const result = runStandaloneResolverJsonTrace({
      dataset: ds,
      stagedJsonText: stateRef.current.stagedJsonText,
      jsonConfig: stateRef.current.resolverJsonTraceConfig
    });
    stateRef.current.resolverJsonTraceResult = result;
    stateRef.current.resolverJsonTraceJsonResult = result;
  };

  // Run automatically on initialization
  generateTraceFromDataset();

  const render = () => {
    container.innerHTML = '';
    
    // Top Bar Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex:none; border-bottom:1px solid #1e293b; padding-bottom:12px;';
    
    const info = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.textContent = 'JSON Trace Inspector (Automated)';
    h2.style.cssText = 'margin:0 0 4px; color:#38bdf8; font-size:18px;';
    info.appendChild(h2);
    
    const p = document.createElement('p');
    p.textContent = `Auto-derived from active model state (${stateRef.current.resolverJsonTraceResult?.indexStats?.totalNodes || 0} nodes / entities parsed).`;
    p.style.cssText = 'margin:0; color:#94a3b8; font-size:12px;';
    info.appendChild(p);
    header.appendChild(info);

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex; gap:10px; align-items:center;';

    const loadSjsonBtn = document.createElement('button');
    loadSjsonBtn.textContent = '🧪 Load Sjson.json Fixture';
    loadSjsonBtn.style.cssText = 'background:#854d0e; color:#fef08a; border:1px solid #ca8a04; border-radius:4px; padding:6px 12px; font-weight:bold; font-size:12px; cursor:pointer;';
    loadSjsonBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/fixtures/Sjson.json');
        if (!res.ok) throw new Error('Failed to load Sjson.json');
        const text = await res.text();
        stateRef.current.stagedJsonText = text;
        generateTraceFromDataset(null);
        render();
        alert('Sjson.json Fixture Loaded!');
      } catch (e) {
        alert(e.message);
      }
    });
    btnGroup.appendChild(loadSjsonBtn);

    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '↺ Refresh Trace from Workspace';
    refreshBtn.style.cssText = 'background:#0284c7; color:#fff; border:none; border-radius:4px; padding:6px 12px; font-weight:bold; font-size:12px; cursor:pointer;';
    refreshBtn.addEventListener('click', () => {
      generateTraceFromDataset();
      render();
    });
    btnGroup.appendChild(refreshBtn);

    header.appendChild(btnGroup);
    container.appendChild(header);

    // Body Container
    const body = document.createElement('div');
    body.style.cssText = 'flex:1; overflow-y:auto; padding-right:12px;';

    // Sub-tab switching delegation
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-json-trace-sub-tab]');
      if (btn) {
        stateRef.current.jsonTraceActiveSubTabId = btn.dataset.jsonTraceSubTab;
        render();
      }
    });

    renderStandaloneResolverJsonTracePanel(body, stateRef.current, stateRef, render);

    container.appendChild(body);
  };

  render();
  return container;
}
