#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as publicSurface from '../src/workspace/lafea-controlled-continuum-public.js';

const expected = [
  'LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_INTAKE_SCHEMA',
  'LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_LEVEL_SCHEMA',
  'LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_PRODUCER_REVISION',
  'LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_SCHEMA',
  'createLafeaLugPinholePhysicalProjection',
  'validateLafeaLugPinholePhysicalProjection',
];
for (const name of expected) assert.ok(name in publicSurface, name);
assert.equal(
  publicSurface.LAFEA_LUG_PINHOLE_PHYSICAL_PROJECTION_PRODUCER_REVISION,
  'NB-T6C.1',
);
const facade = fs.readFileSync(
  'src/workspace/lafea-controlled-continuum-public.js',
  'utf8',
);
assert.match(facade, /from '\.\/lafea-lug-pinhole-physical-projection\.js'/u);
assert.doesNotMatch(facade, /from ['"][^'"]*(?:local-continuum|local-shell)[^'"]*['"]/u);
console.log(JSON.stringify({
  schema: 'lafea-nb-t6c-public-surface-check/v1',
  status: 'PASS',
  exports: expected,
  uiCallbackExposed: false,
  solverEntryPointExposed: false,
}));
