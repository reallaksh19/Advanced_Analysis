import { deepFreeze, finiteNumber, isPlainRecord, stringValue } from '../shared-piping-model/index.js';
import {
  CANONICAL_LENGTH_UNIT,
  EXACT_PROFILE_ID,
  IDENTITY_POLICY,
  TOPOLOGY_CONNECTION_PROFILE_SCHEMA,
  TOLERANCE_PROFILE_ID,
} from './constants.js';

const UNIT_ALIASES = Object.freeze({
  mm: 'mm', millimeter: 'mm', millimeters: 'mm', millimetre: 'mm', millimetres: 'mm',
  cm: 'cm', centimeter: 'cm', centimeters: 'cm', centimetre: 'cm', centimetres: 'cm',
  m: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  in: 'in', inch: 'in', inches: 'in',
  ft: 'ft', foot: 'ft', feet: 'ft',
});

const TO_MM = Object.freeze({ mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 });

export function createExactTopologyProfile(lengthUnit = 'unknown') {
  return createTopologyConnectionProfile({
    profileId: EXACT_PROFILE_ID,
    profileVersion: 1,
    lengthUnit,
    allowExactCoordinateMatch: true,
    allowToleranceInference: false,
    tolerance: null,
    identityCompatibilityPolicy: IDENTITY_POLICY,
  });
}

export function createToleranceTopologyProfile(lengthUnit, tolerance) {
  return createTopologyConnectionProfile({
    profileId: TOLERANCE_PROFILE_ID,
    profileVersion: 1,
    lengthUnit,
    allowExactCoordinateMatch: true,
    allowToleranceInference: true,
    tolerance,
    identityCompatibilityPolicy: IDENTITY_POLICY,
  });
}

export function createTopologyConnectionProfile(input) {
  if (!isPlainRecord(input)) throw new TypeError('Topology profile input must be an object.');
  const profile = {
    schema: TOPOLOGY_CONNECTION_PROFILE_SCHEMA,
    profileId: requiredString(input.profileId, 'profileId'),
    profileVersion: positiveInteger(input.profileVersion, 'profileVersion'),
    lengthUnit: normalizeLengthUnit(input.lengthUnit),
    allowExactCoordinateMatch: input.allowExactCoordinateMatch !== false,
    allowToleranceInference: input.allowToleranceInference === true,
    tolerance: normalizeTolerance(input),
    identityCompatibilityPolicy: requiredString(
      input.identityCompatibilityPolicy || IDENTITY_POLICY,
      'identityCompatibilityPolicy',
    ),
  };
  const validation = validateTopologyConnectionProfile(profile);
  if (!validation.ok) throw new TypeError(validation.errors.join(' '));
  return deepFreeze(profile);
}

export function validateTopologyConnectionProfile(profile) {
  const errors = [];
  if (!profile || profile.schema !== TOPOLOGY_CONNECTION_PROFILE_SCHEMA) errors.push('Invalid topology profile schema.');
  if (!stringValue(profile?.profileId)) errors.push('Topology profileId is required.');
  if (!Number.isInteger(profile?.profileVersion) || profile.profileVersion < 1) errors.push('Topology profileVersion must be positive.');
  if (!stringValue(profile?.lengthUnit)) errors.push('Topology profile lengthUnit is required.');
  if (typeof profile?.allowExactCoordinateMatch !== 'boolean') errors.push('Topology exact-coordinate flag must be boolean.');
  if (typeof profile?.allowToleranceInference !== 'boolean') errors.push('Topology tolerance flag must be boolean.');
  if (profile?.allowToleranceInference && !(finiteNumber(profile.tolerance) > 0)) errors.push('Topology tolerance must be positive.');
  if (!profile?.allowToleranceInference && profile?.tolerance !== null) errors.push('Exact-only topology tolerance must be null.');
  if (!stringValue(profile?.identityCompatibilityPolicy)) errors.push('Topology identity policy is required.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function normalizeLengthUnit(value) {
  const normalized = stringValue(value).toLowerCase();
  return UNIT_ALIASES[normalized] || 'unknown';
}

export function canonicalLengthFactor(lengthUnit) {
  return TO_MM[normalizeLengthUnit(lengthUnit)] ?? null;
}

export function toleranceInCanonicalUnit(profile) {
  if (!profile?.allowToleranceInference) return null;
  const factor = canonicalLengthFactor(profile.lengthUnit);
  return factor === null ? null : profile.tolerance * factor;
}

export function canonicalLengthUnit() {
  return CANONICAL_LENGTH_UNIT;
}

function normalizeTolerance(input) {
  if (!input.allowToleranceInference) return null;
  const tolerance = finiteNumber(input.tolerance);
  return tolerance !== null ? tolerance : input.tolerance;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new TypeError(`${field} must be a positive integer.`);
  return number;
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}
