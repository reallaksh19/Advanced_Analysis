#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const launcher = read('../src/workspace/enrichment/first-cut-workbench-launcher.js');
const bootstrap = read('../src/workspace/bootstrap.js');
const layout = read('../src/workspace/workspace-layout.js');
const controller = read('../src/workspace/enrichment/first-cut-workbench-controller.js');
const store = read('../src/workspace/enrichment/first-cut-workbench-store.js');
const view = read('../src/workspace/enrichment/first-cut-workbench-view.js');

// Historical compatibility code remains inspectable and independently testable.
assert.match(launcher, /first-cut-workbench-launcher\/v1/u);
assert.match(launcher, /\[data-section-id="first-cut"\]/u);
assert.match(launcher, /\[data-role="first-cut-workbench-root"\]/u);
assert.match(launcher, /first-cut-workbench-action-bar/u);
assert.doesNotMatch(
  launcher,
  /FirstCutWorkbenchController|FirstCutWorkbenchStore|FirstCutResultStore/u,
);
assert.doesNotMatch(
  launcher,
  /prepareCalculation|confirmAndRun|runFirstCutLoadEstimation|sealFirstCutAssumptionSet/u,
);
assert.doesNotMatch(
  launcher,
  /masterData|stagedBindings|profileForm|rating|density|default.*override/iu,
);
assert.doesNotMatch(
  launcher,
  /src\/core|solver|mesher|recovery|lifecycle|renderPacket|lafea-templates/u,
);

// Production bootstrap and layout must not mount or expose the retired product.
assert.doesNotMatch(bootstrap, /FirstCutWorkbenchController/u);
assert.doesNotMatch(bootstrap, /FirstCutWorkbenchLauncherController/u);
assert.doesNotMatch(bootstrap, /first-cut-workbench-root/u);
assert.equal((bootstrap.match(/new FirstCutWorkbenchController\(/gu) ?? []).length, 0);
assert.equal((bootstrap.match(/new FirstCutWorkbenchLauncherController\(/gu) ?? []).length, 0);
assert.doesNotMatch(layout, /data-section-id="first-cut"/u);
assert.doesNotMatch(layout, /first-cut-workbench-root/u);
assert.doesNotMatch(layout, /First-Cut Load Enrichment/u);

// Historical contracts remain readable, but cannot become current authority.
assert.match(bootstrap, /FirstCutResultStore/u);
assert.match(bootstrap, /getFirstCutCalculationPackage/u);
assert.match(controller, /sealFirstCutAssumptionSet/u);
assert.match(controller, /if \(!audit\.canConfirm\)/u);
assert.match(controller, /Stale first-cut results cannot be copied\./u);
assert.match(controller, /FirstCutResultStore\.markStale\(\)/u);
assert.match(view, /Affected entities/u);
assert.match(view, /Evidence bindings/u);
assert.match(view, /Proposed user-approved approximations/u);
assert.match(view, /\$\{row\.sourceId\}@\$\{row\.revision\}/u);
assert.match(view, /copy\.disabled = !result \|\| stale/u);
assert.match(store, /sealedBindings/u);
assert.match(store, /stagedBindings/u);
assert.match(store, /stale: Boolean\(calculationPackage\)/u);

const launcherLines = launcher.split(/\r?\n/u).length;
assert.ok(launcherLines <= 300, `first-cut-workbench-launcher.js exceeds 300 lines: ${launcherLines}.`);

console.log(JSON.stringify({
  check: 'first-cut-workbench-launcher-retirement-source-guard',
  status: 'PASS',
  productionWorkbenchMounted: false,
  productionLauncherMounted: false,
  productionProductLabelVisible: false,
  historicalResultReadable: true,
  compatibilityFixtureRetained: true,
  secondOverrideStoreCreated: false,
  calculationAuthorityImportedByLauncher: false,
  numericalImports: 0,
  templateImports: 0,
  launcherLineCount: launcherLines,
}));

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
