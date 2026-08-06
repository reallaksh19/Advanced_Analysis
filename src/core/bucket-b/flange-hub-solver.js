import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import {
  axisymmetricQ8Element,
  evaluateAxisymmetricQ8State,
} from './axisymmetric-q8-kernel.js';
import {
  createFlangeHubLoadDefinition,
  integrateAxialTractionEdge,
  integratePressureEdge,
} from './flange-hub-loads.js';
import { FLANGE_HUB_MATERIAL_PROFILE } from './flange-hub-geometry.js';

export const FLANGE_HUB_SOLVER_POLICY = deepFreeze({
  solverPolicyId: 'BKT-B-FLANGE-HUB-DETERMINISTIC-JACOBI-PCG-V3',
  relativeResidualTolerance: 1e-10,
  absoluteResidualTolerance: 1e-8,
  maximumIterationMultiplier: 8,
  minimumMaximumIterations: 2000,
  residualReplacementInterval: 0,
  stoppingCriterion: 'EXPLICIT_REDUCED_SYSTEM_RESIDUAL',
  constraintMethod: 'EXACT_ZERO_DISPLACEMENT_ELIMINATION',
  reducedMatrixStorage: 'DETERMINISTIC_TYPED_SPARSE_ROWS',
});

export function solveFlangeHubLoadCase({ mesh, loadCaseId } = {}) {
  requireMesh(mesh);
  const loadDefinition = createFlangeHubLoadDefinition(loadCaseId);
  const nodes = mesh.nodes;
  const nodeIndex = new Map(nodes.map((node, index) => [node.nodeId, index]));
  const nodesById = new Map(nodes.map((node) => [node.nodeId, node]));
  const dofCount = 2 * nodes.length;
  const stiffnessRows = Array.from({ length: dofCount }, () => new Map());
  const force = new Float64Array(dofCount);
  const elementKernels = new Map();

  mesh.elements.forEach((element) => {
    const elementNodes = element.nodeIds.map((nodeId) => nodesById.get(nodeId));
    const kernel = axisymmetricQ8Element({
      elementId: element.elementId,
      nodes: elementNodes,
      material: FLANGE_HUB_MATERIAL_PROFILE,
    });
    elementKernels.set(element.elementId, kernel);
    const dofs = globalDofs(element.nodeIds, nodeIndex);
    for (let row = 0; row < 16; row += 1) {
      const target = stiffnessRows[dofs[row]];
      for (let column = 0; column < 16; column += 1) {
        const globalColumn = dofs[column];
        target.set(
          globalColumn,
          (target.get(globalColumn) ?? 0) + kernel.stiffness[row][column],
        );
      }
    }
  });

  const loadEvidence = assembleLoads({
    mesh,
    loadDefinition,
    nodesById,
    nodeIndex,
    force,
  });
  const constrainedDofs = deriveConstrainedDofs({
    mesh,
    loadDefinition,
    nodeIndex,
  });
  const constrained = new Set(constrainedDofs.map((row) => row.dof));
  if (constrained.size === 0) {
    throw new RangeError('FH_AXIAL_TRANSLATION_UNDERCONSTRAINED');
  }
  if (constrainedDofs.some((row) => row.component !== 'UZ')) {
    throw new TypeError('FH_RADIAL_CONSTRAINT_FORBIDDEN');
  }

  const freeDofs = Array.from({ length: dofCount }, (_, dof) => dof)
    .filter((dof) => !constrained.has(dof));
  const globalToLocal = new Int32Array(dofCount);
  globalToLocal.fill(-1);
  freeDofs.forEach((dof, index) => { globalToLocal[dof] = index; });
  const rhs = Float64Array.from(freeDofs.map((dof) => force[dof]));
  const diagonal = Float64Array.from(
    freeDofs.map((dof) => stiffnessRows[dof].get(dof) ?? 0),
  );
  if (diagonal.some((value) => !Number.isFinite(value) || !(value > 0))) {
    throw new RangeError('FH_REDUCED_STIFFNESS_NONPOSITIVE_DIAGONAL');
  }
  const reducedRows = createReducedSparseRows({
    stiffnessRows,
    freeDofs,
    globalToLocal,
  });
  const multiply = createTypedSparseMultiplier(reducedRows);
  const solution = solveJacobiPcg({
    multiply,
    rhs,
    diagonal,
    policy: FLANGE_HUB_SOLVER_POLICY,
  });
  const displacement = new Float64Array(dofCount);
  freeDofs.forEach((dof, index) => {
    displacement[dof] = solution.vector[index];
  });
  const internal = multiplySparse(stiffnessRows, displacement);

  let strainEnergy = 0;
  let externalWork = 0;
  for (let dof = 0; dof < dofCount; dof += 1) {
    strainEnergy += 0.5 * displacement[dof] * internal[dof];
    externalWork += force[dof] * displacement[dof];
  }
  const reactions = constrainedDofs.map((constraint) => ({
    ...constraint,
    reaction: internal[constraint.dof] - force[constraint.dof],
  }));
  const axialReaction = reactions.reduce((sum, row) => sum + row.reaction, 0);
  const appliedAxial = loadEvidence.totalQuadratureResultant.axial;
  const axialForceImbalance = Math.abs(appliedAxial + axialReaction)
    / Math.max(1, Math.abs(appliedAxial), Math.abs(axialReaction));
  const energyRelativeDifference = Math.abs(2 * strainEnergy - externalWork)
    / Math.max(1, Math.abs(2 * strainEnergy), Math.abs(externalWork));
  const freeResidual = freeResidualNorm({ internal, force, freeDofs });
  const freeResidualRelative = freeResidual / Math.max(1, vectorNorm(force));
  if (axialForceImbalance > 1e-8) {
    throw new RangeError(`FH_AXIAL_FORCE_IMBALANCE:${axialForceImbalance}`);
  }
  if (energyRelativeDifference > 1e-8) {
    throw new RangeError(`FH_ENERGY_IDENTITY_FAILURE:${energyRelativeDifference}`);
  }
  if (freeResidualRelative > 1e-10) {
    throw new RangeError(`FH_FREE_DOF_RESIDUAL_FAILURE:${freeResidualRelative}`);
  }

  const nodalDisplacements = nodes.map((node, index) => deepFreeze({
    nodeId: node.nodeId,
    radial: displacement[2 * index],
    axial: displacement[2 * index + 1],
  }));
  const elementResults = mesh.elements.map((element) => {
    const elementNodes = element.nodeIds.map((nodeId) => nodesById.get(nodeId));
    const elementDisplacement = element.nodeIds.flatMap((nodeId) => {
      const index = nodeIndex.get(nodeId);
      return [displacement[2 * index], displacement[2 * index + 1]];
    });
    const gaussPointResults = evaluateAxisymmetricQ8State({
      nodes: elementNodes,
      material: FLANGE_HUB_MATERIAL_PROFILE,
      displacementVector: elementDisplacement,
    }).map((row) => deepFreeze({
      pointId: row.pointId,
      xi: row.xi,
      eta: row.eta,
      quadratureWeight: row.quadratureWeight,
      mappedCoordinates: row.mappedCoordinates,
      radius: row.radius,
      determinant: row.determinant,
      circumferenceFactor: row.circumferenceFactor,
      strain: row.strain,
      stress: row.stress,
    }));
    return deepFreeze({
      elementId: element.elementId,
      blockId: element.blockId,
      nodeIds: element.nodeIds,
      gaussPointResults,
    });
  });

  const payload = {
    schema: 'flange-hub-load-case-result/v1',
    moduleId: 'C2D-FLANGE-HUB',
    levelId: mesh.levelId,
    loadCaseId,
    geometryHash: mesh.geometryHash,
    meshHash: mesh.meshHash,
    canonicalModelHash: semanticHash({
      meshCanonicalModelHash: mesh.canonicalModelHash,
      loadDefinitionHash: loadDefinition.semanticHash,
      solverPolicy: FLANGE_HUB_SOLVER_POLICY,
    }),
    solver: {
      ...FLANGE_HUB_SOLVER_POLICY,
      freeDofCount: freeDofs.length,
      constrainedDofCount: constrainedDofs.length,
      reducedNonzeroCount: reducedRows.reduce(
        (sum, row) => sum + row.values.length,
        0,
      ),
      iterations: solution.iterations,
      residualNorm: solution.residualNorm,
      relativeResidual: solution.relativeResidual,
      recursiveResidualNorm: solution.recursiveResidualNorm,
      explicitResidualNorm: solution.explicitResidualNorm,
      residualReplacementCount: solution.residualReplacementCount,
    },
    loadDefinition,
    loadEvidence,
    constraints: constrainedDofs.map(({ dof: _dof, ...row }) => row),
    nodalDisplacements,
    elementResults,
    reactions: reactions.map(({ dof: _dof, ...row }) => row),
    equilibrium: {
      appliedAxial,
      axialReaction,
      axialForceImbalance,
      generalizedRadialLoad: loadEvidence.totalQuadratureResultant.radial,
      fullThreeDimensionalMomentResultant: { x: 0, y: 0, z: 0 },
      momentEquilibriumAcceptedByAxisymmetry: true,
      accepted: axialForceImbalance <= 1e-8,
    },
    energy: {
      strainEnergy,
      externalWork,
      constraintWork: 0,
      energyRelativeDifference,
      accepted: energyRelativeDifference <= 1e-8,
    },
    residual: {
      freeResidualNorm: freeResidual,
      freeResidualRelative,
      accepted: freeResidualRelative <= 1e-10,
    },
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function createReducedSparseRows({ stiffnessRows, freeDofs, globalToLocal }) {
  return freeDofs.map((globalRow) => {
    const columns = [];
    const values = [];
    stiffnessRows[globalRow].forEach((value, globalColumn) => {
      const localColumn = globalToLocal[globalColumn];
      if (localColumn >= 0) {
        columns.push(localColumn);
        values.push(value);
      }
    });
    return {
      columns: Int32Array.from(columns),
      values: Float64Array.from(values),
    };
  });
}

function createTypedSparseMultiplier(rows) {
  const result = new Float64Array(rows.length);
  return (vector) => {
    if (!vector || vector.length !== rows.length) {
      throw new TypeError('FH_TYPED_SPARSE_MULTIPLY_SHAPE_MISMATCH');
    }
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      let sum = 0;
      for (let entry = 0; entry < row.values.length; entry += 1) {
        sum += row.values[entry] * vector[row.columns[entry]];
      }
      result[rowIndex] = sum;
    }
    return result;
  };
}

function assembleLoads({ mesh, loadDefinition, nodesById, nodeIndex, force }) {
  const rows = [];
  const add = (evidence, role) => {
    const radialResidual = Math.abs(evidence.normalizationResidual.radial)
      / Math.max(1, Math.abs(evidence.quadratureGeneralizedResultant.radial));
    const axialResidual = Math.abs(evidence.normalizationResidual.axial)
      / Math.max(1, Math.abs(evidence.quadratureGeneralizedResultant.axial));
    if (Math.max(radialResidual, axialResidual) > 1e-10) {
      throw new RangeError(`FH_NODAL_QUADRATURE_MISMATCH:${evidence.edgeId}`);
    }
    evidence.consistentNodalForces.forEach((row) => {
      const index = nodeIndex.get(row.nodeId);
      force[2 * index] += row.radial;
      force[2 * index + 1] += row.axial;
    });
    rows.push({ role, evidence });
  };
  if (loadDefinition.loadCaseId === 'FH-PRES-001') {
    selectEdges(mesh, 'FH-BOUNDARY-BORE').forEach((edge) => add(
      integratePressureEdge({
        edgeId: edge.edgeId,
        nodes: edge.nodeIds.map((id) => nodesById.get(id)),
        outwardNormal: edge.outwardNormal,
      }, loadDefinition.internalPressure),
      'INTERNAL_BORE_PRESSURE',
    ));
    selectEdges(mesh, 'FH-BOUNDARY-PIPE-END').forEach((edge) => add(
      integrateAxialTractionEdge({
        edgeId: edge.edgeId,
        nodes: edge.nodeIds.map((id) => nodesById.get(id)),
        outwardNormal: edge.outwardNormal,
      }, loadDefinition.equivalentEndTraction),
      'EQUIVALENT_PRESSURE_END_THRUST',
    ));
  } else if (loadDefinition.loadCaseId === 'FH-AXIAL-001') {
    selectEdges(mesh, 'FH-BOUNDARY-PIPE-END').forEach((edge) => add(
      integrateAxialTractionEdge({
        edgeId: edge.edgeId,
        nodes: edge.nodeIds.map((id) => nodesById.get(id)),
        outwardNormal: edge.outwardNormal,
      }, loadDefinition.equivalentEndTraction),
      'INDEPENDENT_AXIAL_MEMBRANE_LOAD',
    ));
  } else if (loadDefinition.loadCaseId === 'FH-GASKET-001') {
    selectEdges(mesh, 'FH-BOUNDARY-GASKET-FACE')
      .filter((edge) => edgeWithinRadius(edge, nodesById, 65, 95))
      .forEach((edge) => add(
        integrateAxialTractionEdge({
          edgeId: edge.edgeId,
          nodes: edge.nodeIds.map((id) => nodesById.get(id)),
          outwardNormal: edge.outwardNormal,
        }, -loadDefinition.faceCompression),
        'OPTIONAL_GASKET_FACE_COMPRESSION',
      ));
  }
  if (rows.length === 0) throw new TypeError('FH_LOAD_CASE_HAS_NO_EDGES');
  const totalQuadratureResultant = rows.reduce((sum, row) => ({
    radial: sum.radial + row.evidence.quadratureGeneralizedResultant.radial,
    axial: sum.axial + row.evidence.quadratureGeneralizedResultant.axial,
  }), { radial: 0, axial: 0 });
  const totalNodalResultant = rows.reduce((sum, row) => ({
    radial: sum.radial + row.evidence.nodalReconstructedResultant.radial,
    axial: sum.axial + row.evidence.nodalReconstructedResultant.axial,
  }), { radial: 0, axial: 0 });
  const mismatch = Math.hypot(
    totalNodalResultant.radial - totalQuadratureResultant.radial,
    totalNodalResultant.axial - totalQuadratureResultant.axial,
  ) / Math.max(
    1,
    Math.hypot(
      totalQuadratureResultant.radial,
      totalQuadratureResultant.axial,
    ),
  );
  if (mismatch > 1e-10) {
    throw new RangeError(`FH_TOTAL_NODAL_QUADRATURE_MISMATCH:${mismatch}`);
  }
  return deepFreeze({
    edges: rows,
    totalQuadratureResultant,
    totalNodalResultant,
    normalizedMismatch: mismatch,
    circumferenceAppliedExactlyOnce: rows.every((row) => (
      row.evidence.authority.fullCircumferenceMeasureAppliedExactlyOnce === true
      && row.evidence.authority.quadratureRadiusUsed === true
      && row.evidence.authority.representativeRadiusUsed === false
    )),
  });
}

function deriveConstrainedDofs({ mesh, loadDefinition, nodeIndex }) {
  const result = [];
  mesh.nodes.forEach((node) => {
    const gasketSupport = loadDefinition.axialSupport
        === 'GASKET_SUPPORT_ANNULUS'
      && Math.abs(node.z - 90) <= 1e-10
      && node.r >= 60 - 1e-10
      && node.r <= 95 + 1e-10;
    const remoteSupport = loadDefinition.axialSupport === 'REMOTE_PIPE_END'
      && Math.abs(node.z + 100) <= 1e-10
      && node.r >= 50 - 1e-10
      && node.r <= 60 + 1e-10;
    if (gasketSupport || remoteSupport) {
      result.push({
        dof: 2 * nodeIndex.get(node.nodeId) + 1,
        nodeId: node.nodeId,
        component: 'UZ',
        value: 0,
        boundaryId: gasketSupport
          ? 'FH-BOUNDARY-GASKET-FACE'
          : 'FH-BOUNDARY-PIPE-END',
        mechanicalInterpretation: gasketSupport
          ? 'IDEALIZED_AXIAL_GASKET_SUPPORT_RADIAL_MOTION_FREE'
          : 'REMOTE_PIPE_END_AXIAL_REFERENCE_RADIAL_MOTION_FREE',
      });
    }
  });
  return result;
}

export function solveJacobiPcg({
  multiply,
  rhs,
  diagonal,
  policy = FLANGE_HUB_SOLVER_POLICY,
} = {}) {
  if (typeof multiply !== 'function') {
    throw new TypeError('FH_PCG_MULTIPLY_REQUIRED');
  }
  if (!rhs || !diagonal || rhs.length !== diagonal.length || rhs.length === 0) {
    throw new TypeError('FH_PCG_VECTOR_SHAPE_MISMATCH');
  }
  const n = rhs.length;
  const x = new Float64Array(n);
  let r = Float64Array.from(rhs);
  const z = new Float64Array(n);
  let p;
  for (let i = 0; i < n; i += 1) {
    if (!Number.isFinite(diagonal[i]) || !(diagonal[i] > 0)) {
      throw new RangeError('FH_PCG_NONPOSITIVE_PRECONDITIONER');
    }
    z[i] = r[i] / diagonal[i];
  }
  p = Float64Array.from(z);
  let rz = dot(r, z);
  const rhsNorm = vectorNorm(rhs);
  const denominatorNorm = Math.max(1, rhsNorm);
  const tolerance = Math.max(
    policy.absoluteResidualTolerance,
    policy.relativeResidualTolerance * rhsNorm,
  );
  const replacementInterval = Number.isInteger(policy.residualReplacementInterval)
    && policy.residualReplacementInterval > 0
    ? policy.residualReplacementInterval
    : 0;
  let recursiveResidualNorm = vectorNorm(r);
  let explicitResidualNorm = recursiveResidualNorm;
  let residualReplacementCount = 0;
  const maximumIterations = Math.max(
    policy.minimumMaximumIterations,
    policy.maximumIterationMultiplier * n,
  );

  const explicitResidual = () => {
    const product = multiply(x);
    if (!product || product.length !== n) {
      throw new TypeError('FH_PCG_MULTIPLY_SHAPE_MISMATCH');
    }
    const value = new Float64Array(n);
    for (let i = 0; i < n; i += 1) value[i] = rhs[i] - product[i];
    return value;
  };
  const replaceResidual = (value) => {
    r = value;
    for (let i = 0; i < n; i += 1) z[i] = r[i] / diagonal[i];
    p = Float64Array.from(z);
    rz = dot(r, z);
    residualReplacementCount += 1;
  };
  const result = (iterations) => ({
    vector: x,
    iterations,
    residualNorm: explicitResidualNorm,
    relativeResidual: explicitResidualNorm / denominatorNorm,
    recursiveResidualNorm,
    explicitResidualNorm,
    residualReplacementCount,
  });

  if (recursiveResidualNorm <= tolerance) {
    const certified = explicitResidual();
    explicitResidualNorm = vectorNorm(certified);
    if (explicitResidualNorm <= tolerance) return result(0);
    replaceResidual(certified);
  }

  for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
    const Ap = multiply(p);
    if (!Ap || Ap.length !== n) {
      throw new TypeError('FH_PCG_MULTIPLY_SHAPE_MISMATCH');
    }
    const curvature = dot(p, Ap);
    if (!Number.isFinite(curvature) || !(curvature > 0)) {
      throw new RangeError('FH_PCG_NONPOSITIVE_CURVATURE');
    }
    const alpha = rz / curvature;
    for (let i = 0; i < n; i += 1) {
      x[i] += alpha * p[i];
      r[i] -= alpha * Ap[i];
    }
    recursiveResidualNorm = vectorNorm(r);
    const certificationRequired = recursiveResidualNorm <= tolerance
      || (replacementInterval > 0 && iteration % replacementInterval === 0);
    if (certificationRequired) {
      const certified = explicitResidual();
      explicitResidualNorm = vectorNorm(certified);
      if (explicitResidualNorm <= tolerance) return result(iteration);
      replaceResidual(certified);
      continue;
    }
    for (let i = 0; i < n; i += 1) z[i] = r[i] / diagonal[i];
    const nextRz = dot(r, z);
    if (!Number.isFinite(nextRz) || !(nextRz > 0)) {
      throw new RangeError('FH_PCG_NONPOSITIVE_PRECONDITIONED_RESIDUAL');
    }
    const beta = nextRz / rz;
    for (let i = 0; i < n; i += 1) p[i] = z[i] + beta * p[i];
    rz = nextRz;
  }
  const certified = explicitResidual();
  explicitResidualNorm = vectorNorm(certified);
  throw new RangeError(
    `FH_PCG_DID_NOT_CONVERGE:${explicitResidualNorm / denominatorNorm}`,
  );
}

