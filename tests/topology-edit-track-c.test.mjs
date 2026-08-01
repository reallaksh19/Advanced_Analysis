import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  authorizeTopologyEditTargets,
  buildCanonicalSpatialIndex,
  buildTopologyEditScopeTree,
  createTopologyEditModelWideGrant,
  createTopologyEditScopeContract,
  deriveTopologyEditScopedProjection,
  queryCanonicalSpatialIndex,
  queryCanonicalSpatialIndexRay,
} from '../src/workspace/topology-edit/topology-edit-scope-contract.js';
import {
  TopologyEditLargeModelController,
} from '../src/workspace/topology-edit/topology-edit-large-model-controller.js';
import {
  TopologyEditWorkerClient,
} from '../src/workspace/topology-edit/topology-edit-worker-client.js';

const authorityV1 = Object.freeze({
  sessionAuthorityId: 'session-1',
  sessionVersion: 1,
  sourceHash: 'source-1',
  draftHash: 'draft-1',
  scopeHash: 'scope-1',
});

function smallEntities() {
  return [
    { entityId: 'A-2', branchId: 'A', sourceBranchIndex: 1 },
    { entityId: 'B-1', branchId: 'B', sourceBranchIndex: 2 },
    { entityId: 'A-1', branchId: 'A', sourceBranchIndex: 1 },
    { entityId: 'U-1' },
  ];
}

test('scope projection is deterministic and preserves full-model authority', () => {
  const entities = smallEntities();
  const input = {
    sourceHash: 'source-hash',
    baseCanonicalHash: 'canonical-hash',
    selectedBranchIds: ['A'],
  };
  const first = deriveTopologyEditScopedProjection({ entities, ...input });
  const second = deriveTopologyEditScopedProjection({
    entities: [...entities].reverse(),
    ...input,
  });

  assert.equal(first.scopeHash, second.scopeHash);
  assert.deepEqual(first.includedEntityIds, ['A-1', 'A-2']);
  assert.equal(first.fullModelEntityCount, 4);
  assert.equal(first.sourceHash, 'source-hash');
  assert.equal(first.baseCanonicalHash, 'canonical-hash');

  const changedScope = deriveTopologyEditScopedProjection({
    entities,
    ...input,
    selectedBranchIds: ['B'],
  });
  assert.notEqual(changedScope.scopeHash, first.scopeHash);
  assert.equal(changedScope.sourceHash, first.sourceHash);
  assert.equal(changedScope.baseCanonicalHash, first.baseCanonicalHash);
});

test('scope tree is stable under entity ordering and does not invent parents', () => {
  const entities = smallEntities();
  const first = buildTopologyEditScopeTree(entities);
  const second = buildTopologyEditScopeTree([...entities].reverse());

  assert.equal(first.treeHash, second.treeHash);
  assert.equal(first.branchCount, 3);
  assert.deepEqual(first.roots, ['A', 'B', '__UNASSIGNED__']);
  assert.equal(
    first.branches.find((branch) => branch.branchId === 'A').parentBranchId,
    null,
  );
});

test('out-of-scope targets fail closed unless an exact model-wide grant exists', () => {
  const entities = smallEntities();
  const projection = deriveTopologyEditScopedProjection({
    entities,
    sourceHash: 'source-hash',
    baseCanonicalHash: 'canonical-hash',
    selectedBranchIds: ['A'],
  });

  assert.throws(
    () => authorizeTopologyEditTargets({
      targets: [{ entityId: 'B-1' }],
      entities,
      projection,
    }),
    (error) => error.code === 'TARGET_OUT_OF_SCOPE',
  );

  const grant = createTopologyEditModelWideGrant({
    grantId: 'grant-1',
    sessionAuthorityId: 'session-1',
    sessionVersion: 7,
    sourceHash: 'source-hash',
    baseCanonicalHash: 'canonical-hash',
  });
  const receipt = authorizeTopologyEditTargets({
    targets: [{ entityId: 'B-1' }],
    entities,
    projection,
    modelWideGrant: grant,
  });
  assert.equal(receipt.targets[0].authorization, 'MODEL_WIDE_GRANT');

  assert.throws(
    () => authorizeTopologyEditTargets({
      targets: [{ entityId: 'B-1' }],
      entities,
      projection,
      modelWideGrant: { ...grant, sourceHash: 'changed' },
    }),
    (error) => error.code === 'MODEL_WIDE_GRANT_SOURCE_STALE',
  );
});

