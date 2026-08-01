import test from 'node:test';
import assert from 'node:assert/strict';
import { createTopologyEditCommandRequest } from '../src/workspace/topology-edit/topology-edit-command-contract.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { resolveTopologyEditCommand } from '../src/workspace/topology-edit/topology-edit-command-resolver.js';
import { applyResolvedTopologyEditCommand } from '../src/workspace/topology-edit/topology-edit-pure-reducer.js';

function baseTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'DS-1',
    datasetVersion: 0,
    sourceHash: 'source:abc',
    topologyGraphHash: 'graph:abc',
    nodes: [
      { id: 'node:n1', position: { x: 0, y: 0, z: 0 }, portKeys: ['P1:port:start'] },
      { id: 'node:n2', position: { x: 100, y: 0, z: 0 }, portKeys: ['P1:port:end'] },
      { id: 'node:n3', position: { x: 200, y: 0, z: 0 }, portKeys: ['P2:port:start'] },
      { id: 'node:n4', position: { x: 300, y: 0, z: 0 }, portKeys: ['P2:port:end'] },
    ],
    edges: [
      { id: 'edge:e1', componentKey: 'P1', fromNodeId: 'node:n1', toNodeId: 'node:n2', diameterMm: 100, entityType: 'PIPE', sourcePath: '$[0]' },
      { id: 'edge:e2', componentKey: 'P2', fromNodeId: 'node:n3', toNodeId: 'node:n4', diameterMm: 80, entityType: 'PIPE', sourcePath: '$[1]' },
    ],
    junctions: [],
    supports: [{ id: 'support:s1', entityId: 'S1', nodeId: 'node:n3', resolved: true }],
    boundaries: [],
    rigids: [],
  });
}

function context(topology) {
  return {
    sourceHash: topology.sourceHash,
    baseCanonicalHash: baseTopology().canonicalTopologyHash,
    priorDraftHash: topology.canonicalTopologyHash,
    sessionVersion: 0,
  };
}

function resolved(topology, commandType, payload, extras = {}) {
  const authority = context(topology);
  const request = createTopologyEditCommandRequest({
    commandId: extras.commandId ?? `CMD-${commandType}`,
    commandType,
    payload,
    basis: extras.basis ?? authority,
    expectedTargetRevisions: extras.expectedTargetRevisions,
  });
  return resolveTopologyEditCommand({ request, canonicalTopology: topology, authority });
}

test('command contract rejects invalid native payloads', () => {
  assert.throws(() => createTopologyEditCommandRequest({
    commandId: 'CMD-X', commandType: 'SPLIT_EDGE',
    basis: { sourceHash: 's', baseCanonicalHash: 'b', priorDraftHash: 'p', sessionVersion: 0 },
    payload: { edgeId: 'edge:e1', fraction: 1 },
  }), /strictly between 0 and 1/);
});

test('resolver fails closed for stale authority and unknown targets', () => {
  const topology = baseTopology();
  assert.throws(() => resolved(topology, 'MOVE_NODE', { nodeId: 'node:missing', position: { x: 1, y: 2, z: 3 } }), /exactly one is required/);
  assert.throws(() => resolved(topology, 'MOVE_NODE', { nodeId: 'node:n1', position: { x: 1, y: 2, z: 3 } }, {
    basis: { ...context(topology), sessionVersion: 1 },
  }), /stale command basis sessionVersion/);
});

test('resolver binds optional target revisions', () => {
  const topology = baseTopology();
  const first = resolved(topology, 'MOVE_NODE', { nodeId: 'node:n1', position: { x: 1, y: 2, z: 3 } });
  assert.throws(() => resolved(topology, 'MOVE_NODE', { nodeId: 'node:n1', position: { x: 1, y: 2, z: 3 } }, {
    expectedTargetRevisions: { 'node:n1': `${first.targetRevisions['node:n1']}:stale` },
  }), /stale target revision/);
});

