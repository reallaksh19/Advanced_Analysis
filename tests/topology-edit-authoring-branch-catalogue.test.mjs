import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTopologyEditAuthoringBranchCatalogueOptions,
  deriveTopologyEditAuthoringBranchCatalogueOptions,
  requireTopologyEditAuthoringBranchCatalogueRecord,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-branch-catalogue.js';

const HASHES = ['a', 'b', 'c', 'd', 'e'].map(
  (value) => `sha256:${value.repeat(64)}`,
);

function catalogue(records = baseRecords()) {
  return {
    catalogueVersion: '2026.08.06',
    catalogueHash: HASHES[0],
    records,
  };
}

function baseRecords() {
  return [
    record({
      recordId: 'TEE-DN100-DN50-600-A',
      recordHash: HASHES[1],
      componentType: 'TEE',
      componentLengthMm: 110,
      componentMassKg: 23,
    }),
    record({
      recordId: 'OLET-DN100-DN50-600-A',
      recordHash: HASHES[2],
      componentType: 'OLET',
      componentLengthMm: 75,
      componentMassKg: 8.5,
    }),
    record({
      recordId: 'OLET-DN150-DN50-600-A',
      recordHash: HASHES[3],
      componentType: 'OLET',
      nominalSizeMm: 150,
      outsideDiameterMm: 168.3,
      componentLengthMm: 82,
      componentMassKg: 10,
    }),
    {
      recordId: 'FLANGE-DN100-600-RF-A',
      recordHash: HASHES[4],
      componentType: 'FLANGE',
    },
  ];
}

function record(overrides = {}) {
  return {
    recordId: 'OLET-DN100-DN50-600-A',
    recordHash: HASHES[2],
    componentType: 'OLET',
    nominalSizeMm: 100,
    outsideDiameterMm: 114.3,
    secondaryNominalSizeMm: 50,
    secondaryOutsideDiameterMm: 60.3,
    pipingClass: '600',
    pressureClass: '600',
    materialSpecification: 'ASTM A105',
    endConnectionFrom: 'BW',
    endConnectionTo: 'BW',
    componentLengthMm: 75,
    componentMassKg: 8.5,
    ...overrides,
  };
}

test('exact host evidence exposes both compatible Tee and Olet records without ranking', () => {
  const options = deriveTopologyEditAuthoringBranchCatalogueOptions({
    catalogue: catalogue(),
    hostNominalSizeMm: 100,
    hostOutsideDiameterMm: 114.3,
    pipingClass: '600',
    pressureClass: '600',
    materialSpecification: 'astm a105',
  });

  assert.equal(options.status, 'AVAILABLE');
  assert.deepEqual(options.optionRecordIds, [
    'OLET-DN100-DN50-600-A',
    'TEE-DN100-DN50-600-A',
  ]);
  assert.equal(options.options.length, 2);
  assert.equal(options.options[0].branchNominalSizeMm, 50);
  assert.equal(options.options[0].branchOutsideDiameterMm, 60.3);
  assert.equal(options.options[0].componentLengthMm, 75);
  assert.equal(options.options[0].componentMassKg, 8.5);
  assert.equal(options.options[1].componentLengthMm, 110);
  assert.equal(options.options[1].componentMassKg, 23);
  assert.equal(assertTopologyEditAuthoringBranchCatalogueOptions(options), options);
  assert.ok(Object.isFrozen(options));
});

test('family selection is exact and preserves catalogue-owned evidence', () => {
  const options = deriveTopologyEditAuthoringBranchCatalogueOptions({
    catalogue: catalogue(),
    branchFamily: 'tee',
    hostNominalSizeMm: 100,
    hostOutsideDiameterMm: 114.3,
  });

  assert.deepEqual(options.optionRecordIds, ['TEE-DN100-DN50-600-A']);
  const selected = requireTopologyEditAuthoringBranchCatalogueRecord(
    options,
    'TEE-DN100-DN50-600-A',
  );
  assert.equal(selected.branchFamily, 'TEE');
  assert.equal(selected.pressureClass, '600');
  assert.equal(selected.materialSpecification, 'ASTM A105');
  assert.equal(selected.hostEndConnection, 'BW');
  assert.equal(selected.branchEndConnection, 'BW');
  assert.equal(selected.componentLengthMm, 110);
  assert.equal(selected.componentMassKg, 23);
});

test('mismatched host evidence is unavailable and never nearest-size substituted', () => {
  const options = deriveTopologyEditAuthoringBranchCatalogueOptions({
    catalogue: catalogue(),
    branchFamily: 'OLET',
    hostNominalSizeMm: 125,
    hostOutsideDiameterMm: 139.7,
  });

  assert.equal(options.status, 'UNAVAILABLE');
  assert.deepEqual(options.optionRecordIds, []);
  assert.deepEqual(options.options, []);
  assert.deepEqual(options.familyRecordIds, [
    'OLET-DN100-DN50-600-A',
    'OLET-DN150-DN50-600-A',
  ]);
  assert.throws(
    () => requireTopologyEditAuthoringBranchCatalogueRecord(
      options,
      'OLET-DN100-DN50-600-A',
    ),
    /not one exact compatible option/u,
  );
});

test('catalogue record ordering does not change option authority', () => {
  const input = {
    hostNominalSizeMm: 100,
    hostOutsideDiameterMm: 114.3,
  };
  const left = deriveTopologyEditAuthoringBranchCatalogueOptions({
    ...input,
    catalogue: catalogue(baseRecords()),
  });
  const right = deriveTopologyEditAuthoringBranchCatalogueOptions({
    ...input,
    catalogue: catalogue([...baseRecords()].reverse()),
  });

  assert.deepEqual(left, right);
});

test('duplicate, stale, malformed, and tampered catalogue authority fails closed', () => {
  const duplicateId = [...baseRecords(), {
    ...baseRecords()[0],
    recordHash: `sha256:${'f'.repeat(64)}`,
  }];
  assert.throws(
    () => deriveTopologyEditAuthoringBranchCatalogueOptions({
      catalogue: catalogue(duplicateId),
      hostNominalSizeMm: 100,
      hostOutsideDiameterMm: 114.3,
    }),
    /duplicate record ID/u,
  );

  const duplicateHash = [...baseRecords(), {
    ...baseRecords()[0],
    recordId: 'TEE-DN100-DN50-600-B',
  }];
  assert.throws(
    () => deriveTopologyEditAuthoringBranchCatalogueOptions({
      catalogue: catalogue(duplicateHash),
      hostNominalSizeMm: 100,
      hostOutsideDiameterMm: 114.3,
    }),
    /duplicate record hash/u,
  );

  assert.throws(
    () => deriveTopologyEditAuthoringBranchCatalogueOptions({
      catalogue: { ...catalogue(), catalogueHash: 'stale' },
      hostNominalSizeMm: 100,
      hostOutsideDiameterMm: 114.3,
    }),
    /sha256 hash/u,
  );

  const options = deriveTopologyEditAuthoringBranchCatalogueOptions({
    catalogue: catalogue(),
    hostNominalSizeMm: 100,
    hostOutsideDiameterMm: 114.3,
  });
  assert.throws(
    () => assertTopologyEditAuthoringBranchCatalogueOptions({
      ...options,
      optionRecordIds: [],
    }),
    /hash mismatch/u,
  );
});
