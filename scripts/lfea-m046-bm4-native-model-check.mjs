import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { buildNativeAnalysisModel } from './lfea-m046-bm4-native-model-export.mjs';

// M046 qualification gate. The native export exists so independent analysis
// work consumes ONE shared, validated element-level model instead of each
// re-deriving bend/tee geometry (see the module's own usageContract). What
// has to be proven here is that the export is complete, deterministic, and
// that the COMMITTED fixture is not stale against the exporter that built it.

const MODULES = Object.freeze([
  'lfea-m046-bm4-native-model-export.mjs',
  'lfea-m046-bm4-native-model-check.mjs',
]);
const LINE_LIMIT = 300;
const FIXTURE_PATH = fileURLToPath(new URL('../benchmarks/LFEA/BM4/BM4_NL/native-analysis-model.json', import.meta.url));

console.log('\n--- M046 BM4 native element-level model export check ---');

for (const name of MODULES) {
  const path = fileURLToPath(new URL(`./${name}`, import.meta.url));
  const lines = readFileSync(path, 'utf8').split('\n').length;
  assert.ok(lines < LINE_LIMIT, `${name} has ${lines} physical lines; limit is <${LINE_LIMIT}`);
}
console.log(`M046-T01 PASS All ${MODULES.length} modules are under ${LINE_LIMIT} physical lines`);

const model = buildNativeAnalysisModel();

// M046-T02: shape sanity -- known BM4 counts (96 source elements, 12 bends).
assert.equal(model.straightElements.length, 96, `expected 96 straight elements, got ${model.straightElements.length}`);
assert.equal(model.bendComponents.length, 12, 'expected 12 bend components');
const bendSubElementCount = model.bendComponents.reduce((sum, c) => sum + c.elements.length, 0);
assert.ok(bendSubElementCount > 0, 'bend components must carry sub-elements');
assert.ok(model.nodes.length > 96, `expected more analysis nodes than source elements, got ${model.nodes.length}`);
assert.ok(model.restraints.length >= 30, `expected at least 30 restraint declarations, got ${model.restraints.length}`);
console.log(`M046-T02 PASS 96 straight elements, 12 bends (${bendSubElementCount} sub-elements), ${model.nodes.length} nodes, ${model.restraints.length} restraints`);

// M046-T03: total applied vertical weight matches the value M043 established
// independently (arithmetically, from CAESAR's own case-load invariant):
// every W-case in Output_BM4.xml sums to exactly -93512.43 N. This export's
// straight + bend-arc line weights, integrated over element length, must
// reproduce that same total -- an end-to-end check that no element's weight
// was dropped or double-counted in the native export.
function elementLength(nodeId1, nodeId2) {
  const byId = new Map(model.nodes.map((n) => [n.nodeId, n]));
  const a = byId.get(nodeId1);
  const b = byId.get(nodeId2);
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
let totalWeight = 0;
for (const el of model.straightElements) totalWeight += el.lineWeightNewtonPerMetre * elementLength(el.nodeI, el.nodeJ);
for (const component of model.bendComponents) {
  for (const el of component.elements) totalWeight += el.lineWeightNewtonPerMetre * elementLength(el.nodeI, el.nodeJ);
}
const relativeWeightError = Math.abs(totalWeight - 93512.43) / 93512.43;
assert.ok(relativeWeightError < 0.01, `native model total weight ${totalWeight} N is >1% off the established 93512.43 N`);
console.log(`M046-T03 PASS Native model total weight ${totalWeight.toFixed(2)} N matches the established 93512.43 N (${(relativeWeightError * 100).toFixed(3)}% off)`);

// M046-T04: determinism -- two independent builds must be byte-identical.
const repeated = buildNativeAnalysisModel();
assert.equal(semanticHash(model), semanticHash(repeated), 'native model export must be deterministic across runs');
console.log(`M046-T04 PASS Export is deterministic (${semanticHash(model)})`);

// M046-T05: the committed fixture is not stale.
const committed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
assert.equal(semanticHash(committed), semanticHash(model), 'committed native-analysis-model.json is stale against the exporter; regenerate it');
console.log('M046-T05 PASS Committed fixture matches the current exporter output');

console.log('\nM046 BM4 native element-level model export check PASS\n');
