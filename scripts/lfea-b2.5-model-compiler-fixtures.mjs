import { sealMaterialTable, resolveLinearFeaMaterialState, LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE } from '../src/core/linear-fea-material/index.js';
import { resolvePipeSection, PIPE_SECTION_PROFILE, PIPE_SECTION_FORMULATION_ID, PIPE_SECTION_REQUEST_SCHEMA, computePipeSectionRequestSemanticHash } from '../src/core/linear-fea-section/index.js';
import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../src/core/centerline-beam-fea/index.js';
import { sealMechanicalModelCompilerProfile } from '../src/core/linear-fea-model-compiler/index.js';

export function clone(value) {
  return structuredClone(value);
}

export const FIXTURE_SOURCE_HASH = 'fnv1a64:1111111111111111';

export function compilerProfile(overrides = {}) {
  return sealMechanicalModelCompilerProfile({
    schema: 'fea-linear-model-compiler-profile/v1',
    profileId: 'LINEAR-MODEL-COMPILER-R1',
    spanBindingRule: 'EXACTLY_ONE_BINDING_PER_SPAN_V1',
    zeroLengthLinkRule: 'ZERO_LENGTH_LINK_PROHIBITED_V1',
    constraintConflictRule: 'CONFLICTING_DEFINITION_BLOCKS_COMPILATION_V1',
    unrepresentableFeatureRule: 'UNREPRESENTABLE_FEATURE_BLOCKS_COMPILATION_V1',
    minimumElementLength: { value: 1e-8, source: 'LFEA-B2.5-FIXTURE-PROFILE' },
    spanDirectionTolerance: { value: 1e-9, source: 'LFEA-B2.5-FIXTURE-PROFILE' },
    semanticHash: '',
    ...overrides,
  });
}

export function materialResolution(materialStateId = 'MAT-A106B-393K') {
  const table = sealMaterialTable({
    schema: 'fea-linear-material-table/v1',
    materialId: 'CS_A106B',
    sourceEvidence: {
      sourceId: 'PROJECT-MATERIAL-DB',
      sourceRevision: '04',
      sourceSemanticHash: 'fnv1a64:4444444444444444',
    },
    points: [
      {
        absoluteTemperature: 293.15,
        elasticModulus: 2.0e11,
        shearModulus: 7.69e10,
        poissonRatio: 0.3,
        massDensity: 7850,
        thermalExpansionCoefficient: 1.17e-5,
      },
      {
        absoluteTemperature: 393.15,
        elasticModulus: 1.94e11,
        shearModulus: 7.46e10,
        poissonRatio: 0.3,
        massDensity: 7850,
        thermalExpansionCoefficient: 1.2e-5,
      },
    ],
    semanticHash: '',
  });
  return resolveLinearFeaMaterialState({
    table,
    request: { materialStateId, materialId: 'CS_A106B', evaluationTemperature: 393.15 },
    profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  });
}

export function sectionResolution(sectionStateId = 'SEC-NPS6-SCH40') {
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId,
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter: 0.1683,
    wallThickness: 0.00711,
    sourceEvidence: {
      sourceId: 'PROJECT-SECTION-DB',
      sourceRevision: '02',
      sourceSemanticHash: 'fnv1a64:5555555555555555',
    },
  };
  const request = { ...payload, semanticHash: computePipeSectionRequestSemanticHash(payload) };
  return resolvePipeSection({ request, profile: PIPE_SECTION_PROFILE });
}

export function axisResult(nodeI, nodeJ, referenceVector = [0, 0, 1]) {
  return resolveFrameLocalAxes({
    nodeI,
    nodeJ,
    referenceVector,
    profile: FRAME_LOCAL_AXIS_PROFILE,
  });
}

/**
 * Two straight metre-unit spans with one seeded intermediate node, shaped
 * exactly as `conditionGeometry` returns its result.
 */
export function conditionedTopology() {
  return {
    geometry: {
      schemaVersion: 'canonical-geometry-v1',
      nodes: [
        { id: 'S1/N1', x: 0, y: 0, z: 0, restraint: 'ANCHOR', sourceComponentUid: 'PIPINGELEMENT-14', meta: {} },
        { id: 'S1/N2', x: 1.2, y: 0, z: 0, restraint: 'FREE', sourceComponentUid: 'PIPINGELEMENT-14', meta: { spanSeeded: true } },
        { id: 'S1/N3', x: 2.4, y: 0, z: 0, restraint: 'FREE', sourceComponentUid: 'PIPINGELEMENT-14', meta: {} },
      ],
      segments: [
        { id: 'S1/A', startNodeId: 'S1/N1', endNodeId: 'S1/N2', type: 'PIPE' },
        { id: 'S1/B', startNodeId: 'S1/N2', endNodeId: 'S1/N3', type: 'PIPE' },
      ],
      source: 'fixture',
      unit: 'm',
      diagnostics: [],
      summary: {},
    },
    semanticHash: 'fnv1a64:2222222222222222',
  };
}

export function nodeBindings() {
  return [
    { nodeId: 'N-000120', conditionedNodeId: 'CN-000120', topologyNodeId: 'S1/N1' },
    { nodeId: 'N-000121', conditionedNodeId: 'CN-000121', topologyNodeId: 'S1/N2' },
    { nodeId: 'N-000122', conditionedNodeId: 'CN-000122', topologyNodeId: 'S1/N3' },
  ];
}

export function elementBindings() {
  return [
    {
      elementId: 'E-000120',
      conditionedSegmentId: 'CS-000120',
      topologySegmentId: 'S1/A',
      materialStateId: 'MAT-A106B-393K',
      sectionStateId: 'SEC-NPS6-SCH40',
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: 'AXIS-E-000120',
      sourceComponentId: 'PIPINGELEMENT-14',
    },
    {
      elementId: 'E-000121',
      conditionedSegmentId: 'CS-000121',
      topologySegmentId: 'S1/B',
      materialStateId: 'MAT-A106B-393K',
      sectionStateId: 'SEC-NPS6-SCH40',
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: 'AXIS-E-000121',
      sourceComponentId: 'PIPINGELEMENT-14',
    },
  ];
}

export function localAxisResults() {
  return [
    { evidenceIdentity: 'AXIS-E-000120', result: axisResult([0, 0, 0], [1.2, 0, 0]) },
    { evidenceIdentity: 'AXIS-E-000121', result: axisResult([1.2, 0, 0], [2.4, 0, 0]) },
  ];
}

export function constraintDeclarations() {
  return [
    {
      declarationId: 'C-N120-UX',
      kind: 'NODAL_RESTRAINT',
      nodeId: 'N-000120',
      dof: 'UX',
      behavior: 'FIXED',
    },
    {
      declarationId: 'C-N122-UZ',
      kind: 'PARTIAL_RELEASE_SPRING',
      nodeId: 'N-000122',
      dof: 'UZ',
      stiffness: 4e6,
    },
  ];
}

export function compilerInput(overrides = {}) {
  return {
    modelIdentity: 'SYS-03-MECH-01',
    modelRevision: 1,
    sourceSemanticHash: FIXTURE_SOURCE_HASH,
    conditionedTopology: conditionedTopology(),
    nodeBindings: nodeBindings(),
    elementBindings: elementBindings(),
    materialResolutions: [materialResolution()],
    sectionResolutions: [sectionResolution()],
    localAxisResults: localAxisResults(),
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: constraintDeclarations(),
    profile: compilerProfile(),
    ...overrides,
  };
}
