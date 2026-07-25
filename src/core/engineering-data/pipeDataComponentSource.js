import { createPipeDataDb } from '../../vendors/pipe-component-data/src/index.js';

export const PIPE_DATA_SOURCE_ID = 'pipe-component-data';

const INCH_TO_MM = 25.4;

let _db = null;
function getDb() {
  if (!_db) _db = createPipeDataDb();
  return _db;
}

/**
 * Resolve pipe section properties from the vendored pipe-component-data DB.
 * Mirrors the qualified-result shape returned by resolvePipeSection() so the
 * caller can substitute it transparently. The package row is metric; inch
 * fields and section properties are derived with the same formulas the
 * internal screening table uses.
 *
 * @param {Object} params - { nps, schedule }
 * @returns {Object} { status, isQualified, source, value, diagnostics }
 */
export function resolvePipeSectionFromPackage({ nps, schedule } = {}) {
  const hit = getDb().lookupPipe({ nps: String(nps), schedule: String(schedule) });

  if (!hit.ok) {
    return {
      status: 'MISSING_DATA',
      isQualified: false,
      source: PIPE_DATA_SOURCE_ID,
      value: null,
      diagnostics: [
        {
          code: 'PIPE_DATA_EXTERNAL_MISS',
          severity: 'INFO',
          message: `pipe-component-data has no row for NPS ${nps} schedule ${schedule}; falling back to internal table.`,
        },
      ],
    };
  }

  const od_in = Number(hit.row.odMm) / INCH_TO_MM;
  const wall_in = Number(hit.row.wallMm) / INCH_TO_MM;
  const id_in = od_in - 2 * wall_in;
  const I_in4 = (Math.PI / 64) * (od_in ** 4 - id_in ** 4);
  const Z_in3 = I_in4 / (od_in / 2 || 1);

  return {
    status: 'PASSED',
    isQualified: true,
    source: `${PIPE_DATA_SOURCE_ID}: ${hit.provenance?.source || hit.row.source}`,
    value: {
      nps: Number(nps),
      schedule: String(schedule),
      od_in,
      wall_in,
      wt_in: wall_in,
      id_in,
      I_in4,
      Z_in3,
      od_mm: Number(hit.row.odMm),
      wall_mm: Number(hit.row.wallMm),
      wt_mm: Number(hit.row.wallMm),
      weight_kg_per_m: Number(hit.row.weightKgPerM),
      source: hit.provenance?.source || hit.row.source,
      dataStatus: hit.provenance?.dataStatus || hit.row.dataStatus,
    },
    diagnostics: [
      {
        code: 'PIPE_DATA_EXTERNAL_HIT',
        severity: 'INFO',
        message: `Resolved from pipe-component-data (${hit.matchKey}).`,
      },
    ],
  };
}
