import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import { compileFrameElement, sealFrameElementProfile } from '../src/core/linear-fea-frame-element/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
  sealLoadCaseProfile,
} from '../src/core/linear-fea-load-case/index.js';
import { elementContributionFromFrameElement, sealSolverProfile } from '../src/core/linear-fea-solver/index.js';
import { FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import {
  axisResult,
  compilerInput,
  materialResolution,
  sectionResolution,
} from './lfea-b2.5-model-compiler-fixtures.mjs';

export function clone(value) {
  return structuredClone(value);
}

export const SETTLEMENT_SLOT_ID = 'C-N121-UZ-SETTLEMENT';

/**
 * The B-2.5 fixture geometry (N-000120 at 0,0,0 -> N-000121 at 1.2,0,0 ->
 * N-000122 at 2.4,0,0), re-anchored as a determinate cantilever: all six
 * DOFs fixed at the root, every other DOF genuinely free. Used for FRAME-3D-01
 * closed-form checks, which need every tip DOF free of any other constraint.
 */
const FIXED_DOFS = ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'];

export function cantileverConstraintDeclarations() {
  return FIXED_DOFS.map((dof) => ({
    declarationId: `C-N120-${dof}`,
    kind: 'NODAL_RESTRAINT',
    nodeId: 'N-000120',
    dof,
    behavior: 'FIXED',
  }));
}

export function cantileverCompilation(overrides = {}) {
  const input = compilerInput({ constraintDeclarations: cantileverConstraintDeclarations(), ...overrides });
  return compileMechanicalModel(input);
}

/**
 * The same cantilever plus one prescribed-settlement slot at the mid-span
 * node (deliberately not the tip). Kept as a separate compilation, not an
 * addition to `cantileverCompilation`, so PRESCRIBED-01 has a slot to bind a
 * case-specific movement to without the slot's default-zero value quietly
 * becoming an extra support in the FRAME-3D-01 benchmark.
 */
export function cantileverWithSettlementSlotCompilation(overrides = {}) {
  const input = compilerInput({
    constraintDeclarations: [
      ...cantileverConstraintDeclarations(),
      {
        declarationId: SETTLEMENT_SLOT_ID,
        kind: 'NODAL_RESTRAINT',
        nodeId: 'N-000121',
        dof: 'UZ',
        behavior: 'PRESCRIBED_SLOT',
      },
    ],
    ...overrides,
  });
  return compileMechanicalModel(input);
}

/** The B-2.5 fixture's own minimal constraint set: one fixed DOF and one
 * spring, deliberately under-restrained (rotation about the beam axis is
 * never pinned anywhere), used to exercise mechanism/near-zero-pivot
 * detection rather than solved cleanly. */
export function underRestrainedCompilation(overrides = {}) {
  return compileMechanicalModel(compilerInput(overrides));
}

export function floatingCompilation(overrides = {}) {
  return compileMechanicalModel(compilerInput({ constraintDeclarations: [], ...overrides }));
}

export function frameElementProfile(overrides = {}) {
  return sealFrameElementProfile({
    schema: 'fea-linear-frame-element-profile/v1',
    profileId: 'LINEAR-FRAME-ELEMENT-R1',
    straightPipeFormulation: 'PIPE_FRAME3D_EULER_BERNOULLI_V1',
    shearDeformation: false,
    releaseRule: 'STATIC_CONDENSATION_V1',
    thermalStrainApproximation: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    releaseSingularityTolerance: { value: 1e-12, source: 'LFEA-B3.3-FIXTURE-PROFILE' },
    semanticHash: '',
    ...overrides,
  });
}

/** One compiled B-3.1 element per span of the fixture geometry, sharing the
 * exact material/section/axis authorities the bound model was compiled from. */
export function frameElements(profile = frameElementProfile()) {
  const e120 = compileFrameElement({
    elementId: 'E-000120',
    material: materialResolution(),
    section: sectionResolution(),
    localAxes: { result: axisResult([0, 0, 0], [1.2, 0, 0]), profile: FRAME_LOCAL_AXIS_PROFILE },
    profile,
    distributedLoads: [],
    temperature: null,
    releases: [],
    endSprings: [],
    rigidOffsets: null,
  });
  const e121 = compileFrameElement({
    elementId: 'E-000121',
    material: materialResolution(),
    section: sectionResolution(),
    localAxes: { result: axisResult([1.2, 0, 0], [2.4, 0, 0]), profile: FRAME_LOCAL_AXIS_PROFILE },
    profile,
    distributedLoads: [],
    temperature: null,
    releases: [],
    endSprings: [],
    rigidOffsets: null,
  });
  return [e120, e121];
}

export function elementContributions(profile = frameElementProfile()) {
  return frameElements(profile).map((element) => elementContributionFromFrameElement(element));
}

export function solverProfile(overrides = {}) {
  return sealSolverProfile({
    schema: 'fea-linear-solver-profile/v1',
    profileId: 'LINEAR-SOLVER-R1',
    backend: 'FEA_DENSE_DIRECT_CHOLESKY_LDLT_V1',
    scaling: 'DIAGONAL_ENERGY_SCALING_V1',
    momentReferenceRule: 'FIRST_CANONICAL_NODE_V1',
    normalizedResidualLimit: { value: 1e-9, source: 'LFEA-B3.3-FIXTURE-PROFILE' },
    normalizedResidualWarnLimit: { value: 1e-7, source: 'LFEA-B3.3-FIXTURE-PROFILE' },
    equilibriumRelativeLimit: { value: 1e-6, source: 'LFEA-B3.3-FIXTURE-PROFILE' },
    equilibriumAbsoluteForceFloor: { value: 1e-3, source: 'LFEA-B3.3-FIXTURE-PROFILE' },
    equilibriumAbsoluteMomentFloor: { value: 1e-3, source: 'LFEA-B3.3-FIXTURE-PROFILE' },
    energyBalanceLimit: { value: 1e-7, source: 'LFEA-B3.3-FIXTURE-PROFILE' },
    nearZeroPivotTolerance: { value: 1e-6, source: 'LFEA-B3.3-FIXTURE-PROFILE' },
    conditionWarning: { value: 1e12, source: 'LFEA-B3.3-FIXTURE-PROFILE' },
    conditionBlock: { value: 1e14, source: 'LFEA-B3.3-FIXTURE-PROFILE' },
    semanticHash: '',
    ...overrides,
  });
}

export function loadCaseProfile(overrides = {}) {
  return sealLoadCaseProfile({
    schema: 'fea-linear-load-case-profile/v1',
    profileId: 'LINEAR-LOAD-CASE-R1',
    primitiveImmutabilityRule: 'PRIMITIVE_LOAD_CASE_IMMUTABLE_HASH_BOUND_V1',
    thermalStrainApproximation: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    combinationSemanticsRule: 'COMPONENT_SEMANTICS_VERIFIED_AGAINST_SOLVED_RESULTS_V1',
    codeCombinationRule: 'CODE_CATEGORY_COMBINATION_IS_NOT_A_SOLVER_LOAD_CASE_V1',
    gravitationalAcceleration: { value: 9.80665, source: 'LFEA-B3.3-FIXTURE-PROFILE' },
    directionUnitTolerance: { value: 1e-12, source: 'LFEA-B3.3-FIXTURE-PROFILE' },
    semanticHash: '',
    ...overrides,
  });
}

/** Combined 3D tip load at the free end: Fy and Fz bend independently about
 * the two principal planes, Mx twists about the beam axis — genuinely
 * coupled 3D statics, not a single-plane restatement of a B-3.1 benchmark. */
export function tipLoadPrimitive(overrides = {}) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-TIP-N122',
    kind: 'NODAL_FORCE_MOMENT',
    nodeId: 'N-000122',
    basis: { kind: 'GLOBAL' },
    force: { fx: 0, fy: 1500, fz: -900 },
    moment: { mx: 340, my: 0, mz: 0 },
    units: { force: 'N', moment: 'N*m', length: 'm' },
    signConvention: 'APPLIED_TO_STRUCTURE',
    sourceEvidence: { sourceId: 'PROJECT-LOAD-REGISTER', sourceRevision: '01', sourceSemanticHash: 'fnv1a64:6666666666666666' },
    ...overrides,
  };
}

