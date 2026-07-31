import { exactKeys } from '../shared-analysis-contract/validation.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { compareAscii, failQualification } from './contracts.js';
import {
  PERFORMANCE_EVIDENCE_KEYS,
  PERFORMANCE_EVIDENCE_SCHEMA,
  REQUIRED_PERFORMANCE_STAGES,
  canonicalHashArray,
  canonicalPlainTextArray,
  canonicalSourceEvidence,
  requireCurrentHashes,
  requireExternalText,
  requireHash,
  requireHead,
  requireNonnegativeFinite,
  requireNonnegativeInteger,
  requireOptionalHashMatch,
  requireUtc,
  requireArray,
} from './external-evidence-contracts.js';

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
  requireOptionalHashMatch(source, draft, 'PIPING_PERFORMANCE_EVIDENCE_HASH_MISMATCH');
  return deepFreeze(draft);
}

export function requirePerformanceEvidence(record) {
  const sealed = sealPerformanceEvidence(record);
  requireCurrentHashes(record, sealed, 'PIPING_PERFORMANCE_EVIDENCE_HASH_MISMATCH');
  return sealed;
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
  const stages = timings.map((row) => row.stage);
  if (new Set(stages).size !== stages.length
    || JSON.stringify(stages) !== JSON.stringify(REQUIRED_PERFORMANCE_STAGES)) {
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
