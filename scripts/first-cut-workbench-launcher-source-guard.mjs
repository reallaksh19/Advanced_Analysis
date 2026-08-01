#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const launcher = read('../src/workspace/enrichment/first-cut-workbench-launcher.js');
const bootstrap = read('../src/workspace/bootstrap.js');
const controller = read('../src/workspace/enrichment/first-cut-workbench-controller.js');
const store = read('../src/workspace/enrichment/first-cut-workbench-store.js');
const view = read('../src/workspace/enrichment/first-cut-workbench-view.js');

assert.match(launcher, /first-cut-workbench-launcher\/v1/u);
assert.match(launcher, /\[data-section-id="first-cut"\]/u);
assert.match(launcher, /\[data-role="first-cut-workbench-root"\]/u);
assert.match(launcher, /\[data-role="viewport-edit-bar"\]/u);
assert.doesNotMatch(launcher, /const (?:TOOLBAR|ACTION_BAR)_SELECTOR = '\.viewport-toolbar'/u);
assert.match(launcher, /actionBar\.append\(this\.group\)/u);
assert.match(launcher, /\[data-role="first-cut-workbench-focus"\]/u);
assert.match(launcher, /\[data-role="first-cut-workbench-popout"\]/u);
assert.match(launcher, /accordion-section-header/u);
assert.match(launcher, /accordion-popout-btn/u);
assert.match(launcher, /hostIdentityRetained/u);
assert.match(launcher, /scrollIntoView/u);
assert.match(launcher, /focus\?\./u);
assert.match(launcher, /FIRST_CUT_LAUNCHER_UNIQUE_TARGET_REQUIRED/u);
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

assert.match(
  bootstrap,
  /import \{ FirstCutWorkbenchLauncherController \} from '\.\/enrichment\/first-cut-workbench-launcher\.js';/u,
);
assert.match(
  bootstrap,
  /const firstCutWorkbenchController = new FirstCutWorkbenchController/u,
);
assert.match(
  bootstrap,
  /const firstCutWorkbenchLauncherController = new FirstCutWorkbenchLauncherController\(rootElement\);/u,
);
assert.match(
  bootstrap,
  /workspaceShellController,firstCutWorkbenchController,firstCutWorkbenchLauncherController/u,
);
assert.equal(
  (bootstrap.match(/new FirstCutWorkbenchController\(/gu) ?? []).length,
  1,
  'Bootstrap must retain exactly one first-cut workbench controller.',
);
assert.equal(
  (bootstrap.match(/new FirstCutWorkbenchLauncherController\(/gu) ?? []).length,
  1,
  'Bootstrap must create exactly one launcher controller.',
);

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
assert.ok(
  launcherLines <= 300,
  `first-cut-workbench-launcher.js exceeds 300 lines: ${launcherLines}.`,
);

console.log(JSON.stringify({
  check: 'first-cut-workbench-launcher-source-guard',
  status: 'PASS',
  launcherControllerCount: 1,
  enrichmentControllerCount: 1,
  pointerSafeActionBar: true,
  heightCappedViewportToolbarUsed: false,
  hostReused: true,
  secondOverrideStoreCreated: false,
  calculationAuthorityImported: false,
  explicitConfirmationRetained: true,
  authoritySourceRevisionVisible: true,
  affectedEntitiesVisible: true,
  unresolvedEvidenceVisible: true,
  staleCopyBlocked: true,
  numericalImports: 0,
  templateImports: 0,
  launcherLineCount: launcherLines,
}));

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
