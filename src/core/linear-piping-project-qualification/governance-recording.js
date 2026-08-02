import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  PHASE6I_FROZEN_CANDIDATE,
  PHASE6I_IMMUTABLE_REF,
} from './project-authority-index.js';

export const PHASE6I_INDEPENDENT_CLOSURE_ACCEPTANCE_SCHEMA =
  'lfea-piping-phase6i-independent-closure-acceptance/v1';
export const PHASE6I_GOVERNANCE_CLOSURE_DECISION_SCHEMA =
  'lfea-piping-phase6i-governance-closure-decision/v1';

const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const HASH_PATTERN = /^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$/u;
const RUN_ID_PATTERN = /^\d+$/u;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const INELIGIBLE_REFERENCE =
  /(?:fixture|mock|demo|simulated|fictional|source-review-only|self-approved|auto-approved)/iu;

const ACCEPTANCE_KEYS = Object.freeze([
  'schema', 'status', 'candidateSha', 'immutableRef',
  'certificationRunId', 'certificationArtifactName', 'reviewRunId',
  'reviewArtifactName', 'reviewPath', 'reviewContentHash',
  'reviewSemanticHash', 'reviewEvidenceHash', 'benchmarkManifestPath',
  'benchmarkManifestContentHash', 'benchmarkManifestSemanticHash',
  'benchmarkManifestEvidenceHash', 'antiDriftManifestPath',
  'antiDriftManifestContentHash', 'antiDriftManifestSemanticHash',
  'antiDriftManifestEvidenceHash', 'runtimeIntakePath',
  'runtimeIntakeContentHash', 'releaseValidationPath',
  'releaseValidationContentHash', 'reviewerId', 'audA7Disposition',
  'releaseQualified', 'semanticHash', 'evidenceHash',
]);
const DECISION_SOURCE_KEYS = Object.freeze([
  'status', 'candidateSha', 'immutableRef', 'acceptanceReference',
  'authority', 'decision', 'recordingTarget', 'decisionTimestampUtc',
  'signature', 'releaseQualified',
]);
const DECISION_KEYS = Object.freeze([
  'schema', ...DECISION_SOURCE_KEYS, 'semanticHash', 'evidenceHash',
]);
const ACCEPTANCE_REFERENCE_KEYS = Object.freeze([
  'runId', 'artifactName', 'path', 'contentHash', 'semanticHash', 'evidenceHash',
]);
const AUTHORITY_KEYS = Object.freeze([
  'authorityId', 'role', 'organization', 'authorityBasisReference',
  'independenceStatement',
]);
const DECISION_KEYS_INNER = Object.freeze([
  'audA7Disposition', 'gatesDisposition', 'programDisposition',
]);
const RECORDING_TARGET_KEYS = Object.freeze([
  'findingsLedgerPath', 'phaseId', 'findingId', 'issueNumber',
  'releaseTemplatePath',
]);
const SIGNATURE_KEYS = Object.freeze([
  'signerId', 'signedAtUtc', 'signatureReference',
]);
const ACCEPTANCE_PATH_FIELDS = Object.freeze([
  'reviewPath', 'benchmarkManifestPath', 'antiDriftManifestPath',
  'runtimeIntakePath', 'releaseValidationPath',
]);
const ACCEPTANCE_HASH_FIELDS = Object.freeze([
  'reviewContentHash', 'reviewSemanticHash', 'reviewEvidenceHash',
  'benchmarkManifestContentHash', 'benchmarkManifestSemanticHash',
  'benchmarkManifestEvidenceHash', 'antiDriftManifestContentHash',
  'antiDriftManifestSemanticHash', 'antiDriftManifestEvidenceHash',
  'runtimeIntakeContentHash', 'releaseValidationContentHash',
]);

export class Phase6iGovernanceRecordingError extends Error {
  constructor(code, evidence = {}) {
    super(code);
    this.name = 'Phase6iGovernanceRecordingError';
    this.code = code;
    this.evidence = deepFreeze(structuredClone(evidence));
  }
}

