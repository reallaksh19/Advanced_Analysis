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

export const SHELL_FORMULATION_SCHEMA = 'nonlinear-shell-contact-shell-formulation/v2';
export const SHELL_BENCHMARK_EVIDENCE_SCHEMA = 'nonlinear-shell-contact-shell-benchmark-evidence/v2';
export const SHELL_QUALIFICATION_REPORT_SCHEMA = 'nonlinear-shell-contact-nc01-report/v2';

export const REQUIRED_SHELL_BENCHMARKS = Object.freeze([
  'NC01-SH-01',
  'NC01-SH-02',
  'NC01-SH-03',
  'NC01-SH-04',
  'NC01-SH-05',
  'NC01-SH-06',
  'NC01-SH-07',
  'NC01-SH-08',
]);

export function createShellFormulationContract(input = {}) {
  const payload = {
    schema: SHELL_FORMULATION_SCHEMA,
    theory: 'REISSNER_MINDLIN_FINITE_ROTATION_SMALL_STRAIN',
    elementFamily: 'CALCULIX_S8R_CANDIDATE',
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
    normalConvention: 'CONNECTIVITY_LOCAL_1_CROSS_LOCAL_2',
    pressureRole: 'FOLLOWER_CURRENT_SURFACE',
    recoveryPolicy: {
      source: 'SECTION_INTEGRATION_POINTS',
      probe: 'FIXED_PHYSICAL_COORDINATE',
      nodalAveragingAuthorized: false,
      nearestNodeAuthorized: false,
      topBottomRecoveryRequired: true,
    },
    integrationControls: {
      reducedIntegration: true,
      hourglassEnergyRatioLimit: 0.05,
      transverseShearEnergyRatioLimit: 0.10,
    },
    oracleBoundary: {
      productionDeckWriterAllowed: false,
      productionRecoveryAllowed: false,
      productionFollowerUpdateAllowed: false,
      productionResultReconstructionAllowed: false,
      productionConvergenceEvaluatorAllowed: false,
    },
    requiredBenchmarks: [...REQUIRED_SHELL_BENCHMARKS],
    excludedAuthority: [
      'CONTACT_MECHANICS',
      'PIPE_DENTING',
      'PLASTICITY',
      'CODE_ASSESSMENT',
      'MODULE_QUALIFICATION',
      'PRODUCTION_EXECUTION',
      'FITNESS_FOR_SERVICE',
      'REMAINING_STRENGTH',
      'AUTOMATIC_ASSET_ACCEPTANCE',
      'AUTONOMOUS_CASE_DISPOSITION',
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
    'shellOffsetsSupported', 'normalConvention', 'pressureRole', 'recoveryPolicy',
    'integrationControls', 'oracleBoundary', 'requiredBenchmarks', 'excludedAuthority',
  ], '$shellFormulation', ['shellFormulationHash']);
  assertEnum(value.schema, [SHELL_FORMULATION_SCHEMA], '$shellFormulation.schema');
  assertEnum(value.theory, ['REISSNER_MINDLIN_FINITE_ROTATION_SMALL_STRAIN'], '$shellFormulation.theory');
  assertEnum(value.elementFamily, ['CALCULIX_S8R_CANDIDATE'], '$shellFormulation.elementFamily');
  if (value.physicalDofsPerNode !== 5 || value.translationalDofs !== 3 || value.directorRotationalDofs !== 2) {
    throw new TypeError('Shell physical DOFs must remain three translations plus two director rotations.');
  }
  assertExactKeys(value.drillingDof, ['present', 'role', 'engineeringOutputAuthorized'], '$shellFormulation.drillingDof');
  if (value.drillingDof.present !== true || value.drillingDof.role !== 'NUMERICAL_STABILIZATION_ONLY' || value.drillingDof.engineeringOutputAuthorized !== false) {
    throw new TypeError('The drilling DOF is numerical stabilization only and has no engineering-output authority.');
  }
  assertEnum(value.directorUpdate, ['EXPONENTIAL_MAP_OBJECTIVE'], '$shellFormulation.directorUpdate');
  assertEnum(value.referenceSurface, ['MIDSURFACE'], '$shellFormulation.referenceSurface');
  assertBoolean(value.shellOffsetsSupported, '$shellFormulation.shellOffsetsSupported');
  if (!value.shellOffsetsSupported) throw new TypeError('Explicit shell offsets are mandatory.');
  assertEnum(value.normalConvention, ['CONNECTIVITY_LOCAL_1_CROSS_LOCAL_2'], '$shellFormulation.normalConvention');
  assertEnum(value.pressureRole, ['FOLLOWER_CURRENT_SURFACE'], '$shellFormulation.pressureRole');
  assertExactKeys(value.recoveryPolicy, ['source', 'probe', 'nodalAveragingAuthorized', 'nearestNodeAuthorized', 'topBottomRecoveryRequired'], '$shellFormulation.recoveryPolicy');
  if (value.recoveryPolicy.source !== 'SECTION_INTEGRATION_POINTS' || value.recoveryPolicy.probe !== 'FIXED_PHYSICAL_COORDINATE' || value.recoveryPolicy.nodalAveragingAuthorized !== false || value.recoveryPolicy.nearestNodeAuthorized !== false || value.recoveryPolicy.topBottomRecoveryRequired !== true) {
    throw new TypeError('Qualification recovery must use fixed-coordinate section integration-point evidence.');
  }
  assertExactKeys(value.integrationControls, ['reducedIntegration', 'hourglassEnergyRatioLimit', 'transverseShearEnergyRatioLimit'], '$shellFormulation.integrationControls');
  if (value.integrationControls.reducedIntegration !== true) throw new TypeError('Reduced integration must be explicit.');
  assertFiniteNumber(value.integrationControls.hourglassEnergyRatioLimit, '$shellFormulation.integrationControls.hourglassEnergyRatioLimit', (n) => n > 0 && n <= 0.10, 'ratio');
  assertFiniteNumber(value.integrationControls.transverseShearEnergyRatioLimit, '$shellFormulation.integrationControls.transverseShearEnergyRatioLimit', (n) => n > 0 && n <= 0.20, 'ratio');
  assertExactKeys(value.oracleBoundary, ['productionDeckWriterAllowed', 'productionRecoveryAllowed', 'productionFollowerUpdateAllowed', 'productionResultReconstructionAllowed', 'productionConvergenceEvaluatorAllowed'], '$shellFormulation.oracleBoundary');
  Object.entries(value.oracleBoundary).forEach(([key, allowed]) => {
    if (allowed !== false) throw new TypeError(`Independent oracle boundary forbids ${key}.`);
  });
  assertArray(value.requiredBenchmarks, '$shellFormulation.requiredBenchmarks', { min: REQUIRED_SHELL_BENCHMARKS.length });
  if (value.requiredBenchmarks.length !== REQUIRED_SHELL_BENCHMARKS.length || new Set(value.requiredBenchmarks).size !== REQUIRED_SHELL_BENCHMARKS.length) {
    throw new TypeError('The shell benchmark register must contain exactly eight unique domains.');
  }
  for (const id of REQUIRED_SHELL_BENCHMARKS) if (!value.requiredBenchmarks.includes(id)) throw new TypeError(`Missing shell benchmark ${id}.`);
  assertArray(value.excludedAuthority, '$shellFormulation.excludedAuthority', { min: 10 });
  value.excludedAuthority.forEach((entry, index) => assertString(entry, `$shellFormulation.excludedAuthority[${index}]`));
  if (value.shellFormulationHash) verifySealedHash(value, 'shellFormulationHash', '$shellFormulation');
  return true;
}

export const DEFAULT_SHELL_FORMULATION = deepFreeze(createShellFormulationContract());
