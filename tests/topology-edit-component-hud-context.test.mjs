import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assertTopologyEditComponentHudContext,
  deriveTopologyEditComponentHudContext,
  topologyEditComponentHudCandidateRecords,
} from '../src/workspace/topology-edit/professional/topology-edit-component-hud-context.js';
import {
  createTopologyEditSpecificationCatalogue,
} from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';
import {
  renderTopologyEditProfessionalOperationPanel,
} from '../src/workspace/viewport-productivity/topology-edit-professional-operation-panel.js';

const CATALOGUE_URL = new URL(
  '../public/fixtures/topology-edit-professional-spec-catalog.json',
  import.meta.url,
);

async function catalogue() {
  return createTopologyEditSpecificationCatalogue(
    JSON.parse(await readFile(CATALOGUE_URL, 'utf8')),
  );
}

function topology(edge) {
  return {
    canonicalTopologyHash: 'sha256:component-hud-context',
    edges: [{
      componentKey: edge.id.replace(/^edge:/u, ''),
      fromNodeId: 'node:a',
      toNodeId: 'node:b',
      ...edge,
    }],
  };
}

function derive(edge, catalogueValue, workspaceDataset = null) {
  return deriveTopologyEditComponentHudContext({
    topology: topology(edge),
    selection: { nodeIds: [], edgeId: edge.id },
    catalogue: catalogueValue,
    workspaceDataset,
  });
}

function fieldKeys(context) {
  return context.fieldSchema.map((row) => row.key);
}

test('flange HUD filters to the exact family and fails closed on duplicate source records', async () => {
  const catalogueValue = await catalogue();
  const context = derive({
    id: 'edge:F-001',
    entityType: 'FLANGE',
    diameterMm: 100,
    outsideDiameterMm: 114.3,
  }, catalogueValue);

  assert.equal(context.status, 'AMBIGUOUS');
  assert.deepEqual(context.candidateRecordIds, [
    'FLANGE-DN100-600-RF-A',
    'FLANGE-DN100-600-RF-B',
  ]);
  assert.equal(context.recommendedRecordId, null);
  assert.ok(fieldKeys(context).includes('flangeClass'));
  assert.ok(fieldKeys(context).includes('flangeFacing'));
  assert.equal(fieldKeys(context).includes('valveType'), false);
  assert.equal(fieldKeys(context).includes('reducerOrientation'), false);
  assert.deepEqual(assertTopologyEditComponentHudContext(context), context);
  assert.deepEqual(
    topologyEditComponentHudCandidateRecords(context, catalogueValue)
      .map((record) => record.recordId),
    context.candidateRecordIds,
  );
});

test('valve HUD resolves one exact record and exposes only valve fields', async () => {
  const context = derive({
    id: 'edge:V-001',
    entityType: 'VALVE',
    diameterMm: 100,
    outsideDiameterMm: 114.3,
  }, await catalogue());

  assert.equal(context.status, 'RESOLVED');
  assert.equal(context.recommendedRecordId, 'VALVE-DN100-GATE-600-A');
  assert.deepEqual(
    fieldKeys(context).filter((key) => key.startsWith('valve')),
    ['valveType', 'valveFaceToFaceMm'],
  );
  assert.equal(fieldKeys(context).includes('flangeClass'), false);
  assert.equal(
    context.fieldSchema.find((row) => row.key === 'valveFaceToFaceMm')?.value,
    600,
  );
});

test('reducer HUD resolves directional reducer evidence without leaking flange or valve schema', async () => {
  const context = derive({
    id: 'edge:R-001',
    entityType: 'REDUCER',
    diameterMm: 150,
    outsideDiameterMm: 168.3,
  }, await catalogue());

  assert.equal(context.status, 'RESOLVED');
  assert.equal(context.recommendedRecordId, 'REDUCER-DN150-DN100-CONC-A');
  assert.deepEqual(
    fieldKeys(context).filter((key) => key.startsWith('reducer')),
    ['reducerType', 'reducerOrientation'],
  );
  assert.equal(
    context.fieldSchema.find((row) => row.key === 'secondaryNominalSizeMm')?.value,
    100,
  );
  assert.equal(fieldKeys(context).includes('flangeFacing'), false);
  assert.equal(fieldKeys(context).includes('valveType'), false);
});

