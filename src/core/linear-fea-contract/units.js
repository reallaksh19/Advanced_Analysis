export const LINEAR_FEA_UNITS_SCHEMA = 'fea-linear-units/v1';

export const LINEAR_FEA_UNITS = Object.freeze({
  length: 'm',
  area: 'm^2',
  secondMomentOfArea: 'm^4',
  polarMomentOfArea: 'm^4',

  force: 'N',
  moment: 'N*m',
  distributedForce: 'N/m',

  stress: 'Pa',
  strain: '1',

  mass: 'kg',
  massDensity: 'kg/m^3',
  acceleration: 'm/s^2',

  translationalStiffness: 'N/m',
  rotationalStiffness: 'N*m/rad',

  absoluteTemperature: 'K',
  temperatureDifference: 'K',
  thermalExpansionCoefficient: '1/K',

  rotation: 'rad',
});

function unitError(message, code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

export function requireLinearFeaUnits(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw unitError(
      'Linear FEA units must be a record.',
      'INVALID_LINEAR_FEA_UNITS',
    );
  }

  const expectedKeys = Object.keys(LINEAR_FEA_UNITS);
  const candidateKeys = Object.keys(candidate);

  for (const key of expectedKeys) {
    if (!Object.hasOwn(candidate, key)) {
      throw unitError(
        `Linear FEA units are missing ${key}.`,
        'MISSING_LINEAR_FEA_UNIT',
      );
    }
  }

  for (const key of candidateKeys) {
    if (!Object.hasOwn(LINEAR_FEA_UNITS, key)) {
      throw unitError(
        `Linear FEA units contain unexpected field ${key}.`,
        'UNEXPECTED_LINEAR_FEA_UNIT',
      );
    }
  }

  for (const [key, expected] of Object.entries(LINEAR_FEA_UNITS)) {
    if (candidate[key] !== expected) {
      throw unitError(
        `Linear FEA unit ${key} must be ${expected}.`,
        'INVALID_LINEAR_FEA_UNIT',
      );
    }
  }

  return LINEAR_FEA_UNITS;
}
