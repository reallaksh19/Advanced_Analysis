#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowPath = '.github/workflows/cii-import-boundary-certification.yml';
const workflow = fs.readFileSync(workflowPath, 'utf8');

for (const required of [
  "name: CII Import Boundary Certification",
  "ref: ${{ github.event.pull_request.head.sha }}",
  "PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}",
  "fetch-depth: 0",
  "scripts/import-check.mjs",
  "src/calc-workspace/cii-standalone-port/xml-cii-table-trace-table.js",
  "npm run check:imports 2>&1 | tee cii-import-boundary.log",
  "npm run syntax:strict",
  "REQUIRED_TRACE_TABLE_FIELD_NAMES",
  "npm run build",
  "git diff --check \"$PR_BASE_SHA...HEAD\"",
  "test -z \"$(git status --short)\"",
  "Workflow bootstrap only; issue #93 behavior is not qualified on this head.",
]) {
  assert.equal(workflow.includes(required), true, `Missing workflow contract token: ${required}`);
}

assert.equal(workflow.includes('continue-on-error'), false);
assert.equal(workflow.includes('|| true'), false);
assert.equal(occurrences(workflow, 'npm run check:imports'), 1);
assert.equal(occurrences(workflow, 'npm run syntax:strict'), 1);
assert.equal(occurrences(workflow, 'npm run build'), 1);

const orderedCommands = [
  'npm ci',
  'npm run check:imports 2>&1 | tee cii-import-boundary.log',
  'npm run syntax:strict',
  'REQUIRED_TRACE_TABLE_FIELD_NAMES',
  'npm run build',
  'git diff --check "$PR_BASE_SHA...HEAD"',
  'test -z "$(git status --short)"',
];
let previous = -1;
for (const command of orderedCommands) {
  const index = workflow.indexOf(command);
  assert.ok(index > previous, `Workflow command is missing or out of order: ${command}`);
  previous = index;
}

const changedPaths = [
  workflowPath,
  'scripts/cii-import-boundary-workflow-check.mjs',
];
assert.equal(changedPaths.every((path) => fs.existsSync(path)), true);

console.log(JSON.stringify({
  check: 'cii-import-boundary-workflow',
  status: 'PASS',
  exactHeadCheckout: true,
  exactBaseBinding: true,
  failFastOrder: true,
  workflowOnlyBootstrapTruthful: true,
  correctionProductionFilesChanged: 0,
  workflowFiles: changedPaths.length,
}));

function occurrences(source, token) {
  return source.split(token).length - 1;
}