test('scope contract filters only the declared branch and never includes unassigned silently', () => {
  const contract = createTopologyEditScopeContract({
    sourceHash: 'source-hash',
    baseCanonicalHash: 'canonical-hash',
    selectedBranchIds: ['A'],
  });
  assert.deepEqual(
    contract.filterEntitiesByScope(smallEntities()).map((entity) => entity.entityId),
    ['A-2', 'A-1'],
  );
});

test('canonical spatial index returns exact AABB and non-axis-aligned ray hits', () => {
  const records = [
    {
      id: 'component-A',
      kind: 'PIPE',
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 1, maxZ: 1 },
    },
    {
      id: 'component-B',
      kind: 'VALVE',
      bounds: { minX: 20, minY: 20, minZ: 20, maxX: 22, maxY: 22, maxZ: 22 },
    },
    {
      id: 'component-C',
      kind: 'SUPPORT',
      bounds: { minX: -5, minY: -5, minZ: -5, maxX: -4, maxY: -4, maxZ: -4 },
    },
  ];
  const index = buildCanonicalSpatialIndex(records, { leafSize: 1 });
  const reordered = buildCanonicalSpatialIndex([...records].reverse(), { leafSize: 1 });

  assert.equal(index.indexHash, reordered.indexHash);
  assert.deepEqual(
    queryCanonicalSpatialIndex(index, {
      minX: 9,
      minY: -1,
      minZ: -1,
      maxX: 11,
      maxY: 2,
      maxZ: 2,
    }),
    ['component-A'],
  );
  const rayHits = queryCanonicalSpatialIndexRay(index, {
    origin: { x: -10, y: -10, z: -10 },
    direction: { x: 1, y: 1, z: 1 },
  });
  assert.deepEqual(rayHits.map((hit) => hit.id), [
    'component-C',
    'component-A',
    'component-B',
  ]);
});

test('canonical spatial index rejects duplicate picking/canonical IDs', () => {
  assert.throws(
    () => buildCanonicalSpatialIndex([
      {
        id: 'duplicate',
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
      },
      {
        id: 'duplicate',
        bounds: { minX: 2, minY: 2, minZ: 2, maxX: 3, maxY: 3, maxZ: 3 },
      },
    ]),
    /Duplicate canonical spatial-index ID/,
  );
});

test('performance gates use P95 and catch regressions hidden by a low average', () => {
  const controller = new TopologyEditLargeModelController({
    componentCount: 25_600,
  });
  for (let index = 0; index < 90; index += 1) {
    controller.recordMetric('pickLatencies', 10);
  }
  for (let index = 0; index < 10; index += 1) {
    controller.recordMetric('pickLatencies', 200);
  }
  controller.recordMetric('renderLatencies', 16);
  controller.recordMetric('commandTimes', 400);

  const report = controller.getPerformanceReport();
  assert.equal(report.metrics.pickMs.mean, 29);
  assert.equal(report.metrics.pickMs.p95, 200);
  assert.equal(report.gates.pick.status, 'FAIL');
  assert.equal(report.status, 'FAIL');
});

test('performance report cannot pass without required samples and exact identity', () => {
  const controller = new TopologyEditLargeModelController(1_000);
  assert.equal(controller.getPerformanceReport().status, 'INCOMPLETE');
  controller.recordIdentityResult('expected', 'neighbor');
  assert.equal(controller.getPerformanceReport().gates.identity.status, 'FAIL');
});

test('worker client accepts only the exact current authority', async () => {
  const worker = new FakeWorker();
  const client = new TopologyEditWorkerClient({
    workerFactory: () => worker,
    defaultTimeoutMs: 500,
  });
  assert.equal(client.init(), true);
  client.setAuthority(authorityV1);

  const request = client.dispatch('BUILD_SPATIAL_INDEX', { records: [] });
  const posted = worker.messages.at(-1);
  worker.emit({
    requestId: posted.requestId,
    authority: posted.authority,
    success: true,
    result: { indexedCount: 0 },
  });
  assert.deepEqual(await request, { indexedCount: 0 });
  client.destroy();
});

