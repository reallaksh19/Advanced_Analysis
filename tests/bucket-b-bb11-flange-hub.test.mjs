import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLANGE_HUB_FROZEN_INPUT,
  createBenchmarkRecord,
  createCanonicalFlangeHubGeometry,
  createFlangeHubLoadDefinition,
  createFlangeHubMesh,
  createFlangeHubPathDefinitions,
  closedEndLameReference,
  invertAxisymmetricQ8Mapping,
  prismaticAnnularAxialReference,
  verifyReversedEdgeInvariance,
} from '../src/core/bucket-b/index.js';
import {
  solveIndependentOracleLinearSystem,
} from '../src/core/bucket-b/flange-hub-independent-oracle.js';
import {
  FLANGE_HUB_SOLVER_POLICY,
  solveJacobiPcg,
} from '../src/core/bucket-b/flange-hub-solver.js';

test('BB-11 frozen geometry creates exact tangent fillets', () => {
  const geometry = createCanonicalFlangeHubGeometry();
  assert.equal(geometry.validation.accepted, true);
  assert.equal(geometry.geometryId, 'BKT-B-FLANGE-GEOMETRY-V1');
  geometry.fillets.forEach((fillet) => {
    assert.ok(fillet.radiusResidual <= 1e-10);
    assert.ok(fillet.tangentResidual <= 1e-12);
    assert.ok(fillet.positionResidual <= 1e-10);
  });
  assert.throws(
    () => createCanonicalFlangeHubGeometry({ ...FLANGE_HUB_FROZEN_INPUT, state: 'QUALIFIED' }),
    /FIELD_SET_MISMATCH/,
  );
  assert.throws(
    () => createCanonicalFlangeHubGeometry({ ...FLANGE_HUB_FROZEN_INPUT, pipeWallThickness: -10 }),
    /FROZEN_VALUE_MISMATCH/,
  );
});

test('BB-11 M0 mesh is deterministic and meets registered quality', () => {
  const geometry = createCanonicalFlangeHubGeometry();
  const first = createFlangeHubMesh('M0', geometry);
  const second = createFlangeHubMesh('M0', geometry);
  assert.equal(first.meshHash, second.meshHash);
  assert.equal(first.canonicalModelHash, second.canonicalModelHash);
  assert.deepEqual(first.nodes, second.nodes);
  assert.deepEqual(first.elements, second.elements);
  assert.equal(first.quality.accepted, true);
  assert.ok(first.quality.minimumDetJAtGaussPoints > 0);
  assert.ok(first.quality.minimumDetJAtControlPoints > 0);
  assert.ok(first.quality.qJDeterminantRatio >= 0.20);
  assert.ok(first.quality.minimumScaledJacobian >= 0.20);
  assert.ok(first.quality.maximumAspectRatio <= 10);
  assert.ok(first.quality.maximumHotspotAspectRatio <= 5);
  assert.ok(first.quality.midsidePlacementResidual <= 1e-9);
  assert.equal(first.duplicateInterfaceNodes.length, 0);
});

test('BB-11 fixed paths invert below governed residual tolerance at M0 through M3', () => {
  const geometry = createCanonicalFlangeHubGeometry();
  const definitions = createFlangeHubPathDefinitions(geometry);
  let targetedLargeHubSample = null;

  for (const levelId of ['M0', 'M1', 'M2', 'M3']) {
    const mesh = createFlangeHubMesh(levelId, geometry);
    const nodesById = new Map(mesh.nodes.map((node) => [node.nodeId, node]));
    const elementRows = mesh.elements.map((element) => ({
      ...element,
      nodes: element.nodeIds.map((nodeId) => nodesById.get(nodeId)),
    }));

    definitions.paths.forEach((path) => path.points.forEach((point, pointIndex) => {
      const recoveries = elementRows
        .filter((element) => path.expectedBlockIds.includes(element.blockId))
        .filter((element) => pointInElementBoundingBox(point, element.nodes))
        .map((element) => ({
          element,
          inverse: invertAxisymmetricQ8Mapping(element.nodes, point, { tolerance: 1e-11 }),
        }))
        .filter(({ inverse }) => inverse.converged
          && Math.abs(inverse.xi) <= 1 + 1e-9
          && Math.abs(inverse.eta) <= 1 + 1e-9);

      assert.ok(
        recoveries.length > 0,
        `${levelId}:${path.pathId}:S${String(pointIndex + 1).padStart(2, '0')} has no governed containing element`,
      );
      const selected = recoveries.sort((left, right) => (
        naturalMargin(right.inverse) - naturalMargin(left.inverse)
        || left.element.elementId.localeCompare(right.element.elementId)
      ))[0];
      const corners = selected.element.nodes.slice(0, 4);
      const probeH = Math.max(...corners.map((node, index) => (
        pointDistance(node, corners[(index + 1) % 4])
      )));
      const acceptance = Math.max(1e-10, 1e-10 * probeH);
      assert.ok(
        selected.inverse.mappingResidual <= acceptance,
        `${levelId}:${path.pathId}:S${String(pointIndex + 1).padStart(2, '0')} residual ${selected.inverse.mappingResidual} exceeds ${acceptance}`,
      );
      if (levelId === 'M3' && path.pathId === 'SCL-HUB-LARGE' && pointIndex === 13) {
        targetedLargeHubSample = {
          elementId: selected.element.elementId,
          residual: selected.inverse.mappingResidual,
          acceptance,
        };
      }
    }));
  }

  assert.ok(targetedLargeHubSample, 'M3 SCL-HUB-LARGE:S14 regression was not executed');
  assert.ok(targetedLargeHubSample.residual <= targetedLargeHubSample.acceptance);
});

