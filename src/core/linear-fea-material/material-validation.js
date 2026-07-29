import { requireCanonicalNodeId } from '../linear-fea-contract/identifiers.js';
import { normalizeLinearFeaNumber } from '../linear-fea-contract/conventions.js';
import { RECORD_KEYS } from '../linear-fea-contract/model-schema.js';
import { DIAGNOSTIC_SEVERITIES } from '../linear-fea-contract/model-diagnostics.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import {
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE_SCHEMA,
  LINEAR_FEA_MATERIAL_RESOLUTION_SCHEMA,
  LINEAR_FEA_MATERIAL_TABLE_SCHEMA,
  LINEAR_MATERIAL_EXACT_MATCH_RULE,
  LINEAR_MATERIAL_EXTRAPOLATION_RULE,
  LINEAR_MATERIAL_INTERPOLATION_RULE,
  MATERIAL_POINT_KEYS,
  MATERIAL_PROFILE_KEYS,
  MATERIAL_REQUEST_KEYS,
  MATERIAL_RESOLUTION_KEYS,
  MATERIAL_RESULT_KEYS,
  MATERIAL_SOURCE_EVIDENCE_KEYS,
  MATERIAL_TABLE_KEYS,
  LinearFeaMaterialError,
} from './material-contract.js';
import {
  canonicalizeMaterialDiagnostics,
  canonicalizeMaterialPoints,
  canonicalizeMaterialSourceEvidence,
  canonicalizeMaterialTable,
} from './material-canonicalization.js';

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

function fail(message, code) {
  throw new LinearFeaMaterialError(message, code);
}

function requireRecord(value, field, code) {
  if (!isPlainRecord(value)) fail(`${field} must be a record.`, code);
  return value;
}

function requireExactKeys(value, expected, field, code) {
  requireRecord(value, field, code);
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) fail(`${field} is missing ${key}.`, code);
  }
  for (const key of Object.keys(value)) {
    if (!expected.includes(key)) fail(`${field} contains unexpected field ${key}.`, code);
  }
}

function requireArray(value, field, code) {
  if (!Array.isArray(value)) fail(`${field} must be an array.`, code);
  return value;
}

function requireString(value, field, code) {
  if (typeof value !== 'string' || value.trim().length === 0 || value === 'UNKNOWN') {
    fail(`${field} must be a resolved nonempty source string.`, code);
  }
  return value;
}

function requireIdentity(value, field, code) {
  try {
    return requireCanonicalNodeId(value);
  } catch {
    fail(`${field} must be a canonical kernel identity.`, code);
  }
}

function requireHash(value, field, code, allowBlank = false) {
  if (allowBlank && value === '') return value;
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    fail(`${field} must be a canonical semantic hash.`, code);
  }
  return value;
}

function finite(value, field, code) {
  try {
    return normalizeLinearFeaNumber(value);
  } catch {
    fail(`${field} must be finite.`, code);
  }
}

function positive(value, field, code) {
  const number = finite(value, field, code);
  if (!(number > 0)) fail(`${field} must be greater than zero.`, code);
  return number;
}

function validateSourceEvidence(value, field, code) {
  requireExactKeys(value, MATERIAL_SOURCE_EVIDENCE_KEYS, field, code);
  requireString(value.sourceId, `${field}.sourceId`, code);
  requireString(value.sourceRevision, `${field}.sourceRevision`, code);
  requireHash(value.sourceSemanticHash, `${field}.sourceSemanticHash`, code);
}

function validatePoint(point, field) {
  requireExactKeys(point, MATERIAL_POINT_KEYS, field, 'MATERIAL_TABLE_INVALID');
  positive(point.absoluteTemperature, `${field}.absoluteTemperature`, 'MATERIAL_TABLE_INVALID');
  positive(point.elasticModulus, `${field}.elasticModulus`, 'MATERIAL_TABLE_INVALID');
  positive(point.shearModulus, `${field}.shearModulus`, 'MATERIAL_TABLE_INVALID');
  const poisson = finite(point.poissonRatio, `${field}.poissonRatio`, 'MATERIAL_TABLE_INVALID');
  if (!(poisson > -1 && poisson < 0.5)) {
    fail(`${field}.poissonRatio is out of range.`, 'MATERIAL_TABLE_INVALID');
  }
  positive(point.massDensity, `${field}.massDensity`, 'MATERIAL_TABLE_INVALID');
  finite(
    point.thermalExpansionCoefficient,
    `${field}.thermalExpansionCoefficient`,
    'MATERIAL_TABLE_INVALID',
  );
}

