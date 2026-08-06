import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTopologyEditOperationGraph,
  executeTopologyEditOperationGraph,
  topologyEditOperationReference,
} from '../src/workspace/topology-edit/authoring/topology-edit-operation-graph.js';

function topology(nodes, edges, hash) {
  return { nodes, edges, junctions: [], bends: [], canonicalTopologyHash: hash };
}

test('operation graph resolves generated canonical IDs into later command payloads', async () => {
  const graph = createTopologyEditOperationGraph({
    operationId: 'route-001',
    basisHash: 'fnv1a64:base',
    steps: [
      {
        stepId: 'destination',
        commandType: 'CREATE_NODE',
        payload: {
          position: { x: 1000, y: 500, z: 0 },
          creationRole: 'ROUTE_ENDPOINT',
          coordinateAuthority: 'USER_NUMERIC_ENTRY',
          sourceOperationId: 'route-001',
        },
      },
      {
        stepId: 'leg',
        commandType: 'ADD_STRAIGHT_ELEMENT',
        payload: {
          fromNodeId: 'node:start',
          toNodeId: topologyEditOperationReference('destination', 'created-node'),
          diameterMm: 50,
          entityType: 'PIPE',
        },
      },
    ],
  });

  const initial = topology([
    { id: 'node:start', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
  ], [], 'fnv1a64:initial');

  let sequence = 0;
  const execution = await executeTopologyEditOperationGraph({
    graph,
    initialTopology: initial,
    execute: ({ commandType, payload, topology: before }) => {
      sequence += 1;
      const commandId = `command:${sequence}`;
      if (commandType === 'CREATE_NODE') {
        const created = {
          id: 'node:created',
          position: payload.position,
          portKeys: [],
          createdByCommandId: commandId,
          topologyOperation: 'CREATE_NODE',
        };
        return {
          commandId,
          priorTopology: before,
          topology: topology([...before.nodes, created], before.edges, 'fnv1a64:node'),
        };
      }
      assert.equal(payload.toNodeId, 'node:created');
      const edge = {
        id: 'edge:created',
        fromNodeId: payload.fromNodeId,
        toNodeId: payload.toNodeId,
        createdByCommandId: commandId,
      };
      return {
        commandId,
        priorTopology: before,
        topology: topology(before.nodes, [...before.edges, edge], 'fnv1a64:edge'),
      };
    },
  });

  assert.equal(execution.bindings['destination.created-node'], 'node:created');
  assert.equal(execution.bindings['leg.created-edge'], 'edge:created');
  assert.equal(execution.receipts[1].payload.toNodeId, 'node:created');
  assert.equal(execution.resultingCanonicalHash, 'fnv1a64:edge');
});

test('operation graph fails closed for unresolved references', async () => {
  const graph = createTopologyEditOperationGraph({
    operationId: 'bad-route',
    basisHash: 'fnv1a64:base',
    steps: [{
      stepId: 'leg',
      commandType: 'ADD_STRAIGHT_ELEMENT',
      payload: {
        fromNodeId: 'node:start',
        toNodeId: topologyEditOperationReference('missing', 'created-node'),
        diameterMm: 50,
        entityType: 'PIPE',
      },
    }],
  });
  await assert.rejects(() => executeTopologyEditOperationGraph({
    graph,
    initialTopology: topology([], [], 'fnv1a64:base'),
    execute: () => null,
  }), /unresolved operation reference missing\.created-node/u);
});
