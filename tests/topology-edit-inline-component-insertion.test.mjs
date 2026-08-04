import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import {
  runTopologyEditIncrementalValidation,
} from '../src/workspace/topology-edit/professional/topology-edit-incremental-validation.js';
import {
  prepareTopologyEditOperationCandidate,
} from '../src/workspace/topology-edit/professional/topology-edit-operation-candidate.js';
import {
  executeTopologyEditOperationTransaction,
  previewTopologyEditOperationTransaction,
  redoTopologyEditOperationTransaction,
  undoTopologyEditOperationTransaction,
} from '../src/workspace/topology-edit/professional/topology-edit-operation-transaction.js';
import {
  createTopologyEditProfessionalOperationPlan,
} from '../src/workspace/topology-edit/professional/topology-edit-professional-operation-session.js';
import {
  createTopologyEditSpecificationCatalogue,
} from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';

const CATALOGUE_URL = new URL(
  '../public/fixtures/topology-edit-professional-spec-catalog.json',
  import.meta.url,
);

async function catalogue() {
  return createTopologyEditSpecificationCatalogue(
    JSON.parse(await readFile(CATALOGUE_URL, 'utf8')),
  );
}

function baseTopology({
  nominalSizeMm = 100,
  outsideDiameterMm = 114.3,
  lengthMm = 3000,
  dependants = false,
} = {}) {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: `DS-INLINE-${nominalSizeMm}-${lengthMm}-${dependants}`,
    datasetVersion: 0,
    sourceHash: `source:inline-${nominalSizeMm}-${lengthMm}-${dependants}`,
    topologyGraphHash: `graph:inline-${nominalSizeMm}-${lengthMm}-${dependants}`,
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:b', position: { x: lengthMm, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [{
      id: 'edge:host',
      componentKey: 'P-HOST',
      fromNodeId: 'node:a',
      toNodeId: 'node:b',
      diameterMm: nominalSizeMm,
      outsideDiameterMm,
      diameterAuthority: 'OUTSIDE_DIAMETER',
      entityType: 'PIPE',
      sourcePath: '/host',
    }],
    junctions: [],
    supports: dependants ? [{
      id: 'support:host',
      entityId: 'S-HOST',
      nodeId: 'node:a',
      edgeId: 'edge:host',
      resolved: true,
      restraint: null,
    }] : [],
    boundaries: [],
    rigids: [],
    bends: [],
  });
}

function values(recordId, overrides = {}) {
  return {
    operationType: 'INSERT_INLINE_COMPONENT',
    edgeId: 'edge:host',
    centerDistanceMm: 1500,
    insertionLengthMm: '',
    inlineDirection: 'FROM_TO',
    catalogueRecordId: recordId,
    ...overrides,
  };
}

function operationPlan(topology, catalogueValue, recordId, overrides = {}) {
  return createTopologyEditProfessionalOperationPlan({
    topology,
    selection: { nodeIds: [], edgeId: 'edge:host' },
    catalogue: catalogueValue,
    values: values(recordId, overrides),
  });
}

function validation(candidate, plan) {
  return runTopologyEditIncrementalValidation({
    canonicalTopology: candidate.canonicalTopology,
    operationPlan: plan,
    previousDiagnostics: [],
    checker: () => [],
    performancePolicy: {
      fastPathBudgetMs: 16,
      warningBudgetMs: 100,
      hysteresisMs: 4,
    },
    now: clock([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6]),
  });
}

function insertedComponent(candidate) {
  const rows = candidate.canonicalTopology.edges.filter((edge) => (
    edge.topologyOperation === 'INSERT_INLINE_COMPONENT'
  ));
  assert.equal(rows.length, 1);
  return rows[0];
}

test('valve insertion uses exact catalogue face-to-face and one atomic governed command', async () => {
  const catalogueValue = await catalogue();
  const topology = baseTopology();
  const plan = operationPlan(topology, catalogueValue, 'VALVE-DN100-GATE-600-A');

  assert.equal(plan.operationType, 'INSERT_INLINE_COMPONENT');
  assert.equal(plan.unresolvedEvidence.length, 0);
  assert.equal(plan.commandIntents.length, 1);
  assert.equal(plan.parameters.insertionLengthMm, 600);
  assert.equal(plan.parameters.lengthAuthority, 'CATALOGUE_VALVE_FACE_TO_FACE');
  assert.equal(
    plan.parameters.catalogueCompatibility.selectionAuthority,
    'EXACT_RECORD_ID_AND_HASH',
  );

  const session = new TopologyEditCertifiedSession(topology);
  const candidate = prepareTopologyEditOperationCandidate({ session, operationPlan: plan });
  const valve = insertedComponent(candidate);
  assert.equal(candidate.commandCount, 1);
  assert.equal(candidate.canonicalTopology.nodes.length, 4);
  assert.equal(candidate.canonicalTopology.edges.length, 3);
  assert.equal(valve.entityType, 'VALVE');
  assert.equal(valve.componentLengthMm, 600);
  assert.equal(valve.valveFaceToFaceMm, 600);
  assert.equal(valve.catalogueRecordId, 'VALVE-DN100-GATE-600-A');
  assert.equal(valve.catalogueHash, catalogueValue.catalogueHash);
  assert.equal(valve.catalogueRecordHash, plan.parameters.catalogueRecordHash);

  const fromNode = candidate.canonicalTopology.nodes.find((node) => (
    node.id === valve.fromNodeId
  ));
  const toNode = candidate.canonicalTopology.nodes.find((node) => (
    node.id === valve.toNodeId
  ));
  assert.equal(fromNode.position.x, 1200);
  assert.equal(toNode.position.x, 1800);
});

