import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { createTopologyEditSpecificationCatalogue } from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { createPipeSegmentCatalogueBinding } from '../src/workspace/topology-edit/topology-edit-pipe-segment-command.js';
import {
  compileTypedStartRouteIntent,
  compileViewportStartRouteIntent,
} from '../src/workspace/topology-edit/authoring/topology-edit-start-route-intent.js';
import { createStartRoutePlan } from '../src/workspace/topology-edit/authoring/topology-edit-start-route-plan.js';
import { prepareStartRouteCandidate } from '../src/workspace/topology-edit/authoring/topology-edit-start-route-candidate.js';
import {
  cancelStartRoutePreview,
  createStartRoutePreview,
  createStartRouteValidation,
  executeStartRouteTransaction,
  redoStartRouteTransaction,
  undoStartRouteTransaction,
} from '../src/workspace/topology-edit/authoring/topology-edit-start-route-transaction.js';

const SOURCE_HASH = `sha256:${'a'.repeat(64)}`;
const DATUM_HASH = `sha256:${'b'.repeat(64)}`;

function catalogue(overrides = {}) {
  return createTopologyEditSpecificationCatalogue({
    catalogueId: 'START-ROUTE-PIPE', catalogueVersion: '1',
    authority: { sourceId: 'SPEC', sourceVersion: 'A', sourceHash: SOURCE_HASH },
    records: [{
      recordId: 'PIPE-DN50', componentType: 'PIPE', nominalSizeMm: 50,
      outsideDiameterMm: 60.3, schedule: 'S40', wallThicknessMm: 3.91,
      pressureClass: 'CL150', materialSpecification: 'ASTM-A106-B',
      endConnectionFrom: 'BUTT_WELD', endConnectionTo: 'BUTT_WELD',
      pipingClass: 'CS150',
      sourceReference: { documentId: 'SPEC', revision: 'A', path: '/pipe/dn50' },
      ...overrides,
    }],
  });
}
function emptyTopology(nodes = []) {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'native-dataset:start-route', datasetVersion: 0,
    sourceHash: SOURCE_HASH, topologyGraphHash: semanticHash({ nodes }),
    nodes, edges: [], junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}
function binding(spec = catalogue()) {
  return createPipeSegmentCatalogueBinding({ catalogue: spec, recordId: 'PIPE-DN50' });
}
function common(spec = catalogue()) {
  return {
    unitSystem: { length: 'MM', angle: 'DEG' }, axisLock: 'FREE',
    coordinateDatumHash: DATUM_HASH, catalogueBinding: binding(spec),
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
  };
}
function typed(spec = catalogue()) {
  return compileTypedStartRouteIntent({
    ...common(spec), inputMode: 'TYPED',
    startPointMm: { x: 0, y: 0, z: 0 },
    endPointMm: { x: 1000, y: 200, z: 50 },
  });
}
function viewport(spec = catalogue(), patch = {}) {
  return compileViewportStartRouteIntent({
    ...common(spec), inputMode: 'VIEWPORT',
    startAcquisition: {
      status: 'EXACT', ambiguityCount: 0, coordinateDatumHash: DATUM_HASH,
      modelPointMm: { x: 0, y: 0, z: 0 }, snapEvidenceHash: 'display-only-start',
    },
    endAcquisition: {
      status: 'EXACT', ambiguityCount: 0, coordinateDatumHash: DATUM_HASH,
      modelPointMm: { x: 1000, y: 200, z: 50 }, snapEvidenceHash: 'display-only-end',
    },
    ...patch,
  });
}
async function prepared(intent = typed(), spec = catalogue()) {
  const session = new TopologyEditCertifiedSession(emptyTopology());
  const plan = createStartRoutePlan({ intent, session });
  const candidate = await prepareStartRouteCandidate({ plan, session, catalogue: spec });
  return { session, spec, intent, plan, candidate };
}

test('typed and viewport input produce identical certified authority', async () => {
  const spec = catalogue();
  const leftSession = new TopologyEditCertifiedSession(emptyTopology());
  const rightSession = new TopologyEditCertifiedSession(emptyTopology());
  const typedIntent = typed(spec);
  const viewportIntent = viewport(spec);
  assert.equal(typedIntent.intentHash, viewportIntent.intentHash);
  const typedPlan = createStartRoutePlan({ intent: typedIntent, session: leftSession });
  const viewportPlan = createStartRoutePlan({ intent: viewportIntent, session: rightSession });
  assert.equal(typedPlan.planHash, viewportPlan.planHash);
  const left = await prepareStartRouteCandidate({
    plan: typedPlan, session: leftSession, catalogue: spec,
  });
  const right = await prepareStartRouteCandidate({
    plan: viewportPlan, session: rightSession, catalogue: spec,
  });
  assert.equal(left.candidateHash, right.candidateHash);
  assert.equal(left.resultingJournalHash, right.resultingJournalHash);
  assert.equal(left.resultingCanonicalHash, right.resultingCanonicalHash);
  assert.deepEqual(left.commandIds, right.commandIds);
});

