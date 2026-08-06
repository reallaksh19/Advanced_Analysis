import { getPipeDimensions } from '../../../core/geometry/pipeSchedules.js';
import { resolveNominalPipeSizeFromOutsideDiameter } from '../../../core/geometry/nominal-pipe-size-resolution.js';
import { resolveNominalBoreMm } from './branch-schedule-resolution.js';

/**
 * Branch/fitting schedule controls wall thickness. Topology OD identifies the
 * nominal size and topology wall is retained only as comparison evidence.
 */
export function resolvePosSectionSourceAuthority({ target, schedule, tolerancesMm }) {
  return target?.edge
    ? resolveTopologyAuthority(target.edge, schedule, tolerancesMm)
    : resolveEnrichedAuthority(target?.record, schedule);
}

function resolveTopologyAuthority(edge, schedule, tolerancesMm) {
  const tolerances = normalizeTolerances(tolerancesMm);
  const sourceOutsideDiameterMm = finiteOrNull(edge.outsideDiameterMm);
  const sourceWallThicknessMm = finiteOrNull(edge.wallThicknessMm);
  const nominalSize = resolveNominalPipeSizeFromOutsideDiameter(
    sourceOutsideDiameterMm,
    tolerances.outsideDiameterMm,
  );
  if (!nominalSize.exact) {
    return Object.freeze({
      nominalSize,
      dimensions: null,
      dimensionAuthority: 'SCHEDULE_SECTION_UNRESOLVED',
      verification: verification(false, nominalSize.status, {
        message: 'Topology OD did not resolve one exact governed nominal size.',
        sourceOutsideDiameterMm,
        sourceWallThicknessMm,
        masterOutsideDiameterMm: null,
        masterWallThicknessMm: null,
        outsideDiameterResidualMm: null,
        wallThicknessResidualMm: null,
        masterCoverage: false,
      }),
    });
  }

  const master = schedule == null ? null : getPipeDimensions(nominalSize.dn, schedule);
  if (!master?.exact) {
    return Object.freeze({
      nominalSize,
      dimensions: null,
      dimensionAuthority: 'PROJECT_CONFIGURED_SCHEDULE_SECTION_REQUIRED',
      verification: verification(true, 'SCHEDULE_MASTER_COVERAGE_MISSING_CONFIG_REQUIRED', {
        message: `No exact master row exists for DN ${nominalSize.dn} Sch ${schedule}; an explicitly scoped Project Data section is required.`,
        sourceOutsideDiameterMm,
        sourceWallThicknessMm,
        masterOutsideDiameterMm: null,
        masterWallThicknessMm: null,
        outsideDiameterResidualMm: null,
        wallThicknessResidualMm: null,
        masterCoverage: false,
        masterDiagnostics: master?.diagnostics ?? [],
      }),
    });
  }

  const outsideDiameterResidualMm = sourceOutsideDiameterMm - master.od;
  const wallThicknessResidualMm = sourceWallThicknessMm == null ? null : sourceWallThicknessMm - master.wt;
  const outsideDiameterAgrees = Math.abs(outsideDiameterResidualMm) <= tolerances.outsideDiameterMm;
  const wallAgrees = wallThicknessResidualMm == null
    ? null : Math.abs(wallThicknessResidualMm) <= tolerances.wallThicknessMm;
  return Object.freeze({
    nominalSize,
    dimensions: Object.freeze({
      outsideDiameterMm: master.od,
      wallThicknessMm: master.wt,
      nps: master.nps,
    }),
    dimensionAuthority: master.source?.id || 'ENGINEERING_PIPE_SCHEDULE_DATASET',
    verification: verification(outsideDiameterAgrees,
      outsideDiameterAgrees
        ? (wallAgrees === false
          ? 'SCHEDULE_MASTER_SELECTED_TOPOLOGY_WALL_DIFFERS'
          : 'SCHEDULE_MASTER_VERIFIED')
        : 'BLOCKED_TOPOLOGY_OD_MASTER_CONFLICT', {
        message: outsideDiameterAgrees
          ? (wallAgrees === false
            ? 'Branch schedule/master wall selected; topology wall differs and is retained as audit evidence only.'
            : 'Branch schedule/master dimensions agree with topology OD/wall within configured tolerances.')
          : 'Topology OD conflicts with the schedule master outside the configured tolerance.',
        sourceOutsideDiameterMm,
        sourceWallThicknessMm,
        masterOutsideDiameterMm: master.od,
        masterWallThicknessMm: master.wt,
        outsideDiameterResidualMm,
        wallThicknessResidualMm,
        masterCoverage: true,
        topologyWallUsedForCalculation: false,
        masterSource: master.source ?? null,
      }),
  });
}

