import { MasterDataStandaloneAdapter } from './master-data-standalone-adapter.js';
import { renderAdaptedConfigPanel } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-config-tabs.js';
import { renderStandaloneImportMastersPanel } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-import-masters.js';
import { parseMasterFile, autoMapMasterColumns } from './master-data-events-handler.js';

export function renderMasterDataUI() {
  const container = document.createElement('div');
  container.className = 'master-data-ui';
  container.style.cssText = 'display:flex; flex-direction:column; height:100%; overflow:hidden; background:#0b1120; color:#e2e8f0; padding:0;';

  const stateRef = {
    current: {
      masterContext: null,
      supportConfigJson: '{}',
      activeMainTab: 'lineList', // 'lineList', 'pipingClass', 'weight', 'material', 'settings'
      configActiveSubTabId: 'general',
      importMastersLoading: false,
      importMastersWriteBackStatus: ''
    }
  };

  const render = () => {
    container.innerHTML = '';
    
    // Top Navigation Tabs Bar
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; gap:12px; align-items:center; background:#0f172a; padding:12px 20px; border-bottom:1px solid #1e293b; flex:none; flex-wrap:wrap;';
    
    const tabs = [
      { id: 'lineList', label: 'Line List' },
      { id: 'pipingClass', label: 'Piping Classes' },
      { id: 'weight', label: 'Weights' },
      { id: 'material', label: 'Material Map' },
      { id: 'settings', label: '⚙️ Rules & Settings' }
    ];
    
    tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.textContent = tab.label;
      const isActive = stateRef.current.activeMainTab === tab.id;
      btn.style.cssText = `
        background: ${isActive ? '#0284c7' : '#1e293b'};
        color: ${isActive ? '#fff' : '#94a3b8'};
        border: 1px solid ${isActive ? '#0284c7' : '#334155'};
        padding: 6px 14px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;
      `;
      btn.addEventListener('click', () => {
        stateRef.current.activeMainTab = tab.id;
        render();
      });
      header.appendChild(btn);
    });

    // Action buttons
    const actionsRight = document.createElement('div');
    actionsRight.style.cssText = 'margin-left:auto; display:flex; gap:10px; align-items:center;';

    const loadTestMastersBtn = document.createElement('button');
    loadTestMastersBtn.textContent = '🧪 Load Test Master Files';
    loadTestMastersBtn.style.cssText = 'background:#854d0e; color:#fef08a; border:1px solid #ca8a04; border-radius:4px; padding:6px 12px; font-weight:bold; font-size:12px; cursor:pointer;';
    loadTestMastersBtn.title = 'Loads pre-configured test master files from disk';
    loadTestMastersBtn.addEventListener('click', async () => {
      stateRef.current.importMastersLoading = true;
      stateRef.current.importMastersWriteBackStatus = 'Loading test masters from disk...';
      render();

      try {
        // Load default context from test fixtures
        const ctx = await MasterDataStandaloneAdapter.loadTestMasterFiles();
        stateRef.current.masterContext = ctx;
        stateRef.current.importMastersWriteBackStatus = '✅ Test Master Files Loaded Successfully!';
      } catch (e) {
        stateRef.current.importMastersWriteBackStatus = `❌ Error loading test masters: ${e.message}`;
      } finally {
        stateRef.current.importMastersLoading = false;
        render();
      }
    });
    actionsRight.appendChild(loadTestMastersBtn);

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply Overrides to Workspace';
    applyBtn.style.cssText = 'background:#10b981; color:#fff; border:none; border-radius:4px; padding:8px 16px; font-weight:bold; font-size:12px; cursor:pointer;';
    applyBtn.addEventListener('click', () => {
      const res = MasterDataStandaloneAdapter.applyMasterContextToWorkspace(stateRef.current.masterContext);
      if (res.ok) alert(`Overrides applied successfully! Master data active.`);
      else alert(`Error: ${res.error}`);
    });
    actionsRight.appendChild(applyBtn);

    header.appendChild(actionsRight);
    container.appendChild(header);

    // Body Container
    const body = document.createElement('div');
    body.style.cssText = 'flex:1; overflow-y:auto; padding:20px;';

    if (stateRef.current.activeMainTab === 'settings') {
      renderAdaptedConfigPanel(body, stateRef, render);
    } else {
      // Render standard 4-Master Cards with upload, column mapping, and searchable table preview!
      renderStandaloneImportMastersPanel(body, stateRef.current, stateRef.current.activeMainTab);
    }

    // Attach master action events (Upload File, Auto-Map, Save Mapping)
    body.addEventListener('click', async (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;

      if (action === 'load-import-masters') {
        stateRef.current.importMastersLoading = true;
        render();
        const ctx = await MasterDataStandaloneAdapter.loadStandaloneMasterContext();
        stateRef.current.masterContext = ctx;
        stateRef.current.importMastersLoading = false;
        render();
      } else if (action === 'clear-master-context') {
        stateRef.current.masterContext = null;
        MasterDataStandaloneAdapter.saveStandaloneMasterContext(null);
        render();
      } else if (action === 'auto-map-master-fields') {
        const masterKey = target.dataset.masterKey;
        const rawRows = stateRef.current.masterContext?.rawRows?.[masterKey] || [];
        if (rawRows.length) {
          const mapping = autoMapMasterColumns(rawRows, masterKey);
          alert(`Auto-mapped columns for ${masterKey}!`);
          render();
        }
      }
    });

    body.addEventListener('change', async (e) => {
      const fileInput = e.target.closest('input[type="file"][data-master-key]');
      if (fileInput && fileInput.files?.length > 0) {
        const file = fileInput.files[0];
        const masterKey = fileInput.dataset.masterKey;
        try {
          const { rawRows } = await parseMasterFile(file, file.name, masterKey);
          if (!stateRef.current.masterContext) {
            stateRef.current.masterContext = await MasterDataStandaloneAdapter.loadStandaloneMasterContext();
          }
          stateRef.current.masterContext.rawRows = stateRef.current.masterContext.rawRows || {};
          stateRef.current.masterContext.rawRows[masterKey] = rawRows;
          
          // Map to rows
          const rowsKey = masterKey === 'lineList' ? 'lineRows' : masterKey === 'pipingClass' ? 'pipingClassRows' : masterKey === 'weight' ? 'weightMasterRows' : 'materialMapRows';
          stateRef.current.masterContext[rowsKey] = rawRows;

          MasterDataStandaloneAdapter.saveStandaloneMasterContext(stateRef.current.masterContext);
          alert(`Successfully uploaded ${rawRows.length} rows for ${masterKey}!`);
          render();
        } catch (err) {
          alert(`Failed to parse file: ${err.message}`);
        }
      }
    });

    container.appendChild(body);
  };

  // Init
  MasterDataStandaloneAdapter.loadStandaloneMasterContext().then(context => {
    stateRef.current.masterContext = context;
    stateRef.current.supportConfigJson = JSON.stringify(context.config || {});
    render();
  });

  return container;
}
