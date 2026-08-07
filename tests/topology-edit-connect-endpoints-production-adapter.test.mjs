import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { createTopologyEditSpecificationCatalogue } from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';
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
  applyConnectEndpointsAuthoring,
  captureConnectEndpoint,
  connectEndpointsElbowOptions,
  prepareConnectEndpointsAuthoring,
  prepareConnectEndpointsPlanning,
  redoConnectEndpointsAuthoring,
  undoConnectEndpointsAuthoring,
  validateConnectEndpointsAuthoring,
} from '../src/workspace/viewport-productivity/topology-edit-connect-endpoints-authoring-service.js';

const SOURCE_HASH = `sha256:${'5'.repeat(64)}`;
const DATUM_HASH = `sha256:${'6'.repeat(64)}`;
const PIPE_ID = 'PIPE-DN100';
function catalogue() {
  return createTopologyEditSpecificationCatalogue({
    catalogueId: 'CONNECT-PRODUCTION-SPEC', catalogueVersion: '1',
    authority: { sourceId: 'CONNECT-SPEC', sourceVersion: '1', sourceHash: SOURCE_HASH },
    records: [
      {
        recordId: PIPE_ID, componentType: 'PIPE', nominalSizeMm: 100,
        outsideDiameterMm: 114.3, schedule: 'SCH40', wallThicknessMm: 6.02,
        pressureClass: '150', materialSpecification: 'ASTM A106 GR B', pipingClass: 'DEMO-150',
        endConnectionFrom: 'BW', endConnectionTo: 'BW',
        sourceReference: { documentId: 'CONNECT-SPEC', revision: '1', path: '/pipe/dn100' },
      },
      {
        recordId: 'ELBOW-DN100-LR90', componentType: 'ELBOW', nominalSizeMm: 100,
        outsideDiameterMm: 114.3, pressureClass: '150', materialSpecification: 'ASTM A234 WPB',
        pipingClass: 'DEMO-150', elbowRadiusMm: 152.4, elbowAngleDeg: 90,
        componentMassKg: 8.4, endConnectionFrom: 'BW', endConnectionTo: 'BW',
        sourceReference: { documentId: 'CONNECT-SPEC', revision: '1', path: '/elbow/dn100' },
      },
    ],
  });
}
function emptyTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1', datasetId: 'connect-production-dataset',
    datasetVersion: 0, sourceHash: SOURCE_HASH, topologyGraphHash: semanticHash({ nodes: [] }),
    nodes: [], edges: [], junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}
function common(spec) {
  return {
    unitSystem: { length: 'MM', angle: 'DEG' }, coordinateDatumHash: DATUM_HASH,
    catalogueBinding: createPipeSegmentCatalogueBinding({ catalogue: spec, recordId: PIPE_ID }),
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
  };
}
async function startPipe(session, spec, startPointMm, endPointMm) {
  const intent = compileTypedStartRouteIntent({ ...common(spec), axisLock: 'FREE', startPointMm, endPointMm });
  const plan = createStartRoutePlan({ intent, session });
  const candidate = await prepareStartRouteCandidate({ plan, session, catalogue: spec });
  await executeStartRouteTransaction({
    session, plan, candidate, catalogue: spec,
    preview: createStartRoutePreview({ plan, candidate }),
    validation: createStartRouteValidation({ candidate }),
  });
  return candidate.operationBindings['step-2.created-node'];
}
async function fixture() {
  const spec = catalogue();
  const session = new TopologyEditCertifiedSession(emptyTopology());
  const startNodeId = await startPipe(session, spec, { x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 });
  const endNodeId = await startPipe(session, spec, { x: 3000, y: 3000, z: 0 }, { x: 3000, y: 2000, z: 0 });
  const controller = {
    session,
    selection: { nodeIds: [startNodeId], edgeId: null },
    issues: [],
  };
  const startEndpoint = captureConnectEndpoint(controller);
  controller.selection = { nodeIds: [endNodeId], edgeId: null };
  const endEndpoint = captureConnectEndpoint(controller);
  const values = {
    catalogueRecordId: PIPE_ID,
    minimumLengthMm: '6', overlapToleranceMm: '0.001',
    allowDirect: true, allowOrthogonal: true, maxAlternatives: '5', alternativeId: '',
  };
  return { spec, session, controller, startEndpoint, endEndpoint, values };
}

test('production planning binds exact captured endpoints and exposes ranked alternatives', async () => {
  const row = await fixture();
  const { plan } = prepareConnectEndpointsPlanning({ ...row, catalogue: row.spec });
  assert.equal(plan.compatibilityStatus, 'COMPATIBLE');
  assert.equal(plan.startEndpoint.nodeId, row.startEndpoint.nodeId);
  assert.equal(plan.endEndpoint.nodeId, row.endEndpoint.nodeId);
  assert.deepEqual(plan.alternatives.map((item) => item.rank), [1, 2, 3]);
  assert.equal(plan.alternatives[0].signature, 'x>y');
});

