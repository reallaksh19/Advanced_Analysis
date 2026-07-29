#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE_SCHEMA,
  LINEAR_FEA_MATERIAL_RESOLUTION_SCHEMA,
  LINEAR_FEA_MATERIAL_TABLE_SCHEMA,
  LinearFeaMaterialError,
  computeMaterialProfileSemanticHash,
  computeMaterialResolutionEvidenceHash,
  computeMaterialResolutionSemanticHash,
  computeMaterialTableSemanticHash,
  requireMaterialResolutionProfile,
  requireMaterialResolutionResult,
  requireMaterialTable,
  resolveLinearFeaMaterialState,
  sealMaterialTable,
} from '../src/core/linear-fea-material/index.js';
import { RECORD_KEYS } from '../src/core/linear-fea-contract/model-schema.js';
import {
  EXPECTED_MIDPOINT,
  MATERIAL_PROFILE,
  MATERIAL_TABLE,
  materialRequest,
  materialTable,
  reversedMaterialTable,
} from './lfea-b2.2-material-fixtures.mjs';
import { scanMaterialSourceText } from './lfea-b2.2-material-source-guard.mjs';

const clone = structuredClone;
const tests = [];
const regressions = [];

function test(id, name, body) {
  body();
  tests.push(id);
  console.log(`PASS ${id} ${name}`);
}

function regression(id, name, body) {
  body();
  regressions.push(id);
  console.log(`PASS ${id} ${name}`);
}

function expectCode(body, code) {
  assert.throws(body, (error) => {
    assert.ok(error instanceof LinearFeaMaterialError);
    assert.equal(error.code, code);
    return true;
  });
}

function resolve(request = materialRequest(), table = MATERIAL_TABLE, profile = MATERIAL_PROFILE) {
  return resolveLinearFeaMaterialState({ table, request, profile });
}

function resealResult(result) {
  const candidate = clone(result);
  candidate.semanticHash = computeMaterialResolutionSemanticHash(candidate);
  candidate.evidenceHash = computeMaterialResolutionEvidenceHash(candidate);
  return candidate;
}

function resealTable(table) {
  const candidate = clone(table);
  candidate.semanticHash = computeMaterialTableSemanticHash(candidate);
  return candidate;
}

function approx(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)));
}

test('B22-T01', 'Exact material-table schema', () => {
  assert.equal(MATERIAL_TABLE.schema, LINEAR_FEA_MATERIAL_TABLE_SCHEMA);
  assert.deepEqual(Object.keys(MATERIAL_TABLE), [
    'schema', 'materialId', 'sourceEvidence', 'points', 'semanticHash',
  ]);
  const extra = materialTable({ designTemperature: 425 });
  expectCode(() => requireMaterialTable(extra), 'MATERIAL_TABLE_INVALID');
});

test('B22-T02', 'Exact resolution-profile schema', () => {
  assert.equal(MATERIAL_PROFILE.schema, LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE_SCHEMA);
  assert.equal(MATERIAL_PROFILE.semanticHash, computeMaterialProfileSemanticHash(MATERIAL_PROFILE));
  const extra = { ...MATERIAL_PROFILE, temperatureTolerance: 1e-6 };
  expectCode(() => requireMaterialResolutionProfile(extra), 'MATERIAL_PROFILE_INVALID');
});

test('B22-T03', 'Exact table-point resolution', () => {
  const result = resolve(materialRequest({
    materialStateId: 'MAT-A106B-400K',
    evaluationTemperature: 400,
  }));
  assert.equal(result.resolution.method, 'EXACT_TABLE_POINT');
  assert.equal(result.resolution.lowerTemperature, 400);
  assert.equal(result.resolution.upperTemperature, 400);
  assert.equal(result.resolution.interpolationFactor, 0);
  assert.equal(result.materialState.elasticModulus, 2.00e11);
  assert.equal(result.materialState.shearModulus, 7.50e10);
});

