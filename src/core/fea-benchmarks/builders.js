/**
 * Deterministic builders for FEA verification models and mesh packages.
 *
 * These construct qualified `fea-continuum-model/v1` and `lfea-mesh-package/v1`
 * documents for benchmark cases. No Math.random, no Date.now, no hidden values:
 * every coordinate, material property and load is an explicit literal or an
 * explicit closed-form function of the case parameters.
 */
import { semanticHash } from '../shared-piping-model/canonical-json.js';

export const BENCHMARK_SOURCE_HASH = 'fea-benchmark-source:v1';

/* ------------------------------------------------------------------ */
/* Solver profiles                                                     */
/* ------------------------------------------------------------------ */

/**
 * Dense reference solver profile.
 *
 * @param {string} formulation PLANE_STRESS or PLANE_STRAIN.
 * @param {Record<string, unknown>} overrides Explicit overrides.
 * @returns {Record<string, unknown>} lfea-profile/v1 document.
 */
export function denseProfile(formulation = 'PLANE_STRESS', overrides = {}) {
  return {
    ...commonProfile(formulation),
    schema: 'lfea-profile/v1',
    backendIdentity: 'dense-ldlt-reference/v1',
    referenceBackendMaxDofs: 4000,
    ...overrides,
  };
}

/**
 * Sparse PCG solver profile.
 *
 * @param {string} formulation PLANE_STRESS or PLANE_STRAIN.
 * @param {Record<string, unknown>} overrides Explicit overrides.
 * @returns {Record<string, unknown>} lfea-profile/v2 document.
 */
export function sparseProfile(formulation = 'PLANE_STRESS', overrides = {}) {
  return {
    ...commonProfile(formulation),
    schema: 'lfea-profile/v2',
    linearBackend: 'SPARSE_PCG_V1',
    preconditioner: 'JACOBI_PRECONDITIONER_V1',
    // These MUST be reachable by the iterative solver AND tight enough for the
    // solver's own qualification gate (profile.tolerances.residualForce*).
    // See benchmark case BM-T3-TOLERANCE-COUPLING: the profile contract does
    // not couple them, so an unsatisfiable configuration is expressible.
    absoluteResidualTolerance: 1e-7,
    relativeResidualTolerance: 1e-11,
    maximumIterations: 200000,
    maximumDofs: 200000,
    maximumNonzeros: 20000000,
    maximumEstimatedStorageBytes: 400000000,
    ...overrides,
  };
}

function commonProfile(formulation) {
  return {
    profileIdentity: `fea-benchmark-${formulation.toLowerCase()}`,
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
    vonMisesConvention: formulation === 'PLANE_STRAIN'
      ? 'THREE_DIMENSIONAL_WITH_RECOVERED_SIGMA_Z'
      : 'PLANE_STRESS_SIGMA_Z_ZERO',
    residualDefinitions: 'ORIGINAL_ASSEMBLED_SYSTEM',
    energyDefinition: 'HALF_U_TRANSPOSE_K_U',
    identityComparator: 'UNICODE_CODE_POINT_ASCENDING',
    floatingPointEvidencePolicy: 'RAW_FINITE_IEEE754_CANONICAL_JSON_V1',
    runtimeIdentity: 'fea-benchmark-harness',
    outOfPlaneScale: 1,
    tolerances: {
      geometryArea: 1e-12,
      pivotAbsolute: 1e-14,
      pivotRatio: 1e-16,
      matrixSymmetryAbsolute: 1e-9,
      residualForceAbsolute: 1e-5,
      residualForceRelative: 1e-7,
      forceEquilibriumAbsolute: 1e-4,
      momentEquilibriumAbsolute: 1e-2,
      energyAbsolute: 1e-4,
    },
    limitations: ['Benchmark verification profile.'],
  };
}

/* ------------------------------------------------------------------ */
/* fea-continuum-model/v1 primitives                                   */
/* ------------------------------------------------------------------ */

export function mNode(nodeId, x, y) {
  return { nodeId, x, y, sourceSemanticHash: BENCHMARK_SOURCE_HASH };
}

export function mMaterial(materialId, E, nu) {
  return { materialId, E, nu, sourceSemanticHash: BENCHMARK_SOURCE_HASH };
}

