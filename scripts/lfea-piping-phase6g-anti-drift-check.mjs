#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const assemblerPath = 'scripts/lfea-piping-runtime-bundle-assembler.mjs';
const checkPath = 'scripts/lfea-piping-runtime-bundle-assembler-check.mjs';
const wp2AssemblerPath = 'scripts/lfea-piping-wp2-runtime-bundle-assembler.mjs';
const wp2CheckPath = 'scripts/lfea-piping-wp2-runtime-bundle-assembler-check.mjs';
const wp3AssemblerPath = 'scripts/lfea-piping-wp3-runtime-bundle-assembler.mjs';
const wp3CheckPath = 'scripts/lfea-piping-wp3-runtime-bundle-assembler-check.mjs';
const wrapperPath = 'scripts/lfea-piping-release-readiness-check.mjs';
const releasePath = 'release-evidence/lfea-piping-release-evidence.json';
const assemblyWorkflowPath = '.github/workflows/lfea-piping-runtime-bundle-assembly.yml';
const assembler = fs.readFileSync(assemblerPath, 'utf8');
const check = fs.readFileSync(checkPath, 'utf8');
const wp2Assembler = fs.readFileSync(wp2AssemblerPath, 'utf8');
const wp2Check = fs.readFileSync(wp2CheckPath, 'utf8');
const wp3Assembler = fs.readFileSync(wp3AssemblerPath, 'utf8');
const wp3Check = fs.readFileSync(wp3CheckPath, 'utf8');
const wrapper = fs.readFileSync(wrapperPath, 'utf8');
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
const workflow = fs.existsSync(assemblyWorkflowPath)
  ? fs.readFileSync(assemblyWorkflowPath, 'utf8')
  : '';

assert.ok(assembler.split(/\r?\n/u).length < 500, 'Phase 6G assembler limit is <500 lines.');
assert.ok(check.split(/\r?\n/u).length < 320, 'Phase 6G check limit is <320 lines.');
assert.ok(wp2Assembler.split(/\r?\n/u).length < 430, 'WP2 Phase 6G assembler limit is <430 lines.');
assert.ok(wp2Check.split(/\r?\n/u).length < 430, 'WP2 Phase 6G check limit is <430 lines.');
assert.ok(wp3Assembler.split(/\r?\n/u).length < 500, 'WP3 Phase 6G assembler limit is <500 lines.');
assert.ok(wp3Check.split(/\r?\n/u).length < 430, 'WP3 Phase 6G check limit is <430 lines.');
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

assert.match(wp2Assembler, /requireProjectAuthorityBoundExternalPackage/u);
assert.match(wp2Assembler, /LFEA_WP2_RUNTIME_BUNDLE_AUTHORITY_ARTIFACT_MISMATCH/u);
assert.match(wp2Assembler, /LFEA_WP2_RUNTIME_BUNDLE_PATH_COLLISION/u);
assert.match(wp2Assembler, /projectAuthorityBoundPackage/u);
assert.match(wp2Assembler, /projectAuthorityIndex/u);
assert.match(wp2Assembler, /assembleRuntimeReleaseBundle/u);
assert.match(wp2Assembler, /fs\.renameSync\(staging, output\)/u);
assert.doesNotMatch(
  wp2Assembler,
  /manifest\.artifacts/u,
  'WP2 retention must not change the exact public release-manifest artifact schema.',
);
assert.match(wp2Check, /\[SIMULATED\]\[INELIGIBLE_FOR_PROJECT_EVIDENCE\]/u);
assert.match(wp2Check, /NO_ENGINEERING_COMMAND_EXECUTION/u);
assert.match(wp2Check, /Retained authority tampering fails closed/u);
assert.match(wp2Check, /Object\.keys\(manifest\.artifacts\)/u);

