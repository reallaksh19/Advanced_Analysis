import { ELEMENT_TYPE_CORNER_COUNTS, FORMULA_IDS } from './constants.js';
import { loadError, modelError, numericalError } from './errors.js';
import { zeros, symmetryResidual, matrixScale } from './matrix.js';
import { canonicalNumber, tolerance } from './numeric.js';
import {
  DENSE_STIFFNESS_DOF_LIMIT,
  SPARSE_STIFFNESS_STORAGE,
  assembleSymmetricCsr,
  sparseMatrixScale,
  sparseSymmetryResidual,
} from './sparse-matrix.js';
import { codeUnitCompare } from './validation.js';

export function assembleMesh(model, elementEvidence) {
  const dofOrdering = model.nodes.flatMap((node) => [
    `${node.nodeId}:UX`, `${node.nodeId}:UY`,
  ]);
  const dofIndex = new Map(dofOrdering.map((id, index) => [id, index]));
  const sparse = dofOrdering.length > DENSE_STIFFNESS_DOF_LIMIT;
  let globalStiffnessMatrix = null;
  let globalStiffnessCsr = null;
  if (sparse) {
    globalStiffnessCsr = assembleSymmetricCsr(
      dofOrdering.length,
      elementEvidence,
      dofIndex,
    );
  } else {
    globalStiffnessMatrix = zeros(dofOrdering.length, dofOrdering.length);
    elementEvidence.forEach((element) =>
      assembleDenseElement(globalStiffnessMatrix, element, dofIndex));
  }
  const residual = sparse
    ? sparseSymmetryResidual(globalStiffnessCsr)
    : symmetryResidual(globalStiffnessMatrix);
  const scale = sparse
    ? sparseMatrixScale(globalStiffnessCsr)
    : matrixScale(globalStiffnessMatrix);
  const limit = tolerance(model.qualificationProfile, 'stiffnessSymmetry', scale);
  if (residual > limit) {
    throw numericalError(
      'GLOBAL_STIFFNESS_SYMMETRY_FAILURE',
      'assembly',
      'Global stiffness symmetry did not qualify.',
    );
  }
  const boundaryEdges = buildBoundaryEdges(model.elements);
  return {
    dofOrdering,
    globalStiffnessMatrix: globalStiffnessMatrix?.map((row) =>
      row.map((value) => canonicalNumber(value, 'global stiffness'))),
    globalStiffnessCsr,
    globalStiffnessStorage: sparse ? SPARSE_STIFFNESS_STORAGE : 'DENSE',
    globalStiffnessSymmetry: {
      residual,
      scale,
      tolerance: limit,
      accepted: true,
    },
    boundaryEdges,
    formulaIds: sparse
      ? [FORMULA_IDS.ASSEMBLY, FORMULA_IDS.SPARSE_ASSEMBLY]
      : [FORMULA_IDS.ASSEMBLY],
  };
}

function assembleDenseElement(global, element, dofIndex) {
  const indices = element.localDofOrdering.map((id) => dofIndex.get(id));
  indices.forEach((row, i) => indices.forEach((column, j) => {
    global[row][column] += element.localStiffnessMatrix[i][j];
  }));
}

export function buildBoundaryEdges(elements) {
  const uses = new Map();
  elements.forEach((element) => elementEdgeNodeSequences(element).forEach((edge) => {
    const key = edgeKey(edge);
    const rows = uses.get(key) ?? [];
    rows.push({
      elementId: element.elementId,
      edgeNodeIds: [...edge].sort(codeUnitCompare),
      edgeNodeSequence: edge,
    });
    uses.set(key, rows);
  }));
  return [...uses.entries()]
    .filter(([, rows]) => rows.length === 1)
    .map(([key, rows]) => ({ edgeKey: key, ...rows[0] }))
    .sort((a, b) => codeUnitCompare(a.edgeKey, b.edgeKey));
}

/**
 * Per-edge node sequence in edge-local traversal order: `[corner, corner]`
 * for T3 (straight, spec-unchanged); `[corner, midside, corner]` for T6/Q8
 * (spec §10.4 "midside-geometry": a boundary edge on a quadratic element is
 * a 3-node quadratic curve, not its 2-node corner-only chord — load
 * integration and boundary matching must see the midside node, never
 * silently drop it to a straight facet).
 */
export function elementEdgeNodeSequences(element) {
  const cornerCount = ELEMENT_TYPE_CORNER_COUNTS[element.elementType];
  const corners = element.nodeIds.slice(0, cornerCount);
  const midsides = element.nodeIds.slice(cornerCount);
  return corners.map((id, index) => {
    const next = corners[(index + 1) % cornerCount];
    return midsides.length ? [id, midsides[index], next] : [id, next];
  });
}

export function validateBoundaryTractions(model, mesh) {
  const boundary = new Map(mesh.boundaryEdges.map((row) => [row.edgeKey, row]));
  model.loadCases.forEach((loadCase) => {
    loadCase.edgeTractions.forEach((traction) => validateBoundaryEdgeLoad(
      boundary,
      loadCase.loadCaseId,
      traction.tractionId,
      traction.elementId,
      traction.edgeNodeIds,
      'TRACTION',
    ));
    loadCase.pressureLoads.forEach((pressureLoad) => validateBoundaryEdgeLoad(
      boundary,
      loadCase.loadCaseId,
      pressureLoad.pressureLoadId,
      pressureLoad.elementId,
      pressureLoad.edgeNodeIds,
      'PRESSURE_LOAD',
    ));
  });
}

function validateBoundaryEdgeLoad(
  boundary,
  loadCaseId,
  loadId,
  elementId,
  edgeNodeIds,
  kind,
) {
  const key = edgeKey(edgeNodeIds);
  const edge = boundary.get(key);
  if (!edge) {
    throw loadError(
      `${kind}_EDGE_NOT_BOUNDARY`,
      `loadCases.${loadCaseId}.${loadId}`,
      'Edge load must be a true boundary edge.',
    );
  }
  if (edge.elementId !== elementId) {
    throw modelError(
      `${kind}_ELEMENT_EDGE_MISMATCH`,
      `loadCases.${loadCaseId}.${loadId}`,
      'Edge load does not belong to the declared boundary element.',
    );
  }
}

export function edgeKey(ids) {
  return [...ids].sort(codeUnitCompare).join('\0');
}