function multiplySparse(rows, vector) {
  const result = new Float64Array(rows.length);
  rows.forEach((row, index) => {
    let sum = 0;
    row.forEach((value, column) => {
      sum += value * vector[column];
    });
    result[index] = sum;
  });
  return result;
}

function freeResidualNorm({ internal, force, freeDofs }) {
  let squared = 0;
  freeDofs.forEach((dof) => {
    const residual = internal[dof] - force[dof];
    squared += residual ** 2;
  });
  return Math.sqrt(squared);
}
function globalDofs(nodeIds, nodeIndex) {
  return nodeIds.flatMap((id) => {
    const index = nodeIndex.get(id);
    return [2 * index, 2 * index + 1];
  });
}
function selectEdges(mesh, boundaryId) {
  return mesh.boundaryEdges.filter((edge) => edge.boundaryId === boundaryId);
}
function edgeWithinRadius(edge, nodesById, minimum, maximum) {
  const radii = edge.nodeIds.map((id) => nodesById.get(id).r);
  return Math.min(...radii) >= minimum - 1e-10
    && Math.max(...radii) <= maximum + 1e-10;
}
function dot(left, right) {
  let sum = 0;
  for (let i = 0; i < left.length; i += 1) sum += left[i] * right[i];
  return sum;
}
function vectorNorm(value) {
  return Math.sqrt(dot(value, value));
}
function requireMesh(mesh) {
  if (!mesh || mesh.schema !== 'flange-hub-mesh-evidence/v1'
    || mesh.quality?.accepted !== true) {
    throw new TypeError('FH_QUALIFIED_MESH_REQUIRED');
  }
}
