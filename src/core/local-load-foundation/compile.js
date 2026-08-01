import {
  LOAD_FOUNDATION_ENGINEERING_LEVEL,
  LOAD_FOUNDATION_QUALIFICATION_STATES,
  LOAD_FOUNDATION_RESULT_SCHEMA,
} from './constants.js';
import {
  LoadFoundationError,
  normalizeLoadFoundationInput,
} from './validation.js';

export function compileLafeaLoadFoundation(input) {
  const source = normalizeLoadFoundationInput(input);
  const stationLoads = source.footprint.method === 'RIGID_SPIDER'
    ? rigidSpiderLoads(source)
    : weightedFoundationLoads(source);
  const closure = reconstructResultant(source, stationLoads);
  return deepFreeze({
    schema: LOAD_FOUNDATION_RESULT_SCHEMA,
    foundationIdentity: source.foundationIdentity,
    foundationVersion: source.foundationVersion,
    sourceAncestry: source.sourceAncestry,
    referencePoint: source.referencePoint,
    declaredResultant: source.declaredResultant,
    footprint: source.footprint,
    stationLoads,
    forceMomentClosure: closure,
    qualification: {
      state: closure.accepted
        ? LOAD_FOUNDATION_QUALIFICATION_STATES[0]
        : 'EQUILIBRIUM_NOT_CLOSED',
      engineeringLevel: LOAD_FOUNDATION_ENGINEERING_LEVEL,
      profileId: source.qualificationProfile.identity,
    },
    diagnostics: closure.accepted ? [] : [{
      code: 'LOAD_FOUNDATION_EQUILIBRIUM_NOT_CLOSED',
      path: 'forceMomentClosure',
      message: 'Compiled station loads do not reconstruct the declared resultant.',
    }],
    limitations: source.limitations,
  });
}

function weightedFoundationLoads(source) {
  const stations = source.footprint.stations;
  const measure = stations.reduce((sum, row) => sum + row.measure, 0);
  const weights = stations.map((row) => row.measure / measure);
  const forces = weights.map((weight) => scale(source.declaredResultant.force, weight));
  const induced = stations.reduce((sum, row, index) => add(sum,
    cross(subtract(row.position, source.referencePoint), forces[index])), [0, 0, 0]);
  const residualCouple = subtract(source.declaredResultant.moment, induced);
  return stations.map((row, index) => ({
    stationId: row.stationId,
    position: row.position,
    measure: row.measure,
    normalizedWeight: clean(weights[index]),
    force: cleanVector(forces[index]),
    moment: cleanVector(scale(residualCouple, weights[index])),
    sourceReference: row.sourceReference,
    distributionRule: 'MEASURE_WEIGHTED_FORCE_AND_RESULTANT_COUPLE_V1',
  }));
}

function rigidSpiderLoads(source) {
  const stations = source.footprint.stations;
  const matrix = equilibriumMatrix(stations, source.referencePoint);
  const right = [
    ...source.declaredResultant.force,
    ...source.declaredResultant.moment,
  ];
  const gram = multiplyByTranspose(matrix);
  const lambda = solveLinearSystem(gram, right,
    source.qualificationProfile.rankTolerance);
  const forceVector = transposeMultiply(matrix, lambda);
  return stations.map((row, index) => ({
    stationId: row.stationId,
    position: row.position,
    measure: row.measure,
    normalizedWeight: null,
    force: cleanVector(forceVector.slice(index * 3, index * 3 + 3)),
    moment: [0, 0, 0],
    sourceReference: row.sourceReference,
    distributionRule: 'MINIMUM_NORM_FORCE_ONLY_RIGID_SPIDER_V1',
  }));
}

