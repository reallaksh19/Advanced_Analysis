#!/usr/bin/env node

/**
 * LFEA B-3.1 straight 3D frame element check.
 *
 * Covers `src/core/linear-fea-frame-element/`: the section 5.1 baseline element
 * (stiffness, transformation, immutable evidence, rigid-body modes, symmetry),
 * section 5.2 shear deformation, section 5.3 releases/springs/offsets, section
 * 5.4 thermal initial strain, and the section 15.2 closed-form benchmarks
 * FRAME-AXIAL-01, FRAME-TORSION-01, FRAME-BEND-YZ-01, FRAME-SHEAR-01, UDL-01
 * and THERMAL-01/02 at the section 15.4 tolerances.
 */

import assert from 'node:assert/strict';
import { canonicalStringify } from '../src/core/shared-piping-model/canonical-json.js';
import {
  FRAME_ELEMENT_RECORD_KEYS,
  compileFrameElement,
  requireFrameElement,
  sealFrameElementProfile,
} from '../src/core/linear-fea-frame-element/index.js';
import {
  ELEMENT_ID,
  axisResult,
  clone,
  compileFixtureElement,
  elementInput,
  eulerBernoulliProfile,
  matrixAt,
  maxAbs,
  multiply12,
  sealedDistributedLoad,
  sealedTemperature,
  solveDense,
  subMatrix,
  subVector,
  timoshenkoProfile,
} from './lfea-b3.1-frame-element-fixtures.mjs';

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

function assertClose(actual, expected, relativeTolerance, message) {
  const scale = Math.max(Math.abs(expected), 1e-300);
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * scale,
    `${message}: ${actual} differs from ${expected} beyond ${relativeTolerance} relative`,
  );
}

