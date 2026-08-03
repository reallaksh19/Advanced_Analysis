#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_BUCKET_01_CODE_ASSESSMENT_INPUT_SCHEMA,
  evaluateLafeaBucket01CodeAssessment,
  validateLafeaBucket01CodeAssessment,
} from '../src/workspace/lafea-bucket-01-code-assessment.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODE_BASIS_PATH = path.resolve(ROOT, process.env.LAFEA_BUCKET_01_CODE_BASIS_REPORT_PATH
  ?? 'reports/qualification/lafea-bucket-01-code-basis.json');
const STRESS_PATH = path.resolve(ROOT, process.env.LAFEA_BUCKET_01_PRODUCTION_LUG_PROBE_REPORT_PATH
  ?? 'reports/qualification/lafea-bucket-01-production-lug-fixed-probes.json');
const REPORT_PATH = path.resolve(ROOT, process.env.LAFEA_BUCKET_01_CODE_ASSESSMENT_REPORT_PATH
  ?? 'reports/qualification/lafea-bucket-01-code-assessment.json');
const exactHeadSha = process.env.EXPECTED_HEAD_SHA?.trim()
  || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const codeBasisPackage = JSON.parse(fs.readFileSync(CODE_BASIS_PATH, 'utf8'));
const productionLugStressEvidence = JSON.parse(fs.readFileSync(STRESS_PATH, 'utf8'));
const packageValue = evaluateLafeaBucket01CodeAssessment({
  schema: LAFEA_BUCKET_01_CODE_ASSESSMENT_INPUT_SCHEMA,
  assessmentId: `B01-CODE-ASSESSMENT-${exactHeadSha}`,
  exactHeadSha,
  codeBasisPackage,
  productionLugStressEvidence,
});
assert.equal(validateLafeaBucket01CodeAssessment(packageValue).ok, true);
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(packageValue, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(packageValue));
if (packageValue.status !== 'CODE_ASSESSMENT_PASS') process.exit(1);
