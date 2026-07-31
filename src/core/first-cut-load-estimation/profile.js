/**
 * Functionality: Builds and validates the explicit first-cut screening profile.
 * No method, gravity, tolerance, sag criterion, or capability is defaulted.
 */

import { deepFreeze } from '../shared-piping-model/index.js';
import {
  FIRST_CUT_CAPABILITIES, FIRST_CUT_METHODS, FIRST_CUT_SCHEMAS, PRESSURE_FORMULA_IDS,
} from './constants.js';
import {
  assertEnum, assertExactKeys, assertFinite, assertPlainRecord, assertString,
  assertStringArray, validateHashedContract, withSemanticHash,
} from './validation.js';

const INPUT_KEYS = Object.freeze([
  'profileId', 'methodId', 'loadCaseIds', 'gravity', 'geometryTolerances', 'equilibriumTolerances',
  'sagCriterion', 'requestedCapabilities', 'pressureFormulaId', 'source',
]);
const CONTRACT_KEYS = Object.freeze(['schema', ...INPUT_KEYS]);

export function buildFirstCutProfile(input) {
  assertExactKeys(input, INPUT_KEYS, 'First-cut profile input');
  const methodId = assertEnum(input.methodId, Object.values(FIRST_CUT_METHODS), 'First-cut method');
  const loadCaseIds = assertStringArray(input.loadCaseIds, ['EMPTY', 'HYD', 'OPE'], 'First-cut load cases');
  if (!loadCaseIds.length) throw new TypeError('At least one first-cut load case is required.');
  const requestedCapabilities = assertStringArray(
    input.requestedCapabilities, Object.values(FIRST_CUT_CAPABILITIES), 'Requested capabilities',
  );
  const pressureFormulaId = validatePressureFormula(input.pressureFormulaId, requestedCapabilities);
  const base = {
    schema: FIRST_CUT_SCHEMAS.PROFILE,
    profileId: assertString(input.profileId, 'Profile ID'),
    methodId,
    loadCaseIds,
    gravity: validateGravity(input.gravity),
    geometryTolerances: validateGeometryTolerances(input.geometryTolerances),
    equilibriumTolerances: validateTolerances(input.equilibriumTolerances),
    sagCriterion: validateSagCriterion(input.sagCriterion),
    requestedCapabilities,
    pressureFormulaId,
    source: assertString(input.source, 'Profile source'),
  };
  return withSemanticHash(base);
}

export function validateFirstCutProfile(value) {
  const result = validateHashedContract(value, FIRST_CUT_SCHEMAS.PROFILE, CONTRACT_KEYS);
  if (!result.ok) return result;
  try {
    const { schema: _schema, semanticHash: _hash, ...input } = value;
    const rebuilt = buildFirstCutProfile(input);
    if (rebuilt.semanticHash !== value.semanticHash) throw new TypeError('Profile does not rebuild deterministically.');
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({ ok: false, errors: [error.message] });
  }
}

function validateGravity(value) {
  assertExactKeys(value, ['accelerationMPerS2', 'direction', 'source'], 'Gravity profile');
  return deepFreeze({
    accelerationMPerS2: assertFinite(value.accelerationMPerS2, 'Gravity acceleration', (number) => number > 0),
    direction: assertString(value.direction, 'Gravity direction'),
    source: assertString(value.source, 'Gravity source'),
  });
}

function validateTolerances(value) {
  const keys = ['forceAbsoluteN', 'forceRelative', 'momentAbsoluteNm', 'momentRelative'];
  assertExactKeys(value, keys, 'Equilibrium tolerances');
  return deepFreeze(Object.fromEntries(keys.map((key) => [
    key, assertFinite(value[key], `Tolerance ${key}`, (number) => number >= 0),
  ])));
}

function validateGeometryTolerances(value) {
  const keys = ['absoluteM', 'relative'];
  assertExactKeys(value, keys, 'Geometry tolerances');
  return deepFreeze(Object.fromEntries(keys.map((key) => [
    key, assertFinite(value[key], `Geometry tolerance ${key}`, (number) => number >= 0),
  ])));
}

function validateSagCriterion(value) {
  if (value === null) return null;
  assertExactKeys(value, ['maximumM', 'source'], 'Sag criterion');
  return deepFreeze({
    maximumM: assertFinite(value.maximumM, 'Sag criterion maximum', (number) => number > 0),
    source: assertString(value.source, 'Sag criterion source'),
  });
}

function validatePressureFormula(value, capabilities) {
  const requested = capabilities.includes(FIRST_CUT_CAPABILITIES.SUSTAINED);
  if (!requested && value === null) return null;
  if (!requested) throw new TypeError('Pressure formula cannot be selected when sustained screening is not requested.');
  return assertEnum(value, Object.values(PRESSURE_FORMULA_IDS), 'Pressure formula');
}
