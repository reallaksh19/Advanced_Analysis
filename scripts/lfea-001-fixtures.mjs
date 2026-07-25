const SOURCE_HASH = 'lfea-source:qualified-v1';

export function clone(value) { return structuredClone(value); }

export function profile(formulation = 'PLANE_STRESS', overrides = {}) {
  const vonMisesConvention = formulation === 'PLANE_STRAIN'
    ? 'THREE_DIMENSIONAL_WITH_RECOVERED_SIGMA_Z' : 'PLANE_STRESS_SIGMA_Z_ZERO';
  return {
    schema: 'lfea-profile/v1',
    profileIdentity: `lfea-qualified-${formulation.toLowerCase()}`,
    profileVersion: '1',
    formulation,
    units: { length: 'mm', force: 'N', stress: 'N/mm2' },
    coordinateConvention: 'RIGHT_HANDED_X_RIGHT_Y_UP',
    dofOrder: ['UX', 'UY'],
    stressVectorOrder: ['SX', 'SY', 'TXY'],
    strainVectorOrder: ['EX', 'EY', 'GXY'],
    shearConvention: 'ENGINEERING_GAMMA_XY',
    elementNodeOrder: 'COUNTERCLOCKWISE_POSITIVE_SIGNED_AREA',
    signedAreaPolicy: 'REJECT_ZERO_NEAR_ZERO_OR_NONPOSITIVE',
    constraintMethod: 'PARTITION_ELIMINATION',
    reactionConvention: 'SUPPORT_FORCE_ON_STRUCTURE',
    pressureConvention: 'POSITIVE_COMPRESSIVE_OPPOSITE_OUTWARD_NORMAL',
    principalStressConvention: 'IN_PLANE_ATAN2_HALF_ANGLE_AND_FULL_3D_SET_FOR_PLANE_STRAIN',
    vonMisesConvention,
    residualDefinitions: 'ORIGINAL_ASSEMBLED_SYSTEM',
    energyDefinition: 'HALF_U_TRANSPOSE_K_U',
    identityComparator: 'UNICODE_CODE_POINT_ASCENDING',
    floatingPointEvidencePolicy: 'RAW_FINITE_IEEE754_CANONICAL_JSON_V1',
    backendIdentity: 'dense-ldlt-reference/v1',
    runtimeIdentity: 'node-es-module',
    outOfPlaneScale: 1,
    tolerances: fixtureTolerances(),
    referenceBackendMaxDofs: 100,
    limitations: ['Dense small-model reference backend only.', 'T3 linear elasticity only.'],
    ...overrides,
  };
}
function fixtureTolerances() {
  return {
    geometryArea: 1e-12,
    pivotAbsolute: 1e-12,
    pivotRatio: 1e-12,
    matrixSymmetryAbsolute: 1e-12,
    residualForceAbsolute: 1e-9,
    residualForceRelative: 1e-10,
    forceEquilibriumAbsolute: 1e-9,
    momentEquilibriumAbsolute: 1e-8,
    energyAbsolute: 1e-9,
  };
}

export function handCheckModel() {
  const solverProfile = profile('PLANE_STRESS');
  return model({
    modelIdentity: 'HAND-T3',
    solverProfile,
    nodes: [node('N1', 0, 0), node('N2', 100, 0), node('N3', 0, 100)],
    materials: [material('MAT1', 15, 0.25)],
    elements: [element('E1', ['N1', 'N2', 'N3'], 'MAT1', 2)],
    restraints: [],
    prescribedDisplacements: prescribedField([
      node('N1', 0, 0), node('N2', 100, 0), node('N3', 0, 100),
    ], (x) => [0.01 * x, 0]),
    loadCases: [loadCase('LC1')],
  });
}

export function prescribedFieldModel(field, options = {}) {
  const formulation = options.formulation || 'PLANE_STRESS';
  const solverProfile = profile(formulation, options.profileOverrides);
  const nodes = options.nodes || [node('N1', 0, 0), node('N2', 1, 0), node('N3', 0, 1)];
  const thickness = formulation === 'PLANE_STRESS' ? 1 : undefined;
  const elements = options.elements || [element('E1', ['N1', 'N2', 'N3'], 'MAT1', thickness)];
  return model({
    modelIdentity: options.modelIdentity || 'FIELD-T3',
    solverProfile,
    nodes,
    materials: [material('MAT1', options.E || 100, options.nu ?? 0.25)],
    elements,
    restraints: [],
    prescribedDisplacements: prescribedField(nodes, field),
    loadCases: [loadCase('LC1')],
  });
}

export function squarePatch(field) {
  const nodes = [node('N1', 0, 0), node('N2', 1, 0), node('N3', 1, 1), node('N4', 0, 1)];
  return prescribedFieldModel(field, {
    modelIdentity: 'PATCH-T3',
    nodes,
    elements: [element('E1', ['N1', 'N2', 'N3'], 'MAT1', 1), element('E2', ['N1', 'N3', 'N4'], 'MAT1', 1)],
  });
}

