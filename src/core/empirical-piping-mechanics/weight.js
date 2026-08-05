import {
  EMPIRICAL_FORMULA_IDS,
  deepFreeze,
  requireFiniteNumber,
  requireNonNegativeNumber,
  requirePositiveNumber,
} from './contracts.js';
import { EMPIRICAL_FAILURE_CODES, empiricalFailure } from './failure-codes.js';

function requireDeclaredMass(value, fieldName) {
  if (value === undefined || value === null) {
    throw empiricalFailure(
      EMPIRICAL_FAILURE_CODES.MASS_SOURCE_UNRESOLVED,
      `${fieldName} must be explicitly declared, including zero where applicable.`,
    );
  }
  return requireNonNegativeNumber(value, fieldName);
}

export function buildDistributedWeight(input) {
  if (!input?.sectionStates?.weight) {
    throw empiricalFailure(EMPIRICAL_FAILURE_CODES.INPUT_INCOMPLETE, 'Weight section state is required.');
  }
  const densityKgM3 = requirePositiveNumber(input.densityKgM3, 'densityKgM3');
  const contentsMassPerLengthKgM = requireDeclaredMass(
    input.contentsMassPerLengthKgM,
    'contentsMassPerLengthKgM',
  );
  const insulationMassPerLengthKgM = requireDeclaredMass(
    input.insulationMassPerLengthKgM,
    'insulationMassPerLengthKgM',
  );
  const otherDistributedMassPerLengthKgM = requireDeclaredMass(
    input.otherDistributedMassPerLengthKgM,
    'otherDistributedMassPerLengthKgM',
  );
  const gravity = input.gravityGlobalMps2;
  if (!gravity || typeof gravity !== 'object') {
    throw empiricalFailure(EMPIRICAL_FAILURE_CODES.INPUT_INCOMPLETE, 'gravityGlobalMps2 is required.');
  }
  const gx = requireFiniteNumber(gravity.x, 'gravityGlobalMps2.x');
  const gy = requireFiniteNumber(gravity.y, 'gravityGlobalMps2.y');
  const pipeMassPerLengthKgM = densityKgM3 * input.sectionStates.weight.areaM2;
  const totalMassPerLengthKgM = pipeMassPerLengthKgM
    + contentsMassPerLengthKgM
    + insulationMassPerLengthKgM
    + otherDistributedMassPerLengthKgM;
  return deepFreeze({
    pipeMassPerLengthKgM,
    contentsMassPerLengthKgM,
    insulationMassPerLengthKgM,
    otherDistributedMassPerLengthKgM,
    totalMassPerLengthKgM,
    globalLoadPerLengthNM: {
      x: totalMassPerLengthKgM * gx,
      y: totalMassPerLengthKgM * gy,
    },
    formulaTrace: [EMPIRICAL_FORMULA_IDS.pipeMass, EMPIRICAL_FORMULA_IDS.lineLoad],
  });
}

export function compileEccentricPointMass(input) {
  const massKg = requirePositiveNumber(input.massKg, 'massKg');
  const gravity = input.gravityGlobalMps2;
  const offset = input.offsetFromNodeM;
  if (!gravity || !offset) {
    throw empiricalFailure(
      EMPIRICAL_FAILURE_CODES.INPUT_INCOMPLETE,
      'gravityGlobalMps2 and offsetFromNodeM are required for eccentric point mass.',
    );
  }
  const forceN = {
    x: massKg * requireFiniteNumber(gravity.x, 'gravityGlobalMps2.x'),
    y: massKg * requireFiniteNumber(gravity.y, 'gravityGlobalMps2.y'),
  };
  const rx = requireFiniteNumber(offset.x, 'offsetFromNodeM.x');
  const ry = requireFiniteNumber(offset.y, 'offsetFromNodeM.y');
  const momentNm = (rx * forceN.y) - (ry * forceN.x);
  return deepFreeze({ massKg, forceN, momentNm });
}
