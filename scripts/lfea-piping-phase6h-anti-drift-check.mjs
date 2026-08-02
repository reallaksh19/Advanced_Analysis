#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const materializerPath = 'scripts/lfea-piping-external-evidence-materializer.mjs';
const checkPath = 'scripts/lfea-piping-external-evidence-materializer-check.mjs';
const handoffContractPath =
  'src/core/linear-piping-project-qualification/external-evidence-handoff.js';
const handoffValidatorPath =
  'scripts/lfea-piping-phase6i-external-handoff-validator.mjs';
const handoffCheckPath =
  'scripts/lfea-piping-phase6i-external-handoff-validator-check.mjs';
const binderPath = 'scripts/lfea-piping-phase6h-project-authority-binder.mjs';
const binderCheckPath = 'scripts/lfea-piping-phase6h-project-authority-binding-check.mjs';
const boundPackagePath =
  'src/core/linear-piping-project-qualification/project-authority-bound-external-package.js';
const wrapperPath = 'scripts/lfea-piping-release-readiness-check.mjs';
const releasePath = 'release-evidence/lfea-piping-release-evidence.json';
const workflowPath = '.github/workflows/lfea-piping-external-evidence-materialization.yml';
const materializer = fs.readFileSync(materializerPath, 'utf8');
const check = fs.readFileSync(checkPath, 'utf8');
const handoffContract = fs.readFileSync(handoffContractPath, 'utf8');
const handoffValidator = fs.readFileSync(handoffValidatorPath, 'utf8');
const handoffCheck = fs.readFileSync(handoffCheckPath, 'utf8');
const binder = fs.readFileSync(binderPath, 'utf8');
const binderCheck = fs.readFileSync(binderCheckPath, 'utf8');
const boundPackage = fs.readFileSync(boundPackagePath, 'utf8');
const wrapper = fs.readFileSync(wrapperPath, 'utf8');
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
const workflow = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';

assert.ok(materializer.split(/\r?\n/u).length < 430, 'Phase 6H materializer limit is <430 lines.');
assert.ok(check.split(/\r?\n/u).length < 380, 'Phase 6H materializer check limit is <380 lines.');
assert.ok(handoffContract.split(/\r?\n/u).length < 430, 'WP3 handoff contract limit is <430 lines.');
assert.ok(handoffValidator.split(/\r?\n/u).length < 390, 'WP3 handoff validator limit is <390 lines.');
assert.ok(handoffCheck.split(/\r?\n/u).length < 350, 'WP3 handoff check limit is <350 lines.');
assert.ok(binder.split(/\r?\n/u).length < 330, 'Phase 6H WP2 binder limit is <330 lines.');
assert.ok(binderCheck.split(/\r?\n/u).length < 390, 'Phase 6H WP2 binder check limit is <390 lines.');
assert.ok(boundPackage.split(/\r?\n/u).length < 230, 'WP2-bound package contract limit is <230 lines.');

assert.match(handoffContract, /lfea-piping-phase6i-external-evidence-handoff\/v1/u);
assert.match(handoffContract, /HANDOFF_ACCEPTED_FOR_PHASE6H/u);
assert.match(handoffContract, /WP2_COMPLETE/u);
assert.match(handoffContract, /WP3_COMPLETE/u);
assert.match(handoffContract, /g8G9Independence/u);
assert.match(handoffContract, /recordCount/u);
assert.match(handoffContract, /requestContentHash/u);
assert.match(handoffContract, /releaseQualified/u);
assert.match(handoffContract, /PHASE6I_FROZEN_CANDIDATE/u);
assert.match(handoffContract, /PHASE6I_IMMUTABLE_REF/u);
assert.match(handoffContract, /LFEA_WP3_HANDOFF_HASH_MISMATCH/u);
assert.match(handoffContract, /LFEA_WP3_HANDOFF_ACCEPTANCE_HASH_MISMATCH/u);

