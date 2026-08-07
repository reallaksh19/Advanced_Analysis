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
import { prepareContinueRouteCandidate } from '../src/workspace/topology-edit/authoring/topology-edit-continue-route-candidate.js';
import {
  createContinueRoutePreview,
  createContinueRouteValidation,
  executeContinueRouteTransaction,
} from '../src/workspace/topology-edit/authoring/topology-edit-continue-route-transaction.js';
import { createConnectEndpointsIntent } from '../src/workspace/topology-edit/authoring/topology-edit-connect-endpoints-intent.js';
import { createConnectEndpointsPlan } from '../src/workspace/topology-edit/authoring/topology-edit-connect-endpoints-plan.js';

const SOURCE_HASH = `sha256:${'1'.repeat(64)}`;
const DATUM_HASH = `sha256:${'2'.repeat(64)}`;

function pipeRecord(recordId, nominalSizeMm, outsideDiameterMm, schedule, wallThicknessMm) {
  return {
    recordId, componentType: 'PIPE', nominalSizeMm, outsideDiameterMm, schedule, wallThicknessMm,
    pressureClass: '150', materialSpecification: 'ASTM A106 GR B', pipingClass: 'DEMO-150',
    endConnectionFrom: 'BW', endConnectionTo: 'BW',
    sourceReference: { documentId: 'CONNECT-SPEC', revision: '1', path: `/pipe/${recordId}` },
  };
}
function catalogue() {
  return createTopologyEditSpecificationCatalogue({
    catalogueId: 'CONNECT-ENDS-SPEC', catalogueVersion: '1',
    authority: { sourceId: 'CONNECT-SPEC', sourceVersion: '1', sourceHash: SOURCE_HASH },
    records: [
      pipeRecord('PIPE-DN100', 100, 114.3, 'SCH40', 6.02),
      pipeRecord('PIPE-DN50', 50, 60.3, 'SCH40', 3.91),
    ],
  });
}
function emptyTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1', datasetId: 'connect-ends-dataset', datasetVersion: 0,
    sourceHash: SOURCE_HASH, topologyGraphHash: semanticHash({ nodes: [] }),
    nodes: [], edges: [], junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}
function common(spec, recordId = 'PIPE-DN100') {
  return {
    unitSystem: { length: 'MM', angle: 'DEG' }, coordinateDatumHash: DATUM_HASH,
    catalogueBinding: createPipeSegmentCatalogueBinding({ catalogue: spec, recordId }),
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
  };
}
function revision(node) { return semanticHash({ kind: 'NODE', record: node }); }
async function startPipe(session, spec, startPointMm, endPointMm) {
  const intent = compileTypedStartRouteIntent({ ...common(spec), axisLock: 'FREE', startPointMm, endPointMm });
  const plan = createStartRoutePlan({ intent, session });
  const candidate = await prepareStartRouteCandidate({ plan, session, catalogue: spec });
  await executeStartRouteTransaction({
    session, plan, candidate, catalogue: spec,
    preview: createStartRoutePreview({ plan, candidate }),
    validation: createStartRouteValidation({ candidate }),
  });
  return {
    firstNodeId: candidate.operationBindings['step-1.created-node'],
    secondNodeId: candidate.operationBindings['step-2.created-node'],
  };
}
async function seeded() {
  const spec = catalogue();
  const session = new TopologyEditCertifiedSession(emptyTopology());
  const left = await startPipe(session, spec, { x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 });
  const right = await startPipe(session, spec, { x: 3000, y: 3000, z: 0 }, { x: 3000, y: 2000, z: 0 });
  const topology = session.currentTopology();
  const startNode = topology.nodes.find((row) => row.id === left.secondNodeId);
  const endNode = topology.nodes.find((row) => row.id === right.secondNodeId);
  return {
    spec, session,
    startNodeId: startNode.id, startNodeRevision: revision(startNode),
    endNodeId: endNode.id, endNodeRevision: revision(endNode),
  };
}
function intent(seed, recordId = 'PIPE-DN100', routePolicy = {
  allowDirect: true, allowOrthogonal: true, maxAlternatives: 5,
}) {
  return createConnectEndpointsIntent({
    startNodeId: seed.startNodeId, startNodeRevision: seed.startNodeRevision,
    endNodeId: seed.endNodeId, endNodeRevision: seed.endNodeRevision,
    catalogueBinding: common(seed.spec, recordId).catalogueBinding,
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
    routePolicy,
  });
}

test('compatible endpoints produce deterministic direct and orthogonal alternatives ranked by fittings', async () => {
  const seed = await seeded();
  const request = intent(seed);
  const plan = createConnectEndpointsPlan({ intent: request, session: seed.session });
  assert.equal(plan.compatibilityStatus, 'COMPATIBLE');
  assert.deepEqual(plan.compatibilityDifferences, []);
  assert.equal(plan.alternatives.length, 3);
  assert.deepEqual(plan.alternatives.map((row) => row.signature), ['x>y', 'DIRECT', 'y>x']);
  assert.deepEqual(plan.alternatives.map((row) => row.fittingCount), [1, 2, 3]);
  assert.deepEqual(plan.alternatives[0].points, [
    { x: 1000, y: 0, z: 0 },
    { x: 3000, y: 0, z: 0 },
    { x: 3000, y: 2000, z: 0 },
  ]);
  assert.equal(plan.alternatives[0].segmentCount, 2);
  assert.equal(plan.alternatives[0].totalLengthMm, 4000);
  const repeated = createConnectEndpointsPlan({ intent: request, session: seed.session });
  assert.equal(repeated.planHash, plan.planHash);
  assert.deepEqual(repeated.alternativeHashes, plan.alternativeHashes);
});

