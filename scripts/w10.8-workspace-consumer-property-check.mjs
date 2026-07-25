import assert from 'node:assert/strict';
import {
  CONSUMER_IDS,
  createWorkspaceConsumerContext,
  createWorkspaceConsumerReadiness,
  createWorkspaceConsumerRegistry,
} from '../src/core/workspace-consumers/index.js';
import { canonicalStringify, deepFreeze, semanticHash } from '../src/core/shared-piping-model/index.js';
import { buildWorkspaceConsumerFixture } from './w10.8-fixtures.mjs';

console.log('\n--- W10.8 fixed-seed consumer properties ---\n');
const fixture = buildWorkspaceConsumerFixture();
const entries = Object.entries(fixture.contracts);
const seeds = [7, 19, 41, 73, 101, 137];
const baseline = context(entries, 'COMP-1');
const registry = createWorkspaceConsumerRegistry();

seeds.forEach((seed) => {
  const candidate = context(fixedShuffle(entries, seed), 'COMP-1');
  assert.equal(candidate.contextId, baseline.contextId);
  assert.equal(candidate.semanticHash, baseline.semanticHash);
  assert.equal(canonicalStringify(candidate.contractReferences), canonicalStringify(baseline.contractReferences));
  assert.equal(candidate.contracts.sharedModel, fixture.contracts.sharedModel);
  assert.equal(createWorkspaceConsumerRegistry().semanticHash, registry.semanticHash);
  const readiness = createWorkspaceConsumerReadiness(registry, candidate, CONSUMER_IDS.REPORTS, { workspaceBooted: true });
  assert.equal(readiness.semanticHash, createWorkspaceConsumerReadiness(createWorkspaceConsumerRegistry(), candidate, CONSUMER_IDS.REPORTS, { workspaceBooted: true }).semanticHash);
});

checkDiagnosticOrder();
checkSelectionIsolation();
console.log('✅ W10.8 fixed-seed consumer properties passed.\n');

function context(rows, selectedEntityId) {
  return createWorkspaceConsumerContext({
    datasetId: fixture.contracts.sharedModel.project.datasetId,
    workspaceVersion: 8,
    selectedEntityId,
    contracts: Object.fromEntries(rows),
  });
}
function checkDiagnosticOrder() {
  const staleA = staleHash(fixture.contracts.topologyGraph, 'sharedModelSemanticHash', 'fnv1a64:stale-a');
  const staleB = staleHash(fixture.contracts.loadPrimitiveSet, 'loadCaseSetSemanticHash', 'fnv1a64:stale-b');
  const first = context([...entries, ['topologyGraph', staleA], ['loadPrimitiveSet', staleB]], 'COMP-1');
  const second = context([...entries, ['loadPrimitiveSet', staleB], ['topologyGraph', staleA]], 'COMP-1');
  assert.equal(canonicalStringify(first.diagnostics), canonicalStringify(second.diagnostics));
  assert.equal(first.contextId, second.contextId);
}
function checkSelectionIsolation() {
  const first = context(entries, 'COMP-1');
  const second = context(entries, 'COMP-2');
  assert.equal(first.contextId, second.contextId);
  assert.equal(first.semanticHash, second.semanticHash);
  assert.notEqual(first.selectedEntityId, second.selectedEntityId);
  assert.equal(first.contracts.sharedModel, second.contracts.sharedModel);
  assert.equal(canonicalStringify(first.contractReferences), canonicalStringify(second.contractReferences));
  assert.equal(canonicalStringify(first.availabilitySummary), canonicalStringify(second.availabilitySummary));
}
function staleHash(value, field, replacement) {
  const { semanticHash: _hash, ...base } = structuredClone(value);
  const changed = { ...base, [field]: replacement };
  return deepFreeze({ ...changed, semanticHash: semanticHash(changed) });
}
function fixedShuffle(values, seed) {
  const rows = [...values]; let state = seed >>> 0;
  for (let index = rows.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const target = state % (index + 1);
    [rows[index], rows[target]] = [rows[target], rows[index]];
  }
  return rows;
}
