#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { manualChunk } from '../vite.config.js';

const viteSource = fs.readFileSync('vite.config.js', 'utf8');
const policySource = fs.readFileSync('scripts/bundle-chunk-check.mjs', 'utf8');

const expectedOwnership = new Map([
  ['/repo/src/calc-workspace/cii-standalone-port/ui-adapted/panel.js', 'cii-standalone-ui'],
  ['/repo/src/calc-workspace/cii-standalone-port/xml-cii-table-trace-source.js', 'cii-standalone-core'],
  ['/repo/src/calc-workspace/other-calc/controller.js', 'calculation-workspaces'],
  ['/repo/src/vendors/catalog.js', 'vendor-integrations'],
  ['/repo/src/utils/format.js', 'application-support'],
  ['/repo/src/mocks/model.js', 'application-support'],
  ['/repo/src/workspace/enrichment/first-cut-workbench-controller.js', 'workspace-enrichment'],
  ['/repo/src/workspace/first-cut-result-store.js', 'workspace-enrichment'],
  ['/repo/src/workspace/linear-piping-results-workbench.js', 'workspace-linear-piping'],
  ['/repo/src/workspace/analysis-coordinator.js', 'workspace-analysis'],
  ['/repo/src/workspace/model-calculation-controller.js', 'workspace-analysis'],
  ['/repo/src/workspace/support-restraint-store.js', 'workspace-analysis'],
  ['/repo/src/workspace/dataset-controller.js', 'workspace-data'],
  ['/repo/src/workspace/master-data-controller.js', 'workspace-data'],
  ['/repo/src/workspace/properties-panel.js', 'workspace-data'],
  ['/repo/src/workspace/bootstrap.js', 'workspace-shell'],
  ['/repo/src/workspace/workspace-layout.js', 'workspace-shell'],
  ['/repo/src/workspace/lafea-workbench.js', 'fea-workbenches'],
  ['/repo/src/core/local-shell/index.js', 'core-local-shell'],
]);

const automaticOwnership = [
  '/repo/src/workspace/sequential-sketcher/sequential-sketcher-controller.js',
  '/repo/src/workspace/sequential-sketcher/sequential-sketcher-view.js',
];

for (const [id, expected] of expectedOwnership) {
  assert.equal(manualChunk(id), expected, `${id} must map to ${expected}`);
}
for (const id of automaticOwnership) {
  assert.equal(
    manualChunk(id),
    undefined,
    `${id} must remain under Rollup automatic ownership to avoid a cyclic sketcher chunk.`,
  );
}

assert.equal(manualChunk('/repo/src/main.js'), undefined);
assert.equal(viteSource.includes("return 'workspace-sketcher'"), false);
assert.equal(viteSource.includes('onlyExplicitManualChunks: true'), true);
assert.equal(viteSource.includes('chunkSizeWarningLimit'), false);
assert.equal(policySource.includes('const maximumBytes = 500 * 1024;'), true);
assert.equal(policySource.includes('chunk.bytes <= maximumBytes'), true);
assert.equal(new Set(expectedOwnership.values()).size >= 10, true);

console.log(JSON.stringify({
  check: 'bundle-chunk-ownership',
  status: 'PASS',
  explicitManualChunks: true,
  chunkSizePolicyBytes: 500 * 1024,
  ownershipAssertions: expectedOwnership.size,
  automaticOwnershipAssertions: automaticOwnership.length,
  distinctChunkOwners: new Set(expectedOwnership.values()).size,
  sequentialSketcherOwnership: 'ROLLUP_AUTOMATIC',
  thresholdChanged: false,
}));
