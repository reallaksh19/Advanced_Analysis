import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  deriveTopologyEditComponentHudContext,
} from '../src/workspace/topology-edit/professional/topology-edit-component-hud-context.js';
import {
  createTopologyEditSpecificationCatalogue,
} from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';

const CATALOGUE_URL = new URL(
  '../public/fixtures/topology-edit-professional-spec-catalog.json',
  import.meta.url,
);
const DEMO_URL = new URL(
  '../public/fixtures/topology-edit-20-element-demo.staged.json',
  import.meta.url,
);

async function fixtures() {
  const catalogueRaw = JSON.parse(await readFile(CATALOGUE_URL, 'utf8'));
  const demo = JSON.parse(await readFile(DEMO_URL, 'utf8'));
  const scenario = demo.demo.embeddedScenarios.find(
    (row) => row.id === 'XYZ-10-COMPONENT-BRANCH',
  );
  return {
    catalogueRaw,
    catalogue: createTopologyEditSpecificationCatalogue(catalogueRaw),
    scenario,
  };
}

function sourceObject(scenario, id) {
  const row = scenario.objects.find((object) => object.id === id);
  assert.ok(row, `expected XYZ source object ${id}`);
  return row;
}

function contextFor(source, catalogue) {
  const attributes = source.attributes ?? {};
  const type = String(source.type).toUpperCase();
  const nominal = Number(
    attributes.START_NOMINAL_BORE_MM
      ?? attributes.NOMINAL_BORE_MM
      ?? source.nativeParams?.bore,
  );
  const outside = Number(
    attributes.START_OUTSIDE_DIAMETER
      ?? attributes.OUTSIDE_DIAMETER_MM
      ?? source.nativeParams?.outerDiameter,
  );
  const edge = {
    id: `edge:${source.id}`,
    componentKey: source.id,
    entityType: type,
    fromNodeId: 'node:from',
    toNodeId: 'node:to',
    diameterMm: nominal,
    outsideDiameterMm: outside,
    pipingClass: attributes.PIPING_CLASS,
  };
  return deriveTopologyEditComponentHudContext({
    topology: {
      canonicalTopologyHash: `canonical:${source.id}`,
      edges: [edge],
    },
    selection: { nodeIds: [], edgeId: edge.id },
    catalogue,
    workspaceDataset: {
      entities: [{
        entityId: source.id,
        properties: {
          sourceAttributes: attributes,
          nativeParams: source.nativeParams,
        },
      }],
    },
  });
}

test('XYZ DN25 gate valve resolves one deterministic exact catalogue record', async () => {
  const { catalogue, scenario } = await fixtures();
  const valve = sourceObject(scenario, 'V-002');
  const context = contextFor(valve, catalogue);

  assert.equal(valve.attributes.NOMINAL_BORE_MM, 25);
  assert.equal(valve.attributes.OUTSIDE_DIAMETER_MM, 33.4);
  assert.equal(valve.attributes.VALVE_TYPE, 'GATE');
  assert.equal(valve.attributes.LENGTH_MM, 300);
  assert.equal(context.status, 'RESOLVED');
  assert.equal(context.recommendedRecordId, 'VALVE-DN25-GATE-150-XYZ-A');
});

test('XYZ DN50 to DN25 reducer resolves exact directional source evidence', async () => {
  const { catalogue, scenario } = await fixtures();
  const reducer = sourceObject(scenario, 'R-002');
  const context = contextFor(reducer, catalogue);

  assert.equal(reducer.attributes.START_NOMINAL_BORE_MM, 50);
  assert.equal(reducer.attributes.END_NOMINAL_BORE_MM, 25);
  assert.equal(reducer.attributes.REDUCER_TYPE, 'CONCENTRIC');
  assert.equal(context.status, 'RESOLVED');
  assert.equal(context.recommendedRecordId, 'REDUCER-DN50-DN25-CONC-XYZ-A');
});

test('intentional one-field catalogue mismatch fails closed as INCOMPATIBLE', async () => {
  const { catalogueRaw, scenario } = await fixtures();
  const valve = sourceObject(scenario, 'V-002');
  const changed = structuredClone(catalogueRaw);
  const record = changed.records.find(
    (row) => row.recordId === 'VALVE-DN25-GATE-150-XYZ-A',
  );
  record.componentLengthMm = 301;
  record.valveFaceToFaceMm = 301;
  const mismatchCatalogue = createTopologyEditSpecificationCatalogue(changed);
  const context = contextFor(valve, mismatchCatalogue);

  assert.equal(context.status, 'INCOMPATIBLE');
  assert.equal(context.recommendedRecordId, null);
  assert.equal(context.exactCandidateCount, 0);
});

test('XYZ flange source is not fitted to an invented DN25 catalogue record', async () => {
  const { catalogue, scenario } = await fixtures();
  const flange = sourceObject(scenario, 'F-002');
  const context = contextFor(flange, catalogue);

  assert.equal(flange.attributes.RATING_CLASS, 150);
  assert.equal(Object.hasOwn(flange.attributes, 'FLANGE_FACING'), false);
  assert.equal(
    catalogue.records.some((row) => row.componentType === 'FLANGE' && row.nominalSizeMm === 25),
    false,
  );
  assert.equal(context.status, 'INCOMPATIBLE');
});