export function mElement(elementId, type, nodeIds, materialId, thickness) {
  const row = { elementId, type, nodeIds, materialId, sourceSemanticHash: BENCHMARK_SOURCE_HASH };
  if (thickness !== undefined) row.thickness = thickness;
  return row;
}

export function mRestraint(constraintId, nodeId, component) {
  return { constraintId, nodeId, component, sourceSemanticHash: BENCHMARK_SOURCE_HASH };
}

export function mPrescribed(constraintId, nodeId, component, value) {
  return { constraintId, nodeId, component, value, sourceSemanticHash: BENCHMARK_SOURCE_HASH };
}

export function mNodalForce(loadId, nodeId, fx, fy) {
  return { loadId, nodeId, fx, fy, sourceSemanticHash: BENCHMARK_SOURCE_HASH };
}

export function mEdgeTraction(loadId, elementId, edgeNodeIds, tx, ty) {
  return {
    loadId, elementId, edgeNodeIds, type: 'TRACTION', tx, ty,
    sourceSemanticHash: BENCHMARK_SOURCE_HASH,
  };
}

export function mLoadCase(loadCaseId, nodalForces = [], edgeLoads = []) {
  return { loadCaseId, nodalForces, edgeLoads, sourceSemanticHash: BENCHMARK_SOURCE_HASH };
}

/**
 * Assemble a `fea-continuum-model/v1`.
 *
 * @param {Record<string, unknown>} parts Model parts.
 * @returns {Record<string, unknown>} Continuum model document.
 */
export function continuumModel(parts) {
  return {
    schema: 'fea-continuum-model/v1',
    modelIdentity: parts.modelIdentity,
    modelVersion: '1',
    sourceSemanticHash: BENCHMARK_SOURCE_HASH,
    solverProfileIdentity: parts.solverProfile.profileIdentity,
    solverProfile: parts.solverProfile,
    nodes: parts.nodes,
    elements: parts.elements,
    materials: parts.materials,
    restraints: parts.restraints ?? [],
    prescribedDisplacements: parts.prescribedDisplacements ?? [],
    loadCases: parts.loadCases ?? [mLoadCase('LC1')],
    sourceReferences: [{
      sourceReferenceId: 'SRC-1',
      sourceType: 'BENCHMARK_VERIFICATION_CASE',
      sourceVersion: '1',
      sourceSemanticHash: BENCHMARK_SOURCE_HASH,
    }],
    limitations: parts.limitations ?? ['Benchmark verification case.'],
  };
}

/**
 * Impose an exact displacement field on every node (patch-test driver).
 *
 * @param {Array<Record<string, number>>} nodes Model nodes.
 * @param {(x:number,y:number)=>[number,number]} field Exact displacement field.
 * @returns {Array<Record<string, unknown>>} Prescribed displacement rows.
 */
export function prescribeField(nodes, field) {
  return nodes.flatMap((row, index) => {
    const [ux, uy] = field(row.x, row.y);
    return [
      mPrescribed(`P${index + 1}-X`, row.nodeId, 'UX', ux),
      mPrescribed(`P${index + 1}-Y`, row.nodeId, 'UY', uy),
    ];
  });
}

/**
 * Impose an exact displacement field only on boundary nodes of a rectangle
 * (the strict form of the patch test: interior nodes stay free).
 *
 * @param {Array<Record<string, number>>} nodes Model nodes.
 * @param {{x0:number,x1:number,y0:number,y1:number}} box Rectangle extents.
 * @param {(x:number,y:number)=>[number,number]} field Exact displacement field.
 * @param {number} tolerance Coordinate tolerance for boundary detection.
 * @returns {Array<Record<string, unknown>>} Prescribed displacement rows.
 */
export function prescribeBoundaryField(nodes, box, field, tolerance = 1e-12) {
  const onBoundary = (n) => Math.abs(n.x - box.x0) <= tolerance
    || Math.abs(n.x - box.x1) <= tolerance
    || Math.abs(n.y - box.y0) <= tolerance
    || Math.abs(n.y - box.y1) <= tolerance;
  return nodes.filter(onBoundary).flatMap((row, index) => {
    const [ux, uy] = field(row.x, row.y);
    return [
      mPrescribed(`B${index + 1}-X`, row.nodeId, 'UX', ux),
      mPrescribed(`B${index + 1}-Y`, row.nodeId, 'UY', uy),
    ];
  });
}

