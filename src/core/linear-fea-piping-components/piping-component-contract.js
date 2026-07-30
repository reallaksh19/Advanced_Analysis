import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { requireCanonicalNodeId } from '../linear-fea-contract/identifiers.js';
import {
  PROHIBITED_PROFILE_SOURCE_TOKENS,
  compareAscii,
} from '../linear-fea-load-case/load-case-contract.js';

/**
 * LFEA-B3.2 piping-component contracts.
 *
 * This module holds the schema identities, the component-profile authority,
 * the frozen component-rule identities, the caller-declared factor-set
 * contract and the rejection codes for the piping-component layer
 * (sections 3.4, 3.5, 4.3, 10.4 Ownership and 11).
 *
 * It declares nothing about assembly (B-3.3) and nothing about code stress
 * (B-4.0). It also computes no B31J factor: a flexibility factor arrives as a
 * declared factor set with its own source identity and applicability verdict,
 * and this package applies it to stiffness and says so. Section 10.4 gives
 * exactly one package the right to apply flexibility; this is that package,
 * which is why the ownership claim below is machine-readable rather than
 * a sentence in a report.
 */

export const PIPING_COMPONENT_PROFILE_SCHEMA = 'fea-linear-piping-component-profile/v1';
export const PIPING_COMPONENT_SCHEMA = 'fea-linear-piping-component/v1';
export const COMPONENT_FACTOR_SET_SCHEMA = 'fea-linear-component-factor-set/v1';
export const FLEXIBILITY_OWNERSHIP_SCHEMA = 'fea-linear-flexibility-ownership-claim/v1';
export const BEND_CONVERGENCE_SCHEMA = 'fea-linear-bend-convergence-report/v1';

export const PIPING_COMPONENT_PROFILE_ID = 'LINEAR-PIPING-COMPONENT-R1';

/** Section 10.4 Ownership: the one package permitted to apply flexibility. */
export const FLEXIBILITY_OWNER_PACKAGE_ID = 'LFEA-B3.2';

/** Section 13 formulationProfile.bend. */
export const BEND_FORMULATION = 'PIPE_BEND_CORRECTED_FRAME_V1';

export const COMPONENT_TYPES = Object.freeze([
  'BEND',
  'BRANCH_JUNCTION',
  'REDUCER',
  'RIGID_LINK',
  'SUPPORT_OFFSET',
  'VALVE_FLANGE',
]);

/** Section 3.5: the subdivision purpose fixes which angle limit the project declares. */
export const BEND_SUBDIVISION_PURPOSES = Object.freeze([
  'STRESS_RECOVERY_V1',
  'VISUALIZATION_V1',
]);

export const BEND_PRESSURE_STIFFENING_RULES = Object.freeze([
  'BEND_PRESSURE_STIFFENING_EXCLUDED_V1',
  'BEND_PRESSURE_STIFFENING_DECLARED_FACTOR_V1',
]);

export const REDUCER_RULES = Object.freeze([
  'REDUCER_STEPPED_SECTION_V1',
  'REDUCER_TAPERED_SECTION_V1',
]);

export const VALVE_BODY_RULES = Object.freeze([
  'VALVE_RIGID_BODY_V1',
  'VALVE_SEMI_RIGID_BODY_V1',
]);

/** Section 3.4: no zero-length weight lump unless explicitly selected. */
export const WEIGHT_LUMP_RULES = Object.freeze([
  'FINITE_LENGTH_BODY_REQUIRED_V1',
  'ZERO_LENGTH_WEIGHT_LUMP_EXPLICITLY_SELECTED_V1',
]);

export const BRANCH_FLEXIBILITY_METHODS = Object.freeze([
  'BRANCH_JUNCTION_ROTATIONAL_FLEXIBILITY_V1',
  'BRANCH_FLEXIBILITY_NOT_APPLIED_V1',
]);

/** Section 13 topologyProfile.branchClassificationRule. */
export const BRANCH_CLASSIFICATION_RULE = 'DIRECTION_VECTOR_TOPOLOGY_V1';

