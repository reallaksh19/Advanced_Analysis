#!/usr/bin/env node

/**
 * LFEA B-4.0 B31.3 code engine check.
 *
 * Covers `src/core/linear-fea-b31-code-engine/`: section 10 (code profile,
 * edition dataset, stress factor set, SUSTAINED/OCCASIONAL/
 * DISPLACEMENT_STRESS_RANGE evaluation, code-result record) and section 11
 * (the code engine's own approximation disclosures), exercised through the
 * B-3.4 REDUCER-01 fixture's recovered code points (sections 15.2
 * B31-SUS-01, B31-EXP-01, B31-OCC-01).
 *
 * LEGAL/SPEC BOUNDARY: every numeric fixture value below is fictional and
 * labeled `FIXTURE-...-NOT-ASME`; see `scripts/lfea-b4.0-code-engine-fixtures.mjs`.
 */

import assert from 'node:assert/strict';
import {
  CODE_RESULT_KEYS,
  compileCodeResult,
  requireCodeResult,
  sealCodeProfile,
  sealEditionDataset,
  sealStressFactorSet,
} from '../src/core/linear-fea-b31-code-engine/index.js';
import {
  reducerRecovery,
  codePointN0,
  codePointN1,
  reducerFrameElementE1,
  reducerMaterialResolution,
  reducerSectionResolutionE1,
  codeProfile,
  exactMatchOnlyCodeProfile,
  liberalAllowableCodeProfile,
  editionDataset,
  stressFactorSet,
  outsideRangeStressFactorSet,
  userFactorRequiredStressFactorSet,
  userFactorOverride,
  pressureStressContribution,
  COLD_TEMPERATURE,
  HOT_TEMPERATURE,
  COLD_ALLOWABLE_VALUE,
  HOT_ALLOWABLE_VALUE,
} from './lfea-b4.0-code-engine-fixtures.mjs';

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

function assertClose(actual, expected, relativeTolerance, message) {
  const scale = Math.max(Math.abs(expected), 1);
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * scale,
    `${message}: ${actual} differs from ${expected} beyond ${relativeTolerance} relative`,
  );
}