/* ------------------------------------------------------------------ */
/* Structured meshes                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build a structured Q4 grid over a rectangle.
 *
 * @param {{width:number,height:number,nx:number,ny:number,x0?:number,y0?:number}} spec Grid spec.
 * @returns {{nodes:Array,elements:Array,nodeId:Function,elementIds:Array}} Grid data.
 */
export function q4Grid(spec) {
  const { width, height, nx, ny } = spec;
  const x0 = spec.x0 ?? 0;
  const y0 = spec.y0 ?? 0;
  const pad = (v) => String(v).padStart(3, '0');
  const nodeId = (i, j) => `N${pad(i)}_${pad(j)}`;
  const nodes = [];
  for (let i = 0; i <= nx; i += 1) {
    for (let j = 0; j <= ny; j += 1) {
      nodes.push(mNode(nodeId(i, j), x0 + (i * width) / nx, y0 + (j * height) / ny));
    }
  }
  const elements = [];
  const elementIds = [];
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < ny; j += 1) {
      const id = `E${pad(i)}_${pad(j)}`;
      elements.push({ elementId: id, type: 'Q4', nodeIds: [nodeId(i, j), nodeId(i + 1, j), nodeId(i + 1, j + 1), nodeId(i, j + 1)] });
      elementIds.push(id);
    }
  }
  return { nodes, elements, nodeId, elementIds };
}

/**
 * Build a structured T3 grid (each quad split along its rising diagonal).
 *
 * @param {{width:number,height:number,nx:number,ny:number,x0?:number,y0?:number}} spec Grid spec.
 * @returns {{nodes:Array,elements:Array,nodeId:Function,elementIds:Array}} Grid data.
 */
export function t3Grid(spec) {
  const grid = q4Grid(spec);
  const elements = [];
  const elementIds = [];
  grid.elements.forEach((quad) => {
    const [a, b, c, d] = quad.nodeIds;
    const idA = `${quad.elementId}A`;
    const idB = `${quad.elementId}B`;
    elements.push({ elementId: idA, type: 'T3', nodeIds: [a, b, c] });
    elements.push({ elementId: idB, type: 'T3', nodeIds: [a, c, d] });
    elementIds.push(idA, idB);
  });
  return { nodes: grid.nodes, elements, nodeId: grid.nodeId, elementIds };
}

/* ------------------------------------------------------------------ */
/* lfea-mesh-package/v1 assembly                                       */
/* ------------------------------------------------------------------ */

/**
 * Seal a mesh package: canonical ordering then semantic hash.
 *
 * @param {Record<string, unknown>} parts Package parts.
 * @returns {Record<string, unknown>} Sealed lfea-mesh-package/v1.
 */
export function sealPackage(parts) {
  const base = {
    schema: 'lfea-mesh-package/v1',
    packageIdentity: parts.packageIdentity,
    packageVersion: '1',
    unitsIdentity: 'MM_N_MPA_V1',
    coordinateSystem: 'RIGHT_HANDED_XY_V1',
    nodes: parts.nodes.map((n) => ({ ...n, sourceEntityId: `SRC-${n.nodeId}` })),
    elements: parts.elements.map((e) => ({
      elementId: e.elementId,
      elementType: e.type ?? e.elementType,
      nodeIds: e.nodeIds,
      sourceEntityId: `SRC-${e.elementId}`,
      sourceSemanticHash: BENCHMARK_SOURCE_HASH,
    })),
    materials: parts.materials,
    regions: parts.regions,
    boundaries: parts.boundaries ?? [],
    points: parts.points ?? [],
    analysisDefinition: {
      formulation: parts.formulation ?? 'PLANE_STRESS',
      solverProfile: parts.solverProfile ?? denseProfile(parts.formulation ?? 'PLANE_STRESS'),
      materialAssignments: parts.materialAssignments,
      thicknessAssignments: (parts.formulation ?? 'PLANE_STRESS') === 'PLANE_STRAIN'
        ? []
        : (parts.thicknessAssignments ?? []),
      loadCase: parts.loadCase,
      constraints: parts.constraints ?? [],
    },
    sourceReferences: [{
      sourceReferenceId: 'SRC-1',
      sourceType: 'BENCHMARK_VERIFICATION_CASE',
      sourceVersion: '1',
      sourceSemanticHash: BENCHMARK_SOURCE_HASH,
    }],
  };
  const normalized = canonicalOrder(base);
  return { ...normalized, semanticHash: semanticHash(normalized) };
}

