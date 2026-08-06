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

test('catalogue v3 is versioned, content-addressed, immutable, and reorder stable', async () => {
  const input = await rawFixture();
  const left = createTopologyEditSpecificationCatalogue(input);
  const right = createTopologyEditSpecificationCatalogue({
    ...input,
    records: [...input.records].reverse(),
  });

  assert.deepEqual(left, right);
  assert.equal(left.schema, 'TopologyEditSpecificationCatalogue.v3');
  assert.equal(left.catalogueVersion, '2026.08.06');
  assert.equal(left.records.length, 9);
  assert.match(left.authority.sourceHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(left), true);
  assert.equal(Object.isFrozen(left.records), true);
  assert.equal(Object.isFrozen(left.records[0]), true);
  assert.deepEqual(assertTopologyEditSpecificationCatalogue(left), left);
});

test('catalogue records retain exact component, material, pressure, mass, and length evidence', async () => {
  const catalogue = createTopologyEditSpecificationCatalogue(await rawFixture());
  const byId = new Map(catalogue.records.map((record) => [record.recordId, record]));

  assert.equal(byId.get('PIPE-DN100-SCH40-A').wallThicknessMm, 6.02);
  assert.equal(byId.get('PIPE-DN100-SCH40-A').materialSpecification, 'ASTM A106 GR B');
  assert.equal(byId.get('PIPE-DN100-SCH40-A').pressureClass, '150');
  assert.equal(byId.get('PIPE-DN100-SCH40-A').componentLengthMm, 6000);
  assert.equal(byId.get('ELBOW-DN100-LR90-A').elbowRadiusMm, 152.4);
  assert.equal(byId.get('ELBOW-DN100-LR90-A').elbowAngleDeg, 90);
  assert.equal(byId.get('REDUCER-DN150-DN100-CONC-A').secondaryNominalSizeMm, 100);
  assert.equal(byId.get('REDUCER-DN150-DN100-CONC-A').reducerOrientation, 'CONCENTRIC');
  assert.equal(byId.get('REDUCER-DN100-DN50-CONC-A').componentLengthMm, 203);
  assert.equal(byId.get('VALVE-DN100-GATE-600-A').valveType, 'GATE');
  assert.equal(byId.get('VALVE-DN100-GATE-600-A').valveFaceToFaceMm, 600);
  assert.equal(byId.get('VALVE-DN100-GATE-600-A').componentMassKg, 148);
  assert.equal(byId.get('FLANGE-DN100-600-RF-A').flangeClass, '600');
  assert.equal(byId.get('FLANGE-DN100-600-RF-A').flangeFacing, 'RF');
  assert.equal(byId.get('FLANGE-DN100-600-RF-A').flangeType, 'WELD_NECK');
  assert.equal(byId.get('FLANGE-DN100-600-RF-A').flangeThicknessMm, 52);
  assert.equal(byId.get('FLANGE-DN100-600-RF-A').flangeOutsideDiameterMm, 273);
  assert.equal(byId.get('FLANGE-DN100-600-RF-A').boltCircleDiameterMm, 215.9);
  assert.equal(byId.get('FLANGE-DN100-600-RF-A').boltHoleCount, 8);
  assert.equal(byId.get('FLANGE-DN100-600-RF-A').boltHoleDiameterMm, 25.4);
  assert.equal(byId.get('TEE-DN100-DN50-BW-A').centerToBranchMm, 64);
  assert.equal(byId.get('OLET-DN100-DN25-WELDOLET-A').oletType, 'WELDOLET');
  assert.deepEqual(
    topologyEditSpecificationRecordKey(byId.get('PIPE-DN100-SCH40-A')),
    {
      componentType: 'PIPE',
      nominalSizeMm: 100,
      outsideDiameterMm: 114.3,
      secondaryNominalSizeMm: null,
      secondaryOutsideDiameterMm: null,
      branchNominalSizeMm: null,
      branchOutsideDiameterMm: null,
      schedule: 'SCH40',
      wallThicknessMm: 6.02,
      pressureClass: '150',
      materialSpecification: 'ASTM A106 GR B',
      componentLengthMm: 6000,
      componentMassKg: 96.2,
      elbowRadiusMm: null,
      elbowAngleDeg: null,
      reducerType: null,
      reducerOrientation: null,
      valveType: null,
      valveFaceToFaceMm: null,
      flangeClass: null,
      flangeFacing: null,
      flangeType: null,
      flangeThicknessMm: null,
      flangeOutsideDiameterMm: null,
      boltCircleDiameterMm: null,
      boltHoleCount: null,
      boltHoleDiameterMm: null,
      branchAngleDeg: null,
      centerToRunMm: null,
      centerToBranchMm: null,
      branchConnection: null,
      oletType: null,
      hostComponentType: null,
      projectionMm: null,
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
    materialSpecification: 'astm a234 wpb',
    pressureClass: '150',
    componentMassKg: 8.4,
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
  assert.equal(record.materialSpecification, 'ASTM A234 WPB');
  assert.deepEqual(assertTopologyEditSpecificationRecord(record), record);
  assert.throws(() => createTopologyEditSpecificationRecord({
    ...base,
    elbowRadiusMm: null,
  }), /ELBOW\.elbowRadiusMm is required/i);
  assert.throws(() => createTopologyEditSpecificationRecord({
    ...base,
    elbowAngleDeg: 180,
  }), /strictly between 0 and 180/i);
  assert.throws(() => createTopologyEditSpecificationRecord({
    recordId: 'VALVE-BAD-LENGTH',
    componentType: 'VALVE',
    nominalSizeMm: 100,
    outsideDiameterMm: 114.3,
    valveType: 'GATE',
    valveFaceToFaceMm: 600,
    componentLengthMm: 500,
    endConnectionFrom: 'FLANGED_RF',
    endConnectionTo: 'FLANGED_RF',
    pipingClass: 'DEMO-600',
    sourceReference: { documentId: 'S', revision: '1', path: '/valve/bad' },
  }), /componentLengthMm must equal valveFaceToFaceMm/i);
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
    catalogueVersion: '2026.08.07',
  }), /immutable content authority/i);
  assert.throws(() => assertTopologyEditSpecificationCatalogue({
    ...catalogue,
    records: catalogue.records.map((record, index) => index === 0
      ? { ...record, outsideDiameterMm: 114.4 }
      : record),
  }), /immutable content authority|record differs/i);
});

test('catalogue does not accept hidden nearest-size or component-field fallback', () => {
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
  }), /secondaryNominalSizeMm is not valid for componentType PIPE/i);
  assert.throws(() => createTopologyEditSpecificationRecord({
    recordId: 'PIPE-FLANGE-FIELDS',
    componentType: 'PIPE',
    nominalSizeMm: 100,
    outsideDiameterMm: 114.3,
    schedule: 'SCH40',
    wallThicknessMm: 6.02,
    flangeType: 'WELD_NECK',
    endConnectionFrom: 'BW',
    endConnectionTo: 'BW',
    pipingClass: 'DEMO',
    sourceReference: { documentId: 'S', revision: '1', path: '/pipe/bad-flange' },
  }), /flangeType is not valid for componentType PIPE/i);
});