test('selected alternative derives fitting options from governed elbow resolver', async () => {
  const row = await fixture();
  const { plan } = prepareConnectEndpointsPlanning({ ...row, catalogue: row.spec });
  const selected = plan.alternatives.find((item) => item.signature === 'x>y');
  const options = connectEndpointsElbowOptions({ plan, alternativeId: selected.alternativeId, catalogue: row.spec });
  assert.equal(options.length, 1);
  assert.equal(options[0].options.length, 1);
  assert.equal(options[0].options[0].recordId, 'ELBOW-DN100-LR90');
});

test('production preview and worker plan retain exact command and scope evidence', async () => {
  const row = await fixture();
  const { plan } = prepareConnectEndpointsPlanning({ ...row, catalogue: row.spec });
  const selected = plan.alternatives.find((item) => item.signature === 'x>y');
  const prepared = await prepareConnectEndpointsAuthoring({
    controller: row.controller, plan, alternativeId: selected.alternativeId,
    elbowSelections: [], catalogue: row.spec,
  });
  assert.equal(prepared.operation.expectedCommandCount, 4);
  assert.equal(prepared.candidate.commandCount, 4);
  const validationClient = {
    validate: async ({ operationPlan, canonicalTopology }) => ({
      response: { receipt: {
        operationPlanHash: operationPlan.planHash,
        finalCanonicalHash: canonicalTopology.canonicalTopologyHash,
        baselineDiagnostics: [], finalDiagnostics: [],
      } },
    }),
  };
  const checked = await validateConnectEndpointsAuthoring({
    controller: row.controller,
    validationClient,
    operation: prepared.operation,
    candidate: prepared.candidate,
  });
  assert.equal(checked.operationPlan.operationType, 'RECONNECT_ENDPOINTS');
  assert.equal(checked.operationPlan.commandIntents.length, 4);
  assert.equal(checked.operationPlan.changedScope.nodeIds.length, 3);
  assert.equal(checked.operationPlan.changedScope.edgeIds.length, 4);
  assert.equal(checked.validation.status, 'READY_TO_APPLY');
});

test('production Apply Undo Redo is one exact connection transaction', async () => {
  const row = await fixture();
  const { plan } = prepareConnectEndpointsPlanning({ ...row, catalogue: row.spec });
  const selected = plan.alternatives.find((item) => item.signature === 'x>y');
  const prepared = await prepareConnectEndpointsAuthoring({
    controller: row.controller, plan, alternativeId: selected.alternativeId,
    elbowSelections: [], catalogue: row.spec,
  });
  const validationClient = { validate: async () => ({ response: { receipt: {
    baselineDiagnostics: [], finalDiagnostics: [],
  } } }) };
  const checked = await validateConnectEndpointsAuthoring({
    controller: row.controller, validationClient,
    operation: prepared.operation, candidate: prepared.candidate,
  });
  const before = row.session.currentTopology().canonicalTopologyHash;
  const transaction = await applyConnectEndpointsAuthoring({
    controller: row.controller, ...prepared, validation: checked.validation, catalogue: row.spec,
  });
  assert.notEqual(transaction.resultingCanonicalHash, before);
  undoConnectEndpointsAuthoring(row.controller, transaction);
  assert.equal(row.session.currentTopology().canonicalTopologyHash, before);
  redoConnectEndpointsAuthoring(row.controller, transaction);
  assert.equal(row.session.currentTopology().canonicalTopologyHash, transaction.resultingCanonicalHash);
});

test('endpoint capture rejects canonical terminal dependants before planning', async () => {
  const row = await fixture();
  const topology = row.session.currentTopology();
  const closed = finalizeCanonicalTopology({
    ...topology,
    boundaries: [{ id: 'boundary:production-closed', nodeId: row.startEndpoint.nodeId }],
  });
  row.controller.session = new TopologyEditCertifiedSession(closed);
  row.controller.selection = { nodeIds: [row.startEndpoint.nodeId], edgeId: null };
  assert.throws(() => captureConnectEndpoint(row.controller), /constrained by boundaries record boundary:production-closed/u);
});

test('endpoint capture fails closed for ambiguous selection or closed graph nodes', async () => {
  const row = await fixture();
  row.controller.selection = { nodeIds: [row.startEndpoint.nodeId, row.endEndpoint.nodeId] };
  assert.throws(() => captureConnectEndpoint(row.controller), /exactly one canonical endpoint/u);
  const selected = row.session.currentTopology().nodes.find((node) => node.id === row.startEndpoint.nodeId);
  const tampered = { ...row.controller, session: { currentTopology: () => ({
    nodes: row.session.currentTopology().nodes,
    edges: [
      ...row.session.currentTopology().edges,
      { id: 'edge:extra', fromNodeId: selected.id, toNodeId: row.endEndpoint.nodeId, entityType: 'PIPE' },
    ],
  }) }, selection: { nodeIds: [selected.id] } };
  assert.throws(() => captureConnectEndpoint(tampered), /degree one/u);
});
