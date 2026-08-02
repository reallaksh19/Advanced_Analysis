#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_REPLAY_INPUT_SCHEMA,
  createLafeaBucket01ReplayCustody,
  validateLafeaBucket01ReplayCustody,
} from '../src/workspace/lafea-bucket-01-replay-custody.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_PATH = path.join(
  ROOT,
  'validation/bucket-01/10-three-replay-intake-template.json',
);
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_REPLAY_CONTRACT_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-three-replay-contract.json',
);
const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

validateTemplate(template);
const input = fixtureInput();
const packageValue = createLafeaBucket01ReplayCustody(input);
assert.equal(validateLafeaBucket01ReplayCustody(packageValue).ok, true);
assert.equal(packageValue.status, 'THREE_REPLAY_CUSTODY_PASS');
assert.equal(packageValue.replayCount, 3);
assert.equal(packageValue.authority.bucketQualified, false);

assertRejected(
  { ...input, replays: input.replays.slice(0, 2) },
  'LAFEA_B01_REPLAY_EXACTLY_THREE_REQUIRED',
);
assertRejected(
  {
    ...input,
    replays: input.replays.map((row, index) => index === 2
      ? { ...row, replayId: input.replays[0].replayId }
      : row),
  },
  'LAFEA_B01_REPLAY_IDS_NOT_DISTINCT',
);
assertRejected(
  {
    ...input,
    replays: input.replays.map((row, index) => index === 1
      ? { ...row, exactHeadSha: 'f'.repeat(40) }
      : row),
  },
  'LAFEA_B01_REPLAY_EXACT_HEAD_MISMATCH',
);
assertRejected(
  {
    ...input,
    replays: input.replays.map((row, index) => index === 1
      ? { ...row, exitCode: 1 }
      : row),
  },
  'LAFEA_B01_REPLAY_NONZERO_EXIT',
);
assertRejected(
  {
    ...input,
    replays: input.replays.map((row, index) => index === 1
      ? { ...row, trackedTreeClean: false }
      : row),
  },
  'LAFEA_B01_REPLAY_TRACKED_TREE_DIRTY',
);
assertRejected(
  {
    ...input,
    replays: input.replays.map((row, index) => index === 1
      ? { ...row, exactHeadReportStatus: 'EXACT_HEAD_REPAIR_EVIDENCE_BLOCKED' }
      : row),
  },
  'LAFEA_B01_REPLAY_EXACT_HEAD_REPORT_NOT_PASS',
);
const changedReports = structuredClone(input.replays);
changedReports[1].reportHashes.productionExecution = `sha256:${'9'.repeat(64)}`;
changedReports[1].evidenceSetHash = evidenceHash(changedReports[1]);
assertRejected(
  { ...input, replays: changedReports },
  'LAFEA_B01_REPLAY_DETERMINISTIC_IDENTITY_MISMATCH',
);
const wrongEvidence = structuredClone(input.replays);
wrongEvidence[1].evidenceSetHash = `sha256:${'8'.repeat(64)}`;
assertRejected(
  { ...input, replays: wrongEvidence },
  'LAFEA_B01_REPLAY_EVIDENCE_SET_HASH_MISMATCH',
);
const tampered = structuredClone(packageValue);
tampered.replays[0].reportHashes.repairReport = `sha256:${'7'.repeat(64)}`;
assert.equal(validateLafeaBucket01ReplayCustody(tampered).ok, false);

