import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/core/common-enriched-properties/consumer-projection.js', import.meta.url),
  'utf8',
);
const forbidden = [
  ['defaultValue', 'value fallback'],
  ['fallbackValue', 'value fallback'],
  ["|| 0", 'zero substitution'],
  ["?? 0", 'zero substitution'],
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
assert.match(source, /readiness\.status !== 'READY'/u);
assert.match(source, /policy\.adapterVersion !== readiness\.adapterVersion/u);
assert.match(source, /policy\.configurationHash !== readiness\.configurationHash/u);
assert.match(source, /qualifiedFields\.has\(field\.sourceField\)/u);
assert.match(source, /sourceByField/u);
assert.match(source, /!source\.approved/u);
assert.match(source, /source\.status === 'NOT_APPLICABLE'/u);
assert.match(source, /createCommonEnrichedConsumerProjectionDescriptor/u);
assert.match(source, /payloadSemanticHash: payload\.semanticHash/u);
assert.match(source, /COMMON_ENRICHED_PROJECTION_FIELD_NOT_QUALIFIED/u);
assert.match(source, /COMMON_ENRICHED_PROJECTION_FIELD_INVALID/u);
console.log('PASS common enriched consumer projection anti-drift checks');
