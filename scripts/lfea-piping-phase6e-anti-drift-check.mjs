#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const orchestratorPath = 'scripts/lfea-piping-release-orchestrator.mjs';
const wrapperPath = 'scripts/lfea-piping-release-readiness-check.mjs';
const checkPath = 'scripts/lfea-piping-release-orchestration-check.mjs';
const wp3IntakePath = 'scripts/lfea-piping-wp3-runtime-bundle-intake.mjs';
const wp3IntakeCheckPath = 'scripts/lfea-piping-wp3-runtime-bundle-intake-check.mjs';
const workflowPath = '.github/workflows/lfea-piping-runtime-release-certification.yml';
const releasePath = 'release-evidence/lfea-piping-release-evidence.json';
const packagePath = 'package.json';
const orchestrator = fs.readFileSync(orchestratorPath, 'utf8');
const wrapper = fs.readFileSync(wrapperPath, 'utf8');
const check = fs.readFileSync(checkPath, 'utf8');
const wp3Intake = fs.readFileSync(wp3IntakePath, 'utf8');
const wp3IntakeCheck = fs.readFileSync(wp3IntakeCheckPath, 'utf8');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
const packageValue = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

assert.ok(orchestrator.split(/\r?\n/u).length < 400, 'Phase 6E orchestrator limit is <400 lines.');
assert.ok(wrapper.split(/\r?\n/u).length < 80, 'Release wrapper limit is <80 lines.');
assert.ok(wp3Intake.split(/\r?\n/u).length < 500, 'WP3 Phase 6E intake limit is <500 lines.');
assert.ok(wp3IntakeCheck.split(/\r?\n/u).length < 430, 'WP3 Phase 6E intake check limit is <430 lines.');
assert.match(orchestrator, /['"]evidence-root['"]/u);
assert.match(orchestrator, /['"]expected-head['"]/u);
assert.match(orchestrator, /['"]manifest['"]/u);
assert.match(orchestrator, /LFEA_RELEASE_RUNTIME_OPTIONS_MISSING/u);
assert.match(orchestrator, /LFEA_RELEASE_CHECKOUT_HEAD_MISMATCH/u);
assert.match(orchestrator, /PERSISTED_RELEASE_EVIDENCE/u);
assert.match(orchestrator, /SIMULATED_FIXTURES_ONLY/u);
assert.match(orchestrator, /validators\.internal/u);
assert.match(orchestrator, /validators\.external/u);
assert.match(orchestrator, /await policyRunner\(\)/u);
assert.doesNotMatch(
  orchestrator,
  /project-qualification-check|phase6c-anti-drift|phase6d-anti-drift/u,
  'The orchestration kernel must not import simulated policy suites.',
);
assert.doesNotMatch(
  orchestrator,
  /child_process|spawn\(|execFile\(|shelljs|writeFile|appendFile|createWriteStream/u,
  'Runtime release orchestration must not execute tools or write evidence.',
);

assert.match(wrapper, /lfea-piping-release-orchestrator\.mjs/u);
assert.match(wrapper, /validateExternalReleaseEvidence/u);
assert.match(wrapper, /validateInternalReleaseEvidence/u);
assert.match(wrapper, /lfea-piping-phase6e-anti-drift-check\.mjs/u);
assert.match(wrapper, /path\.resolve\(process\.argv\[1\]/u);

assert.match(check, /\[SIMULATED\]\[INELIGIBLE_FOR_RELEASE_EVIDENCE\]/u);
assert.match(check, /PERSISTED_RELEASE_EVIDENCE/u);
assert.match(check, /LFEA_RELEASE_OPTIONS_REQUIRE_RELEASE_MODE/u);
assert.match(check, /LFEA_RELEASE_RUNTIME_OPTIONS_MISSING/u);
assert.match(check, /LFEA_RELEASE_CHECKOUT_HEAD_MISMATCH/u);
assert.match(check, /LFEA_RELEASE_INTERNAL_INTAKE_INVALID/u);
assert.match(check, /LFEA_RELEASE_EXTERNAL_INTAKE_INVALID/u);

assert.match(wp3Intake, /lfea-piping-wp3-runtime-bundle-intake\/v1/u);
assert.match(wp3Intake, /lfea-piping-wp3-runtime-bundle-assembly\/v1/u);
assert.match(wp3Intake, /requireLinearPipingExternalQualificationPackage/u);
assert.match(wp3Intake, /requireProjectAuthorityBoundExternalPackage/u);
assert.match(wp3Intake, /requirePhase6iExternalEvidenceHandoff/u);
assert.match(wp3Intake, /requirePhase6iExternalEvidenceHandoffAcceptance/u);
assert.match(wp3Intake, /canonicalStringify/u);
assert.match(wp3Intake, /LFEA_WP3_RUNTIME_INTAKE_RELEASE_MANIFEST_INVALID/u);
assert.match(wp3Intake, /LFEA_WP3_RUNTIME_INTAKE_INTERNAL_MANIFEST_MISMATCH/u);
assert.match(wp3Intake, /LFEA_WP3_RUNTIME_INTAKE_EXTERNAL_PACKAGE_MISMATCH/u);
assert.match(wp3Intake, /LFEA_WP3_RUNTIME_INTAKE_AUTHORITY_MISMATCH/u);
assert.match(wp3Intake, /LFEA_WP3_RUNTIME_INTAKE_REQUEST_MISMATCH/u);
assert.match(wp3Intake, /LFEA_WP3_RUNTIME_INTAKE_HANDOFF_MISMATCH/u);
assert.match(wp3Intake, /LFEA_WP3_RUNTIME_INTAKE_ACCEPTANCE_MISMATCH/u);
assert.match(wp3Intake, /LFEA_WP3_RUNTIME_INTAKE_OUTPUT_OVERLAP/u);
assert.match(wp3Intake, /releaseQualified:\s*false/u);
assert.doesNotMatch(wp3Intake, /releaseQualified:\s*true/u);
assert.doesNotMatch(
  wp3Intake,
  /child_process|spawn\(|execFile\(|shelljs/u,
  'WP3 runtime intake must not execute engineering or external programs.',
);
assert.match(wp3IntakeCheck, /\[SIMULATED\]\[INELIGIBLE_FOR_PROJECT_EVIDENCE\]/u);
assert.match(wp3IntakeCheck, /NO_ENGINEERING_COMMAND_EXECUTION/u);
assert.match(wp3IntakeCheck, /Downloaded request tampering fails closed/u);
assert.match(wp3IntakeCheck, /Downloaded handoff tampering fails closed/u);
assert.match(wp3IntakeCheck, /Persisted WP2 authority tampering fails closed/u);
assert.match(wp3IntakeCheck, /Internal manifest identity tampering fails closed/u);
assert.match(wp3IntakeCheck, /Assembly-summary identity tampering fails closed/u);
assert.match(wp3IntakeCheck, /Release-manifest candidate mismatch fails closed/u);

assert.match(workflow, /workflow_dispatch/u);
assert.match(workflow, /candidate_sha:/u);
assert.match(workflow, /617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54/u);
assert.match(workflow, /refs\/remotes\/origin\/release\/lfea-piping-phase6i-617f7c2/u);
assert.match(workflow, /TOOLING_HEAD:\s*\$\{\{ github\.sha \}\}/u);
assert.match(workflow, /EXPECTED_HEAD:\s*\$\{\{ inputs\.candidate_sha \}\}/u);
assert.doesNotMatch(workflow, /EXPECTED_HEAD:\s*\$\{\{ github\.sha \}\}/u);
assert.match(workflow, /lfea-piping-wp3-runtime-bundle-intake\.mjs/u);
assert.match(workflow, /--summary="bundle\/assembly-summary\.json"/u);
assert.match(workflow, /npm run check:lfea-piping-release/u);
assert.ok(
  workflow.indexOf('lfea-piping-wp3-runtime-bundle-intake.mjs')
    < workflow.indexOf('npm run check:lfea-piping-release'),
  'WP3 custody intake must precede public release validation.',
);
assert.match(workflow, /lfea-runtime-release-validation-\$\{\{ inputs\.candidate_sha \}\}/u);
assert.doesNotMatch(workflow, /lfea-runtime-release-validation-\$\{\{ github\.sha \}\}/u);

assert.equal(release.programDisposition, 'BLOCKED');
assert.equal(release.exactHead, null);
assert.equal(release.artifacts.exactHeadManifest, null);
assert.equal(release.artifacts.externalQualificationPackage, null);
assert.equal(
  packageValue.scripts['check:lfea-piping-release-policy'],
  'node scripts/lfea-piping-release-readiness-check.mjs',
);
assert.equal(
  packageValue.scripts['check:lfea-piping-release'],
  'node scripts/lfea-piping-release-readiness-check.mjs --release',
);
assert.match(packageValue.scripts.gate, /check:lfea-piping-release-policy/u);

await import('./lfea-piping-release-orchestration-check.mjs');
await import('./lfea-piping-wp3-runtime-bundle-intake-check.mjs');

console.log('Linear piping Phase 6E runtime release orchestration anti-drift check PASS');
