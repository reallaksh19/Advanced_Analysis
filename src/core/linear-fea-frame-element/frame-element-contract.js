import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { requireCanonicalNodeId } from '../linear-fea-contract/identifiers.js';
import {
  DEFERRED_ALPHA_INTEGRATION_THERMAL_STRAIN_PROFILE,
  PROHIBITED_PROFILE_SOURCE_TOKENS,
  UNIFORM_TEMPERATURE_THERMAL_STRAIN_PROFILE,
  compareAscii,
} from '../linear-fea-load-case/load-case-contract.js';

/**
 * LFEA-B3.1 straight 3D frame element contracts.
 *
 * This module holds the schema identities, the formulation-profile authority,
 * the frozen release rule and the rejection codes for the straight-element
 * formulation layer (section 5.1-5.4). It declares nothing about assembly:
 * DOF maps, sparse indexing and factorization are B-3.3, and an element that
 * knew its global indices would already be half a solver.
 */

export const FRAME_ELEMENT_PROFILE_SCHEMA = 'fea-linear-frame-element-profile/v1';
export const FRAME_ELEMENT_SCHEMA = 'fea-linear-frame-element/v1';

export const FRAME_ELEMENT_PROFILE_ID = 'LINEAR-FRAME-ELEMENT-R1';

export const EULER_BERNOULLI_FORMULATION = 'PIPE_FRAME3D_EULER_BERNOULLI_V1';
export const TIMOSHENKO_FORMULATION = 'PIPE_FRAME3D_TIMOSHENKO_V1';
export const FRAME_FORMULATIONS = Object.freeze([
  EULER_BERNOULLI_FORMULATION,
  TIMOSHENKO_FORMULATION,
]);

/**
 * Section 5.3: the condensation method and its singularity behavior are frozen
 * under one versioned identity. Section 13 names it in the formulation profile.
 */
export const STATIC_CONDENSATION_RULE = 'STATIC_CONDENSATION_V1';

export { UNIFORM_TEMPERATURE_THERMAL_STRAIN_PROFILE };

const BASE_PROFILE_KEYS = Object.freeze([
  'schema',
  'profileId',
  'straightPipeFormulation',
  'shearDeformation',
  'releaseRule',
  'thermalStrainApproximation',
  'releaseSingularityTolerance',
  'semanticHash',
]);

/**
 * Section 5.2: shear correction factors are traceable section/profile data.
 * Only the Timoshenko key set carries them; an Euler-Bernoulli profile that
 * declares one is rejected as an unexpected field rather than silently
 * ignored, so an unused factor can never look load-bearing.
 */
export const FRAME_ELEMENT_PROFILE_KEYS = Object.freeze({
  [EULER_BERNOULLI_FORMULATION]: BASE_PROFILE_KEYS,
  [TIMOSHENKO_FORMULATION]: Object.freeze([
    ...BASE_PROFILE_KEYS,
    'shearCorrectionFactorY',
    'shearCorrectionFactorZ',
  ]),
});

export const FRAME_ELEMENT_RECORD_KEYS = Object.freeze([
  'schema',
  'elementId',
  'formulationId',
  'shearDeformation',
  'releaseRule',
  'profileSemanticHash',
  'shearCorrection',
  'material',
  'section',
  'geometry',
  'localAxes',
  'transformation',
  'localStiffness',
  'globalStiffness',
  'equivalentLoadVector',
  'initialStrainLoadVector',
  'appliedLoads',
  'thermal',
  'endConditions',
  'rigidOffsets',
  'limitations',
  'semanticHash',
]);

export const FRAME_ELEMENT_INPUT_KEYS = Object.freeze([
  'elementId',
  'material',
  'section',
  'localAxes',
  'profile',
  'distributedLoads',
  'temperature',
  'releases',
  'endSprings',
  'rigidOffsets',
]);

export const FRAME_ELEMENT_SUPPORTED_LOAD_KINDS = Object.freeze(['DISTRIBUTED_LOAD']);

export const FRAME_ELEMENT_LIMITATION_KEYS = Object.freeze([
  'code',
  'severity',
  'scope',
  'stiffnessRelevant',
  'details',
]);

