import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { checkCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-checker.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { buildCanonicalTopologyFromWorkspaceDataset } from '../src/workspace/topology-edit/topology-edit-source-adapter.js';
import { prepareTopologyEditStagedJsonWriteback } from '../src/workspace/topology-edit/export/topology-edit-stagedjson-writeback.js';
import {
  assertTopologyEditStagedJsonRoundTrip,
  qualifyTopologyEditStagedJsonRoundTrip,
} from '../src/workspace/topology-edit/export/topology-edit-stagedjson-roundtrip.js';
import { runTopologyEditIncrementalValidation } from '../src/workspace/topology-edit/professional/topology-edit-incremental-validation.js';
import { createTopologyEditTableBatch } from '../src/workspace/topology-edit/table/topology-edit-table-batch.js';
import { planTopologyEditTableBatch } from '../src/workspace/topology-edit/table/topology-edit-table-batch-planner.js';
import { createTopologyEditTableIntent } from '../src/workspace/topology-edit/table/topology-edit-table-intent.js';
import { buildTopologyEditTableProjection } from '../src/workspace/topology-edit/table/topology-edit-table-projection.js';
import {
  applyTopologyEditTableTransaction,
  prepareTopologyEditTablePreview,
  validateTopologyEditTablePreview,
} from '../src/workspace/topology-edit/table/topology-edit-table-transaction.js';

const FIXTURE = new URL('../public/fixtures/topology-edit-table-q3-exact.staged.json', import.meta.url);
const BALL = Object.freeze({
  catalogueHash: 'sha256:q3-valves-v2', sourceHash: 'sha256:q3-valves-source-v2',
  recordId: 'BALL-DN80-C150', recordHash: 'sha256:q3-ball-80-150',
  componentType: 'VALVE', nominalSizeMm: 80, outsideDiameterMm: 88.9,
  pipingClass: 'PCL-80', pressureClass: '150', materialSpecification: 'A216-WCB',
  componentMassKg: 24, endConnectionFrom: 'FLANGED', endConnectionTo: 'FLANGED',
  valveType: 'BALL', valveFaceToFaceMm: 300,
  sourceReference: { documentId: 'Q3-VALVES', revision: 'R2', path: '/BALL/80/150' },
});

async function imported() {
  const bytes = new Uint8Array(await readFile(FIXTURE));
  const raw = JSON.parse(new TextDecoder().decode(bytes));
  const dataset = normalizeWorkspaceDataset(raw, 'topology-edit-table-q3-exact.staged.json', { sourceBytes: bytes });
  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  const canonical = finalizeCanonicalTopology(buildCanonicalTopologyFromWorkspaceDataset(dataset, graph));
  const projection = buildTopologyEditTableProjection({ canonicalTopology: canonical, dataset, topologyGraph: graph });
  return { dataset, graph, canonical, projection };
}

function rowByComponent(projection, key) {
  const rows = projection.rows.filter((row) => row.identity.componentKey === key);
  assert.equal(rows.length, 1, `Expected one Table row for ${key}.`);
  return rows[0];
}

function edgeByComponent(canonical, key) {
  const rows = canonical.edges.filter((row) => row.componentKey === key);
  assert.equal(rows.length, 1, `Expected one canonical edge for ${key}.`);
  return rows[0];
}

function q3Intents({ canonical, projection, session }) {
  const m04 = rowByComponent(projection, 'P-M04');
  const m06 = rowByComponent(projection, 'V-M06');
  const tee = rowByComponent(projection, 'T-001');
  const reducer = rowByComponent(projection, 'R-001');
  const reducerEdge = edgeByComponent(canonical, 'R-001');
  const branch = tee.identity.portBindings.find((row) => row.nodeId === reducerEdge.fromNodeId);
  assert.ok(branch?.portKey, 'Exact TEE branch port is required.');
  const runNodeIds = tee.identity.portBindings
    .filter((row) => row.nodeId !== reducerEdge.fromNodeId)
    .map((row) => row.nodeId)
    .sort();
  return [
    createTopologyEditTableIntent({
      projection, sessionSnapshot: session.snapshot(), canonicalId: m04.identity.canonicalId,
      intentKind: 'PIPE_LENGTH', requestedValue: { lengthMm: 3000 },
      geometryPolicy: { anchor: 'FROM', propagation: 'DOWNSTREAM' },
    }),
    createTopologyEditTableIntent({
      projection, sessionSnapshot: session.snapshot(), canonicalId: m06.identity.canonicalId,
      intentKind: 'VALVE_REPLACEMENT', requestedValue: { catalogueBinding: BALL, direction: 'FROM_TO' },
      geometryPolicy: { anchor: 'FROM', propagation: 'DOWNSTREAM' },
    }),
    createTopologyEditTableIntent({
      projection, sessionSnapshot: session.snapshot(), canonicalId: tee.identity.canonicalId,
      intentKind: 'TEE_REDUCER_RELATION', requestedValue: {
        branchNodeId: reducerEdge.fromNodeId, branchPortKey: branch.portKey, runNodeIds,
        reducerCanonicalId: reducer.identity.canonicalId, runNominalSizeMm: 150,
        teeBranchNominalSizeMm: 100, downstreamNominalSizeMm: 80,
        relationPolicy: 'EXPLICIT_REDUCER',
      },
    }),
  ];
}

function validationReceipt(base, preview, plan) {
  let tick = 0;
  return runTopologyEditIncrementalValidation({
    canonicalTopology: preview.candidate.canonicalTopology,
    operationPlan: plan.operationPlan,
    previousDiagnostics: checkCanonicalTopology(base),
    now: () => ++tick,
    performancePolicy: { fastPathBudgetMs: 100, warningBudgetMs: 200, hysteresisMs: 10 },
  });
}

async function certifiedQ3() {
  const { dataset, canonical, projection, graph } = await imported();
  const session = new TopologyEditCertifiedSession(canonical);
  const batch = createTopologyEditTableBatch({ intents: q3Intents({ canonical, projection, session }) });
  const plan = planTopologyEditTableBatch({ batch, projection, canonicalTopology: canonical });
  const preview = await prepareTopologyEditTablePreview({ session, batchPlan: plan });
  const tableValidation = validateTopologyEditTablePreview({
    preview,
    workerReceipt: validationReceipt(canonical, preview, plan),
  });
  assert.equal(tableValidation.status, 'READY_TO_APPLY');
  await applyTopologyEditTableTransaction({ session, batchPlan: plan, preview, tableValidation });
  return { dataset, canonical, projection, graph, edited: session.currentTopology() };
}

test('certified Q3 M04 M06 M10 surgically writes and production-reimports StagedJSON', async () => {
  const { dataset, canonical, projection, edited } = await certifiedQ3();
  const sourceHash = dataset.sourceSnapshot.sourceSemanticHash;
  const sourceBefore = structuredClone(dataset.sourceSnapshot.sourcePackage);
  const valve = edgeByComponent(edited, 'V-M06');
  assert.equal(valve.valveType, 'BALL');
  assert.equal(valve.catalogueBinding.recordHash, BALL.recordHash);

  const input = { dataset, baseCanonicalTopology: canonical, canonicalTopology: edited };
  const writeback = prepareTopologyEditStagedJsonWriteback(input);
  assert.deepEqual(writeback.changedEdgeIds, [valve.id]);
  assert.equal(writeback.changedJunctionIds.length, 1);
  assert.ok(writeback.changedNodeIds.length > 0);
  assert.notEqual(writeback.resultingSourceSemanticHash, sourceHash);

  const output = writeback.surgical.sourcePackage;
  const sourceValve = output.objects.find((row) => row.id === 'V-M06');
  const sourceTee = output.objects.find((row) => row.id === 'T-001');
  const sourceReducer = output.objects.find((row) => row.id === 'R-001');
  assert.equal(sourceValve.attributes.VALVE_TYPE, 'BALL');
  assert.equal(sourceValve.attributes.FACE_TO_FACE_MM, 300);
  assert.equal(sourceValve.attributes.COMPONENT_WEIGHT_KG, 24);
  assert.equal(sourceValve.nativeParams.catalogue.catalogueRecordHash, BALL.recordHash);
  assert.equal(sourceValve.nativeParams.catalogue.vendorCatalogueToken, 'KEEP-VALVE-CATALOGUE-OPAQUE');
  assert.equal(sourceTee.attributes.TOPOLOGY_EDIT_RELATION_POLICY, 'EXPLICIT_REDUCER');
  assert.equal(sourceTee.attributes.TOPOLOGY_EDIT_REDUCER_RECORD_ID, 'RED-100-80');
  assert.equal(sourceReducer.attributes.VENDOR_CUSTOM_FIELD, 'KEEP-REDUCER-FIELD');
  assert.equal(sourceReducer.nativeParams.catalogue.vendorCatalogueToken, 'KEEP-REDUCER-CATALOGUE-OPAQUE');
  assert.equal(output.vendorTopLevel.opaqueToken, 'KEEP-Q3-OPAQUE');

  const receipt = qualifyTopologyEditStagedJsonRoundTrip(input);
  assert.equal(receipt.status, 'QUALIFIED');
  assert.equal(receipt.comparison.status, 'EQUIVALENT');
  assert.equal(receipt.comparison.mismatchCount, 0);
  assert.equal(edgeByComponent(receipt.reimportedCanonical, 'V-M06').valveType, 'BALL');
  const reimportedTee = receipt.reimportedCanonical.junctions.find((row) => row.componentKey === 'T-001');
  assert.equal(reimportedTee.branchRelation.relationPolicy, 'EXPLICIT_REDUCER');
  assert.equal(reimportedTee.branchRelation.reducerRecordId, 'RED-100-80');
  assertTopologyEditStagedJsonRoundTrip(receipt);

  assert.equal(dataset.sourceSnapshot.sourceSemanticHash, sourceHash);
  assert.equal(semanticHash(dataset.sourceSnapshot.sourcePackage), sourceHash);
  assert.deepEqual(dataset.sourceSnapshot.sourcePackage, sourceBefore);
  assert.equal(rowByComponent(projection, 'R-001').custody.catalogueAuthority, 'EXACT');
});

test('engineering writer still fails closed when exact writable source fields are absent', async () => {
  const { dataset, canonical, edited } = await certifiedQ3();
  const entity = dataset.entities.find((row) => row.entityId === 'V-M06');
  assert.ok(entity, 'Q3 valve source entity is required.');
  const attributes = { ...entity.properties.attributes };
  delete attributes.TOPOLOGY_EDIT_LENGTH_AUTHORITY;
  const badEntity = { ...entity, properties: { ...entity.properties, attributes } };
  const badDataset = {
    ...dataset,
    entities: dataset.entities.map((row) => row.entityId === badEntity.entityId ? badEntity : row),
  };
  assert.throws(() => prepareTopologyEditStagedJsonWriteback({
    dataset: badDataset,
    baseCanonicalTopology: canonical,
    canonicalTopology: edited,
  }), /not explicitly writable/u);
});
