import { prepareXmlCiiMasterContext } from '../calc-workspace/cii-standalone-port/core/master-context.js';
import { WorkspaceState } from './workspace-state.js';
import { getStoredJson, setStoredJson, saveMasterContextToLocalStorage, loadMasterContextFromLocalStorage } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-state.js';

/**
 * Adapter bridging the isolated CII Standalone masters configuration
 * with the central WorkspaceState.
 */
export const MasterDataStandaloneAdapter = {
  // We use the same storage keys as the standalone package to sync data between the environments
  async loadStandaloneMasterContext() {
    let context = loadMasterContextFromLocalStorage();
    if (!context) {
      context = await prepareXmlCiiMasterContext();
      saveMasterContextToLocalStorage(context);
    }
    return context;
  },

  async loadTestMasterFiles() {
    // Dynamically import the parser to avoid circular deps if any
    const { parseMasterFile, autoMapMasterColumns } = await import('./master-data-events-handler.js');
    const { applyStandaloneImportMastersContext } = await import('../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-state.js');

    const files = [
      { key: 'lineList', path: '/fixtures/AML-91-PDFEED-PX-2345-00001-0000 BC4.xlsx' },
      { key: 'pipingClass', path: '/fixtures/Piping class master.xlsx' },
      { key: 'weight', path: '/fixtures/wtValveweights.xlsx' },
      { key: 'materialMap', path: '/fixtures/PCF_MAT_MAP.TXT' }
    ];

    let context = loadMasterContextFromLocalStorage() || await prepareXmlCiiMasterContext();
    
    for (const f of files) {
      try {
        const res = await fetch(f.path);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const buffer = await res.arrayBuffer();
        const fileName = f.path.split('/').pop();
        
        const { rawRows, sheetName } = await parseMasterFile(buffer, fileName, f.key);
        
        if (rawRows && rawRows.length > 0) {
          context = applyStandaloneImportMastersContext(context, f.key, rawRows, fileName, sheetName);
          // Also try to auto-map columns for convenience
          const fieldMap = autoMapMasterColumns(rawRows, f.key);
          if (fieldMap) {
            context.config = context.config || {};
            context.config[f.key === 'lineList' ? 'linelist' : f.key] = context.config[f.key === 'lineList' ? 'linelist' : f.key] || {};
            context.config[f.key === 'lineList' ? 'linelist' : f.key].fieldMap = fieldMap;
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch test master ${f.path}:`, err);
      }
    }
    
    saveMasterContextToLocalStorage(context);
    return context;
  },

  saveStandaloneMasterContext(context) {
    saveMasterContextToLocalStorage(context);
  },

  applyMasterContextToWorkspace(context) {
    if (!context) return { ok: false, error: 'No master context loaded' };
    
    // Convert context into the structure expected by MasterDataStore / Workspace overrides
    const overrides = {
      lineList: context.lineRows || [],
      pipingClasses: context.pipingClassRows || [],
      weightMaster: context.weightMasterRows || [],
      materialMap: context.materialMapRows || [],
      config: context.config || {}
    };

    const snapshot = WorkspaceState.getSnapshot();
    if (snapshot.status !== 'ready' || !snapshot.dataset) {
      return { ok: false, error: 'Workspace dataset is not ready.' };
    }

    // Instead of doing one-off Pipe mutations here, we inject the loaded context 
    // into the active dataset properties so the calculation pipeline has access to it.
    const newDataset = JSON.parse(JSON.stringify(snapshot.dataset));
    newDataset.properties = newDataset.properties || {};
    newDataset.properties.masterDataConfig = overrides;

    WorkspaceState.loadDataset(newDataset);
    
    return { ok: true, matchCount: overrides.lineList.length };
  }
};