export const STRAIGHT_BEAM_LIMITATION_CODE =
  'FRAME_ELEMENT_LIMITATION_STRAIGHT_BEAM_APPROXIMATION';
export const NO_SHEAR_DEFORMATION_LIMITATION_CODE =
  'FRAME_ELEMENT_LIMITATION_NO_SHEAR_DEFORMATION';
export const UNIFORM_TEMPERATURE_LIMITATION_CODE =
  'FRAME_ELEMENT_LIMITATION_UNIFORM_TEMPERATURE_APPROXIMATION';
export const RIGID_OFFSET_LIMITATION_CODE =
  'FRAME_ELEMENT_LIMITATION_RIGID_OFFSET';

export const FRAME_ELEMENT_HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

export class FrameElementError extends SharedAnalysisContractError {
  constructor(message, code) {
    super(message, code);
    this.name = 'FrameElementError';
  }
}

export function fail(message, code) {
  throw new FrameElementError(message, code);
}

export function requireRecord(value, field, code) {
  if (!isPlainRecord(value)) fail(`${field} must be a record.`, code);
  return value;
}

export function requireArray(value, field, code) {
  if (!Array.isArray(value)) fail(`${field} must be an array.`, code);
  return value;
}

export function requireExactKeys(value, expected, field, code) {
  requireRecord(value, field, code);
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) fail(`${field} is missing ${key}.`, code);
  }
  for (const key of Object.keys(value)) {
    if (!expected.includes(key)) fail(`${field} contains unexpected field ${key}.`, code);
  }
  return value;
}

