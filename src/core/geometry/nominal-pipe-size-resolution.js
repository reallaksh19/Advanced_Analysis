import { ASME_B36_10 } from './pipeSchedules.js';

const DN_TO_NPS = Object.freeze({
  15: 0.5, 20: 0.75, 25: 1, 40: 1.5, 50: 2, 80: 3,
  100: 4, 150: 6, 200: 8, 250: 10, 300: 12, 350: 14,
  400: 16, 450: 18, 500: 20, 600: 24, 750: 30, 900: 36,
});

/**
 * Resolves nominal DN/NPS from a source-explicit outside diameter. This is an
 * exact source derivation, not a nearest-size fallback: one and only one
 * standard OD must lie inside the declared measurement tolerance.
 */
export function resolveNominalPipeSizeFromOutsideDiameter(outsideDiameterMm, toleranceMm = 0.1) {
  const outsideDiameter = Number(outsideDiameterMm);
  const tolerance = Number(toleranceMm);
  if (!(outsideDiameter > 0) || !Number.isFinite(tolerance) || tolerance < 0) {
    return Object.freeze({
      status: 'BLOCKED_INVALID_OUTSIDE_DIAMETER',
      exact: false,
      dn: null,
      nps: null,
      outsideDiameterMm: Number.isFinite(outsideDiameter) ? outsideDiameter : null,
      diagnostics: Object.freeze(['INVALID_OUTSIDE_DIAMETER_OR_TOLERANCE']),
    });
  }
  const candidates = Object.entries(ASME_B36_10)
    .map(([dn, row]) => ({
      dn: Number(dn),
      nps: DN_TO_NPS[Number(dn)] ?? null,
      standardOutsideDiameterMm: Number(row.od),
      residualMm: outsideDiameter - Number(row.od),
    }))
    .filter((row) => row.nps != null && Math.abs(row.residualMm) <= tolerance);
  if (candidates.length !== 1) {
    return Object.freeze({
      status: candidates.length === 0
        ? 'BLOCKED_OUTSIDE_DIAMETER_NOT_IN_STANDARD_SIZE_TABLE'
        : 'BLOCKED_OUTSIDE_DIAMETER_SIZE_AMBIGUOUS',
      exact: false,
      dn: null,
      nps: null,
      outsideDiameterMm: outsideDiameter,
      diagnostics: Object.freeze(candidates.map((row) => `DN${row.dn}:RESIDUAL=${row.residualMm}`)),
    });
  }
  return Object.freeze({
    status: 'RESOLVED_EXACT_SOURCE_OD',
    exact: true,
    dn: candidates[0].dn,
    nps: candidates[0].nps,
    outsideDiameterMm: outsideDiameter,
    standardOutsideDiameterMm: candidates[0].standardOutsideDiameterMm,
    residualMm: candidates[0].residualMm,
    toleranceMm: tolerance,
    diagnostics: Object.freeze([]),
  });
}
