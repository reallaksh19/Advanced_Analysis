// Benchmark A — immutable source ingestion and topology qualification.
//
// Governing input (verified against the repository directly, not asserted):
//   repo:   reallaksh19/3D_Converters
//   commit: 05ed229abe0299ccdfeeb04afd3e3402585d83c1
//   path:   Benchmarks/1885Sjson/EnrichedSjson
//   mirrored byte-for-byte into this repository at benchmarks/1885Sjson/EnrichedSjson
//
// A prior task brief asserted this fixture was 148,627 bytes with SHA-256
// 77e64a27d185afc8dbedde41f43383c63650c62a2ae75face5eac1356f5d07d3, representing
// 12 nodes / 10 pipes / 9 components / 0 loads / 0 supports. That does not match
// any file at the stated commit and path: the actual file is 1,785,455 bytes,
// SHA-256 e9a51723444e9490f5dff9c1ff4a5c56191873033d11a289946746ff1072c5da, and
// represents a real 279-component project with 139 source SUPPORT records. This
// was independently confirmed against a fresh clone of the source repository at
// the exact commit, and the repository owner confirmed the larger file is the
// correct one ("has all the support (Rest/guide/line stop), process parameters,
// etc") and that the smaller figures should be disregarded. Every expected value
// below was computed from the actual fixture in this session, not copied from
// the disputed brief and not invented to make this check pass.
//
// This check proves: exact byte/SHA identity of the immutable source, that the
// existing production ingestion path (normalizeWorkspaceDataset) parses it
// without silent repair, real object-type classification, real duplicate-ID
// detection, real unresolved/diagnostic accounting as recorded BY THE SOURCE
// FILE ITSELF (not invented by this check), and deterministic canonical-model
// identity across repeated ingestion of the same bytes. It does not solve
// anything — this fixture carries zero governed loads, materials, or restraint
// definitions ready for a solver; that is Benchmark B's job, not this one.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(root, 'benchmarks/1885Sjson/EnrichedSjson');

const EXPECTED_BYTES = 1785455;
const EXPECTED_SHA256 = 'e9a51723444e9490f5dff9c1ff4a5c56191873033d11a289946746ff1072c5da';

const bytes = await readFile(fixturePath);
assert.equal(bytes.length, EXPECTED_BYTES, 'Benchmark A fixture byte length must not drift.');
const sha256 = sha256Hex(bytes);
assert.equal(sha256, EXPECTED_SHA256, 'Benchmark A fixture SHA-256 must not drift.');

// Two independent parses from the same immutable bytes, proving determinism is
// a property of the pipeline and not an artefact of object identity reuse.
const datasetA = ingest(bytes);
const datasetB = ingest(bytes);

// --- Schema and topology reconstruction (existing production path; not a new,
// competing parser — see src/workspace/dataset-adapter.js) ---
assert.equal(datasetA.sourceSchema, 'inputxml-managed-stage/v1');
assert.equal(datasetA.summary.nodeCount, 279);
assert.equal(datasetA.summary.sourceNodeCount, 279);
assert.equal(datasetA.summary.sourceRootCount, 13, 'Root branch/group count.');

// --- Real per-type object classification (source TYPE field, unmodified) ---
const EXPECTED_TYPE_COUNTS = {
  BRANCH: 13,
  ELBO: 14,
  PIPE: 43,
  OLET: 10,
  SUPPORT: 139,
  FLAN: 22,
  GASK: 22,
  VALV: 4,
  INST: 5,
  REDU: 4,
  TEE: 3,
};
const typeCounts = countBy(datasetA.entities, (e) => e.entityType);
assert.deepEqual(typeCounts, EXPECTED_TYPE_COUNTS, 'Per-type object classification must match the source exactly.');
assert.equal(
  Object.values(typeCounts).reduce((a, b) => a + b, 0),
  279,
  'Type counts must exhaust every object; none silently dropped.',
);

// The existing adapter's coarse category (pipe / support / component) is a
// three-way bucket, not a mechanical-component classification: every non-
// SUPPORT, non-BRANCH type (ELBO, PIPE, OLET, FLAN, GASK, VALV, INST, REDU,
// TEE) is bucketed as "pipe", and only BRANCH nodes are bucketed as
// "component". That is recorded here as an observed fact, not silently
// accepted as a correct engineering classification — see the audit report.
assert.deepEqual(datasetA.summary, {
  nodeCount: 279,
  sourceNodeCount: 279,
  sourceRootCount: 13,
  pipes: 127,
  supports: 139,
  components: 13,
});

