import { buildEnrichmentUiFixture, fixtureSummary } from './enrichment-ui-phase0-fixtures.mjs';

const fixtureName = process.argv[2] ?? 'small';
const fixture = buildEnrichmentUiFixture(fixtureName);
process.stdout.write(`${JSON.stringify(fixtureSummary(fixture))}\n`);
