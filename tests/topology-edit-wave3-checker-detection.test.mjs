import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOPOLOGY_CHECK_REPORT_SCHEMA,
  checkCanonicalTopology,
  runTopologyEditChecks,
} from '../src/workspace/topology-edit/topology-edit-checker.js';

function baseTopology(overrides = {}) {
  return {
    schema: 'CanonicalTopology.v1',
    canonicalTopologyHash: 'canonical:wave3-checker',
    nodes: [], edges: [], junctions: [], supports: [],
    ...overrides,
  };
}

test('checker emits deterministic expanded authority findings', () => {
  const canonical = baseTopology({
    nodes: [
      { id: 'n0', position: { x: 0, y: 0, z: 0 } },
      { id: 'n1', position: { x: 0, y: 0, z: 0 } },
      { id: 'n2', position: { x: 100, y: 0, z: 0 } },
      { id: 'n3', position: { x: 104, y: 0, z: 0 } },
      { id: 'n4', position: { x: 500, y: 0, z: 0 } },
    ],
    edges: [
      { id: 'zero', fromNodeId: 'n0', toNodeId: 'n1' },
      { id: 'short-a', fromNodeId: 'n2', toNodeId: 'n3' },
      { id: 'short-b', fromNodeId: 'n3', toNodeId: 'n2' },
      { id: 'loop', fromNodeId: 'n2', toNodeId: 'n2' },
      { id: 'missing-edge', fromNodeId: 'n3', toNodeId: 'missing-node' },
    ],
    junctions: [{ id: 'junction:1', nodeIds: ['n3', 'missing-junction-node'] }],
    supports: [
      { id: 'support:missing-node', nodeId: 'missing-support-node' },
      { id: 'support:missing-host', nodeId: 'n3', hostEntityId: 'missing-host' },
      { id: 'support:ambiguous', nodeId: 'n2' },
    ],
  });
  const before = JSON.stringify(canonical);
  const first = runTopologyEditChecks(canonical);
  const second = runTopologyEditChecks(structuredClone(canonical));
  const kinds = new Set(first.issues.map((issue) => issue.kind));
  for (const kind of [
    'ORPHAN_EDGE_ENDPOINT', 'SELF_LOOP_EDGE', 'ZERO_LENGTH_EDGE', 'DUPLICATE_EDGE',
    'SHORT_ELEMENT', 'ORPHAN_NODE', 'BRANCH_DISCONNECTED', 'JUNCTION_NODE_MISSING',
    'SUPPORT_NODE_MISSING', 'SUPPORT_HOST_MISSING', 'SUPPORT_HOST_UNRESOLVED',
  ]) assert.equal(kinds.has(kind), true, `missing ${kind}`);
  assert.equal(first.schema, TOPOLOGY_CHECK_REPORT_SCHEMA);
  assert.equal(first.reportHash, second.reportHash);
  assert.equal(first.policyHash, second.policyHash);
  assert.equal(JSON.stringify(canonical), before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.issues), true);
  assert.deepEqual(checkCanonicalTopology(canonical), first.issues);
});

test('snap gap is the only W3.1 automatic candidate', () => {
  const canonical = baseTopology({
    nodes: [
      { id: 'a0', position: { x: 0, y: 0, z: 0 } },
      { id: 'a1', position: { x: 100, y: 0, z: 0 } },
      { id: 'b0', position: { x: 110, y: 0, z: 0 } },
      { id: 'b1', position: { x: 210, y: 0, z: 0 } },
    ],
    edges: [
      { id: 'edge:a', fromNodeId: 'a0', toNodeId: 'a1' },
      { id: 'edge:b', fromNodeId: 'b0', toNodeId: 'b1' },
    ],
  });
  const report = runTopologyEditChecks(canonical, { snapGapToleranceMm: 25 });
  const snap = report.issues.find((issue) => issue.kind === 'SNAP_GAP');
  assert.ok(snap);
  assert.equal(snap.suggestedAutofix, 'MERGE_NODES');
  assert.equal(snap.fixability, 'AUTO_CANDIDATE');
  assert.equal(snap.details.gapMm, 10);
  assert.deepEqual(snap.nodeIds, ['a1', 'b0']);
  for (const issue of report.issues.filter((row) => row.kind !== 'SNAP_GAP')) {
    assert.equal(issue.suggestedAutofix, null);
  }
});

test('policy changes bind report identity', () => {
  const canonical = baseTopology({
    nodes: [
      { id: 'n0', position: { x: 0, y: 0, z: 0 } },
      { id: 'n1', position: { x: 5, y: 0, z: 0 } },
    ],
    edges: [{ id: 'edge:1', fromNodeId: 'n0', toNodeId: 'n1' }],
  });
  const strict = runTopologyEditChecks(canonical, { shortElementThresholdMm: 6 });
  const relaxed = runTopologyEditChecks(canonical, { shortElementThresholdMm: 4 });
  assert.notEqual(strict.policyHash, relaxed.policyHash);
  assert.notEqual(strict.reportHash, relaxed.reportHash);
  assert.equal(strict.issues.some((issue) => issue.kind === 'SHORT_ELEMENT'), true);
  assert.equal(relaxed.issues.some((issue) => issue.kind === 'SHORT_ELEMENT'), false);
});
