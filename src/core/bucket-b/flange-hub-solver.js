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
  solverPolicyId: 'BKT-B-FLANGE-HUB-DETERMINISTIC-SGS-PCG-V9',
  relativeResidualTolerance: 1e-10,
  absoluteResidualTolerance: 1e-8,
  maximumIterationMultiplier: 8,
  minimumMaximumIterations: 2000,
  residualReplacementInterval: 0,
  preconditionerId: 'SYMMETRIC_GAUSS_SEIDEL',
  summationPolicyId: 'KAHAN_COMPENSATED_DETERMINISTIC_ORDER',
  stoppingCriterion: 'EXPLICIT_REDUCED_SYSTEM_RESIDUAL',
  constraintMethod: 'EXACT_ZERO_DISPLACEMENT_ELIMINATION',
  reducedMatrixStorage: 'DETERMINISTIC_SORTED_TYPED_SPARSE_ROWS',
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
  const solution = solveSgsPcg({
    rows: reducedRows,
    rhs,
    diagonal,
    policy: FLANGE_HUB_SOLVER_POLICY,
    context: `${loadCaseId}:${mesh.levelId}`,
  });
  const displacement = new Float64Array(dofCount);
  freeDofs.forEach((dof, index) => {
    displacement[dof] = solution.vector[index];
  });
  const internal = multiplySparse(stiffnessRows, displacement);

  let strainEnergy = 0;
  let strainEnergyCorrection = 0;
  let externalWork = 0;
  let externalWorkCorrection = 0;
  for (let dof = 0; dof < dofCount; dof += 1) {
    const energyTerm = 0.5 * displacement[dof] * internal[dof];
    const energyAdjusted = energyTerm - strainEnergyCorrection;
    const nextEnergy = strainEnergy + energyAdjusted;
    strainEnergyCorrection = (nextEnergy - strainEnergy) - energyAdjusted;
    strainEnergy = nextEnergy;
    const workTerm = force[dof] * displacement[dof];
    const workAdjusted = workTerm - externalWorkCorrection;
    const nextWork = externalWork + workAdjusted;
    externalWorkCorrection = (nextWork - externalWork) - workAdjusted;
    externalWork = nextWork;
  }
  const reactions = constrainedDofs.map((constraint) => ({
    ...constraint,
    reaction: internal[constraint.dof] - force[constraint.dof],
  }));
  const axialReaction = compensatedScalarSum(
    reactions.map((row) => row.reaction),
  );
  const appliedAxial = loadEvidence.totalQuadratureResultant.axial;
  const axialForceImbalance = Math.abs(appliedAxial + axialReaction)
    / Math.max(1, Math.abs(appliedAxial), Math.abs(axialReaction));
  const energyRelativeDifference = Math.abs(2 * strainEnergy - externalWork)
    / Math.max(1, Math.abs(2 * strainEnergy), Math.abs(externalWork));
  const freeResidual = freeResidualNorm({ internal, force, freeDofs });
  const forceNorm = vectorNorm(force);
  const freeResidualTolerance = Math.max(
    FLANGE_HUB_SOLVER_POLICY.absoluteResidualTolerance,
    FLANGE_HUB_SOLVER_POLICY.relativeResidualTolerance * forceNorm,
  );
  const freeResidualRelative = freeResidual / Math.max(1, forceNorm);
  if (axialForceImbalance > 1e-8) {
    throw new RangeError(`FH_AXIAL_FORCE_IMBALANCE:${axialForceImbalance}`);
  }
  if (energyRelativeDifference > 1e-8) {
    throw new RangeError(`FH_ENERGY_IDENTITY_FAILURE:${energyRelativeDifference}`);
  }
  if (freeResidual > freeResidualTolerance) {
    throw new RangeError(
      `FH_FREE_DOF_RESIDUAL_FAILURE:${loadCaseId}:${mesh.levelId}:`
      + `${freeResidualRelative}`,
    );
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
      freeResidualTolerance,
      accepted: freeResidual <= freeResidualTolerance,
    },
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function createReducedSparseRows({ stiffnessRows, freeDofs, globalToLocal }) {
  return freeDofs.map((globalRow) => {
    const entries = [];
    stiffnessRows[globalRow].forEach((value, globalColumn) => {
      const localColumn = globalToLocal[globalColumn];
      if (localColumn >= 0 && value !== 0) {
        entries.push({ column: localColumn, value });
      }
    });
    entries.sort((left, right) => left.column - right.column);
    return {
      columns: Int32Array.from(entries.map((entry) => entry.column)),
      values: Float64Array.from(entries.map((entry) => entry.value)),
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
      let correction = 0;
      for (let entry = 0; entry < row.values.length; entry += 1) {
        const term = row.values[entry] * vector[row.columns[entry]];
        const adjusted = term - correction;
        const next = sum + adjusted;
        correction = (next - sum) - adjusted;
        sum = next;
      }
      result[rowIndex] = sum;
    }
    return result;
  };
}

function createSymmetricGaussSeidelPreconditioner(rows, diagonal) {
  const count = rows.length;
  const forward = new Float64Array(count);
  const result = new Float64Array(count);
  return (residual) => {
    if (!residual || residual.length !== count) {
      throw new TypeError('FH_SGS_PRECONDITIONER_SHAPE_MISMATCH');
    }
    for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
      let lowerSum = 0;
      let lowerCorrection = 0;
      const row = rows[rowIndex];
      for (let entryIndex = 0; entryIndex < row.values.length; entryIndex += 1) {
        const column = row.columns[entryIndex];
        if (column >= rowIndex) break;
        const term = row.values[entryIndex] * forward[column];
        const adjusted = term - lowerCorrection;
        const next = lowerSum + adjusted;
        lowerCorrection = (next - lowerSum) - adjusted;
        lowerSum = next;
      }
      forward[rowIndex] = (residual[rowIndex] - lowerSum) / diagonal[rowIndex];
    }
    for (let rowIndex = count - 1; rowIndex >= 0; rowIndex -= 1) {
      let upperSum = 0;
      let upperCorrection = 0;
      const row = rows[rowIndex];
      for (let entryIndex = row.values.length - 1; entryIndex >= 0; entryIndex -= 1) {
        const column = row.columns[entryIndex];
        if (column <= rowIndex) break;
        const term = row.values[entryIndex] * result[column];
        const adjusted = term - upperCorrection;
        const next = upperSum + adjusted;
        upperCorrection = (next - upperSum) - adjusted;
        upperSum = next;
      }
      result[rowIndex] = (
        diagonal[rowIndex] * forward[rowIndex] - upperSum
      ) / diagonal[rowIndex];
    }
    return result;
  };
}

