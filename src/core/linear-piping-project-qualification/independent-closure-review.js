import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  PHASE6I_FROZEN_CANDIDATE,
  PHASE6I_IMMUTABLE_REF,
} from './project-authority-index.js';

export const PHASE6I_BENCHMARK_REVIEW_SCHEMA =
  'lfea-piping-phase6i-benchmark-review-manifest/v1';
export const PHASE6I_ANTI_DRIFT_REVIEW_SCHEMA =
  'lfea-piping-phase6i-anti-drift-review-manifest/v1';
export const PHASE6I_INDEPENDENT_CLOSURE_REVIEW_SCHEMA =
  'lfea-piping-phase6i-independent-closure-review/v1';

export const PHASE6I_BENCHMARK_IDS = Object.freeze(
  Array.from({ length: 22 }, (_, index) => `BM-${String(index + 1).padStart(2, '0')}`),
);
export const PHASE6I_ANTI_DRIFT_IDS = Object.freeze(
  Array.from({ length: 25 }, (_, index) => `AD-${String(index + 1).padStart(2, '0')}`),
);
export const PHASE6I_GATE_IDS = Object.freeze([
  'G0_EXACT_HEAD',
  'G1_UPSTREAM_NUMERICAL_CHAIN',
  'G2_T0_APPLICATION_SEQUENCING',
  'G3_SOURCE_ORCHESTRATION',
  'G4_INTERFACES',
  'G5_INTERFACE_RECOVERY',
  'G6_CODE_AND_ALLOWABLES',
  'G7_PRESENTATION_EXPORT',
  'G8_REAL_MODEL_RECONCILIATION',
  'G9_COMMERCIAL_CORROBORATION',
  'G10_RELEASE_ROLLBACK',
]);

const HASH_PATTERN = /^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$/u;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const RUN_ID_PATTERN = /^\d+$/u;
const INELIGIBLE_REFERENCE = /(?:fixture|mock|demo|simulated|fictional|source-review-only)/iu;
const NONLINEAR_EXCLUSIONS = Object.freeze(['CONTACT', 'FRICTION', 'GAP', 'LIFT_OFF']);
const PHASE_KEYS = Object.freeze(['phase6F', 'phase6H', 'phase6G', 'phase6E']);

export class Phase6iIndependentClosureReviewError extends Error {
  constructor(message, code, evidence = null) {
    super(message);
    this.name = 'Phase6iIndependentClosureReviewError';
    this.code = code;
    this.evidence = evidence;
  }
}

export function buildPhase6iBenchmarkReviewManifest(source) {
  const base = canonicalReviewManifest(source, 'BENCHMARK');
  return sealRecord(base);
}

export function requirePhase6iBenchmarkReviewManifest(value) {
  const record = requireSealedRecord(
    value,
    'BENCHMARK',
    PHASE6I_BENCHMARK_REVIEW_SCHEMA,
  );
  requireInventory(record.entries, PHASE6I_BENCHMARK_IDS, 'BENCHMARK');
  for (const entry of record.entries) {
    exactKeys(entry, [
      'id', 'status', 'evidenceReference', 'applicabilityBasis', 'approvalReference',
    ]);
    if (!['PASS', 'NOT_APPLICABLE'].includes(entry.status)) {
      fail('LFEA_WP8_BENCHMARK_STATUS_INVALID', { id: entry.id, status: entry.status });
    }
    requireEligibleReference(entry.evidenceReference, 'benchmark evidenceReference');
    if (entry.status === 'NOT_APPLICABLE') {
      requireEligibleReference(entry.applicabilityBasis, 'benchmark applicabilityBasis');
      requireEligibleReference(entry.approvalReference, 'benchmark approvalReference');
    } else if (entry.applicabilityBasis !== null || entry.approvalReference !== null) {
      fail('LFEA_WP8_BENCHMARK_PASS_METADATA_INVALID', { id: entry.id });
    }
  }
  return record;
}

export function buildPhase6iAntiDriftReviewManifest(source) {
  const base = canonicalReviewManifest(source, 'ANTI_DRIFT');
  return sealRecord(base);
}

export function requirePhase6iAntiDriftReviewManifest(value) {
  const record = requireSealedRecord(
    value,
    'ANTI_DRIFT',
    PHASE6I_ANTI_DRIFT_REVIEW_SCHEMA,
  );
  requireInventory(record.entries, PHASE6I_ANTI_DRIFT_IDS, 'ANTI_DRIFT');
  for (const entry of record.entries) {
    exactKeys(entry, ['id', 'status', 'evidenceReference']);
    if (!['PASS', 'ENFORCED'].includes(entry.status)) {
      fail('LFEA_WP8_ANTI_DRIFT_STATUS_INVALID', { id: entry.id, status: entry.status });
    }
    requireEligibleReference(entry.evidenceReference, 'anti-drift evidenceReference');
  }
  return record;
}

