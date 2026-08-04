#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exactHeadSha = git(['rev-parse', 'HEAD']);
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA?.trim() || exactHeadSha;
const replayId = requiredText(process.env.LAFEA_BUCKET_01_REPLAY_ID, 'LAFEA_BUCKET_01_REPLAY_ID');
const rowPath = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_REPLAY_ROW_PATH
    ?? 'reports/qualification/lafea-bucket-01-replay-row.json',
);
const logDirectory = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_REPLAY_LOG_DIRECTORY
    ?? `reports/qualification/replay-logs/${replayId}`,
);
const approvedInputPath = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_CODE_BASIS_INPUT_PATH
    ?? 'external/qualification/lafea-bucket-01-approved-code-basis-input.json',
);

assert.equal(exactHeadSha, expectedHeadSha, 'Replay checkout must match EXPECTED_HEAD_SHA.');
assert.ok(fs.existsSync(approvedInputPath), `Approved code-basis input missing: ${approvedInputPath}`);
fs.mkdirSync(logDirectory, { recursive: true });

const stages = [
  ['exact-head', 'scripts/lafea-bucket-01-exact-head-check.mjs'],
  ['expected-values', 'scripts/lafea-bucket-01-expected-value-registry-check.mjs'],
  ['production-execution', 'scripts/lafea-bucket-01-production-response-runner.mjs'],
  ['production-response', 'scripts/lafea-bucket-01-production-response-receipt.mjs'],
  ['kirsch-stress', 'scripts/lafea-bucket-01-kirsch-fixed-probes-check.mjs'],
  ['production-lug-stress', 'scripts/lafea-bucket-01-production-lug-probe-receipt.mjs'],
  ['code-basis', 'scripts/lafea-bucket-01-code-basis-receipt.mjs'],
  ['code-assessment', 'scripts/lafea-bucket-01-code-assessment.mjs'],
  ['final-adjudication-contract', 'scripts/lafea-bucket-01-final-adjudication-contract-check.mjs'],
];
for (const [stageId, script] of stages) runStage(stageId, script);

const reportPaths = {
  expectedValueDefinition: 'reports/qualification/lafea-bucket-01-expected-value-registry.json',
  exactHeadReport: 'reports/qualification/lafea-bucket-01-exact-head.json',
  repairReport: 'reports/qualification/lafea-bucket-01-repair-check.json',
  productionProjection: 'reports/qualification/lafea-bucket-01-production-projection.json',
  productionExecution: 'reports/qualification/lafea-bucket-01-production-execution.json',
  productionResponse: 'reports/qualification/lafea-bucket-01-production-response.json',
  kirschStress: 'reports/qualification/lafea-bucket-01-kirsch-fixed-probes.json',
  productionLugStress: 'reports/qualification/lafea-bucket-01-production-lug-fixed-probes.json',
  codeBasisPackage: 'reports/qualification/lafea-bucket-01-code-basis.json',
  codeAssessment: 'reports/qualification/lafea-bucket-01-code-assessment.json',
};
const reports = Object.fromEntries(
  Object.entries(reportPaths).map(([key, relative]) => [key, readJson(relative)]),
);

