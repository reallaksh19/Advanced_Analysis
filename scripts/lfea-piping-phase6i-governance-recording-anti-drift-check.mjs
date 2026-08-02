#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const contractPath =
  'src/core/linear-piping-project-qualification/governance-recording.js';
const validatorPath =
  'scripts/lfea-piping-phase6i-governance-recording-validator.mjs';
const checkPath =
  'scripts/lfea-piping-phase6i-governance-recording-validator-check.mjs';
const workflowPath =
  '.github/workflows/lfea-piping-governance-recording-preparation.yml';
const indexPath = 'src/core/linear-piping-project-qualification/index.js';
const ledgerPath = 'reports/lfea-piping-phase-findings-ledger.json';
const releasePath = 'release-evidence/lfea-piping-release-evidence.json';

const contract = fs.readFileSync(contractPath, 'utf8');
const validator = fs.readFileSync(validatorPath, 'utf8');
const check = fs.readFileSync(checkPath, 'utf8');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));

assert.ok(contract.split(/\r?\n/u).length < 450,
  'WP9 governance contract limit is <450 lines.');
assert.ok(validator.split(/\r?\n/u).length < 500,
  'WP9 governance validator limit is <500 lines.');
assert.ok(check.split(/\r?\n/u).length < 430,
  'WP9 governance validator check limit is <430 lines.');

for (const token of [
  'lfea-piping-phase6i-independent-closure-acceptance/v1',
  'lfea-piping-phase6i-governance-closure-decision/v1',
  'GOVERNANCE_DECISION_COMPLETE',
  'APPROVE_CLOSURE',
  'RECORD_VERIFIED',
  'authorityBasisReference',
  'releaseQualified: source.releaseQualified',
]) {
  assert.ok(contract.includes(token), `WP9 lost contract token ${token}.`);
}
assert.doesNotMatch(contract, /releaseQualified:\s*true/u);
assert.match(index, /buildPhase6iGovernanceClosureDecision/u);
assert.match(index, /requirePhase6iIndependentClosureAcceptance/u);
assert.match(index, /requirePhase6iGovernanceClosureDecision/u);

for (const token of [
  'ELIGIBLE_FOR_AUTHORIZED_GOVERNANCE_RECORDING',
  'NO_CHANGE_BLOCKED_POLICY_TEMPLATE',
  'repositoryMutationPerformed: false',
  'issueMutationPerformed: false',
  'requiresSeparateAuthorizedCommit: true',
  'requiresSeparateAuthorizedIssueAction: true',
]) {
  assert.ok(validator.includes(token), `WP9 validator lost token ${token}.`);
}
assert.doesNotMatch(validator, /repositoryMutationPerformed:\s*true/u);
assert.doesNotMatch(validator, /issueMutationPerformed:\s*true/u);
assert.doesNotMatch(
  validator,
  /writeFileSync\([^\n]*(?:LEDGER_RELATIVE|RELEASE_RELATIVE)/u,
  'WP9 validator must never write the repository baselines.',
);
assert.doesNotMatch(
  `${contract}\n${validator}\n${check}`,
  /child_process|spawn\(|spawnSync|execFile\(|shelljs/u,
  'WP9 validation must not execute engineering or governance programs.',
);

assert.match(check, /\[SIMULATED\]\[INELIGIBLE_FOR_PROJECT_EVIDENCE\]/u);
assert.match(check, /NO_GOVERNANCE_MUTATION/u);
assert.match(check, /Promoted governance decision input is rejected/u);
assert.match(check, /auditFindingMutated:\s*false/u);
assert.match(check, /releaseTemplateMutated:\s*false/u);
assert.match(check, /issueClosed:\s*false/u);
assert.match(check, /caseCount:\s*cases\.length/u);

assert.match(workflow, /workflow_dispatch/u);
assert.match(workflow, /acceptance_run_id:/u);
assert.match(workflow, /governance_run_id:/u);
assert.equal((workflow.match(/actions\/download-artifact@v4/gu) ?? []).length, 2);
assert.match(workflow, /ACCEPTANCE_RUN_ID:\s*\$\{\{ inputs\.acceptance_run_id \}\}/u);
assert.match(workflow, /GOVERNANCE_RUN_ID:\s*\$\{\{ inputs\.governance_run_id \}\}/u);
assert.match(workflow, /lfea-piping-phase6i-governance-recording-validator\.mjs/u);
assert.match(workflow, /lfea-governance-recording-plan-/u);
assert.doesNotMatch(workflow, /pull_request:/u);
assert.doesNotMatch(
  workflow,
  /contents:\s*write|issues:\s*write|pull-requests:\s*write|git push|gh issue close/u,
);

const phase = ledger.phases.find(
  (entry) => entry.phaseId === 'PHASE_6_PROJECT_QUALIFICATION',
);
const finding = ledger.findings.find((entry) => entry.findingId === 'AUD-A7-001');
assert.equal(phase?.status, 'UNRESOLVED_GATE');
assert.equal(phase?.completedAtUtc, null);
assert.equal(finding?.currentStatus, 'UNRESOLVED_GATE');
assert.equal(typeof finding?.remainingCondition, 'string');
assert.equal(release.programDisposition, 'BLOCKED');
assert.equal(release.exactHead, null);
assert.ok(Object.values(release.gates).every((status) => status !== 'VERIFIED'));
assert.ok(Object.values(release.artifacts).every((value) => value === null));

await import('./lfea-piping-phase6i-governance-recording-validator-check.mjs');

console.log('Linear piping Phase 6I WP9 governance recording anti-drift check PASS');
