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

assert.equal(registry.schema, 'lafea-bucket-01-expected-value-registry/v1');
assert.equal(registry.freezeAuthority, 'EXACT_GIT_HEAD_FILE_SET');
assert.equal(registry.productionOutputMayGenerateExpectedValues, false);
assert.equal(registry.entries.length, 6);
assert.equal(new Set(registry.entries.map((row) => row.entryId)).size, 6);
assert.equal(new Set(registry.entries.map((row) => row.path)).size, 6);

const entries = registry.entries.map((definition) => inspect(definition));
const definitionSetBase = {
  schema: 'lafea-bucket-01-expected-value-definition-set/v1',
  registryHash: canonicalLafeaSha256(registry),
  entries,
};
const definitionSetHash = canonicalLafeaSha256(definitionSetBase);
const reportBase = {
  schema: 'lafea-bucket-01-expected-value-registry-evidence/v1',
  producerRevision: 'B01-EXPECTED-VALUE-REGISTRY.1',
  registryHash: definitionSetBase.registryHash,
  definitionSetHash,
  entries,
  authority: {
    exactHeadFileSetFrozen: true,
    independentClosedFormOracleCount: entries.filter((row) => row.role === 'INDEPENDENT_CLOSED_FORM_ORACLE').length,
    productionConvergenceDefinitionCount: entries.filter((row) => row.role !== 'INDEPENDENT_CLOSED_FORM_ORACLE').length,
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
  assert.ok(['INDEPENDENT_CLOSED_FORM_ORACLE', 'FROZEN_PRODUCTION_CONVERGENCE_DEFINITION', 'FROZEN_PRODUCTION_STRESS_LOCATION_DEFINITION'].includes(definition.role));
  const absolute = path.join(ROOT, definition.path);
  const raw = fs.readFileSync(absolute);
  const value = JSON.parse(raw.toString('utf8'));
  assert.equal(value.schema, definition.schema, definition.path);
  if (definition.role === 'INDEPENDENT_CLOSED_FORM_ORACLE') verifyClosedForm(value, definition.path);
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
  const markers = collectProductionMarkers(value);
  assert.ok(markers.length > 0, `${label} lacks production-output authority marker`);
  assert.equal(markers.every((row) => row.value === false), true, `${label} permits production-derived expected values`);
}
function verifyProductionResponse(value) {
  assert.equal(value.authority.productionOutputUsedToGenerateExpectedForceOrMoment, false);
  assert.equal(value.authority.productionEnergyExpectedValueRequired, false);
  assert.equal(value.authority.productionEnergyAcceptedByConvergenceOnly, true);
  assert.equal(value.convergence.strainEnergy.method, 'THREE_LEVEL_RICHARDSON_GCI');
}
function verifyProductionStress(value) {
  assert.equal(value.authority.productionOutputUsedToSelectCoordinates, false);
  assert.equal(value.authority.productionOutputUsedToSetTolerances, false);
  assert.equal(value.authority.movingMaximumUsed, false);
  assert.equal(value.authority.acceptance, 'THREE_LEVEL_GCI_AT_FIXED_PHYSICAL_COORDINATES');
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
