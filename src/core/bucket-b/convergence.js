export const CONVERGENCE_PROFILE_ID = 'BKT_B_ACTUAL_H_RATIO_FOUR_LEVEL_CONVERGENCE_V4';
export const BOUNDED_OSCILLATION_UNCERTAINTY_PROFILE_ID = 'BKT_B_BOUNDED_OSCILLATION_UNCERTAINTY_V1';
export const ASYMPTOTIC_TAIL_PLATEAU_PROFILE_ID = 'BKT_B_ASYMPTOTIC_TAIL_PLATEAU_V1';

const LOCAL_QUANTITY_KINDS = new Set([
  'LOCAL_STRESS',
  'SCL_MEMBRANE',
  'SCL_BENDING',
  'FINITE_RADIUS_PEAK',
  'REACTION_SPLIT',
  'REACTION_DENSITY',
  'REACTION_MOMENT',
]);

export const CONVERGENCE_DISPOSITIONS = Object.freeze({
  PASS_ASYMPTOTIC: 'PASS_ASYMPTOTIC',
  PASS_PLATEAU: 'PASS_PLATEAU',
  ADDITIONAL_LEVEL_REQUIRED: 'ADDITIONAL_LEVEL_REQUIRED',
  NON_ASYMPTOTIC: 'NON_ASYMPTOTIC',
  OSCILLATORY: 'OSCILLATORY',
  ZERO_CROSSING_REVIEW: 'ZERO_CROSSING_REVIEW',
  REFERENCE_ERROR_FAILURE: 'REFERENCE_ERROR_FAILURE',
  FINEST_CHANGE_FAILURE: 'FINEST_CHANGE_FAILURE',
  EQUILIBRIUM_ONLY: 'EQUILIBRIUM_ONLY',
});

