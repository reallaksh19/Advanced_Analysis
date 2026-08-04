import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import {
  STAGEDJSON_PROCESS_INHERITANCE_POLICY,
  STAGEDJSON_TEMPERATURE_ROLES,
  ascii,
  exactKeys,
  fail,
  hash,
  normalizeDatasetRef,
  normalizeDiagnostics,
  normalizeFiniteNumber,
  normalizeNonNegativeNumber,
  normalizeScope,
  normalizeStagedJsonResolvedField,
  normalizeText,
  stagedJsonFieldEvidenceProjection,
  stagedJsonFieldSemanticProjection,
  text,
} from './stagedjson-resolution-common.js';

export const STAGEDJSON_PROCESS_AUTHORITY_SCHEMA = 'stagedjson-process-authority/v1';
export const STAGEDJSON_PROCESS_FIELD_KEYS = deepFreeze([
  'designPressure',
  'operatingAnalysisPressure',
  'hydrotestPressure',
  'referenceTemperature',
  'operatingTemperature',
  'designTemperature',
  'operatingFluidDensity',
  'hydrotestFluidDensity',
  'insulationThickness',
  'insulationDensity',
  'materialDensity',
  'corrosionAllowance',
  'fluidPhase',
  'fluidService',
]);

const TOP_KEYS = [
  'schema',
  'processAuthorityId',
  'datasetRef',
  'scope',
  'inheritancePolicy',
  'temperatureRoles',
  'fields',
  'diagnostics',
  'semanticHash',
  'evidenceHash',
];
const TEMPERATURE_ROLE_KEYS = [...STAGEDJSON_TEMPERATURE_ROLES];
const TEMPERATURE_ROLE_FIELDS = deepFreeze({
  REFERENCE: 'referenceTemperature',
  OPERATING: 'operatingTemperature',
  DESIGN: 'designTemperature',
});
const FIELD_RULES = deepFreeze({
  designPressure: { units: ['MPa', 'Pa'], normalizeValue: normalizeNonNegativeNumber },
  operatingAnalysisPressure: { units: ['MPa', 'Pa'], normalizeValue: normalizeNonNegativeNumber },
  hydrotestPressure: { units: ['MPa', 'Pa', 'UNDECLARED'], normalizeValue: normalizeNonNegativeNumber },
  referenceTemperature: { units: ['degC', 'K'], normalizeValue: normalizeFiniteNumber },
  operatingTemperature: { units: ['degC', 'K'], normalizeValue: normalizeFiniteNumber },
  designTemperature: { units: ['degC', 'K'], normalizeValue: normalizeFiniteNumber },
  operatingFluidDensity: { units: ['kg/m3'], normalizeValue: normalizeNonNegativeNumber },
  hydrotestFluidDensity: { units: ['kg/m3'], normalizeValue: normalizeNonNegativeNumber },
  insulationThickness: { units: ['mm', 'm'], normalizeValue: normalizeNonNegativeNumber },
  insulationDensity: { units: ['kg/m3'], normalizeValue: normalizeNonNegativeNumber },
  materialDensity: { units: ['kg/m3'], normalizeValue: normalizeNonNegativeNumber },
  corrosionAllowance: { units: ['mm', 'm'], normalizeValue: normalizeNonNegativeNumber },
  fluidPhase: { units: ['NONE'], normalizeValue: normalizeText },
  fluidService: { units: ['NONE'], normalizeValue: normalizeText },
});

export function sealStagedJsonProcessAuthority(input, { dataset }) {
  const draft = normalizeProcessAuthority(input, dataset, false);
  draft.semanticHash = computeStagedJsonProcessAuthoritySemanticHash(draft);
  draft.evidenceHash = computeStagedJsonProcessAuthorityEvidenceHash(draft);
  return deepFreeze(draft);
}

export function requireStagedJsonProcessAuthority(value, { dataset }) {
  const accepted = normalizeProcessAuthority(value, dataset, true);
  if (accepted.semanticHash !== computeStagedJsonProcessAuthoritySemanticHash(accepted)) {
    fail('STAGEDJSON_PROCESS_AUTHORITY_SEMANTIC_HASH_MISMATCH', 'Process authority semantic hash mismatch.');
  }
  if (accepted.evidenceHash !== computeStagedJsonProcessAuthorityEvidenceHash(accepted)) {
    fail('STAGEDJSON_PROCESS_AUTHORITY_EVIDENCE_HASH_MISMATCH', 'Process authority evidence hash mismatch.');
  }
  return deepFreeze(accepted);
}

