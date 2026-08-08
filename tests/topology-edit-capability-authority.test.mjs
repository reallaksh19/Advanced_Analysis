import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveTopologyEditCommandCapability,
  deriveTopologyEditProfessionalCapability,
} from '../src/workspace/topology-edit/editor-state/topology-edit-capability-authority.js';
import {
  deriveTopologyEditTableCellCapability,
} from '../src/workspace/topology-edit/table/topology-edit-table-edit-capability.js';

function topology(edges) {
  const ids = new Set(edges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]));
  const nodes = [...ids].sort().map((id, index) => ({
    id,
    position: { x: index * 100, y: 0, z: 0 },
  }));
  return {
    canonicalTopologyHash: `canonical:${edges.length}:${nodes.length}`,
    nodes,
    edges,
    junctions: [],
    supports: [],
    boundaries: [],
    rigids: [],
    bends: [],
  };
}

test('exact-gap command is blocked for nodes in the same connected component', () => {
  const model = topology([
    { id: 'edge:a-b', fromNodeId: 'node:a', toNodeId: 'node:b' },
  ]);
  const receipt = deriveTopologyEditCommandCapability({
    actionId: 'set-gap-3',
    selection: { nodeIds: ['node:a', 'node:b'], edgeId: null },
    topology: model,
  });
  assert.equal(receipt.status, 'BLOCKED');
  assert.equal(receipt.reasonCode, 'EXACT_GAP_CONTEXT_INVALID');
});

test('exact-gap command is available for graph-open endpoints in separate components', () => {
  const model = topology([
    { id: 'edge:a-x', fromNodeId: 'node:a', toNodeId: 'node:x' },
    { id: 'edge:b-y', fromNodeId: 'node:b', toNodeId: 'node:y' },
  ]);
  const receipt = deriveTopologyEditCommandCapability({
    actionId: 'set-gap-3',
    selection: { nodeIds: ['node:a', 'node:b'], edgeId: null },
    topology: model,
  });
  assert.equal(receipt.status, 'AVAILABLE');
});

test('professional offset without an isolated corner is unrepresentable, not a generic failure', () => {
  const model = topology([
    { id: 'edge:a-x', fromNodeId: 'node:a', toNodeId: 'node:x' },
    { id: 'edge:b-y', fromNodeId: 'node:b', toNodeId: 'node:y' },
  ]);
  const receipt = deriveTopologyEditProfessionalCapability({
    topology: model,
    selection: { nodeIds: ['node:a', 'node:b'], edgeId: null },
    values: { operationType: 'CREATE_ORTHOGONAL_OFFSET' },
  });
  assert.equal(receipt.status, 'UNREPRESENTABLE');
  assert.equal(receipt.reasonCode, 'ARBITRARY_CORNER_NODE_CREATION_UNAVAILABLE');
});

test('extend operation is blocked when selected endpoint is not graph-open', () => {
  const model = topology([
    { id: 'edge:a-b', fromNodeId: 'node:a', toNodeId: 'node:b' },
    { id: 'edge:b-c', fromNodeId: 'node:b', toNodeId: 'node:c' },
  ]);
  const receipt = deriveTopologyEditProfessionalCapability({
    topology: model,
    selection: { nodeIds: [], edgeId: 'edge:a-b' },
    values: {
      operationType: 'EXTEND_EDGE',
      edgeId: 'edge:a-b',
      endpoint: 'TO',
      distanceMm: 100,
    },
  });
  assert.equal(receipt.status, 'BLOCKED');
  assert.equal(receipt.reasonCode, 'ENDPOINT_NOT_GRAPH_OPEN');
});

test('Table exposes certified editors and fails closed for uncertified bend/support fields', () => {
  const pipe = row('PIPE', 'EDGE', { lengthMm: 1000 });
  const bend = row('ELBOW', 'BEND', { radiusMm: 250 });
  const support = row('SUPPORT', 'SUPPORT', { gapMm: 2 });

  assert.equal(deriveTopologyEditTableCellCapability({ row: pipe, columnKey: 'lengthMm' }).status, 'AVAILABLE');

  const bendCapability = deriveTopologyEditTableCellCapability({ row: bend, columnKey: 'radiusMm' });
  assert.equal(bendCapability.status, 'UNREPRESENTABLE');
  assert.equal(bendCapability.reasonCode, 'TABLE_INTENT_NOT_CERTIFIED');

  const supportCapability = deriveTopologyEditTableCellCapability({ row: support, columnKey: 'gapMm' });
  assert.equal(supportCapability.status, 'UNREPRESENTABLE');
  assert.equal(supportCapability.reasonCode, 'SUPPORT_EDIT_NOT_CERTIFIED');
});

function row(elementType, canonicalKind, fields) {
  return {
    elementType,
    identity: { canonicalKind, canonicalId: `${elementType.toLowerCase()}:fixture` },
    fields,
  };
}
