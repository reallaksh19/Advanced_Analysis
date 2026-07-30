import { compileSolverExecution, elementContributionsFromPipingComponent } from '../src/core/linear-fea-solver/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import {
  sealCodeProfile,
  sealEditionDataset,
  sealStressFactorSet,
} from '../src/core/linear-fea-b31-code-engine/index.js';
import { solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import {
  recoveryProfile,
  reducerCompilation,
  reducerComponent,
  reducerTipLoadCase,
} from './lfea-b3.4-recovery-fixtures.mjs';
import { materialResolution, sectionResolution } from './lfea-b2.5-model-compiler-fixtures.mjs';

/**
 * LFEA-B4.0 fixtures.
 *
 * LEGAL/SPEC BOUNDARY: every numeric value below — allowable stresses,
 * weld/joint factor, occasional duration factors, displacement-range
 * coefficients, B31J indices/SIFs — is a clearly fictional, round,
 * illustrative number, never a transcribed ASME B31.3/B31J table value.
 * Every declared `source` field below is literally `FIXTURE-EDITION-DATASET-
 * NOT-ASME` (or a sibling `FIXTURE-...-NOT-ASME` string) so nobody could
 * mistake this for real ASME data. A real deployment would plug in a
 * licensed, user-authorized edition dataset with real source citations in
 * exactly these same fields.
 *
 * Builds on the B-3.4 REDUCER-01 fixture (stepped two-section reducer,
 * cantilevered, tip nodal load) so B-4.0 exercises a real recovered local
 * action rather than a hand-built one — sections 15.2 B31-SUS-01/B31-EXP-01/
 * B31-OCC-01 all evaluate stress at a physical code point recovered by B-3.4.
 */

const NOT_ASME = 'FIXTURE-EDITION-DATASET-NOT-ASME';
const NOT_B31J = 'FIXTURE-B31J-FACTOR-SET-NOT-ASME';

export const solverProfileFixture = solverProfile;

export function reducerRecovery() {
  const model = reducerCompilation();
  const component = reducerComponent();
  const loadCase = reducerTipLoadCase(model);
  const contributions = elementContributionsFromPipingComponent(component);
  const execution = compileSolverExecution({
    compilation: model, elementContributions: contributions, loadCase, solverProfile: solverProfile(),
  });
  return {
    model,
    component,
    loadCase,
    execution,
    recovery: compileResultRecovery({
      compilation: model, execution, loadCase, frameElements: [], pipingComponents: [component], recoveryProfile: recoveryProfile(),
    }),
  };
}

/** The N0 fixed-end code point and its owning element (RED-001.E1, section
 * SEC-NPS6-SCH40) — a trivial single-candidate station (section 9.1). */
export function codePointN0(recovery) {
  return recovery.componentResultants[0].codePoints.find((entry) => entry.nodeId === 'RED-001.N0');
}

/** The N1 shared-internal-node code point (RED-001.E1's J end, per B-3.4's
 * own primary-candidate ordering) — carries a genuine bending moment from the
 * tip load's moment arm. */
export function codePointN1(recovery) {
  return recovery.componentResultants[0].codePoints.find((entry) => entry.nodeId === 'RED-001.N1');
}

export function reducerFrameElementE1(component) {
  return component.elements.find((entry) => entry.elementId === 'RED-001.E1').frameElement;
}

/** The full B-2.2/B-2.3 resolutions RED-001.E1 was compiled from (materialId
 * `CS_A106B`, section `SEC-NPS6-SCH40`) — cited by `compileCodeResult` for
 * geometry/material identity, never re-derived. */
export function reducerMaterialResolution() {
  return materialResolution();
}

export function reducerSectionResolutionE1() {
  return sectionResolution();
}

/* ---------------------------------------------------------------------- *
 * Code profile.
 * ---------------------------------------------------------------------- */

export function codeProfile(overrides = {}) {
  return sealCodeProfile({
    schema: 'fea-b31-code-profile/v1',
    profileId: 'LINEAR-B31-CODE-PROFILE-R1',
    codeProfileId: 'FIXTURE-B31-3-2024-PROFILE-R1',
    scope: 'METALLIC_PROCESS_PIPING_B31_3',
    editionStandard: 'ASME_B31_3_2024',
    flexibilitySource: 'ASME_B31J_2023',
    temperatureInterpolationPolicy: 'LINEAR_BRACKET_INTERPOLATION_V1',
    displacementRangeCombinationRuleId: 'DISPLACEMENT_RANGE_COLD_HOT_CYCLE_REDUCTION_LINEAR_V1',
    occasionalDurationFactors: [
      { occasionalCategoryId: 'WIND_FIXTURE', durationFactor: { value: 1.75, source: NOT_ASME } },
      { occasionalCategoryId: 'SEISMIC_FIXTURE', durationFactor: { value: 2.5, source: NOT_ASME } },
    ],
    liberalAllowableUse: false,
    liberalAllowableUpliftFactor: null,
    semanticHash: '',
    ...overrides,
  });
}

export function liberalAllowableCodeProfile(overrides = {}) {
  return codeProfile({
    liberalAllowableUse: true,
    liberalAllowableUpliftFactor: { value: 0.2, source: NOT_ASME },
    ...overrides,
  });
}

export function exactMatchOnlyCodeProfile(overrides = {}) {
  return codeProfile({ temperatureInterpolationPolicy: 'EXACT_MATCH_ONLY_V1', ...overrides });
}

/* ---------------------------------------------------------------------- *
 * Edition dataset.
 * ---------------------------------------------------------------------- */

export const COLD_TEMPERATURE = 293.15;
export const HOT_TEMPERATURE = 393.15;
export const COLD_ALLOWABLE_VALUE = 100_000_000;
export const HOT_ALLOWABLE_VALUE = 90_000_000;

export function editionDataset(overrides = {}) {
  return sealEditionDataset({
    schema: 'fea-b31-edition-dataset/v1',
    datasetId: 'FIXTURE-EDITION-DATASET-01',
    sourceIdentity: {
      standard: NOT_ASME,
      edition: 'FIXTURE-EDITION-2026',
      sourceRevision: '00',
      sourceSemanticHash: 'fnv1a64:1234567890abcdef',
    },
    materialId: 'CS_A106B',
    allowablePoints: [
      { absoluteTemperature: COLD_TEMPERATURE, allowableStress: { value: COLD_ALLOWABLE_VALUE, source: NOT_ASME } },
      { absoluteTemperature: HOT_TEMPERATURE, allowableStress: { value: HOT_ALLOWABLE_VALUE, source: NOT_ASME } },
      { absoluteTemperature: 500, allowableStress: { value: 80_000_000, source: NOT_ASME } },
    ],
    displacementRangeCoefficients: {
      coldWeight: { value: 0.3, source: NOT_ASME },
      hotWeight: { value: 0.6, source: NOT_ASME },
      cycleReductionFactor: { value: 0.85, source: NOT_ASME },
    },
    weldJointFactor: { value: 0.9, source: NOT_ASME },
    semanticHash: '',
    ...overrides,
  });
}

/* ---------------------------------------------------------------------- *
 * Stress factor set — unity indices/SIFs (a straight run away from any
 * fitting) so hand verification reduces to plain F/A, M/Z beam mechanics.
 * ---------------------------------------------------------------------- */

function unityDirectionalFactors() {
  return {
    axial: { value: 1, source: NOT_B31J },
    torsional: { value: 1, source: NOT_B31J },
    inPlaneBending: { value: 1, source: NOT_B31J },
    outOfPlaneBending: { value: 1, source: NOT_B31J },
  };
}

export function stressFactorSet(overrides = {}) {
  return sealStressFactorSet({
    schema: 'fea-b31-stress-factor-set/v1',
    factorSetId: 'SF-RED-001-FIXTURE',
    componentId: 'RED-001',
    sourceIdentity: {
      standard: NOT_B31J,
      edition: 'FIXTURE-2023',
      ruleId: 'FIXTURE-RULE-STRAIGHT-PIPE',
      sourceRevision: '00',
      sourceSemanticHash: 'fnv1a64:abcdef1234567890',
    },
    applicability: { status: 'WITHIN_RANGE', ruleId: 'FIXTURE-RULE-STRAIGHT-PIPE', evaluatedBy: 'FIXTURE-EVALUATOR' },
    momentDirectionMapping: { inPlaneField: 'my', outOfPlaneField: 'mz' },
    sustainedIndices: unityDirectionalFactors(),
    occasionalIndices: unityDirectionalFactors(),
    displacementSifs: unityDirectionalFactors(),
    userOverride: null,
    semanticHash: '',
    ...overrides,
  });
}

export function outsideRangeStressFactorSet(overrides = {}) {
  return stressFactorSet({
    applicability: { status: 'OUTSIDE_RANGE', ruleId: 'FIXTURE-RULE-STRAIGHT-PIPE', evaluatedBy: 'FIXTURE-EVALUATOR' },
    ...overrides,
  });
}

export function userFactorRequiredStressFactorSet(overrides = {}) {
  return stressFactorSet({
    applicability: { status: 'USER_FACTOR_REQUIRED', ruleId: 'FIXTURE-RULE-STRAIGHT-PIPE', evaluatedBy: 'FIXTURE-EVALUATOR' },
    ...overrides,
  });
}

export function userFactorOverride() {
  return {
    reason: 'Project engineer accepted geometry outside the declared B31J applicability range.',
    source: 'PROJECT-DEVIATION-LOG-001',
    sourceRevision: '01',
    approver: 'J. FIXTURE-APPROVER',
  };
}

export function pressureStressContribution(overrides = {}) {
  return { value: 5_000_000, source: NOT_ASME, ...overrides };
}
