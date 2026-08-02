#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_SELECTED_PILOT_BENCHMARK_MANIFESTS,
  createSelectedPilotQualification,
  validateSelectedPilotQualification,
} from '../src/core/lafea-application-templates/selected-pilot-qualification.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exactHead = git(['rev-parse', 'HEAD']);
const b4Script = path.join(ROOT, 'scripts/lafea-template-b4-analytical-pilot-check.mjs');
const controller = path.join(ROOT, 'src/workspace/lafea-template-execution-controller.js');
let negativeCount = 0;

const b4Run = spawnSync(process.execPath, [b4Script], {
  cwd: ROOT,
  encoding: 'utf8',
  env: process.env,
});
if (b4Run.error) throw b4Run.error;
if (b4Run.status !== 0) {
  process.stderr.write(b4Run.stdout ?? '');
  process.stderr.write(b4Run.stderr ?? '');
  throw new Error(`B4 selected-pilot evidence failed with status ${b4Run.status}.`);
}
const b4Report = parseFinalJsonLine(b4Run.stdout);
const input = {
  exactHead,
  b4Report,
  b4CheckHash: fileSha256(b4Script),
  controllerHash: fileSha256(controller),
};
const qualification = createSelectedPilotQualification(input);
assert.equal(validateSelectedPilotQualification(qualification).ok, true);
assert.equal(qualification.status, 'SELECTED_PILOT_EVIDENCE_QUALIFIED');
assert.equal(qualification.releaseQualification, 'NOT_CLAIMED');
assert.equal(qualification.pilotResults.length, 2);
assert.equal(qualification.pilotResults.every((row) => row.status === 'PASS'), true);
assert.equal(LAFEA_SELECTED_PILOT_BENCHMARK_MANIFESTS.length, 2);
assert.equal(
  LAFEA_SELECTED_PILOT_BENCHMARK_MANIFESTS.every((manifest) =>
    manifest.expectedValueAuthority
      === 'FROZEN_BEFORE_B5_PRODUCTION_EVIDENCE_CONSUMPTION'),
  true,
);

negative('B4 status changed', () => createSelectedPilotQualification({
  ...input,
  b4Report: { ...structuredClone(b4Report), status: 'FAIL' },
}));
negative('unauthorized pilot added', () => createSelectedPilotQualification({
  ...input,
  b4Report: {
    ...structuredClone(b4Report),
    pilots: [...b4Report.pilots, 'C2D-LUG-PINHOLE -> LAFEA.3'],
  },
}));
negative('reference force changed', () => {
  const report = structuredClone(b4Report);
  report.independentExpectedValues.referenceTransfer.force[0] += 1;
  createSelectedPilotQualification({ ...input, b4Report: report });
});
negative('reference moment changed', () => {
  const report = structuredClone(b4Report);
  report.independentExpectedValues.referenceTransfer.moment[1] += 1;
  createSelectedPilotQualification({ ...input, b4Report: report });
});
negative('section area changed', () => {
  const report = structuredClone(b4Report);
  report.independentExpectedValues.combinedSection.area += 1;
  createSelectedPilotQualification({ ...input, b4Report: report });
});
negative('section inertia changed', () => {
  const report = structuredClone(b4Report);
  report.independentExpectedValues.combinedSection.inertia += 1;
  createSelectedPilotQualification({ ...input, b4Report: report });
});
negative('polar moment changed', () => {
  const report = structuredClone(b4Report);
  report.independentExpectedValues.combinedSection.polar += 1;
  createSelectedPilotQualification({ ...input, b4Report: report });
});
negative('sigma X changed', () => {
  const report = structuredClone(b4Report);
  report.independentExpectedValues.combinedSection.sigmaX += 1;
  createSelectedPilotQualification({ ...input, b4Report: report });
});
negative('torsion changed', () => {
  const report = structuredClone(b4Report);
  report.independentExpectedValues.combinedSection.tauXTheta += 1;
  createSelectedPilotQualification({ ...input, b4Report: report });
});
negative('von Mises changed', () => {
  const report = structuredClone(b4Report);
  report.independentExpectedValues.combinedSection.vonMises += 1;
  createSelectedPilotQualification({ ...input, b4Report: report });
});
negative('anti-drift count reduced', () => createSelectedPilotQualification({
  ...input,
  b4Report: { ...structuredClone(b4Report), antiDriftTestCount: 11 },
}));
negative('general T7D promoted', () => {
  const report = structuredClone(b4Report);
  report.authority.generalT7dAuthorized = true;
  createSelectedPilotQualification({ ...input, b4Report: report });
});
negative('release qualification promoted', () => {
  const report = structuredClone(b4Report);
  report.authority.releaseQualified = true;
  createSelectedPilotQualification({ ...input, b4Report: report });
});
negative('missing B4 hash', () => createSelectedPilotQualification({
  ...input,
  b4CheckHash: null,
}));
negative('missing controller hash', () => createSelectedPilotQualification({
  ...input,
  controllerHash: null,
}));
negative('invalid exact head', () => createSelectedPilotQualification({
  ...input,
  exactHead: 'main',
}));
negative('tampered qualification hash', () => validateOrThrow({
  ...qualification,
  semanticHash: `sha256:${'0'.repeat(64)}`,
}));
negative('mutable qualification', () => validateOrThrow(
  structuredClone(qualification),
));

const output = {
  schema: 'lafea-template-b5-selected-pilot-qualification-check/v1',
  exactHead,
  status: 'PASS',
  qualification,
  negativeTestCount: negativeCount,
  authority: {
    selectedPilotEvidenceQualified: true,
    releaseQualified: false,
    generalT7dAuthorized: false,
    continuumAuthorized: false,
    shellAuthorized: false,
  },
};
const outputPath = process.env.LAFEA_B5_REPORT_PATH;
if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output));

function parseFinalJsonLine(text) {
  const lines = String(text).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error('B4 check produced no output.');
  try {
    return JSON.parse(lines.at(-1));
  } catch (error) {
    throw new Error(`B4 check final line is not JSON: ${error.message}`);
  }
}

function fileSha256(file) {
  const bytes = fs.readFileSync(file);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'git command failed.');
  return result.stdout.trim();
}

function validateOrThrow(value) {
  const validation = validateSelectedPilotQualification(value);
  if (!validation.ok) throw new Error(validation.errors.join(' '));
}

function negative(label, callback) {
  assert.throws(callback, undefined, label);
  negativeCount += 1;
}
