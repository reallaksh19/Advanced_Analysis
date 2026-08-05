import { deepFreeze, requireFiniteNumber, requireNonNegativeNumber } from './contracts.js';

export const NEAR_ZERO_REFERENCE_MARKER = 'N/A_NEAR_ZERO_REFERENCE';

export function compareBenchmarkQuantity(input) {
  const calculated = requireFiniteNumber(input.calculated, 'calculated');
  const reference = requireFiniteNumber(input.reference, 'reference');
  const referenceFloor = requireNonNegativeNumber(input.referenceFloor, 'referenceFloor');
  const benchmarkScale = requireNonNegativeNumber(input.benchmarkScale, 'benchmarkScale');
  const absoluteTolerance = requireNonNegativeNumber(input.absoluteTolerance, 'absoluteTolerance');
  const relativeTolerancePercent = requireNonNegativeNumber(
    input.relativeTolerancePercent,
    'relativeTolerancePercent',
  );
  const absoluteError = Math.abs(calculated - reference);
  const nearZero = Math.abs(reference) < referenceFloor;
  const relativeErrorPercent = nearZero
    ? NEAR_ZERO_REFERENCE_MARKER
    : (100 * absoluteError) / Math.abs(reference);
  const scaleNormalizedErrorPercent = benchmarkScale > 0
    ? (100 * absoluteError) / benchmarkScale
    : null;
  const passes = nearZero
    ? absoluteError <= absoluteTolerance
    : absoluteError <= absoluteTolerance
      || relativeErrorPercent <= relativeTolerancePercent;
  return deepFreeze({
    calculated,
    reference,
    absoluteError,
    relativeErrorPercent,
    scaleNormalizedErrorPercent,
    nearZero,
    absoluteTolerance,
    relativeTolerancePercent,
    passes,
  });
}

export function compareRefinement(input) {
  const coarse = requireFiniteNumber(input.coarse, 'coarse');
  const fine = requireFiniteNumber(input.fine, 'fine');
  const absoluteTolerance = requireNonNegativeNumber(input.absoluteTolerance, 'absoluteTolerance');
  const relativeTolerancePercent = requireNonNegativeNumber(
    input.relativeTolerancePercent,
    'relativeTolerancePercent',
  );
  const denominatorFloor = requireNonNegativeNumber(input.denominatorFloor, 'denominatorFloor');
  const absoluteChange = Math.abs(fine - coarse);
  const nearZero = Math.abs(fine) < denominatorFloor;
  const relativeChangePercent = nearZero
    ? NEAR_ZERO_REFERENCE_MARKER
    : (100 * absoluteChange) / Math.abs(fine);
  return deepFreeze({
    coarse,
    fine,
    absoluteChange,
    relativeChangePercent,
    nearZero,
    passes: absoluteChange <= absoluteTolerance
      || (!nearZero && relativeChangePercent <= relativeTolerancePercent),
  });
}