function reconstructResultant(source, stationLoads) {
  const reconstructedForce = stationLoads.reduce((sum, row) => add(sum, row.force),
    [0, 0, 0]);
  const reconstructedMoment = stationLoads.reduce((sum, row) => add(sum,
    add(row.moment, cross(subtract(row.position, source.referencePoint), row.force))),
  [0, 0, 0]);
  const forceResidual = subtract(reconstructedForce, source.declaredResultant.force);
  const momentResidual = subtract(reconstructedMoment, source.declaredResultant.moment);
  const forceAccepted = acceptedVector(forceResidual, reconstructedForce,
    source.declaredResultant.force, source.qualificationProfile.forceTolerance);
  const momentAccepted = acceptedVector(momentResidual, reconstructedMoment,
    source.declaredResultant.moment, source.qualificationProfile.momentTolerance);
  return {
    reconstructedForce: cleanVector(reconstructedForce),
    reconstructedMoment: cleanVector(reconstructedMoment),
    forceResidual: cleanVector(forceResidual),
    momentResidual: cleanVector(momentResidual),
    forceTolerance: source.qualificationProfile.forceTolerance,
    momentTolerance: source.qualificationProfile.momentTolerance,
    accepted: forceAccepted && momentAccepted,
  };
}

function equilibriumMatrix(stations, referencePoint) {
  const columns = stations.length * 3;
  const matrix = Array.from({ length: 6 }, () => Array(columns).fill(0));
  stations.forEach((station, index) => {
    const [x, y, z] = subtract(station.position, referencePoint);
    const column = index * 3;
    matrix[0][column] = 1;
    matrix[1][column + 1] = 1;
    matrix[2][column + 2] = 1;
    matrix[3][column + 1] = -z;
    matrix[3][column + 2] = y;
    matrix[4][column] = z;
    matrix[4][column + 2] = -x;
    matrix[5][column] = -y;
    matrix[5][column + 1] = x;
  });
  return matrix;
}

function multiplyByTranspose(matrix) {
  return matrix.map((left) => matrix.map((right) => dot(left, right)));
}

function transposeMultiply(matrix, vector) {
  return matrix[0].map((_, column) => matrix.reduce((sum, row, index) =>
    sum + row[column] * vector[index], 0));
}

function solveLinearSystem(matrixValue, vectorValue, pivotTolerance) {
  const matrix = matrixValue.map((row, index) => [...row, vectorValue[index]]);
  const size = matrix.length;
  for (let column = 0; column < size; column += 1) {
    const pivot = selectPivot(matrix, column);
    if (Math.abs(matrix[pivot][column]) <= pivotTolerance) {
      throw new LoadFoundationError(
        'LOAD_FOUNDATION_RIGID_SPIDER_RANK_DEFICIENT',
        'footprint.stations',
        'Rigid-spider equilibrium matrix is rank deficient.',
      );
    }
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    eliminate(matrix, column);
  }
  return backSubstitute(matrix);
}

function selectPivot(matrix, column) {
  let pivot = column;
  for (let row = column + 1; row < matrix.length; row += 1) {
    if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
  }
  return pivot;
}

function eliminate(matrix, column) {
  const pivot = matrix[column][column];
  for (let row = column + 1; row < matrix.length; row += 1) {
    const factor = matrix[row][column] / pivot;
    for (let index = column; index <= matrix.length; index += 1) {
      matrix[row][index] -= factor * matrix[column][index];
    }
  }
}

function backSubstitute(matrix) {
  const result = Array(matrix.length).fill(0);
  for (let row = matrix.length - 1; row >= 0; row -= 1) {
    const sum = matrix[row].slice(row + 1, matrix.length)
      .reduce((value, coefficient, offset) =>
        value + coefficient * result[row + 1 + offset], 0);
    result[row] = (matrix[row][matrix.length] - sum) / matrix[row][row];
  }
  return result;
}

function acceptedVector(residual, actual, expected, tolerance) {
  return residual.every((value, index) => {
    const scaleValue = Math.max(Math.abs(actual[index]), Math.abs(expected[index]), 1);
    return Math.abs(value) <= tolerance.absolute + tolerance.relative * scaleValue;
  });
}

function add(left, right) {
  return left.map((value, index) => value + right[index]);
}
function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}
function scale(value, factor) {
  return value.map((item) => item * factor);
}
function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}
function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}
function cleanVector(value) {
  return value.map(clean);
}
function clean(value) {
  if (!Number.isFinite(value)) {
    throw new LoadFoundationError('LOAD_FOUNDATION_NUMERICAL_FAILURE',
      'calculation', 'Finite foundation calculation produced a non-finite value.');
  }
  return Object.is(value, -0) || Math.abs(value) < Number.EPSILON ? 0 : value;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
