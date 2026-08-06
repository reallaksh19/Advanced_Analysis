import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';

export const INPUTXML_THERMAL_EXPANSION_AUTHORITY_SCHEMA =
  'fea-inputxml-thermal-expansion-authority/v1';

export const INPUTXML_THERMAL_EXPANSION_COEFFICIENT_BY_MATERIAL = Object.freeze({
  106: 1.17e-5,
  360: 1.17e-5,
});

const AUTHORITY_BY_MATERIAL = Object.freeze({
  106: Object.freeze({
    materialLabel: 'A106 Grade B',
    sourceId: 'PROJECT_BENCHMARK_MATERIAL_AUTHORITY_106',
    sourceRevision: 'LFEA_INPUTXML_THERMAL_R1',
  }),
  360: Object.freeze({
    materialLabel: 'A334 Grade 6',
    sourceId: 'PROJECT_BENCHMARK_MATERIAL_AUTHORITY_360',
    sourceRevision: 'LFEA_INPUTXML_THERMAL_R1',
  }),
});

export function resolveInputXmlThermalExpansionAuthority(materialNumber) {
  const normalizedMaterialNumber = normalizeMaterialNumber(materialNumber);
  const coefficient = normalizedMaterialNumber === null
    ? null
    : INPUTXML_THERMAL_EXPANSION_COEFFICIENT_BY_MATERIAL[normalizedMaterialNumber] ?? null;
  const authority = normalizedMaterialNumber === null
    ? null
    : AUTHORITY_BY_MATERIAL[normalizedMaterialNumber] ?? null;
  const payload = {
    schema: INPUTXML_THERMAL_EXPANSION_AUTHORITY_SCHEMA,
    materialNumber: normalizedMaterialNumber,
    materialLabel: authority?.materialLabel ?? null,
    status: coefficient === null ? 'UNRESOLVED' : 'RESOLVED',
    coefficientPerKelvin: coefficient,
    sourceEvidence: authority === null ? null : {
      sourceId: authority.sourceId,
      sourceRevision: authority.sourceRevision,
      sourceSemanticHash: semanticHash({
        materialNumber: normalizedMaterialNumber,
        coefficientPerKelvin: coefficient,
        sourceId: authority.sourceId,
        sourceRevision: authority.sourceRevision,
      }),
    },
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function normalizeMaterialNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Math.abs(numeric - Math.round(numeric)) > 1e-9) return null;
  return String(Math.round(numeric));
}
