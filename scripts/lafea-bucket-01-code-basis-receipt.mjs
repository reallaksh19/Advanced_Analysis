#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  createLafeaBucket01CodeBasis,
  validateLafeaBucket01CodeBasis,
} from '../src/workspace/lafea-bucket-01-code-basis.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT_PATH = path.resolve(ROOT, process.env.LAFEA_BUCKET_01_CODE_BASIS_INPUT_PATH
  ?? 'external/qualification/lafea-bucket-01-approved-code-basis-input.json');
const PROBE_SPEC_PATH = path.join(ROOT, 'validation/bucket-01/08-production-lug-fixed-probe-spec.json');
const REPORT_PATH = path.resolve(ROOT, process.env.LAFEA_BUCKET_01_CODE_BASIS_REPORT_PATH
  ?? 'reports/qualification/lafea-bucket-01-code-basis.json');
const exactHeadSha = process.env.EXPECTED_HEAD_SHA?.trim()
  || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

assert.ok(fs.existsSync(INPUT_PATH), `approved code-basis input not found: ${INPUT_PATH}`);
const input = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
const probeSpec = JSON.parse(fs.readFileSync(PROBE_SPEC_PATH, 'utf8'));
assert.equal(input.exactHeadSha, exactHeadSha);
assert.equal(input.probeSpecHash, canonicalLafeaSha256(probeSpec));
const packageValue = createLafeaBucket01CodeBasis(input);
assert.equal(validateLafeaBucket01CodeBasis(packageValue).ok, true);
assert.equal(packageValue.status, 'CODE_BASIS_FROZEN');
assert.equal(packageValue.authorityBoundary.codeAssessmentPerformed, false);
assert.equal(packageValue.authorityBoundary.codeVerified, false);
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(packageValue, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: 'lafea-bucket-01-code-basis-receipt/v1',
  exactHeadSha,
  inputPath: path.relative(ROOT, INPUT_PATH),
  reportPath: path.relative(ROOT, REPORT_PATH),
  semanticHash: packageValue.semanticHash,
  evidenceHash: packageValue.evidenceHash,
  status: packageValue.status,
}));
