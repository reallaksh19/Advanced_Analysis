#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = path.join(ROOT, 'validation/bucket-01/11-expected-value-registry.json');
const REPORT_PATH = path.resolve(ROOT, process.env.LAFEA_BUCKET_01_EXPECTED_VALUE_REPORT_PATH
  ?? 'reports/qualification/lafea-bucket-01-expected-value-registry.json');
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

assert.equal(registry.schema, 'lafea-bucket-01-expected-value-registry/v2');
assert.equal(registry.freezeAuthority, 'EXACT_GIT_HEAD_FILE_SET');
assert.equal(registry.productionOutputMayGenerateExpectedValues, false);
assert.equal(registry.entries.length, 7);
assert.equal(new Set(registry.entries.map((row) => row.entryId)).size, 7);
assert.equal(new Set(registry.entries.map((row) => row.path)).size, 7);
assert.equal(registry.acceptancePolicy.productionResponseGovernedByFourLevels, true);
assert.equal(
  registry.acceptancePolicy.productionEnergyAcceptedByFinestThreeLevelConvergence,
  true,
);
assert.equal(
  registry.acceptancePolicy.productionStressAcceptedByDirectFixedCoordinateFinestThreeLevelConvergence,
  true,
);
assert.equal(
  registry.acceptancePolicy.integrationPointExtrapolationAcceptanceAuthorized,
  false,
);

const entries = registry.entries.map((definition) => inspect(definition));
const definitionSetBase = {
  schema: 'lafea-bucket-01-expected-value-definition-set/v2',
  registryHash: canonicalLafeaSha256(registry),
  entries,
};
const definitionSetHash = canonicalLafeaSha256(definitionSetBase);
const reportBase = {
  schema: 'lafea-bucket-01-expected-value-registry-evidence/v3',
  producerRevision: 'B01-EXPECTED-VALUE-REGISTRY.3',
  registryHash: definitionSetBase.registryHash,
  definitionSetHash,
  entries,
  authority: {
    exactHeadFileSetFrozen: true,
    independentClosedFormOracleCount:
      entries.filter((row) => row.role === 'INDEPENDENT_CLOSED_FORM_ORACLE').length,
    independentEngineeringTheoryOracleCount:
      entries.filter((row) => row.role === 'INDEPENDENT_ENGINEERING_THEORY_ORACLE').length,
    productionConvergenceDefinitionCount: entries.filter((row) => (
      row.role === 'FROZEN_PRODUCTION_CONVERGENCE_DEFINITION'
      || row.role === 'FROZEN_PRODUCTION_STRESS_LOCATION_DEFINITION'
    )).length,
    governed4096ResponseDefinitionFrozen: true,
    directPointStressDefinitionFrozen: true,
    integrationPointExtrapolationAcceptanceAuthorized: false,
    productionOutputUsedToGenerateExpectedValues: false,
    productionOutputUsedToSelectLocationsOrTolerances: false,
    movingMaximumAcceptanceAuthorized: false,
    executionEvidenceSupplied: false,
    bucketQualified: false,
  },
  status: 'EXPECTED_VALUE_DEFINITION_SET_PASS',
};
const report = { ...reportBase, evidenceHash: canonicalLafeaSha256(reportBase) };
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));

function inspect(definition) {
  assert.ok([
    'INDEPENDENT_CLOSED_FORM_ORACLE',
    'INDEPENDENT_ENGINEERING_THEORY_ORACLE',
    'FROZEN_PRODUCTION_CONVERGENCE_DEFINITION',
    'FROZEN_PRODUCTION_STRESS_LOCATION_DEFINITION',
  ].includes(definition.role));
  const absolute = path.join(ROOT, definition.path);
  const raw = fs.readFileSync(absolute);
  const value = JSON.parse(raw.toString('utf8'));
  assert.equal(value.schema, definition.schema, definition.path);
  if (definition.role === 'INDEPENDENT_CLOSED_FORM_ORACLE') verifyClosedForm(value, definition.path);
  if (definition.role === 'INDEPENDENT_ENGINEERING_THEORY_ORACLE') {
    verifyEngineeringTheory(value, definition.path);
  }
  if (definition.role === 'FROZEN_PRODUCTION_CONVERGENCE_DEFINITION') verifyProductionResponse(value);
  if (definition.role === 'FROZEN_PRODUCTION_STRESS_LOCATION_DEFINITION') verifyProductionStress(value);
  return {
    ...definition,
    gitBlobSha: execFileSync('git', ['hash-object', definition.path], { cwd: ROOT, encoding: 'utf8' }).trim(),
    rawSha256: `sha256:${createHash('sha256').update(raw).digest('hex')}`,
    canonicalJsonHash: canonicalLafeaSha256(value),
  };
}

function verifyClosedForm(value, label) {
  const text = JSON.stringify(value);
  assert.match(text, /CLOSED_FORM|KIRSCH|ANALYTICAL/u, `${label} lacks independent analytical source marker`);
  verifyNoProductionDerivedExpectedValues(value, label);
}

