import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_INPUT_SCHEMA =
  'lafea-bucket-01-independent-candidate-verification-input/v1';
export const LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_EVIDENCE_SCHEMA =
  'lafea-bucket-01-independent-candidate-verification-evidence/v1';
export const LAFEA_BUCKET_01_ARTIFACT_MANIFEST_SCHEMA =
  'lafea-bucket-01-typed-artifact-manifest/v1';
export const LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_REVISION =
  'B01-INDEPENDENT-CANDIDATE-VERIFICATION.1';

export const EXPECTED_DESIGN_ID = 'B01-PROBE-STABLE-POLAR-V3';
export const EXPECTED_LEVELS = Object.freeze([
  Object.freeze({ ordinal: 1, radialCellCount: 12, circumferentialCellCount: 20, elementCount: 480 }),
  Object.freeze({ ordinal: 2, radialCellCount: 17, circumferentialCellCount: 35, elementCount: 1190 }),
  Object.freeze({ ordinal: 3, radialCellCount: 30, circumferentialCellCount: 68, elementCount: 4080 }),
  Object.freeze({ ordinal: 4, radialCellCount: 54, circumferentialCellCount: 132, elementCount: 14256 }),
]);
export const EXPECTED_LOCATION_COUNT = 7;
export const NATURAL_MARGIN_TARGET = 0.05;
export const DENSE_JACOBIAN_DIVISIONS = 8;
export const NUMERIC_TOLERANCE = 1e-10;
export const NATURAL_TOLERANCE = 1e-9;
export const NEWTON_LIMIT = 30;
export const INTEGRATION_POINTS = Object.freeze([
  Object.freeze({ xi: 1 / 6, eta: 1 / 6, weight: 1 / 6 }),
  Object.freeze({ xi: 2 / 3, eta: 1 / 6, weight: 1 / 6 }),
  Object.freeze({ xi: 1 / 6, eta: 2 / 3, weight: 1 / 6 }),
]);
export const CORNER_NATURAL_POINTS = Object.freeze([
  Object.freeze({ xi: 0, eta: 0 }),
  Object.freeze({ xi: 1, eta: 0 }),
  Object.freeze({ xi: 0, eta: 1 }),
]);
export const PACKAGE_SCHEMA = 'lafea-lug-pinhole-probe-stable-t6-package/v3';
export const PACKAGE_REVISION = 'B01-PROBE-STABLE-T6.3';
export const INPUT_KEYS = Object.freeze([
  'schema',
  'verificationHeadSha',
  'candidateArtifactHeadSha',
  'mergeBaseSha',
  'candidateArtifactHeadIsAncestor',
  'replayArtifactManifestArtifact',
  'candidateIntakeEvidenceArtifact',
  'designArtifact',
  'probeSpecArtifact',
  'productionResponseSpecArtifact',
  'levelArtifacts',
]);
export const ARTIFACT_KEYS = Object.freeze([
  'artifactId', 'artifactScope', 'role', 'relativePath',
  'routeId', 'levelOrdinal', 'exactHeadSha', 'designHash',
  'parentArtifactHashes', 'declaredRawFileHash', 'computedRawFileHash', 'payload',
]);
export const ALLOWED_ARTIFACT_SCOPES = Object.freeze(new Set([
  'CANDIDATE_MESH_BOUND',
  'REFERENCE_MESH_BOUND',
  'REPOSITORY_REGRESSION',
  'EXECUTION_ENVIRONMENT',
]));
export const ELEMENT_PATTERN = /^E-R(?<ring>\d+)-S(?<sector>\d+)-(?<side>[AB])$/u;
export const CORNER_PATTERN = /^C-R(?<ring>\d+)-S(?<sector>\d+)$/u;


export function manifestEntry(artifact, semanticHash, status = 'PASS') {
  return deepFreeze({
    artifactId: artifact.artifactId,
    artifactScope: artifact.artifactScope,
    schema: artifact.payload.schema ?? null,
    producerRevision: artifact.payload.producerRevision ?? null,
    routeId: artifact.routeId,
    levelOrdinal: artifact.levelOrdinal,
    exactHeadSha: artifact.exactHeadSha,
    designHash: artifact.designHash,
    parentArtifactHashes: artifact.parentArtifactHashes,
    semanticHash,
    rawFileHash: artifact.computedRawFileHash,
    relativePath: artifact.relativePath,
    validationStatus: status,
  });
}

export function fullSemanticHash(value) {
  const base = { ...value };
  delete base.semanticHash;
  const expected = canonicalLafeaSha256(base);
  if (value.semanticHash !== expected) {
    throw verificationError('LAFEA_B01_INDEPENDENT_ARTIFACT_HASH_TAMPERED');
  }
  return expected;
}

export function verifyFullSemanticHash(value, code) {
  const base = { ...value };
  delete base.semanticHash;
  if (canonicalLafeaSha256(base) !== value.semanticHash) {
    throw verificationError(code);
  }
}