const reportBase = {
  schema: 'lafea-bucket-01-three-replay-contract-evidence/v1',
  producerRevision: 'B01-THREE-REPLAY-CONTRACT.1',
  templateHash: canonicalLafeaSha256(template),
  templateStatus: template.status,
  syntheticFixtureSemanticHash: packageValue.semanticHash,
  rejectionCases: [
    'TWO_REPLAYS_ONLY',
    'DUPLICATE_REPLAY_ID',
    'EXACT_HEAD_MISMATCH',
    'NONZERO_EXIT',
    'DIRTY_TRACKED_TREE',
    'BLOCKED_EXACT_HEAD_REPORT',
    'DIVERGENT_REPORT_HASH',
    'EVIDENCE_SET_HASH_MISMATCH',
    'TAMPERED_PACKAGE',
  ],
  authority: {
    replayCustodyContractImplemented: true,
    externalReplayBundlesSupplied: false,
    syntheticFixtureEligibleAsExecutionEvidence: false,
    replayPassClaimedForRepositoryCandidate: false,
    contractVerified: false,
    solverVerified: false,
    stressVerified: false,
    codeVerified: false,
    integrationVerified: false,
    bucketQualified: false,
  },
  status: 'CONTRACT_PASS_THREE_REPLAYS_UNRESOLVED',
};
const report = { ...reportBase, evidenceHash: canonicalLafeaSha256(reportBase) };
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));

function fixtureInput() {
  const exactHeadSha = 'a'.repeat(40);
  const reportHashes = {
    exactHeadReport: `sha256:${'1'.repeat(64)}`,
    repairReport: `sha256:${'2'.repeat(64)}`,
    productionProjection: `sha256:${'3'.repeat(64)}`,
    productionExecution: `sha256:${'4'.repeat(64)}`,
    productionResponse: `sha256:${'5'.repeat(64)}`,
    productionLugStress: `sha256:${'6'.repeat(64)}`,
    codeBasisPackage: `sha256:${'7'.repeat(64)}`,
  };
  const replays = ['REPLAY-01', 'REPLAY-02', 'REPLAY-03'].map((replayId) => {
    const row = {
      replayId,
      exactHeadSha,
      exitCode: 0,
      trackedTreeClean: true,
      exactHeadMatched: true,
      baselineAncestorConfirmed: true,
      exactHeadReportStatus: 'EXACT_HEAD_REPAIR_EVIDENCE_PASS',
      reportHashes: { ...reportHashes },
      stdoutHash: `sha256:${'8'.repeat(64)}`,
      stderrHash: `sha256:${'0'.repeat(64)}`,
    };
    return { ...row, evidenceSetHash: evidenceHash(row) };
  });
  return {
    schema: LAFEA_BUCKET_01_REPLAY_INPUT_SCHEMA,
    custodyId: 'SYNTHETIC-THREE-REPLAY-CONTRACT-FIXTURE',
    exactHeadSha,
    baselineSha: 'b'.repeat(40),
    commandHash: `sha256:${'c'.repeat(64)}`,
    toolchainHash: `sha256:${'d'.repeat(64)}`,
    definitionSetHash: `sha256:${'e'.repeat(64)}`,
    replays,
  };
}

function evidenceHash(row) {
  return canonicalLafeaSha256({
    schema: 'lafea-bucket-01-replay-evidence-set/v1',
    exactHeadSha: row.exactHeadSha,
    exitCode: row.exitCode,
    trackedTreeClean: row.trackedTreeClean,
    exactHeadMatched: row.exactHeadMatched,
    baselineAncestorConfirmed: row.baselineAncestorConfirmed,
    exactHeadReportStatus: row.exactHeadReportStatus,
    reportHashes: row.reportHashes,
    stdoutHash: row.stdoutHash,
    stderrHash: row.stderrHash,
  });
}

function validateTemplate(value) {
  assert.equal(value.schema, 'lafea-bucket-01-three-replay-intake-template/v1');
  assert.equal(value.status, 'UNRESOLVED_GATE');
  assert.equal(value.requiredReplayCount, 3);
  assert.equal(value.requiredGlobalIdentity.exactHeadSha, null);
  assert.equal(value.requiredPerReplay.reportHashes.productionExecution, null);
  assert.equal(value.currentDisposition, 'THREE_EXTERNAL_REPLAY_BUNDLES_NOT_SUPPLIED');
}

function assertRejected(value, expectedCode) {
  assert.throws(
    () => createLafeaBucket01ReplayCustody(value),
    (error) => error?.code === expectedCode,
  );
}