function verifyEngineeringTheory(value, label) {
  assert.equal(value.authority?.type, 'ENGINEERING_THEORY', `${label} lacks engineering-theory authority`);
  assert.match(value.authority?.source ?? '', /Timoshenko|beam/iu, `${label} lacks theory source`);
  assert.equal(value.authority?.smoothedStressUsed, false);
  assert.equal(value.formulation, 'PLANE_STRESS');
  assert.equal(value.elementType, 'T6');
  assert.equal(value.benchmarkId, 'C2D-CANTILEVER-PLANE-STRESS-01');
  assert.equal(value.load?.type, 'UNIFORM_END_EDGE_TRACTION');
  assert.ok(Array.isArray(value.meshes) && value.meshes.length >= 3, `${label} lacks refinement ladder`);
  value.meshes.forEach((row) => {
    assert.ok(Number.isInteger(row.nx) && row.nx > 0);
    assert.ok(Number.isInteger(row.ny) && row.ny > 0);
    assert.equal(row.elementCount, 2 * row.nx * row.ny);
    assert.ok(['DETERMINISTIC_CHOLESKY', 'DETERMINISTIC_JACOBI_PCG'].includes(row.solverMethod));
  });
  assert.ok(value.tolerances?.finestDeflectionRatioAbsoluteError > 0);
  assert.ok(value.tolerances?.forceEquilibriumRelative > 0);
  assert.ok(value.tolerances?.momentEquilibriumRelative > 0);
  assert.ok(value.tolerances?.energyRelative > 0);

  const inertia = value.geometry.thickness * value.geometry.depth ** 3 / 12;
  const area = value.geometry.depth * value.geometry.thickness;
  const shearModulus = value.material.elasticModulus
    / (2 * (1 + value.material.poissonRatio));
  const expectedDeflection = value.load.resultant * value.geometry.length ** 3
    / (3 * value.material.elasticModulus * inertia)
    + value.load.resultant * value.geometry.length
      / (value.shearCorrectionFactor * shearModulus * area);
  close(value.expected.referenceDeflection, expectedDeflection, `${label} reference deflection`);
  close(
    value.expected.appliedMomentZ,
    -value.load.resultant * value.geometry.length,
    `${label} applied moment`,
  );
  assert.deepEqual(value.expected.horizontalAppliedForce, { x: 0, y: -value.load.resultant });
  assert.deepEqual(value.expected.verticalAppliedForce, { x: value.load.resultant, y: 0 });
  verifyNoProductionDerivedExpectedValues(value, label);
}

function verifyNoProductionDerivedExpectedValues(value, label) {
  const markers = collectProductionMarkers(value);
  assert.ok(markers.length > 0, `${label} lacks production-output authority marker`);
  assert.equal(markers.every((row) => row.value === false), true, `${label} permits production-derived expected values`);
}

function verifyProductionResponse(value) {
  assert.equal(value.schema, 'lafea-bucket-01-production-response-spec/v3');
  assert.deepEqual(value.meshLadder.map((row) => row.elementCount), [64, 256, 1024, 4096]);
  assert.equal(value.authority.productionOutputUsedToGenerateExpectedForceOrMoment, false);
  assert.equal(value.authority.productionEnergyExpectedValueRequired, false);
  assert.equal(value.authority.productionEnergyAcceptedByConvergenceOnly, true);
  assert.equal(value.authority.coarseLevelRetainedForTrendAudit, true);
  assert.equal(
    value.convergence.strainEnergy.method,
    'FINEST_THREE_OF_GOVERNED_FOUR_LEVEL_RICHARDSON_GCI',
  );
  assert.deepEqual(value.convergence.strainEnergy.governedLevelOrdinals, [1, 2, 3, 4]);
  assert.deepEqual(value.convergence.strainEnergy.evaluatedLevelOrdinals, [2, 3, 4]);
}
function verifyProductionStress(value) {
  assert.equal(value.schema, 'lafea-bucket-01-production-lug-probe-spec/v2');
  assert.deepEqual(value.meshLadder.map((row) => row.elementCount), [64, 256, 1024, 4096]);
  assert.deepEqual(value.convergenceWindow.governedLevelOrdinals, [1, 2, 3, 4]);
  assert.deepEqual(value.convergenceWindow.evaluatedLevelOrdinals, [2, 3, 4]);
  assert.equal(value.authority.productionOutputUsedToSelectCoordinates, false);
  assert.equal(value.authority.productionOutputUsedToSetTolerances, false);
  assert.equal(value.authority.movingMaximumUsed, false);
  assert.equal(value.authority.integrationPointExtrapolationUsed, false);
  assert.equal(
    value.authority.recovery,
    'DIRECT_T6_B_MATRIX_AT_FIXED_PHYSICAL_COORDINATE',
  );
  assert.equal(
    value.authority.acceptance,
    'FINEST_THREE_OF_GOVERNED_FOUR_LEVEL_GCI_AT_FIXED_PHYSICAL_COORDINATES',
  );
}
function collectProductionMarkers(value, pathValue = '', rows = []) {
  if (!value || typeof value !== 'object') return rows;
  for (const [key, child] of Object.entries(value)) {
    const current = pathValue ? `${pathValue}.${key}` : key;
    if (/production.*(used|generate)/iu.test(key) && typeof child === 'boolean') rows.push({ path: current, value: child });
    collectProductionMarkers(child, current, rows);
  }
  return rows;
}
function close(actual, expected, label) {
  const scale = Math.max(Math.abs(actual), Math.abs(expected), 1e-30);
  assert.ok(Math.abs(actual - expected) / scale <= 1e-14, `${label}: ${actual} != ${expected}`);
}