export const SUPPORT_OFFSET_RULES = Object.freeze([
  'RIGID_OFFSET_KINEMATIC_V1',
  'EXPLICIT_BEAM_LINK_V1',
]);

export const RIGID_LINK_RULE = 'RIGID_BODY_KINEMATIC_RELATION_V1';

/** Section 13 b31Profile.outsideApplicabilityRule — only BLOCK is implemented. */
export const OUTSIDE_APPLICABILITY_RULE = 'BLOCK';

/**
 * Section 3.5 double-count proof. The guard measures the compliance the arc
 * segmentation already carries and the compliance the correction factor adds,
 * under one named method, so "flexibility is applied once" is a number rather
 * than an assertion.
 */
export const FLEXIBILITY_GUARD_ID = 'BEND_FLEXIBILITY_SINGLE_APPLICATION_V1';
export const BRANCH_FLEXIBILITY_GUARD_ID = 'BRANCH_FLEXIBILITY_SINGLE_APPLICATION_V1';
export const FLEXIBILITY_GUARD_METHOD = 'UNIT_MOMENT_BENDING_COMPLIANCE_V1';
export const BEND_COMPLIANCE_METHOD = 'CHAIN_UNIT_LOAD_BENDING_COMPLIANCE_V1';

/**
 * Whether the supplied factor is defined relative to the true curved geometry
 * (the B31J sense: the factor carries ovalization and shell flexibility only)
 * or relative to a straight tangent-to-tangent member (the factor already
 * carries the arc geometry). The second basis applied to a segmented arc is
 * the double count section 3.5 forbids.
 */
export const FLEXIBILITY_GEOMETRY_BASES = Object.freeze([
  'ARC_GEOMETRY_EXCLUDED_V1',
  'ARC_GEOMETRY_INCLUDED_V1',
  'JUNCTION_GEOMETRY_EXCLUDED_V1',
  'JUNCTION_GEOMETRY_INCLUDED_V1',
]);

export const FACTOR_APPLICABILITY_STATUSES = Object.freeze([
  'WITHIN_RANGE',
  'OUTSIDE_RANGE',
  'USER_FACTOR_REQUIRED',
]);

/** Section 11.1 approximation statuses. */
export const APPROXIMATION_STATUSES = Object.freeze([
  'ACCEPTED',
  'CONDITIONAL',
  'OUTSIDE_SCOPE',
  'UNRESOLVED',
]);

export const APPROXIMATION_KEYS = Object.freeze([
  'code',
  'register',
  'status',
  'stiffnessRelevant',
  'disclosure',
  'details',
]);

/* Section 11 register rows this package can be responsible for. */
export const SEGMENTED_BEND_APPROXIMATION = 'PIPING_COMPONENT_APPROXIMATION_SEGMENTED_BEND';
export const RIGID_VALVE_APPROXIMATION = 'PIPING_COMPONENT_APPROXIMATION_RIGID_VALVE_FLANGE';
export const REDUCER_APPROXIMATION = 'PIPING_COMPONENT_APPROXIMATION_REDUCER_SECTION';
export const RIGID_LINK_APPROXIMATION = 'PIPING_COMPONENT_APPROXIMATION_RIGID_LINK';
export const SUPPORT_OFFSET_APPROXIMATION = 'PIPING_COMPONENT_APPROXIMATION_SUPPORT_OFFSET_RIGID';
export const BRANCH_FLEXIBILITY_APPROXIMATION = 'PIPING_COMPONENT_APPROXIMATION_BRANCH_FLEXIBILITY_METHOD';
export const USER_FACTOR_APPROXIMATION = 'PIPING_COMPONENT_APPROXIMATION_USER_FLEXIBILITY_OVERRIDE';

export const PIPING_COMPONENT_PROFILE_KEYS = Object.freeze([
  'schema',
  'profileId',
  'bendFormulation',
  'bendSubdivisionPurpose',
  'bendPressureStiffeningRule',
  'convergenceRequired',
  'reducerRule',
  'valveBodyRule',
  'weightLumpRule',
  'branchFlexibilityMethod',
  'branchClassificationRule',
  'supportOffsetRule',
  'outsideApplicabilityRule',
  'bendMaxAngleDegrees',
  'bendMinimumElements',
  'bendMinimumElementsBetweenStations',
  'bendRadiusRelativeTolerance',
  'bendConvergenceRefinementFactor',
  'convergenceRelativeTolerance',
  'flexibilityDoubleCountTolerance',
  'runCollinearityTolerance',
  'rigidBodyStiffnessMultiplier',
  'semanticHash',
]);

