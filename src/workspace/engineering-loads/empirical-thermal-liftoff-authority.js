import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';

export const THERMAL_LIFTOFF_METHOD_ID = 'THERMAL_LIFTOFF_ACTIVE_SET_V1';
export const THERMAL_LIFTOFF_AUTHORITY_SCHEMA = 'empirical-thermal-liftoff-authority/v1';
export const THERMAL_LIFTOFF_SUPPORT_CONTACT_AUTHORITY_SCHEMA =
  'empirical-thermal-liftoff-support-contact-authority/v1';
export const THERMAL_LIFTOFF_REACTION_TOLERANCE_AUTHORITY_SCHEMA =
  'empirical-thermal-liftoff-reaction-tolerance-authority/v1';

export const THERMAL_LIFTOFF_CLASSIFICATIONS = deepFreeze([
  'CONTACT_RETAINED_CANDIDATE',
  'LIFTOFF_CANDIDATE',
  'UNRESOLVED_GATE',
]);

export const THERMAL_LIFTOFF_BLOCKER_CODES = deepFreeze({
  DISPLACEMENT_AUTHORITY_MISSING: 'THERMAL_LIFTOFF_DISPLACEMENT_AUTHORITY_MISSING',
  DISPLACEMENT_AUTHORITY_STALE: 'THERMAL_LIFTOFF_DISPLACEMENT_AUTHORITY_STALE',
  HORIZONTAL_COMPONENT_UNQUALIFIED: 'THERMAL_LIFTOFF_HORIZONTAL_COMPONENT_UNQUALIFIED',
  SUPPORT_CONTACT_AUTHORITY_MISSING: 'THERMAL_LIFTOFF_SUPPORT_CONTACT_AUTHORITY_MISSING',
  SUPPORT_CAPABILITY_UNSUPPORTED: 'THERMAL_LIFTOFF_SUPPORT_CAPABILITY_UNSUPPORTED',
  SUPPORT_DIRECTION_AMBIGUOUS: 'THERMAL_LIFTOFF_SUPPORT_DIRECTION_AMBIGUOUS',
  SUPPORT_GAP_INVALID: 'THERMAL_LIFTOFF_SUPPORT_GAP_INVALID',
  GAP_REFERENCE_MISMATCH: 'THERMAL_LIFTOFF_GAP_REFERENCE_MISMATCH',
  INITIAL_CONTACT_STATE_UNSUPPORTED: 'THERMAL_LIFTOFF_INITIAL_CONTACT_STATE_UNSUPPORTED',
  STIFFNESS_AUTHORITY_MISSING: 'THERMAL_LIFTOFF_STIFFNESS_AUTHORITY_MISSING',
  STIFFNESS_AUTHORITY_CONFLICT: 'THERMAL_LIFTOFF_STIFFNESS_AUTHORITY_CONFLICT',
  STIFFNESS_APPLICABILITY_MISMATCH: 'THERMAL_LIFTOFF_STIFFNESS_APPLICABILITY_MISMATCH',
  STIFFNESS_GUESSED: 'THERMAL_LIFTOFF_STIFFNESS_GUESSED',
  REACTION_TOLERANCE_AUTHORITY_MISSING: 'THERMAL_LIFTOFF_REACTION_TOLERANCE_AUTHORITY_MISSING',
  CLASSIFICATION_MISMATCH: 'THERMAL_LIFTOFF_SCREEN_CLASSIFICATION_MISMATCH',
  ARITHMETIC_MISMATCH: 'THERMAL_LIFTOFF_SCREEN_ARITHMETIC_MISMATCH',
});

export const THERMAL_LIFTOFF_AUTHORITY = createThermalLiftoffAuthority();

