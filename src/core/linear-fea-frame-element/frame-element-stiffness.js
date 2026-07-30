import { normalizeLinearFeaNumber } from '../linear-fea-contract/conventions.js';
import { fail, requireFinite, requirePositive } from './frame-element-contract.js';

/**
 * Local stiffness, transformation and end-condition kinematics for the
 * straight 3D frame element (section 5.1-5.3).
 *
 * Everything here is a pure function over the frozen B-2.0 element DOF order
 * `[I:UX..I:RZ, J:UX..J:RZ]` with row-major 12x12 storage. Matrices carry the
 * exact IEEE-754 arithmetic result; nothing is rounded, symmetrised or
 * repaired, so the permanent symmetry and rigid-body checks measure the
 * formulation itself.
 */

export const ELEMENT_DOF_COUNT = 12;

const KERNEL_CODE = 'FRAME_ELEMENT_KERNEL_INVALID';

function index(row, column) {
  return row * ELEMENT_DOF_COUNT + column;
}

export function zeroMatrix12() {
  return new Array(ELEMENT_DOF_COUNT * ELEMENT_DOF_COUNT).fill(0);
}

export function zeroVector12() {
  return new Array(ELEMENT_DOF_COUNT).fill(0);
}

function setSymmetric(matrix, row, column, value) {
  matrix[index(row, column)] = value;
  matrix[index(column, row)] = value;
}

/**
 * Shear flexibility parameters. `phiXY` governs bending about local z
 * (deflection in the x-y plane, shear carried on the local-y shear area
 * `kappaY * A`); `phiXZ` governs bending about local y (deflection in the x-z
 * plane, shear area `kappaZ * A`). Euler-Bernoulli is the exact `phi = 0`
 * member of the same family — one matrix, no geometry-based switching.
 */
export function shearFlexibility({
  elasticModulus,
  shearModulus,
  area,
  secondMomentY,
  secondMomentZ,
  length,
  shearDeformation,
  shearCorrectionFactorY,
  shearCorrectionFactorZ,
}) {
  if (!shearDeformation) return { phiXY: 0, phiXZ: 0 };
  const kappaY = requirePositive(shearCorrectionFactorY, 'shearCorrectionFactorY', KERNEL_CODE);
  const kappaZ = requirePositive(shearCorrectionFactorZ, 'shearCorrectionFactorZ', KERNEL_CODE);
  return {
    phiXY: (12 * elasticModulus * secondMomentZ) / (shearModulus * kappaY * area * length * length),
    phiXZ: (12 * elasticModulus * secondMomentY) / (shearModulus * kappaZ * area * length * length),
  };
}

/**
 * The 12x12 local stiffness: axial `EA/L`, Saint-Venant torsion `G*J/L` on the
 * declared polar moment (never a bending inertia), and the two independent
 * bending planes with their own second moments and shear parameters.
 *
 * @returns {{matrix:number[], phiXY:number, phiXZ:number}}
 */
