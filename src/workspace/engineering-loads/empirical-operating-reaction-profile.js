import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../core/shared-piping-model/index.js';

export const EMPIRICAL_OPERATING_REACTION_PROFILE_SCHEMA =
  'empirical-operating-reaction-profile/v1';
export const EMPIRICAL_OPERATING_REACTION_RULE_ID =
  'EMPIRICAL_OPERATING_REACTION_W_PLUS_T_V1';

const QUALIFICATIONS = Object.freeze(['QUALIFIED', 'UNQUALIFIED', 'EXPERIMENTAL']);
const PROFILE_KEYS = Object.freeze([
  'schema',
  'profileId',
  'profileVersion',
  'qualification',
  'locked',
  'ruleId',
  'ownership',
  'domain',
  'tolerances',
  'semanticHash',
]);

export function createEmpiricalOperatingReactionProfile(input) {
  requireRecord(input, 'empirical operating-reaction profile input');
  const base = {
    schema: EMPIRICAL_OPERATING_REACTION_PROFILE_SCHEMA,
    profileId: requiredString(input.profileId, 'profileId'),
    profileVersion: positiveInteger(input.profileVersion, 'profileVersion'),
    qualification: oneOf(input.qualification, QUALIFICATIONS, 'qualification'),
    locked: booleanValue(input.locked, 'locked'),
    ruleId: requireRuleId(input.ruleId),
    ownership: requireOwnership(input.ownership),
    domain: requireDomain(input.domain),
    tolerances: requireTolerances(input.tolerances),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function requireEmpiricalOperatingReactionProfile(value) {
  exactKeys(value, PROFILE_KEYS, 'empirical operating-reaction profile');
  if (value.schema !== EMPIRICAL_OPERATING_REACTION_PROFILE_SCHEMA) {
    throw new TypeError('Unsupported empirical operating-reaction profile schema.');
  }
  const normalized = createEmpiricalOperatingReactionProfile(value);
  if (normalized.semanticHash !== value.semanticHash) {
    throw new TypeError('Empirical operating-reaction profile semantic hash mismatch.');
  }
  return normalized;
}

export function cloneEmpiricalOperatingReactionProfile(profile, value = {}) {
  const source = requireEmpiricalOperatingReactionProfile(profile);
  return createEmpiricalOperatingReactionProfile({
    profileId: requiredString(value.profileId || `${source.profileId}-CLONE`, 'profileId'),
    profileVersion: Number.isInteger(value.profileVersion)
      ? value.profileVersion
      : source.profileVersion + 1,
    qualification: 'UNQUALIFIED',
    locked: false,
    ruleId: source.ruleId,
    ownership: structuredClone(source.ownership),
    domain: structuredClone(source.domain),
    tolerances: structuredClone(source.tolerances),
  });
}

function requireRuleId(value) {
  if (value !== EMPIRICAL_OPERATING_REACTION_RULE_ID) {
    throw new TypeError(`ruleId must be ${EMPIRICAL_OPERATING_REACTION_RULE_ID}.`);
  }
  return value;
}

function requireOwnership(value) {
  exactKeys(value, [
    'verticalLoadCaseId',
    'lineStopLoadCaseId',
    'outputLoadCaseId',
    'verticalResultClass',
    'lineStopResultClass',
    'outputResultClass',
    'verticalForceOwner',
    'lineStopForceOwner',
    'verticalOwnsMoments',
    'lineStopOwnsMoments',
    'pressureCompatibilityIncluded',
    'pressureStressIncluded',
  ], 'ownership');
  const expected = {
    verticalLoadCaseId: 'W-HOT',
    lineStopLoadCaseId: 'EXP-THERMAL-ON-HOT-SUPPORT-SET',
    outputLoadCaseId: 'OPE-HOT',
    verticalResultClass: 'VERTICAL_SCREENING_RESULT',
    lineStopResultClass: 'THERMAL_LINE_STOP_SCREENING_RESULT',
    outputResultClass: 'COMBINED_OPERATING_REACTION',
    verticalForceOwner: 'VERTICAL_AXIS_ONLY',
    lineStopForceOwner: 'ONE_ORTHOGONAL_LINE_STOP_AXIS_ONLY',
    verticalOwnsMoments: true,
    lineStopOwnsMoments: false,
    pressureCompatibilityIncluded: false,
    pressureStressIncluded: false,
  };
  Object.entries(expected).forEach(([key, expectedValue]) => {
    if (value[key] !== expectedValue) {
      throw new TypeError(`ownership.${key} must equal ${String(expectedValue)}.`);
    }
  });
  return deepFreeze(expected);
}

function requireDomain(value) {
  exactKeys(value, [
    'requireSameDataset',
    'requireSameSourceBindings',
    'requireSameCoordinateFrame',
    'requireSameForceConvention',
    'requireSameMomentConvention',
    'requireSharedCustodyForOverlappingSites',
    'allowVerticalOnlySites',
    'allowLineStopOnlySites',
    'allowPressureEffects',
    'allowBlindVectorAddition',
  ], 'domain');
  const expected = {
    requireSameDataset: true,
    requireSameSourceBindings: true,
    requireSameCoordinateFrame: true,
    requireSameForceConvention: true,
    requireSameMomentConvention: true,
    requireSharedCustodyForOverlappingSites: true,
    allowVerticalOnlySites: true,
    allowLineStopOnlySites: true,
    allowPressureEffects: false,
    allowBlindVectorAddition: false,
  };
  Object.entries(expected).forEach(([key, expectedValue]) => {
    if (value[key] !== expectedValue) {
      throw new TypeError(`domain.${key} must equal ${String(expectedValue)}.`);
    }
  });
  return deepFreeze(expected);
}

function requireTolerances(value) {
  exactKeys(value, [
    'directionOrthogonalityCosine',
    'unownedForceN',
    'unownedMomentNm',
    'zeroForceN',
  ], 'tolerances');
  return deepFreeze({
    directionOrthogonalityCosine: bounded(
      value.directionOrthogonalityCosine,
      0,
      1,
      'tolerances.directionOrthogonalityCosine',
    ),
    unownedForceN: nonnegative(value.unownedForceN, 'tolerances.unownedForceN'),
    unownedMomentNm: nonnegative(value.unownedMomentNm, 'tolerances.unownedMomentNm'),
    zeroForceN: nonnegative(value.zeroForceN, 'tolerances.zeroForceN'),
  });
}

function exactKeys(value, keys, label) {
  requireRecord(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function requireRecord(value, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new TypeError(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${field} must be a positive integer.`);
  }
  return value;
}

function booleanValue(value, field) {
  if (typeof value !== 'boolean') throw new TypeError(`${field} must be boolean.`);
  return value;
}

function nonnegative(value, field) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be non-negative.`);
  }
  return value;
}

function bounded(value, minimum, maximum, field) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be from ${minimum} to ${maximum}.`);
  }
  return value;
}
