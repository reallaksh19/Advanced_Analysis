import { prepareXmlCiiMasterContext as prepareCoreMasterContext } from './core/master-context.js';

export const STANDALONE_IMPORT_MASTER_DEFS = Object.freeze([
  { key: 'lineList', label: 'Line List Master', description: 'Line ID, P1, T1, T2, Phase, Fluid Density mapping.' },
  { key: 'pipingClass', label: 'Piping Class Master', description: 'Bore, Rating, Schedule, Material Specification lookup.' },
  { key: 'weight', label: 'Weight Master', description: 'Valve, Flange, Component dry & wet weight database.' },
  { key: 'material', label: 'Material Map Master', description: 'PCF Material code to ASTM description cross-reference.' }
]);

export async function prepareStandaloneImportMasters(options = {}) {
  return prepareCoreMasterContext(options);
}

export function summarizeStandaloneImportMasters(masterContext) {
  if (!masterContext) return STANDALONE_IMPORT_MASTER_DEFS.map(d => ({ ...d, rowCount: 0, previewRows: [], diagnostics: [] }));

  return [
    {
      ...STANDALONE_IMPORT_MASTER_DEFS[0],
      rowCount: masterContext.lineRows?.length || 0,
      previewRows: (masterContext.lineRows || []).slice(0, 50),
      diagnostics: []
    },
    {
      ...STANDALONE_IMPORT_MASTER_DEFS[1],
      rowCount: masterContext.pipingClassRows?.length || 0,
      previewRows: (masterContext.pipingClassRows || []).slice(0, 50),
      diagnostics: []
    },
    {
      ...STANDALONE_IMPORT_MASTER_DEFS[2],
      rowCount: masterContext.weightMasterRows?.length || 0,
      previewRows: (masterContext.weightMasterRows || []).slice(0, 50),
      diagnostics: []
    },
    {
      ...STANDALONE_IMPORT_MASTER_DEFS[3],
      rowCount: masterContext.materialMapRows?.length || 0,
      previewRows: (masterContext.materialMapRows || []).slice(0, 50),
      diagnostics: []
    }
  ];
}
