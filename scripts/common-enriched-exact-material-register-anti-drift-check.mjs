import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/core/common-enriched-properties/material-register-resolution.js', import.meta.url),
  'utf8',
);
const forbidden = [
  ['genericDensity', 'generic density fallback'],
  ['steelDensity', 'steel density fallback'],
  ['defaultDensity', 'default density fallback'],
  ['default-zero', 'zero fallback'],
  ['config-default', 'configuration fallback'],
  ['fuzzy', 'fuzzy material matching'],
  ['includes(materialCode)', 'containment material matching'],
  ['serviceConsensus', 'service-consensus inference'],
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
assert.match(source, /const index = new Map\(\)/u);
assert.match(source, /const bucket = index\.get\(key\) \|\| \[\]/u);
assert.match(source, /bucket\.push\(record\)/u);
assert.match(source, /bucket\.length > 1/u);
assert.match(source, /EXACT_MATERIAL_CODE_MULTIPLE_ROWS/u);
assert.match(source, /MATERIAL_REGISTER_EXACT_ROW_AMBIGUOUS/u);
assert.match(source, /MATERIAL_REGISTER_KEY_NOT_APPROVED/u);
assert.match(source, /field\.status !== 'RESOLVED_EXACT'/u);
assert.match(source, /sourceKind: 'MATERIAL_REGISTER'/u);
console.log('PASS common enriched exact material-register anti-drift checks');