assert.equal(reports.expectedValueDefinition.status, 'EXPECTED_VALUE_DEFINITION_SET_PASS');
assert.equal(reports.exactHeadReport.status, 'EXACT_HEAD_REPAIR_EVIDENCE_PASS');
assert.equal(reports.exactHeadReport.exactHead, exactHeadSha);
assert.equal(reports.repairReport.status, 'REPAIR_CHECKS_PASS');
assert.deepEqual(reports.repairReport.blockingCheckIds, []);
assert.equal(reports.productionProjection.status, 'PROJECTION_READY');
assert.equal(reports.productionProjection.releaseRecord.candidateHeadSha, exactHeadSha);
assert.deepEqual(
  reports.productionProjection.levels.map((row) => row.meshEvidence.mesh.elements.length),
  [64, 256, 1024, 4096],
);
assert.equal(reports.productionExecution.status, 'ACCEPTED');
assert.equal(reports.productionExecution.accepted, true);
assert.equal(reports.productionExecution.controllerResult.levelResults.length, 4);
assert.equal(reports.productionResponse.status, 'PASS');
assert.equal(reports.productionResponse.exactHeadSha, exactHeadSha);
assert.deepEqual(reports.productionResponse.energyConvergenceElementCounts, [256, 1024, 4096]);
assert.equal(reports.kirschStress.status, 'PASS');
assert.equal(reports.kirschStress.exactHeadSha, exactHeadSha);
assert.equal(reports.productionLugStress.status, 'PASS');
assert.equal(reports.productionLugStress.exactHeadSha, exactHeadSha);
assert.equal(
  reports.productionLugStress.schema,
  'lafea-bucket-01-production-lug-fixed-probe-evidence/v2',
);
assert.deepEqual(reports.productionLugStress.governedLevelOrdinals, [1, 2, 3, 4]);
assert.deepEqual(reports.productionLugStress.evaluatedLevelOrdinals, [2, 3, 4]);
assert.equal(reports.productionLugStress.authority.directElementPointRecovery, true);
assert.equal(reports.productionLugStress.authority.integrationPointExtrapolationUsed, false);
assert.equal(reports.codeBasisPackage.status, 'CODE_BASIS_FROZEN');
assert.equal(reports.codeBasisPackage.exactHeadSha, exactHeadSha);
assert.equal(reports.codeAssessment.status, 'CODE_ASSESSMENT_PASS');
assert.equal(reports.codeAssessment.exactHeadSha, exactHeadSha);
assert.equal(reports.codeAssessment.authority.codeVerified, true);

const trackedStatus = git(['status', '--porcelain=v1', '--untracked-files=no']);
assert.equal(trackedStatus, '', `Tracked worktree must remain clean: ${trackedStatus}`);
const reportHashes = Object.fromEntries(
  Object.entries(reportPaths).map(([key, relative]) => [key, rawHash(relative)]),
);
const canonicalStdout = `${JSON.stringify({
  schema: 'lafea-bucket-01-production-replay-summary/v2',
  exactHeadSha,
  definitionSetHash: reports.expectedValueDefinition.definitionSetHash,
  governedElementCounts: [64, 256, 1024, 4096],
  evaluatedElementCounts: [256, 1024, 4096],
  directPointStressRecovery: true,
  reportHashes,
  status: 'PASS',
})}\n`;
const stdoutPath = path.join(logDirectory, 'canonical.stdout.log');
const stderrPath = path.join(logDirectory, 'canonical.stderr.log');
fs.writeFileSync(stdoutPath, canonicalStdout, 'utf8');
fs.writeFileSync(stderrPath, '', 'utf8');
const basis = {
  schema: 'lafea-bucket-01-final-replay-evidence-set/v2',
  exactHeadSha,
  exitCode: 0,
  trackedTreeClean: true,
  exactHeadReportStatus: reports.exactHeadReport.status,
  reportHashes,
  stdoutHash: rawHashAbsolute(stdoutPath),
  stderrHash: rawHashAbsolute(stderrPath),
};
const row = {
  replayId,
  ...basis,
  evidenceSetHash: canonicalLafeaSha256(basis),
};
fs.mkdirSync(path.dirname(rowPath), { recursive: true });
fs.writeFileSync(rowPath, `${JSON.stringify(row, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(row));

function runStage(stageId, script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      EXPECTED_HEAD_SHA: exactHeadSha,
      LAFEA_BUCKET_01_CODE_BASIS_INPUT_PATH: approvedInputPath,
    },
  });
  fs.writeFileSync(path.join(logDirectory, `${stageId}.stdout.log`), result.stdout ?? '', 'utf8');
  fs.writeFileSync(path.join(logDirectory, `${stageId}.stderr.log`), result.stderr ?? '', 'utf8');
  if (result.status !== 0 || result.error) {
    const detail = [result.error?.message, result.stderr, result.stdout]
      .filter(Boolean)
      .join('\n')
      .slice(-4000);
    throw new Error(`${stageId} failed with exit ${result.status}: ${detail}`);
  }
}

function readJson(relative) {
  const absolute = path.resolve(ROOT, relative);
  assert.ok(fs.existsSync(absolute), `Missing retained report: ${relative}`);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}
function rawHash(relative) { return rawHashAbsolute(path.resolve(ROOT, relative)); }
function rawHashAbsolute(absolute) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`;
}
function requiredText(value, name) {
  assert.ok(typeof value === 'string' && value.trim(), `${name} is required.`);
  return value.trim();
}
function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0 || result.error) {
    throw new Error(result.stderr?.trim() || result.error?.message || `git ${args.join(' ')} failed.`);
  }
  return result.stdout.trim();
}
