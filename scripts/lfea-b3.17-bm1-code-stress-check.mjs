#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BM1_PATH, solveBm1InputXml } from './lfea-b3.15-bm1-inputxml-fixtures.mjs';
import {
  A106_GRADE_B_ALLOWABLE_PA,
  A106_GRADE_B_ALLOWABLE_PSI,
  BM1_CII_OUTPUT_PATH,
  HOT_ALLOWABLE_TEMPERATURE,
  REFERENCE_TEMPERATURE,
} from './lfea-b3.17-bm1-code-stress-fixtures.mjs';
import {
  CAESAR_EXPANSION_CASE,
  CAESAR_SUSTAINED_CASE,
  KPA_TO_PA,
  parseCaesarStressReports,
} from './lfea-b3.17-caesar-stress-report.mjs';

function assertClose(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} by more than ${tolerance}.`);
}

console.log('\n--- LFEA B-3.17 BM1 B31.3 bend-resolved SUS/EXP vs CAESAR II ---');
const result = solveBm1InputXml();
const input = readFileSync(BM1_PATH, 'utf8');
const output = readFileSync(BM1_CII_OUTPUT_PATH, 'utf8');
assert.equal(result.content, input);
assert.equal(result.caesarContent, output);

assert.equal(result.modelEntries.length, 19);
assert.equal(result.code.length, 38);
assert.equal(result.sustainedCode.length, 38);
assert.ok(result.code.every((row) => row.category === 'DISPLACEMENT_STRESS_RANGE'));
assert.ok(result.sustainedCode.every((row) => row.category === 'SUSTAINED'));
for (const row of [...result.code, ...result.sustainedCode]) {
  assert.ok(Number.isFinite(row.calculatedStress) && row.calculatedStress >= 0);
  assert.ok(Number.isFinite(row.allowableStress) && row.allowableStress > 0);
  assert.ok(Number.isFinite(row.utilization) && row.utilization >= 0);
}
assert.ok(result.sustainedCode.every((row) => row.allowableStress === A106_GRADE_B_ALLOWABLE_PA));
const expansionAllowable = A106_GRADE_B_ALLOWABLE_PA * 1.5;
assert.ok(result.code.every((row) => Math.abs(row.allowableStress - expansionAllowable) < 1e-6));
assert.equal(A106_GRADE_B_ALLOWABLE_PSI, 20000);
assert.deepEqual(result.codeAuthorities.editionDataset.allowablePoints.map((row) => row.absoluteTemperature), [REFERENCE_TEMPERATURE, HOT_ALLOWABLE_TEMPERATURE]);
assert.ok(result.codeAuthorities.editionDataset.allowablePoints.every(
  (row) => row.allowableStress.value === A106_GRADE_B_ALLOWABLE_PA
    && /ASME B31\.3-2024 Table A-1/u.test(row.allowableStress.source)
    && !/screening|placeholder/iu.test(row.allowableStress.source),
));

assert.equal(result.caesarStressReports.length, 2);
const reportsByCase = new Map(result.caesarStressReports.map((row) => [row.loadCase, row]));
const sus = reportsByCase.get(CAESAR_SUSTAINED_CASE);
const exp = reportsByCase.get(CAESAR_EXPANSION_CASE);
assert.equal(sus.elements.length, 19);
assert.equal(exp.elements.length, 19);
assert.equal(sus.codeCheck, 'CODE STRESS CHECK PASSED');
assert.equal(exp.codeCheck, 'CODE STRESS CHECK PASSED');
assert.equal(sus.highest.percentage, 46.255672);
assert.equal(exp.highest.percentage, 62.532867);
assertClose(sus.highest.allowableStressPa, 137895.140625 * KPA_TO_PA);
assertClose(exp.highest.allowableStressPa, 206842.703125 * KPA_TO_PA);
const exp5859 = exp.elements.find((row) => row.pairKey === '58->59');
assertClose(exp5859.to.codeStressPa, 129344664.063);
assert.equal(exp5859.to.percentage, 62.532867);
assert.equal(exp5859.to.sifInPlane, 2.661139);
assert.equal(exp5859.to.sifOutOfPlane, 2.217616);
const secondBend = result.bendDefinitions.find((row) => row.sourceSegment.id === 'IX-S6').authority;
assert.ok(Math.abs(secondBend.pressureCorrectedInPlaneSif - exp5859.to.sifInPlane) < 1e-6);
assert.ok(Math.abs(secondBend.pressureCorrectedOutOfPlaneSif - exp5859.to.sifOutOfPlane) < 1e-6);

const reparsed = parseCaesarStressReports(output);
assert.deepEqual(reparsed, result.caesarStressReports);
const unsupportedUnitsOutput = output.replace(/STRESS_UNITS="\s*KPa"/gu, 'STRESS_UNITS="psi"');
assert.throws(() => parseCaesarStressReports(unsupportedUnitsOutput), (error) => error?.code === 'CAESAR_STRESS_REPORT_UNIT_UNSUPPORTED');
const missingExpansionOutput = output.replaceAll(CAESAR_EXPANSION_CASE, 'CASE 5 REMOVED');
assert.throws(() => parseCaesarStressReports(missingExpansionOutput), (error) => error?.code === 'CAESAR_STRESS_REPORT_CASE_MISSING');

const comparison = result.caesarStressComparison;
assert.equal(comparison.schema, 'm024-bm1-code-stress-comparison/v1');
assert.equal(comparison.matchingPolicy, 'EXACT_FROM_NODE_TO_NODE_ONLY');
assert.equal(comparison.cases.length, 2);
for (const comparisonCase of comparison.cases) {
  assert.equal(comparisonCase.summary.caesarElementCount, 19);
  assert.equal(comparisonCase.summary.compiledElementCount, 19);
  assert.equal(comparisonCase.summary.matchedElementCount, 19);
  assert.equal(comparisonCase.summary.unmatchedCaesarElementCount, 0);
  assert.equal(comparisonCase.summary.unmatchedCompiledElementCount, 0);
  assert.equal(comparisonCase.summary.rigidZeroConventionCodePointCount, 6);
  assert.equal(comparisonCase.summary.matchedCodePointCount, 32);
  assert.ok(Number.isFinite(comparisonCase.summary.maximumAbsoluteUtilizationDeviationPercentagePoints));
  assert.ok(Number.isFinite(comparisonCase.summary.meanAbsoluteUtilizationDeviationPercentagePoints));
  assert.ok(Number.isFinite(comparisonCase.summary.maximumAbsoluteCalculatedStressDeviationPa));
  assert.ok(Number.isFinite(comparisonCase.summary.maximumAbsoluteCalculatedStressDeviationPercent));
}
const susComparison = comparison.cases.find((row) => row.category === 'SUSTAINED');
const expComparison = comparison.cases.find((row) => row.category === 'DISPLACEMENT_STRESS_RANGE');
assert.ok(susComparison && expComparison);
assert.equal(susComparison.caesarCode, 'B31.3 -2018, Aug 30, 2019');
assert.equal(expComparison.caesarCode, 'B31.3 -2018, Aug 30, 2019');

assert.equal(result.report.schema, 'm024-bm1-inputxml-bend-code-stress-report/v1');
assert.equal(result.report.elements.length, 19);
assert.ok(result.report.elements.every((row) => row.sustainedStress.length === 2 && row.displacementStressRange.length === 2));
assert.ok(result.report.limitations.some((row) => row.includes('20,000 psi')));
assert.ok(result.report.limitations.some((row) => row.includes('SUSTAINED')));
assert.ok(result.report.limitations.some((row) => row.includes('B31.3-2018')));
assert.ok(result.report.limitations.some((row) => /directional SIF|directional elbow SIF/iu.test(row)));
assert.ok(result.report.limitations.every((row) => !/screening allowable/iu.test(row)));

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.scripts['check:lfea-b3.17'], 'node scripts/lfea-b3.17-bm1-code-stress-check.mjs');
const aggregate = packageJson.scripts['check:lfea-linear-core'];
const b316 = aggregate.indexOf('npm run check:lfea-b3.16');
const b317 = aggregate.indexOf('npm run check:lfea-b3.17');
const b318 = aggregate.indexOf('npm run check:lfea-b3.18');
const b40 = aggregate.indexOf('npm run check:lfea-b4.0');
assert.ok(b316 >= 0 && b317 > b316 && b318 > b317 && b40 > b318);

console.log(JSON.stringify({
  check: 'lfea-b3.17-bm1-code-stress',
  status: 'PASS',
  exactAllowablePa: A106_GRADE_B_ALLOWABLE_PA,
  sustained: susComparison.summary,
  expansion: expComparison.summary,
}, null, 2));
console.log('LFEA B-3.17 BM1 B31.3 bend-resolved SUS/EXP vs CAESAR II PASS');
