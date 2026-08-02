import { buildQualificationFixture, fixtureSummary } from './enriched-staged-json-fixtures.mjs';
import { canonicalTransportEvidence, exportEnrichedStagedJson } from './enriched-staged-json-export-harness.mjs';
import { semanticHash } from './enriched-staged-json-qualification-helpers.mjs';

const name = process.argv[2] ?? 'singleRoot';
const fixture = buildQualificationFixture(name);
const output = exportEnrichedStagedJson(fixture.stagedJson, fixture.baseline);
const evidence = canonicalTransportEvidence(output, { maxChunkBytes: 8192 });
process.stdout.write(JSON.stringify({
  fixture: fixtureSummary(fixture),
  exportSemanticHash: output.engineeringEnrichmentManifest.exportSemanticHash,
  canonicalHash: semanticHash(output),
  parity: evidence,
}));
