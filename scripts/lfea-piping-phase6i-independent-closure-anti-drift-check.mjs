#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const contractPath =
  'src/core/linear-piping-project-qualification/independent-closure-review.js';
const validatorPath = 'scripts/lfea-piping-phase6i-independent-closure-validator.mjs';
const checkPath = 'scripts/lfea-piping-phase6i-independent-closure-validator-check.mjs';
const workflowPath = '.github/workflows/lfea-piping-independent-closure-review.yml';
const indexPath = 'src/core/linear-piping-project-qualification/index.js';
const releasePath = 'release-evidence/lfea-piping-release-evidence.json';

const contract = fs.readFileSync(contractPath, 'utf8');
const validator = fs.readFileSync(validatorPath, 'utf8');
const check = fs.readFileSync(checkPath, 'utf8');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));

assert.ok(contract.split(/\r?\n/u).length < 500, 'WP8 core contract limit is <500 lines.');
assert.ok(validator.split(/\r?\n/u).length < 500, 'WP8 validator limit is <500 lines.');
assert.ok(check.split(/\r?\n/u).length < 430, 'WP8 validator check limit is <430 lines.');

assert.match(contract, /lfea-piping-phase6i-benchmark-review-manifest\/v1/u);
assert.match(contract, /lfea-piping-phase6i-anti-drift-review-manifest\/v1/u);
assert.match(contract, /lfea-piping-phase6i-independent-closure-review\/v1/u);
assert.match(contract, /Array\.from\(\{ length: 22 \}/u);
assert.match(contract, /Array\.from\(\{ length: 25 \}/u);
assert.match(contract, /RECOMMEND_CLOSE/u);
assert.match(contract, /WP8_REVIEW_COMPLETE/u);
assert.match(contract, /REVIEWER_NOT_INDEPENDENT/u);
assert.match(contract, /SIGNATURE_IDENTITY_INVALID/u);
assert.match(contract, /NONLINEAR_EXCLUSIONS_INVALID/u);
assert.match(contract, /releaseQualified:\s*false/u);
assert.doesNotMatch(contract, /releaseQualified:\s*true/u);

assert.match(validator, /ELIGIBLE_FOR_GOVERNANCE_CLOSURE_RECORDING/u);
assert.match(validator, /certificationRunId/u);
assert.match(validator, /reviewRunId/u);
assert.match(validator, /REVIEW_CUSTODY_NOT_INDEPENDENT/u);
assert.match(validator, /PERSISTED_RELEASE_EVIDENCE/u);
assert.match(validator, /verifiedGateCount !== 11/u);
assert.match(validator, /releaseQualified:\s*false/u);
assert.doesNotMatch(validator, /releaseQualified:\s*true/u);
assert.doesNotMatch(
  `${contract}\n${validator}\n${workflow}`,
  /release-evidence\/lfea-piping-release-evidence\.json|AUD-A7-001.*CLOSED|programDisposition:\s*['"]QUALIFIED['"]/u,
  'WP8 source must not mutate the committed ledger or claim closure.',
);
assert.doesNotMatch(
  `${contract}\n${validator}\n${check}`,
  /child_process|spawn\(|spawnSync|execFile\(|shelljs/u,
  'WP8 validation must not execute engineering or external programs.',
);

assert.match(check, /\[SIMULATED\]\[INELIGIBLE_FOR_PROJECT_EVIDENCE\]/u);
assert.match(check, /NO_ENGINEERING_COMMAND_EXECUTION/u);
assert.match(check, /REVIEW_CUSTODY_NOT_INDEPENDENT/u);
assert.match(check, /approvedClosureCreated:\s*false/u);
assert.match(check, /auditFindingMutated:\s*false/u);
assert.match(check, /caseCount:\s*cases\.length/u);

assert.match(index, /buildPhase6iIndependentClosureReview/u);
assert.match(index, /requirePhase6iIndependentClosureReview/u);
assert.match(index, /PHASE6I_BENCHMARK_IDS/u);
assert.match(index, /PHASE6I_ANTI_DRIFT_IDS/u);

assert.match(workflow, /workflow_dispatch/u);
assert.match(workflow, /candidate_sha:/u);
assert.match(workflow, /617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54/u);
assert.match(workflow, /release\/lfea-piping-phase6i-617f7c2/u);
assert.match(workflow, /certification_run_id:/u);
assert.match(workflow, /review_run_id:/u);
assert.equal((workflow.match(/actions\/download-artifact@v4/gu) ?? []).length, 2);
assert.match(workflow, /lfea-piping-phase6i-independent-closure-validator\.mjs/u);
assert.match(workflow, /lfea-independent-closure-acceptance-/u);
assert.doesNotMatch(workflow, /pull_request:/u);
assert.doesNotMatch(workflow, /contents:\s*write|issues:\s*write|pull-requests:\s*write/u);

assert.equal(release.programDisposition, 'BLOCKED');
assert.equal(release.exactHead, null);
assert.ok(Object.values(release.gates).every((status) => status !== 'VERIFIED'));
assert.ok(Object.values(release.artifacts).every((value) => value === null));

await import('./lfea-piping-phase6i-independent-closure-validator-check.mjs');

console.log('Linear piping Phase 6I WP8 independent closure anti-drift check PASS');
