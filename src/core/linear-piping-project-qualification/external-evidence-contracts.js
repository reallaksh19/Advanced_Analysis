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

const RUNTIME_KEYS = Object.freeze([
  'runtimeName', 'runtimeVersion', 'operatingSystem', 'architecture',
  'dependencyLockHash',
]);
const MODEL_ENVELOPE_KEYS = Object.freeze([
  'nodeCount', 'elementCount', 'loadCaseCount', 'interfaceCount', 'codeCheckCount',
]);
const TIMING_KEYS = Object.freeze(['stage', 'durationMs']);
const MEMORY_KEYS = Object.freeze(['peakResidentBytes', 'measurementMethod', 'sourceSemanticHash']);
const REPLAY_KEYS = Object.freeze([
  'runCount', 'resultSemanticHashes', 'exportByteHashes', 'status',
]);
const FAILURE_KEYS = Object.freeze(['cancellationStatus', 'invalidInputStatus']);
const DECLARED_ENVELOPE_KEYS = Object.freeze([
  'maxNodes', 'maxElements', 'maxLoadCases', 'maxStageDurationMs',
  'maxPeakResidentBytes', 'source',
]);
const SOURCE_EVIDENCE_KEYS = Object.freeze(['documentId', 'revision', 'sourceSemanticHash']);
const COMMAND_KEYS = Object.freeze(['commandId', 'commandText', 'commandHash', 'logHash']);
const MIGRATION_KEYS = Object.freeze(['classification', 'details']);
const ROLLBACK_CHECK_KEYS = Object.freeze(['checkId', 'status', 'evidenceHash']);
const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const PROHIBITED_EVIDENCE_TOKEN = /(?:^|[^A-Z0-9])(?:FICTIONAL|SIMULATED|MOCK|FIXTURE|TEST|EXAMPLE|DEMO|PLACEHOLDER|TBD|UNKNOWN)(?:$|[^A-Z0-9])/u;

