import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assertTopologyEditSpecificationCatalogue,
  assertTopologyEditSpecificationRecord,
  createTopologyEditSpecificationCatalogue,
  createTopologyEditSpecificationRecord,
  topologyEditSpecificationRecordKey,
} from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';

async function rawFixture() {
  const url = new URL('./fixtures/topology-edit/professional/spec-compatibility.json', import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

test('catalogue is versioned, content-addressed, immutable, and reorder stable', async () => {
  const input = await rawFixture();
  const left = createTopologyEditSpecificationCatalogue(input);
  const right = createTopologyEditSpecificationCatalogue({
    ...input,
    records: [...input.records].reverse(),
  });

  assert.deepEqual(left, right);
  assert.equal(left.schema, 'TopologyEditSpecificationCatalogue.v1');
  assert.equal(left.catalogueVersion, '2026.08.02');
  assert.equal(left.records.length, 7);
  assert.equal(Object.isFrozen(left), true);
  assert.equal(Object.isFrozen(left.records), true);
  assert.equal(Object.isFrozen(left.records[0]), true);
  assert.deepEqual(assertTopologyEditSpecificationCatalogue(left), left);
});

test('catalogue records retain exact component-specific engineering evidence', async () => {
  const catalogue = createTopologyEditSpecificationCatalogue(await rawFixture());
  const byId = new Map(catalogue.records.map((record) => [record.recordId, record]));

  assert.equal(byId.get('PIPE-DN100-SCH40-A').wallThicknessMm, 6.02);
  assert.equal(byId.get('ELBOW-DN100-LR90-A').elbowRadiusMm, 152.4);
  assert.equal(byId.get('ELBOW-DN100-LR90-A').elbowAngleDeg, 90);
  assert.equal(byId.get('REDUCER-DN150-DN100-CONC-A').secondaryNominalSizeMm, 100);
  assert.equal(byId.get('REDUCER-DN150-DN100-CONC-A').reducerOrientation, 'CONCENTRIC');
  assert.equal(byId.get('VALVE-DN100-GATE-600-A').valveFaceToFaceMm, 600);
  assert.equal(byId.get('FLANGE-DN100-600-RF-A').flangeClass, '600');
  assert.equal(byId.get('FLANGE-DN100-600-RF-A').flangeFacing, 'RF');
  assert.deepEqual(
    topologyEditSpecificationRecordKey(byId.get('PIPE-DN100-SCH40-A')),
    {
      componentType: 'PIPE',
      nominalSizeMm: 100,
      outsideDiameterMm: 114.3,
      secondaryNominalSizeMm: null,
      secondaryOutsideDiameterMm: null,
      schedule: 'SCH40',
      wallThicknessMm: 6.02,
      elbowRadiusMm: null,
      elbowAngleDeg: null,
      reducerType: null,
      reducerOrientation: null,
      valveFaceToFaceMm: null,
      flangeClass: null,
      flangeFacing: null,
      endConnectionFrom: 'BW',
      endConnectionTo: 'BW',
      pipingClass: 'DEMO-150',
    },
  );
});

test('record normalization is exact and rejects missing type evidence', () => {
  const base = {
    recordId: 'ELBOW-1',
    componentType: 'elbow',
    nominalSizeMm: 100,
    outsideDiameterMm: 114.3,
    elbowRadiusMm: 152.4,
    elbowAngleDeg: 90,
    endConnectionFrom: 'bw',
    endConnectionTo: 'bw',
    pipingClass: 'demo-150',
    sourceReference: { documentId: 'S', revision: '1', path: '/elbow/1' },
  };
  const record = createTopologyEditSpecificationRecord(base);
  assert.equal(record.componentType, 'ELBOW');
  assert.equal(record.endConnectionFrom, 'BW');
  assert.equal(record.pipingClass, 'DEMO-150');
  assert.deepEqual(assertTopologyEditSpecificationRecord(record), record);
  assert.throws(() => createTopologyEditSpecificationRecord({
    ...base,
    elbowRadiusMm: null,
  }), /ELBOW\.elbowRadiusMm is required/i);
  assert.throws(() => createTopologyEditSpecificationRecord({
    ...base,
    elbowAngleDeg: 180,
  }), /strictly between 0 and 180/i);
});

test('catalogue fails closed on duplicate identity and content/version drift', async () => {
  const input = await rawFixture();
  assert.throws(() => createTopologyEditSpecificationCatalogue({
    ...input,
    records: [...input.records, { ...input.records[0] }],
  }), /recordId values must be unique/i);

  const catalogue = createTopologyEditSpecificationCatalogue(input);
  assert.throws(() => assertTopologyEditSpecificationCatalogue({
    ...catalogue,
    catalogueVersion: '2026.08.03',
  }), /immutable content authority/i);
  assert.throws(() => assertTopologyEditSpecificationCatalogue({
    ...catalogue,
    records: catalogue.records.map((record, index) => index === 0
      ? { ...record, outsideDiameterMm: 114.4 }
      : record),
  }), /immutable content authority|record differs/i);
});

test('catalogue does not accept hidden nearest-size or reducer-field fallback', () => {
  assert.throws(() => createTopologyEditSpecificationRecord({
    recordId: 'PIPE-BAD',
    componentType: 'PIPE',
    nominalSizeMm: 0,
    outsideDiameterMm: 114.3,
    schedule: 'SCH40',
    wallThicknessMm: 6.02,
    endConnectionFrom: 'BW',
    endConnectionTo: 'BW',
    pipingClass: 'DEMO',
    sourceReference: { documentId: 'S', revision: '1', path: '/pipe/bad' },
  }), /nominalSizeMm must be a positive/i);
  assert.throws(() => createTopologyEditSpecificationRecord({
    recordId: 'PIPE-REDUCER-FIELDS',
    componentType: 'PIPE',
    nominalSizeMm: 100,
    outsideDiameterMm: 114.3,
    schedule: 'SCH40',
    wallThicknessMm: 6.02,
    secondaryNominalSizeMm: 80,
    endConnectionFrom: 'BW',
    endConnectionTo: 'BW',
    pipingClass: 'DEMO',
    sourceReference: { documentId: 'S', revision: '1', path: '/pipe/bad' },
  }), /reducer-only fields/i);
});
