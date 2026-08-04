#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exactHeadSha = process.env.EXPECTED_HEAD_SHA?.trim() || git(['rev-parse', 'HEAD']);
const replayRoot = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_REPLAY_BUNDLE_ROOT
    ?? 'external/qualification/replays',
);
const inputPath = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_FINAL_REPLAY_INPUT_PATH
    ?? 'reports/qualification/lafea-bucket-01-final-replay-input.json',
);
const reportDirectory = path.resolve(ROOT, 'reports/qualification');
const reportFiles = {
  expectedValueDefinition: 'lafea-bucket-01-expected-value-registry.json',
  exactHeadReport: 'lafea-bucket-01-exact-head.json',
  repairReport: 'lafea-bucket-01-repair-check.json',
  productionProjection: 'lafea-bucket-01-production-projection.json',
  productionExecution: 'lafea-bucket-01-production-execution.json',
  productionResponse: 'lafea-bucket-01-production-response.json',
  kirschStress: 'lafea-bucket-01-kirsch-fixed-probes.json',
  productionLugStress: 'lafea-bucket-01-production-lug-fixed-probes.json',
  codeBasisPackage: 'lafea-bucket-01-code-basis.json',
  codeAssessment: 'lafea-bucket-01-code-assessment.json',
};

assert.ok(fs.existsSync(replayRoot), `Replay bundle root missing: ${replayRoot}`);
const rowFiles = findFiles(replayRoot, 'lafea-bucket-01-replay-row.json').sort();
assert.equal(rowFiles.length, 3, `Exactly three replay rows required; found ${rowFiles.length}.`);
const bundles = rowFiles.map((rowFile) => {
  const bundleRoot = path.dirname(rowFile);
  const reportRoot = path.join(bundleRoot, 'reports', 'qualification');
  const row = JSON.parse(fs.readFileSync(rowFile, 'utf8'));
  assert.ok(fs.existsSync(reportRoot), `Replay report directory missing: ${reportRoot}`);
  assert.equal(row.exactHeadSha, exactHeadSha);
  assert.equal(row.exitCode, 0);
  assert.equal(row.trackedTreeClean, true);
  assert.equal(row.exactHeadReportStatus, 'EXACT_HEAD_REPAIR_EVIDENCE_PASS');
  for (const [key, filename] of Object.entries(reportFiles)) {
    const source = path.join(reportRoot, filename);
    assert.ok(fs.existsSync(source), `${row.replayId} missing ${filename}`);
    assert.equal(rawHash(source), row.reportHashes[key], `${row.replayId} ${key} hash mismatch`);
  }
  return { rowFile, bundleRoot, reportRoot, row };
}).sort((left, right) => left.row.replayId.localeCompare(right.row.replayId));

assert.equal(new Set(bundles.map(({ row }) => row.replayId)).size, 3);
for (const field of ['evidenceSetHash', 'stdoutHash', 'stderrHash']) {
  assert.equal(new Set(bundles.map(({ row }) => row[field])).size, 1, `${field} differs across replays.`);
}
for (const key of Object.keys(reportFiles)) {
  assert.equal(
    new Set(bundles.map(({ row }) => row.reportHashes[key])).size,
    1,
    `${key} report hash differs across replays.`,
  );
}

fs.mkdirSync(reportDirectory, { recursive: true });
for (const filename of Object.values(reportFiles)) {
  fs.copyFileSync(
    path.join(bundles[0].reportRoot, filename),
    path.join(reportDirectory, filename),
  );
}
const definition = JSON.parse(fs.readFileSync(
  path.join(reportDirectory, reportFiles.expectedValueDefinition),
  'utf8',
));
assert.equal(definition.status, 'EXPECTED_VALUE_DEFINITION_SET_PASS');
const input = {
  schema: 'lafea-bucket-01-final-replay-input/v2',
  custodyId: `B01-FINAL-REPLAY-${exactHeadSha}`,
  exactHeadSha,
  definitionSetHash: definition.definitionSetHash,
  replays: bundles.map(({ row }) => row),
};
fs.writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
run('final-replay', 'scripts/lafea-bucket-01-final-replay-receipt.mjs');
run('final-qualification', 'scripts/lafea-bucket-01-final-qualification-check.mjs');

const finalReplay = JSON.parse(fs.readFileSync(
  path.join(reportDirectory, 'lafea-bucket-01-final-replay-custody.json'),
  'utf8',
));
const finalQualification = JSON.parse(fs.readFileSync(
  path.join(reportDirectory, 'lafea-bucket-01-final-qualification.json'),
  'utf8',
));
assert.equal(finalReplay.status, 'FINAL_THREE_REPLAY_CUSTODY_PASS');
assert.equal(finalReplay.replayCount, 3);
assert.equal(finalQualification.status, 'BUCKET_01_QUALIFIED');
assert.equal(finalQualification.qualificationStates.bucketQualified, true);
console.log(JSON.stringify({
  schema: 'lafea-bucket-01-production-qualification-finalizer/v1',
  exactHeadSha,
  replayCount: finalReplay.replayCount,
  qualificationStates: finalQualification.qualificationStates,
  finalReplayHash: finalReplay.semanticHash,
  finalQualificationHash: finalQualification.evidenceHash,
  status: finalQualification.status,
}));

function run(stageId, script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, EXPECTED_HEAD_SHA: exactHeadSha },
  });
  fs.writeFileSync(path.join(reportDirectory, `${stageId}.stdout.log`), result.stdout ?? '', 'utf8');
  fs.writeFileSync(path.join(reportDirectory, `${stageId}.stderr.log`), result.stderr ?? '', 'utf8');
  if (result.status !== 0 || result.error) {
    const detail = [result.error?.message, result.stderr, result.stdout]
      .filter(Boolean)
      .join('\n')
      .slice(-4000);
    throw new Error(`${stageId} failed with exit ${result.status}: ${detail}`);
  }
}
function findFiles(directory, targetName) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return findFiles(target, targetName);
    return entry.name === targetName ? [target] : [];
  });
}
function rawHash(file) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
}
function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0 || result.error) {
    throw new Error(result.stderr?.trim() || result.error?.message || `git ${args.join(' ')} failed.`);
  }
  return result.stdout.trim();
}
