import assert from 'node:assert/strict';
import {
  axisymmetricQ8Element,
  axisymmetricQ8Map,
  evaluateAxisymmetricQ8State,
} from './axisymmetric-q8-kernel.js';
import { integrateAxisymmetricQuadraticEdgeLoad } from './axisymmetric-edge-load.js';
import { recoverAxisymmetricAtPhysicalCoordinate } from './axisymmetric-recovery.js';
import {
  lameAxialReactionMagnitude,
  lamePlaneStrainEnergy,
  lamePlaneStrainReference,
} from './axisymmetric-independent-oracle.js';
import { Q8_GAUSS_POINTS } from './q8-kernel.js';
import { semanticHash } from '../shared-piping-model/index.js';

const LAME = Object.freeze({
  innerRadius: 50, outerRadius: 100, length: 25,
  youngsModulus: 210000, poissonRatio: 0.30,
  internalPressure: 10, externalPressure: 2,
});
const LAME_LEVELS = Object.freeze([
  Object.freeze({ levelId: 'M0', radialElements: 4, axialElements: 1 }),
  Object.freeze({ levelId: 'M1', radialElements: 8, axialElements: 2 }),
  Object.freeze({ levelId: 'M2', radialElements: 16, axialElements: 4 }),
  Object.freeze({ levelId: 'M3', radialElements: 32, axialElements: 8 }),
]);
const PROBE_RADII = Object.freeze([55, 70, 90]);

export function runLameLadder() {
  const levels = LAME_LEVELS.map((definition) => solveLameLevel(definition));
  const displacementRows = PROBE_RADII.map((radius) => convergenceRow(levels, radius, 'radialDisplacement'));
  const stressComponents = ['sigmaR', 'sigmaTheta', 'sigmaZ'];
  const stressRows = PROBE_RADII.flatMap((radius) => stressComponents.map((component) => convergenceRow(levels, radius, component)));
  const maximumTauAbsolute = Math.max(...levels.flatMap((level) => level.probes.map((probe) => Math.abs(probe.recovered.tauRZ))));
  const energyValues = levels.map((row) => row.energy.totalStrainEnergy);
  const finestLevelChange = relativeError(energyValues.at(-1), energyValues.at(-2));
  const analyticalError = relativeError(energyValues.at(-1), levels.at(-1).energy.analyticalReference);
  const virtualWorkRelativeError = relativeError(levels.at(-1).energy.totalStrainEnergy, 0.5 * levels.at(-1).energy.externalWork);
  return {
    benchmarkId: 'AXI-Q8-REG-001-B-LAME-PLANE-STRAIN',
    mechanicalInterpretation: 'LONG_CYLINDER_MERIDIONAL_SLICE_WITH_U_Z_ZERO_AT_ALL_NODES',
    parameters: LAME,
    levels,
    displacementConvergence: {
      rows: displacementRows,
      maximumFinestLevelChange: Math.max(...displacementRows.map((row) => row.finestLevelChange)),
      maximumAnalyticalError: Math.max(...displacementRows.map((row) => row.analyticalError)),
      limits: { finestLevelChange: 0.005, analyticalError: 0.01 },
    },
    stressConvergence: {
      rows: stressRows,
      maximumFinestLevelChange: Math.max(...stressRows.map((row) => row.finestLevelChange)),
      maximumAnalyticalError: Math.max(...stressRows.map((row) => row.analyticalError)),
      maximumTauAbsolute,
      limits: { finestLevelChange: 0.02, analyticalError: 0.03, tauAbsolute: 1e-8 },
    },
    energyConvergence: {
      values: energyValues,
      finestLevelChange,
      analyticalError,
      virtualWorkRelativeError,
      analyticalReference: levels.at(-1).energy.analyticalReference,
      limits: { finestLevelChange: 0.005, analyticalError: 0.01 },
    },
    axialReaction: {
      rows: levels.map((level) => ({
        levelId: level.levelId,
        top: level.axialReactions.top,
        bottom: level.axialReactions.bottom,
        expectedMagnitude: level.axialReactions.expectedMagnitude,
        topRelativeError: relativeError(level.axialReactions.top, level.axialReactions.expectedMagnitude),
        bottomRelativeError: relativeError(level.axialReactions.bottom, -level.axialReactions.expectedMagnitude),
      })),
      maximumRelativeError: Math.max(...levels.flatMap((level) => [
        relativeError(level.axialReactions.top, level.axialReactions.expectedMagnitude),
        relativeError(level.axialReactions.bottom, -level.axialReactions.expectedMagnitude),
      ])),
    },
  };
}