export function pRegion(regionId, elementIds) {
  return {
    regionId, elementIds: [...elementIds].sort(compare),
    sourceEntityId: `SRC-${regionId}`, sourceSemanticHash: BENCHMARK_SOURCE_HASH,
  };
}

export function pBoundary(boundaryId, edgeReferences) {
  return {
    boundaryId, edgeReferences,
    sourceEntityId: `SRC-${boundaryId}`, sourceSemanticHash: BENCHMARK_SOURCE_HASH,
  };
}

export function pPoint(pointId, nodeId) {
  return {
    pointId, nodeId,
    sourceEntityId: `SRC-${pointId}`, sourceSemanticHash: BENCHMARK_SOURCE_HASH,
  };
}

export function pMaterialAssignment(assignmentId, regionId, materialId) {
  return { assignmentId, regionId, materialId };
}

export function pThicknessAssignment(assignmentId, regionId, thickness) {
  return { assignmentId, regionId, thickness, sourceSemanticHash: BENCHMARK_SOURCE_HASH };
}

export function pPointForce(loadId, pointId, fx, fy) {
  return { loadId, pointId, fx, fy, sourceSemanticHash: BENCHMARK_SOURCE_HASH };
}

export function pTraction(loadId, boundaryId, tx, ty) {
  return { loadId, boundaryId, tx, ty, sourceSemanticHash: BENCHMARK_SOURCE_HASH };
}

export function pPressure(loadId, boundaryId, pressure) {
  return { loadId, boundaryId, pressure, sourceSemanticHash: BENCHMARK_SOURCE_HASH };
}

export function pLoadCase(loadCaseId, parts = {}) {
  return {
    loadCaseId,
    pointForces: parts.pointForces ?? [],
    boundaryTractions: parts.boundaryTractions ?? [],
    boundaryPressures: parts.boundaryPressures ?? [],
    sourceSemanticHash: BENCHMARK_SOURCE_HASH,
  };
}

export const FREE = Object.freeze({ type: 'FREE' });
export const FIXED = Object.freeze({ type: 'FIXED' });

export function pConstraint(constraintId, selectorType, selectorId, ux, uy) {
  return { constraintId, selectorType, selectorId, ux, uy, sourceSemanticHash: BENCHMARK_SOURCE_HASH };
}

function canonicalOrder(value) {
  const row = structuredClone(value);
  const keyed = [['nodes', 'nodeId'], ['elements', 'elementId'], ['materials', 'materialId'],
    ['regions', 'regionId'], ['boundaries', 'boundaryId'], ['points', 'pointId'],
    ['sourceReferences', 'sourceReferenceId']];
  keyed.forEach(([collection, key]) => row[collection].sort((a, b) => compare(a[key], b[key])));
  row.regions.forEach((item) => item.elementIds.sort(compare));
  row.boundaries.forEach((item) => item.edgeReferences.sort(
    (a, b) => compare(a.elementId, b.elementId) || compare(a.localEdgeId, b.localEdgeId),
  ));
  const analysis = row.analysisDefinition;
  analysis.materialAssignments.sort((a, b) => compare(a.assignmentId, b.assignmentId));
  analysis.thicknessAssignments.sort((a, b) => compare(a.assignmentId, b.assignmentId));
  analysis.constraints.sort((a, b) => compare(a.constraintId, b.constraintId));
  ['pointForces', 'boundaryTractions', 'boundaryPressures'].forEach(
    (key) => analysis.loadCase[key].sort((a, b) => compare(a.loadId, b.loadId)),
  );
  return row;
}

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