function validateTableCore(table, allowBlankHash) {
  requireExactKeys(table, MATERIAL_TABLE_KEYS, 'materialTable', 'MATERIAL_TABLE_INVALID');
  if (table.schema !== LINEAR_FEA_MATERIAL_TABLE_SCHEMA) {
    fail('materialTable.schema is unsupported.', 'MATERIAL_TABLE_INVALID');
  }
  requireString(table.materialId, 'materialTable.materialId', 'MATERIAL_TABLE_INVALID');
  validateSourceEvidence(
    table.sourceEvidence,
    'materialTable.sourceEvidence',
    'MATERIAL_TABLE_INVALID',
  );
  requireArray(table.points, 'materialTable.points', 'MATERIAL_TABLE_INVALID');
  if (table.points.length === 0) {
    fail('materialTable.points must contain at least one point.', 'MATERIAL_TABLE_INVALID');
  }
  const temperatures = new Set();
  table.points.forEach((point, index) => {
    validatePoint(point, `materialTable.points[${index}]`);
    const temperature = normalizeLinearFeaNumber(point.absoluteTemperature);
    if (temperatures.has(temperature)) {
      fail(
        `materialTable.points contains duplicate temperature ${temperature}.`,
        'MATERIAL_TABLE_DUPLICATE_TEMPERATURE',
      );
    }
    temperatures.add(temperature);
  });
  requireHash(
    table.semanticHash,
    'materialTable.semanticHash',
    'MATERIAL_TABLE_INVALID',
    allowBlankHash,
  );
}

export function materialTableSemanticProjection(table) {
  const canonical = canonicalizeMaterialTable(table);
  return {
    schema: canonical.schema,
    materialId: canonical.materialId,
    sourceEvidence: canonical.sourceEvidence,
    points: canonical.points,
  };
}

export function computeMaterialTableSemanticHash(table) {
  return semanticHash(materialTableSemanticProjection(table));
}

export function requireMaterialTable(table) {
  validateTableCore(table, false);
  if (table.semanticHash !== computeMaterialTableSemanticHash(table)) {
    fail('materialTable.semanticHash is stale.', 'MATERIAL_HASH_MISMATCH');
  }
  return deepFreeze(canonicalizeMaterialTable(table));
}

export function sealMaterialTable(table) {
  validateTableCore(table, true);
  const candidate = canonicalizeMaterialTable(table);
  candidate.semanticHash = computeMaterialTableSemanticHash(candidate);
  return requireMaterialTable(candidate);
}

function validateProfileCore(profile, allowBlankHash) {
  requireExactKeys(profile, MATERIAL_PROFILE_KEYS, 'profile', 'MATERIAL_PROFILE_INVALID');
  if (profile.schema !== LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE_SCHEMA) {
    fail('profile.schema is unsupported.', 'MATERIAL_PROFILE_INVALID');
  }
  requireIdentity(profile.profileId, 'profile.profileId', 'MATERIAL_PROFILE_INVALID');
  if (profile.interpolationRule !== LINEAR_MATERIAL_INTERPOLATION_RULE
    || profile.exactMatchRule !== LINEAR_MATERIAL_EXACT_MATCH_RULE
    || profile.extrapolationRule !== LINEAR_MATERIAL_EXTRAPOLATION_RULE) {
    fail('profile contains unsupported resolution rules.', 'MATERIAL_PROFILE_INVALID');
  }
  requireHash(
    profile.semanticHash,
    'profile.semanticHash',
    'MATERIAL_PROFILE_INVALID',
    allowBlankHash,
  );
}

export function materialProfileSemanticProjection(profile) {
  return {
    schema: profile.schema,
    profileId: profile.profileId,
    interpolationRule: profile.interpolationRule,
    exactMatchRule: profile.exactMatchRule,
    extrapolationRule: profile.extrapolationRule,
  };
}

export function computeMaterialProfileSemanticHash(profile) {
  return semanticHash(materialProfileSemanticProjection(profile));
}

export function requireMaterialResolutionProfile(profile) {
  validateProfileCore(profile, false);
  if (profile.semanticHash !== computeMaterialProfileSemanticHash(profile)) {
    fail('profile.semanticHash is stale.', 'MATERIAL_HASH_MISMATCH');
  }
  return deepFreeze({ ...profile });
}

export function sealMaterialResolutionProfile(profile) {
  validateProfileCore(profile, true);
  const candidate = {
    ...profile,
    semanticHash: computeMaterialProfileSemanticHash(profile),
  };
  return requireMaterialResolutionProfile(candidate);
}

export function requireMaterialResolutionRequest(request) {
  requireExactKeys(request, MATERIAL_REQUEST_KEYS, 'request', 'MATERIAL_REQUEST_INVALID');
  requireIdentity(request.materialStateId, 'request.materialStateId', 'MATERIAL_REQUEST_INVALID');
  requireString(request.materialId, 'request.materialId', 'MATERIAL_REQUEST_INVALID');
  positive(
    request.evaluationTemperature,
    'request.evaluationTemperature',
    'MATERIAL_REQUEST_INVALID',
  );
  return {
    materialStateId: request.materialStateId,
    materialId: request.materialId,
    evaluationTemperature: normalizeLinearFeaNumber(request.evaluationTemperature),
  };
}

