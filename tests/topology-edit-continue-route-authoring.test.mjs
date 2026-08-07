import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { createTopologyEditSpecificationCatalogue } from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { createPipeSegmentCatalogueBinding } from '../src/workspace/topology-edit/topology-edit-pipe-segment-command.js';
import { compileTypedStartRouteIntent } from '../src/workspace/topology-edit/authoring/topology-edit-start-route-intent.js';
import { createStartRoutePlan } from '../src/workspace/topology-edit/authoring/topology-edit-start-route-plan.js';
import { prepareStartRouteCandidate } from '../src/workspace/topology-edit/authoring/topology-edit-start-route-candidate.js';
import {
  createStartRoutePreview,
  createStartRouteValidation,
  executeStartRouteTransaction,
} from '../src/workspace/topology-edit/authoring/topology-edit-start-route-transaction.js';
import {
  compileTypedContinueRouteIntent,
  compileViewportContinueRouteIntent,
} from '../src/workspace/topology-edit/authoring/topology-edit-continue-route-intent.js';
import { createContinueRoutePlan } from '../src/workspace/topology-edit/authoring/topology-edit-continue-route-plan.js';
import { prepareContinueRouteCandidate } from '../src/workspace/topology-edit/authoring/topology-edit-continue-route-candidate.js';
import {
  cancelContinueRoutePreview,
  createContinueRoutePreview,
  createContinueRouteValidation,
  executeContinueRouteTransaction,
  redoContinueRouteTransaction,
  undoContinueRouteTransaction,
} from '../src/workspace/topology-edit/authoring/topology-edit-continue-route-transaction.js';

const SOURCE_HASH = `sha256:${'a'.repeat(64)}`;
const DATUM_HASH = `sha256:${'b'.repeat(64)}`;

function catalogue() {
  return createTopologyEditSpecificationCatalogue({
    catalogueId: 'CONTINUE-ROUTE-PIPE', catalogueVersion: '1',
    authority: { sourceId: 'SPEC', sourceVersion: 'A', sourceHash: SOURCE_HASH },
    records: [{
      recordId: 'PIPE-DN50', componentType: 'PIPE', nominalSizeMm: 50,
      outsideDiameterMm: 60.3, schedule: 'S40', wallThicknessMm: 3.91,
      pressureClass: 'CL150', materialSpecification: 'ASTM-A106-B', pipingClass: 'CS150',
      endConnectionFrom: 'BUTT_WELD', endConnectionTo: 'BUTT_WELD',
      sourceReference: { documentId: 'SPEC', revision: 'A', path: '/pipe/dn50' },
    }],
  });
}
function emptyTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'native-dataset:continue-route', datasetVersion: 0,
    sourceHash: SOURCE_HASH, topologyGraphHash: semanticHash({ nodes: [] }),
    nodes: [], edges: [], junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}
function binding(spec) {
  return createPipeSegmentCatalogueBinding({ catalogue: spec, recordId: 'PIPE-DN50' });
}
function common(spec) {
  return {
    unitSystem: { length: 'MM', angle: 'DEG' }, coordinateDatumHash: DATUM_HASH,
    catalogueBinding: binding(spec),
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
  };
}
function revision(node) { return semanticHash({ kind: 'NODE', record: node }); }