function assertDeepFrozen(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} is not frozen`);
  Object.entries(value).forEach(([key, child]) => assertDeepFrozen(child, `${path}.${key}`));
}

console.log('\n--- LFEA B-4.0 B31.3 code engine check ---');

const { recovery, component } = reducerRecovery();
const n0 = codePointN0(recovery);
const n1 = codePointN1(recovery);
const element = reducerFrameElementE1(component);
const section = reducerSectionResolutionE1();
const material = reducerMaterialResolution();

function base(overrides = {}) {
  return {
    codeProfile: codeProfile(),
    editionDataset: editionDataset(),
    stressFactorSet: stressFactorSet(),
    componentId: 'RED-001',
    frameElementRecord: element,
    sectionResolution: section,
    materialResolution: material,
    ...overrides,
  };
}

/* ---------------------------------------------------------------------- *
 * B31-SUS-01: SUSTAINED at the fixed-end code point N0.
 * ---------------------------------------------------------------------- */

test('B40-T01', 'A sealed SUSTAINED code result carries exactly the declared keys, the exact section 10.7 status vocabulary and is frozen', () => {
  const result = compileCodeResult(base({
    category: 'SUSTAINED',
    codePointId: 'CP-RED-001-N0-SUS',
    combinationId: 'LC-RED-TIP-01',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: null,
  }));
  assert.deepEqual(Object.keys(result).sort(), [...CODE_RESULT_KEYS].sort());
  assert.equal(result.schema, 'lfea-b31-code-result/v1');
  assert.equal(result.status, 'QUALIFIED UNDER CONFIGURED PROFILE');
  assertDeepFrozen(result);
});

test('B40-T02', 'SUSTAINED stress terms and utilization match a hand calculation: F/A + P direct, M/Z bending, weld-factor-scaled hot allowable', () => {
  const result = compileCodeResult(base({
    category: 'SUSTAINED',
    codePointId: 'CP-RED-001-N0-SUS',
    combinationId: 'LC-RED-TIP-01',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: null,
  }));
  const sectionModulus = element.section.secondMomentY / (section.dimensions.outerDiameter / 2);
  const expectedBending = Math.abs(n0.local.my / sectionModulus);
  const expectedCalculated = pressureStressContribution().value + expectedBending;
  const expectedAllowable = HOT_ALLOWABLE_VALUE * 0.9;
  assertClose(result.stressTerms.inPlaneBending, n0.local.my / sectionModulus, 1e-9, 'inPlaneBending term');
  assertClose(result.calculatedStress, expectedCalculated, 1e-9, 'calculatedStress');
  assertClose(result.allowableStress, expectedAllowable, 1e-9, 'allowableStress');
  assertClose(result.utilization, expectedCalculated / expectedAllowable, 1e-9, 'utilization');
  assert.equal(result.resultants.axialForce, 0);
  assert.equal(result.resultants.torsion, 0);
  assert.equal(result.resultants.outOfPlaneMoment, 0);
});

/* ---------------------------------------------------------------------- *
 * B31-OCC-01: OCCASIONAL — category- and duration-traceable allowable increase.
 * ---------------------------------------------------------------------- */

test('B40-T03', 'OCCASIONAL scales the sustained allowable by the declared, category-traceable duration factor, never a bare literal', () => {
  const result = compileCodeResult(base({
    category: 'OCCASIONAL',
    codePointId: 'CP-RED-001-N0-OCC',
    combinationId: 'LC-RED-TIP-01-WIND',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: 'WIND_FIXTURE',
  }));
  assertClose(result.allowableStress, HOT_ALLOWABLE_VALUE * 0.9 * 1.75, 1e-9, 'occasional allowable');
});

test('B40-T04', 'An occasionalCategoryId with no matching profile entry is refused rather than defaulted', () => {
  expectCode(() => compileCodeResult(base({
    category: 'OCCASIONAL',
    codePointId: 'CP-X',
    combinationId: 'LC-X',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: 'UNDECLARED_CATEGORY',
  })), 'CODE_ENGINE_OCCASIONAL_FACTOR_NOT_DECLARED');
});

/* ---------------------------------------------------------------------- *
 * B31-EXP-01: DISPLACEMENT_STRESS_RANGE — cold/hot weighted combination.
 * ---------------------------------------------------------------------- */

test('B40-T05', 'DISPLACEMENT_STRESS_RANGE combines declared cold/hot allowables and cycle-reduction factor generically, excludes pressure, and its stress uses the displacement SIFs', () => {
  const result = compileCodeResult(base({
    category: 'DISPLACEMENT_STRESS_RANGE',
    codePointId: 'CP-RED-001-N1-EXP',
    combinationId: 'EXP-T2-T1',
    localAction: n1.local,
    pressureStressContribution: null,
    coldTemperature: { value: COLD_TEMPERATURE, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' },
    occasionalCategoryId: null,
  }));
  assertClose(result.allowableStress, (0.3 * COLD_ALLOWABLE_VALUE + 0.6 * HOT_ALLOWABLE_VALUE) * 0.85, 1e-9, 'displacement-range allowable');
  assert.equal(result.stressTerms.pressure, 0);
  assert.equal(result.category, 'DISPLACEMENT_STRESS_RANGE');
});

test('B40-T06', 'A non-null pressureStressContribution is refused for DISPLACEMENT_STRESS_RANGE', () => {
  expectCode(() => compileCodeResult(base({
    category: 'DISPLACEMENT_STRESS_RANGE',
    codePointId: 'CP-X',
    combinationId: 'EXP-X',
    localAction: n1.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: { value: COLD_TEMPERATURE, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' },
    occasionalCategoryId: null,
  })), 'CODE_ENGINE_INVALID');
});

test('B40-T07', 'A missing coldTemperature is refused for DISPLACEMENT_STRESS_RANGE', () => {
  expectCode(() => compileCodeResult(base({
    category: 'DISPLACEMENT_STRESS_RANGE',
    codePointId: 'CP-X',
    combinationId: 'EXP-X',
    localAction: n1.local,
    pressureStressContribution: null,
    coldTemperature: null,
    occasionalCategoryId: null,
  })), 'CODE_ENGINE_DISPLACEMENT_RANGE_COLD_TEMPERATURE_REQUIRED');
});

test('B40-T08', 'A non-exact temperature under the LINEAR_BRACKET policy discloses an ACCEPTED interpolation limitation with the bracket evidence', () => {
  const result = compileCodeResult(base({
    codeProfile: codeProfile(),
    category: 'DISPLACEMENT_STRESS_RANGE',
    codePointId: 'CP-RED-001-N1-EXP-INTERP',
    combinationId: 'EXP-T2-T1',
    localAction: n1.local,
    pressureStressContribution: null,
    coldTemperature: { value: 350, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' },
    occasionalCategoryId: null,
  }));
  const entry = result.limitations.find((limitation) => limitation.code === 'CODE_ENGINE_APPROXIMATION_ALLOWABLE_TEMPERATURE_INTERPOLATION');
  assert.notEqual(entry, undefined);
  assert.equal(entry.status, 'ACCEPTED');
});

test('B40-T09', 'Under EXACT_MATCH_ONLY_V1, a non-exact temperature is refused rather than interpolated', () => {
  expectCode(() => compileCodeResult(base({
    codeProfile: exactMatchOnlyCodeProfile(),
    category: 'DISPLACEMENT_STRESS_RANGE',
    codePointId: 'CP-X',
    combinationId: 'EXP-X',
    localAction: n1.local,
    pressureStressContribution: null,
    coldTemperature: { value: 350, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' },
    occasionalCategoryId: null,
  })), 'CODE_ENGINE_TEMPERATURE_NOT_EXACT_MATCH');
});

test('B40-T10', 'A cold temperature outside the declared edition-dataset range is refused (extrapolation is never implemented under any policy)', () => {
  expectCode(() => compileCodeResult(base({
    category: 'DISPLACEMENT_STRESS_RANGE',
    codePointId: 'CP-X',
    combinationId: 'EXP-X',
    localAction: n1.local,
    pressureStressContribution: null,
    coldTemperature: { value: 900, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' },
    occasionalCategoryId: null,
  })), 'CODE_ENGINE_ALLOWABLE_TEMPERATURE_EXTRAPOLATION_PROHIBITED');
});

/* ---------------------------------------------------------------------- *
 * Section 10.5 liberal allowable use: visible switch, default OFF, evidence.
 * ---------------------------------------------------------------------- */

test('B40-T11', 'Liberal allowable use uplifts the displacement-range allowable and discloses a CONDITIONAL limitation with the uplift evidence', () => {
  const withUplift = compileCodeResult(base({
    codeProfile: liberalAllowableCodeProfile(),
    category: 'DISPLACEMENT_STRESS_RANGE',
    codePointId: 'CP-RED-001-N1-LIBERAL',
    combinationId: 'EXP-T2-T1',
    localAction: n1.local,
    pressureStressContribution: null,
    coldTemperature: { value: COLD_TEMPERATURE, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' },
    occasionalCategoryId: null,
  }));
  const baseline = (0.3 * COLD_ALLOWABLE_VALUE + 0.6 * HOT_ALLOWABLE_VALUE) * 0.85;
  assertClose(withUplift.allowableStress, baseline * 1.2, 1e-9, 'liberal-allowable uplifted range');
  assert.equal(withUplift.status, 'CONDITIONAL');
  const entry = withUplift.limitations.find((limitation) => limitation.code === 'CODE_ENGINE_APPROXIMATION_LIBERAL_ALLOWABLE_USE');
  assert.notEqual(entry, undefined);
  assert.equal(entry.details.upliftFactor, 0.2);
});

/* ---------------------------------------------------------------------- *
 * Section 10.4 applicability / ownership / override.
 * ---------------------------------------------------------------------- */

test('B40-T12', 'OUTSIDE_RANGE applicability blocks (B-3.2 applicability machinery reused directly, not reimplemented)', () => {
  expectCode(() => compileCodeResult(base({
    stressFactorSet: outsideRangeStressFactorSet(),
    category: 'SUSTAINED',
    codePointId: 'CP-X',
    combinationId: 'LC-X',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: null,
  })), 'PIPING_COMPONENT_B31J_APPLICABILITY_EXCEEDED');
});

test('B40-T13', 'USER_FACTOR_REQUIRED without an override blocks; with a complete override the result is CONDITIONAL', () => {
  expectCode(() => compileCodeResult(base({
    stressFactorSet: userFactorRequiredStressFactorSet(),
    category: 'SUSTAINED',
    codePointId: 'CP-X',
    combinationId: 'LC-X',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: null,
  })), 'PIPING_COMPONENT_USER_FACTOR_REQUIRED');
  const withOverride = compileCodeResult(base({
    stressFactorSet: userFactorRequiredStressFactorSet({ userOverride: userFactorOverride() }),
    category: 'SUSTAINED',
    codePointId: 'CP-X',
    combinationId: 'LC-X',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: null,
  }));
  assert.equal(withOverride.status, 'CONDITIONAL');
  const entry = withOverride.limitations.find((limitation) => limitation.code === 'CODE_ENGINE_APPROXIMATION_USER_FACTOR_OVERRIDE');
  assert.notEqual(entry, undefined);
});

test('B40-T14', 'An incomplete user override (missing a required field) is refused rather than partially accepted', () => {
  expectCode(() => sealStressFactorSet({
    schema: 'fea-b31-stress-factor-set/v1',
    factorSetId: 'SF-INCOMPLETE',
    componentId: 'RED-001',
    sourceIdentity: stressFactorSet().sourceIdentity,
    applicability: { status: 'USER_FACTOR_REQUIRED', ruleId: 'FIXTURE-RULE', evaluatedBy: 'FIXTURE' },
    momentDirectionMapping: { inPlaneField: 'my', outOfPlaneField: 'mz' },
    sustainedIndices: stressFactorSet().sustainedIndices,
    occasionalIndices: stressFactorSet().occasionalIndices,
    displacementSifs: stressFactorSet().displacementSifs,
    userOverride: { reason: 'x', source: 'y', sourceRevision: '01', approver: '' },
    semanticHash: '',
  }), 'CODE_ENGINE_USER_OVERRIDE_INCOMPLETE');
});

/* ---------------------------------------------------------------------- *
 * Section 10.1 scope / section 10.2 never-compliance categories.
 * ---------------------------------------------------------------------- */

test('B40-T15', 'A profile naming an unimplemented scope is refused explicitly rather than silently evaluated', () => {
  expectCode(() => codeProfile({ scope: 'NONMETALLIC_PIPING' }), 'CODE_ENGINE_SCOPE_NOT_IMPLEMENTED');
});

test('B40-T16', 'OPERATING is refused as a compliance category', () => {
  expectCode(() => compileCodeResult(base({
    category: 'OPERATING',
    codePointId: 'CP-X',
    combinationId: 'LC-X',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: null,
  })), 'CODE_ENGINE_OPERATING_NOT_A_COMPLIANCE_CATEGORY');
});

test('B40-T17', 'USER_PROJECT_CHECK is refused as a compliance category', () => {
  expectCode(() => compileCodeResult(base({
    category: 'USER_PROJECT_CHECK',
    codePointId: 'CP-X',
    combinationId: 'LC-X',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: null,
  })), 'CODE_ENGINE_USER_PROJECT_CHECK_NOT_A_COMPLIANCE_CATEGORY');
});

test('B40-T18', 'EXPANSION_RANGE_ENVELOPE fails closed without the required Eq. (1b) sustained stress', () => {
  expectCode(() => compileCodeResult(base({
    category: 'EXPANSION_RANGE_ENVELOPE',
    codePointId: 'CP-X',
    combinationId: 'EXP-X',
    localAction: n1.local,
    pressureStressContribution: null,
    coldTemperature: { value: COLD_TEMPERATURE, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' },
    sustainedStress: null,
    occasionalCategoryId: null,
  })), 'CODE_ENGINE_EXPANSION_RANGE_SUSTAINED_STRESS_REQUIRED');
});

/* ---------------------------------------------------------------------- *
 * Identity/consistency refusals.
 * ---------------------------------------------------------------------- */

test('B40-T19', 'A stress factor set declared for a different component is refused', () => {
  expectCode(() => compileCodeResult(base({
    stressFactorSet: stressFactorSet({ componentId: 'OTHER-COMPONENT' }),
    category: 'SUSTAINED',
    codePointId: 'CP-X',
    combinationId: 'LC-X',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: null,
  })), 'CODE_ENGINE_COMPONENT_MISMATCH');
});

test('B40-T20', 'An edition dataset declared for a different material is refused', () => {
  expectCode(() => compileCodeResult(base({
    editionDataset: editionDataset({ materialId: 'SS_316_FICTIONAL' }),
    category: 'SUSTAINED',
    codePointId: 'CP-X',
    combinationId: 'LC-X',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: null,
  })), 'CODE_ENGINE_MATERIAL_MISMATCH');
});

/* ---------------------------------------------------------------------- *
 * Section 15.5: changing the profile/dataset invalidates a prior result.
 * ---------------------------------------------------------------------- */

test('B40-T21', 'Changing the edition dataset (same codeProfileId) changes the code result semanticHash rather than silently reusing a stale result', () => {
  const first = compileCodeResult(base({
    category: 'SUSTAINED',
    codePointId: 'CP-STABLE',
    combinationId: 'LC-STABLE',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: null,
  }));
  const second = compileCodeResult(base({
    editionDataset: editionDataset({ weldJointFactor: { value: 0.95, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' } }),
    category: 'SUSTAINED',
    codePointId: 'CP-STABLE',
    combinationId: 'LC-STABLE',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: null,
  }));
  assert.notEqual(first.semanticHash, second.semanticHash);
  assert.notEqual(first.governingRuleId, second.governingRuleId);
  assert.notEqual(first.allowableStress, second.allowableStress);
});

test('B40-T22', 'Determinism: repeated compilation on identical input is byte-identical', () => {
  const args = base({
    category: 'SUSTAINED',
    codePointId: 'CP-DET',
    combinationId: 'LC-DET',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: null,
  });
  const first = compileCodeResult(args);
  const second = compileCodeResult(base({ ...args }));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.semanticHash, second.semanticHash);
});

test('B40-T23', 'requireCodeResult refuses a stale semantic hash and re-accepts an untampered record', () => {
  const result = compileCodeResult(base({
    category: 'SUSTAINED',
    codePointId: 'CP-REACCEPT',
    combinationId: 'LC-REACCEPT',
    localAction: n0.local,
    pressureStressContribution: pressureStressContribution(),
    coldTemperature: null,
    occasionalCategoryId: null,
  }));
  const reaccepted = requireCodeResult(result);
  assert.equal(reaccepted.semanticHash, result.semanticHash);
  const tampered = { ...result, combinationId: 'LC-TAMPERED' };
  expectCode(() => requireCodeResult(tampered), 'CODE_ENGINE_HASH_MISMATCH');
});

test('B40-T24', 'sealEditionDataset refuses a non-strictly-increasing temperature table (no duplicate/unsorted points)', () => {
  expectCode(() => sealEditionDataset({
    schema: 'fea-b31-edition-dataset/v1',
    datasetId: 'BAD-DATASET',
    sourceIdentity: editionDataset().sourceIdentity,
    materialId: 'CS_A106B',
    allowablePoints: [
      { absoluteTemperature: 393.15, allowableStress: { value: 90_000_000, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' } },
      { absoluteTemperature: 293.15, allowableStress: { value: 100_000_000, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' } },
    ],
    displacementRangeCoefficients: editionDataset().displacementRangeCoefficients,
    weldJointFactor: editionDataset().weldJointFactor,
    semanticHash: '',
  }), 'CODE_ENGINE_EDITION_DATASET_INVALID');
});

test('B40-T25', 'sealCodeProfile refuses liberalAllowableUse=false carrying a non-null uplift factor', () => {
  expectCode(() => sealCodeProfile({
    ...codeProfile(),
    liberalAllowableUpliftFactor: { value: 0.1, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' },
    semanticHash: '',
  }), 'CODE_ENGINE_PROFILE_INVALID');
});

console.log('\nLFEA B-4.0 B31.3 code engine check PASS\n');
