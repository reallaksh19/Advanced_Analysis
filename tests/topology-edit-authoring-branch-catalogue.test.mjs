import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  assertTopologyEditAuthoringBranchCatalogueOptions,
  deriveTopologyEditAuthoringBranchCatalogueOptions,
  requireTopologyEditAuthoringBranchCatalogueRecord,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-branch-catalogue.js';
import {
  createTopologyEditSpecificationCatalogue,
} from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';

const catalogue = createTopologyEditSpecificationCatalogue(JSON.parse(readFileSync(
  new URL('../public/fixtures/topology-edit-professional-spec-catalog.json', import.meta.url),
  'utf8',
)));

test('exact host evidence exposes compatible Tee and Olet records without ranking', () => {
  const options = deriveTopologyEditAuthoringBranchCatalogueOptions({
    catalogue,
    hostNominalSizeMm: 100,
    hostOutsideDiameterMm: 114.3,
    pipingClass: 'DEMO-150',
  });

  assert.equal(options.status, 'AVAILABLE');
  assert.deepEqual(options.optionRecordIds, [
    'OLET-DN100-DN25-WELDOLET-A',
    'TEE-DN100-DN50-BW-A',
  ]);
  assert.equal(options.options.length, 2);
  const olet = options.options[0];
  const tee = options.options[1];
  assert.equal(olet.branchNominalSizeMm, 25);
  assert.equal(olet.branchOutsideDiameterMm, 33.4);
  assert.equal(olet.componentLengthMm, 44);
  assert.equal(olet.componentMassKg, 1.8);
  assert.equal(tee.branchNominalSizeMm, 50);
  assert.equal(tee.componentLengthMm, 64);
  assert.equal(tee.componentMassKg, 12.1);
  assert.equal(options.catalogueSourceHash, catalogue.authority.sourceHash);
  assert.equal(assertTopologyEditAuthoringBranchCatalogueOptions(options), options);
  assert.ok(Object.isFrozen(options));
});

test('family selection preserves exact catalogue and source evidence', () => {
  const options = deriveTopologyEditAuthoringBranchCatalogueOptions({
    catalogue,
    branchFamily: 'tee',
    hostNominalSizeMm: 100,
    hostOutsideDiameterMm: 114.3,
  });

  assert.deepEqual(options.optionRecordIds, ['TEE-DN100-DN50-BW-A']);
  const selected = requireTopologyEditAuthoringBranchCatalogueRecord(
    options,
    'TEE-DN100-DN50-BW-A',
  );
  assert.equal(selected.branchFamily, 'TEE');
  assert.equal(selected.pressureClass, '150');
  assert.equal(selected.materialSpecification, 'ASTM A234 WPB');
  assert.equal(selected.hostEndConnection, 'BW');
  assert.equal(selected.branchEndConnection, 'BW');
  assert.equal(selected.componentLengthMm, 64);
  assert.equal(selected.componentMassKg, 12.1);
  assert.equal(selected.sourceReference.path, '/tee/dn100-dn50/reducing');
});

test('mismatched host evidence is unavailable and never nearest-size substituted', () => {
  const options = deriveTopologyEditAuthoringBranchCatalogueOptions({
    catalogue,
    branchFamily: 'OLET',
    hostNominalSizeMm: 125,
    hostOutsideDiameterMm: 139.7,
  });

  assert.equal(options.status, 'UNAVAILABLE');
  assert.deepEqual(options.optionRecordIds, []);
  assert.deepEqual(options.options, []);
  assert.deepEqual(options.familyRecordIds, ['OLET-DN100-DN25-WELDOLET-A']);
  assert.throws(
    () => requireTopologyEditAuthoringBranchCatalogueRecord(
      options,
      'OLET-DN100-DN25-WELDOLET-A',
    ),
    /not one exact compatible option/u,
  );
});

test('catalogue tampering fails before options are exposed', () => {
  assert.throws(
    () => deriveTopologyEditAuthoringBranchCatalogueOptions({
      catalogue: { ...catalogue, catalogueHash: `sha256:${'f'.repeat(64)}` },
      hostNominalSizeMm: 100,
      hostOutsideDiameterMm: 114.3,
    }),
    /immutable content authority/u,
  );

  const options = deriveTopologyEditAuthoringBranchCatalogueOptions({
    catalogue,
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