export function sealPerformanceEvidence(source) {
  exactKeys(source, PERFORMANCE_EVIDENCE_KEYS, 'performanceEvidence');
  if (source.schema !== PERFORMANCE_EVIDENCE_SCHEMA) {
    failQualification('Performance evidence schema is invalid.', 'PIPING_PERFORMANCE_EVIDENCE_INVALID');
  }
  const draft = {
    schema: source.schema,
    evidenceId: requireExternalText(source.evidenceId, 'performanceEvidence.evidenceId'),
    exactHead: requireHead(source.exactHead, 'performanceEvidence.exactHead'),
    runtimeIdentity: canonicalRuntimeIdentity(source.runtimeIdentity),
    modelEnvelope: canonicalModelEnvelope(source.modelEnvelope),
    stageTimings: canonicalStageTimings(source.stageTimings),
    memoryEvidence: canonicalMemoryEvidence(source.memoryEvidence),
    deterministicReplay: canonicalReplay(source.deterministicReplay),
    failureBehavior: canonicalFailureBehavior(source.failureBehavior),
    declaredEnvelope: canonicalDeclaredEnvelope(source.declaredEnvelope),
    exceededLimits: canonicalPlainTextArray(
      source.exceededLimits,
      'performanceEvidence.exceededLimits',
    ),
    sourceEvidence: canonicalSourceEvidence(
      source.sourceEvidence,
      'performanceEvidence.sourceEvidence',
    ),
    reviewer: requireExternalText(source.reviewer, 'performanceEvidence.reviewer'),
    reviewedAtUtc: requireUtc(source.reviewedAtUtc, 'performanceEvidence.reviewedAtUtc'),
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = semanticHash(performanceSemanticProjection(draft));
  draft.evidenceHash = semanticHash(performanceEvidenceProjection(draft));
  requireOptionalHashMatch(
    source,
    draft,
    'PIPING_PERFORMANCE_EVIDENCE_HASH_MISMATCH',
  );
  return deepFreeze(draft);
}

export function requirePerformanceEvidence(record) {
  const sealed = sealPerformanceEvidence(record);
  requireCurrentHashes(
    record,
    sealed,
    'PIPING_PERFORMANCE_EVIDENCE_HASH_MISMATCH',
  );
  return sealed;
}

export function sealRollbackEvidence(source) {
  exactKeys(source, ROLLBACK_EVIDENCE_KEYS, 'rollbackEvidence');
  if (source.schema !== ROLLBACK_EVIDENCE_SCHEMA) {
    failQualification('Rollback evidence schema is invalid.', 'PIPING_ROLLBACK_EVIDENCE_INVALID');
  }
  const draft = {
    schema: source.schema,
    evidenceId: requireExternalText(source.evidenceId, 'rollbackEvidence.evidenceId'),
    qualifiedHead: requireHead(source.qualifiedHead, 'rollbackEvidence.qualifiedHead'),
    rollbackTarget: requireHead(source.rollbackTarget, 'rollbackEvidence.rollbackTarget'),
    releaseCommand: canonicalCommand(source.releaseCommand, 'rollbackEvidence.releaseCommand'),
    rollbackCommand: canonicalCommand(source.rollbackCommand, 'rollbackEvidence.rollbackCommand'),
    migrationImpact: canonicalMigrationImpact(source.migrationImpact),
    restoredApplicationPath: requireBoolean(
      source.restoredApplicationPath,
      'rollbackEvidence.restoredApplicationPath',
    ),
    preservedProjectData: requireBoolean(
      source.preservedProjectData,
      'rollbackEvidence.preservedProjectData',
    ),
    postRollbackChecks: canonicalRollbackChecks(source.postRollbackChecks),
    sourceEvidence: canonicalSourceEvidence(
      source.sourceEvidence,
      'rollbackEvidence.sourceEvidence',
    ),
    reviewer: requireExternalText(source.reviewer, 'rollbackEvidence.reviewer'),
    completedAtUtc: requireUtc(source.completedAtUtc, 'rollbackEvidence.completedAtUtc'),
    semanticHash: '',
    evidenceHash: '',
  };
  if (draft.qualifiedHead === draft.rollbackTarget) {
    failQualification('Rollback target must differ from the qualified head.', 'PIPING_ROLLBACK_TARGET_INVALID');
  }
  draft.semanticHash = semanticHash(rollbackSemanticProjection(draft));
  draft.evidenceHash = semanticHash(rollbackEvidenceProjection(draft));
  requireOptionalHashMatch(source, draft, 'PIPING_ROLLBACK_EVIDENCE_HASH_MISMATCH');
  return deepFreeze(draft);
}

export function requireRollbackEvidence(record) {
  const sealed = sealRollbackEvidence(record);
  requireCurrentHashes(record, sealed, 'PIPING_ROLLBACK_EVIDENCE_HASH_MISMATCH');
  return sealed;
}

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

function canonicalRuntimeIdentity(source) {
  exactKeys(source, RUNTIME_KEYS, 'performanceEvidence.runtimeIdentity');
  return deepFreeze({
    runtimeName: requireExternalText(source.runtimeName, 'runtimeIdentity.runtimeName'),
    runtimeVersion: requireExternalText(source.runtimeVersion, 'runtimeIdentity.runtimeVersion'),
    operatingSystem: requireExternalText(
      source.operatingSystem,
      'runtimeIdentity.operatingSystem',
    ),
    architecture: requireExternalText(source.architecture, 'runtimeIdentity.architecture'),
    dependencyLockHash: requireHash(
      source.dependencyLockHash,
      'runtimeIdentity.dependencyLockHash',
    ),
  });
}

function canonicalModelEnvelope(source) {
  exactKeys(source, MODEL_ENVELOPE_KEYS, 'performanceEvidence.modelEnvelope');
  return deepFreeze(Object.fromEntries(MODEL_ENVELOPE_KEYS.map((key) => [
    key,
    requireNonnegativeInteger(source[key], `modelEnvelope.${key}`),
  ])));
}

function canonicalStageTimings(source) {
  requireArray(source, 'performanceEvidence.stageTimings');
  const timings = source.map((row, index) => {
    exactKeys(row, TIMING_KEYS, `performanceEvidence.stageTimings[${index}]`);
    if (!REQUIRED_PERFORMANCE_STAGES.includes(row.stage)) {
      failQualification('Performance stage is unsupported.', 'PIPING_PERFORMANCE_STAGE_INVALID');
    }
    return deepFreeze({
      stage: row.stage,
      durationMs: requireNonnegativeFinite(
        row.durationMs,
        `stageTimings[${index}].durationMs`,
      ),
    });
  }).sort((left, right) => compareAscii(left.stage, right.stage));
  if (new Set(timings.map((row) => row.stage)).size !== timings.length
    || JSON.stringify(timings.map((row) => row.stage))
      !== JSON.stringify(REQUIRED_PERFORMANCE_STAGES)) {
    failQualification(
      'Performance stages are incomplete or duplicated.',
      'PIPING_PERFORMANCE_STAGE_COVERAGE_INVALID',
    );
  }
  return deepFreeze(timings);
}

function canonicalMemoryEvidence(source) {
  exactKeys(source, MEMORY_KEYS, 'performanceEvidence.memoryEvidence');
  return deepFreeze({
    peakResidentBytes: requireNonnegativeInteger(
      source.peakResidentBytes,
      'memoryEvidence.peakResidentBytes',
    ),
    measurementMethod: requireExternalText(
      source.measurementMethod,
      'memoryEvidence.measurementMethod',
    ),
    sourceSemanticHash: requireHash(
      source.sourceSemanticHash,
      'memoryEvidence.sourceSemanticHash',
    ),
  });
}

function canonicalReplay(source) {
  exactKeys(source, REPLAY_KEYS, 'performanceEvidence.deterministicReplay');
  const runCount = requireNonnegativeInteger(
    source.runCount,
    'deterministicReplay.runCount',
  );
  if (runCount < 2 || source.status !== 'PASS') {
    failQualification(
      'Deterministic replay must contain at least two passing runs.',
      'PIPING_PERFORMANCE_REPLAY_INVALID',
    );
  }
  const resultSemanticHashes = canonicalHashArray(
    source.resultSemanticHashes,
    'deterministicReplay.resultSemanticHashes',
  );
  const exportByteHashes = canonicalHashArray(
    source.exportByteHashes,
    'deterministicReplay.exportByteHashes',
  );
  if (resultSemanticHashes.length !== runCount
    || exportByteHashes.length !== runCount
    || new Set(resultSemanticHashes).size !== 1
    || new Set(exportByteHashes).size !== 1) {
    failQualification('Deterministic replay hashes disagree.', 'PIPING_PERFORMANCE_REPLAY_INVALID');
  }
  return deepFreeze({ runCount, resultSemanticHashes, exportByteHashes, status: source.status });
}

function canonicalFailureBehavior(source) {
  exactKeys(source, FAILURE_KEYS, 'performanceEvidence.failureBehavior');
  if (source.cancellationStatus !== 'PASS' || source.invalidInputStatus !== 'PASS') {
    failQualification(
      'Failure-behavior checks must pass.',
      'PIPING_PERFORMANCE_FAILURE_BEHAVIOR_INVALID',
    );
  }
  return deepFreeze({ ...source });
}

function canonicalDeclaredEnvelope(source) {
  exactKeys(source, DECLARED_ENVELOPE_KEYS, 'performanceEvidence.declaredEnvelope');
  return deepFreeze({
    maxNodes: requireNonnegativeInteger(source.maxNodes, 'declaredEnvelope.maxNodes'),
    maxElements: requireNonnegativeInteger(
      source.maxElements,
      'declaredEnvelope.maxElements',
    ),
    maxLoadCases: requireNonnegativeInteger(
      source.maxLoadCases,
      'declaredEnvelope.maxLoadCases',
    ),
    maxStageDurationMs: requireNonnegativeFinite(
      source.maxStageDurationMs,
      'declaredEnvelope.maxStageDurationMs',
    ),
    maxPeakResidentBytes: requireNonnegativeInteger(
      source.maxPeakResidentBytes,
      'declaredEnvelope.maxPeakResidentBytes',
    ),
    source: requireExternalText(source.source, 'declaredEnvelope.source'),
  });
}

function canonicalCommand(source, field) {
  exactKeys(source, COMMAND_KEYS, field);
  const commandText = nonEmptyString(source.commandText, `${field}.commandText`);
  const commandHash = requireHash(source.commandHash, `${field}.commandHash`);
  if (commandHash !== semanticHash({ commandText })) {
    failQualification(`${field}.commandHash is stale.`, 'PIPING_ROLLBACK_COMMAND_HASH_MISMATCH');
  }
  return deepFreeze({
    commandId: nonEmptyString(source.commandId, `${field}.commandId`),
    commandText,
    commandHash,
    logHash: requireHash(source.logHash, `${field}.logHash`),
  });
}

function canonicalMigrationImpact(source) {
  exactKeys(source, MIGRATION_KEYS, 'rollbackEvidence.migrationImpact');
  if (!['NONE', 'REVERSIBLE', 'MANUAL'].includes(source.classification)) {
    failQualification(
      'Migration-impact classification is invalid.',
      'PIPING_ROLLBACK_MIGRATION_INVALID',
    );
  }
  return deepFreeze({
    classification: source.classification,
    details: nonEmptyString(source.details, 'rollbackEvidence.migrationImpact.details'),
  });
}

function canonicalRollbackChecks(source) {
  requireArray(source, 'rollbackEvidence.postRollbackChecks');
  if (source.length === 0) {
    failQualification('Rollback checks must not be empty.', 'PIPING_ROLLBACK_CHECKS_INVALID');
  }
  const checks = source.map((row, index) => {
    exactKeys(row, ROLLBACK_CHECK_KEYS, `rollbackEvidence.postRollbackChecks[${index}]`);
    if (row.status !== 'PASS') {
      failQualification('Rollback checks must pass.', 'PIPING_ROLLBACK_CHECKS_INVALID');
    }
    return deepFreeze({
      checkId: nonEmptyString(row.checkId, `postRollbackChecks[${index}].checkId`),
      status: row.status,
      evidenceHash: requireHash(
        row.evidenceHash,
        `postRollbackChecks[${index}].evidenceHash`,
      ),
    });
  }).sort((left, right) => compareAscii(left.checkId, right.checkId));
  if (new Set(checks.map((row) => row.checkId)).size !== checks.length) {
    failQualification('Rollback check IDs must be unique.', 'PIPING_ROLLBACK_CHECKS_INVALID');
  }
  return deepFreeze(checks);
}

function canonicalSourceEvidence(source, field) {
  exactKeys(source, SOURCE_EVIDENCE_KEYS, field);
  return deepFreeze({
    documentId: requireExternalText(source.documentId, `${field}.documentId`),
    revision: requireExternalText(source.revision, `${field}.revision`),
    sourceSemanticHash: requireHash(source.sourceSemanticHash, `${field}.sourceSemanticHash`),
  });
}

function canonicalHashArray(source, field) {
  requireArray(source, field);
  return deepFreeze(source.map((value, index) => requireHash(value, `${field}[${index}]`)));
}

function canonicalPlainTextArray(source, field) {
  requireArray(source, field);
  const values = source.map((value, index) => nonEmptyString(value, `${field}[${index}]`));
  return deepFreeze([...new Set(values)].sort(compareAscii));
}

function requireArray(value, field) {
  if (!Array.isArray(value)) {
    failQualification(`${field} must be an array.`, 'PIPING_EXTERNAL_EVIDENCE_ARRAY_REQUIRED');
  }
  return value;
}

function requireNonnegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    failQualification(
      `${field} must be a non-negative integer.`,
      'PIPING_EXTERNAL_EVIDENCE_NUMBER_INVALID',
    );
  }
  return value;
}

