import {
  BOUNDED_OSCILLATION_UNCERTAINTY_PROFILE_ID,
  CONVERGENCE_DISPOSITIONS,
  evaluateConvergence as evaluateBaseConvergence,
} from './convergence.js';

export const REFERENCE_BOUND_BOUNDED_OSCILLATION_PROFILE_ID =
  'BKT_B_REFERENCE_BOUND_BOUNDED_OSCILLATION_V1';
export const GLOBAL_DISPLACEMENT_ASYMPTOTIC_TAIL_PROFILE_ID =
  'BKT_B_GLOBAL_DISPLACEMENT_ASYMPTOTIC_TAIL_V1';

/**
 * Extend the shared evaluator only for two explicitly bounded global-
 * displacement cases. The base result remains authoritative for all other
 * quantities and dispositions.
 *
 * 1. A tiny four-level oscillation about an independent analytical reference.
 * 2. A retained pre-asymptotic coarse level followed by a monotonic,
 *    asymptotic three-level tail within the caller's original limit.
 *
 * Neither route authorizes zero crossings, local stress, SCL quantities,
 * reactions, tolerance widening or caller-supplied PASS status.
 */
export function evaluateConvergence(input = {}) {
  const base = evaluateBaseConvergence(input);
  if (qualifiesForReferenceBoundPlateau(input, base)) {
    return referenceBoundPlateau(input, base);
  }
  if (qualifiesForGlobalDisplacementTail(input, base)) {
    return globalDisplacementTail(input, base);
  }
  return base;
}

function referenceBoundPlateau(input, base) {
  const values = input.levels.map((row) => row.value);
  const uncertaintyEnvelope = envelope(values);
  return Object.freeze({
    ...base,
    plateau: true,
    asymptotic: true,
    boundedOscillation: true,
    boundedOscillationRelativeLimit: input.finestRelativeChangeLimit,
    oscillationEnvelopeRelativeRange: uncertaintyEnvelope.relativeRange,
    acceptanceBasis: REFERENCE_BOUND_BOUNDED_OSCILLATION_PROFILE_ID,
    uncertaintyProfileId: REFERENCE_BOUND_BOUNDED_OSCILLATION_PROFILE_ID,
    uncertaintyEnvelope: Object.freeze({
      ...uncertaintyEnvelope,
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

function globalDisplacementTail(input, base) {
  const ordered = [...input.levels]
    .map((row) => ({ ...row }))
    .sort((left, right) => right.h - left.h);
  const qualifiedTailRows = ordered.slice(-3);
  const uncertaintyEnvelope = envelope(qualifiedTailRows.map((row) => row.value));
  return Object.freeze({
    ...base,
    plateau: true,
    asymptotic: true,
    qualifiedTailPlateau: true,
    qualifiedTailRelativeLimit: input.finestRelativeChangeLimit,
    qualifiedTailRelativeRange: uncertaintyEnvelope.relativeRange,
    qualifiedTailLevelIds: Object.freeze(
      qualifiedTailRows.map((row) => row.level ?? null),
    ),
    excludedPreAsymptoticLevels: Object.freeze(
      ordered.slice(0, -3).map((row) => Object.freeze({
        level: row.level ?? null,
        h: row.h,
        probeH: row.probeH ?? null,
        value: row.value,
      })),
    ),
    acceptanceBasis: GLOBAL_DISPLACEMENT_ASYMPTOTIC_TAIL_PROFILE_ID,
    uncertaintyProfileId: GLOBAL_DISPLACEMENT_ASYMPTOTIC_TAIL_PROFILE_ID,
    uncertaintyEnvelope: Object.freeze({
      ...uncertaintyEnvelope,
      governingFinestRelativeChangeLimit: input.finestRelativeChangeLimit,
      retainedLevelIds: Object.freeze(
        qualifiedTailRows.map((row) => row.level ?? null),
      ),
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
  return envelope(input.levels.map((row) => row.value)).relativeRange
    <= input.finestRelativeChangeLimit;
}

function qualifiesForGlobalDisplacementTail(input, base) {
  if (input.quantityKind !== 'GLOBAL_DISPLACEMENT') return false;
  if (!Array.isArray(input.levels) || input.levels.length < 4) return false;
  if (
    input.finestRelativeChangeLimit === null
    || input.finestRelativeChangeLimit === undefined
    || !Number.isFinite(input.finestRelativeChangeLimit)
    || input.finestRelativeChangeLimit < 0
  ) return false;
  if (![
    CONVERGENCE_DISPOSITIONS.ADDITIONAL_LEVEL_REQUIRED,
    CONVERGENCE_DISPOSITIONS.OSCILLATORY,
  ].includes(base.disposition)) return false;
  if (base.zeroCrossing || !base.oscillatory) return false;
  if (base.finestRelativeChange > input.finestRelativeChangeLimit) return false;
  const finalWindow = base.windows?.at(-1);
  if (!finalWindow?.monotonic || !finalWindow?.asymptotic) return false;
  const ordered = [...input.levels].sort((left, right) => right.h - left.h);
  const tail = ordered.slice(-3);
  return envelope(tail.map((row) => row.value)).relativeRange
    <= input.finestRelativeChangeLimit;
}

function envelope(values) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return {
    minimum,
    maximum,
    midpoint: (minimum + maximum) / 2,
    halfRange: (maximum - minimum) / 2,
    relativeRange: (maximum - minimum)
      / Math.max(1, Math.abs(minimum), Math.abs(maximum)),
  };
}

export { BOUNDED_OSCILLATION_UNCERTAINTY_PROFILE_ID };
