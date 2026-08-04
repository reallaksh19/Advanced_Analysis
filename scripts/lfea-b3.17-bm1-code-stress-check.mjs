#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BM1_PATH,
  solveBm1InputXml,
} from './lfea-b3.15-bm1-inputxml-fixtures.mjs';
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
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected} by more than ${tolerance}.`,
  );
}

console.log('\n--- LFEA B-3.17 BM1 B31.3 SUS/EXP vs CAESAR II ---');
const result = solveBm1InputXml();
const input = readFileSync(BM1_PATH, 'utf8');
const output = readFileSync(BM1_CII_OUTPUT_PATH, 'utf8');
assert.equal(result.content, input, 'solve must consume the current live BM1 input');
assert.equal(result.caesarContent, output, 'comparison must consume the current real CAESAR output');

assert.equal(result.code.length, 30);
assert.equal(result.sustainedCode.length, 30);
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
assert.deepEqual(
  result.codeAuthorities.editionDataset.allowablePoints.map((row) => row.absoluteTemperature),
  [REFERENCE_TEMPERATURE, HOT_ALLOWABLE_TEMPERATURE],
);
assert.ok(result.codeAuthorities.editionDataset.allowablePoints.every(
  (row) => row.allowableStress.value === A106_GRADE_B_ALLOWABLE_PA
    && /ASME B31\.3-2024 Table A-1/u.test(row.allowableStress.source)
    && !/screening|placeholder/iu.test(row.allowableStress.source),
));
const fixtureSource = readFileSync(new URL('./lfea-b3.15-bm1-inputxml-fixtures.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(fixtureSource, /SCREENING_ALLOWABLE|M020-BM1-SCREENING-NOT-CAESAR-AUTHORITY/u);
const m008Source = readFileSync(new URL('../src/workspace/analysis-authority-overlay/material-section-resolution.js', import.meta.url), 'utf8');
assert.match(m008Source, /absoluteTemperature:\s*393\.15/u, 'BM1 hot authority must remain cross-checked against M008-C 393.15 K point');

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
const sus2030 = sus.elements.find((row) => row.pairKey === '20->30');
assertClose(sus2030.from.allowableStressPa, 137895140.625);
assertClose(sus2030.from.codeStressPa, 40492921.875);
assert.equal(sus2030.from.percentage, 29.365009);
const exp5859 = exp.elements.find((row) => row.pairKey === '58->59');
assertClose(exp5859.to.codeStressPa, 129344664.063);
assert.equal(exp5859.to.percentage, 62.532867);
assert.equal(exp5859.to.sifInPlane, 2.661139);
assert.equal(exp5859.to.sifOutOfPlane, 2.217616);

const reparsed = parseCaesarStressReports(output);
assert.deepEqual(reparsed, result.caesarStressReports, 'parser must be deterministic');
const unsupportedUnitsOutput = output.replace(/STRESS_UNITS="\s*KPa"/gu, 'STRESS_UNITS="psi"');
assert.notEqual(unsupportedUnitsOutput, output, 'unit mutation must affect stress reports');
assert.throws(
  () => parseCaesarStressReports(unsupportedUnitsOutput),
  (error) => error?.code === 'CAESAR_STRESS_REPORT_UNIT_UNSUPPORTED',
);
const missingExpansionOutput = output.replaceAll(CAESAR_EXPANSION_CASE, 'CASE 5 REMOVED');
assert.notEqual(missingExpansionOutput, output, 'case mutation must affect the CAESAR output');
assert.throws(
  () => parseCaesarStressReports(missingExpansionOutput),
  (error) => error?.code === 'CAESAR_STRESS_REPORT_CASE_MISSING',
);

const comparison = result.caesarStressComparison;
assert.equal(comparison.matchingPolicy, 'EXACT_FROM_NODE_TO_NODE_ONLY');
assert.equal(comparison.cases.length, 2);
const expectedUnmatchedCaesarPairs = ['45->48', '48->49', '49->50', '50->58', '58->59', '59->60'];
const expectedUnmatchedCompiledPairs = ['45->50', '50->60'];
for (const comparisonCase of comparison.cases) {
  assert.equal(comparisonCase.summary.caesarElementCount, 19);
  assert.equal(comparisonCase.summary.compiledElementCount, 15);
  assert.equal(comparisonCase.summary.matchedElementCount, 13);
  assert.equal(comparisonCase.summary.unmatchedCaesarElementCount, 6);
  assert.equal(comparisonCase.summary.unmatchedCompiledElementCount, 2);
  assert.equal(comparisonCase.summary.rigidZeroConventionCodePointCount, 6);
  assert.equal(comparisonCase.summary.matchedCodePointCount, 20);
  assert.equal(comparisonCase.matched.length + comparisonCase.unmatchedCaesar.length, 19, 'every CAESAR pair must be accounted for');
  assert.equal(comparisonCase.matched.length + comparisonCase.unmatchedCompiled.length, 15, 'every compiled pair must be accounted for');
  assert.deepEqual(
    comparisonCase.unmatchedCaesar.map((row) => row.pairKey).sort(),
    expectedUnmatchedCaesarPairs,
    'only CAESAR internal bend-station splits may remain unmatched',
  );
  assert.deepEqual(
    comparisonCase.unmatchedCompiled.map((row) => row.pairKey).sort(),
    expectedUnmatchedCompiledPairs,
    'only the two compiled whole-chord bend elements may remain unmatched',
  );
  assert.ok(Number.isFinite(comparisonCase.summary.maximumAbsoluteUtilizationDeviationPercentagePoints));
  assert.ok(Number.isFinite(comparisonCase.summary.meanAbsoluteUtilizationDeviationPercentagePoints));
  assert.ok(Number.isFinite(comparisonCase.summary.maximumAbsoluteCalculatedStressDeviationPa));
  assert.ok(Number.isFinite(comparisonCase.summary.maximumAbsoluteCalculatedStressDeviationPercent));
  assert.ok(comparisonCase.unmatchedCaesar.every((row) => row.reason === 'NO_EXACT_COMPILED_ELEMENT_PAIR'));
  assert.ok(comparisonCase.unmatchedCompiled.every((row) => row.reason === 'NO_EXACT_CAESAR_STRESS_ELEMENT_PAIR'));
}
const susComparison = comparison.cases.find((row) => row.category === 'SUSTAINED');
const expComparison = comparison.cases.find((row) => row.category === 'DISPLACEMENT_STRESS_RANGE');
assert.ok(susComparison && expComparison);
assert.equal(susComparison.caesarCode, 'B31.3 -2018, Aug 30, 2019');
assert.equal(expComparison.caesarCode, 'B31.3 -2018, Aug 30, 2019');

assert.equal(result.report.schema, 'm023-bm1-inputxml-code-stress-report/v1');
assert.equal(result.report.elements.length, 15);
assert.ok(result.report.elements.every(
  (row) => row.sustainedStress.length === 2 && row.displacementStressRange.length === 2,
));
assert.ok(result.report.limitations.some((row) => row.includes('20,000 psi')));
assert.ok(result.report.limitations.some((row) => row.includes('SUSTAINED')));
assert.ok(result.report.limitations.some((row) => row.includes('B31.3-2018')));
assert.ok(result.report.limitations.some((row) => row.includes('unity factors')));
assert.ok(result.report.limitations.every((row) => !/screening allowable/iu.test(row)));

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.scripts['check:lfea-b3.17'], 'node scripts/lfea-b3.17-bm1-code-stress-check.mjs');
const aggregate = packageJson.scripts['check:lfea-linear-core'];
const b316 = aggregate.indexOf('npm run check:lfea-b3.16');
const b317 = aggregate.indexOf('npm run check:lfea-b3.17');
const b40 = aggregate.indexOf('npm run check:lfea-b4.0');
assert.ok(b316 >= 0 && b317 > b316 && b40 > b317);

console.log(JSON.stringify({
  check: 'lfea-b3.17-bm1-code-stress',
  status: 'PASS',
  exactAllowablePa: A106_GRADE_B_ALLOWABLE_PA,
  sustained: susComparison.summary,
  expansion: expComparison.summary,
}, null, 2));
console.log('LFEA B-3.17 BM1 B31.3 SUS/EXP vs CAESAR II PASS');