export function buildPhase6iIndependentClosureReview(source) {
  const base = canonicalClosureReview(source);
  return sealRecord(base);
}

export function requirePhase6iIndependentClosureReview(value) {
  const record = requireSealedRecord(
    value,
    'INDEPENDENT_CLOSURE',
    PHASE6I_INDEPENDENT_CLOSURE_REVIEW_SCHEMA,
  );
  exactKeys(record, closureReviewKeys(true));
  requireCandidate(record.candidateSha, record.immutableRef);
  if (record.status !== 'WP8_REVIEW_COMPLETE'
    || record.audA7Disposition !== 'RECOMMEND_CLOSE'
    || record.rollbackStatus !== 'SUCCESSFUL'
    || record.releaseQualified !== false) {
    fail('LFEA_WP8_REVIEW_DISPOSITION_INVALID');
  }
  requireReviewer(record.reviewer, record.executionOwnerOrganization);
  requireExecutionChain(record.executionChain);
  requireRuntimeCertification(record.runtimeCertification);
  requireManifestReference(record.benchmarkManifest, 'benchmarkManifest');
  requireManifestReference(record.antiDriftManifest, 'antiDriftManifest');
  exactKeys(record.gates, PHASE6I_GATE_IDS);
  for (const [gate, status] of Object.entries(record.gates)) {
    if (status !== 'VERIFIED') fail('LFEA_WP8_GATE_NOT_VERIFIED', { gate, status });
  }
  if (JSON.stringify([...record.nonlinearExclusions].sort())
    !== JSON.stringify(NONLINEAR_EXCLUSIONS)) {
    fail('LFEA_WP8_NONLINEAR_EXCLUSIONS_INVALID');
  }
  requireEligibleReference(record.limitations, 'limitations');
  exactKeys(record.signature, ['signerId', 'signedAtUtc', 'signatureReference']);
  if (record.signature.signerId !== record.reviewer.reviewerId
    || !UTC_PATTERN.test(record.signature.signedAtUtc)) {
    fail('LFEA_WP8_SIGNATURE_IDENTITY_INVALID');
  }
  requireEligibleReference(record.signature.signatureReference, 'signatureReference');
  return record;
}

function canonicalReviewManifest(source, kind) {
  const schema = kind === 'BENCHMARK'
    ? PHASE6I_BENCHMARK_REVIEW_SCHEMA
    : PHASE6I_ANTI_DRIFT_REVIEW_SCHEMA;
  exactKeys(source, ['candidateSha', 'immutableRef', 'entries', 'releaseQualified']);
  requireCandidate(source.candidateSha, source.immutableRef);
  if (source.releaseQualified !== false || !Array.isArray(source.entries)) {
    fail(`LFEA_WP8_${kind}_MANIFEST_INVALID`);
  }
  return {
    schema,
    candidateSha: source.candidateSha,
    immutableRef: source.immutableRef,
    entries: source.entries.map((entry) => ({ ...entry })),
    releaseQualified: false,
  };
}

function canonicalClosureReview(source) {
  exactKeys(source, closureReviewKeys(false));
  requireCandidate(source.candidateSha, source.immutableRef);
  return {
    schema: PHASE6I_INDEPENDENT_CLOSURE_REVIEW_SCHEMA,
    status: source.status,
    candidateSha: source.candidateSha,
    immutableRef: source.immutableRef,
    reviewer: structuredClone(source.reviewer),
    executionOwnerOrganization: source.executionOwnerOrganization,
    executionChain: structuredClone(source.executionChain),
    runtimeCertification: structuredClone(source.runtimeCertification),
    benchmarkManifest: structuredClone(source.benchmarkManifest),
    antiDriftManifest: structuredClone(source.antiDriftManifest),
    gates: structuredClone(source.gates),
    limitations: source.limitations,
    nonlinearExclusions: [...source.nonlinearExclusions],
    rollbackStatus: source.rollbackStatus,
    audA7Disposition: source.audA7Disposition,
    signature: structuredClone(source.signature),
    releaseQualified: false,
  };
}

function requireSealedRecord(value, kind, schema) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`LFEA_WP8_${kind}_RECORD_REQUIRED`);
  }
  if (value.schema !== schema || value.releaseQualified !== false) {
    fail(`LFEA_WP8_${kind}_SCHEMA_INVALID`);
  }
  const base = { ...value };
  delete base.semanticHash;
  delete base.evidenceHash;
  const expectedSemanticHash = semanticHash(base);
  const expectedEvidenceHash = semanticHash({ ...base, semanticHash: expectedSemanticHash });
  if (value.semanticHash !== expectedSemanticHash
    || value.evidenceHash !== expectedEvidenceHash) {
    fail(`LFEA_WP8_${kind}_HASH_MISMATCH`);
  }
  return deepFreeze(structuredClone(value));
}

