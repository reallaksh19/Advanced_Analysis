import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import {
  modelReferenceFromCompilation,
  sealLoadCaseProfile,
} from '../src/core/linear-fea-load-case/index.js';
import { compilerInput } from './lfea-b2.5-model-compiler-fixtures.mjs';

export function clone(value) {
  return structuredClone(value);
}

export const PRESCRIBED_SLOT_ID = 'C-N122-UY';

/**
 * The B-2.5 fixture model, extended with one prescribed slot so a load case has
 * something to bind a case-specific movement to. The slot is a model constraint
 * whose behavior is `PRESCRIBED_SLOT`; the load case supplies its value.
 */
export function mechanicalModelCompilation(overrides = {}) {
  const input = compilerInput(overrides);
  input.constraintDeclarations.push({
    declarationId: PRESCRIBED_SLOT_ID,
    kind: 'NODAL_RESTRAINT',
    nodeId: 'N-000122',
    dof: 'UY',
    behavior: 'PRESCRIBED_SLOT',
  });
  return compileMechanicalModel(input);
}

export function modelReference(overrides = {}) {
  return modelReferenceFromCompilation(mechanicalModelCompilation(overrides));
}

export function loadCaseProfile(overrides = {}) {
  return sealLoadCaseProfile({
    schema: 'fea-linear-load-case-profile/v1',
    profileId: 'LINEAR-LOAD-CASE-R1',
    primitiveImmutabilityRule: 'PRIMITIVE_LOAD_CASE_IMMUTABLE_HASH_BOUND_V1',
    thermalStrainApproximation: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    combinationSemanticsRule: 'COMPONENT_SEMANTICS_VERIFIED_AGAINST_SOLVED_RESULTS_V1',
    codeCombinationRule: 'CODE_CATEGORY_COMBINATION_IS_NOT_A_SOLVER_LOAD_CASE_V1',
    gravitationalAcceleration: { value: 9.80665, source: 'LFEA-B3.0-FIXTURE-PROFILE' },
    directionUnitTolerance: { value: 1e-12, source: 'LFEA-B3.0-FIXTURE-PROFILE' },
    semanticHash: '',
    ...overrides,
  });
}

function sourceEvidence(sourceId, sourceRevision, sourceSemanticHash) {
  return { sourceId, sourceRevision, sourceSemanticHash };
}

export function gravityPrimitive(overrides = {}) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-GRAVITY',
    kind: 'GRAVITY',
    direction: { x: 0, y: 0, z: -1 },
    basis: 'GLOBAL',
    includedMassSources: ['PIPE_WALL', 'CONTENTS', 'INSULATION'],
    sourceEvidence: sourceEvidence('PROJECT-LOAD-REGISTER', '07', 'fnv1a64:6666666666666666'),
    ...overrides,
  };
}

export function distributedWeightPrimitive(overrides = {}) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-WEIGHT-E120',
    kind: 'DISTRIBUTED_WEIGHT',
    elementId: 'E-000120',
    weightComponent: 'CONTENTS',
    massPerUnitLength: 18.4,
    densityEvidence: sourceEvidence('PROJECT-FLUID-DB', '03', 'fnv1a64:7777777777777777'),
    geometryEvidence: sourceEvidence('PROJECT-SECTION-DB', '02', 'fnv1a64:5555555555555555'),
    sourceEvidence: sourceEvidence('PROJECT-LOAD-REGISTER', '07', 'fnv1a64:6666666666666666'),
    ...overrides,
  };
}

export function pressurePrimitive(overrides = {}) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-PRESSURE-E120',
    kind: 'PRESSURE',
    elementId: 'E-000120',
    pressure: 1.9e6,
    pressureBasis: 'GAUGE',
    authorizedEffects: {
      codeStress: true,
      pressureStiffening: false,
      axialThrust: false,
      bourdon: false,
    },
    sourceEvidence: sourceEvidence('PROJECT-PROCESS-DATA', '11', 'fnv1a64:8888888888888888'),
    ...overrides,
  };
}

export function temperaturePrimitive(overrides = {}) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-TEMPERATURE-E120',
    kind: 'TEMPERATURE',
    elementId: 'E-000120',
    operatingTemperature: 393.15,
    installationTemperature: 293.15,
    stiffnessEvaluationMaterialStateId: 'MAT-A106B-393K',
    thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    sourceEvidence: sourceEvidence('PROJECT-PROCESS-DATA', '11', 'fnv1a64:8888888888888888'),
    ...overrides,
  };
}