function createJacobiPreconditioner(diagonal) {
  const result = new Float64Array(diagonal.length);
  return (residual) => {
    if (!residual || residual.length !== diagonal.length) {
      throw new TypeError('FH_JACOBI_PRECONDITIONER_SHAPE_MISMATCH');
    }
    for (let index = 0; index < diagonal.length; index += 1) {
      result[index] = residual[index] / diagonal[index];
    }
    return result;
  };
}

export function solveSgsPcg({
  rows,
  rhs,
  diagonal,
  policy = FLANGE_HUB_SOLVER_POLICY,
  context = 'UNSCOPED',
} = {}) {
  validateLinearSystemInputs({ rows, rhs, diagonal });
  return solvePreconditionedPcg({
    multiply: createTypedSparseMultiplier(rows),
    rhs,
    precondition: createSymmetricGaussSeidelPreconditioner(rows, diagonal),
    policy,
    context,
  });
}

export function solveJacobiPcg({
  multiply,
  rhs,
  diagonal,
  policy = FLANGE_HUB_SOLVER_POLICY,
  context = 'UNIT_JACOBI',
} = {}) {
  if (typeof multiply !== 'function') {
    throw new TypeError('FH_PCG_MULTIPLY_REQUIRED');
  }
  validateDiagonalAndRhs({ rhs, diagonal });
  return solvePreconditionedPcg({
    multiply,
    rhs,
    precondition: createJacobiPreconditioner(diagonal),
    policy,
    context,
  });
}

function solvePreconditionedPcg({
  multiply,
  rhs,
  precondition,
  policy,
  context,
}) {
  if (typeof multiply !== 'function' || typeof precondition !== 'function') {
    throw new TypeError('FH_PCG_OPERATOR_REQUIRED');
  }
  if (!rhs || rhs.length === 0) {
    throw new TypeError('FH_PCG_VECTOR_SHAPE_MISMATCH');
  }
  const n = rhs.length;
  const x = new Float64Array(n);
  let r = Float64Array.from(rhs);
  let z = precondition(r);
  if (!z || z.length !== n) {
    throw new TypeError('FH_PCG_PRECONDITIONER_SHAPE_MISMATCH');
  }
  let p = Float64Array.from(z);
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
    for (let index = 0; index < n; index += 1) {
      value[index] = rhs[index] - product[index];
    }
    return value;
  };
  const replaceResidual = (value) => {
    r = value;
    z = precondition(r);
    if (!z || z.length !== n) {
      throw new TypeError('FH_PCG_PRECONDITIONER_SHAPE_MISMATCH');
    }
    p = Float64Array.from(z);
    rz = dot(r, z);
    if (!Number.isFinite(rz) || !(rz > 0)) {
      throw new RangeError('FH_PCG_NONPOSITIVE_PRECONDITIONED_RESIDUAL');
    }
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
  } else if (!Number.isFinite(rz) || !(rz > 0)) {
    throw new RangeError('FH_PCG_NONPOSITIVE_PRECONDITIONED_RESIDUAL');
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
    for (let index = 0; index < n; index += 1) {
      x[index] += alpha * p[index];
      r[index] -= alpha * Ap[index];
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
    z = precondition(r);
    if (!z || z.length !== n) {
      throw new TypeError('FH_PCG_PRECONDITIONER_SHAPE_MISMATCH');
    }
    const nextRz = dot(r, z);
    if (!Number.isFinite(nextRz) || !(nextRz > 0)) {
      throw new RangeError('FH_PCG_NONPOSITIVE_PRECONDITIONED_RESIDUAL');
    }
    const beta = nextRz / rz;
    for (let index = 0; index < n; index += 1) {
      p[index] = z[index] + beta * p[index];
    }
    rz = nextRz;
  }
  const certified = explicitResidual();
  explicitResidualNorm = vectorNorm(certified);
  throw new RangeError(
    `FH_PCG_DID_NOT_CONVERGE:${context}:${maximumIterations}:`
    + `${explicitResidualNorm / denominatorNorm}`,
  );
}

