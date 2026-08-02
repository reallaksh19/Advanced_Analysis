import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/core/common-enriched-properties/publication-orchestration.js', import.meta.url),
  'utf8',
);
const forbidden = [
  ['autoApprove', 'automatic approval'],
  ["decision: 'APPROVE'", 'locally constructed approval'],
  ["|| 'APPROVE'", 'approval fallback'],
  ['defaultAuthority', 'authority fallback'],
  ['Date.now', 'hidden clock'],
  ['new Date()', 'hidden clock'],
  ['Math.random', 'random identity'],
  ['localStorage', 'browser persistence'],
  ["from '../../workspace", 'workspace dependency'],
  ["from '../first-cut", 'empirical consumer dependency'],
  ["from '../linear-fea", 'LFEA dependency'],
];
for (const [token, label] of forbidden) {
  assert.equal(source.includes(token), false, `forbidden ${label}: ${token}`);
}
assert.match(source, /requireCommonEnrichedPublicationDecision/u);
assert.match(source, /decision\.candidateSemanticHash !== candidate\.semanticHash/u);
assert.match(source, /decision\.evidenceHash !== candidate\.reviewLedgerHash/u);
assert.match(source, /candidate\.revision !== previousBaseline\.revision \+ 1/u);
assert.match(source, /decision\.decidedAt/u);
assert.match(source, /candidate\.createdAt/u);
assert.match(source, /previousBaseline\.publishedAt/u);
assert.match(source, /publishCommonEnrichedPropertiesBaseline/u);
assert.match(source, /decision\.decision === 'APPROVE'/u);
assert.match(source, /decision\.decision !== 'REJECT'/u);
assert.match(source, /input\.publicationIdentity !== null/u);
assert.match(source, /COMMON_ENRICHED_PUBLICATION_IDENTITY_REQUIRED/u);
assert.match(source, /COMMON_ENRICHED_PUBLICATION_REVIEW_LEDGER_MISMATCH/u);
assert.match(source, /COMMON_ENRICHED_PUBLICATION_REVISION_CHAIN_INVALID/u);
assert.match(source, /COMMON_ENRICHED_PUBLICATION_CHRONOLOGY_INVALID/u);
console.log('PASS common enriched publication orchestration anti-drift checks');
