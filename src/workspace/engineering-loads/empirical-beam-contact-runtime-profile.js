import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../core/shared-piping-model/index.js';

export const EMPIRICAL_BEAM_CONTACT_RUNTIME_PROFILE_SCHEMA =
  'empirical-beam-contact-runtime-profile/v1';

const QUALIFICATIONS = Object.freeze(['QUALIFIED', 'UNQUALIFIED', 'EXPERIMENTAL']);
const PROFILE_KEYS = Object.freeze([
  'schema',
  'profileId',
  'profileVersion',
  'qualification',
  'locked',
  'lineProperties',
  'elbow',
  'tolerances',
  'numericalOptions',
  'semanticHash',
]);

export function createEmpiricalBeamContactRuntimeProfile(input) {
  if (!isPlainRecord(input)) {
    throw new TypeError('Empirical beam/contact runtime profile input must be an object.');
  }
  const lineProperties = Object.fromEntries(Object.entries(input.lineProperties || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([lineId, value]) => [requiredString(lineId, 'lineId'), requireLineProperties(value, lineId)]));
  if (Object.keys(lineProperties).length === 0) {
    throw new TypeError('At least one line-property record is required.');
  }
  const base = {
    schema: EMPIRICAL_BEAM_CONTACT_RUNTIME_PROFILE_SCHEMA,
    profileId: requiredString(input.profileId, 'profileId'),
    profileVersion: positiveInteger(input.profileVersion, 'profileVersion'),
    qualification: oneOf(input.qualification, QUALIFICATIONS, 'qualification'),
    locked: booleanValue(input.locked, 'locked'),
    lineProperties,
    elbow: requireElbowProfile(input.elbow),
    tolerances: requireTolerances(input.tolerances),
    numericalOptions: requireNumericalOptions(input.numericalOptions),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function requireEmpiricalBeamContactRuntimeProfile(value) {
  exactKeys(value, PROFILE_KEYS, 'empirical beam/contact runtime profile');
  if (value.schema !== EMPIRICAL_BEAM_CONTACT_RUNTIME_PROFILE_SCHEMA) {
    throw new TypeError('Unsupported empirical beam/contact runtime profile schema.');
  }
  const normalized = createEmpiricalBeamContactRuntimeProfile(value);
  if (normalized.semanticHash !== value.semanticHash) {
    throw new TypeError('Empirical beam/contact runtime profile semantic hash mismatch.');
  }
  return normalized;
}

function requireLineProperties(value, lineId) {
  exactKeys(value, [
    'outsideDiameterM',
    'nominalWallM',
    'stiffnessWallM',
    'weightWallM',
    'corrosionAllowanceM',
    'elasticModulusPa',
    'thermalExpansionPerK',
    'authority',
  ], `lineProperties.${lineId}`);
  const outsideDiameterM = positive(value.outsideDiameterM, `${lineId}.outsideDiameterM`);
  const nominalWallM = positive(value.nominalWallM, `${lineId}.nominalWallM`);
  const stiffnessWallM = positive(value.stiffnessWallM, `${lineId}.stiffnessWallM`);
  const weightWallM = positive(value.weightWallM, `${lineId}.weightWallM`);
  [nominalWallM, stiffnessWallM, weightWallM].forEach((wall) => {
    if (wall * 2 >= outsideDiameterM) {
      throw new TypeError(`Line ${lineId} wall thickness leaves no inside diameter.`);
    }
  });
  const corrosionAllowanceM = nonnegative(
    value.corrosionAllowanceM,
    `${lineId}.corrosionAllowanceM`,
  );
  if (corrosionAllowanceM >= nominalWallM) {
    throw new TypeError(`Line ${lineId} corrosion allowance consumes the nominal wall.`);
  }
  return deepFreeze({
    outsideDiameterM,
    nominalWallM,
    stiffnessWallM,
    weightWallM,
    corrosionAllowanceM,
    elasticModulusPa: positive(value.elasticModulusPa, `${lineId}.elasticModulusPa`),
    thermalExpansionPerK: nonnegative(
      value.thermalExpansionPerK,
      `${lineId}.thermalExpansionPerK`,
    ),
    authority: requireAuthority(value.authority, lineId),
  });
}

function requireAuthority(value, lineId) {
  exactKeys(value, [
    'section',
    'elasticModulus',
    'thermalExpansion',
  ], `${lineId}.authority`);
  return deepFreeze({
    section: requiredString(value.section, `${lineId}.authority.section`),
    elasticModulus: requiredString(
      value.elasticModulus,
      `${lineId}.authority.elasticModulus`,
    ),
    thermalExpansion: requiredString(
      value.thermalExpansion,
      `${lineId}.authority.thermalExpansion`,
    ),
  });
}

function requireElbowProfile(value) {
  exactKeys(value, [
    'segmentCount',
    'flexibilityFactor',
  ], 'elbow');
  const segmentCount = positiveInteger(value.segmentCount, 'elbow.segmentCount');
  if (segmentCount !== 8) {
    throw new TypeError('The qualified WP2 elbow bridge requires exactly eight segments.');
  }
  return deepFreeze({
    segmentCount,
    flexibilityFactor: positive(value.flexibilityFactor, 'elbow.flexibilityFactor'),
  });
}

function requireTolerances(value) {
  exactKeys(value, [
    'planarityM',
    'pointProjectionM',
    'contactGapM',
    'absoluteReactionN',
    'relativeReaction',
    'equilibriumForceN',
    'equilibriumMomentNm',
  ], 'tolerances');
  return deepFreeze({
    planarityM: positive(value.planarityM, 'tolerances.planarityM'),
    pointProjectionM: positive(value.pointProjectionM, 'tolerances.pointProjectionM'),
    contactGapM: nonnegative(value.contactGapM, 'tolerances.contactGapM'),
    absoluteReactionN: nonnegative(
      value.absoluteReactionN,
      'tolerances.absoluteReactionN',
    ),
    relativeReaction: nonnegative(
      value.relativeReaction,
      'tolerances.relativeReaction',
    ),
    equilibriumForceN: nonnegative(
      value.equilibriumForceN,
      'tolerances.equilibriumForceN',
    ),
    equilibriumMomentNm: nonnegative(
      value.equilibriumMomentNm,
      'tolerances.equilibriumMomentNm',
    ),
  });
}

function requireNumericalOptions(value) {
  exactKeys(value, [
    'pivotMultiplier',
    'minimumReciprocalCondition',
  ], 'numericalOptions');
  return deepFreeze({
    pivotMultiplier: positive(value.pivotMultiplier, 'numericalOptions.pivotMultiplier'),
    minimumReciprocalCondition: positive(
      value.minimumReciprocalCondition,
      'numericalOptions.minimumReciprocalCondition',
    ),
  });
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${field} must be a positive integer.`);
  }
  return value;
}

function positive(value, field) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${field} must be positive.`);
  }
  return value;
}

function nonnegative(value, field) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be non-negative.`);
  }
  return value;
}

function booleanValue(value, field) {
  if (typeof value !== 'boolean') throw new TypeError(`${field} must be boolean.`);
  return value;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new TypeError(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}
