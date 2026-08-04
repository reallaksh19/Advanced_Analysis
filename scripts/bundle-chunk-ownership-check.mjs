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
  ['/repo/src/core/fea-benchmarks/catalog.js', 'core-fea-benchmarks'],
  ['/repo/src/core/local-shell/index.js', 'core-local-shell'],
  ['/repo/src/core/linear-piping-analysis/index.js', 'core-linear-piping'],
  ['/repo/src/core/support-engineering/index.js', 'core-support-engineering'],
]);

const automaticWorkspaceOwnership = [
  '/repo/src/workspace/bootstrap.js',
  '/repo/src/workspace/analysis-coordinator.js',
  '/repo/src/workspace/engineering-model-store.js',
  '/repo/src/workspace/dataset-controller.js',
  '/repo/src/workspace/workspace-state.js',
  '/repo/src/workspace/enrichment/first-cut-workbench-controller.js',
  '/repo/src/workspace/linear-piping-results-workbench.js',
  '/repo/src/workspace/lafea-workbench.js',
  '/repo/src/workspace/lfea-workbench.js',
  '/repo/src/workspace/topology-edit/topology-edit-controller.js',
  '/repo/src/workspace/sequential-sketcher/sequential-sketcher-controller.js',
  '/repo/src/workspace/viewport-panel.js',
];

for (const [id, expected] of expectedOwnership) {
  assert.equal(manualChunk(id), expected, `${id} must map to ${expected}`);
}
for (const id of automaticWorkspaceOwnership) {
  assert.equal(
    manualChunk(id),
    undefined,
    `${id} must remain under Rollup graph-aware ownership to avoid cross-chunk TDZ cycles.`,
  );
}

assert.equal(manualChunk('/repo/src/main.js'), undefined);
assert.equal(viteSource.includes("return 'workspace-"), false);
assert.equal(viteSource.includes("return 'fea-workbenches'"), false);
assert.equal(viteSource.includes("source.includes('/src/workspace/') return undefined"), true);
assert.equal(viteSource.includes('onlyExplicitManualChunks: true'), true);
assert.equal(viteSource.includes('chunkSizeWarningLimit'), false);
assert.equal(policySource.includes('const maximumBytes = 500 * 1024;'), true);
assert.equal(policySource.includes('chunk.bytes <= maximumBytes'), true);
assert.equal(new Set(expectedOwnership.values()).size >= 8, true);

console.log(JSON.stringify({
  check: 'bundle-chunk-ownership',
  status: 'PASS',
  explicitManualChunks: true,
  chunkSizePolicyBytes: 500 * 1024,
  ownershipAssertions: expectedOwnership.size,
  automaticWorkspaceOwnershipAssertions: automaticWorkspaceOwnership.length,
  distinctChunkOwners: new Set(expectedOwnership.values()).size,
  workspaceOwnership: 'ROLLUP_GRAPH_AWARE',
  thresholdChanged: false,
}));
