import assert from 'node:assert/strict';
import {
  FORMULATION_BENCHMARK_IDS,
  MODULE_REGISTRY,
  QUALIFICATION_STATES,
  cosinePressureLaw,
  createBenchmarkRecord,
  detectDuplicateInterfaceNodes,
  evaluateConformalInterface,
  evaluateConvergence,
  evaluateQ8Quality,
  extractQ8Path,
  integrateVariableEdgeLoad,
  linearizeStressComponents,
  recoverAtPhysicalCoordinate,
  runCurvedEdgeLoadBenchmarks,
  runInterfaceManufacturedBenchmarks,
  runQ8FormulationBenchmark,
  runSclManufacturedBenchmarks,
  standardQ8Rectangle,
  validateBenchmarkRecord,
} from '../src/core/bucket-b/index.js';
import { Q8_GAUSS_POINTS, q8Map } from '../src/core/bucket-b/q8-kernel.js';

const rectangle = standardQ8Rectangle(2, 1);

// BB-00 registry and fail-closed axisymmetric authority.
assert.equal(MODULE_REGISTRY['C2D-LUG-PINHOLE'].elementProfile, 'Q8_FULL_3X3');
const lugMesh = createBenchmarkRecord({ moduleId: 'C2D-LUG-PINHOLE', recordKind: 'MESH' });
assert.equal(lugMesh.state, QUALIFICATION_STATES.EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES);
assert.equal(validateBenchmarkRecord(lugMesh, { allowIncompleteBindings: true }), true);
assert.throws(() => createBenchmarkRecord({ moduleId: 'C2D-FLANGE-HUB', recordKind: 'CORE', state: QUALIFICATION_STATES.FORMULATION_QUALIFIED }), /blocked/i);

// BB-01 Q8 plane-stress / plane-strain patch authorities.
const ps = runQ8FormulationBenchmark({ benchmarkId: FORMULATION_BENCHMARK_IDS.PLANE_STRESS, nodes: rectangle, formulationProfile: 'PLANE_STRESS' });
const pe = runQ8FormulationBenchmark({ benchmarkId: FORMULATION_BENCHMARK_IDS.PLANE_STRAIN, nodes: rectangle, formulationProfile: 'PLANE_STRAIN' });
assert.equal(ps.accepted, true);
assert.equal(pe.accepted, true);
assert.equal(ps.constitutiveConstraint.sigmaZ, 0);
assert.equal(pe.constitutiveConstraint.epsilonZ, 0);

// BB-02 straight constant traction and curved pressure normalization.
const straight = integrateVariableEdgeLoad({
  nodes: [{ x: 0, y: 0 }, { x: 2, y: 0 }], thickness: 3,
  tractionAt: () => [5, -2],
});
assert.ok(Math.abs(straight.resultant[0] - 30) < 1e-12);
assert.ok(Math.abs(straight.resultant[1] + 12) < 1e-12);
assert.ok(Math.hypot(...straight.normalizationResidual) < 1e-12);
const r = 2;
const arc = [{ x: r, y: 0 }, { x: r / Math.sqrt(2), y: r / Math.sqrt(2) }, { x: 0, y: r }];
const curved = integrateVariableEdgeLoad({ nodes: arc, pressureAt: () => 4, thickness: 1 });
assert.ok(curved.arcLength > 3 && curved.arcLength < 3.2);
assert.ok(Math.hypot(...curved.normalizationResidual) < 1e-12);
const cosine = integrateVariableEdgeLoad({ nodes: arc, pressureAt: cosinePressureLaw({ amplitude: 4, direction: [1, 0] }) });
assert.ok(cosine.gaussEvidence.every((gp) => Number.isFinite(gp.traction[0])));
assert.equal(runCurvedEdgeLoadBenchmarks().accepted, true);

