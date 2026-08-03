#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT_PATH = path.resolve(ROOT, process.env.LAFEA_BUCKET_01_FINAL_REPLAY_INPUT_PATH
  ?? 'reports/qualification/lafea-bucket-01-final-replay-input.json');
const REPORT_PATH = path.resolve(ROOT, process.env.LAFEA_BUCKET_01_FINAL_REPLAY_REPORT_PATH
  ?? 'reports/qualification/lafea-bucket-01-final-replay-custody.json');
const exactHeadSha = process.env.EXPECTED_HEAD_SHA?.trim()
  || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const input = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
const reportKeys = [
  'exactHeadReport', 'repairReport', 'productionProjection', 'productionExecution',
  'productionResponse', 'productionLugStress', 'codeBasisPackage', 'codeAssessment',
];
assert.equal(input.schema, 'lafea-bucket-01-final-replay-input/v1');
assert.equal(input.exactHeadSha, exactHeadSha);
assert.match(input.definitionSetHash, /^sha256:[0-9a-f]{64}$/u);
assert.equal(input.replays.length, 3);
assert.equal(new Set(input.replays.map((row) => row.replayId)).size, 3);
const normalized = input.replays.map((row) => {
  assert.equal(row.exactHeadSha, exactHeadSha);
  assert.equal(row.exitCode, 0);
  assert.equal(row.trackedTreeClean, true);
  assert.equal(row.exactHeadReportStatus, 'EXACT_HEAD_REPAIR_EVIDENCE_PASS');
  assert.deepEqual(Object.keys(row.reportHashes).sort(), [...reportKeys].sort());
  for (const key of reportKeys) assert.match(row.reportHashes[key], /^sha256:[0-9a-f]{64}$/u);
  assert.match(row.stdoutHash, /^sha256:[0-9a-f]{64}$/u);
  assert.match(row.stderrHash, /^sha256:[0-9a-f]{64}$/u);
  const basis = {
    schema: 'lafea-bucket-01-final-replay-evidence-set/v1',
    exactHeadSha: row.exactHeadSha,
    exitCode: row.exitCode,
    trackedTreeClean: row.trackedTreeClean,
    exactHeadReportStatus: row.exactHeadReportStatus,
    reportHashes: row.reportHashes,
    stdoutHash: row.stdoutHash,
    stderrHash: row.stderrHash,
  };
  assert.equal(row.evidenceSetHash, canonicalLafeaSha256(basis));
  return { replayId: row.replayId, ...basis, evidenceSetHash: row.evidenceSetHash };
}).sort((a, b) => a.replayId.localeCompare(b.replayId));
for (const key of ['evidenceSetHash', 'stdoutHash', 'stderrHash']) {
  assert.equal(new Set(normalized.map((row) => row[key])).size, 1, `${key} differs`);
}
for (const key of reportKeys) {
  assert.equal(new Set(normalized.map((row) => row.reportHashes[key])).size, 1, `${key} differs`);
}
const base = {
  schema: 'lafea-bucket-01-final-replay-custody/v1',
  producerRevision: 'B01-FINAL-REPLAY.1',
  custodyId: input.custodyId,
  exactHeadSha,
  definitionSetHash: input.definitionSetHash,
  replayCount: 3,
  replays: normalized,
  deterministicReportHashes: normalized[0].reportHashes,
  status: 'FINAL_THREE_REPLAY_CUSTODY_PASS',
  authority: { externalReplaysSupplied: true, codeAssessmentReplayed: true, bucketQualified: false },
};
const report = { ...base, semanticHash: canonicalLafeaSha256(base) };
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
