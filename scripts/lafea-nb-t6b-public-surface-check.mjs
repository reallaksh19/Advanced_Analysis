#!/usr/bin/env node
import assert from 'node:assert/strict';
import * as producer from '../src/workspace/lafea-lug-pinhole-mesh-ladder.js';
import * as publicApi from '../src/workspace/lafea-controlled-continuum-public.js';

const names = Object.freeze([
  'LAFEA_LUG_PINHOLE_MESH_LADDER_INTAKE_SCHEMA',
  'LAFEA_LUG_PINHOLE_MESH_LADDER_LEVEL_SCHEMA',
  'LAFEA_LUG_PINHOLE_MESH_LADDER_PRODUCER_REVISION',
  'LAFEA_LUG_PINHOLE_MESH_LADDER_SCHEMA',
  'createLafeaLugPinholeMeshLadder',
  'lafeaLugPinholeAnalysisGeometryHash',
  'validateLafeaLugPinholeMeshLadder',
]);

for (const name of names) {
  assert.ok(name in producer, `Producer is missing ${name}.`);
  assert.ok(name in publicApi, `Controlled continuum facade is missing ${name}.`);
  assert.strictEqual(publicApi[name], producer[name],
    `${name} must be re-exported without wrapping.`);
}

assert.equal(
  publicApi.LAFEA_LUG_PINHOLE_MESH_LADDER_SCHEMA,
  'lafea-lug-pinhole-mesh-ladder/v1',
);
assert.equal(
  publicApi.LAFEA_LUG_PINHOLE_MESH_LADDER_PRODUCER_REVISION,
  'NB-T6B.1',
);

console.log(JSON.stringify({
  schema: 'lafea-nb-t6b-public-surface-check/v1',
  status: 'PASS',
  exportedContracts: names,
  publicFacade: 'lafea-controlled-continuum-public.js',
  workbenchUiChanged: false,
  releaseQualified: false,
}));