export function requireFinite(value, field, code) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${field} must be a finite number.`, code);
  }
  return Object.is(value, -0) ? 0 : value;
}

export function requirePositive(value, field, code) {
  const number = requireFinite(value, field, code);
  if (!(number > 0)) fail(`${field} must be greater than zero.`, code);
  return number;
}

export function requireMember(value, supported, field, code) {
  if (!supported.includes(value)) fail(`${field} is unsupported.`, code);
  return value;
}

export function requireIdentity(value, field, code) {
  try {
    return requireCanonicalNodeId(value);
  } catch {
    return fail(`${field} must be a canonical kernel identity.`, code);
  }
}

export function requireHash(value, field, code) {
  if (typeof value !== 'string' || !FRAME_ELEMENT_HASH_PATTERN.test(value)) {
    fail(`${field} must be a canonical semantic hash.`, code);
  }
  return value;
}

export { compareAscii };

function requireTraceableSource(entry) {
  const token = entry.source.trim().toUpperCase();
  if (PROHIBITED_PROFILE_SOURCE_TOKENS.includes(token)) {
    fail(
      `profile.${entry.field}.source names a hidden default rather than a traceable authority.`,
      'FRAME_ELEMENT_PROFILE_SOURCE_NOT_TRACEABLE',
    );
  }
  return entry;
}

/**
 * Resolve the numeric policies this package applies. Every one arrives as a
 * declared `{value, source}` entry: the static-condensation pivot boundary and,
 * for a Timoshenko profile, the two shear correction factors of section 5.2.
 * An absent entry is rejected through `requireDeclaredValue`
 * (`..._NOT_DECLARED`), never substituted; a factor is a property of the
 * section shape and shear direction, so the hard cap of 1 is a property of the
 * method rather than of the project.
 *
 * @param {object} profile Frame-element formulation profile.
 * @returns {Readonly<object>} Resolved policies.
 */
export function resolveFrameElementPolicies(profile) {
  const releaseSingularityTolerance = requireTraceableSource(
    requireDeclaredValue(profile, 'releaseSingularityTolerance', { exclusiveMinimum: 0, maximum: 1 }),
  );
  if (profile.straightPipeFormulation !== TIMOSHENKO_FORMULATION) {
    return Object.freeze({ releaseSingularityTolerance, shearCorrection: null });
  }
  const shearCorrection = {
    y: requireTraceableSource(
      requireDeclaredValue(profile, 'shearCorrectionFactorY', { exclusiveMinimum: 0, maximum: 1 }),
    ),
    z: requireTraceableSource(
      requireDeclaredValue(profile, 'shearCorrectionFactorZ', { exclusiveMinimum: 0, maximum: 1 }),
    ),
  };
  return Object.freeze({ releaseSingularityTolerance, shearCorrection });
}

export function frameElementProfileSemanticProjection(profile) {
  const projection = {};
  for (const key of FRAME_ELEMENT_PROFILE_KEYS[profile.straightPipeFormulation]) {
    if (key === 'semanticHash') continue;
    projection[key] = profile[key];
  }
  return projection;
}

export function computeFrameElementProfileSemanticHash(profile) {
  return semanticHash(frameElementProfileSemanticProjection(profile));
}

function validateProfileCore(profile) {
  requireRecord(profile, 'profile', 'FRAME_ELEMENT_PROFILE_INVALID');
  requireMember(
    profile.straightPipeFormulation,
    FRAME_FORMULATIONS,
    'profile.straightPipeFormulation',
    'FRAME_ELEMENT_PROFILE_INVALID',
  );
  requireExactKeys(
    profile,
    FRAME_ELEMENT_PROFILE_KEYS[profile.straightPipeFormulation],
    'profile',
    'FRAME_ELEMENT_PROFILE_INVALID',
  );
  const frozen = [
    ['schema', FRAME_ELEMENT_PROFILE_SCHEMA],
    ['profileId', FRAME_ELEMENT_PROFILE_ID],
    ['releaseRule', STATIC_CONDENSATION_RULE],
  ];
  for (const [key, expected] of frozen) {
    if (profile[key] !== expected) {
      fail(`profile.${key} must equal ${expected}.`, 'FRAME_ELEMENT_PROFILE_INVALID');
    }
  }
  if (typeof profile.shearDeformation !== 'boolean') {
    fail('profile.shearDeformation must be declared true or false.', 'FRAME_ELEMENT_PROFILE_INVALID');
  }
  /*
   * Section 5.2: EULER_BERNOULLI or TIMOSHENKO is declared, never inferred.
   * A profile whose flag and formulation disagree is a contradiction, and a
   * contradiction is blocked rather than resolved in either direction.
   */
  if (profile.shearDeformation !== (profile.straightPipeFormulation === TIMOSHENKO_FORMULATION)) {
    fail(
      'profile.shearDeformation contradicts profile.straightPipeFormulation; the shear declaration is the formulation identity and is never reconciled silently.',
      'FRAME_ELEMENT_SHEAR_DECLARATION_MISMATCH',
    );
  }
  if (profile.thermalStrainApproximation === DEFERRED_ALPHA_INTEGRATION_THERMAL_STRAIN_PROFILE) {
    fail(
      'profile.thermalStrainApproximation selects temperature-dependent alpha integration, which belongs to the thermal-load compiler and is not implemented; it is blocked rather than downgraded to the uniform rule.',
      'FRAME_ELEMENT_THERMAL_ALPHA_INTEGRATION_NOT_IMPLEMENTED',
    );
  }
  if (profile.thermalStrainApproximation !== UNIFORM_TEMPERATURE_THERMAL_STRAIN_PROFILE) {
    fail('profile.thermalStrainApproximation is unsupported.', 'FRAME_ELEMENT_PROFILE_INVALID');
  }
  return resolveFrameElementPolicies(profile);
}

export function requireFrameElementProfile(profile) {
  const policies = validateProfileCore(profile);
  requireHash(profile.semanticHash, 'profile.semanticHash', 'FRAME_ELEMENT_PROFILE_INVALID');
  if (profile.semanticHash !== computeFrameElementProfileSemanticHash(profile)) {
    fail('profile.semanticHash is stale.', 'FRAME_ELEMENT_HASH_MISMATCH');
  }
  void policies;
  return deepFreeze({
    ...frameElementProfileSemanticProjection(profile),
    semanticHash: profile.semanticHash,
  });
}

export function sealFrameElementProfile(profile) {
  validateProfileCore(profile);
  return requireFrameElementProfile({
    ...frameElementProfileSemanticProjection(profile),
    semanticHash: computeFrameElementProfileSemanticHash(profile),
  });
}