export function requireResolvedMaterialState(state) {
  requireExactKeys(state, RECORD_KEYS.materialState, 'materialState', 'MATERIAL_RESOLVED_VALUE_INVALID');
  requireIdentity(state.materialStateId, 'materialState.materialStateId', 'MATERIAL_RESOLVED_VALUE_INVALID');
  requireString(state.materialId, 'materialState.materialId', 'MATERIAL_RESOLVED_VALUE_INVALID');
  positive(state.elasticModulus, 'materialState.elasticModulus', 'MATERIAL_RESOLVED_VALUE_INVALID');
  positive(state.shearModulus, 'materialState.shearModulus', 'MATERIAL_RESOLVED_VALUE_INVALID');
  const poisson = finite(state.poissonRatio, 'materialState.poissonRatio', 'MATERIAL_RESOLVED_VALUE_INVALID');
  if (!(poisson > -1 && poisson < 0.5)) {
    fail('materialState.poissonRatio is out of range.', 'MATERIAL_RESOLVED_VALUE_INVALID');
  }
  positive(state.massDensity, 'materialState.massDensity', 'MATERIAL_RESOLVED_VALUE_INVALID');
  finite(
    state.thermalExpansionCoefficient,
    'materialState.thermalExpansionCoefficient',
    'MATERIAL_RESOLVED_VALUE_INVALID',
  );
  positive(
    state.evaluationTemperature,
    'materialState.evaluationTemperature',
    'MATERIAL_RESOLVED_VALUE_INVALID',
  );
  requireArray(state.sourceEvidence, 'materialState.sourceEvidence', 'MATERIAL_RESOLVED_VALUE_INVALID');
  if (state.sourceEvidence.length !== 1) {
    fail('materialState.sourceEvidence must retain exactly one table source.', 'MATERIAL_RESOLVED_VALUE_INVALID');
  }
  validateSourceEvidence(
    state.sourceEvidence[0],
    'materialState.sourceEvidence[0]',
    'MATERIAL_RESOLVED_VALUE_INVALID',
  );
  return state;
}

function validateResolutionEvidence(resolution, field) {
  requireExactKeys(resolution, MATERIAL_RESOLUTION_KEYS, field, 'MATERIAL_REQUEST_INVALID');
  if (!['EXACT_TABLE_POINT', 'LINEAR_INTERPOLATION'].includes(resolution.method)) {
    fail(`${field}.method is unsupported.`, 'MATERIAL_REQUEST_INVALID');
  }
  positive(resolution.lowerTemperature, `${field}.lowerTemperature`, 'MATERIAL_REQUEST_INVALID');
  positive(resolution.upperTemperature, `${field}.upperTemperature`, 'MATERIAL_REQUEST_INVALID');
  const factor = finite(
    resolution.interpolationFactor,
    `${field}.interpolationFactor`,
    'MATERIAL_REQUEST_INVALID',
  );
  if (resolution.method === 'EXACT_TABLE_POINT') {
    if (resolution.lowerTemperature !== resolution.upperTemperature || factor !== 0) {
      fail(`${field} exact-point evidence is inconsistent.`, 'MATERIAL_REQUEST_INVALID');
    }
  } else if (!(resolution.lowerTemperature < resolution.upperTemperature)
    || !(factor > 0 && factor < 1)) {
    fail(`${field} interpolation evidence is inconsistent.`, 'MATERIAL_REQUEST_INVALID');
  }
}

