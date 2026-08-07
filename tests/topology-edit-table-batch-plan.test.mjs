import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import {
  prepareTopologyEditAuthoringCandidate,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-composite-operation.js';
import { buildTopologyEditTableProjection } from '../src/workspace/topology-edit/table/topology-edit-table-projection.js';
import { createTopologyEditTableIntent } from '../src/workspace/topology-edit/table/topology-edit-table-intent.js';
import { createTopologyEditTableBatch } from '../src/workspace/topology-edit/table/topology-edit-table-batch.js';
import { planTopologyEditTableBatch } from '../src/workspace/topology-edit/table/topology-edit-table-batch-planner.js';

function baseTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'dataset-table', datasetVersion: 4, sourceHash: 'sha256:table-source',
    topologyGraphHash: 'sha256:table-graph',
    nodes: [
      node('node:a1', 0, 0), node('node:a2', 1000, 0), node('node:a3', 2000, 0),
      node('node:b1', 0, 5000), node('node:b2', 1000, 5000), node('node:b3', 2000, 5000),
    ],
    edges: [
      pipe('edge:a1', 'node:a1', 'node:a2'), pipe('edge:a2', 'node:a2', 'node:a3'),
      pipe('edge:b1', 'node:b1', 'node:b2'), pipe('edge:b2', 'node:b2', 'node:b3'),
    ],
    junctions: [], supports: [], boundaries: [], rigids: [],
  });
}
function node(id, x, y) { return { id, position: { x, y, z: 0 }, portKeys: [] }; }
function pipe(id, fromNodeId, toNodeId) {
  return {
    id, componentKey: id.replace('edge:', 'pipe:'), fromNodeId, toNodeId,
    entityType: 'PIPE', diameterMm: 100, outsideDiameterMm: 114,
    diameterAuthority: 'OUTSIDE_DIAMETER',
  };
}
function projection(topology) {
  return buildTopologyEditTableProjection({ canonicalTopology: topology });
}
function stage(session, topology, canonicalId, lengthMm, anchor = 'FROM', propagation = 'DOWNSTREAM') {
  return createTopologyEditTableIntent({
    projection: projection(topology),
    sessionSnapshot: session.snapshot(),
    canonicalId,
    intentKind: 'PIPE_LENGTH',
    requestedValue: { lengthMm },
    geometryPolicy: { anchor, propagation },
  });
}
function edgeLength(topology, edgeId) {
  const edge = topology.edges.find((row) => row.id === edgeId);
  const from = topology.nodes.find((row) => row.id === edge.fromNodeId).position;
  const to = topology.nodes.find((row) => row.id === edge.toNodeId).position;
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}

test('pipe length compiles to explicit governed downstream MOVE_NODE commands', () => {
  const topology = baseTopology();
  const session = new TopologyEditCertifiedSession(topology);
  const tableProjection = projection(topology);
  const intent = stage(session, topology, 'edge:a1', 1500);
  const batch = createTopologyEditTableBatch({ intents: [intent] });
  const plan = planTopologyEditTableBatch({ batch, projection: tableProjection, canonicalTopology: topology });

  assert.equal(plan.childPlans.length, 1);
  assert.deepEqual(plan.operationPlan.commandIntents.map((row) => row.payload.nodeId), [
    'node:a2', 'node:a3',
  ]);
  assert.deepEqual(plan.operationPlan.commandIntents.map((row) => row.payload.position.x), [
    1500, 2500,
  ]);
  assert.equal(plan.operationPlan.parameters.compositeCertification.mode, 'FINAL_STATE');
  assert.equal(plan.operationPlan.parameters.tableBatchHash, batch.batchHash);
  assert.ok(plan.dependencyRevisions['edge:a1']);
  assert.ok(plan.dependencyRevisions['node:a3']);
});

