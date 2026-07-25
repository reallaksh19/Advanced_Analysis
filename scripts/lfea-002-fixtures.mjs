const SOURCE_HASH = 'lfea-source:q4-qualified-v1';
export function clone(value) { return structuredClone(value); }
export function profile(formulation = 'PLANE_STRESS', overrides = {}) {
  return {
    schema: 'lfea-profile/v1', profileIdentity: `lfea-002-${formulation.toLowerCase()}`, profileVersion: '1', formulation,
    units: { length: 'mm', force: 'N', stress: 'N/mm2' }, coordinateConvention: 'RIGHT_HANDED_X_RIGHT_Y_UP',
    dofOrder: ['UX', 'UY'], stressVectorOrder: ['SX', 'SY', 'TXY'], strainVectorOrder: ['EX', 'EY', 'GXY'], shearConvention: 'ENGINEERING_GAMMA_XY',
    elementNodeOrder: 'COUNTERCLOCKWISE_POSITIVE_SIGNED_AREA', signedAreaPolicy: 'REJECT_ZERO_NEAR_ZERO_OR_NONPOSITIVE', constraintMethod: 'PARTITION_ELIMINATION',
    reactionConvention: 'SUPPORT_FORCE_ON_STRUCTURE', pressureConvention: 'POSITIVE_COMPRESSIVE_OPPOSITE_OUTWARD_NORMAL',
    principalStressConvention: 'IN_PLANE_ATAN2_HALF_ANGLE_AND_FULL_3D_SET_FOR_PLANE_STRAIN',
    vonMisesConvention: formulation === 'PLANE_STRAIN' ? 'THREE_DIMENSIONAL_WITH_RECOVERED_SIGMA_Z' : 'PLANE_STRESS_SIGMA_Z_ZERO',
    residualDefinitions: 'ORIGINAL_ASSEMBLED_SYSTEM', energyDefinition: 'HALF_U_TRANSPOSE_K_U', identityComparator: 'UNICODE_CODE_POINT_ASCENDING',
    floatingPointEvidencePolicy: 'RAW_FINITE_IEEE754_CANONICAL_JSON_V1', backendIdentity: 'dense-ldlt-reference/v1', runtimeIdentity: 'node-es-module', outOfPlaneScale: 1,
    tolerances: { geometryArea: 1e-12, pivotAbsolute: 1e-12, pivotRatio: 1e-12, matrixSymmetryAbsolute: 1e-12, residualForceAbsolute: 1e-9, residualForceRelative: 1e-10, forceEquilibriumAbsolute: 1e-9, momentEquilibriumAbsolute: 1e-8, energyAbsolute: 1e-9 },
    referenceBackendMaxDofs: 200, limitations: ['Dense small-model reference backend only.', 'T3/Q4 linear elasticity qualification fixture only.'], ...overrides,
  };
}
export function model(parts) {
  return { schema: 'fea-continuum-model/v1', modelIdentity: parts.modelIdentity, modelVersion: '1', sourceSemanticHash: SOURCE_HASH, solverProfileIdentity: parts.solverProfile.profileIdentity, solverProfile: parts.solverProfile, nodes: parts.nodes, elements: parts.elements, materials: parts.materials || [material('MAT1', 100, 0.25)], restraints: parts.restraints || [], prescribedDisplacements: parts.prescribedDisplacements || [], loadCases: parts.loadCases || [loadCase('LC1')], sourceReferences: [{ sourceReferenceId: 'SRC-1', sourceType: 'QUALIFIED_FIXTURE', sourceVersion: '1', sourceSemanticHash: SOURCE_HASH }], limitations: ['Qualification fixture only.'] };
}
export function node(nodeId, x, y) { return { nodeId, x, y, sourceSemanticHash: SOURCE_HASH }; }
export function material(materialId, E, nu) { return { materialId, E, nu, sourceSemanticHash: SOURCE_HASH }; }
export function q4(elementId, nodeIds, materialId = 'MAT1', thickness) { const row = { elementId, type: 'Q4', nodeIds, materialId, sourceSemanticHash: SOURCE_HASH }; const resolvedThickness = arguments.length < 4 ? 1 : thickness; if (resolvedThickness !== undefined) row.thickness = resolvedThickness; return row; }
export function t3(elementId, nodeIds, materialId = 'MAT1', thickness = 1) { const row = { elementId, type: 'T3', nodeIds, materialId, sourceSemanticHash: SOURCE_HASH }; if (thickness !== undefined) row.thickness = thickness; return row; }
export function restraint(constraintId, nodeId, component) { return { constraintId, nodeId, component, sourceSemanticHash: SOURCE_HASH }; }
export function prescribed(constraintId, nodeId, component, value) { return { constraintId, nodeId, component, value, sourceSemanticHash: SOURCE_HASH }; }
export function nodalForce(loadId, nodeId, fx, fy) { return { loadId, nodeId, fx, fy, sourceSemanticHash: SOURCE_HASH }; }
export function edgeTraction(loadId, elementId, edgeNodeIds, tx, ty) { return { loadId, elementId, edgeNodeIds, type: 'TRACTION', tx, ty, sourceSemanticHash: SOURCE_HASH }; }
export function edgePressure(loadId, elementId, edgeNodeIds, pressure) { return { loadId, elementId, edgeNodeIds, type: 'PRESSURE', pressure, sourceSemanticHash: SOURCE_HASH }; }
export function loadCase(loadCaseId, nodalForces = [], edgeLoads = []) { return { loadCaseId, nodalForces, edgeLoads, sourceSemanticHash: SOURCE_HASH }; }
export function prescribedField(nodes, field) {
  return nodes.flatMap((row, index) => { const [ux, uy] = field(row.x, row.y); return [prescribed(`P${index + 1}-X`, row.nodeId, 'UX', ux), prescribed(`P${index + 1}-Y`, row.nodeId, 'UY', uy)]; });
}
export function rectangleQ4(field = (x) => [0.01 * x, 0], options = {}) {
  const nodes = options.nodes || [node('N1', 0, 0), node('N2', 2, 0), node('N3', 2, 1), node('N4', 0, 1)];
  const formulation = options.formulation || 'PLANE_STRESS'; const thickness = formulation === 'PLANE_STRESS' ? (options.thickness ?? 1) : undefined;
  return model({ modelIdentity: options.modelIdentity || 'RECT-Q4', solverProfile: profile(formulation), nodes, materials: [material('MAT1', options.E || 100, options.nu ?? 0.25)], elements: [q4('E1', ['N1','N2','N3','N4'], 'MAT1', thickness)], prescribedDisplacements: prescribedField(nodes, field) });
}
export function regularQ4Patch(field) {
  const nodes = [node('N1',0,0),node('N2',1,0),node('N3',2,0),node('N4',0,1),node('N5',1,1),node('N6',2,1)];
  return model({ modelIdentity:'REGULAR-Q4-PATCH', solverProfile:profile(), nodes, elements:[q4('E1',['N1','N2','N5','N4']),q4('E2',['N2','N3','N6','N5'])], prescribedDisplacements:prescribedField(nodes,field) });
}
export function distortedQ4Patch(field) {
  const nodes = [node('N1',0,0),node('N2',1,-0.1),node('N3',2.1,0.1),node('N4',-0.1,1),node('N5',0.9,1.15),node('N6',2,1.1)];
  return model({ modelIdentity:'DISTORTED-Q4-PATCH', solverProfile:profile(), nodes, elements:[q4('E1',['N1','N2','N5','N4']),q4('E2',['N2','N3','N6','N5'])], prescribedDisplacements:prescribedField(nodes,field) });
}
export function mixedPatch(field) {
  const nodes = [node('N1',0,0),node('N2',1,0),node('N3',2,0),node('N4',0,1),node('N5',1,1),node('N6',2,1)];
  return model({ modelIdentity:'MIXED-T3-Q4', solverProfile:profile(), nodes, elements:[q4('E1',['N1','N2','N5','N4']),t3('E2',['N2','N3','N6']),t3('E3',['N2','N6','N5'])], prescribedDisplacements:prescribedField(nodes,field) });
}
export function fixedLoadedQ4(edgeLoadValue) {
  const nodes=[node('N1',0,0),node('N2',2,0),node('N3',2,1),node('N4',0,1)];
  return model({ modelIdentity:'FIXED-Q4', solverProfile:profile(), nodes, elements:[q4('E1',['N1','N2','N3','N4'])], restraints:nodes.flatMap((row)=>[restraint(`R-${row.nodeId}-X`,row.nodeId,'UX'),restraint(`R-${row.nodeId}-Y`,row.nodeId,'UY')]), loadCases:[loadCase('LC1',[],edgeLoadValue?[edgeLoadValue]:[])] });
}
export function partiallyPrescribedQ4() {
  const nodes=[node('N1',0,0),node('N2',2,0),node('N3',2,1),node('N4',0,1)];
  return model({ modelIdentity:'PARTIAL-Q4', solverProfile:profile(), nodes, elements:[q4('E1',['N1','N2','N3','N4'])], restraints:[restraint('R1','N1','UX'),restraint('R2','N1','UY'),restraint('R3','N2','UY')], prescribedDisplacements:[prescribed('P1','N2','UX',0.02)] });
}
