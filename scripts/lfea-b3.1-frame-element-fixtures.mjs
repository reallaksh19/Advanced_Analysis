import {
  sealFrameElementProfile,
  compileFrameElement,
} from '../src/core/linear-fea-frame-element/index.js';
import { sealLoadPrimitive } from '../src/core/linear-fea-load-case/index.js';
import {
  materialResolution,
  sectionResolution,
  axisResult,
} from './lfea-b2.5-model-compiler-fixtures.mjs';
import {
  distributedLoadPrimitive,
  loadCaseProfile,
  modelReference,
  temperaturePrimitive,
} from './lfea-b3.0-load-case-fixtures.mjs';
import { FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';

export { materialResolution, sectionResolution, axisResult };

export function clone(value) {
  return structuredClone(value);
}

export const ELEMENT_ID = 'E-000120';

export function eulerBernoulliProfile(overrides = {}) {
  return sealFrameElementProfile({
    schema: 'fea-linear-frame-element-profile/v1',
    profileId: 'LINEAR-FRAME-ELEMENT-R1',
    straightPipeFormulation: 'PIPE_FRAME3D_EULER_BERNOULLI_V1',
    shearDeformation: false,
    releaseRule: 'STATIC_CONDENSATION_V1',
    thermalStrainApproximation: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    releaseSingularityTolerance: { value: 1e-12, source: 'LFEA-B3.1-FIXTURE-PROFILE' },
    semanticHash: '',
    ...overrides,
  });
}

export function timoshenkoProfile(overrides = {}) {
  return sealFrameElementProfile({
    schema: 'fea-linear-frame-element-profile/v1',
    profileId: 'LINEAR-FRAME-ELEMENT-R1',
    straightPipeFormulation: 'PIPE_FRAME3D_TIMOSHENKO_V1',
    shearDeformation: true,
    releaseRule: 'STATIC_CONDENSATION_V1',
    thermalStrainApproximation: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    releaseSingularityTolerance: { value: 1e-12, source: 'LFEA-B3.1-FIXTURE-PROFILE' },
    shearCorrectionFactorY: { value: 0.53, source: 'COWPER-1966-THIN-ANNULUS-INPUT' },
    shearCorrectionFactorZ: { value: 0.53, source: 'COWPER-1966-THIN-ANNULUS-INPUT' },
    semanticHash: '',
    ...overrides,
  });
}

let sealContext = null;

function primitiveContext() {
  if (sealContext === null) {
    sealContext = { profile: loadCaseProfile(), modelReference: modelReference() };
  }
  return sealContext;
}

export function sealedDistributedLoad(overrides = {}) {
  return sealLoadPrimitive(
    distributedLoadPrimitive({ primitiveId: 'LP-UDL-E120', elementId: ELEMENT_ID, ...overrides }),
    primitiveContext(),
  );
}

export function sealedTemperature(overrides = {}) {
  return sealLoadPrimitive(
    temperaturePrimitive({ elementId: ELEMENT_ID, ...overrides }),
    primitiveContext(),
  );
}

/**
 * One straight element along global X from the shared B-2.2/B-2.3/B-2.4
 * fixture authorities. `nodeJ` and the profile choose the geometry and
 * formulation per test.
 */
export function elementInput(overrides = {}) {
  return {
    elementId: ELEMENT_ID,
    material: materialResolution(),
    section: sectionResolution(),
    localAxes: {
      result: overrides.axisResult ?? axisResult([0, 0, 0], overrides.nodeJ ?? [2, 0, 0]),
      profile: FRAME_LOCAL_AXIS_PROFILE,
    },
    profile: overrides.profile ?? eulerBernoulliProfile(),
    distributedLoads: overrides.distributedLoads ?? [],
    temperature: overrides.temperature ?? null,
    releases: overrides.releases ?? [],
    endSprings: overrides.endSprings ?? [],
    rigidOffsets: overrides.rigidOffsets ?? null,
  };
}

export function compileFixtureElement(overrides = {}) {
  return compileFrameElement(elementInput(overrides));
}

/** Dense symmetric solve for benchmark-sized systems (script-side only). */
export function solveDense(matrix, rhs) {
  const size = rhs.length;
  const work = matrix.map((row, i) => [...row, rhs[i]]);
  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(work[row][column]) > Math.abs(work[pivotRow][column])) pivotRow = row;
    }
    const swap = work[column];
    work[column] = work[pivotRow];
    work[pivotRow] = swap;
    const pivot = work[column][column];
    if (!(Math.abs(pivot) > 0)) throw new Error('fixture solve: singular system');
    for (let j = column; j <= size; j += 1) work[column][j] /= pivot;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = work[row][column];
      for (let j = column; j <= size; j += 1) work[row][j] -= factor * work[column][j];
    }
  }
  return work.map((row) => row[size]);
}

export function matrixAt(flat, row, column) {
  return flat[row * 12 + column];
}

/** Extract a submatrix of the flat 12x12 for the given DOF indices. */
export function subMatrix(flat, indices) {
  return indices.map((row) => indices.map((column) => matrixAt(flat, row, column)));
}

export function subVector(vector, indices) {
  return indices.map((index) => vector[index]);
}

export function multiply12(flat, vector) {
  const output = new Array(12).fill(0);
  for (let row = 0; row < 12; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      output[row] += flat[row * 12 + column] * vector[column];
    }
  }
  return output;
}

export function maxAbs(values) {
  return values.reduce((best, value) => Math.max(best, Math.abs(value)), 0);
}