function solveLameLevel(definition) {
  const mesh = structuredAxisymmetricQ8Mesh(definition);
  const nodeIndex = new Map(mesh.nodes.map((node, index) => [node.nodeId, index]));
  const dofCount = 2 * mesh.nodes.length;
  const stiffnessRows = Array.from({ length: dofCount }, () => new Map());
  const force = new Float64Array(dofCount);
  const material = { youngsModulus: LAME.youngsModulus, poissonRatio: LAME.poissonRatio };

  mesh.elements.forEach((element) => {
    const nodes = element.nodeIds.map((nodeId) => mesh.nodes[nodeIndex.get(nodeId)]);
    const evidence = axisymmetricQ8Element({ elementId: element.elementId, nodes, material });
    const globalDofs = element.nodeIds.flatMap((nodeId) => {
      const index = nodeIndex.get(nodeId);
      return [2 * index, 2 * index + 1];
    });
    for (let row = 0; row < 16; row += 1) {
      const globalRow = stiffnessRows[globalDofs[row]];
      for (let column = 0; column < 16; column += 1) {
        const globalColumn = globalDofs[column];
        globalRow.set(globalColumn, (globalRow.get(globalColumn) ?? 0) + evidence.stiffness[row][column]);
      }
    }
  });

  const pressureBoundary = { innerQuadrature: 0, outerQuadrature: 0 };
  addPressureBoundary(0, LAME.internalPressure, () => [-1, 0], 'INNER');
  addPressureBoundary(2 * definition.radialElements, LAME.externalPressure, () => [1, 0], 'OUTER');
  function addPressureBoundary(radialGridIndex, pressure, normal, boundaryId) {
    for (let axial = 0; axial < definition.axialElements; axial += 1) {
      const nodeIds = [
        meshNodeId(radialGridIndex, 2 * axial),
        meshNodeId(radialGridIndex, 2 * axial + 1),
        meshNodeId(radialGridIndex, 2 * axial + 2),
      ];
      const evidence = integrateAxisymmetricQuadraticEdgeLoad({
        edgeId: `${boundaryId}-${axial + 1}`,
        nodes: nodeIds.map((nodeId) => mesh.nodes[nodeIndex.get(nodeId)]),
        pressureAt: pressure,
        outwardNormalAt: normal,
      });
      if (boundaryId === 'INNER') pressureBoundary.innerQuadrature += evidence.quadratureGeneralizedResultant.radial;
      else pressureBoundary.outerQuadrature += evidence.quadratureGeneralizedResultant.radial;
      evidence.consistentNodalForces.forEach((row) => {
        const index = nodeIndex.get(row.nodeId);
        force[2 * index] += row.radial;
        force[2 * index + 1] += row.axial;
      });
    }
  }

  const radialDofs = mesh.nodes.map((_node, index) => 2 * index);
  const radialPosition = new Map(radialDofs.map((dof, index) => [dof, index]));
  const rhs = Float64Array.from(radialDofs.map((dof) => force[dof]));
  const diagonal = Float64Array.from(radialDofs.map((dof) => stiffnessRows[dof].get(dof)));
  const multiplyRadial = (vector) => {
    const result = new Float64Array(vector.length);
    radialDofs.forEach((globalRow, row) => {
      let sum = 0;
      stiffnessRows[globalRow].forEach((value, globalColumn) => {
        const column = radialPosition.get(globalColumn);
        if (column !== undefined) sum += value * vector[column];
      });
      result[row] = sum;
    });
    return result;
  };
  const solution = pcg(multiplyRadial, rhs, diagonal);
  const displacement = new Float64Array(dofCount);
  radialDofs.forEach((dof, index) => { displacement[dof] = solution.solution[index]; });
  const internal = multiplySparse(stiffnessRows, displacement);
  let totalStrainEnergy = 0;
  let externalWork = 0;
  for (let index = 0; index < dofCount; index += 1) {
    totalStrainEnergy += 0.5 * displacement[index] * internal[index];
    externalWork += force[index] * displacement[index];
  }

  let topReaction = 0;
  let bottomReaction = 0;
  mesh.nodes.forEach((node, index) => {
    const reaction = internal[2 * index + 1] - force[2 * index + 1];
    if (Math.abs(node.z - LAME.length) <= 1e-12) topReaction += reaction;
    if (Math.abs(node.z) <= 1e-12) bottomReaction += reaction;
  });

  const elementStates = new Map();
  mesh.elements.forEach((element) => {
    const nodes = element.nodeIds.map((nodeId) => mesh.nodes[nodeIndex.get(nodeId)]);
    const elementDisplacement = element.nodeIds.flatMap((nodeId) => {
      const index = nodeIndex.get(nodeId);
      return [displacement[2 * index], displacement[2 * index + 1]];
    });
    elementStates.set(element.elementId, {
      nodes,
      gaussPoints: evaluateAxisymmetricQ8State({ nodes, material, displacementVector: elementDisplacement }),
    });
  });

  const probes = PROBE_RADII.map((radius) => {
    const z = LAME.length / 2;
    const element = mesh.elements.find((row) => (
      radius >= row.r0 - 1e-12 && radius <= row.r1 + 1e-12
      && z >= row.z0 - 1e-12 && z <= row.z1 + 1e-12
    ));
    assert.ok(element, `No containing element for r=${radius}.`);
    const state = elementStates.get(element.elementId);
    const nodalDisplacements = element.nodeIds.map((nodeId) => {
      const index = nodeIndex.get(nodeId);
      return { nodeId, radial: displacement[2 * index], axial: displacement[2 * index + 1] };
    });
    const recovered = recoverAxisymmetricAtPhysicalCoordinate({
      elementId: element.elementId,
      nodes: state.nodes,
      point: { r: radius, z },
      gaussPointResults: state.gaussPoints,
      nodalDisplacements,
    });
    const reference = lamePlaneStrainReference({ ...LAME, radius });
    return {
      radius,
      z,
      containingElementId: recovered.containingElementId,
      naturalCoordinates: recovered.naturalCoordinates,
      mappingResidual: recovered.mappingResidual,
      sourceGaussPointIds: recovered.sourceGaussPointIds,
      interpolationWeights: recovered.interpolationWeights,
      recovered: {
        radialDisplacement: recovered.displacement.radial,
        sigmaR: recovered.recoveredTensor.sigmaR,
        sigmaTheta: recovered.recoveredTensor.sigmaTheta,
        sigmaZ: recovered.recoveredTensor.sigmaZ,
        tauRZ: recovered.recoveredTensor.tauRZ,
      },
      reference,
      probeH: Math.max(element.r1 - element.r0, element.z1 - element.z0),
    };
  });

  const quality = axisymmetricMeshQuality(mesh);
  const innerExpected = 2 * Math.PI * LAME.innerRadius * LAME.length * LAME.internalPressure;
  const outerExpected = -2 * Math.PI * LAME.outerRadius * LAME.length * LAME.externalPressure;
  return {
    levelId: definition.levelId,
    radialElements: definition.radialElements,
    axialElements: definition.axialElements,
    elementCount: mesh.elements.length,
    nodeCount: mesh.nodes.length,
    globalH: Math.max(
      (LAME.outerRadius - LAME.innerRadius) / definition.radialElements,
      LAME.length / definition.axialElements,
    ),
    meshHash: semanticHash(mesh),
    canonicalModelHash: semanticHash({
      formulation: 'AXISYMMETRIC', elementProfile: 'AXI_Q8_FULL_3X3',
      geometry: LAME, meshHash: semanticHash(mesh), constraints: 'U_Z_ZERO_ALL_NODES',
    }),
    quality,
    solver: {
      method: 'DETERMINISTIC_JACOBI_PCG',
      freeDofCount: radialDofs.length,
      iterations: solution.iterations,
      relativeResidual: solution.relativeResidual,
    },
    pressureBoundary: {
      innerQuadrature: pressureBoundary.innerQuadrature,
      outerQuadrature: pressureBoundary.outerQuadrature,
      innerExpected,
      outerExpected,
      innerRelativeError: relativeError(pressureBoundary.innerQuadrature, innerExpected),
      outerRelativeError: relativeError(pressureBoundary.outerQuadrature, outerExpected),
    },
    energy: {
      totalStrainEnergy,
      externalWork,
      analyticalReference: lamePlaneStrainEnergy(LAME),
    },
    axialReactions: {
      top: topReaction,
      bottom: bottomReaction,
      expectedMagnitude: lameAxialReactionMagnitude(LAME),
    },
    probes,
  };
}

