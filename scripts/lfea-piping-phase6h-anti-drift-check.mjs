#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const materializerPath = 'scripts/lfea-piping-external-evidence-materializer.mjs';
const checkPath = 'scripts/lfea-piping-external-evidence-materializer-check.mjs';
const wrapperPath = 'scripts/lfea-piping-release-readiness-check.mjs';
const releasePath = 'release-evidence/lfea-piping-release-evidence.json';
const workflowPath = '.github/workflows/lfea-piping-external-evidence-materialization.yml';
const materializer = fs.readFileSync(materializerPath, 'utf8');
const check = fs.readFileSync(checkPath, 'utf8');
const wrapper = fs.readFileSync(wrapperPath, 'utf8');
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
const workflow = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';

assert.ok(materializer.split(/\r?\n/u).length < 420, 'Phase 6H materializer limit is <420 lines.');
assert.ok(check.split(/\r?\n/u).length < 300, 'Phase 6H check limit is <300 lines.');
assert.match(materializer, /compileLinearPipingExternalQualificationPackage/u);
assert.match(materializer, /requireLinearPipingExternalQualificationPackage/u);
assert.match(materializer, /validateExternalReleaseEvidence/u);
assert.match(materializer, /linear-piping-external-qualification-package-request\/v1/u);
assert.match(materializer, /linear-piping-evidence-artifact-reference\/v1/u);
assert.match(materializer, /ELIGIBLE_FOR_PHASE6G_ASSEMBLY/u);
assert.match(materializer, /\.staging-/u);
assert.match(materializer, /fs\.renameSync\(staging, output\)/u);
assert.match(materializer, /fs\.rmSync\(staging/u);
assert.match(materializer, /LFEA_EXTERNAL_MATERIALIZATION_REQUEST_HEAD_MISMATCH/u);
assert.match(materializer, /LFEA_EXTERNAL_MATERIALIZATION_RECORD_PATH_DUPLICATE/u);
assert.match(materializer, /LFEA_EXTERNAL_MATERIALIZATION_INTAKE_INVALID/u);
assert.doesNotMatch(
  materializer,
  /child_process|spawn\(|execFile\(|shelljs/u,
  'Phase 6H must not execute engineering or commercial programs.',
);
assert.doesNotMatch(
  materializer,
  /release-evidence\/lfea-piping-release-evidence\.json/u,
  'Phase 6H must not read or write the committed blocked template.',
);
assert.doesNotMatch(
  materializer,
  /sealReleaseReviewDisposition|sealPerformanceEvidence|sealRollbackEvidence/u,
  'Phase 6H must require caller-supplied sealed source records rather than sealing them.',
);
assert.doesNotMatch(
  materializer,
  /applicationValue\s*=|referenceValue\s*=|signatureReference\s*=/u,
  'Phase 6H must not manufacture engineering values or signatures.',
);

assert.match(check, /\[SIMULATED\]\[INELIGIBLE_FOR_PROJECT_EVIDENCE\]/u);
assert.match(check, /NO_ENGINEERING_COMMAND_EXECUTION/u);
assert.match(check, /compileSynthetic/u);
assert.match(check, /SYNTHETIC_COMPILER_REJECTION/u);
assert.match(check, /SYNTHETIC_INTAKE_REJECTION/u);
assert.match(check, /LFEA_EXTERNAL_MATERIALIZATION_RECORD_PATH_DUPLICATE/u);
assert.doesNotMatch(
  check,
  /child_process|spawnSync|execFile/u,
  'Phase 6H qualification must not execute engineering commands.',
);

assert.equal(release.programDisposition, 'BLOCKED');
assert.equal(release.exactHead, null);
assert.equal(release.artifacts.externalQualificationPackage, null);
assert.ok(Object.values(release.gates).every((status) => status !== 'VERIFIED'));
assert.match(wrapper, /lfea-piping-phase6h-anti-drift-check\.mjs/u);

if (workflow !== '') {
  assert.match(workflow, /workflow_dispatch/u);
  assert.match(workflow, /actions\/download-artifact@v4/u);
  assert.match(workflow, /lfea-piping-external-evidence-materializer\.mjs/u);
  assert.match(workflow, /lfea-piping-external-evidence-/u);
  assert.doesNotMatch(workflow, /pull_request:/u);
}

await import('./lfea-piping-external-evidence-materializer-check.mjs');

console.log('Linear piping Phase 6H external evidence materialization anti-drift check PASS');
