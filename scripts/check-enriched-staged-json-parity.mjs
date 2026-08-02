import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildQualificationFixture } from './enriched-staged-json-fixtures.mjs';
import {
  canonicalTransportEvidence,
  exportEnrichedStagedJson,
  validateExportEnvelope,
} from './enriched-staged-json-export-harness.mjs';
import { assertFailureCode, cloneJson } from './enriched-staged-json-qualification-helpers.mjs';

const fixture = buildQualificationFixture('branchArray');
const output = exportEnrichedStagedJson(fixture.stagedJson, fixture.baseline);
const evidence = canonicalTransportEvidence(output, { maxChunkBytes: 2048 });
assert.equal(evidence.fileCanonicalHash, 'sha256:497473f46558079460d8cbf3e6e3f350c7aa176b3455b925cd0048d002dbafe7');
assert.equal(evidence.fileCanonicalHash, evidence.apiCanonicalHash);
assert.equal(evidence.fileCanonicalHash, evidence.streamCanonicalHash);
assert.ok(evidence.maxChunkBytes <= 2048);

const hashes = [];
for (const timezone of ['UTC', 'Asia/Muscat', 'Pacific/Auckland']) {
  const child = spawnSync(process.execPath, ['scripts/enriched-staged-json-hash-worker.mjs', 'branchArray'], {
    cwd: process.cwd(),
    env: { ...process.env, TZ: timezone },
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr);
  hashes.push(JSON.parse(child.stdout).canonicalHash);
}
assert.equal(new Set(hashes).size, 1);

const tampered = cloneJson(output);
tampered.engineeringEnrichmentManifest.exportSemanticHash = 'sha256:tampered';
assertFailureCode(() => validateExportEnvelope(tampered), 'ENRICHED_STAGED_JSON_FILE_API_PARITY_MISMATCH');

console.log(JSON.stringify({ status: 'PASS', check: 'file-api-parity', evidence }));
