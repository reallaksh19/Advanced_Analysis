import { sealLoadCaseProfile } from '../linear-fea-load-case/index.js';
import {
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
} from './inputxml-model-health-profile.js';

export const INPUTXML_LINEAR_LOAD_PREPARATION_PROFILE_SCHEMA =
  'fea-inputxml-linear-load-preparation-profile/v1';
export const INPUTXML_GRAVITATIONAL_ACCELERATION = 9.80665;
export const INPUTXML_DEFAULT_GRAVITY_DIRECTION = Object.freeze({ x: 0, y: -1, z: 0 });

const PROFILE_BY_ID = Object.freeze({
  [STRICT_INPUTXML_LINEAR_STATIC_PROFILE]: Object.freeze({
    schema: INPUTXML_LINEAR_LOAD_PREPARATION_PROFILE_SCHEMA,
    profileId: STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
    sustainedCapabilityId: 'SUSTAINED_CASE_STRICT',
    operatingCapabilityId: 'OPERATING_CASE_STRICT',
    pressurePolicy: 'EXACT_STRUCTURAL_PRESSURE_EFFECTS_REQUIRED',
  }),
  [DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE]: Object.freeze({
    schema: INPUTXML_LINEAR_LOAD_PREPARATION_PROFILE_SCHEMA,
    profileId: DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
    sustainedCapabilityId: 'SUSTAINED_CASE_APPROXIMATE',
    operatingCapabilityId: 'OPERATING_CASE_APPROXIMATE',
    pressurePolicy: 'PRESSURE_RETAINED_FOR_CODE_STRESS_ONLY',
  }),
});

export function requireInputXmlLinearLoadPreparationProfile(profileId) {
  const profile = PROFILE_BY_ID[profileId] ?? null;
  if (profile === null) {
    throw new TypeError(`InputXML linear load preparation profile ${String(profileId)} is unsupported.`);
  }
  return profile;
}

export function inputXmlLinearLoadCaseProfile() {
  return sealLoadCaseProfile({
    schema: 'fea-linear-load-case-profile/v1',
    profileId: 'LINEAR-LOAD-CASE-R1',
    primitiveImmutabilityRule: 'PRIMITIVE_LOAD_CASE_IMMUTABLE_HASH_BOUND_V1',
    thermalStrainApproximation: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    combinationSemanticsRule: 'COMPONENT_SEMANTICS_VERIFIED_AGAINST_SOLVED_RESULTS_V1',
    codeCombinationRule: 'CODE_CATEGORY_COMBINATION_IS_NOT_A_SOLVER_LOAD_CASE_V1',
    gravitationalAcceleration: {
      value: INPUTXML_GRAVITATIONAL_ACCELERATION,
      source: 'INPUTXML_LINEAR_LOAD_PREPARATION_R1',
    },
    directionUnitTolerance: {
      value: 1e-12,
      source: 'INPUTXML_LINEAR_LOAD_PREPARATION_R1',
    },
    semanticHash: '',
  });
}

export function resolveInputXmlGravityDirection(value) {
  const accepted = value ?? INPUTXML_DEFAULT_GRAVITY_DIRECTION;
  const vector = [accepted?.x, accepted?.y, accepted?.z];
  if (!vector.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    throw new TypeError('InputXML gravity direction must contain finite x, y and z components.');
  }
  const magnitude = Math.hypot(...vector);
  if (!(Math.abs(magnitude - 1) <= 1e-12)) {
    throw new TypeError('InputXML gravity direction must be a unit vector; it is never renormalized.');
  }
  return Object.freeze({ x: vector[0], y: vector[1], z: vector[2] });
}
