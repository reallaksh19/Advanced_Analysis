import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import {
  activateTopologyEditAuthoringTool,
  createTopologyEditAuthoringSession,
  setTopologyEditAuthoringTarget,
  updateTopologyEditAuthoringProperties,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-session.js';
import {
  createTopologyEditAuthoringOperationPlan,
  deriveTopologyEditAuthoringTarget,
  topologyEditAuthoringDefaultProperties,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-operation-planner.js';
import { TOPOLOGY_EDIT_OPERATION_REFERENCE_SCHEMA } from '../src/workspace/topology-edit/authoring/topology-edit-operation-graph.js';

function topology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'authoring-planner',
    datasetVersion: 1,
    sourceHash: 'source:authoring-planner',
    topologyGraphHash: 'graph:authoring-planner',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:b', position: { x: 1000, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [{
      id: 'edge:pipe',
      componentKey: 'P-1',
      fromNodeId: 'node:a',
      toNodeId: 'node:b',
      diameterMm: 100,
      entityType: 'PIPE',
      sourcePath: '$[0]',
    }],
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}

function sessionFor(tool, nodeId = 'node:b') {
  const canonical = topology();
  let session = createTopologyEditAuthoringSession();
  session = activateTopologyEditAuthoringTool(session, tool);
  session = setTopologyEditAuthoringTarget(session, deriveTopologyEditAuthoringTarget({
    topology: canonical,
    tool,
    nodeId,
  }));
  session = updateTopologyEditAuthoringProperties(session, topologyEditAuthoringDefaultProperties({
    topology: canonical,
    authoringSession: session,
  }), 'DERIVED');
  return { canonical, session };
}

test('Move plans one exact MOVE_NODE with an axis-constrained delta', () => {
  const { canonical, session: initial } = sessionFor('MOVE');
  const session = updateTopologyEditAuthoringProperties(initial, {
    deltaX: 20,
    deltaY: 40,
    deltaZ: 60,
    axisLock: 'Y',
  });
  const plan = createTopologyEditAuthoringOperationPlan({
    topology: canonical,
    authoringSession: session,
  });
  assert.equal(plan.commandIntents.length, 1);
  assert.equal(plan.commandIntents[0].commandType, 'MOVE_NODE');
  assert.deepEqual(plan.commandIntents[0].payload.position, { x: 1000, y: 40, z: 0 });
  assert.deepEqual(plan.parameters.deltaMm, { x: 0, y: 40, z: 0 });
});

test('Stretch moves the graph-open endpoint to the requested exact length', () => {
  const { canonical, session: initial } = sessionFor('STRETCH');
  const session = updateTopologyEditAuthoringProperties(initial, {
    newLengthMm: 1400,
    deltaLengthMm: 0,
    directionLock: 'EDGE_AXIS',
  });
  const plan = createTopologyEditAuthoringOperationPlan({
    topology: canonical,
    authoringSession: session,
  });
  assert.equal(plan.operationType, 'EXTEND_EDGE');
  assert.deepEqual(plan.commandIntents[0].payload.position, { x: 1400, y: 0, z: 0 });
  assert.equal(plan.parameters.deltaLengthMm, 400);
});

test('Route + elbow emits a final-state five-command graph with symbolic outputs', () => {
  const { canonical, session: initial } = sessionFor('ROUTE_ELBOW');
  const session = updateTopologyEditAuthoringProperties(initial, {
    offsetX: 500,
    offsetY: 600,
    offsetZ: 0,
    nominalSizeMm: 100,
    angleDeg: 90,
    radiusType: 'LR',
    radiusMm: 150,
    pipingClass: 'DEMO-150',
    componentMassKg: 12,
  });
  const plan = createTopologyEditAuthoringOperationPlan({
    topology: canonical,
    authoringSession: session,
  });
  assert.equal(plan.commandIntents.length, 5);
  assert.equal(plan.parameters.compositeCertification.mode, 'FINAL_STATE');
  assert.deepEqual(plan.parameters.cornerPosition, { x: 1500, y: 0, z: 0 });
  assert.deepEqual(plan.parameters.endPosition, { x: 1500, y: 600, z: 0 });
  assert.equal(plan.commandIntents[2].payload.toNodeId.schema, TOPOLOGY_EDIT_OPERATION_REFERENCE_SCHEMA);
  assert.equal(plan.commandIntents[4].payload.edgeIds[1].role, 'created-edge');
  assert.ok(Math.abs(plan.parameters.tangentDistanceMm - 150) < 1e-9);
});

test('Route + elbow rejects a radius that cannot fit both tangent arms', () => {
  const { canonical, session: initial } = sessionFor('ROUTE_ELBOW');
  const session = updateTopologyEditAuthoringProperties(initial, {
    offsetX: 100,
    offsetY: 100,
    offsetZ: 0,
    nominalSizeMm: 100,
    angleDeg: 90,
    radiusType: 'CUSTOM',
    radiusMm: 150,
    pipingClass: 'DEMO-150',
    componentMassKg: null,
  });
  assert.throws(() => createTopologyEditAuthoringOperationPlan({
    topology: canonical,
    authoringSession: session,
  }), /more tangent length/);
});