export function requirePhase6iIndependentClosureAcceptance(value) {
  exactKeys(value, ACCEPTANCE_KEYS, 'independentClosureAcceptance');
  requireCandidate(value.candidateSha, value.immutableRef);
  if (value.schema !== PHASE6I_INDEPENDENT_CLOSURE_ACCEPTANCE_SCHEMA
    || value.status !== 'ELIGIBLE_FOR_GOVERNANCE_CLOSURE_RECORDING'
    || value.audA7Disposition !== 'RECOMMEND_CLOSE'
    || value.releaseQualified !== false) {
    fail('LFEA_WP9_ACCEPTANCE_STATUS_INVALID');
  }
  requireRunId(value.certificationRunId, 'certificationRunId');
  requireRunId(value.reviewRunId, 'reviewRunId');
  if (value.certificationRunId === value.reviewRunId) {
    fail('LFEA_WP9_ACCEPTANCE_RUNS_NOT_INDEPENDENT');
  }
  requireArtifactName(value.certificationArtifactName, 'certificationArtifactName');
  requireArtifactName(value.reviewArtifactName, 'reviewArtifactName');
  nonEmptyString(value.reviewerId, 'reviewerId');
  for (const field of ACCEPTANCE_PATH_FIELDS) requireSafeJsonPath(value[field], field);
  for (const field of ACCEPTANCE_HASH_FIELDS) requireHash(value[field], field);
  requireSealed(value, 'LFEA_WP9_ACCEPTANCE_HASH_MISMATCH');
  return deepFreeze(structuredClone(value));
}

export function buildPhase6iGovernanceClosureDecision(source) {
  exactKeys(source, DECISION_SOURCE_KEYS, 'governanceClosureDecision');
  requireCandidate(source.candidateSha, source.immutableRef);
  const base = {
    schema: PHASE6I_GOVERNANCE_CLOSURE_DECISION_SCHEMA,
    status: source.status,
    candidateSha: source.candidateSha,
    immutableRef: source.immutableRef,
    acceptanceReference: structuredClone(source.acceptanceReference),
    authority: structuredClone(source.authority),
    decision: structuredClone(source.decision),
    recordingTarget: structuredClone(source.recordingTarget),
    decisionTimestampUtc: source.decisionTimestampUtc,
    signature: structuredClone(source.signature),
    releaseQualified: source.releaseQualified,
  };
  validateGovernanceDecisionBase(base);
  return seal(base);
}

export function requirePhase6iGovernanceClosureDecision(value) {
  exactKeys(value, DECISION_KEYS, 'governanceClosureDecision');
  requireCandidate(value.candidateSha, value.immutableRef);
  if (value.schema !== PHASE6I_GOVERNANCE_CLOSURE_DECISION_SCHEMA) {
    fail('LFEA_WP9_DECISION_SCHEMA_INVALID');
  }
  validateGovernanceDecisionBase(value);
  requireSealed(value, 'LFEA_WP9_DECISION_HASH_MISMATCH');
  return deepFreeze(structuredClone(value));
}

