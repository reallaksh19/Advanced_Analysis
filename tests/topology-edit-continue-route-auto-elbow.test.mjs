import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { createPipeSegmentCatalogueBinding } from '../src/workspace/topology-edit/topology-edit-pipe-segment-command.js';
import { createTopologyEditSpecificationCatalogue } from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';
import { compileTypedStartRouteIntent } from '../src/workspace/topology-edit/authoring/topology-edit-start-route-intent.js';
import { createStartRoutePlan } from '../src/workspace/topology-edit/authoring/topology-edit-start-route-plan.js';
import { prepareStartRouteCandidate } from '../src/workspace/topology-edit/authoring/topology-edit-start-route-candidate.js';
import {
  createStartRoutePreview,
  createStartRouteValidation,
  executeStartRouteTransaction,
} from '../src/workspace/topology-edit/authoring/topology-edit-start-route-transaction.js';
import { compileTypedContinueRouteIntent } from '../src/workspace/topology-edit/authoring/topology-edit-continue-route-intent.js';
import { createContinueRoutePlan } from '../src/workspace/topology-edit/authoring/topology-edit-continue-route-plan.js';
import { resolveContinueRouteElbows } from '../src/workspace/topology-edit/authoring/topology-edit-continue-route-elbow-resolver.js';
import { createContinueRouteFittedPlan } from '../src/workspace/topology-edit/authoring/topology-edit-continue-route-fitted-plan.js';
import { prepareContinueRouteCandidate } from '../src/workspace/topology-edit/authoring/topology-edit-continue-route-candidate.js';
import {
  createContinueRoutePreview,
  createContinueRouteValidation,
  executeContinueRouteTransaction,
  redoContinueRouteTransaction,
  undoContinueRouteTransaction,
} from '../src/workspace/topology-edit/authoring/topology-edit-continue-route-transaction.js';

const SOURCE_HASH = `sha256:${'d'.repeat(64)}`;
const DATUM_HASH = `sha256:${'e'.repeat(64)}`;
const NUMERIC_TOLERANCE = 1e-9;

function close(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) <= NUMERIC_TOLERANCE,
    `expected ${actual} to be within ${NUMERIC_TOLERANCE} of ${expected}`,
  );
}
function pipeRecord() {
  return {
    recordId: 'PIPE-DN100', componentType: 'PIPE', nominalSizeMm: 100,
    outsideDiameterMm: 114.3, schedule: 'SCH40', wallThicknessMm: 6.02,
    pressureClass: '150', materialSpecification: 'ASTM A106 GR B', pipingClass: 'DEMO-150',
    endConnectionFrom: 'BW', endConnectionTo: 'BW',
    sourceReference: { documentId: 'SPEC', revision: '1', path: '/pipe/dn100' },
  };
}
function elbowRecord(
  id = 'ELBOW-DN100-LR90-A',
  radius = 152.4,
  path = '/elbow/a',
  angleDeg = 90,
) {
  return {
    recordId: id, componentType: 'ELBOW', nominalSizeMm: 100, outsideDiameterMm: 114.3,
    pressureClass: '150', materialSpecification: 'ASTM A234 WPB', pipingClass: 'DEMO-150',
    elbowRadiusMm: radius, elbowAngleDeg: angleDeg, componentMassKg: 8.4,
    endConnectionFrom: 'BW', endConnectionTo: 'BW',
    sourceReference: { documentId: 'SPEC', revision: '1', path },
  };
}
function catalogue(extra = []) {
  return createTopologyEditSpecificationCatalogue({
    catalogueId: 'ROUTE-FITTINGS', catalogueVersion: '1',
    authority: { sourceId: 'SPEC', sourceVersion: '1', sourceHash: SOURCE_HASH },
    records: [pipeRecord(), elbowRecord(), ...extra],
  });
}
function emptyTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1', datasetId: 'route-elbow-dataset', datasetVersion: 0,
    sourceHash: SOURCE_HASH, topologyGraphHash: semanticHash({ nodes: [] }),
    nodes: [], edges: [], junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}
