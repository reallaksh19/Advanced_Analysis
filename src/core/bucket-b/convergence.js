export const CONVERGENCE_PROFILE_ID = 'BKT_B_ACTUAL_H_RATIO_FOUR_LEVEL_CONVERGENCE_V1';
const LOCAL_QUANTITY_KINDS = new Set(['LOCAL_STRESS', 'SCL_MEMBRANE', 'SCL_BENDING', 'FINITE_RADIUS_PEAK', 'REACTION_SPLIT', 'REACTION_DENSITY', 'REACTION_MOMENT']);

export function evaluateConvergence({ quantityKind, levels, requireFourLevels = LOCAL_QUANTITY_KINDS.has(quantityKind) } = {}) {
  if (!Array.isArray(levels) || levels.length < (requireFourLevels ? 4 : 3)) {
    throw new TypeError(`${quantityKind} requires at least ${requireFourLevels ? 'four' : 'three'} mesh levels.`);
  }
  const ordered = [...levels].sort((a, b) => b.h - a.h);
  ordered.forEach((row, i) => {
    if (!(row.h > 0) || !Number.isFinite(row.value)) throw new TypeError(`Invalid convergence level ${i}.`);
    if (i > 0 && !(ordered[i - 1].h > row.h)) throw new TypeError('Characteristic sizes must be strictly decreasing.');
  });
  if (quantityKind === 'TOTAL_REACTION') {
    return Object.freeze({
      convergenceProfileId: CONVERGENCE_PROFILE_ID,
      quantityKind,
      classification: 'EQUILIBRIUM_ONLY',
      accepted: false,
      reason: 'Total reaction is an equilibrium check, not a mesh-convergence quantity.',
    });
  }
  const windows = [];
  for (let i = 0; i <= ordered.length - 3; i += 1) windows.push(evaluateThree(ordered.slice(i, i + 3)));
  const finestChange = relativeChange(ordered.at(-2).value, ordered.at(-1).value);
  const monotonic = windows.every((row) => row.monotonic);
  const orders = windows.map((row) => row.observedOrder).filter(Number.isFinite);
  const oscillatory = !monotonic || windows.some((row, i) => i > 0 && Math.sign(row.deltaFine) !== Math.sign(windows[i - 1].deltaFine));
  return Object.freeze({
    convergenceProfileId: CONVERGENCE_PROFILE_ID,
    quantityKind,
    levelCount: ordered.length,
    actualGlobalCharacteristicSizes: Object.freeze(ordered.map((row) => row.h)),
    actualProbeLocalCharacteristicSizes: Object.freeze(ordered.map((row) => row.probeH ?? row.h)),
    finestRelativeChange: finestChange,
    observedOrderRange: orders.length ? Object.freeze([Math.min(...orders), Math.max(...orders)]) : null,
    monotonic,
    oscillatory,
    requiresAdditionalLevel: oscillatory && ordered.length < 4,
    windows: Object.freeze(windows),
    acceptedForAdjudication: !oscillatory && windows.every((row) => row.asymptotic),
  });
}

function evaluateThree([coarse, medium, fine]) {
  const deltaCoarse = coarse.value - medium.value;
  const deltaFine = medium.value - fine.value;
  const monotonic = deltaCoarse === 0 || deltaFine === 0 || Math.sign(deltaCoarse) === Math.sign(deltaFine);
  const observedOrder = monotonic ? solveObservedOrder(coarse.h, medium.h, fine.h, deltaCoarse / deltaFine) : Number.NaN;
  const ratioFine = medium.h / fine.h;
  const extrapolated = Number.isFinite(observedOrder) && Math.abs(ratioFine ** observedOrder - 1) > 1e-14
    ? fine.value + (fine.value - medium.value) / (ratioFine ** observedOrder - 1)
    : Number.NaN;
  return Object.freeze({ coarse, medium, fine, deltaCoarse, deltaFine, monotonic, observedOrder, extrapolated, asymptotic: monotonic && observedOrder >= 0.5 && observedOrder <= 8 });
}

function solveObservedOrder(h0, h1, h2, ratio) {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return Number.NaN;
  const f = (p) => (h0 ** p - h1 ** p) / (h1 ** p - h2 ** p) - ratio;
  let low = 0.05; let high = 10; let fLow = f(low); let fHigh = f(high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh) || fLow * fHigh > 0) return Number.NaN;
  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2; const fMid = f(mid);
    if (Math.abs(fMid) < 1e-12) return mid;
    if (fLow * fMid <= 0) { high = mid; fHigh = fMid; } else { low = mid; fLow = fMid; }
  }
  return (low + high) / 2;
}
function relativeChange(a, b) { return Math.abs(b - a) / Math.max(Math.abs(a), Math.abs(b), 1); }
