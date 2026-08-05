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
import {
  FLANGE_HUB_SOLVER_POLICY,
  solveJacobiPcg,
} from './flange-hub-solver.js';

export const FLANGE_HUB_DIAGNOSTIC_SOLVER_POLICY = deepFreeze({
  diagnosticPolicyId: 'BKT-B-FLANGE-HUB-BOUNDED-PROBE-DIAGNOSTIC-V1',
  authority: 'NON_AUTHORIZING_DIAGNOSTIC_ONLY',
  productionSolverModified: false,
  productionMeshFamilyModified: false,
  qualificationAuthorityGranted: false,
  productionAuthorityGranted: false,
  mergeAuthorityGranted: false,
  bb12Authorized: false,
  recoveryMode: 'EXACT_SHARED_NODE_AND_ADJACENT_B03_B04_ENERGY_ONLY',
  retainedFieldPolicy: 'SCALAR_CERTIFICATES_AND_BOUNDED_INTERFACE_PATCH',
});

const DEFAULT_PROBE = deepFreeze({
  probeId: 'P-HUB-MID',
  r: 62.75,
  z: 30,
});
const PATCH_BLOCK_IDS = deepFreeze(['FH-B03', 'FH-B04']);
const COORDINATE_TOLERANCE = 1e-9;

