#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { validateTemplateBenchmarkManifest } from '../src/core/lafea-application-templates/contracts.js';
import {
  LAFEA_T5_CONTROLLED_REFERENCE_CASES,
  LAFEA_T5_QUALIFICATION_TEMPLATE_IDS,
  LAFEA_T5_TEMPLATE_BENCHMARK_MANIFESTS,
} from '../src/core/lafea-application-templates/t5-qualification.js';

assert.deepEqual(LAFEA_T5_QUALIFICATION_TEMPLATE_IDS, [
  'ALG-LOAD-REFERENCE-TRANSFER',
  'ALG-PIPE-SECTION-COMBINED',
  'C2D-LUG-PINHOLE',
  'C2D-PIPE-PAD-SECTION',
]);
assert.equal(LAFEA_T5_CONTROLLED_REFERENCE_CASES.length, 30);
assert.equal(LAFEA_T5_TEMPLATE_BENCHMARK_MANIFESTS.length, 4);

const benchmarkIds = new Set();
const expectedHashes = new Set();
for (const reference of LAFEA_T5_CONTROLLED_REFERENCE_CASES) {
  assert.equal(reference.evidenceBasis, 'CONTROLLED_REFERENCE_DATASET');
  assert.equal(
    reference.independenceRule,
    'EXPECTED_PROJECTION_AUTHORED_WITHOUT_IMPORTING_PRODUCTION_COMPILER',
  );
  assert.match(reference.expectedResultHash, /^fnv1a64:[0-9a-f]{16}$/u);
  assert.equal(semanticHash(reference.expected), reference.expectedResultHash);
  assert.equal(benchmarkIds.has(reference.benchmarkId), false);
  benchmarkIds.add(reference.benchmarkId);
  expectedHashes.add(reference.expectedResultHash);
}
assert.equal(benchmarkIds.size, 30);
assert.equal(expectedHashes.size, 30);

for (const manifest of LAFEA_T5_TEMPLATE_BENCHMARK_MANIFESTS) {
  assert.equal(validateTemplateBenchmarkManifest(manifest).ok, true);
  assert.equal(manifest.revision, 2);
  assert.equal(manifest.qualificationStatus, 'NOT_QUALIFIED');
  assert.ok(manifest.limitations.includes(
    'No template release, readiness or executable status is promoted by this manifest.',
  ));
  const golden = manifest.benchmarks.filter(
    (row) => row.benchmarkId.endsWith('GOLDEN-E2E-01'),
  );
  assert.equal(golden.length, 1);
  assert.equal(golden[0].status, 'BLOCKED');
  assert.equal(golden[0].evidenceBasis, 'UNRESOLVED');
  assert.equal(golden[0].expectedResultHash, null);
  const compilerCases = manifest.benchmarks.filter(
    (row) => !row.benchmarkId.endsWith('GOLDEN-E2E-01'),
  );
  compilerCases.forEach((row) => {
    assert.equal(row.status, 'NOT_RUN');
    assert.equal(row.evidenceBasis, 'CONTROLLED_REFERENCE_DATASET');
    assert.match(row.expectedResultHash, /^fnv1a64:[0-9a-f]{16}$/u);
  });
}

assert.equal(
  LAFEA_T5_TEMPLATE_BENCHMARK_MANIFESTS.some(
    (manifest) => manifest.qualificationStatus === 'QUALIFIED',
  ),
  false,
);

const oracleSource = readFileSync(
  new URL(
    '../src/core/lafea-application-templates/benchmark-fixtures/t5-controlled-reference.js',
    import.meta.url,
  ),
  'utf8',
);
for (const forbidden of [
  'compileLafeaApplicationTemplate',
  'compileLafeaContinuumApplicationTemplate',
  'calculateLocalAttachmentFoundation',
  'calculateLocalAttachmentScreening',
  'calculateLocalContinuum',
  'executeLafeaStage',
]) {
  assert.equal(
    oracleSource.includes(forbidden),
    false,
    `Controlled reference dataset must not import or invoke ${forbidden}.`,
  );
}
assert.ok(oracleSource.includes('EXPECTED_PROJECTION_AUTHORED_WITHOUT_IMPORTING_PRODUCTION_COMPILER'));
assert.ok(oracleSource.includes('T5_REFERENCE_HASH_DRIFT'));

console.log(JSON.stringify({
  check: 'lafea-template-t5-anti-drift',
  status: 'PASS',
  qualificationTemplateCount: LAFEA_T5_QUALIFICATION_TEMPLATE_IDS.length,
  controlledReferenceCaseCount: LAFEA_T5_CONTROLLED_REFERENCE_CASES.length,
  uniqueExpectedHashCount: expectedHashes.size,
  candidateManifestCount: LAFEA_T5_TEMPLATE_BENCHMARK_MANIFESTS.length,
  qualifiedManifestCount: 0,
  executableTemplateCount: 0,
  goldenEndToEndStatus: 'BLOCKED',
}, null, 2));
