import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { createPipeSegmentCatalogueBinding } from '../src/workspace/topology-edit/topology-edit-pipe-segment-command.js';
import {
  topologyEditEdgeBendDefinitions,
  topologyEditEdgeReferencesBend,
} from '../src/workspace/topology-edit/topology-edit-bend-edge-crosswalk.js';
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
import { createContinueRouteFittedPlan } from '../src/workspace/topology-edit/authoring/topology-edit-continue-route-fitted-plan.js';
import { prepareContinueRouteCandidate } from '../src/workspace/topology-edit/authoring/topology-edit-continue-route-candidate.js';
import {
  applyTopologyEditAuthoredBendProjection,
  deriveTopologyEditAuthoredBendProjection,
} from '../src/workspace/topology-edit/authoring/topology-edit-authored-bend-geometry.js';

const SOURCE_HASH = `sha256:${'7'.repeat(64)}`;
const DATUM_HASH = `sha256:${'8'.repeat(64)}`;

function catalogue() {
  return createTopologyEditSpecificationCatalogue({
    catalogueId: 'MULTI-BEND-SPEC', catalogueVersion: '1',
    authority: { sourceId: 'SPEC', sourceVersion: '1', sourceHash: SOURCE_HASH },
    records: [
      {
        recordId: 'PIPE-DN100', componentType: 'PIPE', nominalSizeMm: 100,
        outsideDiameterMm: 114.3, schedule: 'SCH40', wallThicknessMm: 6.02,
        pressureClass: '150', materialSpecification: 'ASTM A106 GR B', pipingClass: 'DEMO-150',
        endConnectionFrom: 'BW', endConnectionTo: 'BW',
        sourceReference: { documentId: 'SPEC', revision: '1', path: '/pipe/dn100' },
      },
      {
        recordId: 'ELBOW-DN100-LR90', componentType: 'ELBOW', nominalSizeMm: 100,
        outsideDiameterMm: 114.3, pressureClass: '150', materialSpecification: 'ASTM A234 WPB',
        pipingClass: 'DEMO-150', elbowRadiusMm: 152.4, elbowAngleDeg: 90,
        componentMassKg: 8.4, endConnectionFrom: 'BW', endConnectionTo: 'BW',
        sourceReference: { documentId: 'SPEC', revision: '1', path: '/elbow/dn100' },
      },
    ],
  });
}
function emptyTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1', datasetId: 'multi-bend-dataset', datasetVersion: 0,
    sourceHash: SOURCE_HASH, topologyGraphHash: semanticHash({ nodes: [] }),
    nodes: [], edges: [], junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}
function common(spec) {
  return {
    unitSystem: { length: 'MM', angle: 'DEG' }, coordinateDatumHash: DATUM_HASH,
    catalogueBinding: createPipeSegmentCatalogueBinding({ catalogue: spec, recordId: 'PIPE-DN100' }),
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
  };
}
function revision(node) { return semanticHash({ kind: 'NODE', record: node }); }

async function candidateFixture() {
  const spec = catalogue();
  const session = new TopologyEditCertifiedSession(emptyTopology());
  const startIntent = compileTypedStartRouteIntent({
    ...common(spec), axisLock: 'FREE',
    startPointMm: { x: 0, y: 0, z: 0 }, endPointMm: { x: 1000, y: 0, z: 0 },
  });
  const startPlan = createStartRoutePlan({ intent: startIntent, session });
  const startCandidate = await prepareStartRouteCandidate({ plan: startPlan, session, catalogue: spec });
  await executeStartRouteTransaction({
    session, plan: startPlan, candidate: startCandidate, catalogue: spec,
    preview: createStartRoutePreview({ plan: startPlan, candidate: startCandidate }),
    validation: createStartRouteValidation({ candidate: startCandidate }),
  });
  const startNodeId = startCandidate.operationBindings['step-2.created-node'];
  const startNode = session.currentTopology().nodes.find((row) => row.id === startNodeId);
  const routeIntent = compileTypedContinueRouteIntent({
    ...common(spec), startNodeId, startNodeRevision: revision(startNode),
    pointsMm: [
      { x: 2000, y: 0, z: 0 },
      { x: 2000, y: 1000, z: 0 },
      { x: 3000, y: 1000, z: 0 },
    ],
  });
  const raw = createContinueRoutePlan({ intent: routeIntent, session });
  const fitted = createContinueRouteFittedPlan({ plan: raw, catalogue: spec });
  const candidate = await prepareContinueRouteCandidate({ plan: fitted, session, catalogue: spec });
  return { candidate };
}
function baseProjection(topology) {
  const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
  return {
    schema: 'multi-bend-test-projection/v1',
    elements: [],
    segments: topology.edges.map((edge) => {
      const start = { ...nodes.get(edge.fromNodeId).position };
      const end = { ...nodes.get(edge.toNodeId).position };
      return {
        id: `segment:${edge.id}`,
        entityId: edge.id,
        start,
        end,
        points: [start, end],
        pickTarget: { objectId: edge.id },
      };
    }),
  };
}

test('a straight spool between two authored elbows retains both crosswalks and visual trims', async () => {
  const { candidate } = await candidateFixture();
  const topology = candidate.canonicalTopology;
  assert.equal(candidate.bendCount, 2);
  assert.equal(topology.bends.length, 2);
  const middleEdgeId = candidate.operationBindings['leg-2-pipe.created-edge'];
  assert.ok(middleEdgeId);
  const middleEdge = topology.edges.find((row) => row.id === middleEdgeId);
  assert.ok(middleEdge);

  const definitions = topologyEditEdgeBendDefinitions(middleEdge);
  assert.equal(definitions.length, 2);
  assert.equal(middleEdge.bendDefinitions.length, 2);
  assert.equal(middleEdge.bendDefinitionCount, 2);
  assert.ok(middleEdge.bendDefinition);
  for (const bend of topology.bends) {
    const arms = topology.edges.filter((edge) => bend.edgeIds.includes(edge.id));
    assert.equal(arms.length, 2);
    assert.ok(arms.every((edge) => topologyEditEdgeReferencesBend(edge, bend.id)));
  }
  const outerEdges = topology.edges.filter((edge) => (
    edge.id !== middleEdgeId && edge.createdByCommandId
  ));
  for (const edge of outerEdges) {
    const rows = topologyEditEdgeBendDefinitions(edge);
    if (rows.length === 1) assert.equal(edge.bendDefinition?.bendId, rows[0].bendId);
  }

  const authored = deriveTopologyEditAuthoredBendProjection(topology);
  assert.equal(authored.diagnostics.length, 0);
  assert.equal(authored.segments.length, 2);
  const middleTrims = authored.trims.filter((row) => row.edgeId === middleEdgeId);
  assert.equal(middleTrims.length, 2);
  assert.deepEqual(new Set(middleTrims.map((row) => row.endpoint)), new Set(['FROM', 'TO']));

  const raw = baseProjection(topology);
  const rawMiddle = raw.segments.find((row) => row.entityId === middleEdgeId);
  const projected = applyTopologyEditAuthoredBendProjection(raw, topology);
  const projectedMiddle = projected.segments.find((row) => row.entityId === middleEdgeId);
  assert.notDeepEqual(projectedMiddle.start, rawMiddle.start);
  assert.notDeepEqual(projectedMiddle.end, rawMiddle.end);
  assert.deepEqual(projectedMiddle.points[0], projectedMiddle.start);
  assert.deepEqual(projectedMiddle.points.at(-1), projectedMiddle.end);
  assert.equal(projected.authoredBendArcCount, 2);
});