test('BB-11 load definitions preserve sign and reversed-edge invariance', () => {
  const mesh = createFlangeHubMesh('M0');
  const nodes = new Map(mesh.nodes.map((node) => [node.nodeId, node]));
  const pressure = createFlangeHubLoadDefinition('FH-PRES-001');
  assert.ok(pressure.equivalentEndThrust < 0);
  assert.ok(Math.abs(pressure.equivalentEndThrust + 10 * Math.PI * 50 ** 2) <= 1e-10);
  const bore = mesh.boundaryEdges.find((edge) => edge.boundaryId === 'FH-BOUNDARY-BORE');
  const evidence = verifyReversedEdgeInvariance({
    edge: {
      edgeId: bore.edgeId,
      nodes: bore.nodeIds.map((id) => nodes.get(id)),
      outwardNormal: bore.outwardNormal,
    },
    mode: 'PRESSURE',
    value: 10,
  });
  assert.equal(evidence.accepted, true);
  assert.ok(evidence.relativeDifference <= 1e-10);
});

test('BB-11 analytical references distinguish closed-end and axial-member mechanics', () => {
  const lame = closedEndLameReference({
    innerRadius: 50,
    outerRadius: 60,
    internalPressure: 10,
    externalPressure: 0,
    youngsModulus: 210000,
    poissonRatio: 0.30,
    radius: 55,
  });
  assert.ok(lame.sigmaTheta > lame.sigmaZ);
  assert.ok(lame.sigmaZ > 0);
  assert.ok(lame.radialDisplacement > 0);
  const axial = prismaticAnnularAxialReference({
    innerRadius: 50,
    outerRadius: 60,
    length: 100,
    axialResultant: 100000,
    youngsModulus: 210000,
    poissonRatio: 0.30,
    radius: 55,
  });
  assert.ok(axial.sigmaZ > 0);
  assert.ok(axial.strainEnergy > 0);
});