test('B22-T04', 'Midpoint interpolation', () => {
  const result = resolve();
  assert.equal(result.resolution.method, 'LINEAR_INTERPOLATION');
  assert.equal(result.resolution.lowerTemperature, 400);
  assert.equal(result.resolution.upperTemperature, 450);
  assert.equal(result.resolution.interpolationFactor, 0.5);
  for (const [key, expected] of Object.entries(EXPECTED_MIDPOINT)) {
    approx(result.materialState[key], expected);
  }
});

test('B22-T05', 'Non-midpoint interpolation', () => {
  const result = resolve(materialRequest({
    materialStateId: 'MAT-A106B-410K',
    evaluationTemperature: 410,
  }));
  approx(result.resolution.interpolationFactor, 0.2);
  approx(result.materialState.elasticModulus, 1.96e11);
  approx(result.materialState.shearModulus, 7.36e10);
});

test('B22-T06', 'Input point order is non-semantic', () => {
  const reversed = reversedMaterialTable();
  assert.equal(reversed.semanticHash, MATERIAL_TABLE.semanticHash);
  assert.deepEqual(resolve(materialRequest(), reversed), resolve());
});

test('B22-T07', 'Caller input is not mutated', () => {
  const table = materialTable();
  table.points.reverse();
  table.semanticHash = computeMaterialTableSemanticHash(table);
  const before = JSON.stringify(table);
  resolve(materialRequest(), table);
  assert.equal(JSON.stringify(table), before);
});

test('B22-T08', 'Duplicate temperatures rejected', () => {
  const table = materialTable();
  table.points.push(clone(table.points[0]));
  table.semanticHash = '';
  expectCode(() => sealMaterialTable(table), 'MATERIAL_TABLE_DUPLICATE_TEMPERATURE');
});

test('B22-T09', 'Below-range request rejected', () => {
  expectCode(
    () => resolve(materialRequest({ evaluationTemperature: 349 })),
    'MATERIAL_TEMPERATURE_BELOW_RANGE',
  );
});

test('B22-T10', 'Above-range request rejected', () => {
  expectCode(
    () => resolve(materialRequest({ evaluationTemperature: 451 })),
    'MATERIAL_TEMPERATURE_ABOVE_RANGE',
  );
});

test('B22-T11', 'E is interpolated independently', () => {
  const table = materialTable();
  table.points[1].elasticModulus = 1.00e11;
  table.semanticHash = '';
  const result = resolve(materialRequest(), sealMaterialTable(table));
  assert.equal(result.materialState.elasticModulus, 1.40e11);
});

test('B22-T12', 'G is interpolated independently', () => {
  const table = materialTable();
  table.points[1].shearModulus = 2.00e10;
  table.semanticHash = '';
  const result = resolve(materialRequest(), sealMaterialTable(table));
  assert.equal(result.materialState.shearModulus, 4.40e10);
  assert.notEqual(
    result.materialState.shearModulus,
    result.materialState.elasticModulus / (2 * (1 + result.materialState.poissonRatio)),
  );
});

test('B22-T13', 'Poisson ratio is interpolated independently', () => {
  const table = materialTable();
  table.points[1].poissonRatio = 0.10;
  table.semanticHash = '';
  const result = resolve(materialRequest(), sealMaterialTable(table));
  approx(result.materialState.poissonRatio, 0.21);
});

test('B22-T14', 'Density is interpolated independently', () => {
  const table = materialTable();
  table.points[1].massDensity = 7000;
  table.semanticHash = '';
  const result = resolve(materialRequest(), sealMaterialTable(table));
  assert.equal(result.materialState.massDensity, 7415);
});

test('B22-T15', 'Alpha is interpolated independently', () => {
  const table = materialTable();
  table.points[1].thermalExpansionCoefficient = 2e-5;
  table.semanticHash = '';
  const result = resolve(materialRequest(), sealMaterialTable(table));
  approx(result.materialState.thermalExpansionCoefficient, 1.675e-5);
});

