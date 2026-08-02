import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COMMON_ENRICHED_CONSUMERS,
  CONSUMER_READINESS_STATUSES,
  ENRICHMENT_STATUSES,
  MASTER_SOURCE_KINDS,
} from '../src/core/common-enriched-properties/index.js';

assert.deepEqual(ENRICHMENT_STATUSES, [
  'RESOLVED_EXACT',
  'RESOLVED_DERIVED',
  'PROPOSED_REVIEW',
  'BLOCKED_MISSING',
  'BLOCKED_AMBIGUOUS',
  'BLOCKED_CONFLICT',
  'BLOCKED_STALE_SOURCE',
  'NOT_APPLICABLE',
]);
assert.deepEqual(COMMON_ENRICHED_CONSUMERS, [
  'EMPIRICAL_LOADS',
  'LFEA_HANDOFF',
  'ENRICHED_STAGED_JSON_EXPORT',
]);
assert.ok(CONSUMER_READINESS_STATUSES.includes('BLOCKED_NOT_CONFIGURED'));
assert.ok(MASTER_SOURCE_KINDS.includes('DERIVATION_POLICY_REGISTER'));

const files = [
  'src/core/common-enriched-properties/source-snapshot.js',
  'src/core/common-enriched-properties/field.js',
  'src/core/common-enriched-properties/target-record.js',
  'src/core/common-enriched-properties/candidate.js',
  'src/core/common-enriched-properties/publication.js',
  'src/core/common-enriched-properties/consumer-readiness.js',
];
const forbiddenTokens = [
  'default-zero',
  'config-default',
  'standard-wall',
  'generic steel density',
  'service consensus',
  'localStorage',
  'Math.random(',
  'Date.now(',
];
for (const file of files) {
  const content = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  for (const token of forbiddenTokens) {
    assert.equal(content.includes(token), false, `${file} contains forbidden token ${token}`);
  }
  assert.equal(/from ['"].*(first-cut-load-estimation|linear-fea|lafea|workspace)\//u.test(content), false,
    `${file} must not import a consumer, solver, or workspace module`);
}

const publicationSource = await readFile(
  new URL('../src/core/common-enriched-properties/publication.js', import.meta.url),
  'utf8',
);
assert.match(publicationSource, /decision\.decision !== 'APPROVE'/u);
assert.match(publicationSource, /decision\.candidateSemanticHash !== candidate\.semanticHash/u);
assert.match(publicationSource, /deepFreeze/u);

console.log('PASS common enriched properties anti-drift checks');
