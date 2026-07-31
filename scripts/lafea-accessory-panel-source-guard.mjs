#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const accessorySource = read('../src/workspace/lafea-workbench-accessory-panels.js');
const controllerSource = read('../src/workspace/lafea-workbench-controller.js');
const viewSource = read('../src/workspace/lafea-workbench-view.js');
const workbenchSource = read('../src/workspace/lafea-workbench.js');

assert.doesNotMatch(
  `${accessorySource}\n${controllerSource}\n${workbenchSource}`,
  /lafea-templates|application-templates|wizard-controller|wizard-model|wizard-view|compiler-golden|benchmark-fixtures/u,
);
assert.doesNotMatch(
  accessorySource,
  /from\s+['"][^'"]*(?:stage-registry|presenter|preview-policy|lafea-lifecycle|results-view|mesh-quality|fea-benchmark)[^'"]*['"]/u,
);
assert.match(accessorySource, /Object\.freeze\(facade\)/u);
assert.match(accessorySource, /getState: controller\.getState\.bind\(controller\)/u);
assert.match(accessorySource, /importDocument: controller\.importDocument\.bind\(controller\)/u);
assert.doesNotMatch(accessorySource, /controller\.store|controller\.view|controller\.initializeLifecycle|controller\.run\(/u);
assert.match(accessorySource, /controller: facade/u);
assert.doesNotMatch(accessorySource, /controller:\s*controller/u);

assert.match(controllerSource, /const ACCESSORY_PANEL_MANAGERS = new WeakMap\(\)/u);
assert.match(controllerSource, /const DESTROYED_CONTROLLERS = new WeakSet\(\)/u);
assert.doesNotMatch(controllerSource, /this\.accessoryPanelManager|this\.destroyed/u);
assert.match(controllerSource, /const \{ accessoryPanels, \.\.\.storeOptions \} = configuration/u);
assert.match(controllerSource, /createLafeaWorkbenchStore\(storeOptions\)/u);
assert.doesNotMatch(controllerSource, /createLafeaWorkbenchStore\(options\)/u);
assert.match(controllerSource, /lafeaAccessoryPanelConfigurationRequiresHost\(configuration\)/u);
assert.match(controllerSource, /ACCESSORY_PANEL_MANAGERS\.set\([\s\S]*this,[\s\S]*createLafeaAccessoryPanelManager/u);
assert.equal((controllerSource.match(/accessoryPanelManager\.mount\(this\)/gu) ?? []).length, 1);
assert.match(
  controllerSource,
  /this\.view\.render\(this\.store\.getState\(\)\);[\s\S]*const accessoryPanelManager = ACCESSORY_PANEL_MANAGERS\.get\(this\);[\s\S]*this\.rootElement\.append\(accessoryPanelManager\.hostElement\);[\s\S]*accessoryPanelManager\.mount\(this\);/u,
);
assert.match(
  controllerSource,
  /const accessoryPanelManager = ACCESSORY_PANEL_MANAGERS\.get\(this\);[\s\S]*accessoryPanelManager\?\.destroy\(\);[\s\S]*ACCESSORY_PANEL_MANAGERS\.delete\(this\);[\s\S]*this\.benchmarkPanel\.destroy\(\);[\s\S]*this\.view\.destroy\(\);/u,
);
assert.doesNotMatch(controllerSource, /setBenchmarkHost\(.*accessory/u);
assert.doesNotMatch(controllerSource, /benchmarkHost.*accessory|accessory.*benchmarkHost/u);

assert.doesNotMatch(viewSource, /accessoryPanels|accessory-panel|accessoryPanelManager/u);
assert.match(workbenchSource, /LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA/u);
assert.match(workbenchSource, /validateLafeaAccessoryPanelDescriptor/u);
assert.match(workbenchSource, /accessoryPanels\?:unknown\[\]/u);
assert.doesNotMatch(workbenchSource, /createLafeaAccessoryPanelManager|lafeaAccessoryPanelConfigurationRequiresHost/u);

console.log(JSON.stringify({
  check: 'lafea-accessory-panel-source-guard',
  status: 'PASS',
  templateDependencyAdded: false,
  benchmarkHostReused: false,
  fixedViewSlotsModified: false,
  rawControllerExposed: false,
  controllerStatePubliclyExpanded: false,
  storeOptionsContaminated: false,
}));

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
