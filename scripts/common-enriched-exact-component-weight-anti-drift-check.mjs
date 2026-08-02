import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/core/common-enriched-properties/component-weight-resolution.js', import.meta.url),
  'utf8',
);
const forbidden = [
  ['geometryLength', 'geometry-derived weight'],
  ['calculateVolume', 'volume-derived weight'],
  ['densityKgM3 *', 'density multiplication'],
  ['defaultWeight', 'default weight fallback'],
  ['genericWeight', 'generic weight fallback'],
  ['firstFound', 'first-found selection'],
  ['fuzzy', 'fuzzy selector matching'],
  ['includes(componentType)', 'component-type containment'],
  ['includes(catalogKey)', 'catalog-key containment'],
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
assert.match(source, /'ENTITY'/u);
assert.match(source, /'CATALOG_KEY'/u);
assert.match(source, /'COMPONENT_TYPE_BORE'/u);
assert.match(source, /const index = new Map\(\)/u);
assert.match(source, /const bucket = index\.get\(selector\.key\) \|\| \[\]/u);
assert.match(source, /bucket\.push\(record\)/u);
assert.match(source, /bucket\.length > 1/u);
assert.match(source, /EXACT_COMPONENT_WEIGHT_SELECTOR_MULTIPLE_ROWS/u);
assert.match(source, /COMPONENT_WEIGHT_EXACT_ROW_AMBIGUOUS/u);
assert.match(source, /boreField\.status !== 'RESOLVED_EXACT'/u);
assert.match(source, /sourceKind: 'COMPONENT_WEIGHT_MASTER'/u);
assert.match(source, /field: 'component\.weightKg'/u);
console.log('PASS common enriched exact component-weight anti-drift checks');
