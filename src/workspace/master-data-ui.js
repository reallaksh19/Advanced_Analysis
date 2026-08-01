import { renderAdaptedConfigPanel } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-config-tabs.js';
import { renderStandaloneImportMastersPanel } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-import-masters.js';
import { parseMasterFile, autoMapMasterColumns } from './master-data-events-handler.js';
import { masterDataController } from './master-data-controller.js';
import { normalizeLineList, normalizePipingClass, normalizeWeight, normalizeMaterialMap } from './master-data-normalizers.js';
import { saveMappingForFile, getSavedMappingsForMaster } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-state.js';

export function renderMasterDataUI() {
  const container = document.createElement('div');
  container.className = 'master-data-ui';
  container.style.cssText = 'display:flex; flex-direction:column; height:100%; overflow:hidden; background:#0b1120; color:#e2e8f0; padding:0;';

  const stateRef = {
    current: {
      masterContext: null,
      supportConfigJson: '{}',
      activeMainTab: 'lineList', // 'lineList', 'pipingClass', 'weight', 'materialMap', 'settings'
      configActiveSubTabId: 'general',
      importMastersLoading: false,
      importMastersWriteBackStatus: ''
    }
  };

  const render = () => {
    container.innerHTML = '';
    
    // Pass the legacy context representation to the UI
    stateRef.current.masterContext = masterDataController.getLegacyContext();
    stateRef.current.supportConfigJson = JSON.stringify(stateRef.current.masterContext.config || {});
    
    // Top Navigation Tabs Bar
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; gap:12px; align-items:center; background:#0f172a; padding:12px 20px; border-bottom:1px solid #1e293b; flex:none; flex-wrap:wrap;';
    
    const tabs = [
      { id: 'lineList', label: 'Line List' },
      { id: 'pipingClass', label: 'Piping Classes' },
      { id: 'weight', label: 'Weights' },
      { id: 'materialMap', label: 'Material Map' },
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
        const files = [
          { key: 'lineList', path: '/fixtures/AML-91-PDFEED-PX-2345-00001-0000 BC4.xlsx' },
          { key: 'pipingClass', path: '/fixtures/Piping class master.xlsx' },
          { key: 'weight', path: '/fixtures/wtValveweights.xlsx' },
          { key: 'materialMap', path: '/fixtures/PCF_MAT_MAP.TXT' }
        ];

        for (const f of files) {
          try {
            const res = await fetch(f.path);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const buffer = await res.arrayBuffer();
            const fileName = f.path.split('/').pop();
            const { rawRows, sheetName } = await parseMasterFile(buffer, fileName, f.key);
            
            if (rawRows && rawRows.length > 0) {
              masterDataController.setRawRows(f.key, rawRows, fileName, sheetName);
              const mapping = autoMapMasterColumns(rawRows, f.key);
              if (mapping) {
                masterDataController.setFieldMap(f.key, mapping);
                try {
                  if (f.key === 'lineList') masterDataController.setNormalizedRows(f.key, normalizeLineList(rawRows, mapping));
                  else if (f.key === 'pipingClass') masterDataController.setNormalizedRows(f.key, normalizePipingClass(rawRows, mapping));
                  else if (f.key === 'weight') masterDataController.setNormalizedRows(f.key, normalizeWeight(rawRows, mapping));
                  else if (f.key === 'materialMap') masterDataController.setNormalizedRows(f.key, normalizeMaterialMap(rawRows, mapping));
                } catch(e) {
                  console.warn(`Validation failed for test master ${f.key}:`, e.message);
                }
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch test master ${f.path}:`, err);
          }
        }
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
      // Stub for now, will be implemented with WorkspaceMutationService
      alert('Workspace mutation service pending P2 Implementation');
    });
    if (window.__ENABLE_EXPERIMENTAL_MASTER_DATA_OVERRIDES) {
      actionsRight.appendChild(applyBtn);
    }

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
        // No-op for now, MasterDataController initializes state automatically
        render();
      } else if (action === 'clear-master-context') {
        masterDataController.clear();
        render();
      } else if (action === 'auto-map-master-fields') {
        const masterKey = target.dataset.masterKey;
        const rawRows = masterDataController.getMasterData()[masterKey]?.rawRows || [];
        if (rawRows.length) {
          const mapping = autoMapMasterColumns(rawRows, masterKey);
          masterDataController.setFieldMap(masterKey, mapping);
          
          // Do NOT invoke strict validation (normalizeLineList) here. 
          // Just update the mapping visually so the user can finish manual edits.
          stateRef.current.importMastersWriteBackStatus = `Auto-mapped columns for ${masterKey}.`;
          render();
        }
      } else if (action === 'save-master-mapping') {
        const masterKey = target.dataset.masterKey;
        const selects = document.querySelectorAll(`select[data-master-field-map][data-master-key="${masterKey}"]`);
        const mapping = {};
        selects.forEach(s => {
          if (s.value) mapping[s.dataset.masterFieldMap] = s.value;
        });
        
        const rawRows = masterDataController.getMasterData()[masterKey]?.rawRows || [];
        masterDataController.setFieldMap(masterKey, mapping);
        
        const fileName = masterDataController.getMasterData()[masterKey]?.fileName || 'default-template';
        saveMappingForFile(masterKey, fileName, mapping);
        
        try {
            let normalizedRows = [];
            if (masterKey === 'lineList') normalizedRows = normalizeLineList(rawRows, mapping);
            else if (masterKey === 'pipingClass') normalizedRows = normalizePipingClass(rawRows, mapping);
            else if (masterKey === 'weight') normalizedRows = normalizeWeight(rawRows, mapping);
            else if (masterKey === 'materialMap') normalizedRows = normalizeMaterialMap(rawRows, mapping);
            
            masterDataController.setNormalizedRows(masterKey, normalizedRows);
            masterDataController.getMasterData()[masterKey].diagnostics = [{ code: 'VALID', message: 'Mapping validated and applied successfully.' }];
            stateRef.current.importMastersWriteBackStatus = `Mapping saved as "${fileName}" and applied successfully for ${masterKey}.`;
        } catch (err) {
            masterDataController.getMasterData()[masterKey].diagnostics = [{ code: 'INVALID_MAPPING', message: err.message }];
            masterDataController.setNormalizedRows(masterKey, []);
            stateRef.current.importMastersWriteBackStatus = `Mapping validation failed for ${masterKey}: ${err.message}`;
        }
        render();
      }
    });

    body.addEventListener('change', async (e) => {
      const selectAction = e.target.closest('select[data-action]');
      if (selectAction && selectAction.dataset.action === 'apply-saved-mapping') {
        const masterKey = selectAction.dataset.masterKey;
        const selectedMappingName = selectAction.value;
        if (selectedMappingName) {
          const savedMappings = getSavedMappingsForMaster(masterKey);
          const mapping = savedMappings[selectedMappingName];
          if (mapping) {
            masterDataController.setFieldMap(masterKey, mapping);
            const rawRows = masterDataController.getMasterData()[masterKey]?.rawRows || [];
            if (rawRows.length && masterKey === 'lineList') {
              try {
                const norm = normalizeLineList(rawRows, mapping);
                masterDataController.setNormalizedRows(masterKey, norm);
              } catch (_) {}
            }
            stateRef.current.importMastersWriteBackStatus = `Applied saved mapping "${selectedMappingName}" for ${masterKey}.`;
            render();
          }
        }
        return;
      }
      const select = e.target.closest('select[data-master-field-map]');
      if (select) {
        const masterKey = select.dataset.masterKey;
        const fieldName = select.dataset.masterFieldMap;
        const val = select.value;
        const currentMap = { ...(masterDataController.getMasterData()[masterKey]?.fieldMap || {}) };
        if (val) currentMap[fieldName] = val;
        else delete currentMap[fieldName];
        masterDataController.setFieldMap(masterKey, currentMap);
        
        const rawRows = masterDataController.getMasterData()[masterKey]?.rawRows || [];
        if (rawRows.length && masterKey === 'lineList') {
          try {
            const norm = normalizeLineList(rawRows, currentMap);
            masterDataController.setNormalizedRows(masterKey, norm);
          } catch (_) {}
        }
        render();
        return;
      }

      const fileInput = e.target.closest('input[type="file"][data-master-file]');
      if (fileInput && fileInput.files?.length > 0) {
        const file = fileInput.files[0];
        const masterKey = fileInput.dataset.masterFile;
        try {
          const { rawRows, sheetName } = await parseMasterFile(file, file.name, masterKey);
          masterDataController.setRawRows(masterKey, rawRows, file.name, sheetName);
          
          // Auto-map automatically on upload (as requested, replicating baseline behavior)
          const mapping = autoMapMasterColumns(rawRows, masterKey);
          if (mapping && Object.keys(mapping).length > 0) {
             masterDataController.setFieldMap(masterKey, mapping);
             if (masterKey === 'lineList') {
               try {
                 const norm = normalizeLineList(rawRows, mapping);
                 masterDataController.setNormalizedRows(masterKey, norm);
               } catch (_) {}
             }
             stateRef.current.importMastersWriteBackStatus = `Successfully uploaded and auto-mapped ${rawRows.length} rows for ${masterKey}.`;
          } else {
             stateRef.current.importMastersWriteBackStatus = `Successfully uploaded ${rawRows.length} rows for ${masterKey}.`;
          }
          render();
        } catch (err) {
          stateRef.current.importMastersWriteBackStatus = `Failed to parse file: ${err.message}`;
          render();
        }
      }
    });

    container.appendChild(body);
  };

  // Init
  render();

  return container;
}