export function frameLocalStiffness(properties) {
  const elasticModulus = requirePositive(properties.elasticModulus, 'elasticModulus', KERNEL_CODE);
  const shearModulus = requirePositive(properties.shearModulus, 'shearModulus', KERNEL_CODE);
  const area = requirePositive(properties.area, 'area', KERNEL_CODE);
  const secondMomentY = requirePositive(properties.secondMomentY, 'secondMomentY', KERNEL_CODE);
  const secondMomentZ = requirePositive(properties.secondMomentZ, 'secondMomentZ', KERNEL_CODE);
  const polarMoment = requirePositive(properties.polarMoment, 'polarMoment', KERNEL_CODE);
  const length = requirePositive(properties.length, 'length', KERNEL_CODE);
  const { phiXY, phiXZ } = shearFlexibility({ ...properties, elasticModulus, shearModulus, area, secondMomentY, secondMomentZ, length });

  const matrix = zeroMatrix12();

  const axial = (elasticModulus * area) / length;
  setSymmetric(matrix, 0, 0, axial);
  setSymmetric(matrix, 6, 6, axial);
  setSymmetric(matrix, 0, 6, -axial);

  const torsion = (shearModulus * polarMoment) / length;
  setSymmetric(matrix, 3, 3, torsion);
  setSymmetric(matrix, 9, 9, torsion);
  setSymmetric(matrix, 3, 9, -torsion);

  /* Bending about local z: DOFs UY (1, 7) and RZ (5, 11), inertia Iz. */
  const az = (12 * elasticModulus * secondMomentZ) / ((1 + phiXY) * length ** 3);
  const bz = (6 * elasticModulus * secondMomentZ) / ((1 + phiXY) * length ** 2);
  const cz = ((4 + phiXY) * elasticModulus * secondMomentZ) / ((1 + phiXY) * length);
  const dz = ((2 - phiXY) * elasticModulus * secondMomentZ) / ((1 + phiXY) * length);
  setSymmetric(matrix, 1, 1, az);
  setSymmetric(matrix, 1, 5, bz);
  setSymmetric(matrix, 1, 7, -az);
  setSymmetric(matrix, 1, 11, bz);
  setSymmetric(matrix, 5, 5, cz);
  setSymmetric(matrix, 5, 7, -bz);
  setSymmetric(matrix, 5, 11, dz);
  setSymmetric(matrix, 7, 7, az);
  setSymmetric(matrix, 7, 11, -bz);
  setSymmetric(matrix, 11, 11, cz);

  /* Bending about local y: DOFs UZ (2, 8) and RY (4, 10), inertia Iy. */
  const ay = (12 * elasticModulus * secondMomentY) / ((1 + phiXZ) * length ** 3);
  const by = (6 * elasticModulus * secondMomentY) / ((1 + phiXZ) * length ** 2);
  const cy = ((4 + phiXZ) * elasticModulus * secondMomentY) / ((1 + phiXZ) * length);
  const dy = ((2 - phiXZ) * elasticModulus * secondMomentY) / ((1 + phiXZ) * length);
  setSymmetric(matrix, 2, 2, ay);
  setSymmetric(matrix, 2, 4, -by);
  setSymmetric(matrix, 2, 8, -ay);
  setSymmetric(matrix, 2, 10, -by);
  setSymmetric(matrix, 4, 4, cy);
  setSymmetric(matrix, 4, 8, by);
  setSymmetric(matrix, 4, 10, dy);
  setSymmetric(matrix, 8, 8, ay);
  setSymmetric(matrix, 8, 10, by);
  setSymmetric(matrix, 10, 10, cy);

  return { matrix: cleanMatrix(matrix), phiXY, phiXZ };
}

/**
 * The B-2.0 transformation `d_local = T d_global`: four diagonal copies of the
 * rotation whose rows are the qualified B-2.4 local axes in global components.
 * The axes are cited exactly as the local-axis authority produced them; this
 * package never re-derives a basis.
 */
export function frameTransformationMatrix(axes) {
  const rows = [axes.x, axes.y, axes.z];
  const matrix = zeroMatrix12();
  for (let block = 0; block < 4; block += 1) {
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        matrix[index(block * 3 + row, block * 3 + column)] = requireFinite(
          rows[row][column],
          `axes[${row}][${column}]`,
          KERNEL_CODE,
        );
      }
    }
  }
  return matrix;
}

/** K_global = transpose(T) K_local T — the frozen B-2.0 identity. */
export function transformStiffnessToGlobal(local, transformation) {
  const size = ELEMENT_DOF_COUNT;
  const kt = new Array(size * size).fill(0);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let sum = 0;
      for (let inner = 0; inner < size; inner += 1) {
        sum += local[index(row, inner)] * transformation[index(inner, column)];
      }
      kt[index(row, column)] = sum;
    }
  }
  const global = new Array(size * size).fill(0);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let sum = 0;
      for (let inner = 0; inner < size; inner += 1) {
        sum += transformation[index(inner, row)] * kt[index(inner, column)];
      }
      global[index(row, column)] = sum;
    }
  }
  return cleanMatrix(global);
}

/** q_global = transpose(T) q_local — the frozen B-2.0 identity. */
export function transformLoadToGlobal(local, transformation) {
  const size = ELEMENT_DOF_COUNT;
  const global = new Array(size).fill(0);
  for (let row = 0; row < size; row += 1) {
    let sum = 0;
    for (let inner = 0; inner < size; inner += 1) {
      sum += transformation[index(inner, row)] * local[inner];
    }
    global[row] = sum;
  }
  return cleanVector(global);
}

