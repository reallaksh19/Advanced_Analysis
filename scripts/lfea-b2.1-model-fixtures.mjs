import {
  LINEAR_FEA_CONVENTIONS,
  LINEAR_FEA_UNITS,
} from '../src/core/linear-fea-contract/index.js';

export function axialModel(overrides = {}) {
  return {
    schema: 'fea-linear-model/v1',
    modelIdentity: 'SYS-03-MECH-01',
    modelRevision: 1,
    units: LINEAR_FEA_UNITS,
    conventions: LINEAR_FEA_CONVENTIONS,
    ancestry: {
      sourceSemanticHash: 'fnv1a64:1111111111111111',
      conditionedGeometrySemanticHash: 'fnv1a64:2222222222222222',
      compilerProfileSemanticHash: 'fnv1a64:3333333333333333',
    },
    formulationRegistryVersion: 'PIPE-LINEAR-R1',
    validationProfile: {
      profileId: 'LINEAR-MODEL-VALIDATION-R1',
      zeroLengthTolerance: 1e-10,
      unitVectorTolerance: 1e-12,
      orthogonalityTolerance: 1e-12,
      handednessTolerance: 1e-12,
      semanticHash: '',
    },
    nodes: [
      {
        nodeId: 'N-000120',
        position: { x: 0, y: 0, z: 0 },
        sourceAncestry: {
          conditionedNodeId: 'CN-120',
          sourceNodeIds: ['120'],
          sourceComponentIds: ['PIPINGELEMENT-14'],
          creationBasis: 'SOURCE_ENDPOINT',
        },
      },
      {
        nodeId: 'N-000121',
        position: { x: 1.2, y: 0, z: 0 },
        sourceAncestry: {
          conditionedNodeId: 'CN-121',
          sourceNodeIds: ['121'],
          sourceComponentIds: ['PIPINGELEMENT-14'],
          creationBasis: 'SOURCE_ENDPOINT',
        },
      },
    ],
    materialStates: [{
      materialStateId: 'MAT-A106B-393K',
      materialId: 'CS_A106B',
      elasticModulus: 1.94e11,
      shearModulus: 7.46e10,
      poissonRatio: 0.30,
      massDensity: 7850,
      thermalExpansionCoefficient: 1.2e-5,
      evaluationTemperature: 393.15,
      sourceEvidence: [{
        sourceId: 'PROJECT-MATERIAL-DB',
        sourceRevision: '04',
        sourceSemanticHash: 'fnv1a64:4444444444444444',
      }],
    }],
    sectionStates: [{
      sectionStateId: 'SEC-NPS6-SCH40',
      area: 0.00548,
      secondMomentY: 1.71e-5,
      secondMomentZ: 1.71e-5,
      polarMoment: 3.42e-5,
      sourceEvidence: [{
        sourceId: 'PIPE-SECTION-COMPILER',
        sourceSemanticHash: 'fnv1a64:5555555555555555',
      }],
    }],
    elements: [{
      elementId: 'E-000120',
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      nodeI: 'N-000120',
      nodeJ: 'N-000121',
      materialStateId: 'MAT-A106B-393K',
      sectionStateId: 'SEC-NPS6-SCH40',
      localAxes: {
        x: [1, 0, 0],
        y: [0, 0, 1],
        z: [0, -1, 0],
        policyId: 'FRAME_AXIS_REFERENCE_VECTOR_V1',
        evidenceIdentity: 'AXIS-E-000120',
      },
      sourceAncestry: {
        conditionedSegmentId: 'SEG-000121',
        sourceComponentId: 'PIPINGELEMENT-14',
      },
    }],
    constraints: [],
    limitations: [],
    diagnostics: [],
    stiffnessStateHash: '',
    semanticHash: '',
    evidenceHash: '',
    ...overrides,
  };
}

export const INITIAL_FIXTURES = Object.freeze([
  'VALID-AXIAL-2NODE',
  'VALID-ORIENTED-3D-ELEMENT',
  'VALID-FIXED-CONSTRAINT',
  'VALID-SPRING-CONSTRAINT',
  'VALID-PRESCRIBED-SLOT',
]);