// --- Duplicate source-ID detection, computed independently of the adapter's
// internal fallback (see finding in the audit report: the adapter silently
// reroutes a colliding sourceEntityId to a synthetic ID rather than reporting
// it). Reported here explicitly, even though the true count is zero. ---
const duplicateSourceIds = Object.entries(datasetA.sourceModel.indexes.bySourceEntityId)
  .filter(([, occurrences]) => Array.isArray(occurrences) && occurrences.length > 1)
  .map(([sourceId, occurrences]) => ({ sourceId, occurrenceCount: occurrences.length }));
assert.deepEqual(duplicateSourceIds, [], 'No duplicate source entity IDs in this fixture.');

// --- Unresolved/diagnostic accounting, read verbatim from the source file's
// own CII2019 enrichment diagnostics (src attribute `diagnostics` per node) —
// not derived, invented, or remapped into a different vocabulary. ---
let entitiesWithDiagnostics = 0;
let totalDiagnosticEntries = 0;
const severityCounts = {};
const categoryCounts = {};
const fieldCounts = {};
const branchOwnersWithDiagnostics = new Set();
datasetA.entities.forEach((entity) => {
  const diagnostics = entity.properties.diagnostics || [];
  if (diagnostics.length) {
    entitiesWithDiagnostics += 1;
    branchOwnersWithDiagnostics.add(entity.branchOwner || entity.branchId);
  }
  diagnostics.forEach((diagnostic) => {
    totalDiagnosticEntries += 1;
    severityCounts[diagnostic.severity] = (severityCounts[diagnostic.severity] || 0) + 1;
    categoryCounts[diagnostic.category] = (categoryCounts[diagnostic.category] || 0) + 1;
    fieldCounts[diagnostic.field] = (fieldCounts[diagnostic.field] || 0) + 1;
  });
});
assert.equal(entitiesWithDiagnostics, 83);
assert.equal(totalDiagnosticEntries, 208);
assert.deepEqual(severityCounts, { BLOCKED: 208 });
assert.deepEqual(categoryCounts, { MISSING_ATTRIBUTE: 208 });
assert.deepEqual(fieldCounts, { lineNo: 83, pipingClass: 83, fluidDensityOpeKgM3: 42 });
assert.equal(branchOwnersWithDiagnostics.size, 8);

// No import-time schema/parse errors: ingestion of the full, unmodified byte
// stream succeeded without throwing and without any object being dropped.
const importErrors = [];

// --- Deterministic canonical-model identity ---
const canonicalSummaryA = buildCanonicalSummary(datasetA, { sha256, byteLength: bytes.length });
const canonicalSummaryB = buildCanonicalSummary(datasetB, { sha256, byteLength: bytes.length });
const canonicalHashA = semanticHash(canonicalSummaryA);
const canonicalHashB = semanticHash(canonicalSummaryB);
assert.equal(canonicalHashA, canonicalHashB, 'Canonical model identity must be repeatable across independent ingestions of the same bytes.');
assert.equal(JSON.stringify(canonicalSummaryA), JSON.stringify(canonicalSummaryB));

const evidence = {
  schema: 'benchmark-a-1885-enriched-sjson-evidence/v1',
  source: {
    repository: 'reallaksh19/3D_Converters',
    commit: '05ed229abe0299ccdfeeb04afd3e3402585d83c1',
    path: 'Benchmarks/1885Sjson/EnrichedSjson',
    mirroredAt: 'benchmarks/1885Sjson/EnrichedSjson',
    byteLength: bytes.length,
    sha256,
  },
  disputedBriefFacts: {
    note: 'A prior task brief stated different facts for this exact repo/commit/path; they do not match any file found there and are superseded by direct verification plus repository-owner confirmation.',
    stated: {
      byteLength: 148627,
      sha256: '77e64a27d185afc8dbedde41f43383c63650c62a2ae75face5eac1356f5d07d3',
      nodes: 12, pipes: 10, components: 9, loads: 0, supports: 0,
    },
  },
  topology: {
    nodeCount: datasetA.summary.nodeCount,
    sourceRootCount: datasetA.summary.sourceRootCount,
    typeCounts,
    adapterCategorySummary: datasetA.summary,
  },
  duplicateSourceIds,
  unresolved: {
    entitiesWithDiagnostics,
    totalDiagnosticEntries,
    severityCounts,
    categoryCounts,
    fieldCounts,
    branchOwnersWithDiagnostics: [...branchOwnersWithDiagnostics].sort(),
  },
  importErrors,
  canonicalModel: {
    hash: canonicalHashA,
    repeatable: canonicalHashA === canonicalHashB,
  },
};
const evidenceWithHash = { ...evidence, semanticHash: semanticHash(evidence) };
const json = `${JSON.stringify(evidenceWithHash, null, 2)}\n`;
const markdown = renderMarkdown(evidenceWithHash);
for (const directory of ['reports/qualification']) {
  await writeFile(path.join(root, directory, 'benchmark-a-1885-enriched-sjson.json'), json);
  await writeFile(path.join(root, directory, 'benchmark-a-1885-enriched-sjson.md'), markdown);
}

