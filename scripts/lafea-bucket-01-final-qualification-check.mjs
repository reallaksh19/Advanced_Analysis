#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import { validateLafeaBucket01CodeBasis } from '../src/workspace/lafea-bucket-01-code-basis.js';
import { validateLafeaBucket01CodeAssessment } from '../src/workspace/lafea-bucket-01-code-assessment.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exactHeadSha = process.env.EXPECTED_HEAD_SHA?.trim()
  || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const paths = {
  definition: env('LAFEA_BUCKET_01_EXPECTED_VALUE_REPORT_PATH', 'reports/qualification/lafea-bucket-01-expected-value-registry.json'),
  projection: env('LAFEA_BUCKET_01_PRODUCTION_PROJECTION_PATH', 'reports/qualification/lafea-bucket-01-production-projection.json'),
  execution: env('LAFEA_BUCKET_01_PRODUCTION_EXECUTION_PATH', 'reports/qualification/lafea-bucket-01-production-execution.json'),
  response: env('LAFEA_BUCKET_01_PRODUCTION_RESPONSE_REPORT_PATH', 'reports/qualification/lafea-bucket-01-production-response.json'),
  kirsch: env('LAFEA_BUCKET_01_KIRSCH_PROBE_REPORT_PATH', 'reports/qualification/lafea-bucket-01-kirsch-fixed-probes.json'),
  lugStress: env('LAFEA_BUCKET_01_PRODUCTION_LUG_PROBE_REPORT_PATH', 'reports/qualification/lafea-bucket-01-production-lug-fixed-probes.json'),
  codeBasis: env('LAFEA_BUCKET_01_CODE_BASIS_REPORT_PATH', 'reports/qualification/lafea-bucket-01-code-basis.json'),
  codeAssessment: env('LAFEA_BUCKET_01_CODE_ASSESSMENT_REPORT_PATH', 'reports/qualification/lafea-bucket-01-code-assessment.json'),
  replay: env('LAFEA_BUCKET_01_FINAL_REPLAY_REPORT_PATH', 'reports/qualification/lafea-bucket-01-final-replay-custody.json'),
  exactHead: env('LAFEA_BUCKET_01_EXACT_HEAD_REPORT_PATH', 'reports/qualification/lafea-bucket-01-exact-head.json'),
  repair: env('LAFEA_BUCKET_01_REPAIR_REPORT_PATH', 'reports/qualification/lafea-bucket-01-repair-check.json'),
};
const data = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, read(value)]));
assert.equal(data.definition.status, 'EXPECTED_VALUE_DEFINITION_SET_PASS');
assert.equal(data.projection.status, 'PROJECTION_READY');
assert.equal(data.projection.releaseRecord.candidateHeadSha, exactHeadSha);
assert.equal(data.execution.status, 'ACCEPTED');
assert.equal(data.execution.accepted, true);
assert.equal(data.execution.projectionHash, data.projection.projectionHash);
assert.equal(data.response.status, 'PASS');
assert.equal(data.response.exactHeadSha, exactHeadSha);
assert.equal(data.kirsch.status, 'PASS');
assert.equal(data.kirsch.exactHeadSha, exactHeadSha);
assert.equal(data.lugStress.status, 'PASS');
assert.equal(data.lugStress.exactHeadSha, exactHeadSha);
assert.equal(validateLafeaBucket01CodeBasis(deepFreeze(data.codeBasis)).ok, true);
assert.equal(data.codeBasis.exactHeadSha, exactHeadSha);
assert.equal(validateLafeaBucket01CodeAssessment(deepFreeze(data.codeAssessment)).ok, true);
assert.equal(data.codeAssessment.status, 'CODE_ASSESSMENT_PASS');
assert.equal(data.codeAssessment.exactHeadSha, exactHeadSha);
assert.equal(data.replay.status, 'FINAL_THREE_REPLAY_CUSTODY_PASS');
assert.equal(data.replay.exactHeadSha, exactHeadSha);
assert.equal(data.replay.definitionSetHash, data.definition.definitionSetHash);
assert.equal(data.exactHead.status, 'EXACT_HEAD_REPAIR_EVIDENCE_PASS');
assert.equal(data.exactHead.exactHead, exactHeadSha);
assert.equal(data.repair.status, 'REPAIR_CHECKS_PASS');
assert.deepEqual(data.repair.blockingCheckIds, []);
const replayMap = {
  exactHeadReport: 'exactHead', repairReport: 'repair', productionProjection: 'projection',
  productionExecution: 'execution', productionResponse: 'response', productionLugStress: 'lugStress',
  codeBasisPackage: 'codeBasis', codeAssessment: 'codeAssessment',
};
for (const [replayKey, dataKey] of Object.entries(replayMap)) {
  assert.equal(data.replay.deterministicReportHashes[replayKey], rawHash(paths[dataKey]));
}
const qualificationStates = {
  contractVerified: true,
  meshVerified: data.execution.controllerResult.levelResults.length === 3,
  solverVerified: data.response.status === 'PASS',
  stressVerified: data.kirsch.status === 'PASS' && data.lugStress.status === 'PASS',
  codeVerified: data.codeAssessment.authority.codeVerified === true,
  integrationVerified: data.replay.replayCount === 3 && data.exactHead.status === 'EXACT_HEAD_REPAIR_EVIDENCE_PASS',
};
qualificationStates.bucketQualified = Object.values(qualificationStates).every(Boolean);
const base = {
  schema: 'lafea-bucket-01-final-qualification/v1',
  producerRevision: 'B01-FINAL-QUALIFICATION.1',
  exactHeadSha,
  definitionSetHash: data.definition.definitionSetHash,
  qualificationStates,
  status: qualificationStates.bucketQualified ? 'BUCKET_01_QUALIFIED' : 'BUCKET_01_NOT_QUALIFIED',
  authority: { bucket01ContinuumLugPinholeQualified: qualificationStates.bucketQualified, broaderReleaseQualified: false },
};
const report = { ...base, evidenceHash: canonicalLafeaSha256(base) };
const output = path.resolve(ROOT, process.env.LAFEA_BUCKET_01_FINAL_REPORT_PATH
  ?? 'reports/qualification/lafea-bucket-01-final-qualification.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
if (!qualificationStates.bucketQualified) process.exit(1);

function env(name, fallback) { return path.resolve(ROOT, process.env[name] ?? fallback); }
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function rawHash(file) { return `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`; }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