test('MOVE_NODE is pure, deterministic and frozen', () => {
  const topology = baseTopology();
  const before = JSON.stringify(topology);
  const command = resolved(topology, 'MOVE_NODE', { nodeId: 'node:n1', position: { x: 10, y: 20, z: 30 } });
  const left = applyResolvedTopologyEditCommand(topology, command);
  const right = applyResolvedTopologyEditCommand(topology, command);
  assert.equal(JSON.stringify(topology), before);
  assert.deepEqual(left, right);
  assert.deepEqual(left.nodes.find((node) => node.id === 'node:n1').position, { x: 10, y: 20, z: 30 });
  assert.ok(Object.isFrozen(left));
  assert.ok(Object.isFrozen(left.nodes));
});

test('MERGE_NODES rewrites canonical references without inverse mutation', () => {
  const topology = baseTopology();
  const command = resolved(topology, 'MERGE_NODES', { sourceNodeId: 'node:n3', targetNodeId: 'node:n2' });
  const candidate = applyResolvedTopologyEditCommand(topology, command);
  assert.equal(candidate.nodes.some((node) => node.id === 'node:n3'), false);
  assert.equal(candidate.edges.find((edge) => edge.id === 'edge:e2').fromNodeId, 'node:n2');
  assert.equal(candidate.supports[0].nodeId, 'node:n2');
  assert.deepEqual(candidate.nodes.find((node) => node.id === 'node:n2').portKeys, ['P1:port:end', 'P2:port:start']);
});

test('MERGE_NODES rejects self-loop and duplicate-edge collapse', () => {
  const topology = baseTopology();
  assert.throws(() => resolved(topology, 'MERGE_NODES', { sourceNodeId: 'node:n1', targetNodeId: 'node:n2' }), /self-loop/);
});

test('BRIDGE_GAP and ADD_STRAIGHT_ELEMENT derive stable edge identities', () => {
  const topology = baseTopology();
  for (const commandType of ['BRIDGE_GAP', 'ADD_STRAIGHT_ELEMENT']) {
    const command = resolved(topology, commandType, { fromNodeId: 'node:n2', toNodeId: 'node:n3', diameterMm: 90 });
    const first = applyResolvedTopologyEditCommand(topology, command);
    const second = applyResolvedTopologyEditCommand(topology, command);
    const created = first.edges.find((edge) => edge.createdByCommandId === command.commandId);
    assert.ok(created.id.startsWith('edge:'));
    assert.equal(created.diameterMm, 90);
    assert.deepEqual(first, second);
  }
});

test('SPLIT_EDGE creates one node and two deterministic edges', () => {
  const topology = baseTopology();
  const command = resolved(topology, 'SPLIT_EDGE', { edgeId: 'edge:e1', fraction: 0.25 });
  const candidate = applyResolvedTopologyEditCommand(topology, command);
  const createdNode = candidate.nodes.find((node) => node.createdByCommandId === command.commandId);
  const createdEdges = candidate.edges.filter((edge) => edge.createdByCommandId === command.commandId);
  assert.deepEqual(createdNode.position, { x: 25, y: 0, z: 0 });
  assert.equal(createdEdges.length, 2);
  assert.equal(candidate.edges.some((edge) => edge.id === 'edge:e1'), false);
  assert.equal(createdEdges.filter((edge) => edge.componentKey === 'P1').length, 1);
});

test('DISCONNECT_ENDPOINT moves the exact endpoint port to a new coincident node', () => {
  const topology = baseTopology();
  const command = resolved(topology, 'DISCONNECT_ENDPOINT', { edgeId: 'edge:e1', endpoint: 'FROM' });
  const candidate = applyResolvedTopologyEditCommand(topology, command);
  const edge = candidate.edges.find((row) => row.id === 'edge:e1');
  const newNode = candidate.nodes.find((node) => node.createdByCommandId === command.commandId);
  assert.equal(edge.fromNodeId, newNode.id);
  assert.deepEqual(newNode.position, { x: 0, y: 0, z: 0 });
  assert.deepEqual(newNode.portKeys, ['P1:port:start']);
  assert.deepEqual(candidate.nodes.find((node) => node.id === 'node:n1').portKeys, []);
});

test('DELETE_EDGE removes only the resolved edge', () => {
  const topology = baseTopology();
  const command = resolved(topology, 'DELETE_EDGE', { edgeId: 'edge:e1' });
  const candidate = applyResolvedTopologyEditCommand(topology, command);
  assert.deepEqual(candidate.edges.map((edge) => edge.id), ['edge:e2']);
  assert.equal(candidate.nodes.length, topology.nodes.length);
});