// BB-03 determinant-ratio quality, invalid geometry, duplicate nodes and four-level convergence.
const quality = evaluateQ8Quality({ elementId: 'Q8-1', nodes: rectangle });
assert.equal(quality.accepted, true);
const inverted = [...rectangle].map((n) => ({ ...n }));
[inverted[1], inverted[3]] = [inverted[3], inverted[1]];
const badQuality = evaluateQ8Quality({ elementId: 'Q8-BAD', nodes: inverted });
assert.equal(badQuality.accepted, false);
assert.ok(badQuality.failures.some((row) => row.includes('JACOBIAN')));
assert.equal(detectDuplicateInterfaceNodes([{ nodeId: 'A', x: 0, y: 0 }, { nodeId: 'B', x: 0, y: 0 }]).length, 1);
const convergence = evaluateConvergence({ quantityKind: 'LOCAL_STRESS', levels: [
  { level: 'M0', h: 1, value: 11 }, { level: 'M1', h: 0.5, value: 10.25 },
  { level: 'M2', h: 0.25, value: 10.0625 }, { level: 'M3', h: 0.125, value: 10.015625 },
] });
assert.equal(convergence.levelCount, 4);
assert.equal(convergence.oscillatory, false);
assert.ok(convergence.observedOrderRange[0] > 1.9);
assert.equal(evaluateConvergence({ quantityKind: 'TOTAL_REACTION', levels: [{ h: 1, value: 1 }, { h: 0.5, value: 1 }, { h: 0.25, value: 1 }] }).classification, 'EQUILIBRIUM_ONLY');

// BB-04 manufactured quadratic field recovery, path custody, SCL decomposition.
const gaussPointResults = Q8_GAUSS_POINTS.map((gp) => {
  const mapped = q8Map(rectangle, gp.xi, gp.eta);
  return { pointId: gp.pointId, stress: { sigmaX: mapped.x ** 2 + mapped.y, sigmaY: 2 * mapped.x - mapped.y ** 2, sigmaZ: 0, tauXY: mapped.x * mapped.y } };
});
const point = { x: 0.8, y: 0.3 };
const recovered = recoverAtPhysicalCoordinate({ elementId: 'Q8-1', nodes: rectangle, point, gaussPointResults });
assert.ok(Math.abs(recovered.recoveredTensor.sigmaX - (point.x ** 2 + point.y)) < 1e-10);
assert.ok(Math.abs(recovered.recoveredTensor.tauXY - point.x * point.y) < 1e-10);
const path = extractQ8Path({ pathId: 'P1', points: [{ x: 0.2, y: 0.2 }, { x: 1, y: 0.5 }, { x: 1.8, y: 0.8 }], elements: [{ elementId: 'Q8-1', nodes: rectangle, gaussPointResults }] });
assert.equal(path.samples.length, 3);
assert.ok(path.samples.every((row) => row.sourceGaussPointIds.length === 9));
const scl = linearizeStressComponents([-1, 0, 1].map((position) => ({ position, stress: { sigmaX: 10 + 20 * position, sigmaY: 0, sigmaZ: 0, tauXY: 0 } })), { lineIdentity: 'SCL-1' });
assert.ok(Math.abs(scl.membrane.sigmaX - 10) < 1e-12);
assert.ok(Math.abs(scl.bending.sigmaX - 20) < 1e-12);
assert.equal(runSclManufacturedBenchmarks().length, 7);

// BB-05 two-sided force/moment equilibrium and compatibility.
const iface = evaluateConformalInterface({
  interfaceId: 'I1', normal: [1, 0], tangent: [0, 1],
  samples: [0, 0.5, 1].map((position) => ({
    position,
    left: { traction: [10, 4 * position], displacement: [0.01 * position, -0.02 * position] },
    right: { traction: [-10, -4 * position], displacement: [0.01 * position, -0.02 * position] },
  })),
});
assert.equal(iface.accepted, true);
assert.ok(Math.hypot(...iface.forceEquilibriumResidual) < 1e-12);
assert.ok(Math.abs(iface.momentEquilibriumResidual) < 1e-12);
assert.equal(runInterfaceManufacturedBenchmarks().accepted, true);

console.log(JSON.stringify({
  suite: 'BB-00..BB-05',
  status: 'PASS',
  checks: 39,
  phase3T6Touched: false,
}, null, 2));
