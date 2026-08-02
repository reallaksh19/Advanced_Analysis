import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/core/common-enriched-properties/candidate-assembly.js', import.meta.url),
  'utf8',
);
const forbidden = [
  ['fieldPrecedence', 'field precedence selection'],
  ['preferredSource', 'preferred source selection'],
  ['firstFound', 'first-found field selection'],
  ['lastWriteWins', 'last-write-wins field selection'],
  ['defaultValue', 'default value injection'],
  ['fallback', 'fallback behavior'],
  ['Date.now', 'hidden clock'],
  ['Math.random', 'random identity'],
  ['localStorage', 'browser persistence'],
  ["from '../../workspace", 'workspace dependency'],
  ["from '../first-cut", 'empirical consumer dependency'],
  ["from '../linear-fea", 'LFEA dependency'],
];
for (const [token, label] of forbidden) {
  assert.equal(source.includes(token), false, `forbidden ${label}: ${token}`);
}
assert.match(source, /COMMON_ENRICHED_CANDIDATE_STATUS/u);
assert.match(source, /UNAPPROVED_CANDIDATE|COMMON_ENRICHED_CANDIDATE_STATUS/u);
assert.match(source, /COMMON_ENRICHED_CANDIDATE_FIELD_CONFLICT/u);
assert.match(source, /fieldOwners\.get\(field\.field\)/u);
assert.match(source, /COMMON_ENRICHED_CANDIDATE_TARGET_COVERAGE_INVALID/u);
assert.match(source, /COMMON_ENRICHED_CANDIDATE_DEPENDENCY_MISMATCH/u);
assert.match(source, /REQUIRED_SNAPSHOT_KINDS/u);
assert.match(source, /componentWeight\.lineListResolutionSemanticHash/u);
assert.match(source, /material\.pipingClassResolutionSemanticHash/u);
assert.match(source, /createCommonEnrichedPropertiesCandidate/u);
console.log('PASS common enriched candidate assembly anti-drift checks');
