import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';
import { WorkspaceState } from './workspace-state.js';

import { DEFAULT_WEIGHT_MASTER_ROWS } from '../calc-workspace/cii-standalone-port/core/default-weight-master-rows.js';
import { DEFAULT_MATERIAL_MAP_ROWS } from '../calc-workspace/cii-standalone-port/core/default-material-map-rows.js';

export const MasterDataConfigV1 = {
  createDefault() {
    return {
      version: 1,
      lineList: { rawRows: [], fieldMap: {}, normalizedRows: [], diagnostics: [] },
      pipingClass: { rawRows: [], fieldMap: {}, normalizedRows: [], diagnostics: [] },
      weight: { rawRows: DEFAULT_WEIGHT_MASTER_ROWS, fieldMap: { bore: 'Bore', rating: 'Rating', length: 'Length', valveType: 'Valve Type', weight: 'Weight' }, normalizedRows: DEFAULT_WEIGHT_MASTER_ROWS, diagnostics: [{ code: 'DEFAULT', message: 'Using built-in embedded valve weight master.' }], fileName: 'Embedded App Default (wtValveweights)' },
      materialMap: { rawRows: DEFAULT_MATERIAL_MAP_ROWS, fieldMap: { code: 'code', material: 'material' }, normalizedRows: DEFAULT_MATERIAL_MAP_ROWS, diagnostics: [{ code: 'DEFAULT', message: 'Using built-in embedded material map master.' }], fileName: 'Embedded App Default (PCF_MAT_MAP)' },
      config: {}
    };
  }
};

export class MasterDataController {
  constructor(eventBus = EventBus, workspaceState = WorkspaceState) {
    this.eventBus = eventBus;
    this.workspaceState = workspaceState;
    this.masterData = this.loadPersistedState() || MasterDataConfigV1.createDefault();
  }

  loadPersistedState() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const stored = localStorage.getItem('masterDataConfigV1');
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      const def = MasterDataConfigV1.createDefault();
      
      if (parsed.lineList?.fieldMap) def.lineList.fieldMap = parsed.lineList.fieldMap;
      if (parsed.lineList?.rawRows) def.lineList.rawRows = parsed.lineList.rawRows;
      if (parsed.lineList?.normalizedRows) def.lineList.normalizedRows = parsed.lineList.normalizedRows;
      if (parsed.lineList?.fileName) def.lineList.fileName = parsed.lineList.fileName;

      if (parsed.pipingClass?.fieldMap) def.pipingClass.fieldMap = parsed.pipingClass.fieldMap;
      if (parsed.weight?.fieldMap) def.weight.fieldMap = parsed.weight.fieldMap;
      if (parsed.materialMap?.fieldMap) def.materialMap.fieldMap = parsed.materialMap.fieldMap;
      if (parsed.config) def.config = parsed.config;
      
      return def;
    } catch (e) {
      console.warn('Failed to load master data config from localStorage', e);
      return null;
    }
  }

  persistState() {
    if (typeof localStorage === 'undefined') return;
    try {
      const stateToSave = {
        version: this.masterData.version,
        lineList: {
          fieldMap: this.masterData.lineList.fieldMap,
          rawRows: this.masterData.lineList.rawRows,
          normalizedRows: this.masterData.lineList.normalizedRows,
          fileName: this.masterData.lineList.fileName
        },
        pipingClass: { fieldMap: this.masterData.pipingClass.fieldMap },
        weight: { fieldMap: this.masterData.weight.fieldMap },
        materialMap: { fieldMap: this.masterData.materialMap.fieldMap },
        config: this.masterData.config
      };
      localStorage.setItem('masterDataConfigV1', JSON.stringify(stateToSave));
    } catch (e) {
      console.warn('Failed to save master data config to localStorage', e);
    }
  }

  getMasterData() {
    return this.masterData;
  }

  setRawRows(masterKey, rawRows, fileName, sheetName) {
    if (!this.masterData[masterKey]) return;
    this.masterData[masterKey].rawRows = rawRows;
    this.masterData[masterKey].fileName = fileName;
    this.masterData[masterKey].sheetName = sheetName;
    this.persistState();
    this.eventBus.publish('MASTER_DATA_UPDATED', { masterKey, action: 'raw_upload' });
  }

  setFieldMap(masterKey, fieldMap) {
    if (!this.masterData[masterKey]) return;
    this.masterData[masterKey].fieldMap = fieldMap;
    this.persistState();
    this.eventBus.publish('MASTER_DATA_UPDATED', { masterKey, action: 'mapping_update' });
  }

  setNormalizedRows(masterKey, normalizedRows, diagnostics = []) {
    if (!this.masterData[masterKey]) return;
    this.masterData[masterKey].normalizedRows = normalizedRows;
    this.masterData[masterKey].diagnostics = diagnostics;
    this.persistState();
    this.eventBus.publish('MASTER_DATA_UPDATED', { masterKey, action: 'normalized_update' });
  }

  clear() {
    this.masterData = MasterDataConfigV1.createDefault();
    this.persistState();
    this.eventBus.publish('MASTER_DATA_CLEARED', {});
  }

  /**
   * Translates the new MasterDataConfigV1 state into the legacy masterContext
   * structure expected by the old UI components (xml-cii-adapted-import-masters).
   */
  getLegacyContext() {
    const config = {
      linelist: { fieldMap: this.masterData.lineList.fieldMap },
      pipingClass: { fieldMap: this.masterData.pipingClass.fieldMap },
      weight: { fieldMap: this.masterData.weight.fieldMap },
      material: { fieldMap: this.masterData.materialMap.fieldMap }
    };
    
    return {
      rawRows: {
        lineList: this.masterData.lineList.rawRows,
        pipingClass: this.masterData.pipingClass.rawRows,
        weight: this.masterData.weight.rawRows,
        materialMap: this.masterData.materialMap.rawRows
      },
      lineRows: this.masterData.lineList.normalizedRows,
      pipingClassRows: this.masterData.pipingClass.normalizedRows,
      weightMasterRows: this.masterData.weight.normalizedRows,
      materialMapRows: this.masterData.materialMap.normalizedRows,
      sourceMetadata: {
        lineList: { source: this.masterData.lineList.fileName || 'not-loaded', sourceType: 'file', status: this.masterData.lineList.rawRows.length ? 'loaded' : 'pending' },
        pipingClass: { source: this.masterData.pipingClass.fileName || 'not-loaded', sourceType: 'file', status: this.masterData.pipingClass.rawRows.length ? 'loaded' : 'pending' },
        weight: { source: this.masterData.weight.fileName || 'Embedded App Default (wtValveweights)', sourceType: 'default', status: 'loaded' },
        materialMap: { source: this.masterData.materialMap.fileName || 'Embedded App Default (PCF_MAT_MAP)', sourceType: 'default', status: 'loaded' }
      },
      diagnostics: {
        lineList: this.masterData.lineList.diagnostics,
        pipingClass: this.masterData.pipingClass.diagnostics,
        weight: this.masterData.weight.diagnostics,
        materialMap: this.masterData.materialMap.diagnostics
      },
      config
    };
  }
}

// Export a singleton instance for workspace consumption
export const masterDataController = new MasterDataController();