test('worker client rejects stale, cancelled, timed-out, and destroyed work', async () => {
  const worker = new FakeWorker();
  const client = new TopologyEditWorkerClient({
    workerFactory: () => worker,
    defaultTimeoutMs: 20,
  });
  client.init();
  client.setAuthority(authorityV1);

  const stale = client.dispatch('CHECK_TOPOLOGY', {});
  const stalePosted = worker.messages.at(-1);
  client.setAuthority({ ...authorityV1, sessionVersion: 2, draftHash: 'draft-2' });
  worker.emit({
    requestId: stalePosted.requestId,
    authority: stalePosted.authority,
    success: true,
    result: [],
  });
  await assert.rejects(stale, (error) => error.code === 'STALE_WORKER_RESPONSE');

  client.setAuthority(authorityV1);
  const cancelled = client.dispatch('CHECK_TOPOLOGY', {});
  assert.equal(cancelled.cancel(), true);
  await assert.rejects(
    cancelled,
    (error) => error.code === 'WORKER_REQUEST_CANCELLED',
  );

  const timedOut = client.dispatch('CHECK_TOPOLOGY', {}, authorityV1, {
    timeoutMs: 5,
  });
  await assert.rejects(timedOut, (error) => error.code === 'WORKER_TIMEOUT');

  const destroyed = client.dispatch('CHECK_TOPOLOGY', {});
  client.destroy();
  await assert.rejects(
    destroyed,
    (error) => error.code === 'WORKER_CLIENT_DESTROYED',
  );
  assert.equal(worker.terminated, true);
});

test('portable 25.6k fixture builds deterministic scope and index evidence', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('./fixtures/topology-edit/large-model/fixture-manifest.json', import.meta.url),
      'utf8',
    ),
  );
  const entities = generateFixture(manifest);
  assert.equal(entities.length, manifest.expected.componentCount);

  const tree = buildTopologyEditScopeTree(entities);
  assert.equal(tree.branchCount, manifest.expected.branchCount);

  const projection = deriveTopologyEditScopedProjection({
    entities,
    sourceHash: manifest.generator.sourceHash,
    baseCanonicalHash: manifest.generator.baseCanonicalHash,
    selectedBranchIds: ['branch-042'],
  });
  assert.equal(
    projection.includedEntityIds.length,
    manifest.generator.componentsPerBranch,
  );

  const records = entities.map((entity) => ({
    id: entity.entityId,
    kind: 'PIPE',
    bounds: entity.bounds,
  }));
  const index = buildCanonicalSpatialIndex(records, { leafSize: 32 });
  assert.equal(index.indexedCount, manifest.expected.componentCount);
  assert.equal(index.coordinateFrame, manifest.expected.coordinateFrame);

  const target = entities.find((entity) => entity.entityId === 'branch-042:000128');
  assert.deepEqual(
    queryCanonicalSpatialIndex(index, target.bounds),
    [target.entityId],
  );
});

class FakeWorker {
  constructor() {
    this.messages = [];
    this.onmessage = null;
    this.onerror = null;
    this.terminated = false;
  }
  postMessage(message) {
    this.messages.push(message);
  }
  emit(data) {
    this.onmessage?.({ data });
  }
  terminate() {
    this.terminated = true;
  }
}

function generateFixture(manifest) {
  const {
    branchCount,
    componentsPerBranch,
    branchSpacingMm,
    componentSpacingMm,
    componentLengthMm,
  } = manifest.generator;
  const entities = [];
  for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
    const branchId = `branch-${String(branchIndex).padStart(3, '0')}`;
    for (
      let componentIndex = 0;
      componentIndex < componentsPerBranch;
      componentIndex += 1
    ) {
      const entityId = `${branchId}:${String(componentIndex).padStart(6, '0')}`;
      const x = branchIndex * branchSpacingMm;
      const y = componentIndex * componentSpacingMm;
      const z = (branchIndex % 7) * 1_000 + (componentIndex % 11) * 10;
      entities.push({
        entityId,
        branchId,
        sourceBranchIndex: branchIndex,
        bounds: {
          minX: x,
          minY: y,
          minZ: z,
          maxX: x + componentLengthMm,
          maxY: y + 10,
          maxZ: z + 10,
        },
      });
    }
  }
  return entities;
}
