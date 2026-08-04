import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_REVISION,
} from './lafea-bucket-01-independent-candidate-verification.js';
import {
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA,
} from './lafea-bucket-01-controlled-replay-result.js';

export const LAFEA_BUCKET_01_INDEPENDENT_CHECKER_RECEIPT_REVISION =
  'B01-INDEPENDENT-CHECKER-RECEIPT.1';

const INTAKE_SCHEMA =
  'lafea-bucket-01-probe-stable-candidate-intake-evidence/v2';
const RECEIPT_KEYS = Object.freeze([
  'evidence', 'candidateIntakeEvidence', 'routeId', 'relativePath',
  'rawFileHash',
]);

export function createLafeaBucket01IndependentCheckerReceipt(input) {
  exactKeys(input, RECEIPT_KEYS, 'independent checker receipt input');
  const evidence = input.evidence;
  const intake = input.candidateIntakeEvidence;
  validateEvidence(evidence);
  validateCandidateIntake(intake);
  if (evidence.candidateArtifactHeadSha !== intake.exactHeadSha
    || evidence.designHash !== intake.designHash
    || evidence.candidateIntakeEvidenceHash !== intake.semanticHash) {
    throw receiptError('LAFEA_B01_INDEPENDENT_RECEIPT_PARENT_CUSTODY_INVALID');
  }
  const routeId = text(input.routeId, 'routeId');
  const relativePath = safeRelativePath(input.relativePath);
  const rawFileHash = sha256(input.rawFileHash, 'rawFileHash');
  const validationStatus = evidence.status;
  if (!['PASS', 'BLOCKED'].includes(validationStatus)
    || !Array.isArray(evidence.reasons)
    || (validationStatus === 'PASS' && evidence.reasons.length !== 0)
    || (validationStatus === 'BLOCKED' && evidence.reasons.length === 0)) {
    throw receiptError('LAFEA_B01_INDEPENDENT_RECEIPT_STATUS_INVALID');
  }
  return deepFreeze({
    schema: LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA,
    artifactId: `B01-PHASE3A-INDEPENDENT-${evidence.semanticHash.slice(7, 19)}`,
    artifactKind: 'INDEPENDENT_CHECKER_EVIDENCE',
    artifactScope: 'CANDIDATE_MESH_BOUND',
    artifactSchema: evidence.schema,
    producerRevision: evidence.producerRevision,
    routeId,
    levelOrdinal: null,
    exactHeadSha: evidence.exactHeadSha,
    designHash: evidence.designHash,
    parentArtifactHashes: [
      intake.candidatePackageHash,
      intake.semanticHash,
    ],
    semanticHash: evidence.semanticHash,
    rawFileHash,
    relativePath,
    validatorId: 'LAFEA_BUCKET_01_PHASE_3A_INDEPENDENT_CHECKER',
    validatorRevision: LAFEA_BUCKET_01_INDEPENDENT_CHECKER_RECEIPT_REVISION,
    validationStatus,
    validationReasons: [...evidence.reasons],
    derivedCheck: 'probeTopologyAudit',
  });
}

function validateEvidence(value) {
  if (!value
    || value.schema !== LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_EVIDENCE_SCHEMA
    || value.producerRevision !== LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_REVISION
    || !gitSha(value.exactHeadSha)
    || !gitSha(value.candidateArtifactHeadSha)
    || !sha256(value.designHash, 'evidence.designHash')
    || !sha256(value.candidateIntakeEvidenceHash,
      'evidence.candidateIntakeEvidenceHash')
    || !sha256(value.semanticHash, 'evidence.semanticHash')) {
    throw receiptError('LAFEA_B01_INDEPENDENT_RECEIPT_EVIDENCE_INVALID');
  }
  const base = { ...value };
  delete base.semanticHash;
  if (canonicalLafeaSha256(base) !== value.semanticHash
    || value.authority?.executedRecomputation !== true
    || value.authority?.independentCheckerExecution !== true
    || value.authority?.productionSwitchAuthorized !== false
    || value.authority?.productionMeshAuthority !== false
    || value.authority?.stressAcceptanceAuthority !== false
    || value.authority?.qualificationAuthority !== false
    || value.authority?.bucketQualified !== false) {
    throw receiptError('LAFEA_B01_INDEPENDENT_RECEIPT_EVIDENCE_INVALID');
  }
}

function validateCandidateIntake(value) {
  if (!value
    || value.schema !== INTAKE_SCHEMA
    || !gitSha(value.exactHeadSha)
    || !sha256(value.designHash, 'intake.designHash')
    || !sha256(value.candidatePackageHash, 'intake.candidatePackageHash')
    || !sha256(value.semanticHash, 'intake.semanticHash')
    || value.status !== 'CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW'
    || value.authority?.productionSwitchAuthorized !== false
    || value.authority?.productionMeshAuthority !== false
    || value.authority?.qualificationAuthority !== false
    || value.authority?.bucketQualified !== false) {
    throw receiptError('LAFEA_B01_INDEPENDENT_RECEIPT_INTAKE_INVALID');
  }
  const base = { ...value };
  delete base.semanticHash;
  if (canonicalLafeaSha256(base) !== value.semanticHash) {
    throw receiptError('LAFEA_B01_INDEPENDENT_RECEIPT_INTAKE_HASH_INVALID');
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw receiptError('LAFEA_B01_INDEPENDENT_RECEIPT_EXACT_KEYS_INVALID', label);
  }
}
function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw receiptError('LAFEA_B01_INDEPENDENT_RECEIPT_HEAD_INVALID');
  }
  return value;
}
function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw receiptError('LAFEA_B01_INDEPENDENT_RECEIPT_HASH_INVALID', label);
  }
  return value;
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw receiptError('LAFEA_B01_INDEPENDENT_RECEIPT_TEXT_REQUIRED', label);
  }
  return value;
}
function safeRelativePath(value) {
  const result = text(value, 'relativePath');
  if (result.startsWith('/') || result.includes('..')) {
    throw receiptError('LAFEA_B01_INDEPENDENT_RECEIPT_PATH_INVALID');
  }
  return result;
}
function receiptError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
