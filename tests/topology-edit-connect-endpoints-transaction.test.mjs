import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { createPipeSegmentCatalogueBinding } from '../src/workspace/topology-edit/topology-edit-pipe-segment-command.js';
import { topologyEditEdgeBendDefinitions } from '../src/workspace/topology-edit/topology-edit-bend-edge-crosswalk.js';
import { createTopologyEditSpecificationCatalogue } from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';
import { compileTypedStartRouteIntent } from '../src/workspace/topology-edit/authoring/topology-edit-start-route-intent.js';
import { createStartRoutePlan } from '../src/workspace/topology-edit/authoring/topology-edit-start-route-plan.js';
import { prepareStartRouteCandidate } from '../src/workspace/topology-edit/authoring/topology-edit-start-route-candidate.js';
import { createStartRoutePreview, createStartRouteValidation,
  executeStartRouteTransaction } from '../src/workspace/topology-edit/authoring/topology-edit-start-route-transaction.js';
import { createConnectEndpointsIntent } from '../src/workspace/topology-edit/authoring/topology-edit-connect-endpoints-intent.js';
import { createConnectEndpointsPlan } from '../src/workspace/topology-edit/authoring/topology-edit-connect-endpoints-plan.js';
import { resolveConnectEndpointsElbow } from '../src/workspace/topology-edit/authoring/topology-edit-connect-endpoints-elbow-resolver.js';
import { createConnectEndpointsOperation } from '../src/workspace/topology-edit/authoring/topology-edit-connect-endpoints-operation.js';
import { prepareConnectEndpointsCandidate } from '../src/workspace/topology-edit/authoring/topology-edit-connect-endpoints-candidate.js';
import { cancelConnectEndpointsPreview, createConnectEndpointsPreview, createConnectEndpointsValidation,
  executeConnectEndpointsTransaction, redoConnectEndpointsTransaction,
  undoConnectEndpointsTransaction } from '../src/workspace/topology-edit/authoring/topology-edit-connect-endpoints-transaction.js';

const SOURCE_HASH = `sha256:${'3'.repeat(64)}`;
const DATUM_HASH = `sha256:${'4'.repeat(64)}`;
const PIPE_ID = 'PIPE-DN100';

function pipeRecord(id = PIPE_ID, size = 100, od = 114.3, wall = 6.02) {
  return { recordId: id, componentType: 'PIPE', nominalSizeMm: size, outsideDiameterMm: od,
    schedule: 'SCH40', wallThicknessMm: wall, pressureClass: '150',
    materialSpecification: 'ASTM A106 GR B', pipingClass: 'DEMO-150',
    endConnectionFrom: 'BW', endConnectionTo: 'BW',
    sourceReference: { documentId: 'CONNECT-SPEC', revision: '1', path: `/pipe/${id}` } };
}
function elbowRecord(id = 'ELBOW-DN100-LR90', angleDeg = 90, path = '/elbow/dn100') {
  return { recordId: id, componentType: 'ELBOW', nominalSizeMm: 100,
    outsideDiameterMm: 114.3, pressureClass: '150', materialSpecification: 'ASTM A234 WPB',
    pipingClass: 'DEMO-150', elbowRadiusMm: 152.4, elbowAngleDeg: angleDeg,
    componentMassKg: 8.4, endConnectionFrom: 'BW', endConnectionTo: 'BW',
    sourceReference: { documentId: 'CONNECT-SPEC', revision: '1', path } };
}
function catalogue(extra = []) {
  return createTopologyEditSpecificationCatalogue({
    catalogueId: 'CONNECT-EXEC-SPEC', catalogueVersion: '1',
    authority: { sourceId: 'CONNECT-SPEC', sourceVersion: '1', sourceHash: SOURCE_HASH },
    records: [pipeRecord(), pipeRecord('PIPE-DN50', 50, 60.3, 3.91), elbowRecord(), ...extra],
  });
}
function emptyTopology() {
  return finalizeCanonicalTopology({ schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'connect-exec-dataset', datasetVersion: 0, sourceHash: SOURCE_HASH,
    topologyGraphHash: semanticHash({ nodes: [] }), nodes: [], edges: [], junctions: [],
    supports: [], boundaries: [], rigids: [], bends: [] });
}
function binding(spec, recordId = PIPE_ID) {
  return createPipeSegmentCatalogueBinding({ catalogue: spec, recordId });
}
function common(spec, recordId = PIPE_ID) {
  return { unitSystem: { length: 'MM', angle: 'DEG' }, coordinateDatumHash: DATUM_HASH,
    catalogueBinding: binding(spec, recordId),
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 } };
}
function revision(node) { return semanticHash({ kind: 'NODE', record: node }); }
async function startPipe(session, spec, startPointMm, endPointMm) {
  const intent = compileTypedStartRouteIntent({ ...common(spec), axisLock: 'FREE', startPointMm, endPointMm });
  const plan = createStartRoutePlan({ intent, session });
  const candidate = await prepareStartRouteCandidate({ plan, session, catalogue: spec });
  await executeStartRouteTransaction({ session, plan, candidate, catalogue: spec,
    preview: createStartRoutePreview({ plan, candidate }),
    validation: createStartRouteValidation({ candidate }) });
  return { from: candidate.operationBindings['step-1.created-node'],
    to: candidate.operationBindings['step-2.created-node'] };
}
async function seeded({ startLength = 1000, aligned = false, spec = catalogue() } = {}) {
  const session = new TopologyEditCertifiedSession(emptyTopology());
  const left = await startPipe(session, spec, { x: 0, y: 0, z: 0 }, { x: startLength, y: 0, z: 0 });
  const right = aligned
    ? await startPipe(session, spec, { x: 3000, y: 0, z: 0 }, { x: 2000, y: 0, z: 0 })
    : await startPipe(session, spec, { x: 3000, y: 3000, z: 0 }, { x: 3000, y: 2000, z: 0 });
  const topology = session.currentTopology();
  const startNode = topology.nodes.find((row) => row.id === left.to);
  const endNode = topology.nodes.find((row) => row.id === right.to);
  return { spec, session, startNode, endNode };
}
function request(seed, recordId = PIPE_ID) {
  return createConnectEndpointsIntent({
    startNodeId: seed.startNode.id, startNodeRevision: revision(seed.startNode),
    endNodeId: seed.endNode.id, endNodeRevision: revision(seed.endNode),
    catalogueBinding: binding(seed.spec, recordId),
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
    routePolicy: { allowDirect: true, allowOrthogonal: true, maxAlternatives: 5 },
  });
}
function alternative(plan, signature) {
  const row = plan.alternatives.find((item) => item.signature === signature);
  assert.ok(row, `missing alternative ${signature}`); return row;
}
async function orthogonalFixture(signature = 'x>y') {
  const seed = await seeded();
  const plan = createConnectEndpointsPlan({ intent: request(seed), session: seed.session });
  const selected = alternative(plan, signature);
  const operation = createConnectEndpointsOperation({ plan, alternativeId: selected.alternativeId, catalogue: seed.spec });
  const candidate = await prepareConnectEndpointsCandidate({ operation, session: seed.session, catalogue: seed.spec });
  return { ...seed, plan, selected, operation, candidate };
}