function sealRecord(base) {
  const semantic = semanticHash(base);
  return deepFreeze({
    ...structuredClone(base),
    semanticHash: semantic,
    evidenceHash: semanticHash({ ...base, semanticHash: semantic }),
  });
}

function requireInventory(entries, expectedIds, kind) {
  if (!Array.isArray(entries) || entries.length !== expectedIds.length) {
    fail(`LFEA_WP8_${kind}_INVENTORY_INVALID`);
  }
  const actual = entries.map((entry) => entry?.id);
  if (JSON.stringify(actual) !== JSON.stringify(expectedIds)) {
    fail(`LFEA_WP8_${kind}_ORDER_INVALID`, { actual, expected: expectedIds });
  }
}

function requireCandidate(candidateSha, immutableRef) {
  if (candidateSha !== PHASE6I_FROZEN_CANDIDATE
    || immutableRef !== PHASE6I_IMMUTABLE_REF) {
    fail('LFEA_WP8_CANDIDATE_INVALID', { candidateSha, immutableRef });
  }
}

function requireReviewer(reviewer, executionOwnerOrganization) {
  exactKeys(reviewer, ['reviewerId', 'organization', 'independenceStatement']);
  nonEmptyString(reviewer.reviewerId, 'reviewer.reviewerId');
  nonEmptyString(reviewer.organization, 'reviewer.organization');
  nonEmptyString(executionOwnerOrganization, 'executionOwnerOrganization');
  requireEligibleReference(reviewer.independenceStatement, 'independenceStatement');
  if (reviewer.organization === executionOwnerOrganization) {
    fail('LFEA_WP8_REVIEWER_NOT_INDEPENDENT');
  }
}

function requireExecutionChain(chain) {
  exactKeys(chain, PHASE_KEYS);
  for (const phase of PHASE_KEYS) {
    const entry = chain[phase];
    exactKeys(entry, ['runId', 'artifactName', 'logsReference']);
    if (!RUN_ID_PATTERN.test(entry.runId)) fail('LFEA_WP8_RUN_ID_INVALID', { phase });
    requireArtifactName(entry.artifactName, phase);
    requireEligibleReference(entry.logsReference, `${phase}.logsReference`);
  }
  const runIds = PHASE_KEYS.map((phase) => chain[phase].runId);
  if (new Set(runIds).size !== runIds.length) fail('LFEA_WP8_RUN_ID_DUPLICATE');
}

function requireRuntimeCertification(value) {
  exactKeys(value, [
    'intakePath', 'releaseValidationPath', 'intakeContentHash',
    'releaseValidationContentHash',
  ]);
  requireSafeJsonPath(value.intakePath, 'runtimeCertification.intakePath');
  requireSafeJsonPath(value.releaseValidationPath, 'runtimeCertification.releaseValidationPath');
  requireHash(value.intakeContentHash, 'runtimeCertification.intakeContentHash');
  requireHash(value.releaseValidationContentHash,
    'runtimeCertification.releaseValidationContentHash');
}

function requireManifestReference(value, field) {
  exactKeys(value, ['path', 'contentHash', 'semanticHash', 'evidenceHash']);
  requireSafeJsonPath(value.path, `${field}.path`);
  requireHash(value.contentHash, `${field}.contentHash`);
  requireHash(value.semanticHash, `${field}.semanticHash`);
  requireHash(value.evidenceHash, `${field}.evidenceHash`);
}

function requireHash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    fail('LFEA_WP8_HASH_INVALID', { field, value });
  }
}

function requireArtifactName(value, field) {
  nonEmptyString(value, `${field}.artifactName`);
  if (/[\\/]/u.test(value) || value === '.' || value === '..') {
    fail('LFEA_WP8_ARTIFACT_NAME_INVALID', { field, value });
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
    fail('LFEA_WP8_PATH_INVALID', { field, value });
  }
}

function requireEligibleReference(value, field) {
  nonEmptyString(value, field);
  if (INELIGIBLE_REFERENCE.test(value)) {
    fail('LFEA_WP8_INELIGIBLE_REFERENCE', { field, value });
  }
}

function closureReviewKeys(sealed) {
  return [
    'schema', 'status', 'candidateSha', 'immutableRef', 'reviewer',
    'executionOwnerOrganization', 'executionChain', 'runtimeCertification',
    'benchmarkManifest', 'antiDriftManifest', 'gates', 'limitations',
    'nonlinearExclusions', 'rollbackStatus', 'audA7Disposition', 'signature',
    'releaseQualified', ...(sealed ? ['semanticHash', 'evidenceHash'] : []),
  ];
}

function fail(code, evidence = null) {
  throw new Phase6iIndependentClosureReviewError(code, code, evidence);
}
