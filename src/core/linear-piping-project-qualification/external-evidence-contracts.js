import { finiteNumber } from '../shared-analysis-contract/numeric.js';
import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { compareAscii, failQualification } from './contracts.js';

export const PERFORMANCE_EVIDENCE_SCHEMA = 'linear-piping-performance-evidence/v1';
export const ROLLBACK_EVIDENCE_SCHEMA = 'linear-piping-rollback-evidence/v1';
export const RELEASE_REVIEW_DISPOSITION_SCHEMA = 'linear-piping-release-review-disposition/v1';
export const EVIDENCE_ARTIFACT_REFERENCE_SCHEMA = 'linear-piping-evidence-artifact-reference/v1';
export const REQUIRED_PERFORMANCE_STAGES = Object.freeze([
  'COMPILE', 'EXPORT', 'PRESENTATION', 'RECOVERY', 'SOLVE',
]);
export const RELEASE_REVIEW_DECISION = 'ACCEPT_FOR_RELEASE_REVIEW';

export const PERFORMANCE_EVIDENCE_KEYS = Object.freeze([
  'schema', 'evidenceId', 'exactHead', 'runtimeIdentity', 'modelEnvelope',
  'stageTimings', 'memoryEvidence', 'deterministicReplay', 'failureBehavior',
  'declaredEnvelope', 'exceededLimits', 'sourceEvidence', 'reviewer',
  'reviewedAtUtc', 'semanticHash', 'evidenceHash',
]);
export const ROLLBACK_EVIDENCE_KEYS = Object.freeze([
  'schema', 'evidenceId', 'qualifiedHead', 'rollbackTarget', 'releaseCommand',
  'rollbackCommand', 'migrationImpact', 'restoredApplicationPath',
  'preservedProjectData', 'postRollbackChecks', 'sourceEvidence', 'reviewer',
  'completedAtUtc', 'semanticHash', 'evidenceHash',
]);
export const RELEASE_REVIEW_DISPOSITION_KEYS = Object.freeze([
  'schema', 'dispositionId', 'program', 'exactHead', 'decision', 'organization',
  'reviewer', 'role', 'signedAtUtc', 'signatureReference', 'sourceSemanticHash',
  'semanticHash', 'evidenceHash',
]);
export const ARTIFACT_REFERENCE_KEYS = Object.freeze([
  'schema', 'path', 'mediaType', 'contentHash', 'recordSemanticHash',
  'recordEvidenceHash',
]);
export const SOURCE_EVIDENCE_KEYS = Object.freeze([
  'documentId', 'revision', 'sourceSemanticHash',
]);

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const PROHIBITED_EVIDENCE_TOKEN = /(?:^|[^A-Z0-9])(?:FICTIONAL|SIMULATED|MOCK|FIXTURE|TEST|EXAMPLE|DEMO|PLACEHOLDER|TBD|UNKNOWN)(?:$|[^A-Z0-9])/u;

export function sealReleaseReviewDisposition(source) {
  exactKeys(source, RELEASE_REVIEW_DISPOSITION_KEYS, 'releaseReviewDisposition');
  if (source.schema !== RELEASE_REVIEW_DISPOSITION_SCHEMA
    || source.program !== 'PRIORITY_2_LINEAR_PIPING_FEA_APPLICATION_CHAIN'
    || source.decision !== RELEASE_REVIEW_DECISION) {
    failQualification(
      'Release-review disposition is invalid.',
      'PIPING_RELEASE_REVIEW_DISPOSITION_INVALID',
    );
  }
  const draft = {
    schema: source.schema,
    dispositionId: requireExternalText(
      source.dispositionId,
      'releaseReviewDisposition.dispositionId',
    ),
    program: source.program,
    exactHead: requireHead(source.exactHead, 'releaseReviewDisposition.exactHead'),
    decision: source.decision,
    organization: requireExternalText(
      source.organization,
      'releaseReviewDisposition.organization',
    ),
    reviewer: requireExternalText(source.reviewer, 'releaseReviewDisposition.reviewer'),
    role: requireExternalText(source.role, 'releaseReviewDisposition.role'),
    signedAtUtc: requireUtc(source.signedAtUtc, 'releaseReviewDisposition.signedAtUtc'),
    signatureReference: requireExternalText(
      source.signatureReference,
      'releaseReviewDisposition.signatureReference',
    ),
    sourceSemanticHash: requireHash(
      source.sourceSemanticHash,
      'releaseReviewDisposition.sourceSemanticHash',
    ),
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = semanticHash(dispositionSemanticProjection(draft));
  draft.evidenceHash = semanticHash({
    semanticHash: draft.semanticHash,
    signatureReference: draft.signatureReference,
    sourceSemanticHash: draft.sourceSemanticHash,
  });
  requireOptionalHashMatch(
    source,
    draft,
    'PIPING_RELEASE_REVIEW_DISPOSITION_HASH_MISMATCH',
  );
  return deepFreeze(draft);
}

export function requireReleaseReviewDisposition(record) {
  const sealed = sealReleaseReviewDisposition(record);
  requireCurrentHashes(
    record,
    sealed,
    'PIPING_RELEASE_REVIEW_DISPOSITION_HASH_MISMATCH',
  );
  return sealed;
}

export function canonicalArtifactReference(source, field) {
  exactKeys(source, ARTIFACT_REFERENCE_KEYS, field);
  if (source.schema !== EVIDENCE_ARTIFACT_REFERENCE_SCHEMA) {
    failQualification(
      `${field}.schema is invalid.`,
      'PIPING_EVIDENCE_ARTIFACT_REFERENCE_INVALID',
    );
  }
  const path = requireExternalText(source.path, `${field}.path`);
  if (path.startsWith('/') || path.includes('..')
    || /(?:^|\/)(?:scripts?|tests?|fixtures?|mocks?)(?:\/|$)/iu.test(path)) {
    failQualification(`${field}.path is ineligible.`, 'PIPING_EVIDENCE_ARTIFACT_PATH_INELIGIBLE');
  }
  return deepFreeze({
    schema: source.schema,
    path,
    mediaType: nonEmptyString(source.mediaType, `${field}.mediaType`),
    contentHash: requireHash(source.contentHash, `${field}.contentHash`),
    recordSemanticHash: requireHash(
      source.recordSemanticHash,
      `${field}.recordSemanticHash`,
    ),
    recordEvidenceHash: requireHash(
      source.recordEvidenceHash,
      `${field}.recordEvidenceHash`,
    ),
  });
}

export function requireExternalText(value, field) {
  const text = nonEmptyString(value, field);
  if (PROHIBITED_EVIDENCE_TOKEN.test(text.toUpperCase())) {
    failQualification(
      `${field} contains an ineligible evidence token.`,
      'PIPING_EXTERNAL_EVIDENCE_INELIGIBLE',
    );
  }
  return text;
}

export function requireHash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    failQualification(
      `${field} must be a semantic hash.`,
      'PIPING_EXTERNAL_EVIDENCE_HASH_INVALID',
    );
  }
  return value;
}