export function stagedJsonProcessAuthoritySemanticProjection(value) {
  return {
    schema: value.schema,
    processAuthorityId: value.processAuthorityId,
    datasetRef: value.datasetRef,
    scope: value.scope,
    inheritancePolicy: value.inheritancePolicy,
    temperatureRoles: value.temperatureRoles,
    fields: Object.fromEntries(STAGEDJSON_PROCESS_FIELD_KEYS.map((field) => [
      field,
      stagedJsonFieldSemanticProjection(value.fields[field]),
    ])),
  };
}

export function stagedJsonProcessAuthorityEvidenceProjection(value) {
  return {
    semanticHash: value.semanticHash,
    fields: Object.fromEntries(STAGEDJSON_PROCESS_FIELD_KEYS.map((field) => [
      field,
      stagedJsonFieldEvidenceProjection(value.fields[field]),
    ])),
    diagnostics: value.diagnostics,
  };
}

export function computeStagedJsonProcessAuthoritySemanticHash(value) {
  return semanticHash(stagedJsonProcessAuthoritySemanticProjection(value));
}

export function computeStagedJsonProcessAuthorityEvidenceHash(value) {
  return semanticHash(stagedJsonProcessAuthorityEvidenceProjection(value));
}

function normalizeProcessAuthority(input, dataset, sealed) {
  exactKeys(input, sealed ? TOP_KEYS : TOP_KEYS.filter((key) => !['semanticHash', 'evidenceHash'].includes(key)), 'processAuthority');
  if (input.schema !== STAGEDJSON_PROCESS_AUTHORITY_SCHEMA) {
    fail('STAGEDJSON_PROCESS_AUTHORITY_SCHEMA_INVALID', `Expected ${STAGEDJSON_PROCESS_AUTHORITY_SCHEMA}.`);
  }
  const processAuthorityId = text(input.processAuthorityId, 'processAuthority.processAuthorityId');
  const datasetRef = normalizeDatasetRef(input.datasetRef, dataset, 'processAuthority.datasetRef');
  const scope = normalizeScope(input.scope, dataset, { entityRequired: true, path: 'processAuthority.scope' });
  if (input.inheritancePolicy !== STAGEDJSON_PROCESS_INHERITANCE_POLICY) {
    fail(
      'STAGEDJSON_PROCESS_AUTHORITY_INHERITANCE_POLICY_INVALID',
      `Process authority must declare ${STAGEDJSON_PROCESS_INHERITANCE_POLICY}.`,
    );
  }
  const temperatureRoles = normalizeTemperatureRoles(input.temperatureRoles);
  exactKeys(input.fields, STAGEDJSON_PROCESS_FIELD_KEYS, 'processAuthority.fields');
  const fields = Object.fromEntries(STAGEDJSON_PROCESS_FIELD_KEYS.map((field) => {
    const rule = FIELD_RULES[field];
    return [field, normalizeStagedJsonResolvedField(input.fields[field], {
      path: `processAuthority.fields.${field}`,
      allowedUnits: rule.units,
      allowInherited: false,
      expectedSourceEntityId: scope.entityId,
      normalizeValue: rule.normalizeValue,
    })];
  }));
  const diagnostics = normalizeDiagnostics(input.diagnostics, 'processAuthority.diagnostics');
  return {
    schema: input.schema,
    processAuthorityId,
    datasetRef,
    scope,
    inheritancePolicy: input.inheritancePolicy,
    temperatureRoles,
    fields,
    diagnostics,
    semanticHash: sealed ? hash(input.semanticHash, 'processAuthority.semanticHash') : '',
    evidenceHash: sealed ? hash(input.evidenceHash, 'processAuthority.evidenceHash') : '',
  };
}

function normalizeTemperatureRoles(value) {
  exactKeys(value, TEMPERATURE_ROLE_KEYS, 'processAuthority.temperatureRoles');
  const result = Object.fromEntries(TEMPERATURE_ROLE_KEYS.map((role) => [
    role,
    text(value[role], `processAuthority.temperatureRoles.${role}`),
  ]));
  for (const role of TEMPERATURE_ROLE_KEYS) {
    if (result[role] !== TEMPERATURE_ROLE_FIELDS[role]) {
      fail(
        'STAGEDJSON_PROCESS_AUTHORITY_TEMPERATURE_ROLE_INVALID',
        `${role} must bind ${TEMPERATURE_ROLE_FIELDS[role]}.`,
      );
    }
  }
  const values = Object.values(result).sort(ascii);
  if (new Set(values).size !== values.length) {
    fail('STAGEDJSON_PROCESS_AUTHORITY_TEMPERATURE_ROLE_DUPLICATE', 'Temperature roles must bind distinct fields.');
  }
  return result;
}
