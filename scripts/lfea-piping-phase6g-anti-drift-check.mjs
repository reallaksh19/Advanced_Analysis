#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const assemblerPath = 'scripts/lfea-piping-runtime-bundle-assembler.mjs';
const checkPath = 'scripts/lfea-piping-runtime-bundle-assembler-check.mjs';
const wrapperPath = 'scripts/lfea-piping-release-readiness-check.mjs';
const releasePath = 'release-evidence/lfea-piping-release-evidence.json';
const assemblyWorkflowPath = '.github/workflows/lfea-piping-runtime-bundle-assembly.yml';
const assembler = fs.readFileSync(assemblerPath, 'utf8');
const check = fs.readFileSync(checkPath, 'utf8');
const wrapper = fs.readFileSync(wrapperPath, 'utf8');
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
const workflow = fs.existsSync(assemblyWorkflowPath)
  ? fs.readFileSync(assemblyWorkflowPath, 'utf8')
  : '';

assert.ok(assembler.split(/\r?\n/u).length < 500, 'Phase 6G assembler limit is <500 lines.');
assert.ok(check.split(/\r?\n/u).length < 320, 'Phase 6G check limit is <320 lines.');
assert.match(assembler, /requireLinearPipingExternalQualificationPackage/u);
assert.match(assembler, /requireInternalExactHeadManifest/u);
assert.match(assembler, /validateExternalReleaseEvidence/u);
assert.match(assembler, /validateInternalReleaseEvidence/u);
assert.match(assembler, /evaluateReleaseReadiness/u);
assert.match(assembler, /programDisposition:\s*'QUALIFIED'/u);
assert.match(assembler, /G10_RELEASE_ROLLBACK/u);
assert.match(assembler, /\.staging-/u);
assert.match(assembler, /fs\.renameSync\(staging, output\)/u);
assert.match(assembler, /fs\.rmSync\(staging/u);
assert.match(assembler, /LFEA_RUNTIME_BUNDLE_OUTPUT_EXISTS/u);
assert.match(assembler, /LFEA_RUNTIME_BUNDLE_PATH_COLLISION/u);
assert.match(assembler, /LFEA_RUNTIME_BUNDLE_INPUT_HEAD_MISMATCH/u);
assert.match(assembler, /ELIGIBLE_FOR_RELEASE_CERTIFICATION/u);
assert.doesNotMatch(
  assembler,
  /child_process|spawn\(|execFile\(|shelljs/u,
  'Phase 6G must not execute engineering or external programs.',
);
assert.doesNotMatch(
  assembler,
  /release-evidence\/lfea-piping-release-evidence\.json/u,
  'Phase 6G must not read or write the committed blocked template.',
);
assert.doesNotMatch(
  assembler,
  /applicationValue|referenceValue|allowable|commercialProgram|sign(?:ed|ature)\s*=/u,
  'Phase 6G must not manufacture project, commercial, allowable or signature evidence.',
);

assert.match(check, /\[SIMULATED\]\[INELIGIBLE_FOR_RELEASE_EVIDENCE\]/u);
assert.match(check, /NO_ENGINEERING_COMMAND_EXECUTION/u);
assert.match(check, /evaluateReleaseReadiness/u);
assert.match(check, /LFEA_RUNTIME_BUNDLE_PATH_COLLISION/u);
assert.match(check, /LFEA_RUNTIME_BUNDLE_COLLECTION_SUMMARY_INVALID/u);
assert.match(check, /SYNTHETIC_RELEASE_REJECTION/u);
assert.doesNotMatch(
  check,
  /child_process|spawnSync|execFile/u,
  'Phase 6G qualification must not execute engineering commands.',
);

assert.equal(release.programDisposition, 'BLOCKED');
assert.equal(release.exactHead, null);
assert.equal(release.artifacts.exactHeadManifest, null);
assert.equal(release.artifacts.externalQualificationPackage, null);
assert.ok(Object.values(release.gates).every((status) => status !== 'VERIFIED'));
assert.match(wrapper, /lfea-piping-phase6g-anti-drift-check\.mjs/u);

if (workflow !== '') {
  assert.match(workflow, /workflow_dispatch/u);
  assert.match(workflow, /actions\/download-artifact@v4/u);
  assert.match(workflow, /lfea-piping-runtime-bundle-assembler\.mjs/u);
  assert.match(workflow, /lfea-piping-runtime-release-bundle-/u);
  assert.doesNotMatch(workflow, /pull_request:/u);
}

await import('./lfea-piping-runtime-bundle-assembler-check.mjs');

console.log('Linear piping Phase 6G runtime bundle assembly anti-drift check PASS');
