import {
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_REQUEST_SCHEMA,
  computePipeSectionRequestSemanticHash,
  resolvePipeSection,
} from '../src/core/linear-fea-section/index.js';
import { FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import { DOF_ORDER } from '../src/core/linear-fea-contract/conventions.js';
import {
  compilePipingComponent,
  sealComponentFactorSet,
  sealPipingComponentProfile,
} from '../src/core/linear-fea-piping-components/index.js';
import { materialResolution, sectionResolution } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { eulerBernoulliProfile, timoshenkoProfile } from './lfea-b3.1-frame-element-fixtures.mjs';

export {
  materialResolution,
  sectionResolution,
  eulerBernoulliProfile,
  timoshenkoProfile,
  FRAME_LOCAL_AXIS_PROFILE,
  DOF_ORDER,
};

export function clone(value) {
  return structuredClone(value);
}

/** A second circular section so the reducer has two genuinely different ends. */
export function reducedSectionResolution(sectionStateId = 'SEC-NPS4-SCH40') {
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId,
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter: 0.1143,
    wallThickness: 0.006,
    sourceEvidence: {
      sourceId: 'PROJECT-SECTION-DB',
      sourceRevision: '02',
      sourceSemanticHash: 'fnv1a64:5555555555555555',
    },
  };
  const request = { ...payload, semanticHash: computePipeSectionRequestSemanticHash(payload) };
  return resolvePipeSection({ request, profile: PIPE_SECTION_PROFILE });
}

const SOURCE = 'LFEA-B3.2-FIXTURE-PROFILE';

export function componentProfile(overrides = {}) {
  return sealPipingComponentProfile({
    schema: 'fea-linear-piping-component-profile/v1',
    profileId: 'LINEAR-PIPING-COMPONENT-R1',
    bendFormulation: 'PIPE_BEND_CORRECTED_FRAME_V1',
    bendSubdivisionPurpose: 'STRESS_RECOVERY_V1',
    bendPressureStiffeningRule: 'BEND_PRESSURE_STIFFENING_EXCLUDED_V1',
    convergenceRequired: true,
    reducerRule: 'REDUCER_STEPPED_SECTION_V1',
    valveBodyRule: 'VALVE_RIGID_BODY_V1',
    weightLumpRule: 'FINITE_LENGTH_BODY_REQUIRED_V1',
    branchFlexibilityMethod: 'BRANCH_JUNCTION_ROTATIONAL_FLEXIBILITY_V1',
    branchClassificationRule: 'DIRECTION_VECTOR_TOPOLOGY_V1',
    supportOffsetRule: 'RIGID_OFFSET_KINEMATIC_V1',
    outsideApplicabilityRule: 'BLOCK',
    bendMaxAngleDegrees: { value: 5, source: SOURCE },
    bendMinimumElements: { value: 4, source: SOURCE },
    bendMinimumElementsBetweenStations: { value: 2, source: SOURCE },
    bendRadiusRelativeTolerance: { value: 1e-9, source: SOURCE },
    bendConvergenceRefinementFactor: { value: 4, source: SOURCE },
    convergenceRelativeTolerance: { value: 1e-2, source: SOURCE },
    flexibilityDoubleCountTolerance: { value: 1e-9, source: SOURCE },
    runCollinearityTolerance: { value: 1e-9, source: SOURCE },
    rigidBodyStiffnessMultiplier: { value: 1000, source: SOURCE },
    semanticHash: '',
    ...overrides,
  });
}

export function bendFactorSet(overrides = {}) {
  return sealComponentFactorSet({
    schema: 'fea-linear-component-factor-set/v1',
    factorSetId: 'FS-BEND-001',
    componentType: 'BEND',
    sourceIdentity: {
      standard: 'ASME_B31J_2023',
      edition: '2023',
      ruleId: 'TABLE-1-1-BEND',
      sourceRevision: '01',
      sourceSemanticHash: 'fnv1a64:6666666666666666',
    },
    applicability: {
      status: 'WITHIN_RANGE',
      ruleId: 'TABLE-1-1-APPLICABILITY',
      evaluatedBy: 'PROJECT-B31J-FACTOR-DATASET',
    },
    flexibilityFactor: { value: 4.5, source: 'PROJECT-B31J-FACTOR-DATASET' },
    flexibilityGeometryBasis: 'ARC_GEOMETRY_EXCLUDED_V1',
    directionalFlexibilityFactors: null,
    pressureCorrectionApplied: false,
    pressureBasis: null,
    userOverride: null,
    semanticHash: '',
    ...overrides,
  });
}

export function branchFactorSet(overrides = {}) {
  return sealComponentFactorSet({
    schema: 'fea-linear-component-factor-set/v1',
    factorSetId: 'FS-TEE-001',
    componentType: 'BRANCH_JUNCTION',
    sourceIdentity: {
      standard: 'ASME_B31J_2023',
      edition: '2023',
      ruleId: 'TABLE-1-1-TEE',
      sourceRevision: '01',
      sourceSemanticHash: 'fnv1a64:7777777777777777',
    },
    applicability: {
      status: 'WITHIN_RANGE',
      ruleId: 'TABLE-1-1-APPLICABILITY',
      evaluatedBy: 'PROJECT-B31J-FACTOR-DATASET',
    },
    flexibilityFactor: { value: 2.25, source: 'PROJECT-B31J-FACTOR-DATASET' },
    flexibilityGeometryBasis: 'JUNCTION_GEOMETRY_EXCLUDED_V1',
    directionalFlexibilityFactors: null,
    pressureCorrectionApplied: false,
    pressureBasis: null,
    userOverride: null,
    semanticHash: '',
    ...overrides,
  });
}

