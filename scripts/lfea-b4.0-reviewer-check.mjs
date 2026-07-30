#!/usr/bin/env node

/**
 * LFEA B-4.0 permanent reviewer regressions (section 15.5).
 *
 * Every regression here is proved against live sealed evidence built from the
 * B-3.4 REDUCER-01 fixture, not merely asserted by inspection:
 *
 *  1. A self-referential hash projection (`semanticHash`/`evidenceHash` must
 *     never feed their own hash input) — the same false "stale hash" shape
 *     B-3.3/B-3.4 guard against.
 *  2. Displacement SIFs must never leak into a SUSTAINED/OCCASIONAL
 *     evaluation, or vice versa — section 15.5's "apply displacement SIFs to
 *     sustained stress or vice versa" regression, proved by giving the two
 *     factor groups genuinely different values and checking each category's
 *     result only ever reflects its own group.
 *  3. Changing the edition dataset or the code profile must invalidate a
 *     prior code result rather than silently reusing it (section 15.5
 *     "change B31.3 edition/profile without invalidating code results").
 *  4. Outside-range B31J applicability is never silently clamped (section
 *     15.5 "silently clamp unsupported B31J geometry") — it blocks, and a
 *     USER_FACTOR_REQUIRED verdict blocks too unless a complete override is
 *     supplied.
 *  5. deepFreeze recursion is never blocked by a nested `Object.freeze` this
 *     package calls on its own draft objects before the final seal.
 */

import assert from 'node:assert/strict';
import {
  codeResultSemanticProjection,
  compileCodeResult,
  computeCodeResultSemanticHash,
  requireCodeResult,
} from '../src/core/linear-fea-b31-code-engine/index.js';
import {
  reducerRecovery,
  codePointN0,
  reducerFrameElementE1,
  reducerMaterialResolution,
  reducerSectionResolutionE1,
  codeProfile,
  editionDataset,
  stressFactorSet,
  outsideRangeStressFactorSet,
  userFactorRequiredStressFactorSet,
  userFactorOverride,
  pressureStressContribution,
} from './lfea-b4.0-code-engine-fixtures.mjs';

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

const { recovery, component } = reducerRecovery();
const n0 = codePointN0(recovery);
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
    localAction: n0.local,
    coldTemperature: null,
    occasionalCategoryId: null,
    ...overrides,
  };
}

const result = compileCodeResult(base({
  category: 'SUSTAINED',
  codePointId: 'CP-REVIEWER',
  combinationId: 'LC-REVIEWER',
  pressureStressContribution: pressureStressContribution(),
}));

/*
 * Regression 1 — self-referential hash projection. `semanticHash` and
 * `evidenceHash` must never enter the projection `computeCodeResultSemanticHash`
 * hashes, or every re-validation after the draft's empty-string placeholder is
 * replaced by the real hash would recompute to a different value and report a
 * false "stale hash" forever.
 */
{
  const projection = codeResultSemanticProjection(result);
  assert.equal('semanticHash' in projection, false, 'codeResultSemanticProjection must exclude semanticHash');
  assert.equal('evidenceHash' in projection, false, 'codeResultSemanticProjection must exclude evidenceHash');
  assert.equal(computeCodeResultSemanticHash(result), result.semanticHash, 'recomputing must reproduce the sealed hash exactly');
  const selfReferentialProjection = { ...codeResultSemanticProjection(result), semanticHash: result.semanticHash };
  const selfReferentialDraftProjection = { ...codeResultSemanticProjection(result), semanticHash: '' };
  assert.notDeepEqual(
    selfReferentialProjection,
    selfReferentialDraftProjection,
    'a hash-inclusive projection would disagree between the draft and sealed forms — the exact false "stale hash" shape being guarded against',
  );
}