function validateLinearSystemInputs({ rows, rhs, diagonal }) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length !== rhs?.length
    || rows.length !== diagonal?.length) {
    throw new TypeError('FH_PCG_ROW_SHAPE_MISMATCH');
  }
  rows.forEach((row, rowIndex) => {
    if (!(row?.columns instanceof Int32Array)
      || !(row?.values instanceof Float64Array)
      || row.columns.length !== row.values.length) {
      throw new TypeError('FH_PCG_TYPED_ROW_REQUIRED');
    }
    let previous = -1;
    let hasPositiveDiagonal = false;
    for (let entry = 0; entry < row.columns.length; entry += 1) {
      const column = row.columns[entry];
      const value = row.values[entry];
      if (!Number.isInteger(column) || column < 0 || column >= rows.length
        || column <= previous || !Number.isFinite(value)) {
        throw new TypeError('FH_PCG_TYPED_ROW_INVALID');
      }
      previous = column;
      if (column === rowIndex && value > 0) hasPositiveDiagonal = true;
    }
    if (!hasPositiveDiagonal) {
      throw new RangeError('FH_PCG_NONPOSITIVE_PRECONDITIONER');
    }
  });
  validateDiagonalAndRhs({ rhs, diagonal });
}

function validateDiagonalAndRhs({ rhs, diagonal }) {
  if (!rhs || !diagonal || rhs.length !== diagonal.length || rhs.length === 0) {
    throw new TypeError('FH_PCG_VECTOR_SHAPE_MISMATCH');
  }
  for (let index = 0; index < diagonal.length; index += 1) {
    if (!Number.isFinite(diagonal[index]) || !(diagonal[index] > 0)
      || !Number.isFinite(rhs[index])) {
      throw new RangeError('FH_PCG_NONPOSITIVE_PRECONDITIONER');
    }
  }
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

function multiplySparse(rows, vector) {
  const result = new Float64Array(rows.length);
  rows.forEach((row, index) => {
    const entries = [...row.entries()].sort(
      ([leftColumn], [rightColumn]) => leftColumn - rightColumn,
    );
    let sum = 0;
    let correction = 0;
    entries.forEach(([column, value]) => {
      const term = value * vector[column];
      const adjusted = term - correction;
      const next = sum + adjusted;
      correction = (next - sum) - adjusted;
      sum = next;
    });
    result[index] = sum;
  });
  return result;
}

function freeResidualNorm({ internal, force, freeDofs }) {
  let squared = 0;
  let correction = 0;
  freeDofs.forEach((dof) => {
    const residual = internal[dof] - force[dof];
    const term = residual ** 2;
    const adjusted = term - correction;
    const next = squared + adjusted;
    correction = (next - squared) - adjusted;
    squared = next;
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
  let correction = 0;
  for (let index = 0; index < left.length; index += 1) {
    const term = left[index] * right[index];
    const adjusted = term - correction;
    const next = sum + adjusted;
    correction = (next - sum) - adjusted;
    sum = next;
  }
  return sum;
}
function vectorNorm(value) {
  return Math.sqrt(dot(value, value));
}
function compensatedScalarSum(values) {
  let sum = 0;
  let correction = 0;
  values.forEach((value) => {
    const adjusted = value - correction;
    const next = sum + adjusted;
    correction = (next - sum) - adjusted;
    sum = next;
  });
  return sum;
}
function requireMesh(mesh) {
  if (!mesh || mesh.schema !== 'flange-hub-mesh-evidence/v1'
    || mesh.quality?.accepted !== true) {
    throw new TypeError('FH_QUALIFIED_MESH_REQUIRED');
  }
}
