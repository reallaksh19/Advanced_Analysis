#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canonicalJsonArtifactHash,
  validateExternalReleaseEvidence,
} from './lfea-piping-external-release-evidence-check.mjs';

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, code) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, code, `expected ${code}, received ${error?.code}`);
    return true;
  });
}

function ledger() {
  return JSON.parse(
    fs.readFileSync('release-evidence/lfea-piping-release-evidence.json', 'utf8'),
  );
}

console.log('\n--- [SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE] Phase 6C release intake ---');

test('P6C-INTAKE-01', 'Policy mode remains unresolved when no package is supplied', () => {
  const result = validateExternalReleaseEvidence({
    root: process.cwd(),
    ledger: ledger(),
    releaseMode: false,
  });
  assert.equal(result.status, 'UNRESOLVED_GATE');
  assert.equal(result.releaseEligible, false);
  assert.equal(result.packagePath, null);
});

test('P6C-INTAKE-02', 'Release mode fails closed without a package artifact', () => {
  expectCode(
    () => validateExternalReleaseEvidence({
      root: process.cwd(),
      ledger: ledger(),
      releaseMode: true,
    }),
    'LFEA_EXTERNAL_PACKAGE_ARTIFACT_MISSING',
  );
});

test('P6C-INTAKE-03', 'Manifest path traversal is rejected before file access', () => {
  const changed = ledger();
  changed.artifacts.externalQualificationPackage = '../evidence/package.json';
  changed.exactHead = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  expectCode(
    () => validateExternalReleaseEvidence({
      root: process.cwd(),
      ledger: changed,
      releaseMode: false,
    }),
    'LFEA_EXTERNAL_ARTIFACT_PATH_INVALID',
  );
});

test('P6C-INTAKE-04', 'Scripts and fixtures are ineligible evidence roots', () => {
  for (const relativePath of [
    'scripts/package.json',
    'tests/package.json',
    'fixtures/package.json',
    'mocks/package.json',
  ]) {
    const changed = ledger();
    changed.artifacts.externalQualificationPackage = relativePath;
    changed.exactHead = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expectCode(
      () => validateExternalReleaseEvidence({
        root: process.cwd(),
        ledger: changed,
        releaseMode: false,
      }),
      'LFEA_EXTERNAL_ARTIFACT_PATH_INELIGIBLE',
    );
  }
});

test('P6C-INTAKE-05', 'Canonical artifact hash is independent of object key order', () => {
  const left = { schema: 'record/v1', value: 42, nested: { a: 1, b: 2 } };
  const right = { nested: { b: 2, a: 1 }, value: 42, schema: 'record/v1' };
  assert.equal(canonicalJsonArtifactHash(left), canonicalJsonArtifactHash(right));
  assert.match(canonicalJsonArtifactHash(left), /^fnv1a64:[0-9a-f]{16}$/u);
});

test('P6C-INTAKE-06', 'Release manifest reserves the external package slot', () => {
  const value = ledger();
  assert.equal(Object.hasOwn(value.artifacts, 'externalQualificationPackage'), true);
  assert.equal(value.artifacts.externalQualificationPackage, null);
  assert.equal(value.gates.G8_REAL_MODEL_RECONCILIATION, 'UNRESOLVED_GATE');
  assert.equal(value.gates.G9_COMMERCIAL_CORROBORATION, 'UNRESOLVED_GATE');
  assert.equal(value.gates.G10_RELEASE_ROLLBACK, 'UNRESOLVED_GATE');
});

console.log('[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE] Phase 6C checks PASS');
