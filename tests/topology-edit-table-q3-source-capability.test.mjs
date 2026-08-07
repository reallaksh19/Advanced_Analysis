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
import { qualifyTopologyEditStagedJsonRoundTrip } from '../src/workspace/topology-edit/export/topology-edit-stagedjson-roundtrip.js';
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

test('certified Q3 M06 M10 engineering changes are blocked by geometry-only StagedJSON writeback', async () => {
  const { dataset, canonical, projection } = await imported();
  const session = new TopologyEditCertifiedSession(canonical);
  const sourceHash = dataset.sourceSnapshot.sourceSemanticHash;
  const sourceBefore = structuredClone(dataset.sourceSnapshot.sourcePackage);
  const batch = createTopologyEditTableBatch({ intents: q3Intents({ canonical, projection, session }) });
  const plan = planTopologyEditTableBatch({ batch, projection, canonicalTopology: canonical });
  const preview = await prepareTopologyEditTablePreview({ session, batchPlan: plan });
  const tableValidation = validateTopologyEditTablePreview({
    preview,
    workerReceipt: validationReceipt(canonical, preview, plan),
  });
  assert.equal(tableValidation.status, 'READY_TO_APPLY');
  await applyTopologyEditTableTransaction({ session, batchPlan: plan, preview, tableValidation });
  const edited = session.currentTopology();
  assert.notEqual(edited.canonicalTopologyHash, canonical.canonicalTopologyHash);
  assert.equal(edited.edges.find((row) => row.componentKey === 'V-M06').valveType, 'BALL');

  const input = { dataset, baseCanonicalTopology: canonical, canonicalTopology: edited };
  assert.throws(() => prepareTopologyEditStagedJsonWriteback(input), /outside the qualified geometry vocabulary/u);
  assert.throws(() => qualifyTopologyEditStagedJsonRoundTrip(input), /outside the qualified geometry vocabulary/u);

  assert.equal(dataset.sourceSnapshot.sourceSemanticHash, sourceHash);
  assert.equal(semanticHash(dataset.sourceSnapshot.sourcePackage), sourceHash);
  assert.deepEqual(dataset.sourceSnapshot.sourcePackage, sourceBefore);
  assert.equal(dataset.sourceSnapshot.sourcePackage.vendorTopLevel.opaqueToken, 'KEEP-Q3-OPAQUE');
  assert.equal(rowByComponent(projection, 'R-001').custody.catalogueAuthority, 'EXACT');
});