test('best orthogonal alternative compiles to one corner, two pipes and one governed elbow', async () => {
  const { operation, candidate } = await orthogonalFixture('x>y');
  assert.equal(operation.segmentCount, 2); assert.equal(operation.newNodeCount, 1);
  assert.equal(operation.bendCount, 1); assert.equal(operation.expectedCommandCount, 4);
  assert.equal(operation.elbowBindings[0].recordId, 'ELBOW-DN100-LR90');
  assert.equal(operation.trim.startHostTrimMm, 0); assert.equal(operation.trim.endHostTrimMm, 0);
  assert.ok(Math.abs(operation.trim.effectiveSegments[0].endTrimMm - 152.4) < 1e-9);
  assert.ok(Math.abs(operation.trim.effectiveSegments[1].startTrimMm - 152.4) < 1e-9);
  assert.deepEqual(candidate.materializedCommands.map((row) => row.commandType),
    ['CREATE_NODE', 'INSERT_PIPE_SEGMENT', 'INSERT_PIPE_SEGMENT', 'ADD_BEND_DEFINITION']);
  assert.equal(candidate.canonicalTopology.bends.length, 1);
});

test('direct 45-degree endpoint turns consume radius times tan(deflection/2)', async () => {
  const radius = 152.4;
  const spec = catalogue([elbowRecord('ELBOW-DN100-LR45', 45, '/elbow/dn100-45')]);
  const seed = await seeded({ spec });
  const plan = createConnectEndpointsPlan({ intent: request(seed), session: seed.session });
  const direct = alternative(plan, 'DIRECT');
  const operation = createConnectEndpointsOperation({ plan, alternativeId: direct.alternativeId, catalogue: seed.spec });
  const expected = radius * Math.tan(Math.PI / 8);
  assert.equal(operation.bendCount, 2);
  assert.ok(Math.abs(operation.trim.startHostTrimMm - expected) < 1e-9);
  assert.ok(Math.abs(operation.trim.endHostTrimMm - expected) < 1e-9);
  assert.ok(Math.abs(operation.trim.effectiveSegments[0].startTrimMm - expected) < 1e-9);
  assert.ok(Math.abs(operation.trim.effectiveSegments[0].endTrimMm - expected) < 1e-9);
});