/**
 * The plain forward B-2.0 identity `d_local = T d_global`, applied directly
 * rather than through its transpose. `transformStiffnessToGlobal`/
 * `transformLoadToGlobal` above only ever needed the transpose direction
 * (local matrices/vectors pushed out to the global/joint frame); recovering a
 * solved global displacement back into local element components (LFEA-B3.4)
 * needs the plain forward map this identity already names, so it is added
 * here rather than re-derived downstream. `transformation` is used exactly as
 * supplied — the same function serves the axis rotation and, when rigid
 * offsets are present, the offset kinematic map `H`, since both are 12x12
 * matrices under the identical `d_local = M d_global` shape.
 */
export function transformDisplacementToLocal(globalVector, transformation) {
  const size = ELEMENT_DOF_COUNT;
  const local = new Array(size).fill(0);
  for (let row = 0; row < size; row += 1) {
    let sum = 0;
    for (let column = 0; column < size; column += 1) {
      sum += transformation[index(row, column)] * globalVector[column];
    }
    local[row] = sum;
  }
  return cleanVector(local);
}

/**
 * Rigid end-offset kinematics (section 5.3). For an offset vector `r` from the
 * joint to the element end, `u_end = u_joint + theta x r`, so the 6x6 block is
 * `[[I, -skew(r)], [0, I]]` and forces map by the transpose:
 * `m_joint = m_end + r x f_end` — the moment-arm consistency the spec demands.
 * Offsets are declared in global components and applied to the global matrix.
 */
export function frameOffsetMatrix(offsets) {
  const matrix = zeroMatrix12();
  for (let dof = 0; dof < ELEMENT_DOF_COUNT; dof += 1) matrix[index(dof, dof)] = 1;
  const ends = [offsets.I, offsets.J];
  for (let end = 0; end < 2; end += 1) {
    const r = ends[end];
    if (r === null) continue;
    const base = end * 6;
    /* -skew(r): u_end = u_joint + theta x r = u_joint - r x theta. */
    matrix[index(base + 0, base + 4)] = r[2];
    matrix[index(base + 0, base + 5)] = -r[1];
    matrix[index(base + 1, base + 3)] = -r[2];
    matrix[index(base + 1, base + 5)] = r[0];
    matrix[index(base + 2, base + 3)] = r[1];
    matrix[index(base + 2, base + 4)] = -r[0];
  }
  return matrix;
}

/** K_joint = transpose(H) K H for the offset kinematic map H. */
export function applyOffsetToStiffness(global, offsetMatrix) {
  return transformStiffnessToGlobal(global, offsetMatrix);
}

/** q_joint = transpose(H) q for the offset kinematic map H. */
export function applyOffsetToLoad(global, offsetMatrix) {
  return transformLoadToGlobal(global, offsetMatrix);
}

/**
 * Static condensation of released and spring-connected local end DOFs
 * (STATIC_CONDENSATION_V1).
 *
 * Each entry `{index, stiffness}` couples the element-end DOF to its joint DOF
 * through a linear spring; `stiffness = 0` is a full release. Minimising the
 * element-plus-spring energy over the internal end DOFs `b` gives, with
 * `A = inverse(K_bb + S)`:
 *
 *   K'_aa = K_aa - K_ab A K_ba        f'_a = f_a - K_ab A f_b
 *   K'_ag = K_ab A S                  f'_g = S A f_b
 *   K'_gg = S - S A S
 *
 * where the joint DOFs `g` occupy the same positions as `b`, so the result
 * stays a 12x12 in the frozen DOF order. `K_bb + S` failing the declared
 * pivot boundary is the frozen singularity behavior: the released set forms a
 * local mechanism and the element is blocked, never regularised.
 *
 * @returns {{matrix:number[], vectors:number[][], condensedDofs:number[]}}
 */