/*
 * Regression 2 — displacement SIFs must never leak into SUSTAINED/OCCASIONAL,
 * and sustained/occasional indices must never leak into DISPLACEMENT_STRESS_RANGE.
 * Build a factor set where the three groups carry genuinely different values
 * and confirm each category's calculatedStress reflects only its own group.
 */
{
  const distinctFactorSet = stressFactorSet({
    sustainedIndices: {
      axial: { value: 1, source: 'FIXTURE-B31J-FACTOR-SET-NOT-ASME' },
      torsional: { value: 1, source: 'FIXTURE-B31J-FACTOR-SET-NOT-ASME' },
      inPlaneBending: { value: 1, source: 'FIXTURE-B31J-FACTOR-SET-NOT-ASME' },
      outOfPlaneBending: { value: 1, source: 'FIXTURE-B31J-FACTOR-SET-NOT-ASME' },
    },
    occasionalIndices: {
      axial: { value: 2, source: 'FIXTURE-B31J-FACTOR-SET-NOT-ASME' },
      torsional: { value: 2, source: 'FIXTURE-B31J-FACTOR-SET-NOT-ASME' },
      inPlaneBending: { value: 2, source: 'FIXTURE-B31J-FACTOR-SET-NOT-ASME' },
      outOfPlaneBending: { value: 2, source: 'FIXTURE-B31J-FACTOR-SET-NOT-ASME' },
    },
    displacementSifs: {
      axial: { value: 4, source: 'FIXTURE-B31J-FACTOR-SET-NOT-ASME' },
      torsional: { value: 4, source: 'FIXTURE-B31J-FACTOR-SET-NOT-ASME' },
      inPlaneBending: { value: 4, source: 'FIXTURE-B31J-FACTOR-SET-NOT-ASME' },
      outOfPlaneBending: { value: 4, source: 'FIXTURE-B31J-FACTOR-SET-NOT-ASME' },
    },
  });
  const sustained = compileCodeResult(base({
    stressFactorSet: distinctFactorSet, category: 'SUSTAINED', codePointId: 'CP-X1', combinationId: 'LC-X1',
    pressureStressContribution: pressureStressContribution(),
  }));
  const occasional = compileCodeResult(base({
    stressFactorSet: distinctFactorSet, category: 'OCCASIONAL', codePointId: 'CP-X2', combinationId: 'LC-X2',
    pressureStressContribution: pressureStressContribution(), occasionalCategoryId: 'WIND_FIXTURE',
  }));
  const displacement = compileCodeResult(base({
    stressFactorSet: distinctFactorSet, category: 'DISPLACEMENT_STRESS_RANGE', codePointId: 'CP-X3', combinationId: 'EXP-X3',
    pressureStressContribution: null, coldTemperature: { value: 293.15, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' },
  }));
  assert.equal(sustained.factors.inPlaneSif, 1, 'SUSTAINED must use sustainedIndices, never displacementSifs or occasionalIndices');
  assert.equal(occasional.factors.inPlaneSif, 2, 'OCCASIONAL must use occasionalIndices, never sustainedIndices or displacementSifs');
  assert.equal(displacement.factors.inPlaneSif, 4, 'DISPLACEMENT_STRESS_RANGE must use displacementSifs, never sustainedIndices or occasionalIndices');
  // The bending term scales linearly with the index; a crossed-wire bug
  // (applying displacementSifs=4 to SUSTAINED, say) would inflate the
  // sustained bending term by 4x relative to the occasional one at 2x,
  // rather than the correct 2x ratio between the two.
  assert.ok(
    Math.abs(occasional.stressTerms.inPlaneBending / sustained.stressTerms.inPlaneBending - 2) < 1e-9,
    'OCCASIONAL bending term must be exactly 2x the SUSTAINED bending term (indices 2 vs 1), proving no cross-category factor leakage',
  );
}

/*
 * Regression 3 — changing the edition dataset or the code profile must
 * invalidate a prior code result. `governingRuleId` folds a fragment of both
 * semantic hashes into itself specifically so this holds even if a caller
 * reuses the same human-readable `codeProfileId` across a real edition change.
 */
{
  const args = base({ category: 'SUSTAINED', codePointId: 'CP-STABLE', combinationId: 'LC-STABLE', pressureStressContribution: pressureStressContribution() });
  const original = compileCodeResult(args);
  const differentDataset = compileCodeResult({
    ...args,
    editionDataset: editionDataset({ weldJointFactor: { value: 0.99, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' } }),
  });
  const differentProfile = compileCodeResult({
    ...args,
    codeProfile: codeProfile({ occasionalDurationFactors: [
      { occasionalCategoryId: 'WIND_FIXTURE', durationFactor: { value: 1.76, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' } },
      { occasionalCategoryId: 'SEISMIC_FIXTURE', durationFactor: { value: 2.5, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' } },
    ] }),
  });
  assert.notEqual(original.semanticHash, differentDataset.semanticHash, 'an edition-dataset change must invalidate the prior code result hash');
  assert.notEqual(original.semanticHash, differentProfile.semanticHash, 'a code-profile change must invalidate the prior code result hash, even for a field the SUSTAINED category itself does not consume');
}

/*
 * Regression 4 — outside-range B31J applicability is never silently clamped:
 * it blocks (never a clamped/averaged factor), and USER_FACTOR_REQUIRED
 * blocks unless a complete override is supplied.
 */
{
  expectCode(() => compileCodeResult(base({
    stressFactorSet: outsideRangeStressFactorSet(), category: 'SUSTAINED', codePointId: 'CP-Y1', combinationId: 'LC-Y1',
    pressureStressContribution: pressureStressContribution(),
  })), 'PIPING_COMPONENT_B31J_APPLICABILITY_EXCEEDED');
  expectCode(() => compileCodeResult(base({
    stressFactorSet: userFactorRequiredStressFactorSet(), category: 'OCCASIONAL', codePointId: 'CP-Y2', combinationId: 'LC-Y2',
    pressureStressContribution: pressureStressContribution(), occasionalCategoryId: 'WIND_FIXTURE',
  })), 'PIPING_COMPONENT_USER_FACTOR_REQUIRED');
  const withOverride = compileCodeResult(base({
    stressFactorSet: userFactorRequiredStressFactorSet({ userOverride: userFactorOverride() }),
    category: 'OCCASIONAL', codePointId: 'CP-Y3', combinationId: 'LC-Y3',
    pressureStressContribution: pressureStressContribution(), occasionalCategoryId: 'WIND_FIXTURE',
  }));
  assert.equal(withOverride.status, 'CONDITIONAL');
}

/*
 * Regression 5 — deepFreeze recursion must never be blocked by a nested
 * Object.freeze this package calls on its own draft objects before the final
 * seal.
 */
{
  assert.equal(Object.isFrozen(result.resultants), true);
  assert.equal(Object.isFrozen(result.factors), true);
  assert.equal(Object.isFrozen(result.stressTerms), true);
  assert.equal(Object.isFrozen(result.limitations), true);
  assert.throws(() => { result.resultants.axialForce = 999; }, TypeError);
  assert.throws(() => { result.limitations.push({}); }, TypeError);
}

/* Sanity: requireCodeResult still refuses a genuinely stale hash. */
{
  const tampered = { ...result, combinationId: 'LC-TAMPERED-REVIEWER' };
  expectCode(() => requireCodeResult(tampered), 'CODE_ENGINE_HASH_MISMATCH');
}

console.log('LFEA B-4.0 reviewer regression check PASS');
