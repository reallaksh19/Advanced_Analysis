import {
  LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  templateReleaseSha256,
} from './release-record-v2-hash.js';

export const LAFEA_TEMPLATE_CALLER_MESH_BINDING_SCHEMA =
  'lafea-template-caller-mesh-binding/v1';
export const LAFEA_TEMPLATE_CALLER_MESH_BINDING_STATUSES = Object.freeze([
  'BOUND',
  'MAPPING_EVIDENCE_PENDING',
  'STALE',
  'BLOCKED',
]);
export const LAFEA_T6_CALLER_MESH_TEMPLATE_IDS = Object.freeze([
  'C2D-BRACKET-GUSSET',
  'C2D-CLAMP-EAR',
  'C2D-LUG-PINHOLE',
  'C2D-NOZZLE-REPAD-SECTION',
  'C2D-PIPE-PAD-SECTION',
]);

const HASH = /^sha256:[0-9a-f]{64}$/u;
const ENGINEERING_HASH = /^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/u;
const TOP_KEYS = Object.freeze([
  'schema',
  'templateId',
  'templateSemanticHash',
  'compilationHash',
  'handoffHash',
  'compatibilityReceiptHash',
  'targetStageId',
  'targetCompositionRootHash',
  'sourceAuthorityHash',
  'sourceHash',
  'canonicalModelHash',
  'analysisGeometryHash',
  'meshProfileHash',
  'meshHash',
  'meshAuthorityHash',
  'qualityEvidenceHash',
  'materialRegionEvidence',
  'loadEdgeEvidence',
  'boundaryEdgeEvidence',
  'status',
  'reasons',
  'compilerGeneratedMesh',
  'productionMeshQualified',
  'engineExecutionAuthorized',
  'recoveryProduced',
  'convergenceProduced',
  'codeAssessmentProduced',
  'releaseQualified',
  'hashProfile',
  'semanticHash',
]);
const CREATE_KEYS = Object.freeze(TOP_KEYS.filter((key) =>
  !['schema', 'status', 'reasons', 'compilerGeneratedMesh',
    'productionMeshQualified', 'engineExecutionAuthorized',
    'recoveryProduced', 'convergenceProduced', 'codeAssessmentProduced',
    'releaseQualified', 'hashProfile', 'semanticHash'].includes(key)));
const MAPPING_KEYS = Object.freeze([
  'applicability',
  'evidenceHash',
  'qualification',
]);
const MAPPING_FIELDS = Object.freeze([
  'materialRegionEvidence',
  'loadEdgeEvidence',
  'boundaryEdgeEvidence',
]);

export function createTemplateCallerMeshBinding(input) {
  exactKeys(input, CREATE_KEYS, 'Caller-mesh binding input');
  const normalized = normalizeInput(input);
  const classification = classify(normalized);
  const base = {
    schema: LAFEA_TEMPLATE_CALLER_MESH_BINDING_SCHEMA,
    ...normalized,
    status: classification.status,
    reasons: classification.reasons,
    compilerGeneratedMesh: false,
    productionMeshQualified: false,
    engineExecutionAuthorized: false,
    recoveryProduced: false,
    convergenceProduced: false,
    codeAssessmentProduced: false,
    releaseQualified: false,
    hashProfile: LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  };
  return deepFreeze({ ...base, semanticHash: templateReleaseSha256(base) });
}