export function evaluateConvergence({
  quantityKind,
  levels,
  requireFourLevels = LOCAL_QUANTITY_KINDS.has(quantityKind),
  finestRelativeChangeLimit = null,
  referenceValue = null,
  referenceRelativeErrorLimit = null,
  boundedOscillationRelativeLimit = finestRelativeChangeLimit,
  qualifiedTailRelativeLimit = quantityKind === 'LOCAL_STRESS'
    ? finestRelativeChangeLimit
    : null,
} = {}) {
  if (!Array.isArray(levels) || levels.length < (requireFourLevels ? 4 : 3)) {
    throw new TypeError(
      `${quantityKind} requires at least ${requireFourLevels ? 'four' : 'three'} mesh levels.`,
    );
  }
  const useProbeH = LOCAL_QUANTITY_KINDS.has(quantityKind);
  const ordered = [...levels]
    .map((row) => ({
      ...row,
      effectiveH: useProbeH ? row.probeH : row.h,
    }))
    .sort((left, right) => right.effectiveH - left.effectiveH);

  ordered.forEach((row, index) => {
    if (!(row.h > 0) || !Number.isFinite(row.value)) {
      throw new TypeError(`Invalid convergence level ${index}.`);
    }
    if (useProbeH && !(row.probeH > 0)) {
      throw new TypeError(
        `Local quantity ${quantityKind} requires a positive probeH at level ${index}.`,
      );
    }
    if (!(row.effectiveH > 0)) {
      throw new TypeError(`Invalid characteristic size at level ${index}.`);
    }
    if (
      index > 0
      && !(ordered[index - 1].effectiveH > row.effectiveH)
    ) {
      throw new TypeError(
        'Effective characteristic sizes must be strictly decreasing.',
      );
    }
  });

  if (quantityKind === 'TOTAL_REACTION') {
    return Object.freeze({
      convergenceProfileId: CONVERGENCE_PROFILE_ID,
      quantityKind,
      classification: CONVERGENCE_DISPOSITIONS.EQUILIBRIUM_ONLY,
      disposition: CONVERGENCE_DISPOSITIONS.EQUILIBRIUM_ONLY,
      acceptedForAdjudication: false,
      reason: 'Total reaction is an equilibrium check, not a mesh-convergence quantity.',
    });
  }

  const windows = [];
  for (let index = 0; index <= ordered.length - 3; index += 1) {
    windows.push(evaluateThree(ordered.slice(index, index + 3)));
  }
  const finestRelativeChange = relativeChange(
    ordered.at(-2).value,
    ordered.at(-1).value,
  );
  const values = ordered.map((row) => row.value);
  const zeroCrossing = hasZeroCrossing(values);
  const oscillatory = windows.some((row) => row.oscillatory);
  const exactPlateau = windows.every((row) => row.plateau);
  const monotonic = windows.every((row) => row.monotonic);
  const asymptoticWithoutEnvelope = windows.every(
    (row) => row.asymptotic || row.plateau,
  );
  const valueEnvelope = envelope(values);
  const oscillationEnvelopeRelativeRange = valueEnvelope.relativeRange;
  const boundedOscillation = Boolean(
    useProbeH
    && oscillatory
    && boundedOscillationRelativeLimit !== null
    && Number.isFinite(boundedOscillationRelativeLimit)
    && boundedOscillationRelativeLimit >= 0
    && oscillationEnvelopeRelativeRange <= boundedOscillationRelativeLimit
    && finestRelativeChange <= boundedOscillationRelativeLimit,
  );

  const qualifiedTailRows = ordered.slice(-3);
  const qualifiedTailValues = qualifiedTailRows.map((row) => row.value);
  const qualifiedTailEnvelope = envelope(qualifiedTailValues);
  const qualifiedTailZeroCrossing = hasZeroCrossing(qualifiedTailValues);
  const qualifiedTailPlateau = Boolean(
    useProbeH
    && ordered.length >= 4
    && qualifiedTailRelativeLimit !== null
    && Number.isFinite(qualifiedTailRelativeLimit)
    && qualifiedTailRelativeLimit >= 0
    && !qualifiedTailZeroCrossing
    && qualifiedTailEnvelope.relativeRange <= qualifiedTailRelativeLimit
    && finestRelativeChange <= qualifiedTailRelativeLimit
    && (oscillatory || !asymptoticWithoutEnvelope),
  );

  const plateau = exactPlateau || boundedOscillation || qualifiedTailPlateau;
  const asymptotic = asymptoticWithoutEnvelope
    || boundedOscillation
    || qualifiedTailPlateau;
  const orders = windows
    .map((row) => row.observedOrder)
    .filter((value) => Number.isFinite(value));
  const referenceRelativeError = referenceValue === null
    ? null
    : relativeChange(ordered.at(-1).value, referenceValue);

  let disposition;
  let acceptanceBasis = null;
  let uncertaintyProfileId = null;
  let uncertaintyEnvelope = null;
  if (zeroCrossing) {
    disposition = CONVERGENCE_DISPOSITIONS.ZERO_CROSSING_REVIEW;
  } else if (
    referenceRelativeErrorLimit !== null
    && referenceRelativeError > referenceRelativeErrorLimit
  ) {
    disposition = CONVERGENCE_DISPOSITIONS.REFERENCE_ERROR_FAILURE;
  } else if (qualifiedTailPlateau) {
    disposition = CONVERGENCE_DISPOSITIONS.PASS_PLATEAU;
    acceptanceBasis = ASYMPTOTIC_TAIL_PLATEAU_PROFILE_ID;
    uncertaintyProfileId = ASYMPTOTIC_TAIL_PLATEAU_PROFILE_ID;
    uncertaintyEnvelope = qualifiedTailEnvelope;
  } else if (boundedOscillation) {
    disposition = CONVERGENCE_DISPOSITIONS.PASS_PLATEAU;
    acceptanceBasis = BOUNDED_OSCILLATION_UNCERTAINTY_PROFILE_ID;
    uncertaintyProfileId = BOUNDED_OSCILLATION_UNCERTAINTY_PROFILE_ID;
    uncertaintyEnvelope = valueEnvelope;
  } else if (oscillatory) {
    disposition = ordered.length <= 4
      ? CONVERGENCE_DISPOSITIONS.ADDITIONAL_LEVEL_REQUIRED
      : CONVERGENCE_DISPOSITIONS.OSCILLATORY;
  } else if (!asymptotic) {
    disposition = CONVERGENCE_DISPOSITIONS.NON_ASYMPTOTIC;
  } else if (
    finestRelativeChangeLimit !== null
    && finestRelativeChange > finestRelativeChangeLimit
  ) {
    disposition = CONVERGENCE_DISPOSITIONS.FINEST_CHANGE_FAILURE;
  } else {
    disposition = plateau
      ? CONVERGENCE_DISPOSITIONS.PASS_PLATEAU
      : CONVERGENCE_DISPOSITIONS.PASS_ASYMPTOTIC;
    acceptanceBasis = plateau ? 'NUMERICAL_PLATEAU' : 'ASYMPTOTIC_ORDER';
  }

  const acceptedForAdjudication = disposition
    === CONVERGENCE_DISPOSITIONS.PASS_ASYMPTOTIC
    || disposition === CONVERGENCE_DISPOSITIONS.PASS_PLATEAU;

  return Object.freeze({
    convergenceProfileId: CONVERGENCE_PROFILE_ID,
    quantityKind,
    levelCount: ordered.length,
    characteristicSizeAuthority: useProbeH
      ? 'PROBE_LOCAL_H'
      : 'GLOBAL_H',
    actualGlobalCharacteristicSizes: Object.freeze(
      ordered.map((row) => row.h),
    ),
    actualProbeLocalCharacteristicSizes: Object.freeze(
      ordered.map((row) => row.probeH ?? null),
    ),
    effectiveCharacteristicSizes: Object.freeze(
      ordered.map((row) => row.effectiveH),
    ),
    finestRelativeChange,
    referenceRelativeError,
    observedOrderRange: orders.length
      ? Object.freeze([Math.min(...orders), Math.max(...orders)])
      : null,
    monotonic,
    oscillatory,
    zeroCrossing,
    exactPlateau,
    plateau,
    asymptotic,
    boundedOscillation,
    boundedOscillationRelativeLimit,
    oscillationEnvelopeRelativeRange,
    qualifiedTailPlateau,
    qualifiedTailRelativeLimit,
    qualifiedTailRelativeRange: qualifiedTailEnvelope.relativeRange,
    qualifiedTailLevelIds: Object.freeze(
      qualifiedTailRows.map((row) => row.level ?? null),
    ),
    excludedPreAsymptoticLevels: qualifiedTailPlateau
      ? Object.freeze(ordered.slice(0, -3).map((row) => Object.freeze({
        level: row.level ?? null,
        h: row.h,
        probeH: row.probeH ?? null,
        value: row.value,
      })))
      : Object.freeze([]),
    uncertaintyProfileId,
    uncertaintyEnvelope: uncertaintyEnvelope
      ? Object.freeze(uncertaintyEnvelope)
      : null,
    acceptanceBasis,
    requiresAdditionalLevel: disposition
      === CONVERGENCE_DISPOSITIONS.ADDITIONAL_LEVEL_REQUIRED,
    disposition,
    windows: Object.freeze(windows),
    acceptedForAdjudication,
  });
}

