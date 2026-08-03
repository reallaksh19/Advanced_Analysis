import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_BUCKET_01_REPLAY_INPUT_SCHEMA =
  'lafea-bucket-01-three-replay-input/v1';
export const LAFEA_BUCKET_01_REPLAY_PACKAGE_SCHEMA =
  'lafea-bucket-01-three-replay-package/v1';
export const LAFEA_BUCKET_01_REPLAY_REVISION = 'B01-REPLAY-CUSTODY.1';

const INPUT_KEYS = Object.freeze([
  'schema', 'custodyId', 'exactHeadSha', 'baselineSha', 'commandHash',
  'toolchainHash', 'definitionSetHash', 'replays',
]);
const REPLAY_KEYS = Object.freeze([
  'replayId', 'exactHeadSha', 'exitCode', 'trackedTreeClean',
  'exactHeadMatched', 'baselineAncestorConfirmed', 'exactHeadReportStatus',
  'reportHashes', 'stdoutHash', 'stderrHash', 'evidenceSetHash',
]);
const REPORT_KEYS = Object.freeze([
  'exactHeadReport', 'repairReport', 'productionProjection',
  'productionExecution', 'productionResponse', 'productionLugStress',
  'codeBasisPackage',
]);
const PASS_STATUS = 'EXACT_HEAD_REPAIR_EVIDENCE_PASS';

export function createLafeaBucket01ReplayCustody(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'replay custody input');
  if (inputValue.schema !== LAFEA_BUCKET_01_REPLAY_INPUT_SCHEMA) {
    throw replayError('LAFEA_B01_REPLAY_INPUT_SCHEMA_INVALID');
  }
  const exactHeadSha = gitSha(inputValue.exactHeadSha, 'exactHeadSha');
  const baselineSha = gitSha(inputValue.baselineSha, 'baselineSha');
  const commandHash = sha256(inputValue.commandHash, 'commandHash');
  const toolchainHash = sha256(inputValue.toolchainHash, 'toolchainHash');
  const definitionSetHash = sha256(
    inputValue.definitionSetHash,
    'definitionSetHash',
  );
  const replays = normalizeReplays(inputValue.replays, exactHeadSha);
  assertDeterministicIdentity(replays);
  const semanticBase = {
    schema: LAFEA_BUCKET_01_REPLAY_PACKAGE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_REPLAY_REVISION,
    custodyId: text(inputValue.custodyId, 'custodyId'),
    exactHeadSha,
    baselineSha,
    commandHash,
    toolchainHash,
    definitionSetHash,
    replayCount: replays.length,
    replayIds: replays.map((row) => row.replayId),
    replays,
    deterministicIdentity: {
      exactHeadSha,
      evidenceSetHash: replays[0].evidenceSetHash,
      reportHashes: replays[0].reportHashes,
      stdoutHash: replays[0].stdoutHash,
      stderrHash: replays[0].stderrHash,
      allThreeIdentical: true,
    },
    status: 'THREE_REPLAY_CUSTODY_PASS',
    authority: {
      exactHeadReplayedThreeTimes: true,
      cleanTrackedTreeEachReplay: true,
      semanticEvidenceIdentical: true,
      failedReplayOmitted: false,
      executionResultsManufactured: false,
      contractVerified: false,
      meshVerified: false,
      solverVerified: false,
      stressVerified: false,
      codeVerified: false,
      integrationVerified: false,
      bucketQualified: false,
    },
  };
  const semanticHash = canonicalLafeaSha256(semanticBase);
  return deepFreeze({
    ...semanticBase,
    semanticHash,
    evidenceHash: canonicalLafeaSha256({
      schema: 'lafea-bucket-01-three-replay-package-evidence/v1',
      semanticHash,
      evidenceSetHash: replays[0].evidenceSetHash,
      replayIds: replays.map((row) => row.replayId),
    }),
  });
}

export function validateLafeaBucket01ReplayCustody(value) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_REPLAY_PACKAGE_SCHEMA
      || value.producerRevision !== LAFEA_BUCKET_01_REPLAY_REVISION
      || value.status !== 'THREE_REPLAY_CUSTODY_PASS'
      || value.replayCount !== 3
      || value.authority?.exactHeadReplayedThreeTimes !== true
      || value.authority?.semanticEvidenceIdentical !== true
      || value.authority?.bucketQualified !== false) {
      throw replayError('LAFEA_B01_REPLAY_PACKAGE_INVALID');
    }
    const rebuilt = createLafeaBucket01ReplayCustody({
      schema: LAFEA_BUCKET_01_REPLAY_INPUT_SCHEMA,
      custodyId: value.custodyId,
      exactHeadSha: value.exactHeadSha,
      baselineSha: value.baselineSha,
      commandHash: value.commandHash,
      toolchainHash: value.toolchainHash,
      definitionSetHash: value.definitionSetHash,
      replays: value.replays,
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw replayError('LAFEA_B01_REPLAY_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw replayError('LAFEA_B01_REPLAY_PACKAGE_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_REPLAY_PACKAGE_INVALID'],
    });
  }
}

