#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = read('../src/workspace/sequential-sketcher/sketcher-authoring-bridge.js');
const contracts = read('../src/workspace/sequential-sketcher/sketcher-authoring-contracts.js');
const controller = read('../src/workspace/sequential-sketcher/sequential-sketcher-controller.js');
const view = read('../src/workspace/sequential-sketcher/sequential-sketcher-view.js');

assert.match(bridge, /gateway\.execute\(command\)/u);
assert.equal(
  (bridge.match(/gateway\.execute\(/gu) ?? []).length,
  1,
  'The bridge must contain exactly one gateway command-execution path.',
);
assert.match(bridge, /op: 'STRETCH_NODE'/u);
assert.doesNotMatch(bridge, /ADD_STRAIGHT|ADD_FLANGE_SET|ADD_VALVE|SPLIT_PIPE/u);
assert.match(bridge, /snapshot\.dataset !== gesture\.datasetRef/u);
assert.match(bridge, /snapshot\.dataset !== active\.datasetRef/u);
assert.doesNotMatch(bridge, /snapshot\.version|workspaceState\.loadDataset/u);
assert.match(bridge, /event\?\.key === 'Escape'/u);
assert.match(bridge, /addEventListener\('pointercancel'/u);
assert.match(bridge, /removeEventListener\('pointercancel'/u);
assert.match(bridge, /cancelGesture\('DATASET_CHANGED'\)/u);
assert.match(bridge, /cancelGesture\('STALE_DATASET_REVISION'\)/u);
assert.match(bridge, /workspaceState\.selectEntity\?\./u);
assert.match(bridge, /entityRole: 'SOURCE'/u);
assert.match(bridge, /clearActive\(\);\n    const gatewayResult = gateway\.execute/u);
assert.doesNotMatch(bridge, /Math\.random|Date\.now|crypto\.randomUUID/u);

assert.match(contracts, /SequentialSketcherTransientPreview\.v1/u);
assert.match(contracts, /dataset\.version \?\? 0/u);
assert.match(contracts, /offsetGeometry/u);
assert.match(contracts, /sourceMutation: false/u);
assert.doesNotMatch(contracts, /workspaceState\.loadDataset|gateway\.execute\(/u);

assert.match(controller, /createSketcherAuthoringBridge/u);
assert.match(controller, /this\.authoringBridge = createSketcherAuthoringBridge/u);
assert.match(controller, /this\.authoringBridge\.handleWorkspaceSnapshot\(snapshot\)/u);
assert.match(controller, /this\.authoringBridge\.destroy\(\)/u);
assert.doesNotMatch(view, /sketcher-authoring-bridge|authoringBridge/u);

const production = `${bridge}\n${contracts}\n${controller}`;
for (const forbidden of [
  /src\/core/u,
  /local-shell/u,
  /solver/u,
  /mesher/u,
  /recovery/u,
  /result-store/u,
  /lafea-templates/u,
  /render-packet/u,
  /lifecycle/u,
]) {
  assert.doesNotMatch(production, forbidden);
}

for (const [path, source] of [
  ['src/workspace/sequential-sketcher/sketcher-authoring-bridge.js', bridge],
  ['src/workspace/sequential-sketcher/sketcher-authoring-contracts.js', contracts],
  ['src/workspace/sequential-sketcher/sequential-sketcher-controller.js', controller],
]) {
  const lines = source.split(/\r?\n/u).length;
  assert.ok(lines <= 300, `${path} exceeds the 300-line production ceiling: ${lines}.`);
}

console.log(JSON.stringify({
  check: 'sequential-sketcher-authoring-bridge-source-guard',
  status: 'PASS',
  gatewayCommandPaths: 1,
  acceptedOperation: 'STRETCH_NODE',
  datasetObjectRevisionBound: true,
  snapshotVersionUsedAsRevision: false,
  escapeCancellation: true,
  pointerCancellation: true,
  datasetChangeCancellation: true,
  sourceMutationInPreview: false,
  sequentialViewModifiedForGesture: false,
  solverImports: 0,
  mesherImports: 0,
  recoveryImports: 0,
  resultImports: 0,
  templateImports: 0,
}));

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