test('asymmetric pipe ends reject an elbow that duplicates only one connection type', () => {
  const spec = createTopologyEditSpecificationCatalogue({
    catalogueId: 'CONNECT-EXEC-SPEC', catalogueVersion: '1',
    authority: { sourceId: 'CONNECT-SPEC', sourceVersion: '1', sourceHash: SOURCE_HASH },
    records: [{ ...pipeRecord(), endConnectionFrom: 'BW', endConnectionTo: 'SW' }, elbowRecord()],
  });
  assert.throws(() => resolveConnectEndpointsElbow({
    turn: { turnHash: 'asymmetric-turn', location: 'INTERNAL', vertexIndex: 1, angleDeg: 90 },
    pipeBinding: binding(spec), catalogue: spec,
  }), /NO_COMPATIBLE_ELBOW/u);
});

test('Connect Apply, Cancel, Undo and Redo preserve one exact certified suffix', async () => {
  const { spec, session, operation, candidate } = await orthogonalFixture('x>y');
  const before = session.snapshot(); const preview = createConnectEndpointsPreview({ operation, candidate });
  const cancelled = cancelConnectEndpointsPreview({ session, preview });
  assert.equal(cancelled.resultingCanonicalHash, before.activeCanonicalTopologyHash);
  assert.equal(session.snapshot().sessionHash, before.sessionHash);
  const transaction = await executeConnectEndpointsTransaction({ session, operation, candidate, preview,
    validation: createConnectEndpointsValidation({ candidate }), catalogue: spec });
  const applied = session.snapshot();
  assert.equal(transaction.commandCount, 4); assert.equal(session.currentTopology().edges.length, 4);
  assert.equal(session.currentTopology().nodes.length, 5); assert.equal(session.currentTopology().bends.length, 1);
  undoConnectEndpointsTransaction(session, transaction);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.priorCanonicalHash);
  redoConnectEndpointsTransaction(session, transaction);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.resultingCanonicalHash);
  assert.equal(session.journal.activeLedgerHash, applied.activeLedgerHash);
});

test('three-elbow alternative trims both new route pipes at both ends', async () => {
  const { operation, candidate } = await orthogonalFixture('y>x');
  assert.equal(operation.bendCount, 3); assert.equal(operation.expectedCommandCount, 6);
  assert.ok(operation.trim.startHostTrimMm > 0); assert.ok(operation.trim.endHostTrimMm > 0);
  assert.ok(operation.trim.effectiveSegments.every((row) => row.startTrimMm > 0 && row.endTrimMm > 0));
  const routeEdges = ['segment-1-pipe.created-edge', 'segment-2-pipe.created-edge']
    .map((key) => candidate.operationBindings[key]);
  for (const edgeId of routeEdges) {
    const edge = candidate.canonicalTopology.edges.find((row) => row.id === edgeId);
    assert.equal(topologyEditEdgeBendDefinitions(edge).length, 2);
  }
});

test('direct diagonal route fails closed when no exact catalogue elbow angle exists', async () => {
  const seed = await seeded();
  const plan = createConnectEndpointsPlan({ intent: request(seed), session: seed.session });
  const direct = alternative(plan, 'DIRECT');
  assert.equal(direct.turns.length, 2);
  assert.throws(() => createConnectEndpointsOperation({ plan, alternativeId: direct.alternativeId,
    catalogue: seed.spec }), /NO_COMPATIBLE_ELBOW/u);
});

test('transition-required endpoint profile cannot compile an executable connection', async () => {
  const seed = await seeded();
  const plan = createConnectEndpointsPlan({ intent: request(seed, 'PIPE-DN50'), session: seed.session });
  assert.equal(plan.compatibilityStatus, 'TRANSITION_REQUIRED');
  assert.throws(() => createConnectEndpointsOperation({ plan,
    alternativeId: plan.alternatives[0].alternativeId, catalogue: seed.spec }), /governed transition/u);
});

test('endpoint elbow fails closed when retained host length cannot satisfy tangent and minimum spool', async () => {
  const seed = await seeded({ startLength: 100 });
  const plan = createConnectEndpointsPlan({ intent: request(seed), session: seed.session });
  const selected = alternative(plan, 'y>x');
  assert.throws(() => createConnectEndpointsOperation({ plan, alternativeId: selected.alternativeId,
    catalogue: seed.spec }), /start host leaves/u);
});

test('aligned opposing endpoints compile to one direct pipe with no generated node or elbow', async () => {
  const seed = await seeded({ aligned: true });
  const plan = createConnectEndpointsPlan({ intent: request(seed), session: seed.session });
  const direct = alternative(plan, 'DIRECT'); assert.equal(direct.turns.length, 0);
  const operation = createConnectEndpointsOperation({ plan, alternativeId: direct.alternativeId, catalogue: seed.spec });
  assert.equal(operation.segmentCount, 1); assert.equal(operation.newNodeCount, 0);
  assert.equal(operation.bendCount, 0); assert.equal(operation.expectedCommandCount, 1);
  const candidate = await prepareConnectEndpointsCandidate({ operation, session: seed.session, catalogue: seed.spec });
  assert.deepEqual(candidate.materializedCommands.map((row) => row.commandType), ['INSERT_PIPE_SEGMENT']);
});
