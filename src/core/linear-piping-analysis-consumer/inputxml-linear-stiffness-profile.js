import {
  EULER_BERNOULLI_FORMULATION,
  FRAME_ELEMENT_PROFILE_ID,
  FRAME_ELEMENT_PROFILE_SCHEMA,
  STATIC_CONDENSATION_RULE,
  UNIFORM_TEMPERATURE_THERMAL_STRAIN_PROFILE,
  sealFrameElementProfile,
} from '../linear-fea-frame-element/index.js';
import {
  DIAGONAL_ENERGY_SCALING_ID,
  MOMENT_REFERENCE_RULE,
  SOLVER_PROFILE_ID,
  SOLVER_PROFILE_SCHEMA,
  SPARSE_DIRECT_BACKEND_ID,
  requireSolverProfile,
  sealSolverProfile,
} from '../linear-fea-solver/index.js';

export const INPUTXML_STIFFNESS_PREFLIGHT_PROFILE_ID =
  'INPUTXML-LINEAR-STIFFNESS-PREFLIGHT-R1';
export const INPUTXML_STIFFNESS_PREFLIGHT_SOURCE =
  'REVISION-2-INPUTXML-STIFFNESS-PREFLIGHT-R1';
export const INPUTXML_STIFFNESS_CONDITIONING_SOURCE =
  'M027-BM2-CONDITIONING-STUDY';

export function inputXmlStiffnessFrameElementProfile() {
  return sealFrameElementProfile({
    schema: FRAME_ELEMENT_PROFILE_SCHEMA,
    profileId: FRAME_ELEMENT_PROFILE_ID,
    straightPipeFormulation: EULER_BERNOULLI_FORMULATION,
    shearDeformation: false,
    releaseRule: STATIC_CONDENSATION_RULE,
    thermalStrainApproximation: UNIFORM_TEMPERATURE_THERMAL_STRAIN_PROFILE,
    releaseSingularityTolerance: {
      value: 1e-12,
      source: INPUTXML_STIFFNESS_PREFLIGHT_SOURCE,
    },
    semanticHash: '',
  });
}

export function inputXmlStiffnessSolverProfile(candidate) {
  if (candidate) return requireSolverProfile(candidate);
  return sealSolverProfile({
    schema: SOLVER_PROFILE_SCHEMA,
    profileId: SOLVER_PROFILE_ID,
    backend: SPARSE_DIRECT_BACKEND_ID,
    scaling: DIAGONAL_ENERGY_SCALING_ID,
    momentReferenceRule: MOMENT_REFERENCE_RULE,
    normalizedResidualLimit: { value: 1e-9, source: INPUTXML_STIFFNESS_PREFLIGHT_SOURCE },
    normalizedResidualWarnLimit: { value: 1e-7, source: INPUTXML_STIFFNESS_PREFLIGHT_SOURCE },
    equilibriumRelativeLimit: { value: 1e-6, source: INPUTXML_STIFFNESS_PREFLIGHT_SOURCE },
    equilibriumAbsoluteForceFloor: { value: 1e-3, source: INPUTXML_STIFFNESS_PREFLIGHT_SOURCE },
    equilibriumAbsoluteMomentFloor: { value: 1e-3, source: INPUTXML_STIFFNESS_PREFLIGHT_SOURCE },
    energyBalanceLimit: { value: 1e-7, source: INPUTXML_STIFFNESS_PREFLIGHT_SOURCE },
    nearZeroPivotTolerance: { value: 1e-12, source: INPUTXML_STIFFNESS_CONDITIONING_SOURCE },
    conditionWarning: { value: 1e14, source: INPUTXML_STIFFNESS_CONDITIONING_SOURCE },
    conditionBlock: { value: 1e18, source: INPUTXML_STIFFNESS_CONDITIONING_SOURCE },
    semanticHash: '',
  });
}
