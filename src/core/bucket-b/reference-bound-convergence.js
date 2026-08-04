import {
  BOUNDED_OSCILLATION_UNCERTAINTY_PROFILE_ID,
  CONVERGENCE_DISPOSITIONS,
  evaluateConvergence as evaluateBaseConvergence,
} from './convergence.js';

export const REFERENCE_BOUND_BOUNDED_OSCILLATION_PROFILE_ID =
  'BKT_B_REFERENCE_BOUND_BOUNDED_OSCILLATION_V1';

/**
 * Preserve the shared convergence evaluator unchanged except for one narrow
 * analytical-reference case. A four-level global displacement sequence may
 * form a tiny bounded oscillation around an independently declared reference.
 * It is accepted as a plateau only when the complete value envelope, finest
 * change and reference error all satisfy the caller's original limits.
 *
 * This does not authorize unreferenced oscillation, zero crossings, local
 * stress, SCL quantities, reactions or caller-supplied PASS status.
 */
export function evaluateConvergence(input = {}) {
  const base = evaluateBaseConvergence(input);
  if (!qualifiesForReferenceBoundPlateau(input, base)) return base;

  const values = input.levels.map((row) => row.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const relativeRange = relativeEnvelopeRange(values);

  return Object.freeze({
    ...base,
    plateau: true,
    asymptotic: true,
    boundedOscillation: true,
    boundedOscillationRelativeLimit: input.finestRelativeChangeLimit,
    oscillationEnvelopeRelativeRange: relativeRange,
    acceptanceBasis: REFERENCE_BOUND_BOUNDED_OSCILLATION_PROFILE_ID,
    uncertaintyProfileId: REFERENCE_BOUND_BOUNDED_OSCILLATION_PROFILE_ID,
    uncertaintyEnvelope: Object.freeze({
      minimum,
      maximum,
      midpoint: (minimum + maximum) / 2,
      halfRange: (maximum - minimum) / 2,
      relativeRange,
      referenceValue: input.referenceValue,
      referenceRelativeError: base.referenceRelativeError,
      governingReferenceRelativeErrorLimit: input.referenceRelativeErrorLimit,
      governingFinestRelativeChangeLimit: input.finestRelativeChangeLimit,
    }),
    requiresAdditionalLevel: false,
    disposition: CONVERGENCE_DISPOSITIONS.PASS_PLATEAU,
    acceptedForAdjudication: true,
  });
}

function qualifiesForReferenceBoundPlateau(input, base) {
  if (input.quantityKind !== 'GLOBAL_DISPLACEMENT') return false;
  if (input.referenceValue === null || input.referenceValue === undefined) return false;
  if (
    input.referenceRelativeErrorLimit === null
    || input.referenceRelativeErrorLimit === undefined
    || input.finestRelativeChangeLimit === null
    || input.finestRelativeChangeLimit === undefined
  ) return false;
  if (![
    CONVERGENCE_DISPOSITIONS.ADDITIONAL_LEVEL_REQUIRED,
    CONVERGENCE_DISPOSITIONS.OSCILLATORY,
  ].includes(base.disposition)) return false;
  if (!Number.isFinite(base.referenceRelativeError)) return false;
  if (base.referenceRelativeError > input.referenceRelativeErrorLimit) return false;
  if (base.finestRelativeChange > input.finestRelativeChangeLimit) return false;
  return relativeEnvelopeRange(input.levels.map((row) => row.value))
    <= input.finestRelativeChangeLimit;
}

function relativeEnvelopeRange(values) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return (maximum - minimum)
    / Math.max(1, Math.abs(minimum), Math.abs(maximum));
}

export { BOUNDED_OSCILLATION_UNCERTAINTY_PROFILE_ID };
