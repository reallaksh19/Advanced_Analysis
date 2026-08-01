import { deepFreeze, semanticHash } from './shared-piping-model/index.js';
import {
  createCanonicalLocalContinuumModel,
  validateCanonicalLocalContinuumModel,
} from './local-continuum/index.js';
import {
  createCanonicalLocalShellModel,
  validateCanonicalLocalShellModel,
} from './local-shell/index.js';
import {
  createCanonicalTrunnionFootprintModel,
  createCanonicalTrunnionFootprintSource,
  validateCanonicalTrunnionFootprintModel,
} from './local-trunnion-footprint/index.js';

export const LAFEA_ANALYTICAL_HANDOFF_SCHEMA = 'lafea-analytical-stage-handoff/v1';
export const LAFEA_ANALYTICAL_HANDOFF_TARGETS = Object.freeze([
  'LAFEA.3', 'LAFEA.4', 'LAFEA.5',
]);
export const LAFEA_ANALYTICAL_HANDOFF_LIMITATIONS = Object.freeze([
  'TARGET_SOURCE_VALIDATION_ONLY',
  'NO_TARGET_ENGINE_EXECUTION',
  'NO_FE_OR_CODE_STRESS_TRANSFER',
  'NO_LIFECYCLE_OR_RELEASE_PROMOTION',
]);

export function createValidatedLafeaAnalyticalHandoff(input) {
  const row = exactRecord(input, [
    'handoffIdentity', 'handoffVersion', 'sourceStageId', 'sourceResultHash',
    'governingRecord', 'resultant', 'targetStageId', 'targetSource',
    'targetLoadBindings', 'sourceReference', 'limitations',
  ], 'handoff');
  const sourceStageId = member(row.sourceStageId, ['LAFEA.1', 'LAFEA.2'],
    'sourceStageId');
  const targetStageId = member(row.targetStageId,
    LAFEA_ANALYTICAL_HANDOFF_TARGETS, 'targetStageId');
  const governingRecord = plainJsonRecord(row.governingRecord, 'governingRecord');
  rejectStressAuthority(governingRecord, 'governingRecord');
  const resultant = normalizeResultant(row.resultant);
  const target = canonicalTarget(targetStageId, row.targetSource);
  const targetLoadBindings = normalizeBindings(row.targetLoadBindings,
    target.loadCaseIds);
  const body = {
    schema: LAFEA_ANALYTICAL_HANDOFF_SCHEMA,
    handoffIdentity: text(row.handoffIdentity, 'handoffIdentity'),
    handoffVersion: text(row.handoffVersion, 'handoffVersion'),
    sourceStageId,
    sourceResultHash: hashText(row.sourceResultHash, 'sourceResultHash'),
    governingRecord,
    resultant,
    targetStageId,
    targetCanonicalModel: target.model,
    targetCanonicalModelHash: target.semanticHash,
    targetLoadBindings,
    sourceReference: text(row.sourceReference, 'sourceReference'),
    qualification: {
      state: 'ACCEPTED',
      targetSourceValidated: true,
      targetEngineExecuted: false,
      lifecycleRegistered: false,
      releaseQualified: false,
    },
    limitations: mergedLimitations(row.limitations),
  };
  return deepFreeze({ ...body, semanticHash: semanticHash(body) });
}

export function validateLafeaAnalyticalHandoff(input) {
  if (!isRecord(input) || input.schema !== LAFEA_ANALYTICAL_HANDOFF_SCHEMA) {
    throw handoffError('HANDOFF_SCHEMA_MISMATCH', 'schema');
  }
  const copy = structuredClone(input);
  const retained = copy.semanticHash;
  delete copy.semanticHash;
  if (retained !== semanticHash(copy)) {
    throw handoffError('HANDOFF_HASH_MISMATCH', 'semanticHash');
  }
  const target = validateCanonicalTarget(copy.targetStageId,
    copy.targetCanonicalModel);
  if (target.semanticHash !== copy.targetCanonicalModelHash) {
    throw handoffError('HANDOFF_TARGET_HASH_MISMATCH', 'targetCanonicalModelHash');
  }
  normalizeBindings(copy.targetLoadBindings, target.loadCaseIds);
  rejectStressAuthority(copy.governingRecord, 'governingRecord');
  if (copy.qualification?.targetEngineExecuted !== false
    || copy.qualification?.releaseQualified !== false) {
    throw handoffError('HANDOFF_AUTHORITY_ESCALATION', 'qualification');
  }
  return deepFreeze({ ...copy, semanticHash: retained });
}

function canonicalTarget(stageId, source) {
  if (stageId === 'LAFEA.3') {
    const model = validateCanonicalLocalContinuumModel(
      createCanonicalLocalContinuumModel(source),
    );
    return targetEvidence(model, model.loadCases.map((row) => row.loadCaseId));
  }
  if (stageId === 'LAFEA.4') {
    const model = validateCanonicalLocalShellModel(createCanonicalLocalShellModel(source));
    return targetEvidence(model, model.loadCases.map((row) => row.loadCaseId));
  }
  const canonicalSource = createCanonicalTrunnionFootprintSource(source);
  const model = validateCanonicalTrunnionFootprintModel(
    createCanonicalTrunnionFootprintModel(canonicalSource),
  );
  const ids = model.canonicalLoadCaseMappings.flatMap((mapping) => [
    mapping.workflowLoadCaseId, mapping.shellLoadCaseId,
  ]);
  return targetEvidence(model, ids);
}