test('BB-11 PCG certifies the production residual and exercises deterministic replacement', () => {
  const certify = ({ matrix, rhs, solution, policy }) => {
    const multiply = (vector) => Float64Array.from(matrix.map((row) => (
      row.reduce((sum, value, column) => sum + value * vector[column], 0)
    )));
    const explicitResidual = Float64Array.from(multiply(solution.vector), (value, index) => (
      value - rhs[index]
    ));
    const explicitResidualNorm = Math.sqrt(
      explicitResidual.reduce((sum, value) => sum + value ** 2, 0),
    );
    const rhsNorm = Math.sqrt(rhs.reduce((sum, value) => sum + value ** 2, 0));
    const tolerance = Math.max(
      policy.absoluteResidualTolerance,
      policy.relativeResidualTolerance * rhsNorm,
    );
    assert.ok(explicitResidualNorm <= tolerance);
    assert.ok(Math.abs(explicitResidualNorm - solution.explicitResidualNorm) <= 1e-10);
    assert.ok(solution.relativeResidual <= policy.relativeResidualTolerance);
  };

  const productionMatrix = [
    [4, 1, 0],
    [1, 3, 1],
    [0, 1, 2],
  ];
  const productionRhs = Float64Array.from([1, 2, 3]);
  const productionMultiply = (vector) => Float64Array.from(
    productionMatrix.map((row) => row.reduce(
      (sum, value, column) => sum + value * vector[column],
      0,
    )),
  );
  const productionSolution = solveJacobiPcg({
    multiply: productionMultiply,
    rhs: productionRhs,
    diagonal: Float64Array.from([4, 3, 2]),
    policy: FLANGE_HUB_SOLVER_POLICY,
  });
  assert.equal(FLANGE_HUB_SOLVER_POLICY.stoppingCriterion, 'EXPLICIT_REDUCED_SYSTEM_RESIDUAL');
  assert.equal(FLANGE_HUB_SOLVER_POLICY.relativeResidualTolerance, 1e-12);
  certify({
    matrix: productionMatrix,
    rhs: productionRhs,
    solution: productionSolution,
    policy: FLANGE_HUB_SOLVER_POLICY,
  });

  const replacementMatrix = [
    [260540.684223896, 134390.7176773181, 10563.593440651774, 106773.17388776125, -182202.7550541164, 346171.37103598577],
    [134390.7176773181, 77368.06321251801, -5146.841634026626, 71692.2047941879, -106627.29063906257, 184531.9402200637],
    [10563.593440651774, -5146.841634026626, 16089.734328529348, -22023.398789019266, 11755.66422880915, 2600.6011287125907],
    [106773.17388776127, 71692.2047941879, -22023.398789019266, 90076.09026088555, -107238.03851437203, 163837.1244290935],
    [-182202.7550541164, -106627.29063906257, 11755.66422880915, -107238.03851437203, 151133.71244079166, -256584.70158791987],
    [346171.3710359858, 184531.9402200637, 2600.6011287125903, 163837.1244290935, -256584.70158791987, 472136.5592620091],
  ];
  const replacementRhs = Float64Array.from([
    2812.9339433121654,
    105248.90801934985,
    -18313.08376035325,
    -76204.72060288778,
    -96990.1629041906,
    -22172.613995949156,
  ]);
  const replacementMultiply = (vector) => Float64Array.from(
    replacementMatrix.map((row) => row.reduce(
      (sum, value, column) => sum + value * vector[column],
      0,
    )),
  );
  const replacementPolicy = {
    ...FLANGE_HUB_SOLVER_POLICY,
    relativeResidualTolerance: 1e-10,
    absoluteResidualTolerance: 1e-8,
    residualReplacementInterval: 5,
  };
  const replacementSolution = solveJacobiPcg({
    multiply: replacementMultiply,
    rhs: replacementRhs,
    diagonal: Float64Array.from(
      replacementMatrix.map((row, index) => row[index]),
    ),
    policy: replacementPolicy,
  });
  assert.ok(replacementSolution.residualReplacementCount >= 1);
  certify({
    matrix: replacementMatrix,
    rhs: replacementRhs,
    solution: replacementSolution,
    policy: replacementPolicy,
  });
});

test('BB-11 independent oracle SGS-PCG solves an SPD system with explicit residual custody', () => {
  const rows = [
    [{ column: 0, value: 4 }, { column: 1, value: 1 }],
    [{ column: 0, value: 1 }, { column: 1, value: 3 }, { column: 2, value: 1 }],
    [{ column: 1, value: 1 }, { column: 2, value: 2 }],
  ];
  const rhs = Float64Array.from([1, 2, 3]);
  const solved = solveIndependentOracleLinearSystem({ rows, rhs });
  const expected = [2 / 9, 1 / 9, 13 / 9];
  expected.forEach((value, index) => {
    assert.ok(Math.abs(solved.x[index] - value) <= 1e-10);
  });
  assert.ok(solved.relativeResidual <= 1e-10);
  assert.ok(solved.explicitResidualNorm <= 1e-8);
});

test('BB-11 registry rejects direct caller state', () => {
  assert.throws(
    () => createBenchmarkRecord({
      moduleId: 'C2D-FLANGE-HUB',
      recordKind: 'CORE',
      state: 'FORMULATION_QUALIFIED',
    }),
    /state.*authority/i,
  );
});

function pointInElementBoundingBox(point, nodes) {
  const radii = nodes.map((node) => node.r);
  const axial = nodes.map((node) => node.z);
  return point.r >= Math.min(...radii) - 1e-9
    && point.r <= Math.max(...radii) + 1e-9
    && point.z >= Math.min(...axial) - 1e-9
    && point.z <= Math.max(...axial) + 1e-9;
}
function naturalMargin(inverse) {
  return Math.min(1 - Math.abs(inverse.xi), 1 - Math.abs(inverse.eta));
}
function pointDistance(left, right) {
  return Math.hypot(left.r - right.r, left.z - right.z);
}