test('duplicate flange catalogue rows remain selectable by exact record ID and hash', async () => {
  const catalogueValue = await catalogue();
  const plan = operationPlan(
    baseTopology(),
    catalogueValue,
    'FLANGE-DN100-600-RF-B',
    { insertionLengthMm: 120 },
  );
  const session = new TopologyEditCertifiedSession(baseTopology());
  const candidate = prepareTopologyEditOperationCandidate({ session, operationPlan: plan });
  const flange = insertedComponent(candidate);

  assert.equal(plan.unresolvedEvidence.length, 0);
  assert.equal(plan.parameters.catalogueRecordId, 'FLANGE-DN100-600-RF-B');
  assert.equal(flange.entityType, 'FLANGE');
  assert.equal(flange.componentLengthMm, 120);
  assert.equal(flange.flangeClass, '600');
  assert.equal(flange.flangeFacing, 'RF');
});

test('reducer insertion preserves directional primary and secondary diameters', async () => {
  const catalogueValue = await catalogue();
  const topology = baseTopology({ nominalSizeMm: 150, outsideDiameterMm: 168.3 });
  const plan = operationPlan(
    topology,
    catalogueValue,
    'REDUCER-DN150-DN100-CONC-A',
    { insertionLengthMm: 300, inlineDirection: 'FROM_TO' },
  );
  const candidate = prepareTopologyEditOperationCandidate({
    session: new TopologyEditCertifiedSession(topology),
    operationPlan: plan,
  });
  const reducer = insertedComponent(candidate);
  const left = candidate.canonicalTopology.edges.find((edge) => (
    edge.toNodeId === reducer.fromNodeId && edge.id !== reducer.id
  ));
  const right = candidate.canonicalTopology.edges.find((edge) => (
    edge.fromNodeId === reducer.toNodeId && edge.id !== reducer.id
  ));

  assert.equal(reducer.entityType, 'REDUCER');
  assert.equal(reducer.outsideDiameterMm, 168.3);
  assert.equal(reducer.secondaryOutsideDiameterMm, 114.3);
  assert.equal(reducer.reducerType, 'CONCENTRIC');
  assert.equal(left.outsideDiameterMm, 168.3);
  assert.equal(right.outsideDiameterMm, 114.3);
  assert.equal(left.componentKey, 'P-HOST');
  assert.equal(right.componentKey, null);
});

test('atomic apply and grouped undo redo reproduce exact inline insertion hashes', async () => {
  const catalogueValue = await catalogue();
  const session = new TopologyEditCertifiedSession(baseTopology());
  const plan = operationPlan(session.currentTopology(), catalogueValue, 'VALVE-DN100-GATE-600-A');
  const candidate = prepareTopologyEditOperationCandidate({ session, operationPlan: plan });
  const receipt = validation(candidate, plan);
  const preview = previewTopologyEditOperationTransaction({
    session,
    operationPlan: plan,
    candidate,
    validationReceipt: receipt,
  });
  const transaction = executeTopologyEditOperationTransaction({
    session,
    operationPlan: plan,
    candidate,
    validationReceipt: receipt,
    preview,
  });

  assert.equal(transaction.commandCount, 1);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.resultingCanonicalHash);
  assert.equal(insertedComponent({ canonicalTopology: session.currentTopology() }).entityType, 'VALVE');

  undoTopologyEditOperationTransaction(session, transaction);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.priorCanonicalHash);
  assert.equal(session.currentTopology().edges.length, 1);

  redoTopologyEditOperationTransaction(session, transaction);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.resultingCanonicalHash);
  assert.equal(insertedComponent({ canonicalTopology: session.currentTopology() }).entityType, 'VALVE');
});

test('insertion rejects host dependants, out-of-bounds placement, and valve length overrides', async () => {
  const catalogueValue = await catalogue();

  assert.throws(
    () => operationPlan(
      baseTopology(),
      catalogueValue,
      'VALVE-DN100-GATE-600-A',
      { centerDistanceMm: 200, insertionLengthMm: 600 },
    ),
    /fit strictly inside/i,
  );
  assert.throws(
    () => operationPlan(
      baseTopology(),
      catalogueValue,
      'VALVE-DN100-GATE-600-A',
      { insertionLengthMm: 500 },
    ),
    /face-to-face/i,
  );

  const dependentTopology = baseTopology({ dependants: true });
  assert.throws(
    () => operationPlan(
      dependentTopology,
      catalogueValue,
      'VALVE-DN100-GATE-600-A',
    ),
    /dependent supports record/i,
  );
});

test('stale or mutated catalogue bindings cannot certify', async () => {
  const catalogueValue = await catalogue();
  const topology = baseTopology();
  const plan = operationPlan(topology, catalogueValue, 'VALVE-DN100-GATE-600-A');
  const mutated = {
    ...plan,
    commandIntents: [{
      ...plan.commandIntents[0],
      payload: {
        ...plan.commandIntents[0].payload,
        catalogueBinding: {
          ...plan.commandIntents[0].payload.catalogueBinding,
          recordHash: 'sha256:mutated-record',
        },
      },
    }],
  };
  assert.throws(
    () => prepareTopologyEditOperationCandidate({
      session: new TopologyEditCertifiedSession(topology),
      operationPlan: mutated,
    }),
    /immutable normalized authority|plan differs/i,
  );
});

function clock(values) {
  let index = 0;
  return () => values[index++];
}