export function condenseEndConditions(local, vectors, entries, pivotTolerance) {
  if (entries.length === 0) {
    return {
      matrix: cleanMatrix([...local]),
      vectors: vectors.map((vector) => cleanVector([...vector])),
      condensedDofs: [],
    };
  }
  const b = entries.map((entry) => entry.index);
  const springs = entries.map((entry) => entry.stiffness);
  const nb = b.length;
  const a = [];
  for (let dof = 0; dof < ELEMENT_DOF_COUNT; dof += 1) {
    if (!b.includes(dof)) a.push(dof);
  }

  const kbb = b.map((row, i) => b.map((column, j) => local[index(row, column)] + (i === j ? springs[i] : 0)));
  let characteristic = 0;
  for (let dof = 0; dof < ELEMENT_DOF_COUNT; dof += 1) {
    characteristic = Math.max(characteristic, Math.abs(local[index(dof, dof)]));
  }
  const inverse = invertWithPivotBoundary(kbb, pivotTolerance * characteristic);
  if (inverse === null) {
    fail(
      'The released local DOF set forms a mechanism: K_bb plus the declared end springs is singular at the declared releaseSingularityTolerance, and STATIC_CONDENSATION_V1 blocks rather than regularises it.',
      'FRAME_ELEMENT_RELEASE_SINGULAR',
    );
  }

  const kab = a.map((row) => b.map((column) => local[index(row, column)]));
  /* kab * A, an |a| x nb helper reused by every product below. */
  const kabA = kab.map((row) => multiplyRow(row, inverse, nb));

  const matrix = zeroMatrix12();
  a.forEach((row, i) => {
    a.forEach((column, j) => {
      let sum = local[index(row, column)];
      for (let inner = 0; inner < nb; inner += 1) sum -= kabA[i][inner] * kab[j][inner];
      matrix[index(row, column)] = sum;
    });
    b.forEach((column, j) => {
      const value = kabA[i][j] * springs[j];
      matrix[index(row, column)] = value;
      matrix[index(column, row)] = value;
    });
  });
  b.forEach((row, i) => {
    b.forEach((column, j) => {
      let sum = i === j ? springs[i] : 0;
      sum -= springs[i] * inverse[i][j] * springs[j];
      matrix[index(row, column)] = sum;
    });
  });

  const condensedVectors = vectors.map((vector) => {
    const fb = b.map((dof) => vector[dof]);
    const output = zeroVector12();
    a.forEach((dof, i) => {
      let sum = vector[dof];
      for (let inner = 0; inner < nb; inner += 1) sum -= kabA[i][inner] * fb[inner];
      output[dof] = sum;
    });
    b.forEach((dof, i) => {
      let sum = 0;
      for (let inner = 0; inner < nb; inner += 1) sum += springs[i] * inverse[i][inner] * fb[inner];
      output[dof] = sum;
    });
    return cleanVector(output);
  });

  return { matrix: cleanMatrix(matrix), vectors: condensedVectors, condensedDofs: [...b] };
}

function multiplyRow(row, inverse, size) {
  const output = new Array(size).fill(0);
  for (let column = 0; column < size; column += 1) {
    let sum = 0;
    for (let inner = 0; inner < size; inner += 1) sum += row[inner] * inverse[inner][column];
    output[column] = sum;
  }
  return output;
}

/**
 * Deterministic Gauss-Jordan inversion with partial pivoting. A pivot whose
 * magnitude does not exceed the declared absolute boundary means the block is
 * singular for release purposes; the caller turns that into the frozen
 * FRAME_ELEMENT_RELEASE_SINGULAR refusal.
 */
function invertWithPivotBoundary(matrix, pivotBoundary) {
  const size = matrix.length;
  const work = matrix.map((row, i) => [
    ...row.map((value) => requireFinite(value, 'condensation block entry', KERNEL_CODE)),
    ...Array.from({ length: size }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(work[row][column]) > Math.abs(work[pivotRow][column])) pivotRow = row;
    }
    if (!(Math.abs(work[pivotRow][column]) > pivotBoundary)) return null;
    if (pivotRow !== column) {
      const swap = work[column];
      work[column] = work[pivotRow];
      work[pivotRow] = swap;
    }
    const pivot = work[column][column];
    for (let j = 0; j < 2 * size; j += 1) work[column][j] /= pivot;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = work[row][column];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * size; j += 1) work[row][j] -= factor * work[column][j];
    }
  }
  return work.map((row) => row.slice(size));
}

export function cleanMatrix(matrix) {
  return matrix.map((value) => normalizeLinearFeaNumber(value));
}

export function cleanVector(vector) {
  return vector.map((value) => normalizeLinearFeaNumber(value));
}
