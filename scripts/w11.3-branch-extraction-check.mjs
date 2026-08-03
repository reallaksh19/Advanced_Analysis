#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { extractBranchSubset } from '../src/workspace/analysis-authority-overlay/branch-extraction.js';
import {
  createEmptyProjectDataProfile,
  createEvidenceValue,
} from '../src/workspace/project-data/project-data-contract.js';
import { buildRoutePartitionModel } from '../src/workspace/routes/route-partition-model.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceId = 'benchmarks/1885Sjson/EnrichedSjson';
const branchId = '/ASIM-1885-8"-S8810103-91261M7-HC-01/B1';
const sourceBytes = await readFile(resolve(root, sourceId));
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const dataset = normalizeWorkspaceDataset(
  JSON.parse(sourceBytes.toString('utf8')),
  sourceId,
  { sourceBytes, sourceSha256 },
);
const profile = makeProfile();
const datasetBefore = JSON.stringify(dataset);
const profileBefore = JSON.stringify(profile);
const sealed = extractBranchSubset(dataset, branchId, profile);
assert.deepEqual(
  extractBranchSubset(dataset, branchId, profile),
  sealed,
  'repeated extraction must be deterministic',
);
assert.equal(JSON.stringify(dataset), datasetBefore, 'branch extraction must not mutate the dataset');
assert.equal(JSON.stringify(profile), profileBefore, 'branch extraction must not mutate the topology profile');
assert.equal(Object.isFrozen(sealed), true, 'extractBranchSubset must return a sealed manifest');
assert.equal(Object.isFrozen(sealed.boundaryPorts), true, 'sealed manifest children must be immutable');

const routePartition = buildRoutePartitionModel(dataset, profile);
const realRouteIds = routePartition.routes
  .filter((route) => route.branchId === branchId)
  .map((route) => route.routeId)
  .sort(ascii);

assert.equal(sealed.entityIds.length, 16, 'Owner-verified branch must contain 16 entities');
assert.equal(sealed.supportEntityIds.length, 9, 'Owner-verified branch must contain 9 supports');
assert.deepEqual(sealed.boundaryPorts, [
  {
    nodeId: 'port:445275.151|-1159925|1182.651',
    externalReference: '/ASIM-1885-10"-S8810101-91261M7-HC-01/B6',
    treatment: 'DECLARED_BOUNDARY',
  },
  {
    nodeId: 'port:445580.151|-1165803.2|3209.55',
    externalReference: '/ASIM-1885-PL-8"-S8810104-01/B1',
    treatment: 'DECLARED_BOUNDARY',
  },
]);
assert.ok(sealed.routeIds.length > 0, 'target branch must produce at least one production route');
assert.deepEqual(sealed.routeIds, realRouteIds, 'manifest routeIds must exactly match production route output');
for (const routeId of sealed.routeIds) {
  const prefix = `route:${branchId}:`;
  assert.ok(routeId.startsWith(prefix), `routeId must start with ${prefix}`);
  const suffix = Number(routeId.slice(prefix.length));
  assert.ok(Number.isInteger(suffix) && suffix > 0, `routeId ${routeId} must end in a positive index`);
  assert.ok(routePartition.routes.some((route) => route.branchId === branchId && route.routeId === routeId));
}

const terminusDataset = makePhysicalTerminusDataset();
const terminusManifest = extractBranchSubset(terminusDataset, '/SYNTHETIC/B1', profile);
assert.deepEqual(terminusManifest.boundaryPorts, [
  { nodeId: 'port:0|0|0', externalReference: 'NONE:PHYSICAL_TERMINUS', treatment: 'DECLARED_BOUNDARY' },
  { nodeId: 'port:200|0|0', externalReference: 'NONE:PHYSICAL_TERMINUS', treatment: 'DECLARED_BOUNDARY' },
]);

console.log(JSON.stringify({
  check: 'w11.3-branch-extraction',
  status: 'PASS',
  routePartitionStatus: routePartition.status,
  routePartitionBlockers: routePartition.blockers,
  manifest: sealed,
  physicalTerminusManifest: terminusManifest,
}, null, 2));

function makeProfile() {
  const empty = createEmptyProjectDataProfile();
  const approved = (value) => createEvidenceValue(value, { source: 'FIXTURE_TOPOLOGY' }, true);
  return {
    ...empty,
    topology: {
      ...empty.topology,
      portMatchToleranceMm: approved(1),
      autoCarrierCoincidenceToleranceMm: approved(1),
      routeJoiningRules: approved({ mode: 'EXACT' }),
    },
  };
}

function makePhysicalTerminusDataset() {
  const entity = (entityId, startX, endX) => ({
    entityId,
    entityType: 'PIPE',
    category: 'pipe',
    branchId: '/SYNTHETIC/B1',
    lineKey: 'SYNTHETIC',
    sourceEntityId: entityId,
    jsonPointer: `/objects/${entityId}`,
    componentReference: entityId,
    properties: {
      geometry: {
        start: { x: startX, y: 0, z: 0 },
        end: { x: endX, y: 0, z: 0 },
      },
      attributes: {},
    },
  });
  return {
    datasetId: 'dataset:synthetic-physical-terminus',
    entities: [entity('synthetic-pipe-1', 0, 100), entity('synthetic-pipe-2', 100, 200)],
  };
}

function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
