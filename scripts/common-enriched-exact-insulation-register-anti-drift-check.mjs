import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/core/common-enriched-properties/insulation-register-resolution.js', import.meta.url),
  'utf8',
);
const forbidden = [
  ['defaultThickness', 'default thickness fallback'],
  ['defaultInsulation', 'default insulation fallback'],
  ['calciumSilicateDefault', 'material fallback'],
  ['ambientTemperature', 'ambient-temperature inference'],
  ['serviceConsensus', 'service-consensus inference'],
  ['default-zero', 'zero fallback'],
  ['config-default', 'configuration fallback'],
  ['fuzzy', 'fuzzy insulation matching'],
  ['includes(insulationCode)', 'containment insulation matching'],
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
assert.match(source, /EXACT_INSULATION_CODE_MULTIPLE_ROWS/u);
assert.match(source, /INSULATION_REGISTER_EXACT_ROW_AMBIGUOUS/u);
assert.match(source, /INSULATION_REGISTER_KEY_NOT_APPROVED/u);
assert.match(source, /field\.status !== 'RESOLVED_EXACT'/u);
assert.match(source, /sourceKind: 'INSULATION_REGISTER'/u);
console.log('PASS common enriched exact insulation-register anti-drift checks');