/** BEND-01: a 90-degree long-radius elbow turning from global +X to global +Y. */
export const BEND_RADIUS = 0.25;

export function bendInput(overrides = {}) {
  return {
    componentId: 'BEND-001',
    componentType: 'BEND',
    profile: overrides.profile ?? componentProfile(),
    arc: overrides.arc ?? {
      tangentStart: [0, 0, 0],
      tangentEnd: [BEND_RADIUS, BEND_RADIUS, 0],
      incomingDirection: [1, 0, 0],
      declaredRadius: BEND_RADIUS,
    },
    material: overrides.material ?? materialResolution(),
    section: overrides.section ?? sectionResolution(),
    frameElementProfile: overrides.frameElementProfile ?? eulerBernoulliProfile(),
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    referenceVector: overrides.referenceVector ?? null,
    factorSet: overrides.factorSet === undefined ? bendFactorSet() : overrides.factorSet,
  };
}

export function compileFixtureBend(overrides = {}) {
  return compilePipingComponent(bendInput(overrides));
}

/** BRANCH-01: a tee whose run is the X axis and whose branch leaves along +Z. */
export function branchInput(overrides = {}) {
  return {
    componentId: 'TEE-001',
    componentType: 'BRANCH_JUNCTION',
    profile: overrides.profile ?? componentProfile(),
    junctionId: overrides.junctionId ?? 'J-001',
    junctionPosition: overrides.junctionPosition ?? [0, 0, 0],
    legs: overrides.legs ?? [
      { legId: 'LEG-RUN-A', endPoint: [0.5, 0, 0], material: materialResolution(), section: sectionResolution() },
      { legId: 'LEG-RUN-B', endPoint: [-0.5, 0, 0], material: materialResolution(), section: sectionResolution() },
      { legId: 'LEG-BRANCH', endPoint: [0, 0, 0.4], material: materialResolution(), section: reducedSectionResolution() },
    ],
    frameElementProfile: overrides.frameElementProfile ?? eulerBernoulliProfile(),
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    referenceVector: overrides.referenceVector ?? [0, 1, 0],
    factorSet: overrides.factorSet === undefined ? branchFactorSet() : overrides.factorSet,
    nominalDiameters: overrides.nominalDiameters ?? null,
  };
}

export function compileFixtureBranch(overrides = {}) {
  return compilePipingComponent(branchInput(overrides));
}

export function reducerInput(overrides = {}) {
  return {
    componentId: 'RED-001',
    componentType: 'REDUCER',
    profile: overrides.profile ?? componentProfile(),
    start: overrides.start ?? [0, 0, 0],
    end: overrides.end ?? [0.4, 0, 0],
    material: materialResolution(),
    stations: overrides.stations ?? [
      { fraction: 0, section: sectionResolution() },
      { fraction: 0.5, section: reducedSectionResolution() },
    ],
    frameElementProfile: overrides.frameElementProfile ?? eulerBernoulliProfile(),
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    referenceVector: overrides.referenceVector ?? [0, 0, 1],
  };
}

export function valveInput(overrides = {}) {
  return {
    componentId: 'VLV-001',
    componentType: 'VALVE_FLANGE',
    profile: overrides.profile ?? componentProfile(),
    start: overrides.start ?? [0, 0, 0],
    end: overrides.end ?? [0.36, 0, 0],
    material: materialResolution(),
    section: sectionResolution(),
    massProperties: overrides.massProperties ?? {
      mass: { value: 145, source: 'PROJECT-VALVE-DATASHEET' },
      centreOfGravity: [0.18, 0.05, 0],
    },
    endConnections: overrides.endConnections ?? {
      I: { portId: 'VLV-001-P1', connectionType: 'FLANGED' },
      J: { portId: 'VLV-001-P2', connectionType: 'FLANGED' },
    },
    bodyStiffnessMultiplier: overrides.bodyStiffnessMultiplier ?? null,
    frameElementProfile: overrides.frameElementProfile ?? eulerBernoulliProfile(),
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    referenceVector: overrides.referenceVector ?? [0, 0, 1],
  };
}

export function rigidLinkInput(overrides = {}) {
  return {
    componentId: 'RGD-001',
    componentType: 'RIGID_LINK',
    profile: overrides.profile ?? componentProfile(),
    masterNodeId: overrides.masterNodeId ?? 'N-001000',
    slaveNodeId: overrides.slaveNodeId ?? 'N-001001',
    offset: overrides.offset ?? [0, 0, 0.45],
    coupledDofs: overrides.coupledDofs ?? [...DOF_ORDER],
  };
}

export function supportOffsetInput(overrides = {}) {
  return {
    componentId: 'SOF-001',
    componentType: 'SUPPORT_OFFSET',
    profile: overrides.profile ?? componentProfile(),
    centerlineNodeId: overrides.centerlineNodeId ?? 'N-002000',
    supportNodeId: overrides.supportNodeId ?? 'N-002001',
    centerlinePosition: overrides.centerlinePosition ?? [1.5, 0, 0],
    supportPointPosition: overrides.supportPointPosition ?? [1.5, 0, -0.4],
    relocateCenterline: overrides.relocateCenterline ?? false,
    material: overrides.material ?? null,
    section: overrides.section ?? null,
    frameElementProfile: overrides.frameElementProfile ?? eulerBernoulliProfile(),
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    referenceVector: overrides.referenceVector ?? [1, 0, 0],
  };
}

export function matrixAt(flat, row, column) {
  return flat[row * 12 + column];
}

export function maxAbs(values) {
  return values.reduce((best, value) => Math.max(best, Math.abs(value)), 0);
}
