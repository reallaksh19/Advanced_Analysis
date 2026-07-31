#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const matrix = JSON.parse(read('../e2e/lafea-hybrid-validation-matrix.json'));
const spec = read('../e2e/lafea-hybrid-workbench.spec.js');
const fixture = read('../e2e/fixtures/lafea-hybrid-workbench-fixture.js');
const workflow = read('../.github/workflows/lafea-hybrid-browser-validation.yml');

assert.deepEqual(Object.keys(matrix).sort(), ['basis', 'cases', 'phase', 'schema']);
assert.equal(matrix.schema, 'lafea-hybrid-browser-validation-matrix/v1');
assert.equal(matrix.cases.length, 8);
assert.deepEqual(
  matrix.cases.map((entry) => entry.testId),
  [
    'HC-UI-01', 'HC-UI-02', 'HC-UI-03', 'HC-UI-04',
    'HC-UI-05', 'HC-UI-06', 'HC-UI-07', 'HC-REAL-01',
  ],
);

const implemented = new Set(['HC-UI-01', 'HC-UI-02', 'HC-UI-06']);
const blocked = new Map([
  ['HC-UI-03', 'BLOCKED_DEPENDENCY'],
  ['HC-UI-04', 'BLOCKED_DEPENDENCY'],
  ['HC-UI-05', 'BLOCKED_DEPENDENCY'],
  ['HC-UI-07', 'BLOCKED_PHASE_4'],
  ['HC-REAL-01', 'BLOCKED_USER_EVIDENCE'],
]);

for (const entry of matrix.cases) {
  assert.deepEqual(
    Object.keys(entry).sort(),
    implemented.has(entry.testId)
      ? ['expectedResult', 'implementationStatus', 'inputBasis', 'spec', 'testId']
      : ['blockingDependency', 'expectedResult', 'implementationStatus', 'inputBasis', 'testId'],
  );
  assert.match(entry.inputBasis, /\[SIMULATED\]|User-supplied/u);
  if (implemented.has(entry.testId)) {
    assert.equal(entry.implementationStatus, 'IMPLEMENTED_EXECUTION_REQUIRED');
    assert.equal(entry.spec, 'e2e/lafea-hybrid-workbench.spec.js');
    assert.match(spec, new RegExp(`${entry.testId}:`, 'u'));
  } else {
    assert.equal(entry.implementationStatus, blocked.get(entry.testId));
    assert.ok(entry.blockingDependency.length > 10);
    assert.doesNotMatch(
      spec,
      new RegExp(`test\\([^\\n]*${entry.testId}`, 'u'),
      `${entry.testId} must not be registered as an executable PASS path before its dependency exists.`,
    );
  }
  assert.notEqual(entry.implementationStatus, 'PASS');
  assert.notEqual(entry.implementationStatus, 'QUALIFIED');
}

assert.match(spec, /page\.goto\('\/'\)/u);
assert.match(spec, /import\(fixtureUrl\)/u);
assert.match(spec, /data-live-viewport-mode/u);
assert.match(spec, /data-result-renderer/u);
assert.match(spec, /webglcontextlost/u);
assert.doesNotMatch(spec, /test\.skip|test\.fixme|\.only\(/u);
assert.doesNotMatch(spec, /setContent\(/u);
assert.doesNotMatch(
  spec,
  /status\s*:\s*['"](?:PASS|QUALIFIED)['"]/u,
);

assert.match(fixture, /import \* as THREE from 'three'/u);
assert.match(fixture, /mountLafeaWorkbench/u);
assert.match(fixture, /triangleSource/u);
assert.match(fixture, /initializeLifecycle/u);
assert.match(fixture, /registerLifecycleArtifact/u);
assert.match(fixture, /applyLifecycleEvent/u);
assert.match(fixture, /getDisplayViewportContext/u);
assert.match(fixture, /setDisplayRenderPacket/u);
assert.match(fixture, /HC-UI-SIMULATED/u);
assert.doesNotMatch(
  fixture,
  /lafea-workbench-(?:controller|render-evidence)|lafea-live-workbench-viewport|lafea-hybrid-result-viewport/u,
);
assert.doesNotMatch(
  fixture,
  /lafeaWorkbenchDisplayRenderPacket|bindLafeaWorkbenchDisplayRenderPacket|CONTROLLER_STATE/u,
);
assert.doesNotMatch(fixture, /stage\.execution|executeLafeaStage|\.run\(\)/u);
assert.doesNotMatch(fixture, /src\/core\/local-shell|lafea-templates/u);

assert.match(workflow, /actions\/checkout@v4/u);
assert.match(workflow, /github\.event\.pull_request\.head\.sha \|\| github\.sha/u);
assert.match(workflow, /actions\/setup-node@v4/u);
assert.match(workflow, /node-version: 20/u);
assert.match(workflow, /npm ci/u);
assert.match(workflow, /npx playwright install chromium --with-deps/u);
assert.match(workflow, /node scripts\/lafea-u4h-browser-source-guard\.mjs/u);
assert.match(
  workflow,
  /node scripts\/run-playwright\.mjs e2e\/lafea-hybrid-workbench\.spec\.js/u,
);
assert.match(workflow, /playwright-report\//u);
assert.match(workflow, /test-results\//u);

for (const [path, source] of [
  ['e2e/lafea-hybrid-workbench.spec.js', spec],
  ['e2e/fixtures/lafea-hybrid-workbench-fixture.js', fixture],
  ['scripts/lafea-u4h-browser-source-guard.mjs', read('./lafea-u4h-browser-source-guard.mjs')],
]) {
  assert.ok(source.split(/\r?\n/u).length <= 300, `${path} exceeds 300 lines.`);
}

console.log(JSON.stringify({
  check: 'lafea-u4h-browser-source-guard',
  status: 'PASS',
  implementedCases: [...implemented],
  blockedCases: [...blocked.keys()],
  browserExecutionClaimed: false,
  realProjectEvidencePresent: false,
  privateRenderRegistryUsed: false,
  numericalAuthorityChanged: false,
  lafea6Enabled: false,
}));

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
