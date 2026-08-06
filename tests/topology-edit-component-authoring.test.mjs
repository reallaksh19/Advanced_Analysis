import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
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
  topologyEditInlineAuthoringCatalogueOptions,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-inline-component.js';
import {
  createTopologyEditSpecificationCatalogue,
} from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';

const catalogue = createTopologyEditSpecificationCatalogue(JSON.parse(readFileSync(
  new URL('../public/fixtures/topology-edit-professional-spec-catalog.json', import.meta.url),
  'utf8',
)));

function topology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'component-authoring',
    datasetVersion: 1,
    sourceHash: 'source:component-authoring',
    topologyGraphHash: 'graph:component-authoring',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:b', position: { x: 1000, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:c', position: { x: 0, y: 1000, z: 0 }, portKeys: [] },
      { id: 'node:d', position: { x: 0, y: 2000, z: 0 }, portKeys: [] },
    ],
    edges: [
      {
        id: 'edge:dn100',
        componentKey: 'P-DN100',
        fromNodeId: 'node:a',
        toNodeId: 'node:b',
        diameterMm: 100,
        outsideDiameterMm: 114.3,
        entityType: 'PIPE',
        sourcePath: '$[0]',
      },
      {
        id: 'edge:dn50',
        componentKey: 'P-DN50',
        fromNodeId: 'node:c',
        toNodeId: 'node:d',
        diameterMm: 50,
        outsideDiameterMm: 60.3,
        entityType: 'PIPE',
        sourcePath: '$[1]',
      },
    ],
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}

function componentSession(tool, edgeId, overrides = {}) {
  const canonical = topology();
  let session = createTopologyEditAuthoringSession();
  session = activateTopologyEditAuthoringTool(session, tool);
  session = setTopologyEditAuthoringTarget(session, deriveTopologyEditAuthoringTarget({
    topology: canonical,
    tool,
    edgeId,
  }));
  const defaults = topologyEditAuthoringDefaultProperties({
    topology: canonical,
    authoringSession: session,
    catalogue,
    ...overrides,
  });
  const userKeys = new Set(tool === 'FLANGE'
    ? ['stationMm', 'catalogueRecordId']
    : ['stationMm', 'catalogueRecordId', 'inlineDirection']);
  const user = {};
  const governed = {};
  for (const [key, value] of Object.entries(defaults)) {
    (userKeys.has(key) ? user : governed)[key] = value;
  }
  session = updateTopologyEditAuthoringProperties(session, user, 'DERIVED');
  session = updateTopologyEditAuthoringProperties(session, governed, 'CATALOGUE');
  return { canonical, session };
}

test('Flange authoring exposes exact compatible catalogue choices and preserves selected record provenance', () => {
  const { canonical, session } = componentSession('FLANGE', 'edge:dn100', {
    catalogueRecordId: 'FLANGE-DN100-600-RF-B',
  });
  const options = topologyEditInlineAuthoringCatalogueOptions({
    topology: canonical,
    authoringSession: session,
    catalogue,
  });
  assert.deepEqual(options.map((row) => row.recordId), [
    'FLANGE-DN100-600-RF-A',
    'FLANGE-DN100-600-RF-B',
  ]);
  const plan = createTopologyEditAuthoringOperationPlan({
    topology: canonical,
    authoringSession: session,
    catalogue,
  });
  assert.equal(plan.parameters.authoringTool, 'FLANGE');
  assert.equal(plan.commandIntents.length, 1);
  assert.equal(plan.commandIntents[0].commandType, 'INSERT_INLINE_COMPONENT');
  assert.equal(plan.commandIntents[0].payload.lengthAuthority, 'CATALOGUE_COMPONENT_LENGTH');
  assert.equal(plan.commandIntents[0].payload.insertionLengthMm, 120);
  assert.equal(plan.commandIntents[0].payload.catalogueBinding.recordId, 'FLANGE-DN100-600-RF-B');
  assert.equal(plan.commandIntents[0].payload.catalogueBinding.flangeType, 'WELD_NECK');
  assert.equal(plan.commandIntents[0].payload.catalogueBinding.materialSpecification, 'ASTM A105');
});

test('Reducer authoring derives TO_FROM when a DN50 host matches the catalogue secondary end', () => {
  const { canonical, session } = componentSession('REDUCER', 'edge:dn50');
  assert.equal(session.properties.catalogueRecordId, 'REDUCER-DN100-DN50-CONC-A');
  assert.equal(session.properties.inlineDirection, 'TO_FROM');
  assert.equal(session.properties.fromNominalSizeMm, 50);
  assert.equal(session.properties.toNominalSizeMm, 100);
  const plan = createTopologyEditAuthoringOperationPlan({
    topology: canonical,
    authoringSession: session,
    catalogue,
  });
  assert.equal(plan.parameters.authoringTool, 'REDUCER');
  assert.equal(plan.commandIntents[0].payload.direction, 'TO_FROM');
  assert.equal(plan.commandIntents[0].payload.insertionLengthMm, 203);
  assert.equal(plan.commandIntents[0].payload.catalogueBinding.secondaryNominalSizeMm, 50);
  assert.equal(plan.commandIntents[0].payload.catalogueBinding.componentMassKg, 4.6);
});

test('Component authoring rejects catalogue evidence changed after derivation', () => {
  const { canonical, session: initial } = componentSession('FLANGE', 'edge:dn100');
  const session = updateTopologyEditAuthoringProperties(initial, {
    componentMassKg: 1,
  }, 'CATALOGUE');
  assert.throws(() => createTopologyEditAuthoringOperationPlan({
    topology: canonical,
    authoringSession: session,
    catalogue,
  }), /must equal exact catalogue record/);
});
