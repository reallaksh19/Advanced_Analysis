const NOMINAL_PIPE_OD_ROWS = Object.freeze([
  row(15, 0.5, 21.34),
  row(20, 0.75, 26.67),
  row(25, 1, 33.4),
  row(32, 1.25, 42.16),
  row(40, 1.5, 48.26),
  row(50, 2, 60.33),
  row(65, 2.5, 73.03),
  row(80, 3, 88.9),
  row(100, 4, 114.3),
  row(125, 5, 141.3),
  row(150, 6, 168.275),
  row(200, 8, 219.075),
  row(250, 10, 273.05),
  row(300, 12, 323.85),
  row(350, 14, 355.6),
  row(400, 16, 406.4),
  row(450, 18, 457.2),
  row(500, 20, 508),
  row(600, 24, 609.6),
  row(750, 30, 762),
  row(900, 36, 914.4),
]);

export const NOMINAL_PIPE_OD_CROSSWALK_SOURCE = Object.freeze({
  id: 'NOMINAL_PIPE_OD_CROSSWALK_V1',
  basis: 'PROJECT_GOVERNED_STANDARD_OD_CROSSWALK',
  units: 'mm',
});

/**
 * Resolves nominal DN/NPS from a source-explicit outside diameter. One and only
 * one governed standard OD must lie inside the configured measurement
 * tolerance. This is an exact crosswalk, not a nearest-size fallback.
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
      source: NOMINAL_PIPE_OD_CROSSWALK_SOURCE,
    });
  }

  const candidates = NOMINAL_PIPE_OD_ROWS
    .map((item) => Object.freeze({ ...item, residualMm: outsideDiameter - item.standardOutsideDiameterMm }))
    .filter((item) => Math.abs(item.residualMm) <= tolerance)
    .sort((a, b) => Math.abs(a.residualMm) - Math.abs(b.residualMm) || a.dn - b.dn);

  if (candidates.length !== 1) {
    return Object.freeze({
      status: candidates.length === 0
        ? 'BLOCKED_OUTSIDE_DIAMETER_NOT_IN_STANDARD_SIZE_TABLE'
        : 'BLOCKED_OUTSIDE_DIAMETER_SIZE_AMBIGUOUS',
      exact: false,
      dn: null,
      nps: null,
      outsideDiameterMm: outsideDiameter,
      diagnostics: Object.freeze(candidates.map((item) => `DN${item.dn}:NPS${item.nps}:RESIDUAL=${item.residualMm}`)),
      source: NOMINAL_PIPE_OD_CROSSWALK_SOURCE,
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
    source: NOMINAL_PIPE_OD_CROSSWALK_SOURCE,
  });
}

function row(dn, nps, standardOutsideDiameterMm) {
  return Object.freeze({ dn, nps, standardOutsideDiameterMm });
}
