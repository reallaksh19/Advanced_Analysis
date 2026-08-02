import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { failQualification } from './contracts.js';
import {
  PHASE6I_FROZEN_CANDIDATE,
  PHASE6I_IMMUTABLE_REF,
} from './project-authority-index.js';

export const EXTERNAL_EVIDENCE_HANDOFF_SCHEMA =
  'lfea-piping-phase6i-external-evidence-handoff/v1';
export const EXTERNAL_EVIDENCE_HANDOFF_ACCEPTANCE_SCHEMA =
  'lfea-piping-phase6i-external-evidence-handoff-acceptance/v1';
export const EXTERNAL_EVIDENCE_HANDOFF_ACCEPTANCE_STATUS =
  'HANDOFF_ACCEPTED_FOR_PHASE6H';
export const EXTERNAL_EVIDENCE_HANDOFF_RECORD_COUNT = 7;

export const EXTERNAL_EVIDENCE_HANDOFF_KEYS = Object.freeze([
  'schema',
  'candidateSha',
  'candidateRef',
  'wp2Status',
  'wp3Status',
  'g8G9Independence',
  'sourceRunId',
  'sourceArtifactName',
  'requestPath',
  'recordCount',
  'unresolvedAuthorities',
  'projectAuthorityIndexSemanticHash',
  'projectAuthorityIndexEvidenceHash',
  'requestContentHash',
  'releaseQualified',
  'semanticHash',
  'evidenceHash',
]);

export const EXTERNAL_EVIDENCE_HANDOFF_ACCEPTANCE_KEYS = Object.freeze([
  'schema',
  'status',
  'candidateSha',
  'candidateRef',
  'sourceRunId',
  'sourceArtifactName',
  'sourceHandoffPath',
  'sourceRequestPath',
  'projectAuthorityIndexPath',
  'recordCount',
  'requestContentHash',
  'sourceHandoffContentHash',
  'sourceHandoffSemanticHash',
  'sourceHandoffEvidenceHash',
  'projectAuthorityIndexSemanticHash',
  'projectAuthorityIndexEvidenceHash',
  'releaseQualified',
  'semanticHash',
  'evidenceHash',
]);

const HASH_PATTERN = /^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$/u;
const RUN_ID_PATTERN = /^[1-9][0-9]*$/u;
const ARTIFACT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/u;
const INELIGIBLE_ROOTS = Object.freeze([
  'e2e', 'script', 'scripts', 'test', 'tests', 'fixture', 'fixtures', 'mock', 'mocks',
]);

