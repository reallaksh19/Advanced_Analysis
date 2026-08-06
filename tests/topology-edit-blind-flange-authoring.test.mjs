import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import {
  activateTopologyEditAuthoringTool,
  createTopologyEditAuthoringSession,
  setTopologyEditAuthoringTarget,
  updateTopologyEditAuthoringProperties,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-session.js';
import {
  deriveTopologyEditBlindFlangeTarget,
  planTopologyEditBlindFlangeAuthoringOperation,
  topologyEditBlindFlangeCatalogueOptions,
  topologyEditBlindFlangeDefaultProperties,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-blind-flange.js';
import {
  topologyEditInlineAuthoringCatalogueOptions,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-inline-component.js';
import {
  prepareTopologyEditAuthoringCandidate,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-composite-operation.js';
import {
  createTopologyEditOperationPlan,
} from '../src/workspace/topology-edit/professional/topology-edit-operation-plan.js';
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

function terminalTopology({
  extraEdge = false,
  support = false,
} = {}) {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: `blind-flange-${extraEdge}-${support}`,
    datasetVersion: 1,
    sourceHash: `source:blind-flange-${extraEdge}-${support}`,
    topologyGraphHash: `graph:blind-flange-${extraEdge}-${support}`,
    nodes: [
      { id: 'node:from', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:to', position: { x: 1000, y: 0, z: 0 }, portKeys: [] },
      ...(extraEdge
        ? [{ id: 'node:branch', position: { x: 1000, y: 500, z: 0 }, portKeys: [] }]
        : []),
    ],
    edges: [
      {
        id: 'edge:host',
        componentKey: 'P-DN50',
        fromNodeId: 'node:from',
        toNodeId: 'node:to',
        diameterMm: 50,
        outsideDiameterMm: 60.3,
        diameterAuthority: 'OUTSIDE_DIAMETER',
        entityType: 'PIPE',
        sourcePath: '/host',
        pipingClass: 'DEMO-150',
      },
      ...(extraEdge
        ? [{
          id: 'edge:branch',
          componentKey: 'P-BRANCH',
          fromNodeId: 'node:to',
          toNodeId: 'node:branch',
          diameterMm: 50,
          outsideDiameterMm: 60.3,
          diameterAuthority: 'OUTSIDE_DIAMETER',
          entityType: 'PIPE',
          sourcePath: '/branch',
          pipingClass: 'DEMO-150',
        }]
        : []),
    ],
    junctions: [],
    supports: support ? [{
      id: 'support:terminal',
      entityId: 'S-TERMINAL',
      nodeId: 'node:to',
      edgeId: null,
      resolved: true,
      restraint: null,
    }] : [],
    boundaries: [],
    rigids: [],
    bends: [],
  });
}

function authoringSession(topology, catalogueValue, nodeId) {
  let session = createTopologyEditAuthoringSession();
  session = activateTopologyEditAuthoringTool(session, 'BLIND_FLANGE');
  session = setTopologyEditAuthoringTarget(session, deriveTopologyEditBlindFlangeTarget({
    topology,
    nodeId,
  }));
  const defaults = topologyEditBlindFlangeDefaultProperties({
    topology,
    authoringSession: session,
    catalogue: catalogueValue,
  });
  session = updateTopologyEditAuthoringProperties(session, {
    catalogueRecordId: defaults.catalogueRecordId,
  }, 'USER_INPUT');
  session = updateTopologyEditAuthoringProperties(session, {
    nominalSizeMm: defaults.nominalSizeMm,
    pressureClass: defaults.pressureClass,
    facing: defaults.facing,
    thicknessMm: defaults.thicknessMm,
    componentMassKg: defaults.componentMassKg,
  }, 'CATALOGUE');
  return session;
}

function insertedBlindFlange(topology) {
  const rows = topology.edges.filter((edge) => (
    edge.topologyOperation === 'INSERT_INLINE_COMPONENT'
    && edge.entityType === 'FLANGE'
    && edge.flangeType === 'BLIND'
  ));
  assert.equal(rows.length, 1);
  return rows[0];
}

for (const endpoint of [
  {
    nodeId: 'node:from',
    placement: 'FROM_BOUNDARY',
    direction: 'TO_FROM',
    closedField: 'endConnectionFrom',
    pipeField: 'endConnectionTo',
  },
  {
    nodeId: 'node:to',
    placement: 'TO_BOUNDARY',
    direction: 'FROM_TO',
    closedField: 'endConnectionTo',
    pipeField: 'endConnectionFrom',
  },
]) {
  test(`Blind flange authors exact ${endpoint.placement} terminal topology`, async () => {
    const catalogueValue = await catalogue();
    const topology = terminalTopology();
    const session = authoringSession(topology, catalogueValue, endpoint.nodeId);
    const options = topologyEditBlindFlangeCatalogueOptions({
      topology,
      authoringSession: session,
      catalogue: catalogueValue,
    });
    assert.deepEqual(options.map((row) => row.recordId), [
      'BLIND-FLANGE-DN50-150-RF-A',
    ]);

    const plan = planTopologyEditBlindFlangeAuthoringOperation({
      topology,
      authoringSession: session,
      catalogue: catalogueValue,
    });
    assert.equal(plan.parameters.authoringTool, 'BLIND_FLANGE');
    assert.equal(plan.parameters.terminalNodeId, endpoint.nodeId);
    assert.equal(plan.parameters.terminalPlacement, endpoint.placement);
    assert.equal(plan.parameters.terminalDirection, endpoint.direction);
    assert.equal(plan.commandIntents.length, 1);
    assert.equal(plan.commandIntents[0].commandType, 'INSERT_INLINE_COMPONENT');
    assert.equal(plan.commandIntents[0].payload.placement, endpoint.placement);
    assert.equal(plan.commandIntents[0].payload.direction, endpoint.direction);
    assert.equal(plan.commandIntents[0].payload.insertionLengthMm, 24);
    assert.equal(
      plan.commandIntents[0].payload.catalogueBinding.recordId,
      'BLIND-FLANGE-DN50-150-RF-A',
    );

    const certified = new TopologyEditCertifiedSession(topology);
    const candidate = await prepareTopologyEditAuthoringCandidate({
      session: certified,
      operationPlan: plan,
    });
    assert.equal(candidate.commandCount, 1);
    assert.equal(candidate.canonicalTopology.nodes.length, 3);
    assert.equal(candidate.canonicalTopology.edges.length, 2);
    const blind = insertedBlindFlange(candidate.canonicalTopology);
    assert.equal(blind.inlinePlacement, endpoint.placement);
    assert.equal(blind.insertionDirection, endpoint.direction);
    assert.equal(blind.componentLengthMm, 24);
    assert.equal(blind.componentMassKg, 5.6);
    assert.equal(blind.flangeThicknessMm, 24);
    assert.equal(blind.flangeOutsideDiameterMm, 165);
    assert.equal(blind.boltCircleDiameterMm, 127);
    assert.equal(blind.boltHoleCount, 4);
    assert.equal(blind.boltHoleDiameterMm, 19.05);
    assert.equal(blind.catalogueHash, catalogueValue.catalogueHash);
    assert.equal(blind.catalogueRecordId, 'BLIND-FLANGE-DN50-150-RF-A');
    assert.equal(blind[endpoint.closedField], 'CLOSED_RF');
    assert.equal(blind[endpoint.pipeField], 'PIPE_TERMINAL');

    const terminalIncident = candidate.canonicalTopology.edges.filter((edge) => (
      edge.fromNodeId === endpoint.nodeId || edge.toNodeId === endpoint.nodeId
    ));
    assert.deepEqual(terminalIncident.map((edge) => edge.id), [blind.id]);
    const retainedPipe = candidate.canonicalTopology.edges.find((edge) => edge.id !== blind.id);
    assert.ok(retainedPipe);
    const retainedFrom = candidate.canonicalTopology.nodes.find((node) => (
      node.id === retainedPipe.fromNodeId
    ));
    const retainedTo = candidate.canonicalTopology.nodes.find((node) => (
      node.id === retainedPipe.toNodeId
    ));
    assert.ok(Math.hypot(
      retainedTo.position.x - retainedFrom.position.x,
      retainedTo.position.y - retainedFrom.position.y,
      retainedTo.position.z - retainedFrom.position.z,
    ) > 0);

    const transition = certified.execute(
      plan.commandIntents[0].commandType,
      plan.commandIntents[0].payload,
    );
    assert.equal(transition.disposition, 'ACCEPTED');
    const appliedHash = certified.currentTopology().canonicalTopologyHash;
    certified.undo();
    assert.equal(certified.currentTopology().canonicalTopologyHash, topology.canonicalTopologyHash);
    certified.redo();
    assert.equal(certified.currentTopology().canonicalTopologyHash, appliedHash);
  });
}

test('Ordinary flange authoring never offers terminal blind records', async () => {
  const catalogueValue = await catalogue();
  const topology = terminalTopology();
  let session = createTopologyEditAuthoringSession();
  session = activateTopologyEditAuthoringTool(session, 'FLANGE');
  session = setTopologyEditAuthoringTarget(session, {
    kind: 'straight-edge',
    canonicalIds: ['edge:host'],
    stationMm: 500,
    position: { x: 500, y: 0, z: 0 },
    direction: { x: 1, y: 0, z: 0 },
    targetHash: 'target:inline-dn50',
  });
  const options = topologyEditInlineAuthoringCatalogueOptions({
    topology,
    authoringSession: session,
    catalogue: catalogueValue,
  });
  assert.equal(options.some((row) => row.recordId === 'BLIND-FLANGE-DN50-150-RF-A'), false);
});

test('Blind flange target derivation rejects non-open and dependent terminal nodes', async () => {
  assert.throws(() => deriveTopologyEditBlindFlangeTarget({
    topology: terminalTopology({ extraEdge: true }),
    nodeId: 'node:to',
  }), /graph-open endpoint/i);
  assert.throws(() => deriveTopologyEditBlindFlangeTarget({
    topology: terminalTopology({ support: true }),
    nodeId: 'node:to',
  }), /dependent supports/i);
});

test('Final-state certification rejects interior and reversed blind flange payloads', async () => {
  const catalogueValue = await catalogue();
  const topology = terminalTopology();
  const session = authoringSession(topology, catalogueValue, 'node:to');
  const valid = planTopologyEditBlindFlangeAuthoringOperation({
    topology,
    authoringSession: session,
    catalogue: catalogueValue,
  });
  const payload = valid.commandIntents[0].payload;

  const interior = createTopologyEditOperationPlan({
    operationType: 'INSERT_INLINE_COMPONENT',
    basisHash: topology.canonicalTopologyHash,
    targetIds: ['edge:host'],
    parameters: { authoringTool: 'BLIND_FLANGE', deliberateTamper: 'INTERIOR' },
    commandIntents: [{
      commandType: 'INSERT_INLINE_COMPONENT',
      payload: {
        ...payload,
        placement: 'INTERIOR',
        direction: 'FROM_TO',
        centerFraction: 0.5,
      },
    }],
    changedScope: valid.changedScope,
    unresolvedEvidence: [],
  });
  await assert.rejects(() => prepareTopologyEditAuthoringCandidate({
    session: new TopologyEditCertifiedSession(topology),
    operationPlan: interior,
  }), /INSERT_BLIND_FLANGE_TERMINAL_INVALID|rejected during authoring candidate/i);

  const reversed = createTopologyEditOperationPlan({
    operationType: 'INSERT_INLINE_COMPONENT',
    basisHash: topology.canonicalTopologyHash,
    targetIds: ['node:to', 'edge:host'],
    parameters: { authoringTool: 'BLIND_FLANGE', deliberateTamper: 'DIRECTION' },
    commandIntents: [{
      commandType: 'INSERT_INLINE_COMPONENT',
      payload: { ...payload, direction: 'TO_FROM' },
    }],
    changedScope: valid.changedScope,
    unresolvedEvidence: [],
  });
  await assert.rejects(() => prepareTopologyEditAuthoringCandidate({
    session: new TopologyEditCertifiedSession(topology),
    operationPlan: reversed,
  }), /INSERT_BLIND_FLANGE_TERMINAL_INVALID|rejected during authoring candidate/i);
});

test('Changed governed blind flange evidence cannot plan', async () => {
  const catalogueValue = await catalogue();
  const topology = terminalTopology();
  const initial = authoringSession(topology, catalogueValue, 'node:to');
  const changed = updateTopologyEditAuthoringProperties(initial, {
    thicknessMm: 25,
  }, 'CATALOGUE');
  assert.throws(() => planTopologyEditBlindFlangeAuthoringOperation({
    topology,
    authoringSession: changed,
    catalogue: catalogueValue,
  }), /must equal exact blind flange catalogue evidence/i);
});