async function seeded() {
  const spec = catalogue();
  const session = new TopologyEditCertifiedSession(emptyTopology());
  const intent = compileTypedStartRouteIntent({
    ...common(spec), axisLock: 'X',
    startPointMm: { x: 0, y: 0, z: 0 }, endPointMm: { x: 1000, y: 0, z: 0 },
  });
  const plan = createStartRoutePlan({ intent, session });
  const candidate = await prepareStartRouteCandidate({ plan, session, catalogue: spec });
  await executeStartRouteTransaction({
    session, plan, candidate, catalogue: spec,
    preview: createStartRoutePreview({ plan, candidate }),
    validation: createStartRouteValidation({ candidate }),
  });
  const startNodeId = candidate.operationBindings['step-2.created-node'];
  const node = session.currentTopology().nodes.find((row) => row.id === startNodeId);
  return { spec, session, startNodeId, startNodeRevision: revision(node) };
}
function typed(seed, points = [
  { x: 2000, y: 0, z: 0 },
  { x: 3000, y: 0, z: 0 },
  { x: 4000, y: 0, z: 0 },
]) {
  return compileTypedContinueRouteIntent({
    ...common(seed.spec), startNodeId: seed.startNodeId,
    startNodeRevision: seed.startNodeRevision, pointsMm: points, axisLock: 'FREE',
  });
}
function viewport(seed) {
  return compileViewportContinueRouteIntent({
    ...common(seed.spec), startNodeId: seed.startNodeId,
    startNodeRevision: seed.startNodeRevision,
    pointAcquisitions: [2000, 3000, 4000].map((x) => ({
      status: 'EXACT', ambiguityCount: 0, coordinateDatumHash: DATUM_HASH,
      modelPointMm: { x, y: 0, z: 0 },
    })),
  });
}
async function prepared() {
  const seed = await seeded();
  const intent = typed(seed);
  const plan = createContinueRoutePlan({ intent, session: seed.session });
  const candidate = await prepareContinueRouteCandidate({ plan, session: seed.session, catalogue: seed.spec });
  return { ...seed, intent, plan, candidate };
}

test('typed and viewport Continue Route intent compile to identical authority', async () => {
  const seed = await seeded();
  const left = typed(seed);
  const right = viewport(seed);
  assert.equal(left.intentHash, right.intentHash);
  const leftPlan = createContinueRoutePlan({ intent: left, session: seed.session });
  const rightPlan = createContinueRoutePlan({ intent: right, session: seed.session });
  assert.equal(leftPlan.planHash, rightPlan.planHash);
  assert.equal(leftPlan.segmentCount, 3);
  assert.equal(leftPlan.expectedCommandCount, 6);
  assert.equal(leftPlan.turnCount, 0);
});

test('candidate extends one open endpoint with one node and pipe per leg without mutating live session', async () => {
  const { session, plan, candidate } = await prepared();
  const before = session.snapshot();
  assert.equal(candidate.segmentCount, 3);
  assert.equal(candidate.nodeCount, 3);
  assert.equal(candidate.commandCount, 6);
  assert.equal(candidate.canonicalTopology.nodes.length, 5);
  assert.equal(candidate.canonicalTopology.edges.length, 4);
  assert.deepEqual(candidate.materializedCommands.map((row) => row.commandType), [
    'CREATE_NODE', 'INSERT_PIPE_SEGMENT',
    'CREATE_NODE', 'INSERT_PIPE_SEGMENT',
    'CREATE_NODE', 'INSERT_PIPE_SEGMENT',
  ]);
  assert.equal(session.snapshot().sessionHash, before.sessionHash);
  assert.equal(plan.geometry.totalLengthMm, 3000);
});

test('Apply is atomic and undo/redo restore exact canonical and active-ledger authority', async () => {
  const { spec, session, plan, candidate } = await prepared();
  const preview = createContinueRoutePreview({ plan, candidate });
  const validation = createContinueRouteValidation({ candidate });
  const transaction = await executeContinueRouteTransaction({
    session, plan, candidate, preview, validation, catalogue: spec,
  });
  const applied = session.snapshot();
  assert.equal(transaction.commandCount, 6);
  assert.deepEqual(session.journal.activeCommandIds.slice(-6), transaction.commandIds);
  assert.equal(session.currentTopology().nodes.length, 5);
  assert.equal(session.currentTopology().edges.length, 4);
  undoContinueRouteTransaction(session, transaction);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.priorCanonicalHash);
  redoContinueRouteTransaction(session, transaction);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.resultingCanonicalHash);
  assert.equal(session.journal.activeLedgerHash, applied.activeLedgerHash);
  assert.equal(session.journal.sessionVersion, applied.sessionVersion + 12);
});