test('reducer HUD uses explicit FROM and TO source evidence when generic geometry represents the small end', async () => {
  const context = derive({
    id: 'edge:R-001',
    entityType: 'REDUCER',
    diameterMm: 100,
    outsideDiameterMm: 114.3,
  }, await catalogue(), {
    entities: [{
      entityId: 'R-001',
      properties: {
        attributes: {
          START_NOMINAL_BORE_MM: 150,
          END_NOMINAL_BORE_MM: 100,
          START_OUTSIDE_DIAMETER: 168.3,
          END_OUTSIDE_DIAMETER: 114.3,
          REDUCER_TYPE: 'CONCENTRIC',
        },
      },
    }],
  });

  assert.equal(context.status, 'RESOLVED');
  assert.equal(context.recommendedRecordId, 'REDUCER-DN150-DN100-CONC-A');
  assert.deepEqual(context.sourceEvidence, {
    componentType: 'REDUCER',
    nominalSizeMm: 150,
    outsideDiameterMm: 168.3,
    pipingClass: null,
    endConnectionFrom: null,
    endConnectionTo: null,
    secondaryNominalSizeMm: 100,
    secondaryOutsideDiameterMm: 114.3,
    reducerType: 'CONCENTRIC',
    reducerOrientation: 'CONCENTRIC',
  });
  assert.equal(
    context.fieldSchema.find((row) => row.key === 'nominalSizeMm')?.source,
    'SOURCE_EVIDENCE',
  );
});

test('available but mismatched source evidence is incompatible rather than nearest-size substituted', async () => {
  const context = derive({
    id: 'edge:V-200',
    entityType: 'VALVE',
    diameterMm: 200,
    outsideDiameterMm: 219.1,
  }, await catalogue());

  assert.equal(context.status, 'INCOMPATIBLE');
  assert.deepEqual(context.candidateRecordIds, ['VALVE-DN100-GATE-600-A']);
  assert.equal(context.recommendedRecordId, null);
  assert.equal(context.exactCandidateCount, 0);
});

test('a selected edge removed by split or delete degrades to no selection without blocking the command', async () => {
  const context = deriveTopologyEditComponentHudContext({
    topology: {
      canonicalTopologyHash: 'sha256:after-command',
      edges: [],
    },
    selection: { nodeIds: [], edgeId: 'edge:P-001' },
    catalogue: await catalogue(),
  });

  assert.equal(context.status, 'NO_SELECTION');
  assert.equal(context.selectedCanonicalId, null);
  assert.deepEqual(context.candidateRecordIds, []);
  assert.equal(context.supported, false);
});

test('context authority is stable under catalogue record reordering', async () => {
  const leftCatalogue = await catalogue();
  const rightCatalogue = createTopologyEditSpecificationCatalogue({
    ...JSON.parse(await readFile(CATALOGUE_URL, 'utf8')),
    records: [...JSON.parse(await readFile(CATALOGUE_URL, 'utf8')).records].reverse(),
  });
  const edge = {
    id: 'edge:F-001',
    entityType: 'FLANGE',
    diameterMm: 100,
    outsideDiameterMm: 114.3,
  };
  assert.deepEqual(derive(edge, leftCatalogue), derive(edge, rightCatalogue));
});

test('panel renders a typed HUD and only filtered catalogue choices', async () => {
  const catalogueValue = await catalogue();
  const context = derive({
    id: 'edge:V-001',
    entityType: 'VALVE',
    diameterMm: 100,
    outsideDiameterMm: 114.3,
  }, catalogueValue);
  const element = { innerHTML: '' };
  renderTopologyEditProfessionalOperationPanel(element, {
    values: {
      operationType: 'EXTEND_EDGE',
      catalogueRecordId: context.recommendedRecordId,
    },
    catalogue: catalogueValue,
    componentContext: context,
  });

  assert.match(element.innerHTML, /data-role="topology-edit-component-hud"/u);
  assert.match(element.innerHTML, /data-component-type="VALVE"/u);
  assert.match(element.innerHTML, /data-field-key="valveType"/u);
  assert.match(element.innerHTML, /data-field-key="valveFaceToFaceMm"/u);
  assert.doesNotMatch(element.innerHTML, /data-field-key="flangeClass"/u);
  assert.match(element.innerHTML, /VALVE-DN100-GATE-600-A/u);
  assert.doesNotMatch(element.innerHTML, /FLANGE-DN100-600-RF-A/u);
});
