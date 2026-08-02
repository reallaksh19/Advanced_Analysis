import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/core/common-enriched-properties/piping-class-resolution.js', import.meta.url),
  'utf8',
);
const forbidden = [
  ['deriveLineKeyFromBranchName', 'branch-name inference'],
  ['branchNameRegex', 'regex fallback'],
  ['fuzzy', 'fuzzy matching'],
  ['contains(', 'containment matching'],
  ['serviceConsensus', 'service consensus'],
  ['default-zero', 'zero fallback'],
  ['config-default', 'configuration fallback'],
  ['standard-wall', 'standard wall fallback'],
  ['generic steel', 'generic material fallback'],
  ['localStorage', 'browser persistence'],
  ['Date.now', 'hidden clock'],
  ['Math.random', 'random identity'],
  ["from '../../workspace", 'workspace dependency'],
  ["from '../first-cut", 'empirical consumer dependency'],
  ["from '../linear-fea", 'LFEA dependency'],
];
for (const [token, label] of forbidden) {
  assert.equal(source.toLowerCase().includes(token.toLowerCase()), false, `forbidden ${label}: ${token}`);
}
assert.match(source, /const index = new Map\(\)/u);
assert.match(source, /const bucket = index\.get\(key\) \|\| \[\]/u);
assert.match(source, /bucket\.push\(record\)/u);
assert.match(source, /bucket\.length > 1/u);
assert.match(source, /EXACT_PIPING_CLASS_KEY_MULTIPLE_ROWS/u);
assert.match(source, /field\.status !== 'RESOLVED_EXACT'/u);
assert.match(source, /PROPOSED_REVIEW/u);
assert.match(source, /RESOLVED_DERIVED/u);
assert.match(source, /targetScheduleField === null/u);
assert.match(source, /sourceScheduleField === null/u);
assert.match(source, /PIPING_CLASS_EXACT_ROW_MISSING/u);
assert.match(source, /PIPING_CLASS_FIELD_TYPE_CONFLICT/u);
console.log('PASS common enriched exact piping-class anti-drift checks');