function resolveEnrichedAuthority(record, schedule) {
  const nominalBoreMm = record ? resolveNominalBoreMm(record.item) : null;
  const master = nominalBoreMm != null && schedule != null
    ? getPipeDimensions(nominalBoreMm, schedule)
    : null;
  if (!master?.exact) {
    return Object.freeze({
      nominalSize: nominalBoreMm > 0
        ? Object.freeze({ exact: true, status: 'SOURCE_NOMINAL_BORE', dn: nominalBoreMm, nps: master?.nps ?? null })
        : blockedNominal('SOURCE_NOMINAL_BORE_UNRESOLVED'),
      dimensions: null,
      dimensionAuthority: 'PROJECT_CONFIGURED_SCHEDULE_SECTION_REQUIRED',
      verification: verification(true, 'SCHEDULE_MASTER_COVERAGE_MISSING_CONFIG_REQUIRED', {
        message: 'Exact nominal-bore/schedule master coverage is missing; an explicitly scoped Project Data section is required.',
        sourceOutsideDiameterMm: null,
        sourceWallThicknessMm: null,
        masterOutsideDiameterMm: null,
        masterWallThicknessMm: null,
        outsideDiameterResidualMm: null,
        wallThicknessResidualMm: null,
        masterCoverage: false,
        masterDiagnostics: master?.diagnostics ?? [],
      }),
    });
  }
  return Object.freeze({
    nominalSize: Object.freeze({ exact: true, status: 'SOURCE_NOMINAL_BORE', dn: nominalBoreMm, nps: master.nps }),
    dimensions: Object.freeze({ outsideDiameterMm: master.od, wallThicknessMm: master.wt, nps: master.nps }),
    dimensionAuthority: master.source?.id || 'ENGINEERING_PIPE_SCHEDULE_DATASET',
    verification: verification(true, 'SCHEDULE_MASTER_DERIVED', {
      message: 'Section dimensions derive from exact nominal-bore/schedule master coverage.',
      sourceOutsideDiameterMm: null,
      sourceWallThicknessMm: null,
      masterOutsideDiameterMm: master.od,
      masterWallThicknessMm: master.wt,
      outsideDiameterResidualMm: null,
      wallThicknessResidualMm: null,
      masterCoverage: true,
      masterSource: master.source ?? null,
    }),
  });
}

function normalizeTolerances(value) {
  if (!value || typeof value !== 'object') {
    throw new TypeError('dimensionVerificationTolerancesMm must be configured for topology POS resolution.');
  }
  const outsideDiameterMm = Number(value.outsideDiameterMm);
  const wallThicknessMm = Number(value.wallThicknessMm);
  if (!Number.isFinite(outsideDiameterMm) || outsideDiameterMm < 0
    || !Number.isFinite(wallThicknessMm) || wallThicknessMm < 0) {
    throw new RangeError('Configured OD/wall verification tolerances must be finite and non-negative.');
  }
  return Object.freeze({ outsideDiameterMm, wallThicknessMm });
}
function verification(acceptable, status, data) { return Object.freeze({ acceptable, status, ...data }); }
function blockedNominal(status) { return Object.freeze({ exact: false, status, dn: null, nps: null, diagnostics: Object.freeze([status]) }); }
function finiteOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