test('Cancel and blocking validation preserve the seeded route', async () => {
  const { spec, session, plan, candidate } = await prepared();
  const preview = createContinueRoutePreview({ plan, candidate });
  const before = session.snapshot();
  const cancelled = cancelContinueRoutePreview({ preview, session });
  assert.equal(cancelled.resultingCanonicalHash, before.activeCanonicalTopologyHash);
  assert.equal(session.snapshot().sessionHash, before.sessionHash);
  const blocked = createContinueRouteValidation({
    candidate,
    diagnostics: [{ code: 'CLEARANCE', severity: 'HIGH', message: 'Blocked.', targetIds: [] }],
  });
  await assert.rejects(executeContinueRouteTransaction({
    session, plan, candidate, preview, validation: blocked, catalogue: spec,
  }), /validation is blocking/u);
  assert.equal(session.snapshot().sessionHash, before.sessionHash);
});

test('per-leg axis lock resolves sequentially from the canonical start point', async () => {
  const seed = await seeded();
  const intent = compileTypedContinueRouteIntent({
    ...common(seed.spec), startNodeId: seed.startNodeId, startNodeRevision: seed.startNodeRevision,
    vertices: [
      { requestedPointMm: { x: 2000, y: 500, z: 80 }, axisLock: 'X' },
      { requestedPointMm: { x: 3000, y: -500, z: 90 }, axisLock: 'X' },
    ],
  });
  const plan = createContinueRoutePlan({ intent, session: seed.session });
  assert.deepEqual(plan.geometry.segments.map((row) => row.endPointMm), [
    { x: 2000, y: 0, z: 0 }, { x: 3000, y: 0, z: 0 },
  ]);
  assert.equal(plan.requiresAutoFitting, false);
});

test('direction changes are planned but fail closed until governed fitting insertion exists', async () => {
  const seed = await seeded();
  const intent = typed(seed, [
    { x: 2000, y: 0, z: 0 }, { x: 2000, y: 500, z: 0 },
  ]);
  const plan = createContinueRoutePlan({ intent, session: seed.session });
  assert.equal(plan.turnCount, 1);
  assert.equal(plan.requiresAutoFitting, true);
  await assert.rejects(prepareContinueRouteCandidate({
    plan, session: seed.session, catalogue: seed.spec,
  }), /automatic fitting insertion is required/u);
});

test('stale endpoint revision and non-open start node fail closed', async () => {
  const seed = await seeded();
  const stale = compileTypedContinueRouteIntent({
    ...common(seed.spec), startNodeId: seed.startNodeId,
    startNodeRevision: `sha256:${'c'.repeat(64)}`, pointsMm: [{ x: 2000, y: 0, z: 0 }],
  });
  assert.throws(() => createContinueRoutePlan({ intent: stale, session: seed.session }), /revision is stale/u);

  const intent = typed(seed, [{ x: 2000, y: 0, z: 0 }]);
  const plan = createContinueRoutePlan({ intent, session: seed.session });
  const candidate = await prepareContinueRouteCandidate({ plan, session: seed.session, catalogue: seed.spec });
  await executeContinueRouteTransaction({
    session: seed.session, plan, candidate, catalogue: seed.spec,
    preview: createContinueRoutePreview({ plan, candidate }),
    validation: createContinueRouteValidation({ candidate }),
  });
  const changed = seed.session.currentTopology().nodes.find((row) => row.id === seed.startNodeId);
  const reused = compileTypedContinueRouteIntent({
    ...common(seed.spec), startNodeId: seed.startNodeId,
    startNodeRevision: revision(changed), pointsMm: [{ x: 2500, y: 0, z: 0 }],
  });
  assert.throws(() => createContinueRoutePlan({ intent: reused, session: seed.session }), /degree-one endpoint/u);
});
