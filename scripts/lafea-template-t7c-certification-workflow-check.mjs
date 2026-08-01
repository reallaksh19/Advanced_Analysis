#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const WORKFLOW_PATH = new URL(
  '../.github/workflows/lafea-template-t7c-certification.yml',
  import.meta.url,
);
const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');

for (const triggerPath of [
  "src/workspace/lafea-templates/workbench-import*.js",
  'src/workspace/lafea-templates/t7c-workbench-import.js',
  'scripts/lafea-template-t7c-*.mjs',
  '.github/workflows/lafea-template-t7c-certification.yml',
  'scripts/lafea-template-t7c-certification-workflow-check.mjs',
]) {
  assert.ok(
    workflow.includes(`- '${triggerPath}'`),
    `Missing T7C workflow trigger path: ${triggerPath}`,
  );
}

assert.match(workflow, /name: LAFEA Template T7C Certification/u);
assert.match(workflow, /permissions:\n  contents: read/u);
assert.match(
  workflow,
  /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/u,
);
assert.match(
  workflow,
  /PR_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/u,
);
assert.match(workflow, /fetch-depth: 0/u);
assert.doesNotMatch(workflow, /continue-on-error:\s*true/u);
assert.doesNotMatch(workflow, /\|\|\s*true/u);
assert.match(
  workflow,
  /No T7C behavioral or import qualification is claimed by this run\./u,
);

const orderedCommands = [
  'run: npm ci',
  'node scripts/lafea-template-t7c-workbench-import-check.mjs 2>&1',
  'node scripts/lafea-template-t7c-source-guard.mjs --base "$PR_BASE_SHA" 2>&1',
  'run: node scripts/lafea-template-t7b-compilation-preview-check.mjs',
  'run: node scripts/lafea-template-t7b-validation-parent-check.mjs',
  'run: node scripts/lafea-template-t7a-parameter-entry-check.mjs',
  'run: node scripts/lafea-template-t6c-cross-contract-check.mjs',
  'run: node scripts/lafea-accessory-panel-controller-lifecycle-check.mjs',
  'run: npm run syntax:strict',
  'run: npm run check:imports',
  'run: npm run check:lafea-core',
  'run: npm run check:lafea-workbench',
  'run: npm run build',
  'git diff --check "$PR_BASE_SHA...HEAD"',
  'run: test -z "$(git status --short)"',
];

let previousIndex = -1;
for (const command of orderedCommands) {
  const index = workflow.indexOf(command);
  assert.ok(index >= 0, `Missing required T7C certification command: ${command}`);
  assert.ok(
    index > previousIndex,
    `T7C certification command is out of fail-fast order: ${command}`,
  );
  previousIndex = index;
}

for (const stepName of [
  'Execute T7C controlled-import behavior check',
  'Execute T7C exact-base source guard',
  'Recheck T7B compilation preview',
  'Recheck T7B validation parent',
  'Recheck T7A parameter entry',
  'Recheck T6C cross-contract',
  'Recheck accessory-panel controller lifecycle',
  'Run strict syntax gate',
  'Run import-boundary gate',
  'Run LAFEA core gate',
  'Run LAFEA workbench gate',
  'Build exact T7C head',
  'Check exact base-to-head diff',
  'Require clean checkout',
]) {
  assert.ok(workflow.includes(`- name: ${stepName}`), `Missing named step: ${stepName}`);
}

assert.equal(
  (workflow.match(/lafea-template-t7c-workbench-import-check\.mjs 2>&1/gu) ?? []).length,
  1,
  'The governed T7C import check must execute exactly once.',
);
assert.equal(
  (workflow.match(/lafea-template-t7c-source-guard\.mjs --base/gu) ?? []).length,
  1,
  'The T7C source guard must execute exactly once with the actual PR base.',
);
assert.match(workflow, /if-no-files-found: error/u);
assert.match(workflow, /retention-days: 7/u);

console.log(JSON.stringify({
  check: 'lafea-template-t7c-certification-workflow',
  status: 'PASS',
  exactHeadCheckout: true,
  exactBaseSourceGuard: true,
  commandCount: orderedCommands.length,
  failFastOrder: true,
  workflowOnlyBootstrapTruthful: true,
  t7cProductionFilesChanged: 0,
  agent1ProductionFilesChanged: 0,
}));
