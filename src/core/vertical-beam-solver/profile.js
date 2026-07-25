import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import {
  ELIGIBLE_LOAD_TYPES, FLEXURAL_BASIS, PROFILE_ID, PROFILE_VERSION,
  VERTICAL_BEAM_SOLVER_PROFILE_SCHEMA,
} from './constants.js';

export function createEulerBernoulliVerticalPathProfile(options = {}) {
  assertOptions(options);
  const base = {
    schema: VERTICAL_BEAM_SOLVER_PROFILE_SCHEMA,
    profileId: PROFILE_ID,
    profileVersion: PROFILE_VERSION,
    kinematicModel: 'EULER_BERNOULLI',
    signConvention: {
      verticalDisplacementPositive: 'GRAVITY_DOWN',
      appliedVerticalForcePositive: 'GRAVITY_DOWN',
      rotationPositive: 'LOCAL_DV_DX',
      signedSupportForcePositive: 'GRAVITY_DOWN',
    },
    pathEligibility: { requiredQualification: 'READY', topology: 'ACYCLIC_NON_BRANCHING_PATH' },
    supportBoundaryPolicy: {
      eligibleVerticalState: 'RESTRAINED', verticalDisplacementM: 0,
      rotation: 'FREE', penaltyStiffness: false, settlement: 'UNSUPPORTED',
      gaps: 'BLOCKED', springs: 'BLOCKED', minimumDistinctSupportCount: 2,
    },
    flexuralPropertyPrecedence: [FLEXURAL_BASIS.DIRECT_EI, FLEXURAL_BASIS.EXPLICIT_E_I, FLEXURAL_BASIS.CIRCULAR_E_I],
    loadEligibility: { primitiveTypes: ELIGIBLE_LOAD_TYPES, semanticDirection: 'GRAVITY_DOWN', globalVector: null },
    pointMomentPolicy: 'BLOCKED_NO_CERTIFIED_BENDING_AXIS',
    meshPolicy: 'EVIDENCE_BOUNDARY_STATIONS_ONLY',
    numericalSolverPolicy: {
      assemblyFormulaId: 'VERTICAL_BEAM_GLOBAL_ASSEMBLY_V1',
      solverFormulaId: 'SCALED_PARTIAL_PIVOT_LINEAR_SOLVE_V1',
      constraintMethod: 'FREE_CONSTRAINED_DOF_PARTITION',
      pivotAbsoluteTolerance: numericOption(options, 'pivotAbsoluteTolerance', 1e-14, 'pivot absolute tolerance'),
      pivotRelativeTolerance: numericOption(options, 'pivotRelativeTolerance', 1e-12, 'pivot relative tolerance'),
    },
    geometryTolerancePolicy: toleranceOption(options, 'geometryTolerancePolicy', 1e-9, 1e-9, 'm', 'geometry'),
    forceEquilibriumTolerancePolicy: toleranceOption(options, 'forceEquilibriumTolerancePolicy', 1e-7, 1e-10, 'N', 'force'),
    momentEquilibriumTolerancePolicy: toleranceOption(options, 'momentEquilibriumTolerancePolicy', 1e-7, 1e-10, 'N*m', 'moment'),
    matrixResidualTolerancePolicy: toleranceOption(options, 'matrixResidualTolerancePolicy', 1e-8, 1e-10, 'N', 'matrix'),
    supportDisplacementTolerancePolicy: toleranceOption(options, 'supportDisplacementTolerancePolicy', 1e-12, 1e-10, 'm', 'displacement'),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateVerticalBeamSolverProfile(profile) {
  const errors = [];
  if (profile?.schema !== VERTICAL_BEAM_SOLVER_PROFILE_SCHEMA) errors.push('Invalid vertical-beam solver profile schema.');
  if (profile?.profileId !== PROFILE_ID) errors.push('Unsupported vertical-beam solver profile ID.');
  if (!stringValue(profile?.profileVersion)) errors.push('Vertical-beam solver profile version is required.');
  if (profile?.kinematicModel !== 'EULER_BERNOULLI') errors.push('Vertical-beam kinematic model must be Euler-Bernoulli.');
  validateNumeric(profile?.numericalSolverPolicy?.pivotAbsoluteTolerance, 'pivot absolute tolerance', errors);
  validateNumeric(profile?.numericalSolverPolicy?.pivotRelativeTolerance, 'pivot relative tolerance', errors);
  validateTolerance(profile?.geometryTolerancePolicy, 'geometry', errors);
  validateTolerance(profile?.forceEquilibriumTolerancePolicy, 'force', errors);
  validateTolerance(profile?.momentEquilibriumTolerancePolicy, 'moment', errors);
  validateTolerance(profile?.matrixResidualTolerancePolicy, 'matrix', errors);
  validateTolerance(profile?.supportDisplacementTolerancePolicy, 'displacement', errors);
  if (profile?.semanticHash !== semanticHash(withoutHash(profile))) errors.push('Vertical-beam solver profile semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function assertOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Vertical-beam solver profile options must be an object.');
  }
}
function toleranceOption(options, key, absoluteDefault, relativeDefault, unit, label) {
  const value = own(options, key) ? options[key] : {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Invalid ${label} tolerance policy.`);
  return deepFreeze({
    absoluteTolerance: numericOption(value, 'absoluteTolerance', absoluteDefault, `${label} absolute tolerance`),
    relativeTolerance: numericOption(value, 'relativeTolerance', relativeDefault, `${label} relative tolerance`),
    unit,
  });
}
function numericOption(options, key, fallback, label) {
  if (!own(options, key)) return fallback;
  const value = options[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new TypeError(`Invalid ${label}.`);
  return value;
}
function validateTolerance(value, label, errors) {
  validateNumeric(value?.absoluteTolerance, `${label} absolute tolerance`, errors);
  validateNumeric(value?.relativeTolerance, `${label} relative tolerance`, errors);
}
function validateNumeric(value, label, errors) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) errors.push(`Invalid ${label}.`);
}
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