test('candidate contains three certified commands without mutating session', async () => {
  const { session, candidate } = await prepared();
  assert.equal(session.currentTopology().nodes.length, 0);
  assert.equal(session.currentTopology().edges.length, 0);
  assert.equal(session.journal.activeCommandIds.length, 0);
  assert.equal(candidate.canonicalTopology.nodes.length, 2);
  assert.equal(candidate.canonicalTopology.edges.length, 1);
  assert.equal(candidate.commandIds.length, 3);
  assert.deepEqual(candidate.materializedCommands.map((row) => row.commandType), [
    'CREATE_NODE', 'CREATE_NODE', 'INSERT_PIPE_SEGMENT',
  ]);
  assert.ok(candidate.operationBindings['step-1.created-node'].startsWith('node:'));
  assert.ok(candidate.operationBindings['step-2.created-node'].startsWith('node:'));
  assert.ok(candidate.operationBindings['step-3.created-edge'].startsWith('edge:'));
});

test('preview/cancel preserve journal and canonical authority', async () => {
  const { session, plan, candidate } = await prepared();
  const journalHash = session.journal.journalHash;
  const canonicalHash = session.currentTopology().canonicalTopologyHash;
  const preview = createStartRoutePreview({ plan, candidate });
  const cancelled = cancelStartRoutePreview({ preview, session });
  assert.equal(session.journal.journalHash, journalHash);
  assert.equal(session.currentTopology().canonicalTopologyHash, canonicalHash);
  assert.equal(cancelled.resultingJournalHash, journalHash);
  assert.equal(cancelled.resultingCanonicalHash, canonicalHash);
});

test('Apply installs one atomic journal suffix and undo/redo preserve hashes', async () => {
  const { session, spec, plan, candidate } = await prepared();
  const preview = createStartRoutePreview({ plan, candidate });
  const validation = createStartRouteValidation({ candidate, diagnostics: [] });
  const transaction = await executeStartRouteTransaction({
    session, plan, candidate, preview, validation, catalogue: spec,
  });
  assert.equal(transaction.commandCount, 3);
  assert.deepEqual(session.journal.activeCommandIds.slice(-3), transaction.commandIds);
  assert.equal(session.currentTopology().nodes.length, 2);
  assert.equal(session.currentTopology().edges.length, 1);
  undoStartRouteTransaction(session, transaction);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.priorCanonicalHash);
  redoStartRouteTransaction(session, transaction);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.resultingCanonicalHash);
  assert.equal(session.journal.journalHash, transaction.resultingJournalHash);
});

test('stale session, changed catalogue, and blocking validation fail', async () => {
  const { session, spec, plan, candidate } = await prepared();
  const preview = createStartRoutePreview({ plan, candidate });
  const ready = createStartRouteValidation({ candidate, diagnostics: [] });
  session.execute('CREATE_NODE', {
    position: { x: 5, y: 5, z: 5 },
    creationRole: 'STALE_TEST',
    coordinateAuthority: 'TEST',
    sourceOperationId: 'STALE',
  });
  await assert.rejects(
    executeStartRouteTransaction({
      session, plan, candidate, preview, validation: ready, catalogue: spec,
    }),
    /preview is stale/u,
  );
  const fresh = await prepared();
  const changed = catalogue({ schedule: 'S80', wallThicknessMm: 5.54 });
  await assert.rejects(
    executeStartRouteTransaction({
      session: fresh.session, plan: fresh.plan, candidate: fresh.candidate,
      preview: createStartRoutePreview(fresh),
      validation: createStartRouteValidation({ candidate: fresh.candidate }),
      catalogue: changed,
    }),
    /catalogueHash/u,
  );
  const blocked = createStartRouteValidation({
    candidate: fresh.candidate,
    diagnostics: [{ code: 'CLASH', severity: 'HIGH', message: 'Blocked.', targetIds: [] }],
  });
  await assert.rejects(
    executeStartRouteTransaction({
      session: fresh.session, plan: fresh.plan, candidate: fresh.candidate,
      preview: createStartRoutePreview(fresh), validation: blocked, catalogue: fresh.spec,
    }),
    /validation is blocking/u,
  );
});

test('ambiguous snap, datum drift, unsupported units, and zero axis result fail', () => {
  assert.throws(() => viewport(catalogue(), {
    endAcquisition: {
      status: 'AMBIGUOUS', ambiguityCount: 2, coordinateDatumHash: DATUM_HASH,
      modelPointMm: { x: 1000, y: 0, z: 0 },
    },
  }), /ambiguous or unresolved/u);
  assert.throws(() => viewport(catalogue(), {
    endAcquisition: {
      status: 'EXACT', ambiguityCount: 0, coordinateDatumHash: SOURCE_HASH,
      modelPointMm: { x: 1000, y: 0, z: 0 },
    },
  }), /coordinate datum changed/u);
  assert.throws(() => compileTypedStartRouteIntent({
    ...common(), unitSystem: { length: 'M', angle: 'DEG' },
    startPointMm: { x: 0, y: 0, z: 0 }, endPointMm: { x: 1, y: 0, z: 0 },
  }), /unitSystem must be/u);
  assert.throws(() => compileTypedStartRouteIntent({
    ...common(), axisLock: 'Y',
    startPointMm: { x: 0, y: 0, z: 0 }, endPointMm: { x: 100, y: 0, z: 50 },
  }), /must be distinct/u);
});
