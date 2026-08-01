#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const workflowPath = '.github/workflows/lafea-template-t7b-evidence-correction.yml';
const guardPath = 'scripts/lafea-template-t7b-evidence-correction-workflow-check.mjs';
const base = process.env.PR_BASE_SHA;
if (!base) {
  throw new TypeError('PR_BASE_SHA is required for the T7B workflow contract check.');
}

const bootstrapWriteSet = [workflowPath, guardPath].sort();
const correctionWriteSet = [
  'scripts/lafea-template-t7b-compilation-preview-check.mjs',
  'scripts/lafea-template-t7b-source-guard.mjs',
].sort();
const changed = git(['diff', '--name-only', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean).sort();
const statuses = git(['diff', '--name-status', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean);

let mode;
if (samePaths(changed, bootstrapWriteSet)) {
  mode = 'WORKFLOW_BOOTSTRAP';
  assert.equal(statuses.every((line) => line.startsWith('A\t')), true);
} else if (samePaths(changed, correctionWriteSet)) {
  mode = 'ISSUE_94_CORRECTION_HEAD';
  assert.equal(statuses.every((line) => line.startsWith('M\t')), true);
} else {
  assert.fail(`Unexpected T7B workflow write set: ${JSON.stringify(changed)}`);
}

const workflow = readFileSync(workflowPath, 'utf8');
const requiredTokens = [
  'name: LAFEA Template T7B Evidence Correction',
  "- 'scripts/lafea-template-t7b-compilation-preview-check.mjs'",
  "- 'scripts/lafea-template-t7b-source-guard.mjs'",
  "- 'scripts/lafea-template-t7b-validation-parent-check.mjs'",
  "- '.github/workflows/lafea-template-t7b-evidence-correction.yml'",
  "- 'scripts/lafea-template-t7b-evidence-correction-workflow-check.mjs'",
  'ref: ${{ github.event.pull_request.head.sha }}',
  'fetch-depth: 0',
  'PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}',
  'node scripts/lafea-template-t7b-evidence-correction-workflow-check.mjs',
  'id: t7b_correction',
  'git diff --name-only "$PR_BASE_SHA...HEAD" | sort',
  'scripts/lafea-template-t7b-compilation-preview-check.mjs',
  'scripts/lafea-template-t7b-source-guard.mjs',
  "echo 'present=true' >> \"$GITHUB_OUTPUT\"",
  "echo 'present=false' >> \"$GITHUB_OUTPUT\"",
  "if: steps.t7b_correction.outputs.present != 'true'",
  'No T7B behavioral qualification is claimed by this run.',
  "if: steps.t7b_correction.outputs.present == 'true'",
  'run: npm ci',
  'node scripts/lafea-template-t7b-compilation-preview-check.mjs',
  'node scripts/lafea-template-t7b-validation-parent-check.mjs',
  'node scripts/lafea-template-t7b-source-guard.mjs --base "$PR_BASE_SHA"',
  'run: npm run syntax:strict',
  'git diff --check "$PR_BASE_SHA...HEAD"',
  'run: test -z "$(git status --short)"',
  'name: lafea-template-t7b-evidence-correction',
  'path: lafea-template-t7b-*.log',
];
for (const token of requiredTokens) {
  assert.equal(workflow.includes(token), true, `Missing workflow token: ${token}`);
}

for (const forbidden of [
  'check:imports',
  'npm run build',
  'lafea-template-t7c-workbench-import-check.mjs',
  'lafea-template-t7c-source-guard.mjs',
  'controller.importDocument(',
  'executeLafeaStage',
  'initializeLifecycle',
  'registerLifecycleArtifact',
  'releasePromotion',
]) {
  assert.equal(workflow.includes(forbidden), false, `Forbidden workflow token: ${forbidden}`);
}

const orderedCommands = [
  'run: npm ci',
  'node scripts/lafea-template-t7b-compilation-preview-check.mjs',
  'node scripts/lafea-template-t7b-validation-parent-check.mjs',
  'node scripts/lafea-template-t7b-source-guard.mjs --base "$PR_BASE_SHA"',
  'run: npm run syntax:strict',
  'git diff --check "$PR_BASE_SHA...HEAD"',
  'run: test -z "$(git status --short)"',
];
let previousIndex = -1;
for (const command of orderedCommands) {
  const index = workflow.indexOf(command);
  assert.ok(index > previousIndex, `Workflow command order is invalid at: ${command}`);
  previousIndex = index;
}

assert.equal(
  occurrences(workflow, 'node scripts/lafea-template-t7b-compilation-preview-check.mjs'),
  1,
);
assert.equal(
  occurrences(workflow, 'node scripts/lafea-template-t7b-validation-parent-check.mjs'),
  1,
);
assert.equal(
  occurrences(workflow, 'node scripts/lafea-template-t7b-source-guard.mjs --base "$PR_BASE_SHA"'),
  1,
);
assert.equal(
  occurrences(workflow, "if: steps.t7b_correction.outputs.present == 'true'"),
  7,
);

for (const forbiddenPath of [
  'package.json',
  'src/core/',
  'src/workspace/',
  'scripts/lafea-template-t7c-',
]) {
  assert.equal(
    changed.some((path) => path === forbiddenPath || path.startsWith(forbiddenPath)),
    false,
    `Forbidden interface path changed: ${forbiddenPath}`,
  );
}

console.log(JSON.stringify({
  check: 'lafea-template-t7b-evidence-correction-workflow',
  status: 'PASS',
  mode,
  exactHeadCheckout: true,
  exactBaseSourceGuard: true,
  failFastOrder: true,
  workflowOnlyBootstrapTruthful: true,
  correctionCommandCount: 7,
  t7bProductionFilesChanged: 0,
  t7cFilesChanged: 0,
  numericalAuthorityChanged: false,
  lifecycleAuthorityChanged: false,
  releaseAuthorityChanged: false,
}, null, 2));

function occurrences(source, token) {
  return source.split(token).length - 1;
}

function samePaths(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}