function convergenceRow(levels, radius, field) {
  const values = levels.map((level) => {
    const probe = level.probes.find((row) => row.radius === radius);
    return { levelId: level.levelId, probeH: probe.probeH, value: probe.recovered[field], reference: field === 'radialDisplacement' ? probe.reference.radialDisplacement : probe.reference[field] };
  });
  return {
    radius,
    field,
    values,
    finestLevelChange: relativeError(values.at(-1).value, values.at(-2).value),
    analyticalError: relativeError(values.at(-1).value, values.at(-1).reference),
  };
}

function structuredAxisymmetricQ8Mesh(definition) {
  const nodes = [];
  for (let axial = 0; axial <= 2 * definition.axialElements; axial += 1) {
    for (let radial = 0; radial <= 2 * definition.radialElements; radial += 1) {
      if (radial % 2 === 1 && axial % 2 === 1) continue;
      nodes.push({
        nodeId: meshNodeId(radial, axial),
        r: LAME.innerRadius + (LAME.outerRadius - LAME.innerRadius) * radial / (2 * definition.radialElements),
        z: LAME.length * axial / (2 * definition.axialElements),
      });
    }
  }
  const elements = [];
  for (let axial = 0; axial < definition.axialElements; axial += 1) {
    for (let radial = 0; radial < definition.radialElements; radial += 1) {
      elements.push({
        elementId: `E-R${radial + 1}-Z${axial + 1}`,
        nodeIds: [
          meshNodeId(2 * radial, 2 * axial),
          meshNodeId(2 * radial + 2, 2 * axial),
          meshNodeId(2 * radial + 2, 2 * axial + 2),
          meshNodeId(2 * radial, 2 * axial + 2),
          meshNodeId(2 * radial + 1, 2 * axial),
          meshNodeId(2 * radial + 2, 2 * axial + 1),
          meshNodeId(2 * radial + 1, 2 * axial + 2),
          meshNodeId(2 * radial, 2 * axial + 1),
        ],
        r0: LAME.innerRadius + (LAME.outerRadius - LAME.innerRadius) * radial / definition.radialElements,
        r1: LAME.innerRadius + (LAME.outerRadius - LAME.innerRadius) * (radial + 1) / definition.radialElements,
        z0: LAME.length * axial / definition.axialElements,
        z1: LAME.length * (axial + 1) / definition.axialElements,
      });
    }
  }
  return { nodes, elements };
}

