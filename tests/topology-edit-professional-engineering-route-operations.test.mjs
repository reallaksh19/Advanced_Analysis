import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  planApplyDeclaredSlope,
  planCreateOrthogonalOffset,
  planExtendEdge,
  planMoveConnectedRun,
  planProfessionalOperation,
  planReconnectOpenEndpoints,
  planShortenEdge,
  planSplitEdgeByDistance,
} from '../src/workspace/topology-edit/professional/topology-edit-route-operations.js';

async function fixture(name) {
  const url = new URL(`./fixtures/topology-edit/professional/${name}`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

function singleEdgeTopology(reverse = false) {
  const topology = {
    canonicalTopologyHash: 'fnv1a64:single-edge',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:b', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [{
      id: 'edge:P-001',
      componentKey: 'P-001',
      fromNodeId: 'node:a',
      toNodeId: 'node:b',
      diameterMm: 100,
      entityType: 'PIPE',
    }],
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
    crosswalk: {
      nodeIdToPortKeys: {},
      edgeIdToComponentKey: { 'edge:P-001': 'P-001' },
      junctionIdToComponentKey: {}, supportIdToEntityId: {},
    },
  };
  if (reverse) {
    topology.nodes.reverse();
    topology.edges.reverse();
  }
  return topology;
}

function reconnectTopology() {
  return {
    canonicalTopologyHash: 'fnv1a64:reconnect',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:b', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:c', position: { x: 200, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:d', position: { x: 300, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [
      { id: 'edge:left', componentKey: 'P-L', fromNodeId: 'node:a', toNodeId: 'node:b', diameterMm: 100, entityType: 'PIPE' },
      { id: 'edge:right', componentKey: 'P-R', fromNodeId: 'node:c', toNodeId: 'node:d', diameterMm: 100, entityType: 'PIPE' },
    ],
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
    crosswalk: {
      nodeIdToPortKeys: {},
      edgeIdToComponentKey: { 'edge:left': 'P-L', 'edge:right': 'P-R' },
      junctionIdToComponentKey: {}, supportIdToEntityId: {},
    },
  };
}

function boundedRunTopology() {
  return {
    canonicalTopologyHash: 'fnv1a64:bounded-run',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:b', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:c', position: { x: 200, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:d', position: { x: 300, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [
      { id: 'edge:ab', componentKey: 'P-AB', fromNodeId: 'node:a', toNodeId: 'node:b' },
      { id: 'edge:bc', componentKey: 'P-BC', fromNodeId: 'node:b', toNodeId: 'node:c' },
      { id: 'edge:cd', componentKey: 'P-CD', fromNodeId: 'node:c', toNodeId: 'node:d' },
    ],
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
    crosswalk: {
      nodeIdToPortKeys: {},
      edgeIdToComponentKey: { 'edge:ab': 'P-AB', 'edge:bc': 'P-BC', 'edge:cd': 'P-CD' },
      junctionIdToComponentKey: {}, supportIdToEntityId: {},
    },
  };
}

test('extend and shorten produce exact MOVE_NODE plans and stable hashes', () => {
  const topology = singleEdgeTopology();
  const extend = planExtendEdge({
    topology,
    edgeId: 'edge:P-001',
    endpoint: 'TO',
    distanceMm: 25,
    basisHash: topology.canonicalTopologyHash,
  });
  const reordered = planExtendEdge({
    topology: singleEdgeTopology(true),
    edgeId: 'edge:P-001',
    endpoint: 'TO',
    distanceMm: 25,
    basisHash: topology.canonicalTopologyHash,
  });
  const shorten = planShortenEdge({
    topology,
    edgeId: 'edge:P-001',
    endpoint: 'TO',
    distanceMm: 25,
    basisHash: topology.canonicalTopologyHash,
  });

  assert.deepEqual(extend, reordered);
  assert.deepEqual(extend.commandIntents[0], {
    sequence: 0,
    commandType: 'MOVE_NODE',
    payload: { nodeId: 'node:b', position: { x: 125, y: 0, z: 0 } },
  });
  assert.deepEqual(shorten.commandIntents[0].payload.position, { x: 75, y: 0, z: 0 });
  assert.throws(() => planShortenEdge({
    topology, edgeId: 'edge:P-001', endpoint: 'TO', distanceMm: 100,
  }), /less than the edge length/i);
});

test('split distance from FROM and TO compiles to exact fractions', () => {
  const topology = singleEdgeTopology();
  const from = planSplitEdgeByDistance({
    topology, edgeId: 'edge:P-001', endpoint: 'FROM', distanceMm: 25,
  });
  const to = planSplitEdgeByDistance({
    topology, edgeId: 'edge:P-001', endpoint: 'TO', distanceMm: 25,
  });
  assert.equal(from.commandIntents[0].commandType, 'SPLIT_EDGE');
  assert.equal(from.commandIntents[0].payload.fraction, 0.25);
  assert.equal(to.commandIntents[0].payload.fraction, 0.75);
  assert.deepEqual(from.parameters.generatedRecordRoles, [
    'node:split-node', 'edge:split-left-edge', 'edge:split-right-edge',
  ]);
});

