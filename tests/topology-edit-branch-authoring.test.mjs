import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { checkCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-checker.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import {
  activateTopologyEditAuthoringTool,
  createTopologyEditAuthoringSession,
  setTopologyEditAuthoringTarget,
  updateTopologyEditAuthoringProperties,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-session.js';
import {
  createTopologyEditAuthoringOperationPlan,
  deriveTopologyEditAuthoringTarget,
  topologyEditAuthoringDefaultProperties,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-operation-planner.js';
import {
  topologyEditBranchAuthoringCatalogueOptions,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-branch.js';
import {
  createTopologyEditAuthoringValidationReceipt,
  executeTopologyEditAuthoringTransaction,
  prepareTopologyEditAuthoringCandidate,
  redoTopologyEditAuthoringTransaction,
  undoTopologyEditAuthoringTransaction,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-composite-operation.js';
import { runTopologyEditIncrementalValidation } from '../src/workspace/topology-edit/professional/topology-edit-incremental-validation.js';
import { createTopologyEditSpecificationCatalogue } from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';

const catalogue = createTopologyEditSpecificationCatalogue(JSON.parse(readFileSync(
  new URL('../public/fixtures/topology-edit-professional-spec-catalog.json', import.meta.url),
  'utf8',
)));

function baseTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'branch-authoring', datasetVersion: 1,
    sourceHash: 'source:branch-authoring',
    topologyGraphHash: 'graph:branch-authoring',
    nodes: [
      { id: 'node:start', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:end', position: { x: 1000, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [{
      id: 'edge:host', componentKey: 'P-BRANCH-HOST',
      fromNodeId: 'node:start', toNodeId: 'node:end',
      diameterMm: 100, outsideDiameterMm: 114.3,
      entityType: 'PIPE', sourcePath: '$[0]', pipingClass: 'DEMO-150',
    }],
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}

function authoringContext(recordId = 'TEE-DN100-DN50-BW-A') {
  const topology = baseTopology();
  let authoring = createTopologyEditAuthoringSession();
  authoring = activateTopologyEditAuthoringTool(authoring, 'BRANCH');
  authoring = setTopologyEditAuthoringTarget(authoring, deriveTopologyEditAuthoringTarget({
    topology, tool: 'BRANCH', edgeId: 'edge:host',
  }));
  const defaults = topologyEditAuthoringDefaultProperties({
    topology,
    authoringSession: authoring,
    catalogue,
    catalogueRecordId: recordId,
    stationMm: 500,
    clockingDeg: 90,
    branchPipeLengthMm: 400,
  });
  const userKeys = new Set([
    'stationMm', 'catalogueRecordId', 'clockingDeg', 'branchPipeLengthMm',
  ]);
  const derivedKeys = new Set(['totalBranchReachMm']);
  const user = {};
  const catalogueValues = {};
  const derived = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (userKeys.has(key)) user[key] = value;
    else if (derivedKeys.has(key)) derived[key] = value;
    else catalogueValues[key] = value;
  }
  authoring = updateTopologyEditAuthoringProperties(authoring, user, 'USER_INPUT');
  authoring = updateTopologyEditAuthoringProperties(
    authoring,
    catalogueValues,
    'CATALOGUE',
  );
  authoring = updateTopologyEditAuthoringProperties(authoring, derived, 'DERIVED');
  return { topology, authoring, defaults };
}

function edgeLength(topology, edge) {
  const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
  const from = nodes.get(edge.fromNodeId).position;
  const to = nodes.get(edge.toNodeId).position;
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}

test('branch HUD options preserve exact Tee and Olet catalogue alternatives', () => {
  const { topology, authoring } = authoringContext();
  const options = topologyEditBranchAuthoringCatalogueOptions({
    topology, authoringSession: authoring, catalogue,
  });
  assert.deepEqual(options.map((row) => row.recordId), [
    'OLET-DN100-DN25-WELDOLET-A',
    'TEE-DN100-DN50-BW-A',
  ]);
  assert.equal(options[0].componentLengthMm, 44);
  assert.equal(options[1].componentLengthMm, 64);
});

test('branch plan materializes one catalogue-bound degree-three command candidate', async () => {
  const { topology, authoring, defaults } = authoringContext();
  const plan = createTopologyEditAuthoringOperationPlan({
    topology, authoringSession: authoring, catalogue,
  });
  assert.equal(plan.operationType, 'INSERT_BRANCH_COMPONENT');
  assert.equal(plan.parameters.authoringTool, 'BRANCH');
  assert.equal(plan.commandIntents.length, 1);
  assert.equal(plan.commandIntents[0].commandType, 'INSERT_BRANCH_COMPONENT');
  assert.equal(plan.commandIntents[0].payload.catalogueRecordId, defaults.catalogueRecordId);

  const session = new TopologyEditCertifiedSession(topology);
  const candidate = await prepareTopologyEditAuthoringCandidate({ session, operationPlan: plan });
  assert.equal(candidate.commandCount, 1);
  assert.equal(session.journal.activeCommandIds.length, 0);
  assert.equal(candidate.canonicalTopology.nodes.length, topology.nodes.length + 3);
  assert.equal(candidate.canonicalTopology.edges.length, topology.edges.length + 3);
  assert.equal(candidate.canonicalTopology.junctions.length, 1);
  const component = candidate.canonicalTopology.edges.find((edge) => (
    edge.branchComponentRole === 'BRANCH_COMPONENT'
  ));
  assert.ok(component);
  assert.equal(component.entityType, 'TEE');
  assert.equal(component.catalogueRecordId, 'TEE-DN100-DN50-BW-A');
  assert.equal(component.catalogueRecordHash, plan.parameters.catalogueRecordHash);
  assert.equal(component.catalogueSourceHash, catalogue.authority.sourceHash);
  const junction = candidate.canonicalTopology.junctions[0];
  const incident = candidate.canonicalTopology.edges.filter((edge) => (
    edge.fromNodeId === junction.nodeId || edge.toNodeId === junction.nodeId
  ));
  assert.equal(incident.length, 3);
  assert.equal(candidate.canonicalTopology.edges.every((edge) => (
    edgeLength(candidate.canonicalTopology, edge) > 1e-9
  )), true);
});

test('branch validates, applies, undoes, and redoes as one governed transaction', async () => {
  const { topology, authoring } = authoringContext('OLET-DN100-DN25-WELDOLET-A');
  const session = new TopologyEditCertifiedSession(topology);
  const plan = createTopologyEditAuthoringOperationPlan({
    topology, authoringSession: authoring, catalogue,
  });
  const candidate = await prepareTopologyEditAuthoringCandidate({ session, operationPlan: plan });
  let tick = 0;
  const workerReceipt = runTopologyEditIncrementalValidation({
    canonicalTopology: candidate.canonicalTopology,
    operationPlan: plan,
    previousDiagnostics: checkCanonicalTopology(topology),
    checker: checkCanonicalTopology,
    checkerOptions: {},
    performancePolicy: { fastPathBudgetMs: 16, warningBudgetMs: 100, hysteresisMs: 4 },
    now: () => tick++,
  });
  const validation = createTopologyEditAuthoringValidationReceipt({ candidate, workerReceipt });
  assert.equal(validation.status, 'READY_TO_APPLY');
  assert.equal(validation.blockingIssueCount, 0);
  const receipt = await executeTopologyEditAuthoringTransaction({
    session, operationPlan: plan, candidate, validationReceipt: validation,
  });
  assert.equal(receipt.commandCount, 1);
  assert.equal(session.journal.activeCommandIds.length, 1);
  assert.equal(session.currentTopology().canonicalTopologyHash, candidate.resultingCanonicalHash);
  undoTopologyEditAuthoringTransaction(session, receipt);
  assert.equal(session.currentTopology().canonicalTopologyHash, topology.canonicalTopologyHash);
  assert.equal(session.journal.activeCommandIds.length, 0);
  redoTopologyEditAuthoringTransaction(session, receipt);
  assert.equal(session.currentTopology().canonicalTopologyHash, candidate.resultingCanonicalHash);
  assert.deepEqual(session.journal.activeCommandIds, receipt.commandIds);
});

test('branch planning rejects changed catalogue and derived evidence', () => {
  const { topology, authoring: initial } = authoringContext();
  let authoring = updateTopologyEditAuthoringProperties(
    initial,
    { componentMassKg: 1 },
    'CATALOGUE',
  );
  assert.throws(() => createTopologyEditAuthoringOperationPlan({
    topology, authoringSession: authoring, catalogue,
  }), /must equal exact branch authoring evidence/u);
  authoring = updateTopologyEditAuthoringProperties(
    initial,
    { totalBranchReachMm: 1 },
    'DERIVED',
  );
  assert.throws(() => createTopologyEditAuthoringOperationPlan({
    topology, authoringSession: authoring, catalogue,
  }), /must equal exact branch authoring evidence/u);
});