export function validateTypedManifestEntries(entries) {
  const required = [
    'artifactId', 'artifactScope', 'schema', 'producerRevision', 'routeId',
    'levelOrdinal', 'exactHeadSha', 'designHash', 'parentArtifactHashes',
    'semanticHash', 'rawFileHash', 'relativePath', 'validationStatus',
  ];
  if (!Array.isArray(entries) || entries.length !== 9) {
    throw verificationError('LAFEA_B01_INDEPENDENT_TYPED_MANIFEST_INVALID');
  }
  for (const entry of entries) {
    if (JSON.stringify(Object.keys(entry).sort())
        !== JSON.stringify([...required].sort())
      || !ALLOWED_ARTIFACT_SCOPES.has(entry.artifactScope)
      || !['PASS', 'BLOCKED'].includes(entry.validationStatus)
      || !/^sha256:[0-9a-f]{64}$/u.test(entry.designHash)
      || !/^sha256:[0-9a-f]{64}$/u.test(entry.semanticHash)
      || !/^sha256:[0-9a-f]{64}$/u.test(entry.rawFileHash)) {
      throw verificationError('LAFEA_B01_INDEPENDENT_TYPED_MANIFEST_INVALID');
    }
  }
}

export function independentAuthority() {
  return deepFreeze({
    executedRecomputation: true,
    independentCheckerExecution: true,
    productionSwitchAuthorized: false,
    productionMeshAuthority: false,
    stressAcceptanceAuthority: false,
    qualificationAuthority: false,
    bucketQualified: false,
  });
}

export function assertIndependentAuthority(value) {
  if (!value
    || value.executedRecomputation !== true
    || value.independentCheckerExecution !== true
    || value.productionSwitchAuthorized !== false
    || value.productionMeshAuthority !== false
    || value.stressAcceptanceAuthority !== false
    || value.qualificationAuthority !== false
    || value.bucketQualified !== false) {
    throw verificationError('LAFEA_B01_INDEPENDENT_AUTHORITY_INVALID');
  }
}

export function assertFalseCandidateAuthority(value) {
  if (!value
    || value.candidateMeshOnly !== true
    || value.productionMeshAuthority !== false
    || value.stressAcceptanceAuthority !== false
    || value.qualificationAuthority !== false
    || value.bucketQualified !== false) {
    throw verificationError('LAFEA_B01_INDEPENDENT_PACKAGE_AUTHORITY_ESCALATED');
  }
}

export function assertFalseAuthority(value, code) {
  if (!value
    || value.productionMeshAuthority !== false
    || value.qualificationAuthority !== false
    || value.bucketQualified !== false) {
    throw verificationError(code);
  }
}

export function featureRoleAngle(role) {
  const match = /^RADIAL_QUARTER_(?<quarter>[0-3])$/u.exec(role);
  if (!match) throw verificationError('LAFEA_B01_INDEPENDENT_FEATURE_ROLE_INVALID');
  return Number(match.groups.quarter) * 90;
}

export function findNearIndex(values, target) {
  return values.findIndex((value) => near(value, target, 1e-12));
}

export function radiusOf(node, center) {
  if (!node) throw verificationError('LAFEA_B01_INDEPENDENT_NODE_MISSING');
  return Math.hypot(node.x - center.x, node.y - center.y);
}

export function angularDistance(left, right) {
  const difference = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(difference, 360 - difference);
}

export function normalizeDegrees(value) {
  const result = value % 360;
  return result < 0 ? result + 360 : result;
}

export function edgeKey(left, right) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

export function near(left, right, relative) {
  if (typeof left !== 'number' || typeof right !== 'number'
    || !Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right)
    <= relative * Math.max(1, Math.abs(left), Math.abs(right));
}

export function clean(value) {
  return Object.is(value, -0) || Math.abs(value) < 1e-15 ? 0 : value;
}

export function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw verificationError('LAFEA_B01_INDEPENDENT_EXACT_KEYS_INVALID', label);
  }
}

export function plainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw verificationError('LAFEA_B01_INDEPENDENT_RECORD_INVALID', label);
  }
  return value;
}

export function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw verificationError('LAFEA_B01_INDEPENDENT_TEXT_REQUIRED', label);
  }
  return value;
}

export function relativePath(value) {
  const result = text(value, 'relativePath');
  if (result.startsWith('/') || result.includes('..')) {
    throw verificationError('LAFEA_B01_INDEPENDENT_RELATIVE_PATH_INVALID');
  }
  return result;
}

export function nullableOrdinal(value) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1) {
    throw verificationError('LAFEA_B01_INDEPENDENT_LEVEL_ORDINAL_INVALID');
  }
  return value;
}

export function hashArray(value, label) {
  if (!Array.isArray(value)) {
    throw verificationError('LAFEA_B01_INDEPENDENT_HASH_ARRAY_INVALID', label);
  }
  return deepFreeze(value.map((row) => sha256(row, label)));
}

export function gitSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw verificationError('LAFEA_B01_INDEPENDENT_GIT_SHA_INVALID', label);
  }
  return value;
}

export function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw verificationError('LAFEA_B01_INDEPENDENT_SHA256_INVALID', label);
  }
  return value;
}

export function verificationError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