test('route policy can explicitly exclude direct candidates', async () => {
  const seed = await seeded();
  const plan = createConnectEndpointsPlan({
    intent: intent(seed, 'PIPE-DN100', { allowDirect: false, allowOrthogonal: true, maxAlternatives: 2 }),
    session: seed.session,
  });
  assert.equal(plan.alternatives.length, 2);
  assert.ok(plan.alternatives.every((row) => row.kind === 'ORTHOGONAL'));
});

test('mismatched selected pipe specification is classified as transition required', async () => {
  const seed = await seeded();
  const plan = createConnectEndpointsPlan({ intent: intent(seed, 'PIPE-DN50'), session: seed.session });
  assert.equal(plan.compatibilityStatus, 'TRANSITION_REQUIRED');
  assert.ok(plan.compatibilityDifferences.includes('START:nominalSizeMm'));
  assert.ok(plan.compatibilityDifferences.includes('END:nominalSizeMm'));
  assert.ok(plan.compatibilityDifferences.includes('START:outsideDiameterMm'));
  assert.ok(plan.compatibilityDifferences.includes('END:outsideDiameterMm'));
});

test('planner binds exact node and incident-edge revisions into endpoint authority', async () => {
  const seed = await seeded();
  const plan = createConnectEndpointsPlan({ intent: intent(seed), session: seed.session });
  assert.equal(plan.basis.startEndpointHash, plan.startEndpoint.endpointHash);
  assert.equal(plan.basis.endEndpointHash, plan.endEndpoint.endpointHash);
  assert.match(plan.startEndpoint.incidentEdgeRevision, /^fnv1a64:/u);
  assert.match(plan.endEndpoint.incidentEdgeRevision, /^fnv1a64:/u);
  assert.equal(plan.startEndpoint.connection, 'BW');
  assert.equal(plan.endEndpoint.connection, 'BW');
});

test('stale endpoint revisions fail closed', async () => {
  const seed = await seeded();
  const stale = createConnectEndpointsIntent({
    startNodeId: seed.startNodeId, startNodeRevision: `sha256:${'9'.repeat(64)}`,
    endNodeId: seed.endNodeId, endNodeRevision: seed.endNodeRevision,
    catalogueBinding: common(seed.spec).catalogueBinding,
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
    routePolicy: { allowDirect: true, allowOrthogonal: true, maxAlternatives: 5 },
  });
  assert.throws(() => createConnectEndpointsPlan({ intent: stale, session: seed.session }), /revision is stale/u);
});

test('an endpoint that is no longer graph-open fails closed', async () => {
  const seed = await seeded();
  const routeIntent = compileTypedContinueRouteIntent({
    ...common(seed.spec), startNodeId: seed.startNodeId, startNodeRevision: seed.startNodeRevision,
    pointsMm: [{ x: 1500, y: 0, z: 0 }],
  });
  const routePlan = createContinueRoutePlan({ intent: routeIntent, session: seed.session });
  const routeCandidate = await prepareContinueRouteCandidate({ plan: routePlan, session: seed.session, catalogue: seed.spec });
  await executeContinueRouteTransaction({
    session: seed.session, plan: routePlan, candidate: routeCandidate, catalogue: seed.spec,
    preview: createContinueRoutePreview({ plan: routePlan, candidate: routeCandidate }),
    validation: createContinueRouteValidation({ candidate: routeCandidate }),
  });
  const topology = seed.session.currentTopology();
  const changedStart = topology.nodes.find((row) => row.id === seed.startNodeId);
  const changedIntent = createConnectEndpointsIntent({
    startNodeId: seed.startNodeId, startNodeRevision: revision(changedStart),
    endNodeId: seed.endNodeId,
    endNodeRevision: revision(topology.nodes.find((row) => row.id === seed.endNodeId)),
    catalogueBinding: common(seed.spec).catalogueBinding,
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
    routePolicy: { allowDirect: true, allowOrthogonal: true, maxAlternatives: 5 },
  });
  assert.throws(() => createConnectEndpointsPlan({
    intent: changedIntent, session: seed.session,
  }), /graph degree one/u);
});

test('explicit maximum alternatives caps a three-axis permutation set deterministically', async () => {
  const spec = catalogue();
  const session = new TopologyEditCertifiedSession(emptyTopology());
  const left = await startPipe(session, spec, { x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 });
  const right = await startPipe(session, spec, { x: 3000, y: 3000, z: 3000 }, { x: 3000, y: 2000, z: 3000 });
  const topology = session.currentTopology();
  const start = topology.nodes.find((row) => row.id === left.secondNodeId);
  const end = topology.nodes.find((row) => row.id === right.secondNodeId);
  const request = createConnectEndpointsIntent({
    startNodeId: start.id, startNodeRevision: revision(start),
    endNodeId: end.id, endNodeRevision: revision(end),
    catalogueBinding: common(spec).catalogueBinding,
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
    routePolicy: { allowDirect: true, allowOrthogonal: true, maxAlternatives: 4 },
  });
  const plan = createConnectEndpointsPlan({ intent: request, session });
  assert.equal(plan.alternatives.length, 4);
  assert.deepEqual(plan.alternatives.map((row) => row.rank), [1, 2, 3, 4]);
});
