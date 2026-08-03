#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import {
  WORKSPACE_BRANCH_SUBSET_SCHEMA,
  requireBranchSubsetManifest,
  sealBranchSubsetManifest,
} from '../src/workspace/analysis-authority-overlay/index.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceId = 'benchmarks/1885Sjson/EnrichedSjson';
const targetBranchId = '/ASIM-1885-8"-S8810103-91261M7-HC-01/B1';
const sourceBytes = await readFile(resolve(root, sourceId));
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const dataset = normalizeWorkspaceDataset(
  JSON.parse(sourceBytes.toString('utf8')),
  sourceId,
  { sourceBytes, sourceSha256 },
);
const targetEntities = dataset.entities.filter((entity) => entity.branchId === targetBranchId);
assert.equal(targetEntities.length, 16, 'Owner-verified Benchmark B branch must retain 16 entities');
const entityIds = targetEntities.map((entity) => entity.entityId).sort(ascii);
const supportEntityIds = targetEntities.filter((entity) => entity.category === 'support').map((entity) => entity.entityId).sort(ascii);
const headNodeId = 'port:445275.151|-1159925|1182.651';
const tailNodeId = 'port:445580.151|-1165803.2|3209.55';
const input = () => ({
  schema: WORKSPACE_BRANCH_SUBSET_SCHEMA,
  datasetId: dataset.datasetId,
  branchId: targetBranchId,
  entityIds: [...entityIds],
  routeIds: [`route:${targetBranchId}:1`],
  supportEntityIds: [...supportEntityIds],
  boundaryPorts: [
    { nodeId: headNodeId, externalReference: '/ASIM-1885-10"-S8810101-91261M7-HC-01/B6', treatment: 'DECLARED_BOUNDARY' },
    { nodeId: tailNodeId, externalReference: '/ASIM-1885-PL-8"-S8810104-01/B1', treatment: 'DECLARED_BOUNDARY' },
  ],
  externalDependencies: [],
  diagnostics: [],
});

const sealed = sealBranchSubsetManifest(input(), { dataset });
assert.equal(requireBranchSubsetManifest(sealed, { dataset }), sealed);
assert.equal(Object.isFrozen(sealed), true);
assert.equal(Object.isFrozen(sealed.boundaryPorts[0]), true);
assert.equal(sealBranchSubsetManifest(input(), { dataset }).semanticHash, sealed.semanticHash);

expectCode(() => {
  const draft = input(); draft.entityIds.push(draft.entityIds[0]);
  sealBranchSubsetManifest(draft, { dataset });
}, 'BRANCH_SUBSET_DUPLICATE_ID');
expectCode(() => {
  const draft = input(); draft.entityIds[0] = 'missing-entity';
  sealBranchSubsetManifest(draft, { dataset });
}, 'BRANCH_SUBSET_ENTITY_ORPHANED');
expectCode(() => {
  const draft = input(); draft.entityIds = [];
  sealBranchSubsetManifest(draft, { dataset });
}, 'BRANCH_SUBSET_LIST_INVALID');
expectCode(() => {
  const draft = input(); draft.boundaryPorts[0].nodeId = 'port:999|999|999';
  sealBranchSubsetManifest(draft, { dataset });
}, 'BRANCH_SUBSET_BOUNDARY_INVALID');
expectCode(() => {
  const stale = clone(sealed); stale.routeIds.push('tampered');
  requireBranchSubsetManifest(stale, { dataset });
}, 'BRANCH_SUBSET_HASH_MISMATCH');

console.log(JSON.stringify({
  check: 'w11.2-branch-subset-contract',
  status: 'PASS',
  datasetId: dataset.datasetId,
  branchId: targetBranchId,
  entityCount: entityIds.length,
  supportEntityCount: supportEntityIds.length,
  boundaryPortCount: sealed.boundaryPorts.length,
  semanticHash: sealed.semanticHash,
}, null, 2));

function expectCode(action, code) {
  assert.throws(action, (error) => error?.code === code, `expected ${code}`);
}
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