export const COMPONENT_FACTOR_SET_KEYS = Object.freeze([
  'schema',
  'factorSetId',
  'componentType',
  'sourceIdentity',
  'applicability',
  'flexibilityFactor',
  'flexibilityGeometryBasis',
  'directionalFlexibilityFactors',
  'pressureCorrectionApplied',
  'pressureBasis',
  'userOverride',
  'semanticHash',
]);

export const FACTOR_SOURCE_IDENTITY_KEYS = Object.freeze([
  'standard',
  'edition',
  'ruleId',
  'sourceRevision',
  'sourceSemanticHash',
]);

export const FACTOR_APPLICABILITY_KEYS = Object.freeze([
  'status',
  'ruleId',
  'evaluatedBy',
]);

export const FACTOR_OVERRIDE_KEYS = Object.freeze([
  'reason',
  'source',
  'sourceRevision',
  'approver',
]);

export const FLEXIBILITY_OWNERSHIP_KEYS = Object.freeze([
  'schema',
  'ownerPackageId',
  'componentId',
  'componentType',
  'flexibilityTargets',
  'applied',
  'factorSetId',
  'factorSourceIdentity',
  'doubleCountGuardId',
]);

export const PIPING_COMPONENT_RECORD_KEYS = Object.freeze([
  'schema',
  'componentId',
  'componentType',
  'formulationId',
  'profileSemanticHash',
  'geometry',
  'subdivision',
  'elements',
  'kinematicRelations',
  'codeStations',
  'massProperties',
  'sectionMapping',
  'endConnections',
  'classification',
  'flexibility',
  'flexibilityOwnership',
  'convergence',
  'approximations',
  'acceptanceState',
  'semanticHash',
]);

export const PIPING_COMPONENT_ELEMENT_KEYS = Object.freeze([
  'index',
  'elementId',
  'role',
  'frameElement',
  'stiffnessCorrection',
  'effectiveLocalStiffness',
  'effectiveGlobalStiffness',
]);

export const CODE_STATION_KEYS = Object.freeze([
  'stationId',
  'kind',
  'nodeId',
  'position',
  'arcFraction',
]);

export const KINEMATIC_RELATION_KEYS = Object.freeze([
  'relationId',
  'method',
  'masterNodeId',
  'slaveNodeId',
  'offset',
  'coupledDofs',
  'codeStressEligible',
]);

export const PIPING_COMPONENT_HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

/** Degrees are a source-declaration convenience; radians are the kernel unit. */
export const DEGREES_TO_RADIANS = Math.PI / 180;

export class PipingComponentError extends SharedAnalysisContractError {
  constructor(message, code) {
    super(message, code);
    this.name = 'PipingComponentError';
  }
}

