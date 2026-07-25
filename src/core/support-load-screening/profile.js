import { deepFreeze, finiteNumber, semanticHash, stringValue } from '../shared-piping-model/index.js';
import {
  FORMULA_IDS,
  PRIMITIVE_TYPES,
  PROFILE_ID,
  PROFILE_VERSION,
  VERTICAL_LOAD_PATH_PROFILE_SCHEMA,
} from './constants.js';

export function createSimpleChainVerticalProfile(options = {}) {
  const absoluteToleranceN = positiveOption(options, 'absoluteToleranceN', 1e-9);
  const relativeTolerance = positiveOption(options, 'relativeTolerance', 1e-10);
  const geometryAbsoluteToleranceM = positiveOption(options, 'geometryAbsoluteToleranceM', 1e-9);
  const geometryRelativeTolerance = positiveOption(options, 'geometryRelativeTolerance', 1e-9);
  const base = {
    schema: VERTICAL_LOAD_PATH_PROFILE_SCHEMA,
    profileId: PROFILE_ID,
    profileVersion: PROFILE_VERSION,
    eligibleTopologyKinds: ['ACYCLIC_NON_BRANCHING_CHAIN'],
    eligibleVerticalRestraintStates: ['RESTRAINED'],
    eligiblePrimitiveTypes: [PRIMITIVE_TYPES.DISTRIBUTED, PRIMITIVE_TYPES.POINT],
    branchPolicy: 'BLOCK',
    cyclePolicy: 'BLOCK',
    overhangPolicy: 'BLOCK',
    gapPolicy: 'BLOCK',
    springPolicy: 'BLOCK',
    equilibriumTolerancePolicy: {
      formulaId: FORMULA_IDS.EQUILIBRIUM,
      absoluteToleranceN,
      relativeTolerance,
      scaleFloorN: 1,
    },
    geometryTolerancePolicy: {
      absoluteToleranceM: geometryAbsoluteToleranceM,
      relativeTolerance: geometryRelativeTolerance,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateVerticalLoadPathProfile(profile) {
  const errors = [];
  if (profile?.schema !== VERTICAL_LOAD_PATH_PROFILE_SCHEMA) errors.push('Invalid vertical-load-path profile schema.');
  if (profile?.profileId !== PROFILE_ID) errors.push('Unsupported vertical-load-path profile ID.');
  if (!Number.isInteger(profile?.profileVersion) || profile.profileVersion < 1) errors.push('Profile version must be positive.');
  if (!profile?.eligibleVerticalRestraintStates?.includes('RESTRAINED')) errors.push('Profile must expose RESTRAINED eligibility.');
  if (!profile?.eligiblePrimitiveTypes?.includes(PRIMITIVE_TYPES.DISTRIBUTED)) errors.push('Distributed gravity load eligibility is required.');
  if (!profile?.eligiblePrimitiveTypes?.includes(PRIMITIVE_TYPES.POINT)) errors.push('Point gravity load eligibility is required.');
  validateTolerance(profile?.equilibriumTolerancePolicy, errors, 'equilibrium');
  validateGeometryTolerance(profile?.geometryTolerancePolicy, errors);
  if (profile?.semanticHash !== semanticHash(withoutHash(profile))) errors.push('Profile semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function validateTolerance(policy, errors, label) {
  if (!(finiteNumber(policy?.absoluteToleranceN) >= 0)) errors.push(`${label} absolute tolerance is invalid.`);
  if (!(finiteNumber(policy?.relativeTolerance) >= 0)) errors.push(`${label} relative tolerance is invalid.`);
  if (!(finiteNumber(policy?.scaleFloorN) > 0)) errors.push(`${label} scale floor is invalid.`);
  if (!stringValue(policy?.formulaId)) errors.push(`${label} formula ID is required.`);
}

function validateGeometryTolerance(policy, errors) {
  if (!(finiteNumber(policy?.absoluteToleranceM) >= 0)) errors.push('Geometry absolute tolerance is invalid.');
  if (!(finiteNumber(policy?.relativeTolerance) >= 0)) errors.push('Geometry relative tolerance is invalid.');
}

function positiveOption(options, key, fallback) {
  if (!(key in options)) return fallback;
  const parsed = finiteNumber(options[key]);
  if (!(parsed > 0)) throw new TypeError(`${key} must be a positive number.`);
  return parsed;
}

function withoutHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value || {};
  return rest;
}
