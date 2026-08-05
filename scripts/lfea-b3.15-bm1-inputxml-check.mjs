#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solveBm1InputXml, BM1_PATH } from './lfea-b3.15-bm1-inputxml-fixtures.mjs';

console.log('\n--- LFEA B-3.15 live BM1 InputXML full-chain solve ---');
const result = solveBm1InputXml();
const sourceGeometry = result.normalized.geometry;
const report = result.report;
assert.equal(readFileSync(BM1_PATH, 'utf8'), result.content);
assert.equal(result.parsed.summary.inputXmlUnitsDeclared, true);
assert.equal(result.parsed.unit, 'mm');
assert.equal(sourceGeometry.unit, 'm');
assert.equal(sourceGeometry.valid, true);
assert.equal(sourceGeometry.nodes.length, 16);
assert.equal(sourceGeometry.segments.length, 15);
assert.equal(result.analysisGeometry.nodes.length, 20);
assert.equal(result.analysisGeometry.segments.length, 19);
assert.equal(result.conditioned.geometry.segments.length, 19);
assert.equal(result.compilation.model.elements.length, 19);
assert.equal(result.compilation.model.nodes.length, 20);
assert.equal(result.rigidComponents.length, 3);
assert.equal(result.bendComponents.length, 2);
assert.equal(sourceGeometry.segments.filter((row) => row.type === 'BEND').length, 2);
assert.equal(sourceGeometry.segments.flatMap((row) => row.meta.analysis.sifs ?? []).length, 0);
assert.equal(sourceGeometry.segments.flatMap((row) => row.meta.analysis.hangers ?? []).length, 0);
const first = sourceGeometry.segments[0].meta.analysis;
assert.equal(first.elasticModulus, 203395328000);
assert.equal(first.pressure, 2100000);
assert.equal(first.operatingTemperature, 355.15);
assert.equal(first.pipeDensity, 7833);
assert.equal(first.fluidDensity, 800);
const mutations = sourceGeometry.diagnostics.filter((row) => row.code === 'INPUTXML_RESTRAINT_TYPE_MUTATED');
assert.ok(mutations.some((row) => row.data.sourceTypeCode === '17' && row.data.typeCode === '14'));
assert.ok(mutations.some((row) => row.data.sourceTypeCode === '7' && row.data.typeCode === '9'));
assert.ok(sourceGeometry.diagnostics.some((row) => row.code === 'BEND_ANGLE_AUTOMATIC_SENTINEL_NORMALIZED'));
assert.equal(sourceGeometry.diagnostics.filter((row) => row.code === 'BEND_INTERNAL_STATION_GEOMETRY_NOT_SUPPORTED').length, 2);
for (const segment of sourceGeometry.segments.slice(1)) {
  assert.ok(segment.meta.analysis.elasticModulus > 0);
  assert.ok(segment.meta.analysis.poissonRatio > 0);
  assert.ok(segment.meta.analysis.operatingTemperature > 273.15);
  assert.ok(segment.meta.analysis.pressure > 0);
  assert.ok(segment.meta.analysis.fluidDensity > 0);
}
assert.ok(sourceGeometry.diagnostics.some((row) => row.code === 'PRESSURE1_INHERITED_FROM_PRIOR_ELEMENT'));
assert.ok(sourceGeometry.diagnostics.some((row) => row.code === 'FLUID_DENSITY_INHERITED_FROM_PRIOR_ELEMENT'));
assert.equal(result.sustained.execution.status, 'QUALIFIED');
assert.equal(result.operating.execution.status, 'QUALIFIED');
assert.equal(result.sustained.recovery.elementActions.length, 19);
assert.equal(result.operating.recovery.elementActions.length, 19);
assert.equal(result.code.length, 38);
assert.equal(result.sustainedCode.length, 38);
result.code.forEach((row) => {
  assert.equal(row.category, 'DISPLACEMENT_STRESS_RANGE');
  assert.ok(Number.isFinite(row.calculatedStress));
  assert.ok(Number.isFinite(row.utilization));
});
assert.equal(report.nodes.length, 20);
assert.equal(report.elements.length, 19);
assert.equal(report.sifCodePoints.length, 8);
assert.equal(report.counts.sourceNodes, 16);
assert.equal(report.counts.sourceElements, 15);
assert.equal(report.counts.analysisNodes, 20);
assert.equal(report.counts.analysisElements, 19);
assert.equal(report.counts.rigidComponents, 3);
assert.equal(report.counts.bendComponents, 2);
assert.equal(report.counts.bendSpans, 2);
assert.equal(report.counts.activeSourceSifs, 0);
assert.ok(report.nodes.every((row) => row.kernelNodeId && row.sustained && row.operating));
assert.ok(report.elements.every((row) => row.sustained && row.operating && row.displacementStressRange.length === 2));
assert.ok(report.equilibrium.sustained.normalizedWorst < 1e-5, JSON.stringify(report.equilibrium.sustained));
assert.ok(report.equilibrium.operating.normalizedWorst < 1e-5, JSON.stringify(report.equilibrium.operating));
const hotMotion = report.nodes.reduce((sum, row) => sum + Math.hypot(
  row.operating.displacement.UX - row.sustained.displacement.UX,
  row.operating.displacement.UY - row.sustained.displacement.UY,
  row.operating.displacement.UZ - row.sustained.displacement.UZ,
), 0);
assert.ok(hotMotion > 0);
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.scripts['check:lfea-b3.15'], 'node scripts/lfea-b3.15-bm1-inputxml-check.mjs');
const aggregate = packageJson.scripts['check:lfea-linear-core'];
const b314 = aggregate.indexOf('npm run check:lfea-b3.14');
const b315 = aggregate.indexOf('npm run check:lfea-b3.15');
const b40 = aggregate.indexOf('npm run check:lfea-b4.0');
assert.ok(b314 >= 0 && b315 > b314 && b40 > b315);
console.log(`B315 PASS ${report.counts.sourceNodes} source nodes / ${report.counts.sourceElements} source elements / ${report.counts.analysisNodes} analysis nodes / ${report.counts.analysisElements} analysis elements / ${result.code.length} range checks`);
console.log('LFEA B-3.15 live BM1 InputXML full-chain solve PASS');
