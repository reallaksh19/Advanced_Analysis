#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BM4_B313_CARBON_STEEL_MEAN_ALPHA_TABLE,
  BM4_CAESAR_AMBIENT_TEMPERATURE_C,
  BM4_CAESAR_AMBIENT_TEMPERATURE_F,
  BM4_CAESAR_AMBIENT_TEMPERATURE_K,
  BM4_T1_MEAN_ALPHA_PER_C,
  BM4_T1_MEAN_ALPHA_PER_F,
  BM4_T1_TEMPERATURE_C,
  BM4_T1_TEMPERATURE_F,
  BM4_T1_THERMAL_STRAIN,
  BM4_THERMAL_EXPANSION_AUTHORITY,
} from './lfea-bm4-thermal-expansion-authority.mjs';
import { BM4_INPUT_PATH } from './lfea-m034-bm4-solve-fixtures.mjs';

const inputXml = readFileSync(BM4_INPUT_PATH, 'utf8');
assert.match(inputXml, /VERSION="14\.00"/u, 'thermal authority is qualified against the supplied CAESAR II v14 input export');
assert.match(inputXml, /TEMP_EXP_C1="325\.000000"/u, 'BM4 T1 must remain the serialized actual 325C temperature');
assert.match(inputXml, /MATERIAL_NUM="106\.000000" MATERIAL_NAME="A106 Grade B"/u, 'BM4 thermal authority requires serialized CAESAR material 106 / A106 Grade B');
assert.doesNotMatch(inputXml, /AMBIENT(?:_|\s|=)/iu, 'supplied BM4 InputXML must not serialize an ambient-temperature override');

assert.equal(BM4_CAESAR_AMBIENT_TEMPERATURE_F, 70);
assert.ok(Math.abs(BM4_CAESAR_AMBIENT_TEMPERATURE_C - 21.11111111111111) < 1e-14);
assert.ok(Math.abs(BM4_CAESAR_AMBIENT_TEMPERATURE_K - 294.26111111111106) < 1e-12);
assert.equal(BM4_T1_TEMPERATURE_C, 325);
assert.equal(BM4_T1_TEMPERATURE_F, 617);
assert.deepEqual(BM4_B313_CARBON_STEEL_MEAN_ALPHA_TABLE, [
  { temperatureF: 600, alphaPerF: 7.23e-6 },
  { temperatureF: 650, alphaPerF: 7.33e-6 },
]);
assert.ok(Math.abs(BM4_T1_MEAN_ALPHA_PER_F - 7.264e-6) < 1e-16);
assert.ok(Math.abs(BM4_T1_MEAN_ALPHA_PER_C - 1.30752e-5) < 1e-16);
assert.ok(Math.abs(BM4_T1_THERMAL_STRAIN - 0.003973408) < 1e-15);
assert.equal(BM4_THERMAL_EXPANSION_AUTHORITY.policy.fitToBenchmarkOutput, false);

console.log(JSON.stringify({
  check: 'lfea-bm4-thermal-expansion-authority',
  status: 'PASS',
  authority: BM4_THERMAL_EXPANSION_AUTHORITY,
}, null, 2));
