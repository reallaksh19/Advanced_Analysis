import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { createTopologyEditSpecificationCatalogue } from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { START_ROUTE_TRANSACTION_SCHEMA } from '../src/workspace/topology-edit/authoring/topology-edit-start-route-transaction.js';
import { createStartRouteValidationOperationPlan } from '../src/workspace/topology-edit/authoring/topology-edit-start-route-validation-plan.js';
import { TopologyEditStartRouteAuthoringRuntime } from '../src/workspace/viewport-productivity/topology-edit-start-route-authoring-runtime.js';
import {
  compileStartRouteHudIntent,
  prepareStartRouteAuthoring,
  startRouteExactSnapAcquisition,
} from '../src/workspace/viewport-productivity/topology-edit-start-route-authoring-service.js';

const SOURCE_HASH = `sha256:${'a'.repeat(64)}`;

function catalogue() {
  return createTopologyEditSpecificationCatalogue({
    catalogueId: 'START-ROUTE-PRODUCTION', catalogueVersion: '1',
    authority: { sourceId: 'SPEC', sourceVersion: 'A', sourceHash: SOURCE_HASH },
    records: [{
      recordId: 'PIPE-DN50', componentType: 'PIPE', nominalSizeMm: 50,
      outsideDiameterMm: 60.3, schedule: 'S40', wallThicknessMm: 3.91,
      pressureClass: 'CL150', materialSpecification: 'ASTM-A106-B',
      endConnectionFrom: 'BUTT_WELD', endConnectionTo: 'BUTT_WELD',
      pipingClass: 'CS150',
      sourceReference: { documentId: 'SPEC', revision: 'A', path: '/pipe/dn50' },
    }],
  });
}
function baseTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'native-dataset:production-adapter', datasetVersion: 0,
    sourceHash: SOURCE_HASH,
    topologyGraphHash: semanticHash({ nodes: [], edges: [] }),
    nodes: [], edges: [], junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}
function controller() {
  return {
    session: new TopologyEditCertifiedSession(baseTopology()),
    workspaceDataset: {
      datasetId: 'native-dataset:production-adapter',
      axisTransform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      nativeAuthoring: {
        coordinateSystem: { coordinateSystemId: 'MODEL', datumId: 'ORIGIN' },
      },
    },
    interactionControllerRuntime: { snapResult: null },
  };
}
function values(inputMode = 'TYPED') {
  return {
    inputMode,
    startX: 0, startY: 0, startZ: 0,
    endX: 1000, endY: 200, endZ: 50,
    axisLock: 'FREE', catalogueRecordId: 'PIPE-DN50',
    minimumLengthMm: 6, overlapToleranceMm: 0.001,
  };
}
function exactSnap(point, patch = {}) {
  return {
    status: 'RESOLVED', compatibility: 'EXACT', candidateCount: 1,
    snappedWorldPoint: point, ...patch,
  };
}

test('production adapter creates explicit Start Route worker scope', async () => {
  const app = controller();
  const spec = catalogue();
  const prepared = await prepareStartRouteAuthoring({
    controller: app, values: values(), catalogue: spec,
  });
  const workerPlan = createStartRouteValidationOperationPlan(prepared);
  assert.equal(workerPlan.operationType, 'START_ROUTE');
  assert.equal(workerPlan.commandIntents.length, 3);
  assert.deepEqual(workerPlan.commandIntents.map((row) => row.commandType), [
    'CREATE_NODE', 'CREATE_NODE', 'INSERT_PIPE_SEGMENT',
  ]);
  assert.equal(workerPlan.changedScope.nodeIds.length, 2);
  assert.equal(workerPlan.changedScope.edgeIds.length, 1);
  assert.deepEqual(workerPlan.targetIds, [
    ...workerPlan.changedScope.nodeIds,
    ...workerPlan.changedScope.edgeIds,
  ].sort());
  assert.equal(
    workerPlan.parameters.catalogueCompatibility.bindingHash,
    prepared.intent.catalogueBinding.bindingHash,
  );
});

test('typed and exact viewport HUD paths compile identical intent authority', () => {
  const typedController = controller();
  const viewportController = controller();
  const spec = catalogue();
  viewportController.interactionControllerRuntime.snapResult = exactSnap({ x: 0, y: 0, z: 0 });
  const start = startRouteExactSnapAcquisition(viewportController);
  viewportController.interactionControllerRuntime.snapResult = exactSnap({ x: 1000, y: 200, z: 50 });
  const end = startRouteExactSnapAcquisition(viewportController);
  const typed = compileStartRouteHudIntent({
    controller: typedController, values: values(), catalogue: spec,
  });
  const viewport = compileStartRouteHudIntent({
    controller: viewportController, values: values('VIEWPORT'),
    startAcquisition: start, endAcquisition: end, catalogue: spec,
  });
  assert.equal(typed.intentHash, viewport.intentHash);
});

test('viewport acquisition and missing governed inputs fail closed', () => {
  const app = controller();
  app.interactionControllerRuntime.snapResult = exactSnap(
    { x: 0, y: 0, z: 0 },
    { candidateCount: 2 },
  );
  assert.throws(() => startRouteExactSnapAcquisition(app), /unambiguous EXACT/u);
  app.interactionControllerRuntime.snapResult = exactSnap(
    { x: 0, y: 0, z: 0 },
    { compatibility: 'ADAPTABLE' },
  );
  assert.throws(() => startRouteExactSnapAcquisition(app), /unambiguous EXACT/u);
  assert.throws(() => compileStartRouteHudIntent({
    controller: app,
    values: { ...values(), catalogueRecordId: '' },
    catalogue: catalogue(),
  }), /recordId/u);
  assert.throws(() => compileStartRouteHudIntent({
    controller: app,
    values: { ...values(), minimumLengthMm: '' },
    catalogue: catalogue(),
  }), /minimumLengthMm/u);
});

test('route receipt retains atomic undo dispatch after tool deactivation', () => {
  const runtime = Object.create(TopologyEditStartRouteAuthoringRuntime.prototype);
  const receipt = { schema: START_ROUTE_TRANSACTION_SCHEMA, transactionHash: SOURCE_HASH };
  runtime.transaction = receipt;
  runtime.redoTransaction = receipt;
  runtime.transitionHistory = (direction, value) => ({ direction, value });
  assert.deepEqual(runtime.undoOperation(), { direction: 'undo', value: receipt });
  assert.deepEqual(runtime.redoOperation(), { direction: 'redo', value: receipt });
});
