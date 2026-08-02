import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/core/common-enriched-properties/consumer-handoff.js', import.meta.url),
  'utf8',
);
const forbidden = [
  ['autoAuthorize', 'automatic authorization'],
  ["decision: 'AUTHORIZE'", 'locally constructed authorization'],
  ["|| 'AUTHORIZE'", 'authorization fallback'],
  ['defaultPayload', 'payload fallback'],
  ['Date.now', 'hidden clock'],
  ['new Date()', 'hidden clock'],
  ['Math.random', 'random identity'],
  ['localStorage', 'browser persistence'],
  ["from '../../workspace", 'workspace dependency'],
  ["from '../first-cut", 'empirical execution dependency'],
  ["from '../linear-fea", 'LFEA execution dependency'],
  ['executeConsumer', 'consumer execution'],
  ['writeFile', 'file output'],
  ['fetch(', 'network execution'],
];
for (const [token, label] of forbidden) {
  assert.equal(source.includes(token), false, `forbidden ${label}: ${token}`);
}
assert.match(source, /requireCommonEnrichedConsumerReadinessEvaluation/u);
assert.match(source, /readiness\.status !== 'READY'/u);
assert.match(source, /decision\.decision === 'AUTHORIZE'/u);
assert.match(source, /decision\.baselineSemanticHash !== baseline\.semanticHash/u);
assert.match(source, /decision\.readinessSemanticHash !== readiness\.semanticHash/u);
assert.match(source, /decision\.payloadSemanticHash !== payload\.payloadSemanticHash/u);
assert.match(source, /payload\.adapterVersion !== readiness\.adapterVersion/u);
assert.match(source, /payload\.configurationHash !== readiness\.configurationHash/u);
assert.match(source, /baseline\.publishedAt/u);
assert.match(source, /payload\.createdAt/u);
assert.match(source, /decision\.decidedAt/u);
assert.match(source, /COMMON_ENRICHED_HANDOFF_NOT_READY/u);
console.log('PASS common enriched consumer handoff anti-drift checks');