export function partiallyPrescribedModel() {
  const solverProfile = profile('PLANE_STRESS');
  return model({
    modelIdentity: 'PRESCRIBED-PARTITION',
    solverProfile,
    nodes: [node('N1', 0, 0), node('N2', 1, 0), node('N3', 0, 1)],
    materials: [material('MAT1', 100, 0.25)],
    elements: [element('E1', ['N1', 'N2', 'N3'], 'MAT1', 1)],
    restraints: [restraint('R1', 'N1', 'UX'), restraint('R2', 'N1', 'UY'), restraint('R3', 'N2', 'UY')],
    prescribedDisplacements: [prescribed('P1', 'N2', 'UX', 0.01)],
    loadCases: [loadCase('LC1')],
  });
}

export function fixedLoadedModel(edgeLoadValue, nodalForces = []) {
  const solverProfile = profile('PLANE_STRESS');
  const nodes = [node('N1', 0, 0), node('N2', 1, 0), node('N3', 0, 1)];
  return model({
    modelIdentity: 'FIXED-LOADED',
    solverProfile,
    nodes,
    materials: [material('MAT1', 100, 0.25)],
    elements: [element('E1', ['N1', 'N2', 'N3'], 'MAT1', 1)],
    restraints: nodes.flatMap((row) => [restraint(`R-${row.nodeId}-X`, row.nodeId, 'UX'), restraint(`R-${row.nodeId}-Y`, row.nodeId, 'UY')]),
    prescribedDisplacements: [],
    loadCases: [loadCase('LC1', nodalForces, edgeLoadValue ? [edgeLoadValue] : [])],
  });
}

export function unrestrainedModel() {
  const value = handCheckModel();
  value.restraints = [];
  value.prescribedDisplacements = [];
  value.loadCases = [loadCase('LC1', [nodalForce('F1', 'N2', 1, 0)])];
  return value;
}

export function model(parts) {
  return {
    schema: 'fea-continuum-model/v1',
    modelIdentity: parts.modelIdentity,
    modelVersion: '1',
    sourceSemanticHash: SOURCE_HASH,
    solverProfileIdentity: parts.solverProfile.profileIdentity,
    solverProfile: parts.solverProfile,
    nodes: parts.nodes,
    elements: parts.elements,
    materials: parts.materials,
    restraints: parts.restraints,
    prescribedDisplacements: parts.prescribedDisplacements,
    loadCases: parts.loadCases,
    sourceReferences: [{ sourceReferenceId: 'SRC-1', sourceType: 'QUALIFIED_FIXTURE', sourceVersion: '1', sourceSemanticHash: SOURCE_HASH }],
    limitations: ['Qualification fixture only.'],
  };
}
export function node(nodeId, x, y) { return { nodeId, x, y, sourceSemanticHash: SOURCE_HASH }; }
export function material(materialId, E, nu) { return { materialId, E, nu, sourceSemanticHash: SOURCE_HASH }; }
export function element(elementId, nodeIds, materialId, thickness) {
  const row = { elementId, type: 'T3', nodeIds, materialId, sourceSemanticHash: SOURCE_HASH };
  if (thickness !== undefined) row.thickness = thickness;
  return row;
}
export function restraint(constraintId, nodeId, component) { return { constraintId, nodeId, component, sourceSemanticHash: SOURCE_HASH }; }
export function prescribed(constraintId, nodeId, component, value) { return { constraintId, nodeId, component, value, sourceSemanticHash: SOURCE_HASH }; }
export function nodalForce(loadId, nodeId, fx, fy) { return { loadId, nodeId, fx, fy, sourceSemanticHash: SOURCE_HASH }; }
export function edgeTraction(loadId, elementId, edgeNodeIds, tx, ty) { return { loadId, elementId, edgeNodeIds, type: 'TRACTION', tx, ty, sourceSemanticHash: SOURCE_HASH }; }
export function edgePressure(loadId, elementId, edgeNodeIds, pressure) { return { loadId, elementId, edgeNodeIds, type: 'PRESSURE', pressure, sourceSemanticHash: SOURCE_HASH }; }
export function loadCase(loadCaseId, nodalForces = [], edgeLoads = []) { return { loadCaseId, nodalForces, edgeLoads, sourceSemanticHash: SOURCE_HASH }; }
function prescribedField(nodes, field) {
  return nodes.flatMap((row, index) => {
    const [ux, uy] = field(row.x, row.y);
    return [prescribed(`P${index + 1}-X`, row.nodeId, 'UX', ux), prescribed(`P${index + 1}-Y`, row.nodeId, 'UY', uy)];
  });
}
