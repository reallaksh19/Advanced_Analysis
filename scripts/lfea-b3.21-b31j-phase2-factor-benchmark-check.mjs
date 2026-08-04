#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  COMPONENT_GEOMETRY_SCHEMA,
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  SUPPLEMENTARY_GEOMETRY_SCHEMA,
  calculateB31Factors,
  calculateB31FactorsFromInputXml,
} from '../src/core/linear-fea-b31-factor-calculator/index.js';

const FIXTURE_PATH = fileURLToPath(new URL(
  '../benchmarks/LFEA/B31J/B31J_Phase2_Factor_Benchmarks.json',
  import.meta.url,
));
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
const mapping = Object.freeze({ inPlaneField: 'my', outOfPlaneField: 'mz' });
const sourceEvidence = Object.freeze({ sourceId: 'B31J-PHASE2-BENCHMARK', sourceRevision: '01' });

assert.equal(fixture.schema, 'b31j-phase2-factor-benchmark/v1');
assert.equal(fixture.parentIssue, 601);
assert.equal(fixture.caseCount, 9);
assert.equal(fixture.cases.length, 9);
assert.deepEqual(
  fixture.cases.reduce((counts, entry) => ({
    ...counts,
    [entry.componentType]: (counts[entry.componentType] ?? 0) + 1,
  }), {}),
  { BEND: 3, WELDING_TEE: 3, REDUCER: 3 },
);
assert.equal(fixture.resolvedQuestions.smooth90Bend.disposition, 'EXPLICIT_OPTION_REQUIRED');
assert.equal(fixture.resolvedQuestions.verifiedTee.disposition, 'DIVIDE_BEFORE_FLOOR');
assert.equal(fixture.resolvedQuestions.reducer.disposition, 'DIRECTIONAL_SIF_ONLY');

const results = [];
for (const entry of fixture.cases) {
  const result = calculate(entry);
  assert.equal(result.status, 'QUALIFIED', entry.caseId);
  assert.equal(result.componentType, entry.componentType, entry.caseId);
  if (entry.componentType === 'BEND') verifyBend(entry, result);
  else if (entry.componentType === 'WELDING_TEE') verifyTee(entry, result);
  else verifyReducer(entry, result);
  results.push(summary(entry, result));
}

verifySmooth90PolicyBoundary();
verifyTeeReductionOrder();
verifyInputXmlSmooth90Policy();

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(
  packageJson.scripts['check:lfea-b3.21'],
  'node scripts/lfea-b3.21-b31j-phase2-factor-benchmark-check.mjs',
);
assert.ok(packageJson.scripts['check:lfea-linear-core'].includes('npm run check:lfea-b3.21'));

console.log(JSON.stringify({
  check: 'lfea-b3.21-b31j-phase2-factor-benchmark',
  status: 'PASS',
  parentIssue: fixture.parentIssue,
  caseCount: results.length,
  resolvedQuestions: fixture.resolvedQuestions,
  results,
}, null, 2));
console.log('LFEA B-3.21 B31J phase-2 factor benchmark PASS');

function calculate(entry) {
  return calculateB31Factors({
    schema: FACTOR_CALCULATION_REQUEST_SCHEMA,
    calculationId: `B31J-PHASE2-${entry.caseId}`,
    componentId: entry.caseId,
    editionProfileId: entry.editionProfileId,
    componentType: entry.componentType,
    geometry: {
      schema: COMPONENT_GEOMETRY_SCHEMA,
      componentType: entry.componentType,
      lengthUnit: fixture.lengthUnit,
      ...entry.geometry,
      sourceEvidence,
    },
    momentDirectionMapping: mapping,
    semanticHash: '',
  });
}

function verifyBend(entry, result) {
  const reference = entry.reference;
  close(result.factors.meanCrossSectionRadius, reference.meanCrossSectionRadius, `${entry.caseId} r`);
  close(result.factors.flexibilityCharacteristic, reference.flexibilityCharacteristic, `${entry.caseId} h`);
  close(result.factors.flexibilityRule.coefficient, reference.flexibilityRule.coefficient, `${entry.caseId} k coefficient`);
  assert.equal(
    result.factors.flexibilityRule.smooth90CorrectionApplied,
    reference.flexibilityRule.smooth90CorrectionApplied,
    `${entry.caseId} smooth-90 policy`,
  );
  compareVector(result.factors.flexibility, reference.flexibility, `${entry.caseId} flexibility`);
  compareVector(result.factors.displacementSifs, reference.displacementSifs, `${entry.caseId} displacement SIF`);
  compareVector(result.factors.sustainedIndices, reference.sustainedIndices, `${entry.caseId} sustained`);
  close(
    result.factors.pressureCorrection.flexibilityDenominator,
    reference.pressureCorrection.flexibilityDenominator,
    `${entry.caseId} pressure k denominator`,
  );
  close(
    result.factors.pressureCorrection.sifDenominator,
    reference.pressureCorrection.sifDenominator,
    `${entry.caseId} pressure i denominator`,
  );
  compareCorrection(result.factors.sustainedCorrection, reference.sustainedCorrection, entry.caseId);
  assert.equal(result.componentFactorSet.flexibilityFactor.value, result.factors.flexibility.inPlane);
  assert.equal(result.stressFactorSets.length, 1);
}