function normalizeReplays(value, exactHeadSha) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw replayError('LAFEA_B01_REPLAY_EXACTLY_THREE_REQUIRED');
  }
  const replays = value.map((row, index) => normalizeReplay(
    row,
    exactHeadSha,
    index,
  ));
  if (new Set(replays.map((row) => row.replayId)).size !== 3) {
    throw replayError('LAFEA_B01_REPLAY_IDS_NOT_DISTINCT');
  }
  return deepFreeze(replays.sort((left, right) =>
    left.replayId.localeCompare(right.replayId)));
}

function normalizeReplay(value, exactHeadSha, index) {
  exactKeys(value, REPLAY_KEYS, `replays[${index}]`);
  const replayId = text(value.replayId, `replays[${index}].replayId`);
  const replayHead = gitSha(
    value.exactHeadSha,
    `replays[${index}].exactHeadSha`,
  );
  if (replayHead !== exactHeadSha) {
    throw replayError('LAFEA_B01_REPLAY_EXACT_HEAD_MISMATCH');
  }
  if (value.exitCode !== 0) {
    throw replayError('LAFEA_B01_REPLAY_NONZERO_EXIT');
  }
  requireTrue(value.trackedTreeClean, 'LAFEA_B01_REPLAY_TRACKED_TREE_DIRTY');
  requireTrue(value.exactHeadMatched, 'LAFEA_B01_REPLAY_HEAD_ASSERTION_FAILED');
  requireTrue(
    value.baselineAncestorConfirmed,
    'LAFEA_B01_REPLAY_BASELINE_ANCESTRY_FAILED',
  );
  if (value.exactHeadReportStatus !== PASS_STATUS) {
    throw replayError('LAFEA_B01_REPLAY_EXACT_HEAD_REPORT_NOT_PASS');
  }
  const reportHashes = normalizeReportHashes(value.reportHashes, index);
  const stdoutHash = sha256(value.stdoutHash, `replays[${index}].stdoutHash`);
  const stderrHash = sha256(value.stderrHash, `replays[${index}].stderrHash`);
  const evidenceBasis = {
    schema: 'lafea-bucket-01-replay-evidence-set/v1',
    exactHeadSha: replayHead,
    exitCode: 0,
    trackedTreeClean: true,
    exactHeadMatched: true,
    baselineAncestorConfirmed: true,
    exactHeadReportStatus: PASS_STATUS,
    reportHashes,
    stdoutHash,
    stderrHash,
  };
  const evidenceSetHash = sha256(
    value.evidenceSetHash,
    `replays[${index}].evidenceSetHash`,
  );
  if (canonicalLafeaSha256(evidenceBasis) !== evidenceSetHash) {
    throw replayError('LAFEA_B01_REPLAY_EVIDENCE_SET_HASH_MISMATCH');
  }
  return deepFreeze({
    replayId,
    exactHeadSha: evidenceBasis.exactHeadSha,
    exitCode: evidenceBasis.exitCode,
    trackedTreeClean: evidenceBasis.trackedTreeClean,
    exactHeadMatched: evidenceBasis.exactHeadMatched,
    baselineAncestorConfirmed: evidenceBasis.baselineAncestorConfirmed,
    exactHeadReportStatus: evidenceBasis.exactHeadReportStatus,
    reportHashes: evidenceBasis.reportHashes,
    stdoutHash: evidenceBasis.stdoutHash,
    stderrHash: evidenceBasis.stderrHash,
    evidenceSetHash,
  });
}

function normalizeReportHashes(value, replayIndex) {
  exactKeys(value, REPORT_KEYS, `replays[${replayIndex}].reportHashes`);
  return deepFreeze(Object.fromEntries(REPORT_KEYS.map((key) => [
    key,
    sha256(value[key], `replays[${replayIndex}].reportHashes.${key}`),
  ])));
}

function assertDeterministicIdentity(replays) {
  for (const key of ['evidenceSetHash', 'stdoutHash', 'stderrHash']) {
    if (new Set(replays.map((row) => row[key])).size !== 1) {
      throw replayError('LAFEA_B01_REPLAY_DETERMINISTIC_IDENTITY_MISMATCH');
    }
  }
  for (const reportKey of REPORT_KEYS) {
    if (new Set(replays.map((row) => row.reportHashes[reportKey])).size !== 1) {
      throw replayError('LAFEA_B01_REPLAY_REPORT_HASH_MISMATCH');
    }
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw replayError('LAFEA_B01_REPLAY_RECORD_INVALID', label);
  }
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw replayError('LAFEA_B01_REPLAY_EXACT_KEYS_INVALID', label);
  }
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw replayError('LAFEA_B01_REPLAY_TEXT_REQUIRED', label);
  }
  return value.trim();
}
function gitSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw replayError('LAFEA_B01_REPLAY_GIT_SHA_REQUIRED', label);
  }
  return value;
}
function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw replayError('LAFEA_B01_REPLAY_SHA256_REQUIRED', label);
  }
  return value;
}
function requireTrue(value, code) { if (value !== true) throw replayError(code); }
function replayError(code, message = code) { const error = new TypeError(message); error.code = code; return error; }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