test('B22-T16', 'Invalid resolved E/G rejected', () => {
  for (const key of ['elasticModulus', 'shearModulus']) {
    const result = clone(resolve());
    result.materialState[key] = 0;
    const resealed = resealResult(result);
    expectCode(() => requireMaterialResolutionResult(resealed), 'MATERIAL_RESOLVED_VALUE_INVALID');
  }
});

test('B22-T17', 'Invalid Poisson ratio rejected', () => {
  const result = clone(resolve());
  result.materialState.poissonRatio = 0.5;
  expectCode(
    () => requireMaterialResolutionResult(resealResult(result)),
    'MATERIAL_RESOLVED_VALUE_INVALID',
  );
});

test('B22-T18', 'Invalid density rejected', () => {
  const result = clone(resolve());
  result.materialState.massDensity = 0;
  expectCode(
    () => requireMaterialResolutionResult(resealResult(result)),
    'MATERIAL_RESOLVED_VALUE_INVALID',
  );
});

test('B22-T19', 'Material identity mismatch rejected', () => {
  expectCode(
    () => resolve(materialRequest({ materialId: 'ASTM A53 Gr. B' })),
    'MATERIAL_ID_MISMATCH',
  );
});

test('B22-T20', 'Exact B-2.1 material-state shape', () => {
  assert.deepEqual(Object.keys(resolve().materialState), RECORD_KEYS.materialState);
  assert.deepEqual(Object.keys(resolve().materialState.sourceEvidence[0]), [
    'sourceId', 'sourceRevision', 'sourceSemanticHash',
  ]);
});

test('B22-T21', 'Diagnostic wording does not alter semantic hash', () => {
  const left = clone(resolve());
  const right = clone(left);
  right.diagnostics[0].message = 'Equivalent wording with unchanged resolution meaning.';
  assert.equal(
    computeMaterialResolutionSemanticHash(left),
    computeMaterialResolutionSemanticHash(right),
  );
});

test('B22-T22', 'Diagnostics alter evidence hash', () => {
  const left = clone(resolve());
  const right = clone(left);
  right.diagnostics[0].message = 'Changed evidence wording.';
  right.semanticHash = computeMaterialResolutionSemanticHash(right);
  right.evidenceHash = computeMaterialResolutionEvidenceHash(right);
  assert.equal(left.semanticHash, right.semanticHash);
  assert.notEqual(left.evidenceHash, right.evidenceHash);
});

test('B22-T23', 'Source revision alters semantic identity', () => {
  const table = materialTable();
  table.sourceEvidence.sourceRevision = 'Rev 5';
  table.semanticHash = '';
  const changed = sealMaterialTable(table);
  assert.notEqual(changed.semanticHash, MATERIAL_TABLE.semanticHash);
  assert.notEqual(resolve(materialRequest(), changed).semanticHash, resolve().semanticHash);
});

test('B22-T24', 'Density/alpha do not define stiffness identity', () => {
  const a = resolve().materialState;
  const table = materialTable();
  table.points.forEach((point) => {
    point.massDensity += 100;
    point.thermalExpansionCoefficient += 1e-6;
  });
  table.semanticHash = '';
  const b = resolve(materialRequest(), sealMaterialTable(table)).materialState;
  const stiffness = (state) => ({
    elasticModulus: state.elasticModulus,
    shearModulus: state.shearModulus,
  });
  assert.deepEqual(stiffness(a), stiffness(b));
  assert.notEqual(a.massDensity, b.massDensity);
  assert.notEqual(a.thermalExpansionCoefficient, b.thermalExpansionCoefficient);
});

test('B22-T25', 'Non-ASCII source evidence hashes deterministically', () => {
  const table = materialTable();
  table.sourceEvidence.sourceId = '项目/材料数据库/Δ';
  table.sourceEvidence.sourceRevision = '修订 4';
  table.semanticHash = '';
  const first = sealMaterialTable(table);
  const second = sealMaterialTable(clone(table));
  assert.equal(first.semanticHash, second.semanticHash);
});