function verifyTee(entry, result) {
  const reference = entry.reference;
  assert.equal(result.componentFactorSet, null);
  assert.equal(result.stressFactorSets.length, 2);
  assert.equal(result.factors.qualityReduction.applied, true, entry.caseId);
  close(result.factors.qualityReduction.divisor, 1.26, `${entry.caseId} Note 6 divisor`);
  assert.equal(result.factors.qualityReduction.floorAppliedAfterReduction, true);
  compareVector(result.factors.ratios, reference.ratios, `${entry.caseId} ratios`);
  for (const leg of ['run', 'branch']) {
    compareVector(result.factors.rawFlexibility[leg], reference.rawFlexibility[leg], `${entry.caseId} ${leg} raw k`);
    compareVector(result.factors.rawDisplacementSifs[leg], reference.rawDisplacementSifs[leg], `${entry.caseId} ${leg} raw i`);
    compareVector(result.factors.flexibility[leg], reference.flexibility[leg], `${entry.caseId} ${leg} k`);
    compareVector(result.factors.displacementSifs[leg], reference.displacementSifs[leg], `${entry.caseId} ${leg} i`);
    compareVector(result.factors.sustainedIndices[leg], reference.sustainedIndices[leg], `${entry.caseId} ${leg} sustained`);
  }
  compareCorrection(result.factors.sustainedCorrection.run, reference.sustainedCorrection, `${entry.caseId} run`);
  compareCorrection(result.factors.sustainedCorrection.branch, reference.sustainedCorrection, `${entry.caseId} branch`);
  assert.ok(result.diagnostics.some((row) => row.code === 'B31J_TEE_NOTE_6_REDUCTION_APPLIED'));
}

function verifyReducer(entry, result) {
  const reference = entry.reference;
  assert.equal(result.componentFactorSet, null);
  assert.equal(result.factors.flexibility, null);
  close(result.factors.commonTerm, reference.commonTerm, `${entry.caseId} common term`);
  close(result.factors.shortCylinderThreshold, reference.shortCylinderThreshold, `${entry.caseId} threshold`);
  close(result.factors.shortCylinderMultiplier, reference.shortCylinderMultiplier, `${entry.caseId} multiplier`);
  compareVector(result.factors.displacementSifs, reference.displacementSifs, `${entry.caseId} displacement SIF`);
  compareVector(result.factors.sustainedIndices, reference.sustainedIndices, `${entry.caseId} sustained`);
  compareCorrection(result.factors.sustainedCorrection, reference.sustainedCorrection, entry.caseId);
  assert.equal(result.matchingPipeApplication.largeEnd.outerDiameter, entry.geometry.largeEndOuterDiameter);
  assert.equal(result.matchingPipeApplication.smallEnd.wallThickness, entry.geometry.smallEndWallThickness);
}

function verifySmooth90PolicyBoundary() {
  const base = fixture.cases.find((entry) => entry.caseId === 'B31J17-BEND-BM1-SMOOTH90-P21');
  const corrected = calculate(base);
  const general = calculate({
    ...base,
    caseId: 'B31J17-BEND-BM1-GENERAL-CONTROL',
    geometry: { ...base.geometry, smooth90FlexibilityCorrection: false },
  });
  close(
    corrected.factors.unpressurized.flexibility / general.factors.unpressurized.flexibility,
    1.3 / 1.65,
    'smooth-90/general coefficient ratio',
  );
  close(
    corrected.factors.displacementSifs.inPlaneBending,
    general.factors.displacementSifs.inPlaneBending,
    'smooth-90 does not alter bend SIF',
  );

  const non90 = calculate({
    ...base,
    caseId: 'B31J17-BEND-NON90-INVALID-CORRECTION',
    geometry: { ...base.geometry, bendAngleDegrees: 45 },
  });
  assert.equal(non90.status, 'BLOCKED');
  assert.ok(non90.applicability.violations.some((row) => row.field === 'bendAngleDegrees'));

  const legacy = calculate({
    ...base,
    caseId: 'APPENDIX-D-BEND-INVALID-B31J-CORRECTION',
    editionProfileId: 'B31_3_2018_APPENDIX_D',
  });
  assert.equal(legacy.status, 'BLOCKED');
  assert.ok(legacy.applicability.violations.some((row) => row.field === 'smooth90FlexibilityCorrection'));
}


