import {
  CODE_COMBINATION_RULE,
  COMBINATION_SEMANTICS_RULE,
  LOAD_CASE_PROFILE_ID,
  LOAD_CASE_PROFILE_SCHEMA,
  PRIMITIVE_IMMUTABILITY_RULE,
  UNIFORM_TEMPERATURE_THERMAL_STRAIN_PROFILE,
  sealLoadCaseProfile,
} from '../linear-fea-load-case/index.js';

export const INPUTXML_LINEAR_PHYSICAL_CASE_PROFILE_SCHEMA =
  'fea-inputxml-linear-physical-case-profile/v1';
export const INPUTXML_DEFAULT_GRAVITY_DIRECTION = Object.freeze({ x: 0, y: -1, z: 0 });

export function inputXmlLinearPhysicalLoadCaseProfile() {
  return sealLoadCaseProfile({
    schema: LOAD_CASE_PROFILE_SCHEMA,
    profileId: LOAD_CASE_PROFILE_ID,
    primitiveImmutabilityRule: PRIMITIVE_IMMUTABILITY_RULE,
    thermalStrainApproximation: UNIFORM_TEMPERATURE_THERMAL_STRAIN_PROFILE,
    combinationSemanticsRule: COMBINATION_SEMANTICS_RULE,
    codeCombinationRule: CODE_COMBINATION_RULE,
    gravitationalAcceleration: {
      value: 9.80665,
      source: 'STANDARD_GRAVITY_EXACT',
    },
    directionUnitTolerance: {
      value: 1e-12,
      source: 'INPUTXML_LINEAR_PHYSICAL_CASES_R1',
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
  if (Math.abs(magnitude - 1) > 1e-12) {
    throw new TypeError('InputXML gravity direction must be a unit vector and is never renormalized.');
  }
  return Object.freeze({ x: vector[0], y: vector[1], z: vector[2] });
}
