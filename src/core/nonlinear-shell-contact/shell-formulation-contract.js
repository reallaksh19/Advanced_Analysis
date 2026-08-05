import {
  assertArray,
  assertBoolean,
  assertEnum,
  assertExactKeys,
  assertFiniteNumber,
  assertPlainData,
  assertString,
  clonePlain,
  deepFreeze,
  sealWithHash,
  verifySealedHash,
} from './contracts.js';

export const SHELL_FORMULATION_SCHEMA = 'nonlinear-shell-contact-shell-formulation/v1';
export const SHELL_THEORIES = Object.freeze(['REISSNER_MINDLIN_FINITE_ROTATION_SMALL_STRAIN']);
export const SHELL_ELEMENT_FAMILIES = Object.freeze(['S8R_QUADRATIC_REDUCED']);
export const DIRECTOR_UPDATES = Object.freeze(['EXPONENTIAL_MAP_OBJECTIVE']);
export const DRILLING_ROLES = Object.freeze(['NUMERICAL_STABILIZATION_ONLY']);
export const PRESSURE_ROLES = Object.freeze(['FOLLOWER_CURRENT_SURFACE']);

const REQUIRED_BENCHMARKS = Object.freeze([
  'RIGID_BODY_OBJECTIVITY',
  'MEMBRANE_PATCH',
  'PURE_BENDING',
  'TRANSVERSE_SHEAR_THIN_LIMIT',
  'WARPED_QUADRILATERAL',
  'FOLLOWER_PRESSURE',
  'NORMAL_REVERSAL',
  'MESH_REFINEMENT',
]);

export function createShellFormulationContract(input = {}) {
  const payload = {
    schema: SHELL_FORMULATION_SCHEMA,
    theory: 'REISSNER_MINDLIN_FINITE_ROTATION_SMALL_STRAIN',
    elementFamily: 'S8R_QUADRATIC_REDUCED',
    physicalDofsPerNode: 5,
    translationalDofs: 3,
    directorRotationalDofs: 2,
    drillingDof: {
      present: true,
      role: 'NUMERICAL_STABILIZATION_ONLY',
      engineeringOutputAuthorized: false,
    },
    directorUpdate: 'EXPONENTIAL_MAP_OBJECTIVE',
    referenceSurface: 'MIDSURFACE',
    shellOffsetsSupported: true,
    topBottomRecoveryRequired: true,
    pressureRole: 'FOLLOWER_CURRENT_SURFACE',
    integrationControls: {
      reducedIntegration: true,
      hourglassEnergyRatioLimit: 0.05,
      transverseShearEnergyRatioLimit: 0.10,
    },
    requiredBenchmarks: [...REQUIRED_BENCHMARKS],
    excludedAuthority: [
      'CONTACT_MECHANICS',
      'PIPE_DENTING',
      'PLASTICITY',
      'DAMAGE',
      'FRACTURE',
      'FATIGUE',
      'CODE_ASSESSMENT',
      'PRODUCTION_EXECUTION',
    ],
    ...clonePlain(input),
  };
  validateShellFormulationContract(payload);
  return sealWithHash(payload, 'shellFormulationHash');
}

export function validateShellFormulationContract(value) {
  assertPlainData(value, '$shellFormulation');
  assertExactKeys(value, [
    'schema', 'theory', 'elementFamily', 'physicalDofsPerNode', 'translationalDofs',
    'directorRotationalDofs', 'drillingDof', 'directorUpdate', 'referenceSurface',
    'shellOffsetsSupported', 'topBottomRecoveryRequired', 'pressureRole',
    'integrationControls', 'requiredBenchmarks', 'excludedAuthority',
  ], '$shellFormulation', ['shellFormulationHash']);
  assertEnum(value.schema, [SHELL_FORMULATION_SCHEMA], '$shellFormulation.schema');
  assertEnum(value.theory, SHELL_THEORIES, '$shellFormulation.theory');
  assertEnum(value.elementFamily, SHELL_ELEMENT_FAMILIES, '$shellFormulation.elementFamily');
  if (value.physicalDofsPerNode !== 5 || value.translationalDofs !== 3 || value.directorRotationalDofs !== 2) {
    throw new TypeError('Shell physical DOF contract must remain 3 translations plus 2 director rotations.');
  }
  assertExactKeys(value.drillingDof, ['present', 'role', 'engineeringOutputAuthorized'], '$shellFormulation.drillingDof');
  assertBoolean(value.drillingDof.present, '$shellFormulation.drillingDof.present');
  assertEnum(value.drillingDof.role, DRILLING_ROLES, '$shellFormulation.drillingDof.role');
  if (value.drillingDof.engineeringOutputAuthorized !== false) {
    throw new TypeError('Drilling DOF cannot be granted physical engineering authority.');
  }
  assertEnum(value.directorUpdate, DIRECTOR_UPDATES, '$shellFormulation.directorUpdate');
  assertEnum(value.referenceSurface, ['MIDSURFACE'], '$shellFormulation.referenceSurface');
  if (value.shellOffsetsSupported !== true || value.topBottomRecoveryRequired !== true) {
    throw new TypeError('Shell offsets and top/bottom recovery must remain explicit.');
  }
  assertEnum(value.pressureRole, PRESSURE_ROLES, '$shellFormulation.pressureRole');
  assertExactKeys(value.integrationControls, [
    'reducedIntegration', 'hourglassEnergyRatioLimit', 'transverseShearEnergyRatioLimit',
  ], '$shellFormulation.integrationControls');
  if (value.integrationControls.reducedIntegration !== true) throw new TypeError('First-family integration profile must remain explicit.');
  assertFiniteNumber(value.integrationControls.hourglassEnergyRatioLimit, '$shellFormulation.integrationControls.hourglassEnergyRatioLimit', (n) => n > 0 && n <= 0.10, 'ratio');
  assertFiniteNumber(value.integrationControls.transverseShearEnergyRatioLimit, '$shellFormulation.integrationControls.transverseShearEnergyRatioLimit', (n) => n > 0 && n <= 0.20, 'ratio');
  assertArray(value.requiredBenchmarks, '$shellFormulation.requiredBenchmarks', { min: REQUIRED_BENCHMARKS.length });
  if (new Set(value.requiredBenchmarks).size !== value.requiredBenchmarks.length) throw new TypeError('Benchmark identities must be unique.');
  for (const id of REQUIRED_BENCHMARKS) if (!value.requiredBenchmarks.includes(id)) throw new TypeError(`Missing mandatory shell benchmark: ${id}.`);
  assertArray(value.excludedAuthority, '$shellFormulation.excludedAuthority', { min: 1 });
  value.excludedAuthority.forEach((entry, index) => assertString(entry, `$shellFormulation.excludedAuthority[${index}]`));
  if (value.shellFormulationHash) verifySealedHash(value, 'shellFormulationHash', '$shellFormulation');
  return true;
}

export const DEFAULT_SHELL_FORMULATION = deepFreeze(createShellFormulationContract());
