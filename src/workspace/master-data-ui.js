import { renderStandaloneImportMastersPanel } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-import-masters.js';
import { parseMasterFile, autoMapMasterColumns } from './master-data-events-handler.js';
import { masterDataController } from './master-data-controller.js';
import { normalizeLineList, normalizePipingClass, normalizeWeight, normalizeMaterialMap } from './master-data-normalizers.js';
import { saveMappingForFile, getSavedMappingsForMaster } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-state.js';

/**
 * Normalizes an imported master using its explicit type and user-visible mapping.
 * Inputs are the master key, parsed source rows, and selected column mapping; the
 * output is the validated canonical row list. Unknown keys fail without fallback.
 */
function normalizeMasterRows(masterKey, rawRows, mapping) {
  if (masterKey === 'lineList') return normalizeLineList(rawRows, mapping);
  if (masterKey === 'pipingClass') return normalizePipingClass(rawRows, mapping);
  if (masterKey === 'weight') return normalizeWeight(rawRows, mapping);
  if (masterKey === 'materialMap') return normalizeMaterialMap(rawRows, mapping);
  throw new RangeError(`Unsupported master type: ${masterKey}`);
}

export function renderMasterDataUI(documentRef) {
  if (!documentRef) throw new TypeError('Master Data UI requires a document.');
  const container = documentRef.createElement('div');
  container.className = 'master-data-ui';
  container.style.cssText = 'display:flex; flex-direction:column; height:100%; overflow:hidden; background:#0b1120; color:#e2e8f0; padding:0;';

  const stateRef = {
    current: {
      masterContext: null,
      supportConfigJson: '{}',
      activeMainTab: 'lineList',
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
    const header = documentRef.createElement('div');
    header.style.cssText = 'display:flex; gap:12px; align-items:center; background:#0f172a; padding:12px 20px; border-bottom:1px solid #1e293b; flex:none; flex-wrap:wrap;';
    
    const tabs = [
      { id: 'lineList', label: 'Line List' },
      { id: 'pipingClass', label: 'Piping Classes' },
      { id: 'weight', label: 'Weights' },
      { id: 'materialMap', label: 'Material Map' }
    ];
    
    tabs.forEach(tab => {
      const btn = documentRef.createElement('button');
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
    const actionsRight = documentRef.createElement('div');
    actionsRight.style.cssText = 'margin-left:auto; display:flex; gap:10px; align-items:center;';

    header.appendChild(actionsRight);
    container.appendChild(header);

    // Body Container
    const body = documentRef.createElement('div');
    body.style.cssText = 'flex:1; overflow-y:auto; padding:20px;';

    renderStandaloneImportMastersPanel(body, stateRef.current, stateRef.current.activeMainTab);

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
        const selects = container.querySelectorAll(`select[data-master-field-map][data-master-key="${masterKey}"]`);
        const mapping = {};
        selects.forEach(s => {
          if (s.value) mapping[s.dataset.masterFieldMap] = s.value;
        });
        
        const rawRows = masterDataController.getMasterData()[masterKey]?.rawRows || [];
        masterDataController.setFieldMap(masterKey, mapping);
        
        const fileName = masterDataController.getMasterData()[masterKey]?.fileName;
        if (!fileName) {
          stateRef.current.importMastersWriteBackStatus = `Cannot save ${masterKey} mapping before an authoritative file is loaded.`;
          render();
          return;
        }
        saveMappingForFile(masterKey, fileName, mapping);
        
        try {
            const normalizedRows = normalizeMasterRows(masterKey, rawRows, mapping);
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
            if (rawRows.length) {
              try {
                const norm = normalizeMasterRows(masterKey, rawRows, mapping);
                masterDataController.setNormalizedRows(masterKey, norm);
              } catch (error) {
                masterDataController.setNormalizedRows(masterKey, []);
                stateRef.current.importMastersWriteBackStatus = `Saved mapping is invalid for ${masterKey}: ${error instanceof Error ? error.message : String(error)}`;
                render();
                return;
              }
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
        if (rawRows.length) {
          try {
            const norm = normalizeMasterRows(masterKey, rawRows, currentMap);
            masterDataController.setNormalizedRows(masterKey, norm);
          } catch (error) {
            masterDataController.setNormalizedRows(masterKey, []);
            stateRef.current.importMastersWriteBackStatus = `Mapping is invalid for ${masterKey}: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
        render();
        return;
      }

      const fileInput = e.target.closest('input[type="file"][data-master-file]');
      if (fileInput && fileInput.files?.length > 0) {
        const file = fileInput.files[0];
        const masterKey = fileInput.dataset.masterFile;
        try {
          const { rawRows, sheetName, sourceMetadata } = await parseMasterFile(file, file.name, masterKey);
          masterDataController.setRawRows(masterKey, rawRows, file.name, sheetName, sourceMetadata);
          
          // Apply the visible auto-mapping to every supported real master type.
          const mapping = autoMapMasterColumns(rawRows, masterKey);
          if (mapping && Object.keys(mapping).length > 0) {
            masterDataController.setFieldMap(masterKey, mapping);
            try {
              const normalizedRows = normalizeMasterRows(masterKey, rawRows, mapping);
              masterDataController.setNormalizedRows(masterKey, normalizedRows);
              masterDataController.getMasterData()[masterKey].diagnostics = [{ code: 'VALID', message: 'Auto-mapping validated and applied successfully.' }];
              stateRef.current.importMastersWriteBackStatus = `Successfully uploaded, auto-mapped, and validated ${normalizedRows.length} rows for ${masterKey}.`;
            } catch (error) {
              masterDataController.setNormalizedRows(masterKey, []);
              masterDataController.getMasterData()[masterKey].diagnostics = [{ code: 'INVALID_MAPPING', message: error instanceof Error ? error.message : String(error) }];
              stateRef.current.importMastersWriteBackStatus = `Uploaded ${rawRows.length} rows, but mapping validation failed for ${masterKey}: ${error instanceof Error ? error.message : String(error)}`;
            }
          } else {
            masterDataController.setNormalizedRows(masterKey, []);
            stateRef.current.importMastersWriteBackStatus = `Uploaded ${rawRows.length} rows for ${masterKey}; no authoritative field mapping was found.`;
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