export function fail(message, code) {
  throw new PipingComponentError(message, code);
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

export function requireText(value, field, code) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${field} must be a non-empty string.`, code);
  }
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
  if (typeof value !== 'string' || !PIPING_COMPONENT_HASH_PATTERN.test(value)) {
    fail(`${field} must be a canonical semantic hash.`, code);
  }
  return value;
}

export function requireVector3(value, field, code) {
  requireArray(value, field, code);
  if (value.length !== 3) fail(`${field} must carry exactly three components.`, code);
  return value.map((entry, position) => requireFinite(entry, `${field}[${position}]`, code));
}

export { compareAscii };

function requireTraceableSource(entry, ownerField, code) {
  const token = entry.source.trim().toUpperCase();
  if (PROHIBITED_PROFILE_SOURCE_TOKENS.includes(token)) {
    fail(
      `${ownerField}.${entry.field}.source names a hidden default rather than a traceable authority.`,
      code,
    );
  }
  return entry;
}

function requireDeclaredInteger(entry, field) {
  if (!Number.isInteger(entry.value)) {
    fail(`profile.${field}.value must be an integer count.`, 'PIPING_COMPONENT_PROFILE_INVALID');
  }
  return entry;
}

/**
 * Resolve the numeric policies this package applies. Every one arrives as a
 * declared `{value, source}` entry — the section 3.5 maximum central angle, the
 * minimum element count, the tangent-to-mid-arc station separation, the arc
 * radius cross-check tolerance, the convergence refinement factor and
 * tolerance, the double-count tolerance, the run-collinearity tolerance and
 * the rigid-body stiffness multiplier. Nothing is defaulted: an absent entry is
 * `..._NOT_DECLARED` from `requireDeclaredValue`, never a substitution, and the
 * 7.5-degree visualization limit and 5-degree stress-recovery limit of section
 * 3.5 are project declarations rather than constants in this file.
 *
 * The hard caps below are properties of the geometry and of the method, not of
 * a project: a chord may not subtend a half turn, a bend chorded by fewer than
 * two elements is a straight line, a refinement that does not refine proves
 * nothing, and a rigid body is not softer than the pipe it replaces.
 *
 * @param {object} profile Piping-component profile.
 * @returns {Readonly<object>} Resolved declared policies.
 */
export function resolvePipingComponentPolicies(profile) {
  const declared = (field, bounds) => requireTraceableSource(
    requireDeclaredValue(profile, field, bounds),
    'profile',
    'PIPING_COMPONENT_PROFILE_SOURCE_NOT_TRACEABLE',
  );
  return Object.freeze({
    bendMaxAngleDegrees: declared('bendMaxAngleDegrees', { exclusiveMinimum: 0, maximum: 180 }),
    bendMinimumElements: requireDeclaredInteger(
      declared('bendMinimumElements', { minimum: 2 }),
      'bendMinimumElements',
    ),
    bendMinimumElementsBetweenStations: requireDeclaredInteger(
      declared('bendMinimumElementsBetweenStations', { minimum: 1 }),
      'bendMinimumElementsBetweenStations',
    ),
    bendRadiusRelativeTolerance: declared('bendRadiusRelativeTolerance', { exclusiveMinimum: 0, maximum: 1 }),
    bendConvergenceRefinementFactor: requireDeclaredInteger(
      declared('bendConvergenceRefinementFactor', { minimum: 2 }),
      'bendConvergenceRefinementFactor',
    ),
    convergenceRelativeTolerance: declared('convergenceRelativeTolerance', { exclusiveMinimum: 0, maximum: 1 }),
    flexibilityDoubleCountTolerance: declared('flexibilityDoubleCountTolerance', { exclusiveMinimum: 0, maximum: 1 }),
    runCollinearityTolerance: declared('runCollinearityTolerance', { exclusiveMinimum: 0, maximum: 1 }),
    rigidBodyStiffnessMultiplier: declared('rigidBodyStiffnessMultiplier', { minimum: 1 }),
  });
}

export function pipingComponentProfileSemanticProjection(profile) {
  const projection = {};
  for (const key of PIPING_COMPONENT_PROFILE_KEYS) {
    if (key === 'semanticHash') continue;
    projection[key] = profile[key];
  }
  return projection;
}

export function computePipingComponentProfileSemanticHash(profile) {
  return semanticHash(pipingComponentProfileSemanticProjection(profile));
}

function validateProfileCore(profile) {
  requireExactKeys(profile, PIPING_COMPONENT_PROFILE_KEYS, 'profile', 'PIPING_COMPONENT_PROFILE_INVALID');
  const frozen = [
    ['schema', PIPING_COMPONENT_PROFILE_SCHEMA],
    ['profileId', PIPING_COMPONENT_PROFILE_ID],
    ['bendFormulation', BEND_FORMULATION],
    ['branchClassificationRule', BRANCH_CLASSIFICATION_RULE],
  ];
  for (const [key, expected] of frozen) {
    if (profile[key] !== expected) {
      fail(`profile.${key} must equal ${expected}.`, 'PIPING_COMPONENT_PROFILE_INVALID');
    }
  }
  requireMember(profile.bendSubdivisionPurpose, BEND_SUBDIVISION_PURPOSES, 'profile.bendSubdivisionPurpose', 'PIPING_COMPONENT_PROFILE_INVALID');
  requireMember(profile.bendPressureStiffeningRule, BEND_PRESSURE_STIFFENING_RULES, 'profile.bendPressureStiffeningRule', 'PIPING_COMPONENT_PROFILE_INVALID');
  requireMember(profile.reducerRule, REDUCER_RULES, 'profile.reducerRule', 'PIPING_COMPONENT_PROFILE_INVALID');
  requireMember(profile.valveBodyRule, VALVE_BODY_RULES, 'profile.valveBodyRule', 'PIPING_COMPONENT_PROFILE_INVALID');
  requireMember(profile.weightLumpRule, WEIGHT_LUMP_RULES, 'profile.weightLumpRule', 'PIPING_COMPONENT_PROFILE_INVALID');
  requireMember(profile.branchFlexibilityMethod, BRANCH_FLEXIBILITY_METHODS, 'profile.branchFlexibilityMethod', 'PIPING_COMPONENT_PROFILE_INVALID');
  requireMember(profile.supportOffsetRule, SUPPORT_OFFSET_RULES, 'profile.supportOffsetRule', 'PIPING_COMPONENT_PROFILE_INVALID');
  if (typeof profile.convergenceRequired !== 'boolean') {
    fail('profile.convergenceRequired must be declared true or false.', 'PIPING_COMPONENT_PROFILE_INVALID');
  }
  /*
   * Section 10.3/13: outside-applicability geometry is blocked. A profile that
   * asks for anything else is asking for a silent clamp, which section 15.5
   * names as a deliberate regression, so it is refused by identity rather than
   * quietly reinterpreted as BLOCK.
   */
  if (profile.outsideApplicabilityRule !== OUTSIDE_APPLICABILITY_RULE) {
    fail(
      'profile.outsideApplicabilityRule selects a rule other than BLOCK; clamping or extrapolating unsupported component geometry is not implemented and is not substituted.',
      'PIPING_COMPONENT_OUTSIDE_APPLICABILITY_RULE_NOT_IMPLEMENTED',
    );
  }
  return resolvePipingComponentPolicies(profile);
}

export function requirePipingComponentProfile(profile) {
  validateProfileCore(profile);
  requireHash(profile.semanticHash, 'profile.semanticHash', 'PIPING_COMPONENT_PROFILE_INVALID');
  if (profile.semanticHash !== computePipingComponentProfileSemanticHash(profile)) {
    fail('profile.semanticHash is stale.', 'PIPING_COMPONENT_HASH_MISMATCH');
  }
  return deepFreeze({
    ...pipingComponentProfileSemanticProjection(profile),
    semanticHash: profile.semanticHash,
  });
}

export function sealPipingComponentProfile(profile) {
  validateProfileCore(profile);
  return requirePipingComponentProfile({
    ...pipingComponentProfileSemanticProjection(profile),
    semanticHash: computePipingComponentProfileSemanticHash(profile),
  });
}

export function componentFactorSetSemanticProjection(factorSet) {
  const projection = {};
  for (const key of COMPONENT_FACTOR_SET_KEYS) {
    if (key === 'semanticHash') continue;
    projection[key] = factorSet[key];
  }
  return projection;
}

export function computeComponentFactorSetSemanticHash(factorSet) {
  return semanticHash(componentFactorSetSemanticProjection(factorSet));
}

const FACTOR_CODE = 'PIPING_COMPONENT_FACTOR_SET_INVALID';

function validateFactorSetCore(factorSet) {
  requireExactKeys(factorSet, COMPONENT_FACTOR_SET_KEYS, 'factorSet', FACTOR_CODE);
  if (factorSet.schema !== COMPONENT_FACTOR_SET_SCHEMA) {
    fail(`factorSet.schema must be ${COMPONENT_FACTOR_SET_SCHEMA}.`, FACTOR_CODE);
  }
  requireIdentity(factorSet.factorSetId, 'factorSet.factorSetId', FACTOR_CODE);
  requireMember(factorSet.componentType, ['BEND', 'BRANCH_JUNCTION'], 'factorSet.componentType', FACTOR_CODE);
  requireExactKeys(factorSet.sourceIdentity, FACTOR_SOURCE_IDENTITY_KEYS, 'factorSet.sourceIdentity', FACTOR_CODE);
  for (const key of ['standard', 'edition', 'ruleId', 'sourceRevision']) {
    requireText(factorSet.sourceIdentity[key], `factorSet.sourceIdentity.${key}`, FACTOR_CODE);
  }
  requireHash(factorSet.sourceIdentity.sourceSemanticHash, 'factorSet.sourceIdentity.sourceSemanticHash', FACTOR_CODE);
  /*
   * Section 10.4: the factor source is an identity, not a mood. A factor set
   * whose standard reads DEFAULT or ASSUMED cannot be traced back to an
   * edition, so it cannot support a flexibility claim.
   */
  if (PROHIBITED_PROFILE_SOURCE_TOKENS.includes(factorSet.sourceIdentity.standard.trim().toUpperCase())) {
    fail(
      'factorSet.sourceIdentity.standard names a hidden default rather than a traceable factor authority.',
      'PIPING_COMPONENT_FACTOR_SOURCE_NOT_TRACEABLE',
    );
  }
  requireExactKeys(factorSet.applicability, FACTOR_APPLICABILITY_KEYS, 'factorSet.applicability', FACTOR_CODE);
  requireMember(factorSet.applicability.status, FACTOR_APPLICABILITY_STATUSES, 'factorSet.applicability.status', FACTOR_CODE);
  requireText(factorSet.applicability.ruleId, 'factorSet.applicability.ruleId', FACTOR_CODE);
  requireText(factorSet.applicability.evaluatedBy, 'factorSet.applicability.evaluatedBy', FACTOR_CODE);
  requireTraceableSource(
    requireDeclaredValue(factorSet, 'flexibilityFactor', { exclusiveMinimum: 0 }),
    'factorSet',
    'PIPING_COMPONENT_FACTOR_SOURCE_NOT_TRACEABLE',
  );
  requireMember(factorSet.flexibilityGeometryBasis, FLEXIBILITY_GEOMETRY_BASES, 'factorSet.flexibilityGeometryBasis', FACTOR_CODE);
  const expectedBasisPrefix = factorSet.componentType === 'BEND' ? 'ARC_GEOMETRY_' : 'JUNCTION_GEOMETRY_';
  if (!factorSet.flexibilityGeometryBasis.startsWith(expectedBasisPrefix)) {
    fail(
      `factorSet.flexibilityGeometryBasis does not describe a ${factorSet.componentType} geometry.`,
      FACTOR_CODE,
    );
  }
  if (typeof factorSet.pressureCorrectionApplied !== 'boolean') {
    fail('factorSet.pressureCorrectionApplied must be declared true or false.', FACTOR_CODE);
  }
  if (factorSet.pressureCorrectionApplied) {
    requireText(factorSet.pressureBasis, 'factorSet.pressureBasis', FACTOR_CODE);
  } else if (factorSet.pressureBasis !== null) {
    fail('factorSet.pressureBasis must be null when no pressure correction is declared.', FACTOR_CODE);
  }
  if (factorSet.directionalFlexibilityFactors !== null) {
    requireExactKeys(
      factorSet.directionalFlexibilityFactors,
      ['inPlane', 'outOfPlane'],
      'factorSet.directionalFlexibilityFactors',
      FACTOR_CODE,
    );
    /*
     * Section 10.3 forbids collapsing distinguished directions into one scalar.
     * This package applies a single bending-flexibility correction, so a factor
     * set that distinguishes in-plane from out-of-plane flexibility is beyond
     * what the implemented formulation can honour. It is blocked, never
     * averaged into the scalar the formulation happens to accept.
     */
    fail(
      'factorSet.directionalFlexibilityFactors distinguishes in-plane and out-of-plane flexibility, which PIPE_BEND_CORRECTED_FRAME_V1 does not represent; it is blocked rather than averaged into one scalar.',
      'PIPING_COMPONENT_DIRECTIONAL_FLEXIBILITY_NOT_IMPLEMENTED',
    );
  }
  if (factorSet.userOverride !== null) {
    requireExactKeys(factorSet.userOverride, FACTOR_OVERRIDE_KEYS, 'factorSet.userOverride', FACTOR_CODE);
    for (const key of FACTOR_OVERRIDE_KEYS) {
      requireText(factorSet.userOverride[key], `factorSet.userOverride.${key}`, 'PIPING_COMPONENT_USER_OVERRIDE_INCOMPLETE');
    }
  }
  return factorSet;
}

export function requireComponentFactorSet(factorSet) {
  validateFactorSetCore(factorSet);
  requireHash(factorSet.semanticHash, 'factorSet.semanticHash', FACTOR_CODE);
  if (factorSet.semanticHash !== computeComponentFactorSetSemanticHash(factorSet)) {
    fail('factorSet.semanticHash is stale.', 'PIPING_COMPONENT_HASH_MISMATCH');
  }
  return deepFreeze({
    ...componentFactorSetSemanticProjection(factorSet),
    semanticHash: factorSet.semanticHash,
  });
}

export function sealComponentFactorSet(factorSet) {
  validateFactorSetCore(factorSet);
  return requireComponentFactorSet({
    ...componentFactorSetSemanticProjection(factorSet),
    semanticHash: computeComponentFactorSetSemanticHash(factorSet),
  });
}

/**
 * Section 10.4 Applicability: outside-range geometry yields BLOCKED or
 * USER_FACTOR_REQUIRED. Both arrive here as a refusal with a machine code; no
 * branch of this function clamps a factor to the nearest supported geometry,
 * because a clamped factor is indistinguishable from a qualified one once it
 * reaches a stiffness matrix.
 *
 * @param {Readonly<object>} factorSet Accepted factor set.
 * @returns {Readonly<object>} Applicability evidence for the component record.
 */
export function requireFactorApplicability(factorSet) {
  if (factorSet.applicability.status === 'OUTSIDE_RANGE') {
    fail(
      `factorSet ${factorSet.factorSetId} reports geometry outside the applicability range of ${factorSet.sourceIdentity.standard} rule ${factorSet.applicability.ruleId}; the component is blocked rather than clamped to the nearest supported geometry.`,
      'PIPING_COMPONENT_B31J_APPLICABILITY_EXCEEDED',
    );
  }
  if (factorSet.applicability.status === 'USER_FACTOR_REQUIRED' && factorSet.userOverride === null) {
    fail(
      `factorSet ${factorSet.factorSetId} requires a user factor under ${factorSet.sourceIdentity.standard} rule ${factorSet.applicability.ruleId}; supply an override carrying reason, source, revision and approver.`,
      'PIPING_COMPONENT_USER_FACTOR_REQUIRED',
    );
  }
  return Object.freeze({
    status: factorSet.applicability.status,
    ruleId: factorSet.applicability.ruleId,
    evaluatedBy: factorSet.applicability.evaluatedBy,
    outsideApplicabilityRule: OUTSIDE_APPLICABILITY_RULE,
  });
}

export function approximation(code, register, status, stiffnessRelevant, disclosure, details = {}) {
  requireMember(status, APPROXIMATION_STATUSES, `${code}.status`, 'PIPING_COMPONENT_APPROXIMATION_INVALID');
  return {
    code,
    register,
    status,
    stiffnessRelevant,
    disclosure,
    details,
  };
}

/**
 * Fold the section 11.1 statuses of a component's disclosures into one state.
 * UNRESOLVED and OUTSIDE_SCOPE block; CONDITIONAL asks for verification.
 */
export function acceptanceStateFrom(approximations) {
  if (approximations.some((entry) => entry.status === 'UNRESOLVED' || entry.status === 'OUTSIDE_SCOPE')) {
    return 'BLOCKED';
  }
  if (approximations.some((entry) => entry.status === 'CONDITIONAL')) return 'CONDITIONAL';
  return 'ACCEPTED';
}
