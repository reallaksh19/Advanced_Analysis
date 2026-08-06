import { sealMechanicalModelCompilerProfile } from '../linear-fea-model-compiler/index.js';
import {
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
} from './inputxml-model-health-profile.js';

export const INPUTXML_LINEAR_PREPARATION_PROFILE_SCHEMA =
  'fea-inputxml-linear-structural-preparation-profile/v1';
export const INPUTXML_INSTALLATION_TEMPERATURE = 293.15;

export const INPUTXML_LINEAR_CONDITIONING_PROFILE = Object.freeze({
  spanSeedingLimit: {
    value: 1000,
    source: 'InputXML structural preparation preserves one analysis span per source PIPINGELEMENT.',
  },
  bendSeedingSegments: {
    value: 4,
    source: 'Strict preparation blocks uncompiled bends; approximation preparation retains one disclosed straight chord.',
  },
  bendLengthErrorLimit: {
    value: 0.01,
    source: 'InputXML structural preparation conditioning disclosure.',
  },
});

const PROFILE_BY_ID = Object.freeze({
  [STRICT_INPUTXML_LINEAR_STATIC_PROFILE]: Object.freeze({
    schema: INPUTXML_LINEAR_PREPARATION_PROFILE_SCHEMA,
    profileId: STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
    modelCapabilityId: 'STRICT_LINEAR_STATIC',
    componentPolicy: 'EXACT_COMPONENTS_ONLY',
    constraintPolicy: 'EXACT_BILATERAL_CONSTRAINTS_ONLY',
  }),
  [DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE]: Object.freeze({
    schema: INPUTXML_LINEAR_PREPARATION_PROFILE_SCHEMA,
    profileId: DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
    modelCapabilityId: 'APPROXIMATE_LINEAR_STATIC',
    componentPolicy: 'DECLARED_FRAME_CHORD_APPROXIMATIONS',
    constraintPolicy: 'DECLARED_FIXED_CONSTRAINT_APPROXIMATIONS',
  }),
});

export class InputXmlLinearPreparationError extends Error {
  constructor(message, code, data) {
    super(message);
    this.name = 'InputXmlLinearPreparationError';
    this.code = code;
    this.data = data ?? null;
  }
}

export function requireInputXmlLinearPreparationProfile(profileId) {
  const profile = PROFILE_BY_ID[profileId] ?? null;
  if (profile === null) {
    throw new InputXmlLinearPreparationError(
      `InputXML structural preparation profile ${String(profileId)} is not supported.`,
      'INPUTXML_PREPARATION_PROFILE_UNSUPPORTED',
      { profileId },
    );
  }
  return profile;
}

export function inputXmlMechanicalModelCompilerProfile() {
  return sealMechanicalModelCompilerProfile({
    schema: 'fea-linear-model-compiler-profile/v1',
    profileId: 'INPUTXML-LINEAR-MODEL-COMPILER-R1',
    spanBindingRule: 'EXACTLY_ONE_BINDING_PER_SPAN_V1',
    zeroLengthLinkRule: 'ZERO_LENGTH_LINK_PROHIBITED_V1',
    constraintConflictRule: 'CONFLICTING_DEFINITION_BLOCKS_COMPILATION_V1',
    unrepresentableFeatureRule: 'UNREPRESENTABLE_FEATURE_BLOCKS_COMPILATION_V1',
    minimumElementLength: { value: 1e-8, source: 'INPUTXML_STRUCTURAL_PREPARATION_R1' },
    spanDirectionTolerance: { value: 1e-9, source: 'INPUTXML_STRUCTURAL_PREPARATION_R1' },
    semanticHash: '',
  });
}