assert.match(wp3Assembler, /requirePhase6iExternalEvidenceHandoff/u);
assert.match(wp3Assembler, /requirePhase6iExternalEvidenceHandoffAcceptance/u);
assert.match(wp3Assembler, /requireProjectAuthorityBoundExternalPackage/u);
assert.match(wp3Assembler, /assembleWp2RuntimeReleaseBundle/u);
assert.match(wp3Assembler, /lfea-piping-wp3-runtime-bundle-assembly\/v1/u);
assert.match(wp3Assembler, /LFEA_WP3_RUNTIME_BUNDLE_PACKAGE_ID_MISMATCH/u);
assert.match(wp3Assembler, /LFEA_WP3_RUNTIME_BUNDLE_SOURCE_REQUEST_PATH_DUPLICATE/u);
assert.match(wp3Assembler, /LFEA_WP3_RUNTIME_BUNDLE_REQUEST_CONTENT_MISMATCH/u);
assert.match(wp3Assembler, /LFEA_WP3_RUNTIME_BUNDLE_HANDOFF_IDENTITY_MISMATCH/u);
assert.match(wp3Assembler, /LFEA_WP3_RUNTIME_BUNDLE_AUTHORITY_IDENTITY_MISMATCH/u);
assert.match(wp3Assembler, /LFEA_WP3_RUNTIME_BUNDLE_PATH_COLLISION/u);
assert.match(wp3Assembler, /sourceHandoffAcceptanceContentHash/u);
assert.match(wp3Assembler, /fs\.renameSync\(staging, output\)/u);
assert.doesNotMatch(
  wp3Assembler,
  /manifest\.artifacts/u,
  'WP3 custody must not change the exact public release-manifest artifact schema.',
);
assert.match(wp3Check, /\[SIMULATED\]\[INELIGIBLE_FOR_PROJECT_EVIDENCE\]/u);
assert.match(wp3Check, /NO_ENGINEERING_COMMAND_EXECUTION/u);
assert.match(wp3Check, /WP3 custody enters the runtime bundle/u);
assert.match(wp3Check, /Retained request tampering fails closed/u);
assert.match(wp3Check, /Retained handoff tampering fails closed/u);
assert.match(wp3Check, /WP3 and WP2 authority identities cannot diverge/u);
assert.match(wp3Check, /Object\.keys\(manifest\.artifacts\)/u);
assert.doesNotMatch(
  `${wp2Assembler}\n${wp2Check}\n${wp3Assembler}\n${wp3Check}`,
  /child_process|spawn\(|spawnSync|execFile\(|shelljs/u,
  'WP2/WP3 Phase 6G qualification must not execute engineering commands.',
);

assert.equal(release.programDisposition, 'BLOCKED');
assert.equal(release.exactHead, null);
assert.equal(release.artifacts.exactHeadManifest, null);
assert.equal(release.artifacts.externalQualificationPackage, null);
assert.ok(Object.values(release.gates).every((status) => status !== 'VERIFIED'));
assert.match(wrapper, /lfea-piping-phase6g-anti-drift-check\.mjs/u);

if (workflow !== '') {
  assert.match(workflow, /workflow_dispatch/u);
  assert.match(workflow, /candidate_sha:/u);
  assert.match(workflow, /617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54/u);
  assert.match(workflow, /release\/lfea-piping-phase6i-617f7c2/u);
  assert.match(workflow, /TOOLING_HEAD:\s*\$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /EXPECTED_HEAD:\s*\$\{\{ inputs\.candidate_sha \}\}/u);
  assert.doesNotMatch(workflow, /EXPECTED_HEAD:\s*\$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /git rev-parse "\$CANDIDATE_REF\^\{commit\}"/u);
  assert.match(workflow, /actions\/download-artifact@v4/u);
  assert.match(workflow, /lfea-piping-wp3-runtime-bundle-assembler\.mjs/u);
  assert.match(workflow, /project-authority-bound-package\.json/u);
  assert.match(workflow, /external\/source-handoff\.json/u);
  assert.match(workflow, /external\/source-materialization-request\.json/u);
  assert.match(workflow, /external\/source-handoff-acceptance\.json/u);
  assert.match(workflow, /lfea-piping-runtime-release-bundle-\$\{\{ inputs\.candidate_sha \}\}/u);
  assert.doesNotMatch(workflow, /node scripts\/lfea-piping-wp2-runtime-bundle-assembler\.mjs/u);
  assert.doesNotMatch(workflow, /node scripts\/lfea-piping-runtime-bundle-assembler\.mjs/u);
  assert.doesNotMatch(workflow, /pull_request:/u);
}

await import('./lfea-piping-runtime-bundle-assembler-check.mjs');
await import('./lfea-piping-wp2-runtime-bundle-assembler-check.mjs');
await import('./lfea-piping-wp3-runtime-bundle-assembler-check.mjs');

console.log('Linear piping Phase 6G runtime bundle assembly anti-drift check PASS');
