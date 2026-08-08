import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTopologyEditRenderPacket,
} from '../src/workspace/topology-edit/topology-edit-render-packet.js';
import {
  deriveTopologyEditEndpointAffordances,
} from '../src/workspace/viewport-interaction/topology-edit-endpoint-affordance-model.js';

const topology = {
  canonicalTopologyHash: 'canonical:fixture',
  nodes: [
    { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: ['P-001:port:start'] },
    { id: 'node:b', position: { x: 100, y: 0, z: 0 }, portKeys: ['P-001:port:end'] },
  ],
  edges: [
    {
      id: 'edge:P-001',
      componentKey: 'P-001',
      entityType: 'PIPE',
      fromNodeId: 'node:a',
      toNodeId: 'node:b',
      diameterMm: 50,
    },
  ],
  supports: [],
};

test('render packet projects human tag/port labels while retaining exact node identity', () => {
  const packet = buildTopologyEditRenderPacket(topology, topology);
  const target = packet.draft.elements.find((row) => row.id === 'node:b');
  assert.deepEqual(target.workspaceEntityIds, ['P-001']);
  assert.deepEqual(target.portRoles, ['TO']);
  assert.equal(target.humanLabel, 'P-001, TO');
  assert.equal(target.pickTarget.objectId, 'node:b');
});

test('endpoint affordance carries exact pickTarget and human accessible label', () => {
  const packet = buildTopologyEditRenderPacket(topology, topology);
  const rows = deriveTopologyEditEndpointAffordances(packet.draft, { modelRole: 'draft' });
  const endpoint = rows.find((row) => row.accessibleLabel === 'P-001, TO');
  assert.ok(endpoint);
  assert.equal(endpoint.pickTarget.objectKind, 'node');
  assert.equal(endpoint.pickTarget.objectId, 'node:b');
  assert.equal(endpoint.editable, true);
  assert.equal(endpoint.pickPriority, 100);
});

test('typed primitive presentation evidence supplies human labels without supplying identity', () => {
  const rows = deriveTopologyEditEndpointAffordances({
    elements: [{
      id: 'node:typed-end',
      entityId: 'node:typed-end',
      type: 'node',
      x: 100,
      y: 0,
      z: 0,
      pickTarget: {
        objectKind: 'node',
        objectId: 'node:typed-end',
        nodeId: 'node:typed-end',
      },
    }],
    primitives: [{
      workspaceEntityIds: ['V-002'],
      parameters: {
        start: { x: 0, y: 0, z: 0 },
        end: { x: 100, y: 0, z: 0 },
      },
    }],
  }, { modelRole: 'draft' });

  assert.equal(rows[0].accessibleLabel, 'V-002, TO');
  assert.equal(rows[0].pickTarget.objectId, 'node:typed-end');
  assert.deepEqual(rows[0].workspaceEntityIds, ['V-002']);
});

test('source affordances remain inspectable but are not advertised as editable', () => {
  const packet = buildTopologyEditRenderPacket(topology, topology);
  const rows = deriveTopologyEditEndpointAffordances(packet.source, { modelRole: 'source' });
  assert.equal(rows.every((row) => row.editable === false), true);
});