export function settlementPrimitive(overrides = {}) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-SETTLEMENT-N121',
    kind: 'PRESCRIBED_MOVEMENT',
    prescribedSlotId: SETTLEMENT_SLOT_ID,
    nodeId: 'N-000121',
    dof: 'UZ',
    value: -0.006,
    sourceEvidence: { sourceId: 'PROJECT-NOZZLE-MOVEMENT-SET', sourceRevision: '01', sourceSemanticHash: 'fnv1a64:9999999999999999' },
    ...overrides,
  };
}

/** Tip load only (no settlement, so the prescribed slot resolves to zero). */
export function tipLoadCase(compilation, overrides = {}) {
  const reference = modelReferenceFromCompilation(compilation);
  return compilePhysicalLoadCase({
    loadCaseId: 'LC-TIP-01',
    loadCaseClass: 'APPLIED_MECHANICAL',
    presentation: { label: 'Tip load', description: 'Combined 3D tip force and torque.' },
    modelReference: reference,
    primitives: [tipLoadPrimitive()],
    profile: loadCaseProfile(),
    ...overrides,
  });
}

/** Support settlement only, no applied mechanical load — PRESCRIBED-01. */
export function settlementLoadCase(compilation, overrides = {}) {
  const reference = modelReferenceFromCompilation(compilation);
  return compilePhysicalLoadCase({
    loadCaseId: 'LC-SETTLEMENT-01',
    loadCaseClass: 'PRESCRIBED_MOVEMENT',
    presentation: { label: 'Settlement', description: 'Support settlement at the free-end slot.' },
    modelReference: reference,
    primitives: [settlementPrimitive()],
    profile: loadCaseProfile(),
    ...overrides,
  });
}