test('B22-T26', 'Deep immutability', () => {
  const result = resolve();
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.request));
  assert.ok(Object.isFrozen(result.resolution));
  assert.ok(Object.isFrozen(result.materialState));
  assert.ok(Object.isFrozen(result.materialState.sourceEvidence));
  assert.ok(Object.isFrozen(result.diagnostics[0].evidence));
});

test('B22-T27', 'Stale table/profile/result hashes rejected', () => {
  const staleTable = materialTable();
  staleTable.points[0].elasticModulus -= 1;
  expectCode(() => requireMaterialTable(staleTable), 'MATERIAL_HASH_MISMATCH');

  const staleProfile = { ...LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE, semanticHash: 'fnv1a64:0000000000000000' };
  expectCode(() => requireMaterialResolutionProfile(staleProfile), 'MATERIAL_HASH_MISMATCH');

  const staleResult = clone(resolve());
  staleResult.materialState.massDensity += 1;
  expectCode(() => requireMaterialResolutionResult(staleResult), 'MATERIAL_HASH_MISMATCH');
});

regression('B22-R01', 'silent clamp is detected', () => {
  expectCode(
    () => resolve(materialRequest({ evaluationTemperature: 300 })),
    'MATERIAL_TEMPERATURE_BELOW_RANGE',
  );
});

regression('B22-R02', 'extrapolation is detected', () => {
  expectCode(
    () => resolve(materialRequest({ evaluationTemperature: 500 })),
    'MATERIAL_TEMPERATURE_ABOVE_RANGE',
  );
});

regression('B22-R03', 'derived G diverges from supplied G', () => {
  const result = resolve();
  const derived = result.materialState.elasticModulus
    / (2 * (1 + result.materialState.poissonRatio));
  assert.notEqual(result.materialState.shearModulus, derived);
});

regression('B22-R04', 'in-place point sorting is detected', () => {
  const table = materialTable();
  table.points.reverse();
  table.semanticHash = computeMaterialTableSemanticHash(table);
  const before = JSON.stringify(table.points);
  resolve(materialRequest(), table);
  assert.equal(JSON.stringify(table.points), before);
});

regression('B22-R05', 'duplicate temperatures are detected', () => {
  const table = materialTable();
  table.points.push(clone(table.points[0]));
  table.semanticHash = '';
  expectCode(() => sealMaterialTable(table), 'MATERIAL_TABLE_DUPLICATE_TEMPERATURE');
});

regression('B22-R06', 'source revision removal changes semantic identity', () => {
  const table = materialTable();
  delete table.sourceEvidence.sourceRevision;
  table.semanticHash = '';
  expectCode(() => sealMaterialTable(table), 'MATERIAL_TABLE_INVALID');
});

regression('B22-R07', 'diagnostic wording is excluded from semantic identity', () => {
  const left = clone(resolve());
  const right = clone(left);
  right.diagnostics[0].message = 'Reworded';
  assert.equal(computeMaterialResolutionSemanticHash(left), computeMaterialResolutionSemanticHash(right));
});

regression('B22-R08', 'private hash implementation is detected', () => {
  assert.ok(scanMaterialSourceText('const FNV_PRIME = 0x100000001b3n; function hashBytes() {}').length > 0);
});

regression('B22-R09', 'installation temperature cannot replace evaluation temperature', () => {
  expectCode(
    () => resolve(materialRequest({ installationTemperature: 293.15 })),
    'MATERIAL_REQUEST_INVALID',
  );
});

assert.equal(tests.length, 27);
assert.equal(regressions.length, 9);
console.log(`QUALIFIED LFEA B-2.2 ${tests.length}/27 tests; ${regressions.length}/9 regressions`);
