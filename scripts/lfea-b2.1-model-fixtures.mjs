import {
  LINEAR_FEA_CONVENTIONS,
  LINEAR_FEA_UNITS,
  sealLinearFeaModel,
} from '../src/core/linear-fea-contract/index.js';

function clone(value) {
  return structuredClone(value);
}

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

function withConstraint(behavior, dof = 'UX', stiffness = null) {
  const model = axialModel();
  model.constraints = [{
    constraintId: `C-N120-${dof}-${behavior}`,
    nodeId: 'N-000120',
    dof,
    behavior,
    basis: 'GLOBAL',
    stiffness,
  }];
  return model;
}

function oriented3dModel() {
  const model = axialModel();
  model.nodes[1].position = { x: 1, y: 2, z: 3 };
  model.elements[0].localAxes = {
    x: [0.2672612419124244, 0.5345224838248488, 0.8017837257372732],
    y: [-0.8944271909999159, 0.4472135954999579, 0],
    z: [-0.35856858280031806, -0.7171371656006361, 0.5976143046671968],
    policyId: 'FRAME_AXIS_REFERENCE_VECTOR_V1',
    evidenceIdentity: 'AXIS-E-000120-3D',
  };
  return model;
}

function diagnosticModel(message = 'Material alias resolved from project evidence.') {
  const model = axialModel();
  model.diagnostics = [{
    severity: 'INFO',
    code: 'MATERIAL_ALIAS_RESOLVED',
    entityType: 'MATERIAL_STATE',
    entityId: 'MAT-A106B-393K',
    message,
    evidence: [{
      evidenceId: 'EVID-MATERIAL-ALIAS-01',
      sourceId: 'PROJECT-MATERIAL-DB',
      sourceRevision: '04',
      sourceSemanticHash: 'fnv1a64:4444444444444444',
    }],
    qualificationEvidenceIds: ['B21-T16'],
  }];
  return model;
}

function staleModel(hashField) {
  const model = clone(sealLinearFeaModel(axialModel()));
  model[hashField] = 'fnv1a64:0000000000000000';
  return model;
}

export const FIXTURE_BUILDERS = Object.freeze({
  'VALID-AXIAL-2NODE': () => sealLinearFeaModel(axialModel()),
  'VALID-ORIENTED-3D-ELEMENT': () => sealLinearFeaModel(oriented3dModel()),
  'VALID-FIXED-CONSTRAINT': () => sealLinearFeaModel(withConstraint('FIXED')),
  'VALID-SPRING-CONSTRAINT': () => sealLinearFeaModel(withConstraint('LINEAR_SPRING', 'UZ', 4e6)),
  'VALID-PRESCRIBED-SLOT': () => sealLinearFeaModel(withConstraint('PRESCRIBED_SLOT')),
  'VALID-DIAGNOSTIC-EVIDENCE': () => sealLinearFeaModel(diagnosticModel()),

  'INVALID-DUPLICATE-NODE': () => {
    const model = axialModel();
    model.nodes.push(clone(model.nodes[0]));
    return model;
  },
  'INVALID-NONFINITE-COORDINATE': () => {
    const model = axialModel();
    model.nodes[0].position.x = Number.NaN;
    return model;
  },
  'INVALID-ZERO-LENGTH': () => {
    const model = axialModel();
    model.nodes[1].position = clone(model.nodes[0].position);
    return model;
  },
  'INVALID-MISSING-MATERIAL': () => {
    const model = axialModel();
    model.elements[0].materialStateId = 'MAT-MISSING';
    return model;
  },
  'INVALID-MISSING-SECTION': () => {
    const model = axialModel();
    model.elements[0].sectionStateId = 'SEC-MISSING';
    return model;
  },
  'INVALID-MISSING-NODE': () => {
    const model = axialModel();
    model.elements[0].nodeJ = 'N-MISSING';
    return model;
  },
  'INVALID-NONUNIT-AXIS': () => {
    const model = axialModel();
    model.elements[0].localAxes.x = [2, 0, 0];
    return model;
  },
  'INVALID-NONORTHOGONAL-AXES': () => {
    const model = axialModel();
    model.elements[0].localAxes.y = [1, 0, 0];
    return model;
  },
  'INVALID-LEFT-HANDED-AXES': () => {
    const model = axialModel();
    model.elements[0].localAxes.z = [0, 1, 0];
    return model;
  },
  'INVALID-DUPLICATE-CONSTRAINT': () => {
    const model = withConstraint('FIXED');
    model.constraints.push({
      constraintId: 'C-N120-UX-PRESCRIBED',
      nodeId: 'N-000120',
      dof: 'UX',
      behavior: 'PRESCRIBED_SLOT',
      basis: 'GLOBAL',
      stiffness: null,
    });
    return model;
  },
  'INVALID-PRESCRIBED-VALUE-IN-MODEL': () => {
    const model = withConstraint('PRESCRIBED_SLOT');
    model.constraints[0].prescribedValue = 0.003;
    return model;
  },
  'INVALID-NONLINEAR-BEHAVIOR': () => {
    const model = withConstraint('FIXED');
    model.constraints[0].behavior = 'GAP';
    return model;
  },
  'INVALID-STALE-STIFFNESS-HASH': () => staleModel('stiffnessStateHash'),
  'INVALID-STALE-SEMANTIC-HASH': () => staleModel('semanticHash'),
  'INVALID-STALE-EVIDENCE-HASH': () => staleModel('evidenceHash'),
});

export const FIXTURE_NAMES = Object.freeze(Object.keys(FIXTURE_BUILDERS));

export function fixtureByName(name) {
  const builder = FIXTURE_BUILDERS[name];
  if (!builder) throw new Error(`Unknown B-2.1 fixture ${name}.`);
  return builder();
}

export { clone, diagnosticModel, oriented3dModel, withConstraint };