function assertDeepFrozen(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} is not frozen`);
  if (Array.isArray(value)) value.forEach((child, index) => assertDeepFrozen(child, `${path}[${index}]`));
  else Object.entries(value).forEach(([key, child]) => assertDeepFrozen(child, `${path}.${key}`));
}

console.log('\n--- LFEA B-3.1 straight frame element check ---');

const LENGTH = 2;
const baseline = compileFixtureElement();
const E = baseline.material.elasticModulus;
const G = baseline.material.shearModulus;
const A = baseline.section.area;
const IY = baseline.section.secondMomentY;
const IZ = baseline.section.secondMomentZ;
const J = baseline.section.polarMoment;
const JOINT_J = [6, 7, 8, 9, 10, 11];

test('B31-T01', 'Compilation produces a sealed immutable element record', () => {
  assert.deepEqual(Object.keys(baseline).sort(), [...FRAME_ELEMENT_RECORD_KEYS].sort());
  assert.equal(baseline.schema, 'fea-linear-frame-element/v1');
  assert.equal(baseline.elementId, ELEMENT_ID);
  assert.equal(baseline.formulationId, 'PIPE_FRAME3D_EULER_BERNOULLI_V1');
  assert.equal(baseline.releaseRule, 'STATIC_CONDENSATION_V1');
  assert.equal(baseline.geometry.length, LENGTH);
  assert.equal(baseline.localStiffness.length, 144);
  assert.equal(baseline.globalStiffness.length, 144);
  assert.match(baseline.semanticHash, /^fnv1a64:[0-9a-f]{16}$/u);
  assertDeepFrozen(baseline);
  requireFrameElement(clone(baseline));
  const stale = clone(baseline);
  stale.semanticHash = 'fnv1a64:0000000000000000';
  expectCode(() => requireFrameElement(stale), 'FRAME_ELEMENT_HASH_MISMATCH');
  const tampered = clone(baseline);
  tampered.localStiffness[1] += 1;
  expectCode(() => requireFrameElement(tampered), 'FRAME_ELEMENT_HASH_MISMATCH');
});

test('B31-T02', 'Local and global stiffness are symmetric to 1e-12 normalized', () => {
  for (const flat of [baseline.localStiffness, baseline.globalStiffness]) {
    const scale = maxAbs(flat);
    for (let row = 0; row < 12; row += 1) {
      for (let column = 0; column < 12; column += 1) {
        assert.ok(
          Math.abs(matrixAt(flat, row, column) - matrixAt(flat, column, row)) <= 1e-12 * scale,
          `asymmetry at ${row},${column}`,
        );
      }
    }
  }
  assert.equal(baseline.transformation.storage, 'ROW_MAJOR_12X12_V1');
  assert.equal(baseline.transformation.conventionId, 'D_LOCAL_EQ_T_D_GLOBAL_V1');
});

test('B31-T03', 'Six rigid-body modes carry zero energy to 1e-12', () => {
  const modes = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const translation = new Array(12).fill(0);
    translation[axis] = 1;
    translation[6 + axis] = 1;
    modes.push(translation);
  }
  /* Rotations about node I: u_J = theta x (L, 0, 0) in local coordinates. */
  const arm = [LENGTH, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    const theta = [0, 0, 0];
    theta[axis] = 1;
    const mode = new Array(12).fill(0);
    mode[3 + axis] = 1;
    mode[9 + axis] = 1;
    mode[6] = theta[1] * arm[2] - theta[2] * arm[1];
    mode[7] = theta[2] * arm[0] - theta[0] * arm[2];
    mode[8] = theta[0] * arm[1] - theta[1] * arm[0];
    modes.push(mode);
  }
  const characteristic = maxAbs(baseline.localStiffness);
  for (const mode of modes) {
    const forces = multiply12(baseline.localStiffness, mode);
    const energy = mode.reduce((sum, value, dof) => sum + value * forces[dof], 0);
    const modeScale = mode.reduce((sum, value) => sum + value * value, 0);
    assert.ok(Math.abs(energy) <= 1e-12 * characteristic * modeScale, `rigid mode energy ${energy}`);
  }
});

test('B31-T04', 'FRAME-AXIAL-01: EA/L stiffness and tip displacement', () => {
  assertClose(matrixAt(baseline.localStiffness, 0, 0), (E * A) / LENGTH, 1e-12, 'k[0][0]');
  assertClose(matrixAt(baseline.localStiffness, 0, 6), -(E * A) / LENGTH, 1e-12, 'k[0][6]');
  const force = 1e4;
  const rhs = [force, 0, 0, 0, 0, 0];
  const displacement = solveDense(subMatrix(baseline.localStiffness, JOINT_J), rhs);
  assertClose(displacement[0], (force * LENGTH) / (E * A), 1e-8, 'axial tip displacement');
});

test('B31-T05', 'FRAME-TORSION-01: GJ/L rotation and end torque', () => {
  assertClose(matrixAt(baseline.localStiffness, 3, 3), (G * J) / LENGTH, 1e-12, 'k[3][3]');
  const torque = 500;
  const rhs = [0, 0, 0, torque, 0, 0];
  const displacement = solveDense(subMatrix(baseline.localStiffness, JOINT_J), rhs);
  assertClose(displacement[3], (torque * LENGTH) / (G * J), 1e-8, 'tip twist');
});

test('B31-T06', 'FRAME-BEND-YZ-01: independent EI planes and sign convention', () => {
  const force = 1000;
  const kjj = subMatrix(baseline.localStiffness, JOINT_J);
  const yTip = solveDense(kjj, [0, force, 0, 0, 0, 0]);
  assertClose(yTip[1], (force * LENGTH ** 3) / (3 * E * IZ), 1e-8, '+FY tip deflection');
  assertClose(yTip[5], (force * LENGTH ** 2) / (2 * E * IZ), 1e-8, '+FY tip rotation RZ');
  const zTip = solveDense(kjj, [0, 0, force, 0, 0, 0]);
  assertClose(zTip[2], (force * LENGTH ** 3) / (3 * E * IY), 1e-8, '+FZ tip deflection');
  assertClose(zTip[4], -(force * LENGTH ** 2) / (2 * E * IY), 1e-8, '+FZ tip rotation RY is negative');
});

test('B31-T07', 'FRAME-SHEAR-01: Timoshenko shear contribution and slender convergence', () => {
  const kappa = 0.53;
  const force = 1000;
  const deep = compileFixtureElement({ profile: timoshenkoProfile(), nodeJ: [0.5, 0, 0] });
  const tip = solveDense(subMatrix(deep.localStiffness, JOINT_J), [0, force, 0, 0, 0, 0]);
  const expected = (force * 0.5 ** 3) / (3 * E * IZ) + force * 0.5 / (kappa * A * G);
  assertClose(tip[1], expected, 1e-8, 'deep-beam Timoshenko tip deflection');
  assert.ok(
    tip[1] > 1.15 * (force * 0.5 ** 3) / (3 * E * IZ),
    'the shear contribution must be material for the deep beam',
  );
  let previous = Number.POSITIVE_INFINITY;
  for (const length of [2, 5, 10, 25]) {
    const timoshenko = compileFixtureElement({ profile: timoshenkoProfile(), nodeJ: [length, 0, 0] });
    const euler = compileFixtureElement({ nodeJ: [length, 0, 0] });
    const uT = solveDense(subMatrix(timoshenko.localStiffness, JOINT_J), [0, force, 0, 0, 0, 0])[1];
    const uE = solveDense(subMatrix(euler.localStiffness, JOINT_J), [0, force, 0, 0, 0, 0])[1];
    const gap = Math.abs(uT / uE - 1);
    assert.ok(gap < previous, 'Timoshenko must converge monotonically to Euler-Bernoulli');
    previous = gap;
  }
  assert.ok(previous < 5e-4, 'slender-beam formulations must agree');
});

test('B31-T08', 'UDL-01: consistent equivalent nodal loads, local and global basis', () => {
  const w = -240;
  const local = compileFixtureElement({
    distributedLoads: [sealedDistributedLoad({
      basis: 'ELEMENT_LOCAL',
      startIntensity: { fx: 0, fy: w, fz: 0 },
      endIntensity: { fx: 0, fy: w, fz: 0 },
    })],
  });
  const f = local.equivalentLoadVector.local;
  assertClose(f[1], (w * LENGTH) / 2, 1e-12, 'FY_i');
  assertClose(f[5], (w * LENGTH ** 2) / 12, 1e-12, 'MZ_i');
  assertClose(f[7], (w * LENGTH) / 2, 1e-12, 'FY_j');
  assertClose(f[11], -(w * LENGTH ** 2) / 12, 1e-12, 'MZ_j');

  /* A GLOBAL intensity maps through the element basis. The fixture element
   * runs along global X with local y = global Z, so a global -Z line load is
   * the same physical load as a local fy = -240 declaration. */
  const global = compileFixtureElement({
    distributedLoads: [sealedDistributedLoad({
      basis: 'GLOBAL',
      startIntensity: { fx: 0, fy: 0, fz: w },
      endIntensity: { fx: 0, fy: 0, fz: w },
    })],
  });
  global.equivalentLoadVector.local.forEach((value, dof) => {
    assertClose(value, f[dof], 1e-12, `global-basis mapping dof ${dof}`);
  });

  /* Linearly varying load: the global equivalent vector must be in exact
   * force and moment equilibrium with the applied line load. */
  const varying = compileFixtureElement({
    distributedLoads: [sealedDistributedLoad({
      variation: 'LINEAR',
      basis: 'GLOBAL',
      startIntensity: { fx: 0, fy: 0, fz: 0 },
      endIntensity: { fx: 0, fy: 0, fz: w },
    })],
  });
  const g = varying.equivalentLoadVector.global;
  const totalForce = g[2] + g[8];
  assertClose(totalForce, (w * LENGTH) / 2, 1e-12, 'linear-load force resultant');
  /* Moment about global Y at node I: nodal moments plus the arm of FZ_j,
   * against the load resultant acting at 2L/3. */
  const nodalMoment = g[4] + g[10] - LENGTH * g[8];
  assertClose(nodalMoment, -((w * LENGTH) / 2) * (2 * LENGTH / 3), 1e-10, 'linear-load moment resultant');
  assert.deepEqual(varying.appliedLoads.map((entry) => entry.kind), ['DISTRIBUTED_LOAD']);
});

test('B31-T09', 'End release condensation reproduces the propped cantilever', () => {
  const w = -240;
  const propped = compileFixtureElement({
    releases: [{ end: 'J', dof: 'RZ' }],
    distributedLoads: [sealedDistributedLoad({
      basis: 'ELEMENT_LOCAL',
      startIntensity: { fx: 0, fy: w, fz: 0 },
      endIntensity: { fx: 0, fy: w, fz: 0 },
    })],
  });
  const f = propped.equivalentLoadVector.local;
  assertClose(f[1], (5 * w * LENGTH) / 8, 1e-8, 'condensed FY_i = 5wL/8');
  assertClose(f[5], (w * LENGTH ** 2) / 8, 1e-8, 'condensed MZ_i = wL^2/8');
  assertClose(f[7], (3 * w * LENGTH) / 8, 1e-8, 'condensed FY_j = 3wL/8');
  assert.equal(f[11], 0, 'a released DOF carries no equivalent load');
  assertClose(
    matrixAt(propped.localStiffness, 7, 7),
    (3 * E * IZ) / LENGTH ** 3,
    1e-8,
    'condensed tip stiffness 3EI/L^3',
  );
  const row = Array.from({ length: 12 }, (_, dof) => matrixAt(propped.localStiffness, 11, dof));
  assert.equal(maxAbs(row), 0, 'the released DOF row is condensed out');
  assert.deepEqual(propped.endConditions.releases, [{ end: 'J', dof: 'RZ' }]);
  assert.deepEqual(propped.endConditions.condensedDofs, [11]);
  assert.equal(propped.endConditions.method, 'STATIC_CONDENSATION_V1');
});

test('B31-T10', 'THERMAL-01/02: free expansion and restrained end actions', () => {
  const element = compileFixtureElement({ temperature: sealedTemperature() });
  const alpha = element.material.thermalExpansionCoefficient;
  const deltaT = 100;
  const strain = alpha * deltaT;
  assert.equal(element.thermal.temperatureDifference, deltaT);
  assertClose(element.thermal.axialStrain, strain, 1e-12, 'axial strain');
  assertClose(element.thermal.freeExtension, strain * LENGTH, 1e-12, 'free extension');
  assert.equal(element.thermal.strainConvention, 'POSITIVE_DELTA_T_PRODUCES_POSITIVE_INITIAL_EXTENSION_V1');
  assert.equal(element.thermal.approximationProfileId, 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1');

  /* THERMAL-01: q = K d - initialStrainLoad vanishes for free expansion. */
  const free = new Array(12).fill(0);
  free[6] = strain * LENGTH;
  const endActions = multiply12(element.localStiffness, free)
    .map((value, dof) => value - element.initialStrainLoadVector.local[dof]);
  assert.ok(maxAbs(endActions) <= 1e-8 * E * A * strain, 'free expansion must produce zero end action');

  /* THERMAL-02: full restraint produces the compressive axial pair. */
  const restrained = element.initialStrainLoadVector.local.map((value) => -value);
  assertClose(restrained[6], -(E * A * strain), 1e-12, 'restrained end action at J is -EA*alpha*dT');
  assertClose(restrained[0], E * A * strain, 1e-12, 'restrained end action at I balances it');
  assert.equal(
    element.limitations.some((entry) => entry.code === 'FRAME_ELEMENT_LIMITATION_UNIFORM_TEMPERATURE_APPROXIMATION'),
    true,
  );
});

test('B31-T11', 'Conflicting, mechanistic and singular release sets block', () => {
  expectCode(
    () => compileFixtureElement({
      releases: [{ end: 'J', dof: 'RZ' }, { end: 'J', dof: 'RZ' }],
    }),
    'FRAME_ELEMENT_RELEASE_CONFLICT',
  );
  expectCode(
    () => compileFixtureElement({
      releases: [{ end: 'J', dof: 'RZ' }],
      endSprings: [{ end: 'J', dof: 'RZ', stiffness: 1e6 }],
    }),
    'FRAME_ELEMENT_RELEASE_CONFLICT',
  );
  expectCode(
    () => compileFixtureElement({
      releases: ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => ({ end: 'J', dof })),
    }),
    'FRAME_ELEMENT_RELEASE_MECHANISM',
  );
  expectCode(
    () => compileFixtureElement({
      releases: [{ end: 'I', dof: 'UX' }, { end: 'J', dof: 'UX' }],
    }),
    'FRAME_ELEMENT_RELEASE_SINGULAR',
  );
  expectCode(
    () => compileFixtureElement({ endSprings: [{ end: 'J', dof: 'RX', stiffness: 0 }] }),
    'FRAME_ELEMENT_SPRING_STIFFNESS_INVALID',
  );
  expectCode(
    () => compileFixtureElement({ endSprings: [{ end: 'J', dof: 'RX', stiffness: -5 }] }),
    'FRAME_ELEMENT_SPRING_STIFFNESS_INVALID',
  );
});

test('B31-T12', 'A partial-release end spring acts in series with the element', () => {
  const springRate = 2.5e5;
  const sprung = compileFixtureElement({ endSprings: [{ end: 'J', dof: 'RX', stiffness: springRate }] });
  const torsional = (G * J) / LENGTH;
  const series = 1 / (1 / torsional + 1 / springRate);
  assertClose(matrixAt(sprung.localStiffness, 9, 9), series, 1e-8, 'series torsional stiffness');
  assertClose(matrixAt(sprung.localStiffness, 3, 9), -series, 1e-8, 'series coupling term');
  assert.deepEqual(sprung.endConditions.springs, [{ end: 'J', dof: 'RX', stiffness: springRate }]);
});

test('B31-T13', 'Rigid offsets transfer loads and stiffness with moment-arm consistency', () => {
  const offset = { x: 0, y: 0.1, z: 0 };
  const w = -240;
  const load = () => [sealedDistributedLoad({
    basis: 'GLOBAL',
    startIntensity: { fx: 0, fy: 0, fz: w },
    endIntensity: { fx: 0, fy: 0, fz: w },
  })];
  const plain = compileFixtureElement({ distributedLoads: load() });
  const offsetElement = compileFixtureElement({
    distributedLoads: load(),
    rigidOffsets: { I: null, J: offset },
  });
  const before = plain.equivalentLoadVector.global;
  const after = offsetElement.equivalentLoadVector.global;
  /* m_joint = m_end + r x f_end with r = (0, 0.1, 0), f = (0, 0, FZ). */
  assertClose(after[9], before[9] + offset.y * before[8], 1e-12, 'MX_j gains the moment arm');
  assertClose(after[8], before[8], 1e-12, 'FZ_j is unchanged');
  before.slice(0, 6).forEach((value, dof) => assertClose(after[dof], value, 1e-12, `end I dof ${dof}`));

  /* Rigid-body modes at joint positions, including the offset arm. */
  const joints = [[0, 0, 0], [LENGTH - offset.x, -offset.y, -offset.z]];
  const characteristic = maxAbs(offsetElement.globalStiffness);
  for (let axis = 0; axis < 3; axis += 1) {
    const theta = [0, 0, 0];
    theta[axis] = 1;
    const mode = new Array(12).fill(0);
    for (let end = 0; end < 2; end += 1) {
      const p = joints[end];
      mode[end * 6 + 0] = theta[1] * p[2] - theta[2] * p[1];
      mode[end * 6 + 1] = theta[2] * p[0] - theta[0] * p[2];
      mode[end * 6 + 2] = theta[0] * p[1] - theta[1] * p[0];
      mode[end * 6 + 3 + axis] = 1;
    }
    const forces = multiply12(offsetElement.globalStiffness, mode);
    const energy = mode.reduce((sum, value, dof) => sum + value * forces[dof], 0);
    const modeScale = mode.reduce((sum, value) => sum + value * value, 0);
    assert.ok(Math.abs(energy) <= 1e-10 * characteristic * modeScale, `offset rigid mode energy ${energy}`);
  }
  assert.equal(
    offsetElement.limitations.some((entry) => entry.code === 'FRAME_ELEMENT_LIMITATION_RIGID_OFFSET'),
    true,
  );
});

test('B31-T14', 'Global stiffness is covariant under a proper rotation to 1e-10', () => {
  const angle = 0.7;
  const axis = [1, 2, 3].map((value) => value / Math.sqrt(14));
  const rotate = (vector) => {
    const [x, y, z] = axis;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dot = x * vector[0] + y * vector[1] + z * vector[2];
    return [0, 1, 2].map((row) => {
      const crossRow = [
        y * vector[2] - z * vector[1],
        z * vector[0] - x * vector[2],
        x * vector[1] - y * vector[0],
      ][row];
      return vector[row] * cos + crossRow * sin + axis[row] * dot * (1 - cos);
    });
  };
  const nodeJ = [1.2, 0.7, -0.4];
  const reference = [0, 0, 1];
  const original = compileFixtureElement({ axisResult: axisResult([0, 0, 0], nodeJ, reference) });
  const rotated = compileFixtureElement({
    axisResult: axisResult([0, 0, 0], rotate(nodeJ), rotate(reference)),
  });
  const scale = maxAbs(original.globalStiffness);
  for (let row = 0; row < 12; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      /* (Q_block K Q_block^T)[row][column] with Q applied per 3-DOF block. */
      let expected = 0;
      for (let i = 0; i < 12; i += 1) {
        for (let j = 0; j < 12; j += 1) {
          if (Math.floor(i / 3) !== Math.floor(row / 3) || Math.floor(j / 3) !== Math.floor(column / 3)) continue;
          const qRow = rotate([0, 1, 2].map((k) => (k === i % 3 ? 1 : 0)))[row % 3];
          const qColumn = rotate([0, 1, 2].map((k) => (k === j % 3 ? 1 : 0)))[column % 3];
          expected += qRow * matrixAt(original.globalStiffness, i, j) * qColumn;
        }
      }
      assert.ok(
        Math.abs(matrixAt(rotated.globalStiffness, row, column) - expected) <= 1e-10 * scale,
        `covariance failure at ${row},${column}`,
      );
    }
  }
});

test('B31-T15', 'Fail-closed intake and byte-identical determinism', () => {
  assert.equal(
    canonicalStringify(compileFixtureElement()),
    canonicalStringify(baseline),
    'repeated compilation must be byte-identical',
  );
  expectCode(
    () => compileFixtureElement({
      distributedLoads: [sealedDistributedLoad({ primitiveId: 'LP-UDL-E121X', elementId: 'E-000121' })],
    }),
    'FRAME_ELEMENT_PRIMITIVE_ELEMENT_MISMATCH',
  );
  expectCode(
    () => compileFixtureElement({ distributedLoads: [sealedTemperature()] }),
    'FRAME_ELEMENT_PRIMITIVE_UNSUPPORTED',
  );
  expectCode(
    () => compileFixtureElement({ temperature: sealedDistributedLoad() }),
    'FRAME_ELEMENT_PRIMITIVE_UNSUPPORTED',
  );
  expectCode(
    () => compileFixtureElement({
      distributedLoads: [sealedDistributedLoad(), sealedDistributedLoad()],
    }),
    'FRAME_ELEMENT_PRIMITIVE_AMBIGUOUS',
  );
  const tamperedPrimitive = clone(sealedDistributedLoad());
  tamperedPrimitive.startIntensity.fz = -9999;
  expectCode(
    () => compileFixtureElement({ distributedLoads: [tamperedPrimitive] }),
    'LOAD_CASE_HASH_MISMATCH',
  );
  const input = elementInput();
  delete input.temperature;
  expectCode(() => compileFrameElement(input), 'FRAME_ELEMENT_INPUT_INVALID');
});

test('B31-T16', 'The formulation profile is exact-keyed and declared, never inferred', () => {
  expectCode(
    () => eulerBernoulliProfile({ shearDeformation: true }),
    'FRAME_ELEMENT_SHEAR_DECLARATION_MISMATCH',
  );
  expectCode(
    () => timoshenkoProfile({ shearDeformation: false }),
    'FRAME_ELEMENT_SHEAR_DECLARATION_MISMATCH',
  );
  expectCode(
    () => eulerBernoulliProfile({
      shearCorrectionFactorY: { value: 0.53, source: 'COWPER-1966-THIN-ANNULUS-INPUT' },
    }),
    'FRAME_ELEMENT_PROFILE_INVALID',
  );
  expectCode(
    () => timoshenkoProfile({ shearCorrectionFactorY: null }),
    'SHEAR_CORRECTION_FACTOR_Y_NOT_DECLARED',
  );
  expectCode(
    () => timoshenkoProfile({ shearCorrectionFactorZ: { value: 1.5, source: 'PROJECT' } }),
    'DECLARED_VALUE_ABOVE_MAXIMUM',
  );
  expectCode(
    () => timoshenkoProfile({ shearCorrectionFactorY: { value: 0.53, source: 'DEFAULT' } }),
    'FRAME_ELEMENT_PROFILE_SOURCE_NOT_TRACEABLE',
  );
  expectCode(
    () => eulerBernoulliProfile({ releaseSingularityTolerance: null }),
    'RELEASE_SINGULARITY_TOLERANCE_NOT_DECLARED',
  );
  expectCode(
    () => eulerBernoulliProfile({ thermalStrainApproximation: 'TEMPERATURE_DEPENDENT_ALPHA_INTEGRATION_V1' }),
    'FRAME_ELEMENT_THERMAL_ALPHA_INTEGRATION_NOT_IMPLEMENTED',
  );
  const stale = { ...eulerBernoulliProfile(), semanticHash: 'fnv1a64:0000000000000000' };
  expectCode(() => compileFixtureElement({ profile: stale }), 'FRAME_ELEMENT_HASH_MISMATCH');
  assert.equal(sealFrameElementProfile.length, 1);
});

console.log('\nLFEA B-3.1 straight frame element check PASS\n');