function verifyInputXmlSmooth90Policy() {
  const bm1Path = fileURLToPath(new URL('../benchmarks/LFEA/BM1/BM1_InputXML.xml', import.meta.url));
  const results = calculateB31FactorsFromInputXml({
    xmlText: readFileSync(bm1Path, 'utf8'),
    inputXmlOptions: { unit: 'mm', source: 'CAESAR-II-BM1-LIVE-INPUTXML' },
    editionProfileId: 'B31_3_2020_B31J_2017',
    momentDirectionMapping: mapping,
    segmentIds: ['IX-S5'],
    supplementaryGeometryBySegmentId: {
      'IX-S5': {
        schema: SUPPLEMENTARY_GEOMETRY_SCHEMA,
        componentType: 'BEND',
        lengthUnit: 'mm',
        bendAngleDegrees: 90,
        smooth90FlexibilityCorrection: true,
      },
    },
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'QUALIFIED');
  assert.equal(results[0].geometry.bendAngleDegrees, 90);
  assert.equal(results[0].geometry.smooth90FlexibilityCorrection, true);
  assert.equal(results[0].factors.flexibilityRule.smooth90CorrectionApplied, true);
  close(results[0].factors.flexibilityRule.coefficient, 1.3, 'InputXML smooth-90 coefficient');
}

function verifyTeeReductionOrder() {
  const entry = fixture.cases.find((row) => row.caseId === 'B31J17-TEE-REDUCED-BRANCH');
  const result = calculate(entry);
  assert.ok(result.factors.rawFlexibility.run.inPlane > 1);
  assert.ok(result.factors.rawFlexibility.run.inPlane / 1.26 < 1);
  assert.equal(result.factors.flexibility.run.inPlane, 1);
  assert.ok(result.factors.rawDisplacementSifs.run.outOfPlaneBending > 1);
  assert.ok(result.factors.rawDisplacementSifs.run.outOfPlaneBending / 1.26 < 1);
  assert.equal(result.factors.displacementSifs.run.outOfPlaneBending, 1);
}

function compareCorrection(actual, expected, label) {
  assert.equal(actual.applied, expected.applied, `${label} correction applied`);
  close(actual.outerDiameterToThickness, expected.outerDiameterToThickness, `${label} D/T`);
  close(actual.denominator, expected.denominator, `${label} correction denominator`);
}

function compareVector(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    close(actual[key], value, `${label}.${key}`);
  }
}

function close(actual, expected, label) {
  const scale = Math.max(1, Math.abs(expected));
  const tolerance = Math.max(
    fixture.tolerance.derivedAbsolute,
    fixture.tolerance.derivedRelative * scale,
  );
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} does not match ${expected} within ${tolerance}.`,
  );
}

function summary(entry, result) {
  if (entry.componentType === 'BEND') {
    return {
      caseId: entry.caseId,
      profile: entry.editionProfileId,
      kRule: result.factors.flexibilityRule.ruleId,
      k: result.factors.flexibility.inPlane,
      ii: result.factors.displacementSifs.inPlaneBending,
      io: result.factors.displacementSifs.outOfPlaneBending,
      sustainedCorrection: result.factors.sustainedCorrection,
    };
  }
  if (entry.componentType === 'WELDING_TEE') {
    return {
      caseId: entry.caseId,
      profile: entry.editionProfileId,
      note6Divisor: result.factors.qualityReduction.divisor,
      runK: result.factors.flexibility.run,
      branchK: result.factors.flexibility.branch,
      runSif: result.factors.displacementSifs.run,
      branchSif: result.factors.displacementSifs.branch,
    };
  }
  return {
    caseId: entry.caseId,
    profile: entry.editionProfileId,
    commonTerm: result.factors.commonTerm,
    shortCylinderMultiplier: result.factors.shortCylinderMultiplier,
    displacementSifs: result.factors.displacementSifs,
    sustainedCorrection: result.factors.sustainedCorrection,
  };
}