export function solveFlangeHubDiagnosticProbe({
  mesh,
  loadCaseId = 'FH-AXIAL-001',
  probe = DEFAULT_PROBE,
} = {}) {
  requireMesh(mesh);
  if (loadCaseId !== 'FH-AXIAL-001') {
    throw new TypeError(`FH_DIAGNOSTIC_LOAD_CASE_FORBIDDEN:${loadCaseId}`);
  }
  requireProbe(probe);

  const loadDefinition = createFlangeHubLoadDefinition(loadCaseId);
  const nodes = mesh.nodes;
  const nodeIndex = new Map(nodes.map((node, index) => [node.nodeId, index]));
  const nodesById = new Map(nodes.map((node) => [node.nodeId, node]));
  const dofCount = 2 * nodes.length;
  const stiffnessRows = Array.from({ length: dofCount }, () => new Map());
  const force = new Float64Array(dofCount);

  mesh.elements.forEach((element) => {
    const elementNodes = element.nodeIds.map((nodeId) => nodesById.get(nodeId));
    const kernel = axisymmetricQ8Element({
      elementId: element.elementId,
      nodes: elementNodes,
      material: FLANGE_HUB_MATERIAL_PROFILE,
    });
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

  const probeNodeIndex = findExactProbeNodeIndex(nodes, probe);
  const probeNode = nodes[probeNodeIndex];
  const probeDisplacement = {
    radial: displacement[2 * probeNodeIndex],
    axial: displacement[2 * probeNodeIndex + 1],
  };
  const patch = recoverBoundedPatch({
    mesh,
    nodesById,
    nodeIndex,
    displacement,
    probeNode,
    strainEnergy,
  });
  const quality = boundedQualitySummary(mesh.quality);
  const blockCounts = mesh.blocks.map((block) => deepFreeze({
    blockId: block.blockId,
    longitudinalElementCount: block.longitudinalElementCount,
    transverseElementCount: block.transverseElementCount,
    elementCount: block.elementIds.length,
  }));
  const loadRoleCounts = Object.fromEntries(
    [...new Set(loadEvidence.edges.map((row) => row.role))]
      .sort()
      .map((role) => [
        role,
        loadEvidence.edges.filter((row) => row.role === role).length,
      ]),
  );

  const payload = {
    schema: 'flange-hub-bounded-probe-diagnostic/v1',
    moduleId: 'C2D-FLANGE-HUB',
    diagnosticPolicy: FLANGE_HUB_DIAGNOSTIC_SOLVER_POLICY,
    levelId: mesh.levelId,
    loadCaseId,
    geometryHash: mesh.geometryHash,
    meshHash: mesh.meshHash,
    meshCanonicalModelHash: mesh.canonicalModelHash,
    diagnosticModelHash: semanticHash({
      meshCanonicalModelHash: mesh.canonicalModelHash,
      loadDefinitionHash: loadDefinition.semanticHash,
      productionSolverPolicy: FLANGE_HUB_SOLVER_POLICY,
      diagnosticPolicy: FLANGE_HUB_DIAGNOSTIC_SOLVER_POLICY,
      probe,
    }),
    mesh: {
      meshFamilyId: mesh.meshFamilyId,
      refinement: mesh.refinement,
      nodeCount: mesh.nodeCount,
      elementCount: mesh.elementCount,
      boundaryEdgeCount: mesh.boundaryEdges.length,
      globalH: mesh.globalH,
      quality,
      blockCounts,
    },
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
    load: {
      loadDefinitionHash: loadDefinition.semanticHash,
      edgeCount: loadEvidence.edges.length,
      roleCounts: loadRoleCounts,
      totalQuadratureResultant: loadEvidence.totalQuadratureResultant,
      totalNodalResultant: loadEvidence.totalNodalResultant,
      normalizedMismatch: loadEvidence.normalizedMismatch,
      circumferenceAppliedExactlyOnce: loadEvidence.circumferenceAppliedExactlyOnce,
    },
    constraints: {
      constrainedDofCount: constrainedDofs.length,
      component: 'UZ',
      radialMotionFree: true,
      boundaryIds: [...new Set(constrainedDofs.map((row) => row.boundaryId))].sort(),
    },
    probe: {
      probeId: probe.probeId,
      physicalCoordinate: { r: probe.r, z: probe.z },
      nodalId: probeNode.nodeId,
      nodalOwnership: probeNode.ownership,
      nodalDistance: Math.hypot(probeNode.r - probe.r, probeNode.z - probe.z),
      radial: probeDisplacement.radial,
      axial: probeDisplacement.axial,
      vectorNorm: Math.hypot(probeDisplacement.radial, probeDisplacement.axial),
    },
    patch,
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
    qualificationAuthorityGranted: false,
    productionAuthorityGranted: false,
    mergeAuthorityGranted: false,
    bb12Authorized: false,
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function recoverBoundedPatch({
  mesh,
  nodesById,
  nodeIndex,
  displacement,
  probeNode,
  strainEnergy,
}) {
  const adjacentElements = mesh.elements
    .filter((element) => (
      PATCH_BLOCK_IDS.includes(element.blockId)
      && element.nodeIds.includes(probeNode.nodeId)
    ))
    .sort((left, right) => left.elementId.localeCompare(right.elementId));
  PATCH_BLOCK_IDS.forEach((blockId) => {
    if (!adjacentElements.some((element) => element.blockId === blockId)) {
      throw new RangeError(`FH_DIAGNOSTIC_PATCH_BLOCK_MISSING:${blockId}`);
    }
  });

  const elementEnergyRows = adjacentElements.map((element) => {
    const elementNodes = element.nodeIds.map((nodeId) => nodesById.get(nodeId));
    const elementDisplacement = element.nodeIds.flatMap((nodeId) => {
      const index = nodeIndex.get(nodeId);
      return [displacement[2 * index], displacement[2 * index + 1]];
    });
    const energy = evaluateAxisymmetricQ8State({
      nodes: elementNodes,
      material: FLANGE_HUB_MATERIAL_PROFILE,
      displacementVector: elementDisplacement,
    }).reduce((total, state) => total + 0.5 * (
      state.strain.epsilonR * state.stress.sigmaR
      + state.strain.epsilonZ * state.stress.sigmaZ
      + state.strain.epsilonTheta * state.stress.sigmaTheta
      + state.strain.gammaRZ * state.stress.tauRZ
    ) * state.circumferenceFactor
      * state.determinant
      * state.quadratureWeight, 0);
    if (!Number.isFinite(energy) || energy < -1e-12) {
      throw new RangeError(`FH_DIAGNOSTIC_PATCH_ENERGY_INVALID:${element.elementId}:${energy}`);
    }
    return deepFreeze({
      elementId: element.elementId,
      blockId: element.blockId,
      localIndices: element.localIndices,
      energy,
    });
  });
  const energyByBlock = Object.fromEntries(PATCH_BLOCK_IDS.map((blockId) => [
    blockId,
    elementEnergyRows
      .filter((row) => row.blockId === blockId)
      .reduce((sum, row) => sum + row.energy, 0),
  ]));
  const totalEnergy = elementEnergyRows.reduce((sum, row) => sum + row.energy, 0);
  return deepFreeze({
    blockIds: PATCH_BLOCK_IDS,
    elementCount: elementEnergyRows.length,
    elements: elementEnergyRows,
    energyByBlock,
    totalEnergy,
    fractionOfGlobalStrainEnergy: totalEnergy / strainEnergy,
  });
}

function boundedQualitySummary(quality) {
  const { elementQuality: _elementQuality, ...aggregate } = quality;
  return deepFreeze({
    ...aggregate,
    elementQualityCount: quality.elementQuality.length,
  });
}

function findExactProbeNodeIndex(nodes, probe) {
  const matches = [];
  nodes.forEach((node, index) => {
    const distance = Math.hypot(node.r - probe.r, node.z - probe.z);
    if (distance <= COORDINATE_TOLERANCE) matches.push({ index, distance });
  });
  if (matches.length !== 1) {
    throw new RangeError(`FH_DIAGNOSTIC_PROBE_NODE_COUNT:${matches.length}`);
  }
  return matches[0].index;
}

function requireProbe(probe) {
  if (!probe || typeof probe.probeId !== 'string'
    || !Number.isFinite(probe.r) || !Number.isFinite(probe.z)) {
    throw new TypeError('FH_DIAGNOSTIC_PROBE_REQUIRED');
  }
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
