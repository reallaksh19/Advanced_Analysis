import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLANGE_HUB_INDEPENDENT_ORACLE_DESCRIPTOR,
  runIndependentFlangeHubOracle,
  solveIndependentOracleLinearSystem,
} from '../src/core/bucket-b/flange-hub-independent-oracle.js';

const LOAD_CASES = ['FH-PRES-001', 'FH-AXIAL-001', 'FH-GASKET-001'];
const EXPECTED_GASKET_RESULTANT = -20 * Math.PI * (95 ** 2 - 65 ** 2);

test('BB-11 independent oracle keeps the registered solver policy', () => {
  assert.equal(
    FLANGE_HUB_INDEPENDENT_ORACLE_DESCRIPTOR.linearSolver,
    'DETERMINISTIC_SGS_PCG_EXPLICIT_RESIDUAL_V2',
  );
});

test('BB-11 independent oracle is connected, deterministic, and converged', () => {
  for (const loadCaseId of LOAD_CASES) {
    const first = runIndependentFlangeHubOracle(loadCaseId);
    const second = runIndependentFlangeHubOracle(loadCaseId);
    assert.deepEqual(first, second);
    assert.equal(first.status, 'PASS');
    assert.equal(first.levels.length, 5);
    first.levels.forEach((level) => {
      assert.equal(level.connectivity.componentCount, 1);
      assert.equal(level.connectivity.accepted, true);
      assert.deepEqual(
        level.connectivity.components[0].blockIds,
        ['O-B00', 'O-B01', 'O-B02', 'O-B03', 'O-B04', 'O-B05', 'O-B06', 'O-B07'],
      );
      assert.ok(level.solver.relativeResidual <= 1e-10);
        assert.ok(Number.isFinite(level.solver.explicitResidualNorm));
      const probe = level.probes.find((row) => row.id === 'P-HUB-MID');
      assert.deepEqual(probe.point, { r: 62.75, z: 30 });
    });
    first.convergence.rows.forEach((row) => {
      assert.equal(row.accepted, true, `${loadCaseId}:${row.quantityId}`);
    });
  }
});

test('BB-11 gasket load resultant is mesh independent after exact clipping', () => {
  const report = runIndependentFlangeHubOracle('FH-GASKET-001');
  report.levels.forEach((level) => {
    assert.ok(
      Math.abs(level.appliedResultants.axial - EXPECTED_GASKET_RESULTANT)
        <= 1e-6,
    );
  });
});

test('BB-11 oracle retains frozen limits while correcting denominator authority', () => {
  const axial = runIndependentFlangeHubOracle('FH-AXIAL-001');
  const limits = Object.fromEntries(
    axial.convergence.rows.map((row) => [row.quantityId, row.limit]),
  );
  assert.deepEqual(limits, {
    ENERGY: 0.01,
    REACTION: 0.001,
    PIPE_UR: 0.01,
    HUB_UR: 0.02,
    FLANGE_UZ: 0.02,
    PIPE_HOOP: 0.025,
    HUB_HOOP: 0.04,
  });
  const flange = axial.convergence.rows.find(
    (row) => row.quantityId === 'FLANGE_UZ',
  );
  assert.equal(
    flange.normalization,
    'SAME_POINT_DISPLACEMENT_VECTOR_NORM',
  );
  assert.ok(flange.rawScalarRelativeChange > flange.limit);
  assert.ok(flange.finestChange <= flange.limit);
  const hub = axial.convergence.rows.find(
    (row) => row.quantityId === 'HUB_HOOP',
  );
  assert.equal(hub.normalization, 'SAME_POINT_STRESS_TENSOR_NORM');
  assert.ok(hub.rawScalarRelativeChange > hub.limit);
  assert.ok(hub.finestChange <= hub.limit);
});

test('BB-11 independent linear solver retains certified SPD behavior', () => {
  const solved = solveIndependentOracleLinearSystem({
    rows: [
      [{ column: 0, value: 4 }, { column: 1, value: 1 }],
      [{ column: 0, value: 1 }, { column: 1, value: 3 }],
    ],
    rhs: [1, 2],
  });
  assert.ok(Math.abs(solved.x[0] - 1 / 11) <= 1e-12);
  assert.ok(Math.abs(solved.x[1] - 7 / 11) <= 1e-12);
  assert.ok(solved.explicitResidualNorm <= 1e-10);
});