console.log(`Benchmark A (1885 EnrichedSjson) source ingestion check PASS; evidence ${evidenceWithHash.semanticHash}.`);

function ingest(sourceBytes) {
  const raw = JSON.parse(sourceBytes.toString('utf8'));
  return normalizeWorkspaceDataset(raw, 'benchmarks/1885Sjson/EnrichedSjson', {
    sourceBytes,
    sourceSha256: EXPECTED_SHA256,
  });
}

function buildCanonicalSummary(dataset, sourceMeta) {
  return {
    schema: 'benchmark-a-canonical-summary/v1',
    source: sourceMeta,
    datasetId: dataset.datasetId,
    sourceSchema: dataset.sourceSchema,
    summary: dataset.summary,
    entityDigest: dataset.entities.map((entity) => ({
      entityId: entity.entityId,
      entityType: entity.entityType,
      category: entity.category,
      branchId: entity.branchId,
      diagnosticCount: (entity.properties.diagnostics || []).length,
    })),
  };
}

function countBy(items, keyFn) {
  const counts = {};
  items.forEach((item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function sha256Hex(sourceBytes) {
  return createHash('sha256').update(sourceBytes).digest('hex');
}

function renderMarkdown(ev) {
  const typeRows = Object.entries(ev.topology.typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `| ${type} | ${count} |`)
    .join('\n');
  const fieldRows = Object.entries(ev.unresolved.fieldCounts)
    .map(([field, count]) => `| ${field} | ${count} |`)
    .join('\n');
  return `# Benchmark A — 1885 EnrichedSjson Source Ingestion

Evidence hash: \`${ev.semanticHash}\`

## Source identity

| Field | Value |
|---|---|
| Repository | \`${ev.source.repository}\` |
| Commit | \`${ev.source.commit}\` |
| Path | \`${ev.source.path}\` |
| Bytes | ${ev.source.byteLength} |
| SHA-256 | \`${ev.source.sha256}\` |

**Note on a disputed prior brief:** an earlier task description stated this exact repo/commit/path was 148,627 bytes (SHA \`${ev.disputedBriefFacts.stated.sha256}\`, 12 nodes / 10 pipes / 9 components / 0 loads / 0 supports). No such file exists at that commit and path. The figures above were verified directly against a fresh clone of the source repository and confirmed by the repository owner as the correct fixture. All counts in this report are computed from the actual 1,785,455-byte file, not the disputed brief.

## Topology (real, computed — not asserted)

${ev.topology.nodeCount} total objects across ${ev.topology.sourceRootCount} root branch groups.

| Type | Count |
|---|---|
${typeRows}

Adapter coarse category summary (pipe/support/component bucket — see audit report for the caveat that only BRANCH nodes land in "component"): pipes ${ev.topology.adapterCategorySummary.pipes}, supports ${ev.topology.adapterCategorySummary.supports}, components ${ev.topology.adapterCategorySummary.components}.

## Duplicate source IDs

${ev.duplicateSourceIds.length} duplicate source entity ID group(s) detected.

## Unresolved conditions (read verbatim from the source file's own CII2019 enrichment diagnostics)

${ev.unresolved.entitiesWithDiagnostics} of ${ev.topology.nodeCount} objects carry at least one unresolved-attribute diagnostic; ${ev.unresolved.totalDiagnosticEntries} diagnostic entries total, spanning ${ev.unresolved.branchOwnersWithDiagnostics.length} branch/sub-branch groups. All are source-reported severity \`BLOCKED\`, category \`MISSING_ATTRIBUTE\` — these block downstream weight/load calculation for the affected objects, not import.

| Field | Occurrences |
|---|---|
${fieldRows}

Affected branch/sub-branch groups:

${ev.unresolved.branchOwnersWithDiagnostics.map((b) => `- \`${b}\``).join('\n')}

## Canonical model identity

Hash: \`${ev.canonicalModel.hash}\`. Repeatable across two independent ingestions of the same immutable bytes: **${ev.canonicalModel.repeatable}**.

## Scope

This is Benchmark A only: source ingestion and topology qualification. It proves the fixture imports deterministically and its defects are reported, not repaired. It does not assign materials, sections, supports, or loads, and it does not run a solver — see the audit report for what Benchmark B (a governed analysis-authority overlay) would require.
`;
}
