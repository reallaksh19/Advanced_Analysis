import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildQualificationFixture, fixtureSummary } from './enriched-staged-json-fixtures.mjs';
import {
  canonicalTransportEvidence,
  exportEnrichedStagedJson,
  preservationEvidence,
} from './enriched-staged-json-export-harness.mjs';
import { memoryEvidence, semanticHash } from './enriched-staged-json-qualification-helpers.mjs';

const records = [];
const fixtureStart = performance.now();
const fixture = buildQualificationFixture('large');
records.push(record('fixture-generation', fixtureStart, {
  summary: fixtureSummary(fixture),
  outputDigest: fixture.semanticHash,
}));

const preservationStart = performance.now();
const before = preservationEvidence(fixture.stagedJson);
records.push(record('preservation-projection', preservationStart, {
  nodeCount: before.nodeCount,
  outputDigest: semanticHash(before),
}));

const exportStart = performance.now();
const output = exportEnrichedStagedJson(fixture.stagedJson, fixture.baseline);
records.push(record('exact-id-export', exportStart, {
  joinedRecordCount: output.engineeringEnrichmentManifest.joinedRecordCount,
  outputDigest: output.engineeringEnrichmentManifest.exportSemanticHash,
}));

const transportStart = performance.now();
const parity = canonicalTransportEvidence(output, { maxChunkBytes: 16384 });
records.push(record('streaming-and-parity', transportStart, {
  ...parity,
  outputDigest: parity.fileCanonicalHash,
}));

assert.equal(fixture.semanticHash, 'sha256:f5be5ade789df9e89906362e18045dced474d27402cc4b46fbeb21d7df4ea27e');
assert.equal(output.engineeringEnrichmentManifest.exportSemanticHash, 'sha256:c434d5f18c37d272090d298a278c040c3dcc33d01341719f7578b308964b9c43');
assert.equal(output.engineeringEnrichmentManifest.joinedRecordCount, fixture.baseline.targetRecords.length);
assert.equal(before.nodeCount, output.engineeringEnrichmentManifest.preservationEvidence.nodeCount);
assert.ok(parity.maxChunkBytes <= 16384);
assert.ok(parity.chunkCount > 1);
assert.equal(parity.fileCanonicalHash, 'sha256:74daf1430486267f42f95c82230b765d93040240c953faadcc1231e2b9ba778c');
assert.equal(parity.fileByteLength, 30286306);
assert.equal(parity.chunkCount, 1849);
assert.equal(parity.fileCanonicalHash, parity.apiCanonicalHash);
assert.equal(parity.fileCanonicalHash, parity.streamCanonicalHash);

for (const entry of records) console.log(JSON.stringify(entry));
console.log(JSON.stringify({
  status: 'PASS',
  check: 'benchmark',
  stages: records.length,
  structuralGate: {
    targetCount: fixture.baseline.targetRecords.length,
    nodeCount: before.nodeCount,
    maxChunkBytes: parity.maxChunkBytes,
    canonicalHash: parity.fileCanonicalHash,
  },
}));

function record(stage, startedAt, evidence) {
  return {
    schema: 'enriched-staged-json-benchmark-evidence/v1',
    stage,
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    runtime: process.version,
    platform: process.platform,
    architecture: process.arch,
    timezone: process.env.TZ ?? 'system-default',
    memory: memoryEvidence(),
    evidence,
  };
}