test('reconnect exact open endpoints uses BRIDGE_GAP and retains unresolved catalogue authority', () => {
  const topology = reconnectTopology();
  const plan = planReconnectOpenEndpoints({
    topology,
    fromNodeId: 'node:b',
    toNodeId: 'node:c',
    diameterMm: 100,
    entityType: 'PIPE',
  });
  assert.equal(plan.commandIntents[0].commandType, 'BRIDGE_GAP');
  assert.deepEqual(plan.commandIntents[0].payload, {
    diameterMm: 100,
    entityType: 'PIPE',
    fromNodeId: 'node:b',
    toNodeId: 'node:c',
  });
  assert.equal(plan.unresolvedEvidence[0].code, 'CATALOGUE_COMPATIBILITY_NOT_EVALUATED');
  assert.throws(() => planReconnectOpenEndpoints({
    topology,
    fromNodeId: 'node:a',
    toNodeId: 'node:b',
    diameterMm: 100,
  }), /duplicate existing edge/i);
});

test('bounded connected run requires exact external boundaries and rejects collapse', () => {
  const topology = boundedRunTopology();
  const plan = planMoveConnectedRun({
    topology,
    nodeIds: ['node:c', 'node:b'],
    boundaryNodeIds: ['node:d', 'node:a'],
    deltaMm: { x: 0, y: 50, z: 0 },
  });
  assert.deepEqual(plan.parameters.boundaryNodeIds, ['node:a', 'node:d']);
  assert.deepEqual(plan.commandIntents.map((row) => row.payload), [
    { nodeId: 'node:b', position: { x: 100, y: 50, z: 0 } },
    { nodeId: 'node:c', position: { x: 200, y: 50, z: 0 } },
  ]);
  assert.throws(() => planMoveConnectedRun({
    topology,
    nodeIds: ['node:b', 'node:c'],
    boundaryNodeIds: ['node:a'],
    deltaMm: { x: 0, y: 50, z: 0 },
  }), /must exactly equal/i);
  assert.throws(() => planMoveConnectedRun({
    topology,
    nodeIds: ['node:b', 'node:c'],
    boundaryNodeIds: ['node:a', 'node:d'],
    deltaMm: { x: -100, y: 0, z: 0 },
  }), /collapse edge edge:ab/i);
});

test('orthogonal offset uses two existing-command legs or returns explicit unrepresentable result', async () => {
  const topology = await fixture('offset-route.json');
  const plan = planCreateOrthogonalOffset({
    topology,
    fromNodeId: 'node:from',
    cornerNodeId: 'node:corner',
    toNodeId: 'node:to',
    diameterMm: 100,
  });
  assert.deepEqual(plan.commandIntents.map((row) => row.commandType), [
    'ADD_STRAIGHT_ELEMENT', 'ADD_STRAIGHT_ELEMENT',
  ]);
  assert.equal(plan.parameters.firstLegLengthMm, 100);
  assert.equal(plan.parameters.secondLegLengthMm, 100);

  const unavailable = planCreateOrthogonalOffset({
    topology,
    fromNodeId: 'node:from',
    toNodeId: 'node:to',
    diameterMm: 100,
  });
  assert.equal(unavailable.status, 'UNREPRESENTABLE_WITH_CURRENT_COMMANDS');
  assert.equal(unavailable.reasonCode, 'ARBITRARY_CORNER_NODE_CREATION_UNAVAILABLE');
});

test('declared Z slope produces exact ordered MOVE_NODE intents and non-Z fails explicitly', async () => {
  const topology = await fixture('sloped-route.json');
  const plan = planApplyDeclaredSlope({
    topology,
    orderedNodeIds: ['node:s1', 'node:s2', 'node:s3'],
    verticalAxis: 'Z',
    riseMm: 1,
    runMm: 100,
    direction: 'ASCENDING',
  });
  assert.deepEqual(plan.commandIntents.map((row) => row.payload), [
    { nodeId: 'node:s2', position: { x: 1000, y: 0, z: 10 } },
    { nodeId: 'node:s3', position: { x: 2000, y: 0, z: 20 } },
  ]);
  assert.deepEqual(plan.changedScope.nodeIds, ['node:s1', 'node:s2', 'node:s3']);

  const unsupported = planApplyDeclaredSlope({
    topology,
    orderedNodeIds: ['node:s1', 'node:s2', 'node:s3'],
    verticalAxis: 'Y',
    riseMm: 1,
    runMm: 100,
    direction: 'ASCENDING',
  });
  assert.equal(unsupported.status, 'UNREPRESENTABLE_WITH_CURRENT_COMMANDS');
  assert.equal(unsupported.reasonCode, 'VERTICAL_AXIS_NOT_SUPPORTED');
});

test('generic professional planner dispatches by exact operation type', () => {
  const topology = singleEdgeTopology();
  const direct = planExtendEdge({
    topology, edgeId: 'edge:P-001', endpoint: 'FROM', distanceMm: 10,
  });
  const dispatched = planProfessionalOperation({
    operationType: 'EXTEND_EDGE',
    topology,
    edgeId: 'edge:P-001',
    endpoint: 'FROM',
    distanceMm: 10,
  });
  assert.deepEqual(dispatched, direct);
  assert.throws(() => planProfessionalOperation({
    operationType: 'ROTATE_MAGIC', topology,
  }), /unsupported operation type/i);
});
