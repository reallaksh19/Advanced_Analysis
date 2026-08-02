import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/core/common-enriched-properties/consumer-readiness-evaluation.js', import.meta.url),
  'utf8',
);
const forbidden = [
  ['autoConfigure', 'automatic consumer configuration'],
  ["|| 'READY'", 'readiness fallback'],
  ['defaultRequirements', 'requirement fallback'],
  ['Date.now', 'hidden clock'],
  ['new Date()', 'hidden clock'],
  ['Math.random', 'random identity'],
  ['localStorage', 'browser persistence'],
  ["from '../../workspace", 'workspace dependency'],
  ["from '../first-cut", 'empirical execution dependency'],
  ["from '../linear-fea", 'LFEA execution dependency'],
  ['stagedJson', 'stagedJson mutation'],
];
for (const [token, label] of forbidden) {
  assert.equal(source.includes(token), false, `forbidden ${label}: ${token}`);
}
assert.match(source, /requireAllConsumers/u);
assert.match(source, /buildFieldIndex/u);
assert.equal(source.includes('targetRecords.filter'), false, 'must not rescan all targets per requirement');
assert.match(source, /policy\.configured/u);
assert.match(source, /BLOCKED_NOT_CONFIGURED/u);
assert.match(source, /baseline\.sourceModelHash !== currentSourceModelHash/u);
assert.match(source, /SOURCE_SNAPSHOT_STALE/u);
assert.match(source, /FIELD_UNAPPROVED/u);
assert.match(source, /FIELD_UNRESOLVED/u);
assert.match(source, /BLOCKED_STALE_SOURCE/u);
assert.match(source, /BLOCKED_MISSING_FIELDS/u);
assert.match(source, /BLOCKED_UNAPPROVED_FIELDS/u);
assert.match(source, /createCommonEnrichedConsumerReadiness/u);
console.log('PASS common enriched consumer readiness evaluation anti-drift checks');