test('two disjoint pasted pipe length edits produce one deterministic atomic candidate', async () => {
  const topology = baseTopology();
  const session = new TopologyEditCertifiedSession(topology);
  const tableProjection = projection(topology);
  const first = stage(session, topology, 'edge:a1', 1500);
  const second = stage(session, topology, 'edge:b1', 1250);
  const batch = createTopologyEditTableBatch({ intents: [second, first] });
  const plan = planTopologyEditTableBatch({ batch, projection: tableProjection, canonicalTopology: topology });
  const priorHash = session.currentTopology().canonicalTopologyHash;
  const priorJournal = session.journal.journalHash;

  const candidate = await prepareTopologyEditAuthoringCandidate({
    session,
    operationPlan: plan.operationPlan,
  });

  assert.equal(session.currentTopology().canonicalTopologyHash, priorHash);
  assert.equal(session.journal.journalHash, priorJournal);
  assert.notEqual(candidate.resultingCanonicalHash, priorHash);
  assert.equal(candidate.commandCount, 4);
  assert.deepEqual(candidate.materializedCommandIntents.map((row) => row.commandType), [
    'MOVE_NODE', 'MOVE_NODE', 'MOVE_NODE', 'MOVE_NODE',
  ]);
  assert.equal(edgeLength(candidate.canonicalTopology, 'edge:a1'), 1500);
  assert.equal(edgeLength(candidate.canonicalTopology, 'edge:b1'), 1250);
  assert.equal(edgeLength(candidate.canonicalTopology, 'edge:a2'), 1000);
  assert.equal(edgeLength(candidate.canonicalTopology, 'edge:b2'), 1000);
});

test('overlapping propagation closures are rejected before candidate construction', () => {
  const topology = baseTopology();
  const session = new TopologyEditCertifiedSession(topology);
  const tableProjection = projection(topology);
  const first = stage(session, topology, 'edge:a1', 1500);
  const second = stage(session, topology, 'edge:a2', 1250);
  const batch = createTopologyEditTableBatch({ intents: [first, second] });
  assert.throws(() => planTopologyEditTableBatch({
    batch, projection: tableProjection, canonicalTopology: topology,
  }), /overlapping table intents/);
});

test('unsupported anchor/propagation policy and cyclic propagation fail closed', () => {
  const topology = baseTopology();
  const session = new TopologyEditCertifiedSession(topology);
  const tableProjection = projection(topology);
  const unsupported = createTopologyEditTableIntent({
    projection: tableProjection, sessionSnapshot: session.snapshot(), canonicalId: 'edge:a1',
    intentKind: 'PIPE_LENGTH', requestedValue: 1500,
    geometryPolicy: { anchor: 'BOTH', propagation: 'FIT_BETWEEN_FIXED' },
  });
  assert.throws(() => planTopologyEditTableBatch({
    batch: createTopologyEditTableBatch({ intents: [unsupported] }),
    projection: tableProjection, canonicalTopology: topology,
  }), /current PIPE_LENGTH support requires/);

  const raw = structuredClone(topology); delete raw.canonicalTopologyHash;
  raw.edges.push(pipe('edge:a3', 'node:a1', 'node:a3'));
  const cyclic = finalizeCanonicalTopology(raw);
  const cyclicSession = new TopologyEditCertifiedSession(cyclic);
  const cyclicProjection = projection(cyclic);
  const intent = stage(cyclicSession, cyclic, 'edge:a1', 1500);
  assert.throws(() => planTopologyEditTableBatch({
    batch: createTopologyEditTableBatch({ intents: [intent] }),
    projection: cyclicProjection, canonicalTopology: cyclic,
  }), /lies on a cycle/);
});

test('propagation cannot silently shear a multi-port junction', () => {
  const raw = structuredClone(baseTopology()); delete raw.canonicalTopologyHash;
  raw.junctions = [{
    id: 'junction:tee', componentKey: 'tee:1', entityType: 'TEE',
    nodeIds: ['node:a2', 'node:b1', 'node:b2'],
  }];
  const topology = finalizeCanonicalTopology(raw);
  const session = new TopologyEditCertifiedSession(topology);
  const tableProjection = projection(topology);
  const intent = stage(session, topology, 'edge:a1', 1500);
  assert.throws(() => planTopologyEditTableBatch({
    batch: createTopologyEditTableBatch({ intents: [intent] }),
    projection: tableProjection, canonicalTopology: topology,
  }), /explicit component policy is required/);
});