export function requireHead(value, field) {
  if (typeof value !== 'string' || !HEAD_PATTERN.test(value)) {
    failQualification(
      `${field} must be a 40-character commit SHA.`,
      'PIPING_EXTERNAL_EVIDENCE_HEAD_INVALID',
    );
  }
  return value;
}

export function canonicalSourceEvidence(source, field) {
  exactKeys(source, SOURCE_EVIDENCE_KEYS, field);
  return deepFreeze({
    documentId: requireExternalText(source.documentId, `${field}.documentId`),
    revision: requireExternalText(source.revision, `${field}.revision`),
    sourceSemanticHash: requireHash(source.sourceSemanticHash, `${field}.sourceSemanticHash`),
  });
}

export function canonicalHashArray(source, field) {
  requireArray(source, field);
  return deepFreeze(source.map((value, index) => requireHash(value, `${field}[${index}]`)));
}

export function canonicalPlainTextArray(source, field) {
  requireArray(source, field);
  const values = source.map((value, index) => nonEmptyString(value, `${field}[${index}]`));
  return deepFreeze([...new Set(values)].sort(compareAscii));
}

export function requireArray(value, field) {
  if (!Array.isArray(value)) {
    failQualification(`${field} must be an array.`, 'PIPING_EXTERNAL_EVIDENCE_ARRAY_REQUIRED');
  }
  return value;
}

export function requireNonnegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    failQualification(
      `${field} must be a non-negative integer.`,
      'PIPING_EXTERNAL_EVIDENCE_NUMBER_INVALID',
    );
  }
  return value;
}

export function requireNonnegativeFinite(value, field) {
  const number = finiteNumber(value, field);
  if (number < 0) {
    failQualification(`${field} must be non-negative.`, 'PIPING_EXTERNAL_EVIDENCE_NUMBER_INVALID');
  }
  return number;
}

export function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    failQualification(`${field} must be boolean.`, 'PIPING_EXTERNAL_EVIDENCE_BOOLEAN_INVALID');
  }
  return value;
}

export function requireUtc(value, field) {
  if (typeof value !== 'string'
    || !UTC_PATTERN.test(value)
    || !Number.isFinite(Date.parse(value))) {
    failQualification(
      `${field} must be an exact UTC timestamp.`,
      'PIPING_EXTERNAL_EVIDENCE_TIME_INVALID',
    );
  }
  return value;
}

export function requireOptionalHashMatch(source, draft, code) {
  if ((source.semanticHash !== '' && source.semanticHash !== draft.semanticHash)
    || (source.evidenceHash !== '' && source.evidenceHash !== draft.evidenceHash)) {
    failQualification('External evidence hash is stale.', code);
  }
}

export function requireCurrentHashes(record, sealed, code) {
  if (record.semanticHash !== sealed.semanticHash || record.evidenceHash !== sealed.evidenceHash) {
    failQualification('External evidence must carry current hashes.', code);
  }
}

function dispositionSemanticProjection(record) {
  const {
    signatureReference: _signatureReference,
    sourceSemanticHash: _sourceSemanticHash,
    semanticHash: _semanticHash,
    evidenceHash: _evidenceHash,
    ...projection
  } = record;
  return projection;
}