export function sealPhase6iExternalEvidenceHandoff(source) {
  exactKeys(source, EXTERNAL_EVIDENCE_HANDOFF_KEYS, 'externalEvidenceHandoff');
  if (source.schema !== EXTERNAL_EVIDENCE_HANDOFF_SCHEMA) {
    fail('LFEA_WP3_HANDOFF_SCHEMA_INVALID');
  }
  const draft = {
    schema: source.schema,
    candidateSha: requireCandidate(source.candidateSha),
    candidateRef: requireCandidateRef(source.candidateRef),
    wp2Status: requireLiteral(source.wp2Status, 'WP2_COMPLETE', 'WP2_STATUS'),
    wp3Status: requireLiteral(source.wp3Status, 'WP3_COMPLETE', 'WP3_STATUS'),
    g8G9Independence: requireLiteral(
      source.g8G9Independence,
      'CONFIRMED',
      'G8_G9_INDEPENDENCE',
    ),
    sourceRunId: requireRunId(source.sourceRunId),
    sourceArtifactName: requireArtifactName(source.sourceArtifactName),
    requestPath: requireSafeJsonPath(source.requestPath, 'REQUEST_PATH'),
    recordCount: requireRecordCount(source.recordCount),
    unresolvedAuthorities: requireNoUnresolvedAuthorities(source.unresolvedAuthorities),
    projectAuthorityIndexSemanticHash: requireHash(
      source.projectAuthorityIndexSemanticHash,
      'PROJECT_AUTHORITY_INDEX_SEMANTIC_HASH',
    ),
    projectAuthorityIndexEvidenceHash: requireHash(
      source.projectAuthorityIndexEvidenceHash,
      'PROJECT_AUTHORITY_INDEX_EVIDENCE_HASH',
    ),
    requestContentHash: requireHash(source.requestContentHash, 'REQUEST_CONTENT_HASH'),
    releaseQualified: requireFalse(source.releaseQualified, 'RELEASE_QUALIFIED'),
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = semanticHash(externalEvidenceHandoffSemanticProjection(draft));
  draft.evidenceHash = computeExternalEvidenceHandoffEvidenceHash(draft);
  requireOptionalHashMatch(source.semanticHash, draft.semanticHash, 'SEMANTIC');
  requireOptionalHashMatch(source.evidenceHash, draft.evidenceHash, 'EVIDENCE');
  return deepFreeze(draft);
}

export function requirePhase6iExternalEvidenceHandoff(record) {
  const accepted = sealPhase6iExternalEvidenceHandoff(record);
  if (record.semanticHash !== accepted.semanticHash
    || record.evidenceHash !== accepted.evidenceHash) {
    fail('LFEA_WP3_HANDOFF_HASH_MISMATCH');
  }
  return accepted;
}

export function compilePhase6iExternalEvidenceHandoffAcceptance({
  handoff,
  sourceHandoffPath,
  sourceRequestPath,
  projectAuthorityIndexPath,
}) {
  const acceptedHandoff = requirePhase6iExternalEvidenceHandoff(handoff);
  const draft = {
    schema: EXTERNAL_EVIDENCE_HANDOFF_ACCEPTANCE_SCHEMA,
    status: EXTERNAL_EVIDENCE_HANDOFF_ACCEPTANCE_STATUS,
    candidateSha: acceptedHandoff.candidateSha,
    candidateRef: acceptedHandoff.candidateRef,
    sourceRunId: acceptedHandoff.sourceRunId,
    sourceArtifactName: acceptedHandoff.sourceArtifactName,
    sourceHandoffPath: requireSafeJsonPath(sourceHandoffPath, 'SOURCE_HANDOFF_PATH'),
    sourceRequestPath: requireSafeJsonPath(sourceRequestPath, 'SOURCE_REQUEST_PATH'),
    projectAuthorityIndexPath: requireSafeJsonPath(
      projectAuthorityIndexPath,
      'PROJECT_AUTHORITY_INDEX_PATH',
    ),
    recordCount: acceptedHandoff.recordCount,
    requestContentHash: acceptedHandoff.requestContentHash,
    sourceHandoffContentHash: semanticHash(acceptedHandoff),
    sourceHandoffSemanticHash: acceptedHandoff.semanticHash,
    sourceHandoffEvidenceHash: acceptedHandoff.evidenceHash,
    projectAuthorityIndexSemanticHash:
      acceptedHandoff.projectAuthorityIndexSemanticHash,
    projectAuthorityIndexEvidenceHash:
      acceptedHandoff.projectAuthorityIndexEvidenceHash,
    releaseQualified: false,
    semanticHash: '',
    evidenceHash: '',
  };
  const paths = [
    draft.sourceHandoffPath,
    draft.sourceRequestPath,
    draft.projectAuthorityIndexPath,
  ].map((value) => value.toLowerCase());
  if (new Set(paths).size !== paths.length) {
    fail('LFEA_WP3_HANDOFF_ACCEPTANCE_PATH_DUPLICATE');
  }
  draft.semanticHash = semanticHash(
    externalEvidenceHandoffAcceptanceSemanticProjection(draft),
  );
  draft.evidenceHash = computeExternalEvidenceHandoffAcceptanceEvidenceHash(draft);
  return requirePhase6iExternalEvidenceHandoffAcceptance(draft);
}

export function requirePhase6iExternalEvidenceHandoffAcceptance(record) {
  exactKeys(
    record,
    EXTERNAL_EVIDENCE_HANDOFF_ACCEPTANCE_KEYS,
    'externalEvidenceHandoffAcceptance',
  );
  if (record.schema !== EXTERNAL_EVIDENCE_HANDOFF_ACCEPTANCE_SCHEMA
    || record.status !== EXTERNAL_EVIDENCE_HANDOFF_ACCEPTANCE_STATUS) {
    fail('LFEA_WP3_HANDOFF_ACCEPTANCE_INVALID');
  }
  const accepted = {
    schema: record.schema,
    status: record.status,
    candidateSha: requireCandidate(record.candidateSha),
    candidateRef: requireCandidateRef(record.candidateRef),
    sourceRunId: requireRunId(record.sourceRunId),
    sourceArtifactName: requireArtifactName(record.sourceArtifactName),
    sourceHandoffPath: requireSafeJsonPath(
      record.sourceHandoffPath,
      'SOURCE_HANDOFF_PATH',
    ),
    sourceRequestPath: requireSafeJsonPath(
      record.sourceRequestPath,
      'SOURCE_REQUEST_PATH',
    ),
    projectAuthorityIndexPath: requireSafeJsonPath(
      record.projectAuthorityIndexPath,
      'PROJECT_AUTHORITY_INDEX_PATH',
    ),
    recordCount: requireRecordCount(record.recordCount),
    requestContentHash: requireHash(record.requestContentHash, 'REQUEST_CONTENT_HASH'),
    sourceHandoffContentHash: requireHash(
      record.sourceHandoffContentHash,
      'SOURCE_HANDOFF_CONTENT_HASH',
    ),
    sourceHandoffSemanticHash: requireHash(
      record.sourceHandoffSemanticHash,
      'SOURCE_HANDOFF_SEMANTIC_HASH',
    ),
    sourceHandoffEvidenceHash: requireHash(
      record.sourceHandoffEvidenceHash,
      'SOURCE_HANDOFF_EVIDENCE_HASH',
    ),
    projectAuthorityIndexSemanticHash: requireHash(
      record.projectAuthorityIndexSemanticHash,
      'PROJECT_AUTHORITY_INDEX_SEMANTIC_HASH',
    ),
    projectAuthorityIndexEvidenceHash: requireHash(
      record.projectAuthorityIndexEvidenceHash,
      'PROJECT_AUTHORITY_INDEX_EVIDENCE_HASH',
    ),
    releaseQualified: requireFalse(record.releaseQualified, 'RELEASE_QUALIFIED'),
    semanticHash: requireHash(record.semanticHash, 'SEMANTIC_HASH'),
    evidenceHash: requireHash(record.evidenceHash, 'EVIDENCE_HASH'),
  };
  const paths = [
    accepted.sourceHandoffPath,
    accepted.sourceRequestPath,
    accepted.projectAuthorityIndexPath,
  ].map((value) => value.toLowerCase());
  if (new Set(paths).size !== paths.length) {
    fail('LFEA_WP3_HANDOFF_ACCEPTANCE_PATH_DUPLICATE');
  }
  if (accepted.semanticHash !== semanticHash(
    externalEvidenceHandoffAcceptanceSemanticProjection(accepted),
  ) || accepted.evidenceHash !== computeExternalEvidenceHandoffAcceptanceEvidenceHash(
    accepted,
  )) {
    fail('LFEA_WP3_HANDOFF_ACCEPTANCE_HASH_MISMATCH');
  }
  return deepFreeze(accepted);
}

export function externalEvidenceHandoffSemanticProjection(record) {
  return {
    schema: record.schema,
    candidateSha: record.candidateSha,
    candidateRef: record.candidateRef,
    wp2Status: record.wp2Status,
    wp3Status: record.wp3Status,
    g8G9Independence: record.g8G9Independence,
    sourceRunId: record.sourceRunId,
    sourceArtifactName: record.sourceArtifactName,
    requestPath: record.requestPath,
    recordCount: record.recordCount,
    unresolvedAuthorities: record.unresolvedAuthorities,
    projectAuthorityIndexSemanticHash: record.projectAuthorityIndexSemanticHash,
    projectAuthorityIndexEvidenceHash: record.projectAuthorityIndexEvidenceHash,
    requestContentHash: record.requestContentHash,
    releaseQualified: record.releaseQualified,
  };
}

export function computeExternalEvidenceHandoffEvidenceHash(record) {
  return semanticHash({
    semanticHash: record.semanticHash,
    sourceRunId: record.sourceRunId,
    sourceArtifactName: record.sourceArtifactName,
    requestContentHash: record.requestContentHash,
    projectAuthorityIndexEvidenceHash: record.projectAuthorityIndexEvidenceHash,
  });
}

export function externalEvidenceHandoffAcceptanceSemanticProjection(record) {
  return {
    schema: record.schema,
    status: record.status,
    candidateSha: record.candidateSha,
    candidateRef: record.candidateRef,
    sourceRunId: record.sourceRunId,
    sourceArtifactName: record.sourceArtifactName,
    sourceHandoffPath: record.sourceHandoffPath,
    sourceRequestPath: record.sourceRequestPath,
    projectAuthorityIndexPath: record.projectAuthorityIndexPath,
    recordCount: record.recordCount,
    requestContentHash: record.requestContentHash,
    sourceHandoffContentHash: record.sourceHandoffContentHash,
    sourceHandoffSemanticHash: record.sourceHandoffSemanticHash,
    projectAuthorityIndexSemanticHash: record.projectAuthorityIndexSemanticHash,
    releaseQualified: record.releaseQualified,
  };
}

export function computeExternalEvidenceHandoffAcceptanceEvidenceHash(record) {
  return semanticHash({
    semanticHash: record.semanticHash,
    sourceHandoffEvidenceHash: record.sourceHandoffEvidenceHash,
    projectAuthorityIndexEvidenceHash: record.projectAuthorityIndexEvidenceHash,
    requestContentHash: record.requestContentHash,
  });
}

function requireCandidate(value) {
  if (value !== PHASE6I_FROZEN_CANDIDATE) fail('LFEA_WP3_HANDOFF_CANDIDATE_INVALID');
  return value;
}

function requireCandidateRef(value) {
  if (value !== PHASE6I_IMMUTABLE_REF) fail('LFEA_WP3_HANDOFF_CANDIDATE_REF_INVALID');
  return value;
}

function requireLiteral(value, expected, field) {
  if (value !== expected) fail(`LFEA_WP3_HANDOFF_${field}_INVALID`);
  return value;
}

function requireRunId(value) {
  if (typeof value !== 'string' || !RUN_ID_PATTERN.test(value)) {
    fail('LFEA_WP3_HANDOFF_SOURCE_RUN_ID_INVALID');
  }
  return value;
}

function requireArtifactName(value) {
  const name = nonEmptyString(value, 'externalEvidenceHandoff.sourceArtifactName');
  if (!ARTIFACT_NAME_PATTERN.test(name) || name.trim() !== name) {
    fail('LFEA_WP3_HANDOFF_SOURCE_ARTIFACT_NAME_INVALID');
  }
  return name;
}

function requireRecordCount(value) {
  if (value !== EXTERNAL_EVIDENCE_HANDOFF_RECORD_COUNT) {
    fail('LFEA_WP3_HANDOFF_RECORD_COUNT_INVALID');
  }
  return value;
}

function requireNoUnresolvedAuthorities(value) {
  if (!Array.isArray(value) || value.length !== 0) {
    fail('LFEA_WP3_HANDOFF_UNRESOLVED_AUTHORITIES');
  }
  return deepFreeze([]);
}

function requireHash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    fail('LFEA_WP3_HANDOFF_HASH_INVALID', { field });
  }
  return value;
}

function requireFalse(value, field) {
  if (value !== false) fail('LFEA_WP3_HANDOFF_RELEASE_STATE_INVALID', { field });
  return false;
}

function requireSafeJsonPath(value, field) {
  const text = nonEmptyString(value, field).replaceAll('\\', '/');
  const segments = text.split('/');
  if (text.startsWith('/')
    || /^[A-Za-z]:\//u.test(text)
    || !text.toLowerCase().endsWith('.json')
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    || INELIGIBLE_ROOTS.includes(segments[0].toLowerCase())) {
    fail('LFEA_WP3_HANDOFF_PATH_INVALID', { field, value });
  }
  return text;
}

function requireOptionalHashMatch(provided, expected, kind) {
  if (provided !== '' && provided !== expected) {
    fail('LFEA_WP3_HANDOFF_HASH_MISMATCH', { kind });
  }
}

function fail(code, evidence = null) {
  failQualification(code, code, evidence);
}
