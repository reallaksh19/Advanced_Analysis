import assert from 'node:assert/strict';
import { buildQualificationFixture } from './enriched-staged-json-fixtures.mjs';
import {
  canonicalTransportEvidence,
  exportEnrichedStagedJson,
  preservationEvidence,
  requirePreservation,
  requireSourceUnmutated,
} from './enriched-staged-json-export-harness.mjs';
import {
  assertDeepFrozen,
  assertFailureCode,
  cloneJson,
  semanticHash,
} from './enriched-staged-json-qualification-helpers.mjs';

const EXPECTED_EXPORTS = Object.freeze({
  singleRoot: Object.freeze({ exportHash: 'sha256:ee76c900a4fcca25fde240eb33da2cec512547a3d5ec48fd70696b81de155845', canonicalHash: 'sha256:13f7865c9904507f8f2ee5c011042b82aef966c831d12eb63d3613b936c07a49' }),
  branchArray: Object.freeze({ exportHash: 'sha256:3aaa2988bffc637bd1fb44142b99e51a17f72e8674406992d2eacc3253ffd0d4', canonicalHash: 'sha256:497473f46558079460d8cbf3e6e3f350c7aa176b3455b925cd0048d002dbafe7' }),
});

for (const name of ['singleRoot', 'branchArray']) {
  const fixture = buildQualificationFixture(name);
  const sourceBefore = semanticHash(fixture.stagedJson);
  const beforeEvidence = preservationEvidence(fixture.stagedJson);
  const output = exportEnrichedStagedJson(fixture.stagedJson, fixture.baseline);
  assert.equal(semanticHash(fixture.stagedJson), sourceBefore);
  assert.deepEqual(output.engineeringEnrichmentManifest.preservationEvidence, beforeEvidence);
  assertDeepFrozen(output);
  assert.equal(output.engineeringEnrichmentManifest.exportSemanticHash, EXPECTED_EXPORTS[name].exportHash);
  const parity = canonicalTransportEvidence(output, { maxChunkBytes: 4096 });
  assert.equal(parity.fileCanonicalHash, parity.apiCanonicalHash);
  assert.equal(parity.fileCanonicalHash, EXPECTED_EXPORTS[name].canonicalHash);
  assert.ok(parity.maxChunkBytes <= 4096);
}


{
  const fixture = buildQualificationFixture('singleRoot');
  const source = cloneJson(fixture.stagedJson);
  const expectedSourceHash = semanticHash(source);
  source.POS.x += 0.25;
  assertFailureCode(() => requireSourceUnmutated(source, expectedSourceHash), 'ENRICHED_STAGED_JSON_SOURCE_MUTATED');
}

{
  const fixture = buildQualificationFixture('branchArray');
  const before = preservationEvidence(fixture.stagedJson);
  const source = cloneJson(fixture.stagedJson);
  source[0].children.reverse();
  const after = preservationEvidence(source);
  assertFailureCode(() => requirePreservation(before, after), 'ENRICHED_STAGED_JSON_GEOMETRY_HASH_MISMATCH');
}

{
  const fixture = buildQualificationFixture('singleRoot');
  const source = cloneJson(fixture.stagedJson);
  source.children[0].targetId = 'TARGET:DIFFERENT:EXACT:IDENTITY';
  const baseline = cloneJson(fixture.baseline);
  baseline.sourceModelHash = semanticHash(source);
  baseline.semanticHash = semanticHash({
    schema: baseline.schema,
    baselineId: baseline.baselineId,
    projectId: baseline.projectId,
    revision: baseline.revision,
    publishedAt: baseline.publishedAt,
    sourceModelHash: baseline.sourceModelHash,
    targetRecords: baseline.targetRecords,
  });
  assertFailureCode(() => exportEnrichedStagedJson(source, baseline), 'ENRICHED_STAGED_JSON_TARGET_JOIN_MISSING');
}

{
  const fixture = buildQualificationFixture('singleRoot');
  const baseline = cloneJson(fixture.baseline);
  baseline.targetRecords.pop();
  baseline.semanticHash = semanticHash({
    schema: baseline.schema,
    baselineId: baseline.baselineId,
    projectId: baseline.projectId,
    revision: baseline.revision,
    publishedAt: baseline.publishedAt,
    sourceModelHash: baseline.sourceModelHash,
    targetRecords: baseline.targetRecords,
  });
  assertFailureCode(() => exportEnrichedStagedJson(fixture.stagedJson, baseline), 'ENRICHED_STAGED_JSON_TARGET_JOIN_MISSING');
}

{
  const fixture = buildQualificationFixture('branchArray');
  const baseline = cloneJson(fixture.baseline);
  baseline.targetRecords.push(cloneJson(baseline.targetRecords[0]));
  baseline.semanticHash = semanticHash({
    schema: baseline.schema,
    baselineId: baseline.baselineId,
    projectId: baseline.projectId,
    revision: baseline.revision,
    publishedAt: baseline.publishedAt,
    sourceModelHash: baseline.sourceModelHash,
    targetRecords: baseline.targetRecords,
  });
  assertFailureCode(() => exportEnrichedStagedJson(fixture.stagedJson, baseline), 'ENRICHED_STAGED_JSON_TARGET_JOIN_DUPLICATE');
}

{
  const fixture = buildQualificationFixture('singleRoot');
  const baseline = cloneJson(fixture.baseline);
  baseline.semanticHash = 'sha256:tampered';
  assertFailureCode(() => exportEnrichedStagedJson(fixture.stagedJson, baseline), 'ENRICHED_STAGED_JSON_BASELINE_HASH_MISMATCH');
}

{
  const fixture = buildQualificationFixture('branchArray');
  const source = cloneJson(fixture.stagedJson);
  source[0].engineering = { wallThicknessMm: 9 };
  const baseline = cloneJson(fixture.baseline);
  baseline.sourceModelHash = semanticHash(source);
  baseline.semanticHash = semanticHash({
    schema: baseline.schema,
    baselineId: baseline.baselineId,
    projectId: baseline.projectId,
    revision: baseline.revision,
    publishedAt: baseline.publishedAt,
    sourceModelHash: baseline.sourceModelHash,
    targetRecords: baseline.targetRecords,
  });
  assertFailureCode(() => exportEnrichedStagedJson(source, baseline), 'ENRICHED_STAGED_JSON_DUPLICATE_AUTHORITY_NAMESPACE');
}

{
  const fixture = buildQualificationFixture('singleRoot');
  const baseline = cloneJson(fixture.baseline);
  const blocked = baseline.targetRecords[0].fields.find((field) => field.status.startsWith('BLOCKED_'));
  blocked.value = 7850;
  baseline.semanticHash = semanticHash({
    schema: baseline.schema,
    baselineId: baseline.baselineId,
    projectId: baseline.projectId,
    revision: baseline.revision,
    publishedAt: baseline.publishedAt,
    sourceModelHash: baseline.sourceModelHash,
    targetRecords: baseline.targetRecords,
  });
  assertFailureCode(() => exportEnrichedStagedJson(fixture.stagedJson, baseline), 'ENRICHED_STAGED_JSON_BLOCKER_VALUE_INVENTED');
}

console.log(JSON.stringify({ status: 'PASS', check: 'preservation-and-fail-closed' }));
