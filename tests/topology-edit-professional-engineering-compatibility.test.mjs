import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assertTopologyEditOperationPlanCatalogueReady,
  assertTopologyEditSpecificationCompatibility,
  bindTopologyEditCompatibilityToPlan,
  resolveTopologyEditSpecificationCompatibility,
} from '../src/workspace/topology-edit/professional/topology-edit-compatibility.js';
import {
  createTopologyEditSpecificationCatalogue,
} from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';
import {
  planReconnectOpenEndpoints,
} from '../src/workspace/topology-edit/professional/topology-edit-route-operations.js';

async function catalogueInput() {
  const url = new URL('./fixtures/topology-edit/professional/spec-compatibility.json', import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

function requestFrom(record, catalogueHash, targetIds = ['edge:test']) {
  return {
    ...record,
    expectedCatalogueHash: catalogueHash,
    targetIds,
  };
}

function reconnectTopology() {
  return {
    canonicalTopologyHash: 'fnv1a64:compat-reconnect',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:b', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:c', position: { x: 200, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:d', position: { x: 300, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [
      { id: 'edge:left', componentKey: 'P-L', fromNodeId: 'node:a', toNodeId: 'node:b' },
      { id: 'edge:right', componentKey: 'P-R', fromNodeId: 'node:c', toNodeId: 'node:d' },
    ],
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
    crosswalk: {
      nodeIdToPortKeys: {},
      edgeIdToComponentKey: { 'edge:left': 'P-L', 'edge:right': 'P-R' },
      junctionIdToComponentKey: {}, supportIdToEntityId: {},
    },
  };
}

test('exact lookup returns COMPATIBLE and remains reorder deterministic', async () => {
  const raw = await catalogueInput();
  const leftCatalogue = createTopologyEditSpecificationCatalogue(raw);
  const rightCatalogue = createTopologyEditSpecificationCatalogue({
    ...raw,
    records: [...raw.records].reverse(),
  });
  const pipe = leftCatalogue.records.find((record) => record.recordId === 'PIPE-DN100-SCH40-A');
  const left = resolveTopologyEditSpecificationCompatibility({
    catalogue: leftCatalogue,
    request: requestFrom(pipe, leftCatalogue.catalogueHash),
  });
  const right = resolveTopologyEditSpecificationCompatibility({
    catalogue: rightCatalogue,
    request: requestFrom(pipe, rightCatalogue.catalogueHash),
  });

  assert.deepEqual(left, right);
  assert.equal(left.status, 'COMPATIBLE');
  assert.equal(left.selectedRecordId, 'PIPE-DN100-SCH40-A');
  assert.equal(left.candidates.length, 1);
  assert.deepEqual(assertTopologyEditSpecificationCompatibility(left), left);
  assert.equal(Object.isFrozen(left), true);
  assert.equal(Object.isFrozen(left.candidates), true);
});

test('lookup distinguishes UNAVAILABLE, INCOMPATIBLE, and AMBIGUOUS without ranking', async () => {
  const catalogue = createTopologyEditSpecificationCatalogue(await catalogueInput());
  const pipe = catalogue.records.find((record) => record.recordId === 'PIPE-DN100-SCH40-A');
  const flange = catalogue.records.find((record) => record.recordId === 'FLANGE-DN100-600-RF-A');

  const unavailable = resolveTopologyEditSpecificationCompatibility({
    catalogue,
    request: requestFrom({
      ...pipe,
      nominalSizeMm: 80,
      outsideDiameterMm: 88.9,
    }, catalogue.catalogueHash),
  });
  const incompatible = resolveTopologyEditSpecificationCompatibility({
    catalogue,
    request: requestFrom({ ...pipe, outsideDiameterMm: 114.4 }, catalogue.catalogueHash),
  });
  const ambiguous = resolveTopologyEditSpecificationCompatibility({
    catalogue,
    request: requestFrom(flange, catalogue.catalogueHash),
  });

  assert.equal(unavailable.status, 'UNAVAILABLE');
  assert.equal(unavailable.candidates.length, 0);
  assert.equal(incompatible.status, 'INCOMPATIBLE');
  assert.deepEqual(incompatible.candidates[0].mismatchFields, ['outsideDiameterMm']);
  assert.equal(ambiguous.status, 'AMBIGUOUS');
  assert.deepEqual(ambiguous.candidates.map((row) => row.recordId), [
    'FLANGE-DN100-600-RF-A',
    'FLANGE-DN100-600-RF-B',
  ]);
  assert.equal(ambiguous.selectedRecordId, null);
});

test('lookup rejects stale catalogue authority and tampered results', async () => {
  const catalogue = createTopologyEditSpecificationCatalogue(await catalogueInput());
  const pipe = catalogue.records.find((record) => record.recordId === 'PIPE-DN100-SCH40-A');
  assert.throws(() => resolveTopologyEditSpecificationCompatibility({
    catalogue,
    request: requestFrom(pipe, 'fnv1a64:stale'),
  }), /stale catalogue/i);

  const result = resolveTopologyEditSpecificationCompatibility({
    catalogue,
    request: requestFrom(pipe, catalogue.catalogueHash),
  });
  assert.throws(() => assertTopologyEditSpecificationCompatibility({
    ...result,
    selectedRecordId: 'PIPE-FABRICATED',
  }), /compatibility hash/i);
});

test('compatibility binding clears unresolved evidence only for exact compatible result', async () => {
  const catalogue = createTopologyEditSpecificationCatalogue(await catalogueInput());
  const pipe = catalogue.records.find((record) => record.recordId === 'PIPE-DN100-SCH40-A');
  const topology = reconnectTopology();
  const plan = planReconnectOpenEndpoints({
    topology,
    fromNodeId: 'node:b',
    toNodeId: 'node:c',
    diameterMm: 100,
    entityType: 'PIPE',
  });
  const result = resolveTopologyEditSpecificationCompatibility({
    catalogue,
    request: requestFrom(pipe, catalogue.catalogueHash, ['node:b', 'node:c']),
  });
  const bound = bindTopologyEditCompatibilityToPlan(plan, result);

  assert.equal(bound.parameters.catalogueCompatibility.status, 'COMPATIBLE');
  assert.equal(bound.parameters.catalogueCompatibility.selectedRecordId, 'PIPE-DN100-SCH40-A');
  assert.equal(bound.unresolvedEvidence.length, 0);
  assert.deepEqual(assertTopologyEditOperationPlanCatalogueReady(bound), bound);
});

test('ambiguous or incompatible binding blocks catalogue-ready acceptance', async () => {
  const catalogue = createTopologyEditSpecificationCatalogue(await catalogueInput());
  const flange = catalogue.records.find((record) => record.recordId === 'FLANGE-DN100-600-RF-A');
  const topology = reconnectTopology();
  const plan = planReconnectOpenEndpoints({
    topology,
    fromNodeId: 'node:b',
    toNodeId: 'node:c',
    diameterMm: 100,
    entityType: 'PIPE',
  });
  const ambiguous = resolveTopologyEditSpecificationCompatibility({
    catalogue,
    request: requestFrom(flange, catalogue.catalogueHash, ['node:b', 'node:c']),
  });
  const blocked = bindTopologyEditCompatibilityToPlan(plan, ambiguous);

  assert.equal(blocked.unresolvedEvidence[0].code, 'CATALOGUE_AMBIGUOUS');
  assert.throws(
    () => assertTopologyEditOperationPlanCatalogueReady(blocked),
    /blocked until catalogue compatibility is COMPATIBLE/i,
  );
  assert.throws(() => bindTopologyEditCompatibilityToPlan(plan, {
    ...ambiguous,
    query: { ...ambiguous.query, targetIds: ['edge:undeclared'] },
  }), /compatibility hash|absent from plan/i);
});
