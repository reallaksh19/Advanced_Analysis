#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const launcher = read('../src/workspace/enrichment/first-cut-workbench-launcher.js');
const fixture = read('../e2e/fixtures/first-cut-workbench-launcher-fixture.js');
const spec = read('../e2e/first-cut-workbench-launcher.spec.js');
const workflow = read('../.github/workflows/lafea-hybrid-browser-validation.yml');

assert.match(fixture, /FirstCutWorkbenchController/u);
assert.match(fixture, /FirstCutWorkbenchLauncherController/u);
assert.match(fixture, /WorkspaceShellController/u);
assert.match(fixture, /renderWorkspaceLayout/u);
assert.match(fixture, /workbenchController\.init\(\)/u);
assert.match(fixture, /launcherController\.init\(\)/u);
assert.match(fixture, /host\.dataset\.fixtureIdentity/u);
assert.match(fixture, /getFirstCutLauncherBrowserState/u);
assert.doesNotMatch(
  fixture,
  /prepareCalculation|confirmAndRun|runFirstCutLoadEstimation|sealFirstCutAssumptionSet/u,
);
assert.doesNotMatch(fixture, /\[SIMULATED\].*(?:mass|rating|density|allowable)/iu);

assert.match(spec, /first-cut-workbench-focus/u);
assert.match(spec, /first-cut-workbench-popout/u);
assert.match(spec, /properties-collapsed/u);
assert.match(spec, /hostIdentity: 'FIRST-CUT-WORKBENCH-HOST-1'/u);
assert.match(spec, /workbenchCount: 1/u);
assert.match(spec, /launcherCount: 1/u);
assert.match(spec, /toBeFocused\(\)/u);
assert.match(spec, /panel-popup-body/u);
assert.match(spec, /First-Cut Piping Load Estimation/u);
assert.match(spec, /require LFEA/u);
assert.doesNotMatch(spec, /test\.skip|test\.fixme|\.only\(/u);
assert.doesNotMatch(spec, /\.click\(\{\s*force:\s*true/u);
assert.doesNotMatch(spec, /status\s*:\s*['"](?:PASS|QUALIFIED)['"]/u);

assert.match(launcher, /First-cut enrichment launcher/u);
assert.match(launcher, /first-cut-workbench-action-bar/u);
assert.match(launcher, /\[data-panel="viewport"\]/u);
assert.doesNotMatch(launcher, /viewport-edit-bar/u);
assert.doesNotMatch(
  launcher,
  /FirstCutWorkbenchController|FirstCutWorkbenchStore|FirstCutResultStore/u,
);

for (const path of [
  'src/workspace/enrichment/first-cut-workbench-launcher.js',
  'e2e/fixtures/first-cut-workbench-launcher-fixture.js',
  'e2e/first-cut-workbench-launcher.spec.js',
  'scripts/first-cut-workbench-launcher-check.mjs',
  'scripts/first-cut-workbench-launcher-source-guard.mjs',
  'scripts/first-cut-workbench-launcher-browser-source-guard.mjs',
]) {
  assert.ok(
    workflow.includes(`- '${path}'`),
    `Browser workflow does not trigger on ${path}.`,
  );
}
assert.match(workflow, /node scripts\/first-cut-workbench-launcher-check\.mjs/u);
assert.match(
  workflow,
  /node scripts\/first-cut-workbench-launcher-source-guard\.mjs/u,
);
assert.match(
  workflow,
  /node scripts\/first-cut-workbench-launcher-browser-source-guard\.mjs/u,
);
assert.match(
  workflow,
  /node scripts\/run-playwright\.mjs e2e\/first-cut-workbench-launcher\.spec\.js/u,
);
assert.match(workflow, /first-cut-workbench-launcher\.log/u);
assert.match(workflow, /first-cut-workbench-launcher-browser\.log/u);

for (const [path, source] of [
  ['src/workspace/enrichment/first-cut-workbench-launcher.js', launcher],
  ['e2e/fixtures/first-cut-workbench-launcher-fixture.js', fixture],
  ['e2e/first-cut-workbench-launcher.spec.js', spec],
]) {
  const lines = source.split(/\r?\n/u).length;
  assert.ok(lines <= 300, `${path} exceeds 300 lines: ${lines}.`);
}

console.log(JSON.stringify({
  check: 'first-cut-workbench-launcher-browser-source-guard',
  status: 'PASS',
  productionWorkbenchMounted: true,
  productionShellMounted: true,
  launcherActionBandVisibleAcrossViewportModes: true,
  hostIdentityAsserted: true,
  focusBrowserCaseRegistered: true,
  popoutBrowserCaseRegistered: true,
  ordinaryClicksRequired: true,
  duplicateWorkbenchAllowed: false,
  calculationInvokedByFixture: false,
  hiddenDefaultsIntroduced: false,
  browserExecutionClaimed: false,
}));

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