assert.match(handoffValidator, /requirePhase6iExternalEvidenceHandoff/u);
assert.match(handoffValidator, /requireApprovedProjectAuthorityIndex/u);
assert.match(handoffValidator, /compilePhase6iExternalEvidenceHandoffAcceptance/u);
assert.match(handoffValidator, /LFEA_WP3_HANDOFF_DISPATCH_IDENTITY_MISMATCH/u);
assert.match(handoffValidator, /LFEA_WP3_HANDOFF_REQUEST_CONTENT_HASH_MISMATCH/u);
assert.match(handoffValidator, /LFEA_WP3_HANDOFF_AUTHORITY_IDENTITY_MISMATCH/u);
assert.match(handoffValidator, /LFEA_WP3_HANDOFF_RECORD_IDENTITY_INVALID/u);
assert.match(handoffValidator, /external\/source-handoff\.json/u);
assert.match(handoffValidator, /external\/source-materialization-request\.json/u);
assert.doesNotMatch(
  `${handoffContract}\n${handoffValidator}\n${handoffCheck}`,
  /child_process|spawn\(|spawnSync|execFile\(|shelljs/u,
  'WP3 handoff qualification must not execute engineering or external programs.',
);
assert.match(handoffCheck, /\[SIMULATED\]\[INELIGIBLE_FOR_PROJECT_EVIDENCE\]/u);
assert.match(handoffCheck, /NO_ENGINEERING_COMMAND_EXECUTION/u);
assert.match(handoffCheck, /Request tampering after handoff fails closed/u);
assert.match(handoffCheck, /Stale WP2 authority identity fails closed/u);
assert.match(handoffCheck, /Missing source record blocks handoff acceptance/u);

assert.match(materializer, /compileLinearPipingExternalQualificationPackage/u);
assert.match(materializer, /requireApprovedProjectAuthorityIndex/u);
assert.match(materializer, /requireLinearPipingExternalQualificationPackage/u);
assert.match(materializer, /validateExternalReleaseEvidence/u);
assert.match(materializer, /linear-piping-external-qualification-package-request\/v2/u);
assert.match(materializer, /lfea-piping-external-materialization-request\/v2/u);
assert.match(materializer, /projectAuthorityIndex/u);
assert.match(materializer, /linear-piping-evidence-artifact-reference\/v1/u);
assert.match(materializer, /ELIGIBLE_FOR_WP2_BINDING/u);
assert.doesNotMatch(materializer, /ELIGIBLE_FOR_PHASE6G_ASSEMBLY/u);
assert.match(materializer, /LFEA_EXTERNAL_MATERIALIZATION_AUTHORITY_HEAD_MISMATCH/u);
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
assert.match(check, /ELIGIBLE_FOR_WP2_BINDING/u);
assert.match(check, /LFEA_EXTERNAL_MATERIALIZATION_AUTHORITY_HEAD_MISMATCH/u);
assert.match(check, /projectAuthorityIndex/u);
assert.match(check, /SYNTHETIC_COMPILER_REJECTION/u);
assert.match(check, /SYNTHETIC_INTAKE_REJECTION/u);
assert.match(check, /LFEA_EXTERNAL_MATERIALIZATION_RECORD_PATH_DUPLICATE/u);
assert.doesNotMatch(
  check,
  /child_process|spawnSync|execFile/u,
  'Phase 6H qualification must not execute engineering commands.',
);

assert.match(boundPackage, /PIPING_PROJECT_AUTHORITY_HEAD_MISMATCH/u);
assert.match(boundPackage, /PIPING_PROJECT_AUTHORITY_ARTIFACT_MISMATCH/u);
assert.match(boundPackage, /PIPING_PROJECT_AUTHORITY_ARTIFACT_PATH_DUPLICATE/u);
assert.match(boundPackage, /requireApprovedProjectAuthorityIndex/u);
assert.match(boundPackage, /requireLinearPipingExternalQualificationPackage/u);
assert.match(binder, /canonicalStringify\(packageRecord\.projectAuthorityIndex\)/u);
assert.match(binder, /project-authority-bound-package/u);
assert.match(binder, /project-authority-binding-summary/u);
assert.match(binder, /\.wp2-binding-staging-/u);
assert.match(binder, /outputPublished/u);
assert.match(binder, /fs\.rmSync\(outputTarget/u);
assert.match(binder, /fs\.rmSync\(summaryTarget/u);
assert.doesNotMatch(
  `${binder}\n${binderCheck}\n${boundPackage}`,
  /child_process|spawn\(|spawnSync|execFile\(|shelljs/u,
  'WP2 binding must not execute engineering commands.',
);

assert.equal(release.programDisposition, 'BLOCKED');
assert.equal(release.exactHead, null);
assert.equal(release.artifacts.externalQualificationPackage, null);
assert.ok(Object.values(release.gates).every((status) => status !== 'VERIFIED'));
assert.match(wrapper, /lfea-piping-phase6h-anti-drift-check\.mjs/u);

if (workflow !== '') {
  assert.match(workflow, /workflow_dispatch/u);
  assert.match(workflow, /candidate_sha:/u);
  assert.match(workflow, /handoff_path:/u);
  assert.match(workflow, /617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54/u);
  assert.match(workflow, /release\/lfea-piping-phase6i-617f7c2/u);
  assert.match(workflow, /TOOLING_HEAD:\s*\$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /EXPECTED_HEAD:\s*\$\{\{ inputs\.candidate_sha \}\}/u);
  assert.doesNotMatch(workflow, /EXPECTED_HEAD:\s*\$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /git rev-parse "\$CANDIDATE_REF\^\{commit\}"/u);
  assert.match(workflow, /actions\/download-artifact@v4/u);
  assert.match(workflow, /lfea-piping-phase6i-external-handoff-validator\.mjs/u);
  assert.match(workflow, /source-handoff\.json/u);
  assert.match(workflow, /source-materialization-request\.json/u);
  assert.match(workflow, /source-handoff-acceptance\.json/u);
  assert.ok(
    workflow.indexOf('lfea-piping-phase6i-external-handoff-validator.mjs')
      < workflow.indexOf('lfea-piping-external-evidence-materializer.mjs'),
    'WP3 handoff validation must precede Phase 6H materialization.',
  );
  assert.match(workflow, /lfea-piping-external-evidence-materializer\.mjs/u);
  assert.match(workflow, /lfea-piping-phase6h-project-authority-binder\.mjs/u);
  assert.match(workflow, /project-authority-bound-package\.json/u);
  assert.match(workflow, /lfea-piping-external-evidence-\$\{\{ inputs\.candidate_sha \}\}/u);
  assert.doesNotMatch(workflow, /pull_request:/u);
}

await import('./lfea-piping-phase6i-external-handoff-validator-check.mjs');
await import('./lfea-piping-external-evidence-materializer-check.mjs');
await import('./lfea-piping-phase6h-project-authority-binding-check.mjs');

console.log('Linear piping Phase 6H external evidence materialization anti-drift check PASS');
