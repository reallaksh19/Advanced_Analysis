#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solveBm1InputXml } from './lfea-b3.15-bm1-inputxml-fixtures.mjs';

const EXPECTED = Object.freeze({
  'IX-S5': { pressure: 2.15e6, k: 8.805996977364236, ii: 2.656692445746295, io: 2.213910371455246 },
  'IX-S6': { pressure: 2.10e6, k: 8.81810588982693, ii: 2.66113953399073, io: 2.217616278325609 },
});
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

console.log('\n--- LFEA B-3.18 BM1 real BEND components and directional SIFs ---');
const result = solveBm1InputXml();
assert.equal(result.normalized.geometry.nodes.length, 16);
assert.equal(result.normalized.geometry.segments.length, 15);
assert.equal(result.analysisGeometry.nodes.length, 20);
assert.equal(result.analysisGeometry.segments.length, 19);
assert.equal(result.bendDefinitions.length, 2);
assert.equal(result.bendComponents.length, 2);
assert.deepEqual(result.bendDefinitions.map((row) => row.sourceSegment.id), ['IX-S5', 'IX-S6']);

for (const definition of result.bendDefinitions) {
  const expected = EXPECTED[definition.sourceSegment.id];
  assert.ok(expected);
  assert.equal(definition.component.componentType, 'BEND');
  assert.equal(definition.component.elements.length, 2);
  assert.equal(definition.component.codeStations.length, 3);
  assert.deepEqual(definition.stationReferences.map((row) => row.referenceNodeId),
    definition.sourceSegment.id === 'IX-S5' ? ['48', '49', '50'] : ['58', '59', '60']);
  close(definition.bendAngle, Math.PI / 2, 1e-8);
  close(definition.authority.pressure, expected.pressure);
  close(definition.authority.pressureCorrectedFlexibilityFactor, expected.k);
  close(definition.authority.pressureCorrectedInPlaneSif, expected.ii);
  close(definition.authority.pressureCorrectedOutOfPlaneSif, expected.io);
  close(definition.component.flexibility.factor, expected.k);
  assert.equal(definition.component.flexibility.doubleCountGuard.accepted, true);
  assert.equal(definition.component.flexibility.pressureStiffeningRule, 'BEND_PRESSURE_STIFFENING_DECLARED_FACTOR_V1');
  assert.ok(definition.component.flexibility.pressureBasis);
  assert.equal(definition.component.acceptanceState, 'CONDITIONAL');
}

const pairs = result.modelEntries.map((entry) => `${entry.referenceFromNode}->${entry.referenceToNode}`);
for (const pair of ['45->48', '48->49', '49->50', '50->58', '58->59', '59->60']) assert.ok(pairs.includes(pair));
assert.equal(new Set(pairs).size, 19);

const bendEntries = result.modelEntries.filter((entry) => entry.bendAuthority);
assert.equal(bendEntries.length, 4);
for (const entry of bendEntries) {
  const factors = entry.stressFactorSet.displacementSifs;
  assert.ok(factors.inPlaneBending.value > 1);
  assert.ok(factors.outOfPlaneBending.value > 1);
  assert.equal(entry.stressFactorSet.sustainedIndices.inPlaneBending.value, factors.inPlaneBending.value);
  assert.equal(entry.stressFactorSet.sustainedIndices.outOfPlaneBending.value, factors.outOfPlaneBending.value);
}
for (const entry of result.modelEntries.filter((row) => !row.bendAuthority)) {
  assert.equal(entry.stressFactorSet.displacementSifs.inPlaneBending.value, 1);
  assert.equal(entry.stressFactorSet.displacementSifs.outOfPlaneBending.value, 1);
}

assert.equal(result.code.length, 38);
assert.equal(result.sustainedCode.length, 38);
assert.equal(result.caesarStressComparison.cases.every((row) => row.summary.matchedElementCount === 19), true);
assert.equal(result.caesarStressComparison.cases.every((row) => row.summary.unmatchedCaesarElementCount === 0), true);
assert.equal(result.caesarStressComparison.cases.every((row) => row.summary.unmatchedCompiledElementCount === 0), true);
assert.equal(result.report.sifCodePoints.length, 8);

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.scripts['check:lfea-b3.18'], 'node scripts/lfea-b3.18-bm1-bend-check.mjs');
assert.ok(packageJson.scripts['check:lfea-linear-core'].includes('npm run check:lfea-b3.18'));

console.log(JSON.stringify({
  check: 'lfea-b3.18-bm1-real-bends',
  status: 'PASS',
  sourceTopology: { nodes: 16, elements: 15 },
  analysisTopology: { nodes: 20, elements: 19 },
  bends: result.bendDefinitions.map((row) => ({
    sourceSegmentId: row.sourceSegment.id,
    k: row.authority.pressureCorrectedFlexibilityFactor,
    ii: row.authority.pressureCorrectedInPlaneSif,
    io: row.authority.pressureCorrectedOutOfPlaneSif,
  })),
}, null, 2));
console.log('LFEA B-3.18 BM1 real BEND components and directional SIFs PASS');