function validateGovernanceDecisionBase(value) {
  if (value.status !== 'GOVERNANCE_DECISION_COMPLETE'
    || value.releaseQualified !== false) {
    fail('LFEA_WP9_DECISION_STATUS_INVALID');
  }
  exactKeys(value.acceptanceReference, ACCEPTANCE_REFERENCE_KEYS,
    'acceptanceReference');
  requireRunId(value.acceptanceReference.runId, 'acceptanceReference.runId');
  requireArtifactName(value.acceptanceReference.artifactName,
    'acceptanceReference.artifactName');
  requireSafeJsonPath(value.acceptanceReference.path,
    'acceptanceReference.path');
  requireHash(value.acceptanceReference.contentHash,
    'acceptanceReference.contentHash');
  requireHash(value.acceptanceReference.semanticHash,
    'acceptanceReference.semanticHash');
  requireHash(value.acceptanceReference.evidenceHash,
    'acceptanceReference.evidenceHash');

  exactKeys(value.authority, AUTHORITY_KEYS, 'authority');
  nonEmptyString(value.authority.authorityId, 'authority.authorityId');
  nonEmptyString(value.authority.role, 'authority.role');
  nonEmptyString(value.authority.organization, 'authority.organization');
  requireEligibleReference(value.authority.authorityBasisReference,
    'authority.authorityBasisReference');
  requireEligibleReference(value.authority.independenceStatement,
    'authority.independenceStatement');

  exactKeys(value.decision, DECISION_KEYS_INNER, 'decision');
  if (value.decision.audA7Disposition !== 'APPROVE_CLOSURE'
    || value.decision.gatesDisposition !== 'RECORD_VERIFIED'
    || value.decision.programDisposition !== 'QUALIFIED') {
    fail('LFEA_WP9_DECISION_DISPOSITION_INVALID');
  }

  exactKeys(value.recordingTarget, RECORDING_TARGET_KEYS, 'recordingTarget');
  if (value.recordingTarget.findingsLedgerPath
      !== 'reports/lfea-piping-phase-findings-ledger.json'
    || value.recordingTarget.phaseId !== 'PHASE_6_PROJECT_QUALIFICATION'
    || value.recordingTarget.findingId !== 'AUD-A7-001'
    || value.recordingTarget.issueNumber !== 70
    || value.recordingTarget.releaseTemplatePath
      !== 'release-evidence/lfea-piping-release-evidence.json') {
    fail('LFEA_WP9_RECORDING_TARGET_INVALID');
  }

  if (!UTC_PATTERN.test(value.decisionTimestampUtc)
    || !Number.isFinite(Date.parse(value.decisionTimestampUtc))) {
    fail('LFEA_WP9_DECISION_TIMESTAMP_INVALID');
  }
  exactKeys(value.signature, SIGNATURE_KEYS, 'signature');
  if (value.signature.signerId !== value.authority.authorityId
    || value.signature.signedAtUtc !== value.decisionTimestampUtc) {
    fail('LFEA_WP9_SIGNATURE_IDENTITY_INVALID');
  }
  requireEligibleReference(value.signature.signatureReference,
    'signature.signatureReference');
}

function requireCandidate(candidateSha, immutableRef) {
  if (!HEAD_PATTERN.test(candidateSha ?? '')
    || candidateSha !== PHASE6I_FROZEN_CANDIDATE
    || immutableRef !== PHASE6I_IMMUTABLE_REF) {
    fail('LFEA_WP9_CANDIDATE_INVALID', { candidateSha, immutableRef });
  }
}

function requireSealed(value, code) {
  const base = { ...value };
  delete base.semanticHash;
  delete base.evidenceHash;
  const semantic = semanticHash(base);
  const evidence = semanticHash({ ...base, semanticHash: semantic });
  if (value.semanticHash !== semantic || value.evidenceHash !== evidence) {
    fail(code);
  }
}

function seal(base) {
  const semantic = semanticHash(base);
  return deepFreeze({
    ...structuredClone(base),
    semanticHash: semantic,
    evidenceHash: semanticHash({ ...base, semanticHash: semantic }),
  });
}

function requireRunId(value, field) {
  if (typeof value !== 'string' || !RUN_ID_PATTERN.test(value)) {
    fail('LFEA_WP9_RUN_ID_INVALID', { field, value });
  }
}

function requireArtifactName(value, field) {
  nonEmptyString(value, field);
  if (/[\\/]/u.test(value) || value === '.' || value === '..') {
    fail('LFEA_WP9_ARTIFACT_NAME_INVALID', { field, value });
  }
}

function requireSafeJsonPath(value, field) {
  nonEmptyString(value, field);
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (normalized.startsWith('/')
    || /^[A-Za-z]:\//u.test(normalized)
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    || !normalized.toLowerCase().endsWith('.json')) {
    fail('LFEA_WP9_PATH_INVALID', { field, value });
  }
}

function requireHash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    fail('LFEA_WP9_HASH_INVALID', { field, value });
  }
}

function requireEligibleReference(value, field) {
  nonEmptyString(value, field);
  if (INELIGIBLE_REFERENCE.test(value)) {
    fail('LFEA_WP9_INELIGIBLE_REFERENCE', { field, value });
  }
}

function fail(code, evidence = {}) {
  throw new Phase6iGovernanceRecordingError(code, evidence);
}
