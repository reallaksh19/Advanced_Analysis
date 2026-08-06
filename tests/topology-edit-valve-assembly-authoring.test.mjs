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
  topologyEditValveAssemblyCatalogueOptions,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-valve-assembly.js';
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
    datasetId: 'valve-assembly-authoring', datasetVersion: 1,
    sourceHash: 'source:valve-assembly-authoring',
    topologyGraphHash: 'graph:valve-assembly-authoring',
    nodes: [
      { id: 'node:start', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:end', position: { x: 1600, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [{
      id: 'edge:host', componentKey: 'P-VALVE-ASSEMBLY',
      fromNodeId: 'node:start', toNodeId: 'node:end',
      diameterMm: 100, outsideDiameterMm: 114.3,
      entityType: 'PIPE', sourcePath: '$[0]', pipingClass: 'DEMO-600',
    }],
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}

function assemblyContext(overrides = {}) {
  const topology = baseTopology();
  let authoring = createTopologyEditAuthoringSession();
  authoring = activateTopologyEditAuthoringTool(authoring, 'VALVE_ASSEMBLY');
  authoring = setTopologyEditAuthoringTarget(authoring, deriveTopologyEditAuthoringTarget({
    topology, tool: 'VALVE_ASSEMBLY', edgeId: 'edge:host',
  }));
  const defaults = topologyEditAuthoringDefaultProperties({
    topology, authoringSession: authoring, catalogue, ...overrides,
  });
  const userKeys = new Set([
    'stationMm', 'valveRecordId', 'upstreamFlangeRecordId', 'downstreamFlangeRecordId',
  ]);
  const derivedKeys = new Set(['assemblyLengthMm', 'assemblyMassKg']);
  const user = {};
  const catalogueValues = {};
  const derived = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (userKeys.has(key)) user[key] = value;
    else if (derivedKeys.has(key)) derived[key] = value;
    else catalogueValues[key] = value;
  }
  authoring = updateTopologyEditAuthoringProperties(authoring, user, 'DERIVED');
  authoring = updateTopologyEditAuthoringProperties(authoring, catalogueValues, 'CATALOGUE');
  authoring = updateTopologyEditAuthoringProperties(authoring, derived, 'DERIVED');
  return { topology, authoring, defaults };
}

function length(topology, edge) {
  const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
  const from = nodes.get(edge.fromNodeId).position;
  const to = nodes.get(edge.toNodeId).position;
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}

test('Valve assembly derives exact compatible catalogue combinations and governed totals', () => {
  const { topology, authoring, defaults } = assemblyContext();
  const options = topologyEditValveAssemblyCatalogueOptions({
    topology, authoringSession: authoring, catalogue,
  });
  assert.deepEqual(options.valveOptions.map((row) => row.recordId), [
    'VALVE-DN100-GATE-600-A',
  ]);
  assert.deepEqual(options.upstreamFlangeOptions.map((row) => row.recordId), [
    'FLANGE-DN100-600-RF-A', 'FLANGE-DN100-600-RF-B',
  ]);
  assert.equal(defaults.valveRecordId, 'VALVE-DN100-GATE-600-A');
  assert.equal(defaults.upstreamFlangeRecordId, 'FLANGE-DN100-600-RF-A');
  assert.equal(defaults.downstreamFlangeRecordId, 'FLANGE-DN100-600-RF-B');
  assert.equal(defaults.assemblyLengthMm, 840);
  assert.equal(defaults.assemblyMassKg, 207);
  assert.equal(defaults.faceToFaceMm, 600);
});