function evaluateThree([coarse, medium, fine]) {
  const deltaCoarse = coarse.value - medium.value;
  const deltaFine = medium.value - fine.value;
  const scale = Math.max(
    1,
    Math.abs(coarse.value),
    Math.abs(medium.value),
    Math.abs(fine.value),
  );
  const zeroTolerance = 1e-13 * scale;
  const coarseZero = Math.abs(deltaCoarse) <= zeroTolerance;
  const fineZero = Math.abs(deltaFine) <= zeroTolerance;
  const plateau = coarseZero && fineZero;
  const monotonic = plateau || (
    !coarseZero
    && !fineZero
    && Math.sign(deltaCoarse) === Math.sign(deltaFine)
  );
  const oscillatory = !plateau && !monotonic;
  const ratio = !fineZero ? deltaCoarse / deltaFine : Number.NaN;
  const rawObservedOrder = plateau
    ? Number.POSITIVE_INFINITY
    : monotonic
      ? solveObservedOrder(
        coarse.effectiveH,
        medium.effectiveH,
        fine.effectiveH,
        ratio,
      )
      : Number.NaN;
  const fineRatio = medium.effectiveH / fine.effectiveH;
  const rawExtrapolated = Number.isFinite(rawObservedOrder)
    && Math.abs(fineRatio ** rawObservedOrder - 1) > 1e-14
    ? fine.value
      + (fine.value - medium.value) / (fineRatio ** rawObservedOrder - 1)
    : plateau
      ? fine.value
      : Number.NaN;
  const asymptotic = plateau || (
    monotonic
    && Number.isFinite(rawObservedOrder)
    && rawObservedOrder >= 0.5
    && rawObservedOrder <= 8
  );
  return Object.freeze({
    coarse,
    medium,
    fine,
    deltaCoarse,
    deltaFine,
    monotonic,
    oscillatory,
    plateau,
    observedOrder: Number.isFinite(rawObservedOrder)
      ? rawObservedOrder
      : null,
    extrapolated: Number.isFinite(rawExtrapolated)
      ? rawExtrapolated
      : null,
    asymptotic,
  });
}

function solveObservedOrder(h0, h1, h2, ratio) {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return Number.NaN;
  const residual = (order) => (
    (h0 ** order - h1 ** order)
      / (h1 ** order - h2 ** order)
    - ratio
  );
  let low = 0.05;
  let high = 10;
  let lowResidual = residual(low);
  let highResidual = residual(high);
  if (
    !Number.isFinite(lowResidual)
    || !Number.isFinite(highResidual)
    || lowResidual * highResidual > 0
  ) return Number.NaN;
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const midpoint = (low + high) / 2;
    const midpointResidual = residual(midpoint);
    if (Math.abs(midpointResidual) < 1e-13) return midpoint;
    if (lowResidual * midpointResidual <= 0) {
      high = midpoint;
      highResidual = midpointResidual;
    } else {
      low = midpoint;
      lowResidual = midpointResidual;
    }
  }
  return (low + high) / 2;
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

function hasZeroCrossing(values) {
  return values.some((value, index) => (
    index > 0
    && Math.sign(value) !== 0
    && Math.sign(values[index - 1]) !== 0
    && Math.sign(value) !== Math.sign(values[index - 1])
  ));
}

function relativeChange(left, right) {
  return Math.abs(right - left)
    / Math.max(Math.abs(left), Math.abs(right), 1);
}
