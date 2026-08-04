export const CONVERGENCE_PROFILE_ID = 'BKT_B_ACTUAL_H_RATIO_FOUR_LEVEL_CONVERGENCE_V2';
const LOCAL_QUANTITY_KINDS = new Set(['LOCAL_STRESS', 'SCL_MEMBRANE', 'SCL_BENDING', 'FINITE_RADIUS_PEAK', 'REACTION_SPLIT', 'REACTION_DENSITY', 'REACTION_MOMENT']);
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

export function evaluateConvergence({ quantityKind, levels, requireFourLevels = LOCAL_QUANTITY_KINDS.has(quantityKind), finestRelativeChangeLimit = null, referenceValue = null, referenceRelativeErrorLimit = null } = {}) {
  if (!Array.isArray(levels) || levels.length < (requireFourLevels ? 4 : 3)) throw new TypeError(`${quantityKind} requires at least ${requireFourLevels ? 'four' : 'three'} mesh levels.`);
  const useProbeH = LOCAL_QUANTITY_KINDS.has(quantityKind);
  const ordered = [...levels].map((row) => ({ ...row, effectiveH: useProbeH ? row.probeH : row.h })).sort((a, b) => b.effectiveH - a.effectiveH);
  ordered.forEach((row, i) => {
    if (!(row.h > 0) || !Number.isFinite(row.value)) throw new TypeError(`Invalid convergence level ${i}.`);
    if (useProbeH && !(row.probeH > 0)) throw new TypeError(`Local quantity ${quantityKind} requires a positive probeH at level ${i}.`);
    if (!(row.effectiveH > 0)) throw new TypeError(`Invalid characteristic size at level ${i}.`);
    if (i > 0 && !(ordered[i - 1].effectiveH > row.effectiveH)) throw new TypeError('Effective characteristic sizes must be strictly decreasing.');
  });
  if (quantityKind === 'TOTAL_REACTION') return Object.freeze({ convergenceProfileId: CONVERGENCE_PROFILE_ID, quantityKind, classification: CONVERGENCE_DISPOSITIONS.EQUILIBRIUM_ONLY, disposition: CONVERGENCE_DISPOSITIONS.EQUILIBRIUM_ONLY, acceptedForAdjudication: false, reason: 'Total reaction is an equilibrium check, not a mesh-convergence quantity.' });
  const windows = []; for (let i = 0; i <= ordered.length - 3; i += 1) windows.push(evaluateThree(ordered.slice(i, i + 3)));
  const finestRelativeChange = relativeChange(ordered.at(-2).value, ordered.at(-1).value);
  const values = ordered.map((row) => row.value); const zeroCrossing = values.some((value, i) => i > 0 && Math.sign(value) !== 0 && Math.sign(values[i - 1]) !== 0 && Math.sign(value) !== Math.sign(values[i - 1]));
  const oscillatory = windows.some((row) => row.oscillatory); const plateau = windows.every((row) => row.plateau); const monotonic = windows.every((row) => row.monotonic); const asymptotic = windows.every((row) => row.asymptotic || row.plateau);
  const orders = windows.map((row) => row.observedOrder).filter((value) => Number.isFinite(value)); const referenceRelativeError = referenceValue === null ? null : relativeChange(ordered.at(-1).value, referenceValue);
  let disposition;
  if (zeroCrossing) disposition = CONVERGENCE_DISPOSITIONS.ZERO_CROSSING_REVIEW;
  else if (oscillatory) disposition = ordered.length <= 4 ? CONVERGENCE_DISPOSITIONS.ADDITIONAL_LEVEL_REQUIRED : CONVERGENCE_DISPOSITIONS.OSCILLATORY;
  else if (!asymptotic) disposition = CONVERGENCE_DISPOSITIONS.NON_ASYMPTOTIC;
  else if (referenceRelativeErrorLimit !== null && referenceRelativeError > referenceRelativeErrorLimit) disposition = CONVERGENCE_DISPOSITIONS.REFERENCE_ERROR_FAILURE;
  else if (finestRelativeChangeLimit !== null && finestRelativeChange > finestRelativeChangeLimit) disposition = CONVERGENCE_DISPOSITIONS.FINEST_CHANGE_FAILURE;
  else disposition = plateau ? CONVERGENCE_DISPOSITIONS.PASS_PLATEAU : CONVERGENCE_DISPOSITIONS.PASS_ASYMPTOTIC;
  const acceptedForAdjudication = disposition === CONVERGENCE_DISPOSITIONS.PASS_ASYMPTOTIC || disposition === CONVERGENCE_DISPOSITIONS.PASS_PLATEAU;
  return Object.freeze({
    convergenceProfileId: CONVERGENCE_PROFILE_ID, quantityKind, levelCount: ordered.length,
    characteristicSizeAuthority: useProbeH ? 'PROBE_LOCAL_H' : 'GLOBAL_H',
    actualGlobalCharacteristicSizes: Object.freeze(ordered.map((row) => row.h)),
    actualProbeLocalCharacteristicSizes: Object.freeze(ordered.map((row) => row.probeH ?? null)),
    effectiveCharacteristicSizes: Object.freeze(ordered.map((row) => row.effectiveH)),
    finestRelativeChange, referenceRelativeError, observedOrderRange: orders.length ? Object.freeze([Math.min(...orders), Math.max(...orders)]) : null,
    monotonic, oscillatory, zeroCrossing, plateau, asymptotic,
    requiresAdditionalLevel: disposition === CONVERGENCE_DISPOSITIONS.ADDITIONAL_LEVEL_REQUIRED,
    disposition, windows: Object.freeze(windows), acceptedForAdjudication,
  });
}
function evaluateThree([coarse, medium, fine]) {
  const deltaCoarse = coarse.value - medium.value; const deltaFine = medium.value - fine.value;
  const scale = Math.max(1, Math.abs(coarse.value), Math.abs(medium.value), Math.abs(fine.value)); const zeroTol = 1e-13 * scale;
  const coarseZero = Math.abs(deltaCoarse) <= zeroTol; const fineZero = Math.abs(deltaFine) <= zeroTol; const plateau = coarseZero && fineZero;
  const monotonic = plateau || (!coarseZero && !fineZero && Math.sign(deltaCoarse) === Math.sign(deltaFine)); const oscillatory = !plateau && !monotonic;
  const ratio = !fineZero ? deltaCoarse / deltaFine : Number.NaN;
  const observedOrder = plateau ? Number.POSITIVE_INFINITY : monotonic ? solveObservedOrder(coarse.effectiveH, medium.effectiveH, fine.effectiveH, ratio) : Number.NaN;
  const ratioFine = medium.effectiveH / fine.effectiveH;
  const extrapolated = Number.isFinite(observedOrder) && Math.abs(ratioFine ** observedOrder - 1) > 1e-14 ? fine.value + (fine.value - medium.value) / (ratioFine ** observedOrder - 1) : plateau ? fine.value : Number.NaN;
  const asymptotic = plateau || (monotonic && Number.isFinite(observedOrder) && observedOrder >= 0.5 && observedOrder <= 8);
  return Object.freeze({ coarse, medium, fine, deltaCoarse, deltaFine, monotonic, oscillatory, plateau, observedOrder, extrapolated, asymptotic });
}
function solveObservedOrder(h0, h1, h2, ratio) {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return Number.NaN;
  const f = (p) => (h0 ** p - h1 ** p) / (h1 ** p - h2 ** p) - ratio;
  let low = 0.05; let high = 10; let fLow = f(low); let fHigh = f(high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh) || fLow * fHigh > 0) return Number.NaN;
  for (let i = 0; i < 120; i += 1) { const mid = (low + high) / 2; const fMid = f(mid); if (Math.abs(fMid) < 1e-13) return mid; if (fLow * fMid <= 0) { high = mid; fHigh = fMid; } else { low = mid; fLow = fMid; } }
  return (low + high) / 2;
}
function relativeChange(a, b) { return Math.abs(b - a) / Math.max(Math.abs(a), Math.abs(b), 1); }