test('Valve assembly materializes three face-mated catalogue components with one assembly authority', async () => {
  const { topology, authoring } = assemblyContext();
  const plan = createTopologyEditAuthoringOperationPlan({
    topology, authoringSession: authoring, catalogue,
  });
  assert.equal(plan.parameters.authoringTool, 'VALVE_ASSEMBLY');
  assert.equal(plan.parameters.assemblyLengthMm, 840);
  assert.equal(plan.parameters.assemblyMassKg, 207);
  assert.equal(plan.commandIntents.length, 3);
  assert.deepEqual(plan.commandIntents.map((row) => row.commandType), [
    'INSERT_INLINE_COMPONENT', 'INSERT_INLINE_COMPONENT', 'INSERT_INLINE_COMPONENT',
  ]);
  assert.deepEqual(plan.commandIntents.map((row) => row.payload.placement), [
    'INTERIOR', 'TO_BOUNDARY', 'FROM_BOUNDARY',
  ]);
  assert.equal(plan.commandIntents[1].payload.edgeId.stepId, 'step-1');
  assert.equal(plan.commandIntents[1].payload.edgeId.role, 'inline-left-edge');
  assert.equal(plan.commandIntents[2].payload.edgeId.role, 'inline-right-edge');

  const session = new TopologyEditCertifiedSession(topology);
  const candidate = await prepareTopologyEditAuthoringCandidate({ session, operationPlan: plan });
  assert.equal(candidate.certificationMode, 'FINAL_STATE');
  assert.equal(candidate.commandCount, 3);
  assert.equal(session.journal.activeCommandIds.length, 0);
  assert.equal(candidate.canonicalTopology.nodes.length, topology.nodes.length + 4);
  assert.equal(candidate.canonicalTopology.edges.length, topology.edges.length + 4);

  const components = candidate.canonicalTopology.edges.filter((edge) => edge.assemblyId);
  assert.equal(components.length, 3);
  const byRole = new Map(components.map((edge) => [edge.assemblyRole, edge]));
  const upstream = byRole.get('UPSTREAM_FLANGE');
  const valve = byRole.get('VALVE');
  const downstream = byRole.get('DOWNSTREAM_FLANGE');
  assert.ok(upstream && valve && downstream);
  assert.equal(upstream.toNodeId, valve.fromNodeId);
  assert.equal(downstream.fromNodeId, valve.toNodeId);
  assert.equal(upstream.inlinePlacement, 'TO_BOUNDARY');
  assert.equal(valve.inlinePlacement, 'INTERIOR');
  assert.equal(downstream.inlinePlacement, 'FROM_BOUNDARY');
  assert.equal(new Set(components.map((edge) => edge.assemblyId)).size, 1);
  assert.equal(new Set(components.map((edge) => edge.assemblyHash)).size, 1);
  assert.equal(components.every((edge) => edge.assemblyLengthMm === 840), true);
  assert.equal(components.every((edge) => edge.assemblyMassKg === 207), true);
  assert.equal(candidate.canonicalTopology.edges.every((edge) => length(candidate.canonicalTopology, edge) > 1e-9), true);
});

test('Valve assembly validates, applies, undoes, and redoes as one exact three-command group', async () => {
  const { topology, authoring } = assemblyContext();
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
  assert.equal(receipt.commandCount, 3);
  assert.equal(session.journal.activeCommandIds.length, 3);
  assert.equal(session.currentTopology().canonicalTopologyHash, candidate.resultingCanonicalHash);
  undoTopologyEditAuthoringTransaction(session, receipt);
  assert.equal(session.currentTopology().canonicalTopologyHash, topology.canonicalTopologyHash);
  assert.equal(session.journal.activeCommandIds.length, 0);
  redoTopologyEditAuthoringTransaction(session, receipt);
  assert.equal(session.currentTopology().canonicalTopologyHash, candidate.resultingCanonicalHash);
  assert.deepEqual(session.journal.activeCommandIds, receipt.commandIds);
});

test('Valve assembly rejects changed catalogue or derived evidence', () => {
  const { topology, authoring: initial } = assemblyContext();
  let authoring = updateTopologyEditAuthoringProperties(initial, { valveMassKg: 1 }, 'CATALOGUE');
  assert.throws(() => createTopologyEditAuthoringOperationPlan({
    topology, authoringSession: authoring, catalogue,
  }), /must equal exact assembly catalogue evidence/);
  authoring = updateTopologyEditAuthoringProperties(initial, { assemblyMassKg: 1 }, 'DERIVED');
  assert.throws(() => createTopologyEditAuthoringOperationPlan({
    topology, authoringSession: authoring, catalogue,
  }), /must equal exact assembly catalogue evidence/);
});
