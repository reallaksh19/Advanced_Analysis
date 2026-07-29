import {
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  LINEAR_FEA_MATERIAL_TABLE_SCHEMA,
  sealMaterialTable,
} from '../src/core/linear-fea-material/index.js';

const clone = structuredClone;

const RAW_TABLE = {
  schema: LINEAR_FEA_MATERIAL_TABLE_SCHEMA,
  materialId: 'ASTM A106 Gr. B',
  sourceEvidence: {
    sourceId: 'PROJECT/MATERIAL-DB',
    sourceRevision: 'Rev 4',
    sourceSemanticHash: 'fnv1a64:0123456789abcdef',
  },
  points: [
    {
      absoluteTemperature: 350,
      elasticModulus: 2.10e11,
      shearModulus: 8.10e10,
      poissonRatio: 0.28,
      massDensity: 7860,
      thermalExpansionCoefficient: 1.10e-5,
    },
    {
      absoluteTemperature: 400,
      elasticModulus: 2.00e11,
      shearModulus: 7.50e10,
      poissonRatio: 0.30,
      massDensity: 7850,
      thermalExpansionCoefficient: 1.20e-5,
    },
    {
      absoluteTemperature: 450,
      elasticModulus: 1.80e11,
      shearModulus: 6.80e10,
      poissonRatio: 0.32,
      massDensity: 7830,
      thermalExpansionCoefficient: 1.35e-5,
    },
  ],
  semanticHash: '',
};

export const MATERIAL_TABLE = sealMaterialTable(RAW_TABLE);
export const MATERIAL_PROFILE = LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE;

export function materialTable(overrides = {}) {
  const table = clone(MATERIAL_TABLE);
  Object.assign(table, overrides);
  return table;
}

export function materialRequest(overrides = {}) {
  return {
    materialStateId: 'MAT-A106B-425K',
    materialId: 'ASTM A106 Gr. B',
    evaluationTemperature: 425,
    ...overrides,
  };
}

export function reversedMaterialTable() {
  const table = clone(MATERIAL_TABLE);
  table.points.reverse();
  table.semanticHash = '';
  return sealMaterialTable(table);
}

export const EXPECTED_MIDPOINT = Object.freeze({
  elasticModulus: 1.90e11,
  shearModulus: 7.15e10,
  poissonRatio: 0.31,
  massDensity: 7840,
  thermalExpansionCoefficient: 1.275e-5,
});