export function createThermalLiftoffAuthority() {
  const draft = {
    schema: THERMAL_LIFTOFF_AUTHORITY_SCHEMA,
    method: THERMAL_LIFTOFF_METHOD_ID,
    stage: 'TL00_TL03_LOCAL_SCREEN_ONLY',
    runtimeStatus: 'SHADOW_NOT_REGISTERED',
    units: {
      force: 'N',
      displacement: 'M',
      stiffness: 'N_PER_M',
      routeChainage: 'MM',
    },
    coordinateFrame: {
      sourceAxisBasis: 'GLOBAL_Z_UP',
      verticalUnitVector: [0, 0, 1],
      relativeDisplacementConvention: 'PIPE_MINUS_SUPPORT',
    },
    reactionConvention: 'POSITIVE_UPWARD_OPPOSING_GRAVITY',
    gapConvention: 'POSITIVE_OPEN_PIPE_TO_SUPPORT',
    capabilities: {
      localScreen: true,
      unilateralRest: true,
      bilateralFinalReaction: false,
      redistribution: false,
      recontact: false,
      activeSetSolve: false,
    },
    sourceFields: {
      coldGravity: ['schema', 'semanticHash', 'distribution.loadCases[].supportResults[].verticalForceN'],
      displacement: ['supportSiteId', 'loadCaseId', 'pipeDisplacementM', 'supportDisplacementM', 'source'],
      contact: ['supportSiteId', 'routeChainageMm', 'capability', 'coldGapM', 'gapConvention'],
      stiffness: ['supportSiteId', 'representation', 'data', 'units', 'ordering', 'benchmarkReference', 'applicability'],
    },
    restrictions: {
      registrationPermitted: false,
      defaultUiExposurePermitted: false,
      sealOrExportPermitted: false,
      finalHotReactionClaimPermitted: false,
      alphaDeltaTLToVerticalDisplacementInferencePermitted: false,
      existingGravityMutationPermitted: false,
    },
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

export function requireThermalLiftoffAuthority(value) {
  exactKeys(value, [
    'schema', 'method', 'stage', 'runtimeStatus', 'units', 'coordinateFrame',
    'reactionConvention', 'gapConvention', 'capabilities', 'sourceFields',
    'restrictions', 'semanticHash',
  ], 'thermal lift-off authority');
  if (value.schema !== THERMAL_LIFTOFF_AUTHORITY_SCHEMA
    || value.method !== THERMAL_LIFTOFF_METHOD_ID) {
    throw codedError('Unexpected thermal lift-off authority identity.', 'THERMAL_LIFTOFF_AUTHORITY_INVALID');
  }
  const { semanticHash: actual, ...payload } = value;
  if (actual !== semanticHash(payload)) {
    throw codedError('Thermal lift-off authority semantic hash mismatch.', 'THERMAL_LIFTOFF_AUTHORITY_HASH_MISMATCH');
  }
  return deepFreeze(structuredClone(value));
}

export function createThermalLiftoffSupportContactAuthority(input) {
  exactKeys(input, [
    'supportSiteId', 'routeChainageMm', 'capability', 'verticalContactDirection',
    'coldGapM', 'gapConvention', 'tensileReactionPermitted', 'initialState', 'source',
  ], 'thermal lift-off support contact authority input');
  const supportSiteId = requiredString(input.supportSiteId, 'supportSiteId');
  const blockers = [];
  const coldGapM = Number.isFinite(input.coldGapM) ? input.coldGapM : null;
  if (input.capability !== 'UNILATERAL_REST' || input.tensileReactionPermitted !== false) {
    blockers.push(blocker(
      THERMAL_LIFTOFF_BLOCKER_CODES.SUPPORT_CAPABILITY_UNSUPPORTED,
      supportSiteId,
      'TL-03 local screening currently admits unilateral rest contact only.',
    ));
  }
  if (input.verticalContactDirection !== 'GLOBAL_Z_PLUS') {
    blockers.push(blocker(
      THERMAL_LIFTOFF_BLOCKER_CODES.SUPPORT_DIRECTION_AMBIGUOUS,
      supportSiteId,
      'Support contact direction must be source-authoritative GLOBAL_Z_PLUS.',
    ));
  }
  if (input.gapConvention !== 'POSITIVE_OPEN_PIPE_TO_SUPPORT') {
    blockers.push(blocker(
      THERMAL_LIFTOFF_BLOCKER_CODES.GAP_REFERENCE_MISMATCH,
      supportSiteId,
      'Cold-gap datum does not match g >= 0 = open, pipe-to-support convention.',
    ));
  }
  if (coldGapM === null || coldGapM < 0) {
    blockers.push(blocker(
      THERMAL_LIFTOFF_BLOCKER_CODES.SUPPORT_GAP_INVALID,
      supportSiteId,
      'Cold gap must be a finite non-negative value in meters.',
    ));
  }
  if (input.initialState !== 'CONTACTING') {
    blockers.push(blocker(
      THERMAL_LIFTOFF_BLOCKER_CODES.INITIAL_CONTACT_STATE_UNSUPPORTED,
      supportSiteId,
      'TL-03 local screening requires a cold-contact support state.',
    ));
  }
  const source = requireSourceIdentity(input.source, 'support contact source');
  const draft = {
    schema: THERMAL_LIFTOFF_SUPPORT_CONTACT_AUTHORITY_SCHEMA,
    supportSiteId,
    routeChainageMm: finiteNumber(input.routeChainageMm, 'routeChainageMm'),
    capability: requiredString(input.capability, 'capability'),
    verticalContactDirection: requiredString(input.verticalContactDirection, 'verticalContactDirection'),
    coldGapM,
    gapConvention: requiredString(input.gapConvention, 'gapConvention'),
    tensileReactionPermitted: Boolean(input.tensileReactionPermitted),
    initialState: requiredString(input.initialState, 'initialState'),
    source,
    qualification: blockers.length ? 'UNRESOLVED' : 'QUALIFIED',
    blockers,
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

export function requireThermalLiftoffSupportContactAuthority(value) {
  exactKeys(value, [
    'schema', 'supportSiteId', 'routeChainageMm', 'capability', 'verticalContactDirection',
    'coldGapM', 'gapConvention', 'tensileReactionPermitted', 'initialState', 'source',
    'qualification', 'blockers', 'semanticHash',
  ], 'thermal lift-off support contact authority');
  if (value.schema !== THERMAL_LIFTOFF_SUPPORT_CONTACT_AUTHORITY_SCHEMA) {
    throw codedError('Unexpected support contact authority schema.', 'THERMAL_LIFTOFF_SUPPORT_CONTACT_SCHEMA_INVALID');
  }
  const normalized = createThermalLiftoffSupportContactAuthority({
    supportSiteId: value.supportSiteId,
    routeChainageMm: value.routeChainageMm,
    capability: value.capability,
    verticalContactDirection: value.verticalContactDirection,
    coldGapM: value.coldGapM,
    gapConvention: value.gapConvention,
    tensileReactionPermitted: value.tensileReactionPermitted,
    initialState: value.initialState,
    source: value.source,
  });
  if (normalized.qualification !== value.qualification
    || semanticHash(normalized.blockers) !== semanticHash(value.blockers)
    || normalized.semanticHash !== value.semanticHash) {
    throw codedError('Support contact authority is stale or tampered.', 'THERMAL_LIFTOFF_SUPPORT_CONTACT_HASH_MISMATCH');
  }
  return normalized;
}

export function createThermalLiftoffReactionToleranceAuthority(input) {
  exactKeys(input, ['toleranceId', 'reactionToleranceN', 'source', 'qualification'], 'reaction tolerance authority input');
  if (input.qualification !== 'QUALIFIED') {
    throw codedError(
      'Reaction tolerance must carry explicit QUALIFIED authority.',
      THERMAL_LIFTOFF_BLOCKER_CODES.REACTION_TOLERANCE_AUTHORITY_MISSING,
    );
  }
  const draft = {
    schema: THERMAL_LIFTOFF_REACTION_TOLERANCE_AUTHORITY_SCHEMA,
    toleranceId: requiredString(input.toleranceId, 'toleranceId'),
    reactionToleranceN: nonnegative(input.reactionToleranceN, 'reactionToleranceN'),
    source: requireSourceIdentity(input.source, 'reaction tolerance source'),
    qualification: 'QUALIFIED',
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

export function requireThermalLiftoffReactionToleranceAuthority(value) {
  exactKeys(value, [
    'schema', 'toleranceId', 'reactionToleranceN', 'source', 'qualification', 'semanticHash',
  ], 'reaction tolerance authority');
  if (value.schema !== THERMAL_LIFTOFF_REACTION_TOLERANCE_AUTHORITY_SCHEMA) {
    throw codedError('Unexpected reaction tolerance authority schema.', 'THERMAL_LIFTOFF_REACTION_TOLERANCE_SCHEMA_INVALID');
  }
  const normalized = createThermalLiftoffReactionToleranceAuthority({
    toleranceId: value.toleranceId,
    reactionToleranceN: value.reactionToleranceN,
    source: value.source,
    qualification: value.qualification,
  });
  if (normalized.semanticHash !== value.semanticHash) {
    throw codedError('Reaction tolerance authority semantic hash mismatch.', 'THERMAL_LIFTOFF_REACTION_TOLERANCE_HASH_MISMATCH');
  }
  return normalized;
}

export function requireThermalLiftoffSourceIdentity(value, label = 'source') {
  return requireSourceIdentity(value, label);
}

function requireSourceIdentity(value, label) {
  exactKeys(value, ['sourceId', 'sourceRevision', 'sourceSemanticHash'], label);
  return deepFreeze({
    sourceId: requiredString(value.sourceId, `${label}.sourceId`),
    sourceRevision: requiredString(value.sourceRevision, `${label}.sourceRevision`),
    sourceSemanticHash: requiredHash(value.sourceSemanticHash, `${label}.sourceSemanticHash`),
  });
}

function blocker(code, scope, message) {
  return deepFreeze({ code, severity: 'ERROR', scope, message });
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function requiredString(value, label) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${label} must be a non-empty string.`);
  return normalized;
}

function finiteNumber(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}

function nonnegative(value, label) {
  const result = finiteNumber(value, label);
  if (result < 0) throw new TypeError(`${label} must be non-negative.`);
  return result;
}

function requiredHash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    throw new TypeError(`${label} must be an FNV-1a semantic hash.`);
  }
  return value;
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