function requireNonnegativeFinite(value, field) {
  const number = finiteNumber(value, field);
  if (number < 0) {
    failQualification(`${field} must be non-negative.`, 'PIPING_EXTERNAL_EVIDENCE_NUMBER_INVALID');
  }
  return number;
}

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    failQualification(`${field} must be boolean.`, 'PIPING_EXTERNAL_EVIDENCE_BOOLEAN_INVALID');
  }
  return value;
}

function requireUtc(value, field) {
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

function requireOptionalHashMatch(source, draft, code) {
  if ((source.semanticHash !== '' && source.semanticHash !== draft.semanticHash)
    || (source.evidenceHash !== '' && source.evidenceHash !== draft.evidenceHash)) {
    failQualification('External evidence hash is stale.', code);
  }
}

function requireCurrentHashes(record, sealed, code) {
  if (record.semanticHash !== sealed.semanticHash || record.evidenceHash !== sealed.evidenceHash) {
    failQualification('External evidence must carry current hashes.', code);
  }
}

function performanceSemanticProjection(record) {
  const {
    sourceEvidence: _sourceEvidence,
    reviewer: _reviewer,
    reviewedAtUtc: _reviewedAtUtc,
    semanticHash: _semanticHash,
    evidenceHash: _evidenceHash,
    ...projection
  } = record;
  return projection;
}

function performanceEvidenceProjection(record) {
  return {
    semanticHash: record.semanticHash,
    sourceEvidence: record.sourceEvidence,
    reviewer: record.reviewer,
    reviewedAtUtc: record.reviewedAtUtc,
  };
}

function rollbackSemanticProjection(record) {
  const {
    sourceEvidence: _sourceEvidence,
    reviewer: _reviewer,
    completedAtUtc: _completedAtUtc,
    semanticHash: _semanticHash,
    evidenceHash: _evidenceHash,
    ...projection
  } = record;
  return projection;
}

function rollbackEvidenceProjection(record) {
  return {
    semanticHash: record.semanticHash,
    sourceEvidence: record.sourceEvidence,
    reviewer: record.reviewer,
    completedAtUtc: record.completedAtUtc,
    commandLogs: [record.releaseCommand.logHash, record.rollbackCommand.logHash],
    checkEvidenceHashes: record.postRollbackChecks.map((row) => row.evidenceHash),
  };
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