function validateCanonicalTarget(stageId, model) {
  if (stageId === 'LAFEA.3') {
    const retained = validateCanonicalLocalContinuumModel(model);
    return targetEvidence(retained, retained.loadCases.map((row) => row.loadCaseId));
  }
  if (stageId === 'LAFEA.4') {
    const retained = validateCanonicalLocalShellModel(model);
    return targetEvidence(retained, retained.loadCases.map((row) => row.loadCaseId));
  }
  const retained = validateCanonicalTrunnionFootprintModel(model);
  return targetEvidence(retained, retained.canonicalLoadCaseMappings.flatMap((mapping) => [
    mapping.workflowLoadCaseId, mapping.shellLoadCaseId,
  ]));
}

function targetEvidence(model, ids) {
  const semanticHashValue = model.semanticHash;
  if (typeof semanticHashValue !== 'string' || !semanticHashValue) {
    throw handoffError('TARGET_CANONICAL_HASH_MISSING', 'targetCanonicalModel');
  }
  return {
    model,
    semanticHash: semanticHashValue,
    loadCaseIds: new Set(ids),
  };
}

function normalizeResultant(value) {
  const row = exactRecord(value, ['referencePoint', 'force', 'moment'], 'resultant');
  return {
    referencePoint: vector3(row.referencePoint, 'resultant.referencePoint'),
    force: vector3(row.force, 'resultant.force'),
    moment: vector3(row.moment, 'resultant.moment'),
  };
}

function normalizeBindings(values, targetIds) {
  if (!Array.isArray(values) || values.length === 0) {
    throw handoffError('HANDOFF_LOAD_BINDING_REQUIRED', 'targetLoadBindings');
  }
  const rows = values.map((value, index) => {
    const path = `targetLoadBindings[${index}]`;
    const row = exactRecord(value,
      ['sourceLoadIdentity', 'targetLoadCaseId', 'sourceReference'], path);
    const targetLoadCaseId = text(row.targetLoadCaseId, `${path}.targetLoadCaseId`);
    if (!targetIds.has(targetLoadCaseId)) {
      throw handoffError('HANDOFF_TARGET_LOAD_CASE_MISSING', `${path}.targetLoadCaseId`);
    }
    return {
      sourceLoadIdentity: text(row.sourceLoadIdentity, `${path}.sourceLoadIdentity`),
      targetLoadCaseId,
      sourceReference: text(row.sourceReference, `${path}.sourceReference`),
    };
  }).sort((left, right) => left.sourceLoadIdentity.localeCompare(right.sourceLoadIdentity));
  if (new Set(rows.map((row) => row.sourceLoadIdentity)).size !== rows.length) {
    throw handoffError('DUPLICATE_HANDOFF_SOURCE_LOAD', 'targetLoadBindings');
  }
  return rows;
}

function rejectStressAuthority(value, path) {
  for (const key of Object.keys(value)) {
    if (/stress|utilization|allowable|code/iu.test(key)) {
      throw handoffError('HANDOFF_STRESS_AUTHORITY_FORBIDDEN', `${path}.${key}`);
    }
  }
}

function plainJsonRecord(value, path) {
  if (!isRecord(value)) throw handoffError('HANDOFF_RECORD_REQUIRED', path);
  const copy = structuredClone(value);
  JSON.stringify(copy);
  return copy;
}

function mergedLimitations(value) {
  if (!Array.isArray(value)) throw handoffError('HANDOFF_LIMITATIONS_REQUIRED', 'limitations');
  return [...new Set([
    ...LAFEA_ANALYTICAL_HANDOFF_LIMITATIONS,
    ...value.map((row, index) => text(row, `limitations[${index}]`)),
  ])].sort();
}

function exactRecord(value, keys, path) {
  if (!isRecord(value)) throw handoffError('HANDOFF_OBJECT_REQUIRED', path);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw handoffError('HANDOFF_EXACT_KEYS_REQUIRED', path);
  }
  return value;
}

function vector3(value, path) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw handoffError('HANDOFF_VECTOR3_REQUIRED', path);
  }
  return value.map((component, index) => {
    if (typeof component !== 'number' || !Number.isFinite(component)) {
      throw handoffError('HANDOFF_FINITE_NUMBER_REQUIRED', `${path}[${index}]`);
    }
    return Object.is(component, -0) ? 0 : component;
  });
}

function member(value, allowed, path) {
  if (!allowed.includes(value)) throw handoffError('HANDOFF_ENUM_INVALID', path);
  return value;
}

function hashText(value, path) {
  const result = text(value, path);
  if (!/^(?:fnv1a64|sha256):[0-9a-f]+$/u.test(result)) {
    throw handoffError('HANDOFF_HASH_INVALID', path);
  }
  return result;
}

function text(value, path) {
  if (typeof value !== 'string' || !value.trim()) throw handoffError('HANDOFF_TEXT_REQUIRED', path);
  return value.trim();
}

function handoffError(code, path) {
  const error = new TypeError(`${code}: ${path}`);
  error.code = code;
  error.path = path;
  return error;
}

function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
