import {
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
} from './inputxml-model-health-profile.js';

export const INPUTXML_LINEAR_SOLVE_PREPARATION_PROFILE_SCHEMA =
  'fea-inputxml-linear-solve-preparation-profile/v1';
export const INPUTXML_INSTALLATION_TEMPERATURE = Object.freeze({
  value: 293.15,
  unit: 'K',
  source: 'INPUTXML_LINEAR_SOLVE_PREPARATION_R1',
});
export const INPUTXML_GRAVITY_ACCELERATION = Object.freeze({
  value: 9.80665,
  unit: 'm/s2',
  source: 'STANDARD_GRAVITY_EXACT',
});

const PROFILE_BY_ID = Object.freeze({
  [STRICT_INPUTXML_LINEAR_STATIC_PROFILE]: Object.freeze({
    schema: INPUTXML_LINEAR_SOLVE_PREPARATION_PROFILE_SCHEMA,
    profileId: STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
    modelCapabilityId: 'STRICT_LINEAR_STATIC',
    componentPolicy: 'EXACT_REPRESENTABILITY_ONLY',
    pressurePolicy: 'STRUCTURAL_PRESSURE_EFFECTS_REQUIRED',
  }),
  [DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE]: Object.freeze({
    schema: INPUTXML_LINEAR_SOLVE_PREPARATION_PROFILE_SCHEMA,
    profileId: DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
    modelCapabilityId: 'APPROXIMATE_LINEAR_STATIC',
    componentPolicy: 'DECLARED_REPRESENTABILITY_APPROXIMATIONS',
    pressurePolicy: 'CODE_ONLY_PRESSURE_CUSTODY',
  }),
});

export class InputXmlLinearSolvePreparationError extends Error {
  constructor(message, code, data = null) {
    super(message);
    this.name = 'InputXmlLinearSolvePreparationError';
    this.code = code;
    this.data = data;
  }
}

export function requireInputXmlLinearSolvePreparationProfile(profileId) {
  const profile = PROFILE_BY_ID[profileId] ?? null;
  if (profile === null) {
    throw new InputXmlLinearSolvePreparationError(
      `InputXML linear solve preparation profile ${String(profileId)} is unsupported.`,
      'INPUTXML_PREPARATION_PROFILE_UNSUPPORTED',
      { profileId },
    );
  }
  return profile;
}