function axisymmetricMeshQuality(mesh) {
  const nodeById = new Map(mesh.nodes.map((node) => [node.nodeId, node]));
  const controlPoints = [
    [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [0, 0],
  ];
  let minimumDeterminant = Number.POSITIVE_INFINITY;
  let maximumDeterminant = 0;
  let minimumScaledJacobian = Number.POSITIVE_INFINITY;
  let maximumAspectRatio = 0;
  let maximumMidsidePlacementResidual = 0;
  mesh.elements.forEach((element) => {
    const nodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
    [...Q8_GAUSS_POINTS.map((row) => [row.xi, row.eta]), ...controlPoints].forEach(([xi, eta]) => {
      const mapped = axisymmetricQ8Map(nodes, xi, eta);
      minimumDeterminant = Math.min(minimumDeterminant, mapped.determinant);
      maximumDeterminant = Math.max(maximumDeterminant, mapped.determinant);
      const a = Math.hypot(mapped.drDxi, mapped.dzDxi);
      const b = Math.hypot(mapped.drDeta, mapped.dzDeta);
      minimumScaledJacobian = Math.min(minimumScaledJacobian, mapped.determinant / (a * b));
    });
    const corners = nodes.slice(0, 4);
    const lengths = corners.map((node, index) => Math.hypot(node.r - corners[(index + 1) % 4].r, node.z - corners[(index + 1) % 4].z));
    maximumAspectRatio = Math.max(maximumAspectRatio, Math.max(...lengths) / Math.min(...lengths));
    [[0, 1, 4], [1, 2, 5], [2, 3, 6], [3, 0, 7]].forEach(([a, b, m]) => {
      maximumMidsidePlacementResidual = Math.max(maximumMidsidePlacementResidual, Math.hypot(
        nodes[m].r - (nodes[a].r + nodes[b].r) / 2,
        nodes[m].z - (nodes[a].z + nodes[b].z) / 2,
      ));
    });
  });
  const qJDeterminantRatio = minimumDeterminant / maximumDeterminant;
  assert.ok(minimumDeterminant > 0);
  assert.ok(qJDeterminantRatio >= 0.2);
  assert.ok(minimumScaledJacobian >= 0.2);
  assert.ok(maximumAspectRatio <= 10);
  assert.ok(maximumMidsidePlacementResidual <= 1e-9);
  return {
    minimumDetJ: minimumDeterminant,
    maximumDetJ: maximumDeterminant,
    qJDeterminantRatio,
    minimumScaledJacobian,
    maximumAspectRatio,
    maximumMidsidePlacementResidual,
  };
}

function pcg(multiply, rightHandSide, diagonal) {
  const count = rightHandSide.length;
  const solution = new Float64Array(count);
  const residual = Float64Array.from(rightHandSide);
  const preconditioned = new Float64Array(count);
  const direction = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    if (!Number.isFinite(diagonal[index]) || !(diagonal[index] > 0)) throw new RangeError('BB10_PCG_INVALID_DIAGONAL');
    preconditioned[index] = residual[index] / diagonal[index];
    direction[index] = preconditioned[index];
  }
  let residualPreconditioned = dot(residual, preconditioned);
  const rhsNorm = Math.max(1, Math.sqrt(dot(rightHandSide, rightHandSide)));
  const iterationLimit = Math.max(1000, 20 * count);
  for (let iteration = 1; iteration <= iterationLimit; iteration += 1) {
    const product = multiply(direction);
    const denominator = dot(direction, product);
    if (!(denominator > 0)) throw new RangeError('BB10_PCG_NONPOSITIVE_DIRECTIONAL_STIFFNESS');
    const alpha = residualPreconditioned / denominator;
    for (let index = 0; index < count; index += 1) {
      solution[index] += alpha * direction[index];
      residual[index] -= alpha * product[index];
    }
    const residualNorm = Math.sqrt(dot(residual, residual));
    if (residualNorm <= 1e-11 * rhsNorm) {
      return { solution, iterations: iteration, relativeResidual: residualNorm / rhsNorm };
    }
    for (let index = 0; index < count; index += 1) preconditioned[index] = residual[index] / diagonal[index];
    const next = dot(residual, preconditioned);
    const beta = next / residualPreconditioned;
    for (let index = 0; index < count; index += 1) direction[index] = preconditioned[index] + beta * direction[index];
    residualPreconditioned = next;
  }
  throw new Error('BB10_PCG_ITERATION_LIMIT');
}

function multiplySparse(rows, vector) {
  const result = new Float64Array(vector.length);
  rows.forEach((row, rowIndex) => {
    let sum = 0;
    row.forEach((value, column) => { sum += value * vector[column]; });
    result[rowIndex] = sum;
  });
  return result;
}

function relativeError(observed, reference) { return Math.abs(observed - reference) / Math.max(1e-30, Math.abs(reference)); }
function meshNodeId(i, j) { return `N-${i}-${j}`; }
function dot(left, right) { return left.reduce((sum, value, index) => sum + value * right[index], 0); }