export function nodalForcePrimitive(overrides = {}) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-NODAL-N122',
    kind: 'NODAL_FORCE_MOMENT',
    nodeId: 'N-000122',
    basis: { kind: 'GLOBAL' },
    force: { fx: 1200, fy: 0, fz: -3400 },
    moment: { mx: 0, my: 250, mz: 0 },
    units: { force: 'N', moment: 'N*m', length: 'm' },
    signConvention: 'APPLIED_TO_STRUCTURE',
    sourceEvidence: sourceEvidence('PROJECT-LOAD-REGISTER', '07', 'fnv1a64:6666666666666666'),
    ...overrides,
  };
}

export function distributedLoadPrimitive(overrides = {}) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-UDL-E121',
    kind: 'DISTRIBUTED_LOAD',
    elementId: 'E-000121',
    basis: 'GLOBAL',
    variation: 'UNIFORM',
    startIntensity: { fx: 0, fy: 0, fz: -240 },
    endIntensity: { fx: 0, fy: 0, fz: -240 },
    units: { distributedForce: 'N/m', length: 'm' },
    sourceEvidence: sourceEvidence('PROJECT-LOAD-REGISTER', '07', 'fnv1a64:6666666666666666'),
    ...overrides,
  };
}

export function equivalentStaticPrimitive(overrides = {}) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-WIND-E121',
    kind: 'EQUIVALENT_STATIC',
    elementId: 'E-000121',
    equivalentClass: 'WIND',
    direction: { x: 1, y: 0, z: 0 },
    coefficient: { value: 0.7, source: 'PROJECT-WIND-BASIS-ASCE-7-INPUT' },
    projectedArea: 0.2,
    geometryEvidence: sourceEvidence('PROJECT-SECTION-DB', '02', 'fnv1a64:5555555555555555'),
    combinationClassId: 'PROJECT-WIND-CLASS-A',
    sourceEvidence: sourceEvidence('PROJECT-LOAD-REGISTER', '07', 'fnv1a64:6666666666666666'),
    ...overrides,
  };
}

export function prescribedMovementPrimitive(overrides = {}) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-MOVEMENT-N122',
    kind: 'PRESCRIBED_MOVEMENT',
    prescribedSlotId: PRESCRIBED_SLOT_ID,
    nodeId: 'N-000122',
    dof: 'UY',
    value: -0.004,
    sourceEvidence: sourceEvidence('PROJECT-NOZZLE-MOVEMENT-SET', '02', 'fnv1a64:9999999999999999'),
    ...overrides,
  };
}

export function allPrimitives() {
  return [
    gravityPrimitive(),
    distributedWeightPrimitive(),
    pressurePrimitive(),
    temperaturePrimitive(),
    nodalForcePrimitive(),
    distributedLoadPrimitive(),
    equivalentStaticPrimitive(),
    prescribedMovementPrimitive(),
  ];
}

export function loadCaseInput(overrides = {}) {
  return {
    loadCaseId: 'LC-OPERATING-01',
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: { label: 'Operating 1', description: 'Weight, pressure, temperature and wind.' },
    modelReference: modelReference(),
    primitives: allPrimitives(),
    profile: loadCaseProfile(),
    ...overrides,
  };
}

export function weightCaseInput(reference, overrides = {}) {
  return {
    loadCaseId: 'LC-WEIGHT-01',
    loadCaseClass: 'WEIGHT',
    presentation: { label: 'Weight', description: 'Gravity on declared mass sources.' },
    modelReference: reference,
    primitives: [gravityPrimitive(), distributedWeightPrimitive()],
    profile: loadCaseProfile(),
    ...overrides,
  };
}

export function thermalCaseInput(reference, overrides = {}) {
  return {
    loadCaseId: 'LC-THERMAL-01',
    loadCaseClass: 'THERMAL',
    presentation: { label: 'Thermal 1', description: 'Uniform operating temperature.' },
    modelReference: reference,
    primitives: [temperaturePrimitive()],
    profile: loadCaseProfile(),
    ...overrides,
  };
}
