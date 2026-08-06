import { pipeScheduleData } from '../../data/pipe_schedule_data.js';

/**
 * Resolves nominal DN/NPS from a source-explicit outside diameter. One and only
 * one nominal size in the governed pipe-size dataset must lie inside the
 * configured measurement tolerance. This is not a nearest-size fallback.
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

  const identities = new Map();
  for (const row of pipeScheduleData.rows) {
    const dn = Number(row.dn);
    const nps = Number(row.nps_num ?? row.nps);
    const standardOutsideDiameterMm = Number(row.od_mm);
    if (![dn, nps, standardOutsideDiameterMm].every(Number.isFinite)) continue;
    const key = `${dn}|${nps}|${standardOutsideDiameterMm}`;
    if (!identities.has(key)) {
      identities.set(key, Object.freeze({ dn, nps, standardOutsideDiameterMm }));
    }
  }
  const candidates = [...identities.values()]
    .map((row) => Object.freeze({ ...row, residualMm: outsideDiameter - row.standardOutsideDiameterMm }))
    .filter((row) => Math.abs(row.residualMm) <= tolerance)
    .sort((a, b) => Math.abs(a.residualMm) - Math.abs(b.residualMm) || a.dn - b.dn);
  const nominalIdentities = [...new Set(candidates.map((row) => `${row.dn}|${row.nps}`))];

  if (nominalIdentities.length !== 1) {
    return Object.freeze({
      status: candidates.length === 0
        ? 'BLOCKED_OUTSIDE_DIAMETER_NOT_IN_STANDARD_SIZE_TABLE'
        : 'BLOCKED_OUTSIDE_DIAMETER_SIZE_AMBIGUOUS',
      exact: false,
      dn: null,
      nps: null,
      outsideDiameterMm: outsideDiameter,
      diagnostics: Object.freeze(candidates.map((row) => `DN${row.dn}:NPS${row.nps}:RESIDUAL=${row.residualMm}`)),
      source: pipeScheduleData.source,
    });
  }

  const match = candidates[0];
  return Object.freeze({
    status: 'RESOLVED_EXACT_SOURCE_OD',
    exact: true,
    dn: match.dn,
    nps: match.nps,
    outsideDiameterMm: outsideDiameter,
    standardOutsideDiameterMm: match.standardOutsideDiameterMm,
    residualMm: match.residualMm,
    toleranceMm: tolerance,
    diagnostics: Object.freeze([]),
    source: pipeScheduleData.source,
  });
}