function validateDiagnostics(diagnostics) {
  requireArray(diagnostics, 'diagnostics', 'MATERIAL_REQUEST_INVALID');
  diagnostics.forEach((diagnostic, index) => {
    const field = `diagnostics[${index}]`;
    requireExactKeys(diagnostic, RECORD_KEYS.diagnostic, field, 'MATERIAL_REQUEST_INVALID');
    if (!DIAGNOSTIC_SEVERITIES.includes(diagnostic.severity)) {
      fail(`${field}.severity is unsupported.`, 'MATERIAL_REQUEST_INVALID');
    }
    requireIdentity(diagnostic.code, `${field}.code`, 'MATERIAL_REQUEST_INVALID');
    requireIdentity(diagnostic.entityType, `${field}.entityType`, 'MATERIAL_REQUEST_INVALID');
    requireIdentity(diagnostic.entityId, `${field}.entityId`, 'MATERIAL_REQUEST_INVALID');
    requireString(diagnostic.message, `${field}.message`, 'MATERIAL_REQUEST_INVALID');
    requireArray(diagnostic.evidence, `${field}.evidence`, 'MATERIAL_REQUEST_INVALID');
    diagnostic.evidence.forEach((entry, evidenceIndex) => {
      requireExactKeys(
        entry,
        RECORD_KEYS.diagnosticEvidence,
        `${field}.evidence[${evidenceIndex}]`,
        'MATERIAL_REQUEST_INVALID',
      );
      requireIdentity(entry.evidenceId, `${field}.evidence[${evidenceIndex}].evidenceId`, 'MATERIAL_REQUEST_INVALID');
      requireString(entry.sourceId, `${field}.evidence[${evidenceIndex}].sourceId`, 'MATERIAL_REQUEST_INVALID');
      requireString(entry.sourceRevision, `${field}.evidence[${evidenceIndex}].sourceRevision`, 'MATERIAL_REQUEST_INVALID');
      requireHash(entry.sourceSemanticHash, `${field}.evidence[${evidenceIndex}].sourceSemanticHash`, 'MATERIAL_REQUEST_INVALID');
    });
    requireArray(
      diagnostic.qualificationEvidenceIds,
      `${field}.qualificationEvidenceIds`,
      'MATERIAL_REQUEST_INVALID',
    );
    diagnostic.qualificationEvidenceIds.forEach((identity, identityIndex) => {
      requireIdentity(
        identity,
        `${field}.qualificationEvidenceIds[${identityIndex}]`,
        'MATERIAL_REQUEST_INVALID',
      );
    });
  });
}

export function materialResolutionSemanticProjection(result) {
  return {
    schema: result.schema,
    profileId: result.profileId,
    profileSemanticHash: result.profileSemanticHash,
    tableSemanticHash: result.tableSemanticHash,
    request: result.request,
    resolution: result.resolution,
    materialState: result.materialState,
  };
}

export function computeMaterialResolutionSemanticHash(result) {
  return semanticHash(materialResolutionSemanticProjection(result));
}

export function materialResolutionEvidenceProjection(result) {
  return {
    semanticHash: result.semanticHash,
    diagnostics: canonicalizeMaterialDiagnostics(result.diagnostics),
  };
}

export function computeMaterialResolutionEvidenceHash(result) {
  return semanticHash(materialResolutionEvidenceProjection(result));
}

export function requireMaterialResolutionResult(result) {
  requireExactKeys(result, MATERIAL_RESULT_KEYS, 'result', 'MATERIAL_REQUEST_INVALID');
  if (result.schema !== LINEAR_FEA_MATERIAL_RESOLUTION_SCHEMA) {
    fail('result.schema is unsupported.', 'MATERIAL_REQUEST_INVALID');
  }
  requireIdentity(result.profileId, 'result.profileId', 'MATERIAL_REQUEST_INVALID');
  requireHash(result.profileSemanticHash, 'result.profileSemanticHash', 'MATERIAL_REQUEST_INVALID');
  requireHash(result.tableSemanticHash, 'result.tableSemanticHash', 'MATERIAL_REQUEST_INVALID');
  const request = requireMaterialResolutionRequest(result.request);
  validateResolutionEvidence(result.resolution, 'result.resolution');
  requireResolvedMaterialState(result.materialState);
  if (result.materialState.materialStateId !== request.materialStateId
    || result.materialState.materialId !== request.materialId
    || result.materialState.evaluationTemperature !== request.evaluationTemperature) {
    fail('result material state does not match the request.', 'MATERIAL_RESOLVED_VALUE_INVALID');
  }
  validateDiagnostics(result.diagnostics);
  requireHash(result.semanticHash, 'result.semanticHash', 'MATERIAL_REQUEST_INVALID');
  requireHash(result.evidenceHash, 'result.evidenceHash', 'MATERIAL_REQUEST_INVALID');
  if (result.semanticHash !== computeMaterialResolutionSemanticHash(result)
    || result.evidenceHash !== computeMaterialResolutionEvidenceHash(result)) {
    fail('material resolution hashes are stale.', 'MATERIAL_HASH_MISMATCH');
  }
  return deepFreeze({
    ...result,
    request: { ...result.request },
    resolution: { ...result.resolution },
    materialState: {
      ...result.materialState,
      sourceEvidence: result.materialState.sourceEvidence.map((entry) => ({ ...entry })),
    },
    diagnostics: canonicalizeMaterialDiagnostics(result.diagnostics),
  });
}

export function canonicalMaterialTablePoints(table) {
  validateTableCore(table, true);
  return canonicalizeMaterialPoints(table.points);
}

export function canonicalMaterialSourceEvidence(table) {
  validateSourceEvidence(table.sourceEvidence, 'materialTable.sourceEvidence', 'MATERIAL_TABLE_INVALID');
  return canonicalizeMaterialSourceEvidence(table.sourceEvidence);
}
