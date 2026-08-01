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

  const raw = masterContext.rawRows || {};
  return [
    {
      ...STANDALONE_IMPORT_MASTER_DEFS[0],
      rowCount: masterContext.lineRows?.length || raw.lineList?.length || 0,
      previewRows: (masterContext.lineRows?.length ? masterContext.lineRows : raw.lineList || []).slice(0, 50),
      diagnostics: masterContext.diagnostics?.lineList || [],
      sourceMetadata: masterContext.sourceMetadata?.lineList || { source: 'not-loaded', sourceType: 'empty', status: 'pending' }
    },
    {
      ...STANDALONE_IMPORT_MASTER_DEFS[1],
      rowCount: masterContext.pipingClassRows?.length || raw.pipingClass?.length || 0,
      previewRows: (masterContext.pipingClassRows?.length ? masterContext.pipingClassRows : raw.pipingClass || []).slice(0, 50),
      diagnostics: masterContext.diagnostics?.pipingClass || [],
      sourceMetadata: masterContext.sourceMetadata?.pipingClass || { source: 'not-loaded', sourceType: 'empty', status: 'pending' }
    },
    {
      ...STANDALONE_IMPORT_MASTER_DEFS[2],
      rowCount: masterContext.weightMasterRows?.length || raw.weight?.length || 0,
      previewRows: (masterContext.weightMasterRows?.length ? masterContext.weightMasterRows : raw.weight || []).slice(0, 50),
      diagnostics: masterContext.diagnostics?.weight || [],
      sourceMetadata: masterContext.sourceMetadata?.weight || { source: 'not-loaded', sourceType: 'empty', status: 'pending' }
    },
    {
      ...STANDALONE_IMPORT_MASTER_DEFS[3],
      key: 'materialMap',
      label: 'Material Map Master',
      description: 'PCF Material code to ASTM description cross-reference.',
      rowCount: masterContext.materialMapRows?.length || raw.materialMap?.length || 0,
      previewRows: (masterContext.materialMapRows?.length ? masterContext.materialMapRows : raw.materialMap || []).slice(0, 50),
      diagnostics: masterContext.diagnostics?.materialMap || [],
      sourceMetadata: masterContext.sourceMetadata?.materialMap || { source: 'not-loaded', sourceType: 'empty', status: 'pending' }
    }
  ];
}