function common(spec, minimumLengthMm = 6) {
  return {
    unitSystem: { length: 'MM', angle: 'DEG' }, coordinateDatumHash: DATUM_HASH,
    catalogueBinding: createPipeSegmentCatalogueBinding({ catalogue: spec, recordId: 'PIPE-DN100' }),
    segmentPolicy: { minimumLengthMm, overlapToleranceMm: 0.001 },
  };
}
function revision(node) { return semanticHash({ kind: 'NODE', record: node }); }

async function seeded(spec = catalogue()) {
  const session = new TopologyEditCertifiedSession(emptyTopology());
  const intent = compileTypedStartRouteIntent({
    ...common(spec), axisLock: 'FREE',
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
function rawPlan(seed, points = [{ x: 2000, y: 0, z: 0 }, { x: 2000, y: 1000, z: 0 }], minimum = 6) {
  const intent = compileTypedContinueRouteIntent({
    ...common(seed.spec, minimum), startNodeId: seed.startNodeId,
    startNodeRevision: seed.startNodeRevision, pointsMm: points,
  });
  return createContinueRoutePlan({ intent, session: seed.session });
}

async function fittedFixture() {
  const seed = await seeded();
  const raw = rawPlan(seed);
  const fitted = createContinueRouteFittedPlan({ plan: raw, catalogue: seed.spec });
  const candidate = await prepareContinueRouteCandidate({
    plan: fitted, session: seed.session, catalogue: seed.spec,
  });
  return { ...seed, raw, fitted, candidate };
}

test('one exact 90-degree catalogue elbow resolves and consumes tangent length', async () => {
  const seed = await seeded();
  const raw = rawPlan(seed);
  const resolution = resolveContinueRouteElbows({ plan: raw, catalogue: seed.spec });
  assert.equal(resolution.bindings.length, 1);
  assert.equal(resolution.bindings[0].recordId, 'ELBOW-DN100-LR90-A');
  assert.equal(resolution.bindings[0].elbowRadiusMm, 152.4);
  const fitted = createContinueRouteFittedPlan({ plan: raw, catalogue: seed.spec });
  assert.equal(fitted.bendCount, 1);
  assert.equal(fitted.expectedCommandCount, 5);
  close(fitted.turns[0].tangentDistanceMm, 152.4);
  close(fitted.effectiveSegments[0].effectiveLengthMm, 847.6);
  close(fitted.effectiveSegments[1].effectiveLengthMm, 847.6);
});

test('non-90-degree elbow uses radius times tan(deflection/2)', async () => {
  const spec = catalogue([
    elbowRecord('ELBOW-DN100-LR45-A', 152.4, '/elbow/45', 45),
  ]);
  const seed = await seeded(spec);
  const raw = rawPlan(seed, [
    { x: 2000, y: 0, z: 0 },
    { x: 2707.1067811865476, y: 707.1067811865476, z: 0 },
  ]);
  const fitted = createContinueRouteFittedPlan({ plan: raw, catalogue: spec });
  const expectedTangent = 152.4 * Math.tan(Math.PI / 8);
  assert.equal(fitted.turns[0].elbowRecordId, 'ELBOW-DN100-LR45-A');
  close(fitted.turns[0].angleDeg, 45);
  close(fitted.turns[0].tangentDistanceMm, expectedTangent);
  close(fitted.effectiveSegments[0].effectiveLengthMm, 1000 - expectedTangent);
  close(fitted.effectiveSegments[1].effectiveLengthMm, 1000 - expectedTangent);
});

test('fitted candidate creates two catalogue pipes and one governed bend in five commands', async () => {
  const { fitted, candidate } = await fittedFixture();
  assert.equal(candidate.segmentCount, 2);
  assert.equal(candidate.nodeCount, 2);
  assert.equal(candidate.bendCount, 1);
  assert.equal(candidate.commandCount, 5);
  assert.equal(candidate.certificationMode, 'FINAL_STATE_COMPOSITE');
  assert.deepEqual(candidate.materializedCommands.map((row) => row.commandType), [
    'CREATE_NODE', 'INSERT_PIPE_SEGMENT', 'CREATE_NODE', 'INSERT_PIPE_SEGMENT', 'ADD_BEND_DEFINITION',
  ]);
  assert.equal(candidate.canonicalTopology.bends.length, 1);
  const bend = candidate.canonicalTopology.bends[0];
  const binding = fitted.elbowResolution.bindings[0];
  assert.equal(bend.radiusMm, 152.4);
  assert.equal(bend.angleDeg, 90);
  assert.equal(
    bend.radiusAuthority,
    `CATALOGUE:${binding.catalogueHash}:${binding.recordId}:${binding.recordHash}`,
  );
});

test('automatic elbow route applies and undoes/redoes as one exact suffix', async () => {
  const { spec, session, fitted, candidate } = await fittedFixture();
  const transaction = await executeContinueRouteTransaction({
    session, plan: fitted, candidate, catalogue: spec,
    preview: createContinueRoutePreview({ plan: fitted, candidate }),
    validation: createContinueRouteValidation({ candidate }),
  });
  const applied = session.snapshot();
  assert.equal(transaction.commandCount, 5);
  assert.equal(transaction.bendCount, 1);
  assert.equal(session.currentTopology().bends.length, 1);
  undoContinueRouteTransaction(session, transaction);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.priorCanonicalHash);
  redoContinueRouteTransaction(session, transaction);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.resultingCanonicalHash);
  assert.equal(session.journal.activeLedgerHash, applied.activeLedgerHash);
});

test('tangent consumption fails closed when a remaining straight leg is below minimum length', async () => {
  const seed = await seeded();
  const raw = rawPlan(seed, [{ x: 1200, y: 0, z: 0 }, { x: 1200, y: 1000, z: 0 }], 100);
  assert.throws(() => createContinueRouteFittedPlan({ plan: raw, catalogue: seed.spec }), /minimum is 100/u);
});

test('missing compatible elbow fails closed', async () => {
  const incompatible = createTopologyEditSpecificationCatalogue({
    catalogueId: 'ROUTE-FITTINGS', catalogueVersion: '1',
    authority: { sourceId: 'SPEC', sourceVersion: '1', sourceHash: SOURCE_HASH },
    records: [pipeRecord(), { ...elbowRecord(), nominalSizeMm: 50, outsideDiameterMm: 60.3 }],
  });
  const seed = await seeded(incompatible);
  assert.throws(() => createContinueRouteFittedPlan({
    plan: rawPlan(seed), catalogue: incompatible,
  }), /NO_COMPATIBLE_ELBOW/u);
});

test('multiple compatible elbows require an explicit deterministic selection', async () => {
  const spec = catalogue([elbowRecord('ELBOW-DN100-LR90-B', 200, '/elbow/b')]);
  const seed = await seeded(spec);
  const raw = rawPlan(seed);
  assert.throws(() => resolveContinueRouteElbows({ plan: raw, catalogue: spec }), /ELBOW_SELECTION_REQUIRED/u);
  const selected = createContinueRouteFittedPlan({
    plan: raw, catalogue: spec, elbowSelections: { 1: 'ELBOW-DN100-LR90-B' },
  });
  assert.equal(selected.turns[0].elbowRecordId, 'ELBOW-DN100-LR90-B');
  close(selected.turns[0].tangentDistanceMm, 200);
  const repeated = createContinueRouteFittedPlan({
    plan: raw, catalogue: spec, elbowSelections: { 1: 'ELBOW-DN100-LR90-B' },
  });
  assert.equal(repeated.planHash, selected.planHash);
});

test('candidate rejects a catalogue that differs from fitted-plan authority', async () => {
  const seed = await seeded();
  const fitted = createContinueRouteFittedPlan({ plan: rawPlan(seed), catalogue: seed.spec });
  const changed = createTopologyEditSpecificationCatalogue({
    catalogueId: 'ROUTE-FITTINGS', catalogueVersion: '2',
    authority: { sourceId: 'SPEC', sourceVersion: '2', sourceHash: `sha256:${'f'.repeat(64)}` },
    records: [pipeRecord(), elbowRecord()],
  });
  await assert.rejects(prepareContinueRouteCandidate({
    plan: fitted, session: seed.session, catalogue: changed,
  }), /catalogueHash/u);
});