export function validateTemplateCallerMeshBinding(value) {
  const errors = [];
  try {
    exactKeys(value, TOP_KEYS, 'Caller-mesh binding');
    if (value.schema !== LAFEA_TEMPLATE_CALLER_MESH_BINDING_SCHEMA
      || !LAFEA_TEMPLATE_CALLER_MESH_BINDING_STATUSES.includes(value.status)
      || value.hashProfile !== LAFEA_TEMPLATE_RELEASE_HASH_PROFILE) {
      throw new TypeError('Caller-mesh binding identity is invalid.');
    }
    const input = {};
    for (const key of CREATE_KEYS) input[key] = value[key];
    const rebuilt = createTemplateCallerMeshBinding(input);
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw new TypeError('Caller-mesh binding is stale or tampered.');
    }
    if (!isDeepFrozen(value)) {
      throw new TypeError('Caller-mesh binding must be deeply frozen.');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function normalizeInput(input) {
  if (!LAFEA_T6_CALLER_MESH_TEMPLATE_IDS.includes(input.templateId)) {
    throw new TypeError(`Template is not a governed T6 caller-mesh template: ${input.templateId}.`);
  }
  if (input.targetStageId !== 'LAFEA.3') {
    throw new TypeError('T6 caller-mesh templates must target LAFEA.3.');
  }
  const normalized = {
    templateId: input.templateId,
    templateSemanticHash: engineeringHash(
      input.templateSemanticHash, 'templateSemanticHash',
    ),
    compilationHash: engineeringHash(input.compilationHash, 'compilationHash'),
    handoffHash: engineeringHash(input.handoffHash, 'handoffHash'),
    compatibilityReceiptHash: sha256(
      input.compatibilityReceiptHash, 'compatibilityReceiptHash',
    ),
    targetStageId: input.targetStageId,
    targetCompositionRootHash: sha256(
      input.targetCompositionRootHash, 'targetCompositionRootHash',
    ),
    sourceAuthorityHash: nullableSha256(
      input.sourceAuthorityHash, 'sourceAuthorityHash',
    ),
    sourceHash: sha256(input.sourceHash, 'sourceHash'),
    canonicalModelHash: sha256(input.canonicalModelHash, 'canonicalModelHash'),
    analysisGeometryHash: sha256(
      input.analysisGeometryHash, 'analysisGeometryHash',
    ),
    meshProfileHash: engineeringHash(input.meshProfileHash, 'meshProfileHash'),
    meshHash: sha256(input.meshHash, 'meshHash'),
    meshAuthorityHash: sha256(input.meshAuthorityHash, 'meshAuthorityHash'),
    qualityEvidenceHash: sha256(
      input.qualityEvidenceHash, 'qualityEvidenceHash',
    ),
  };
  for (const field of MAPPING_FIELDS) {
    normalized[field] = mappingEvidence(input[field], field);
  }
  return normalized;
}

function classify(input) {
  const reasons = [];
  if (input.sourceAuthorityHash === null) {
    reasons.push('SOURCE_AUTHORITY_RECORD_HASH_REQUIRED');
  }
  for (const field of MAPPING_FIELDS) {
    const evidence = input[field];
    if (evidence.qualification === 'BLOCK') {
      reasons.push(`${mappingCode(field)}_BLOCKED`);
    } else if (evidence.evidenceHash === null
      || evidence.qualification === 'PENDING') {
      reasons.push(`${mappingCode(field)}_PENDING`);
    }
  }
  const blocked = reasons.some((reason) => reason.endsWith('_BLOCKED'));
  const pending = reasons.length > 0;
  return {
    status: blocked
      ? 'BLOCKED'
      : pending
        ? 'MAPPING_EVIDENCE_PENDING'
        : 'BOUND',
    reasons: [...new Set(reasons)].sort(),
  };
}

function mappingEvidence(value, field) {
  exactKeys(value, MAPPING_KEYS, field);
  if (value.applicability !== 'REQUIRED') {
    throw new TypeError(`${field}.applicability must be REQUIRED.`);
  }
  if (!['PASS', 'PENDING', 'BLOCK'].includes(value.qualification)) {
    throw new TypeError(`${field}.qualification is invalid.`);
  }
  const evidenceHash = nullableSha256(value.evidenceHash, `${field}.evidenceHash`);
  if (value.qualification === 'PASS' && evidenceHash === null) {
    throw new TypeError(`${field} PASS requires evidenceHash.`);
  }
  if (value.qualification === 'PENDING' && evidenceHash !== null) {
    throw new TypeError(`${field} PENDING must not claim evidenceHash.`);
  }
  return {
    applicability: 'REQUIRED',
    evidenceHash,
    qualification: value.qualification,
  };
}

function mappingCode(field) {
  return field.replace(/Evidence$/u, '')
    .replace(/[A-Z]/gu, (character) => `_${character}`)
    .toUpperCase();
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}

function engineeringHash(value, field) {
  if (typeof value !== 'string' || !ENGINEERING_HASH.test(value)) {
    throw new TypeError(`${field} must be an engineering hash.`);
  }
  return value;
}

function sha256(value, field) {
  if (typeof value !== 'string' || !HASH.test(value)) {
    throw new TypeError(`${field} must be canonical SHA-256.`);
  }
  return value;
}

function nullableSha256(value, field) {
  return value === null ? null : sha256(value, field);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
