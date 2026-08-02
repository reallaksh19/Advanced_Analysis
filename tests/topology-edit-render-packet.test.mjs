import test from 'node:test';
import assert from 'node:assert/strict';
import { createDimensionAuthority } from '../src/workspace/topology-edit/dimension-authority.js';
import {
  buildTopologyEditRenderPacket,
  buildTopologyEditComponentEvidence,
  topologyEditEntityIdsForObject,
} from '../src/workspace/topology-edit/topology-edit-render-packet.js';

function topology() {
  return {
    canonicalTopologyHash: 'canonical:packet',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 } },
      { id: 'node:b', position: { x: 1000, y: 0, z: 0 } },
    ],
    edges: [{
      id: 'edge:pipe', componentKey: 'PIPE-1', fromNodeId: 'node:a',
      toNodeId: 'node:b', entityType: 'PIPE', sourcePath: '$[0]',
    }],
    junctions: [],
    supports: [{
      id: 'support:S1', entityId: 'S1', nodeId: 'node:a',
      restraints: [{ id: 'restraint:G1', kind: 'GUIDE', gapMm: 5 }],
    }],
  };
}

function dataset() {
  return {
    entities: [{
      entityId: 'PIPE-1', sourceEntityId: 'SRC-PIPE-1', sourcePath: '$[0]',
      properties: {
        geometry: { center: { x: 500, y: 0, z: 0 } },
        attributes: { OUTSIDE_DIAMETER: 114.3 },
      },
    }],
  };
}

test('render packet requires explicit dimension authority', () => {
  assert.throws(
    () => buildTopologyEditRenderPacket(topology(), topology(), { workspaceDataset: dataset() }),
    /explicit dimension authority/,
  );
});

test('render packet consumes workspace evidence and preserves pick identity', () => {
  const authority = createDimensionAuthority();
  const packet = buildTopologyEditRenderPacket(topology(), topology(), {
    workspaceDataset: dataset(),
    dimensionAuthority: authority,
    verticalAxis: 'Z',
  });
  const pipe = packet.draft.segments.find((row) => row.entityId === 'edge:pipe');
  assert.equal(pipe.radiusMm, 57.15);
  assert.deepEqual(pipe.pickTarget.workspaceEntityIds, ['PIPE-1']);
  const guide = packet.supports.segments.find((row) => row.entityId === 'restraint:G1');
  assert.equal(guide.pickTarget.supportId, 'support:S1');
  assert.equal(guide.pickTarget.restraintId, 'restraint:G1');
  assert.deepEqual(guide.pickTarget.workspaceEntityIds, ['S1']);
  assert.ok(packet.visualModelHash);
  assert.match(packet.visualPolicySummary, /chord error/);
});

test('component evidence does not promote nominal diameter to OD', () => {
  const evidence = buildTopologyEditComponentEvidence({
    entities: [{ entityId: 'P', nominalDiameterMm: 100, properties: { attributes: {} } }],
  });
  assert.equal(evidence.P.outsideDiameterMm, undefined);
  assert.equal(evidence.P.attributes.DIAMETER, undefined);
});

test('restraint identity resolves to host workspace entity', () => {
  assert.deepEqual(
    topologyEditEntityIdsForObject(topology(), 'restraint:G1'),
    ['S1'],
  );
});
