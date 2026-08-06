import { getPipeDimensions } from '../../../core/geometry/pipeSchedules.js';
import { resolveNominalPipeSizeFromOutsideDiameter } from '../../../core/geometry/nominal-pipe-size-resolution.js';
import { resolveNominalBoreMm } from './branch-schedule-resolution.js';

/**
 * Resolves the section dimensions used by every piping calculation consumer.
 * Topology OD/wall are source-explicit authority. The schedule master verifies
 * them when covered; missing master coverage is reported and never replaced by
 * a different schedule or guessed dimensions.
 */
export function resolvePosSectionSourceAuthority({ target, schedule, tolerancesMm }) {
  const edge = target?.edge;
  if (edge) return resolveTopologyAuthority(edge, schedule, tolerancesMm);
  return resolveEnrichedAuthority(target?.record, schedule);
}

function resolveTopologyAuthority(edge, schedule, tolerancesMm) {
  const tolerances = normalizeTolerances(tolerancesMm);
  const outsideDiameterMm = finiteOrNull(edge.outsideDiameterMm);
  const wallThicknessMm = finiteOrNull(edge.wallThicknessMm);
  const sourceDimensionsValid = outsideDiameterMm > 0
    && wallThicknessMm > 0
    && outsideDiameterMm > 2 * wallThicknessMm;
  if (!sourceDimensionsValid) {
    return Object.freeze({
      nominalSize: blockedNominal('BLOCKED_TOPOLOGY_SECTION_INVALID'),
      dimensions: null,
      dimensionAuthority: 'TOPOLOGY_DIAMETER_AND_WALL_THICKNESS',
      verification: verification(false, 'BLOCKED_TOPOLOGY_SECTION_INVALID', {
        message: 'Topology DIAMETER and WALL_THICK must define a positive annular section.',
        sourceOutsideDiameterMm: outsideDiameterMm,
        sourceWallThicknessMm: wallThicknessMm,
        masterOutsideDiameterMm: null,
        masterWallThicknessMm: null,
        outsideDiameterResidualMm: null,
        wallThicknessResidualMm: null,
        masterCoverage: false,
      }),
    });
  }

  const nominalSize = resolveNominalPipeSizeFromOutsideDiameter(
    outsideDiameterMm,
    tolerances.outsideDiameterMm,
  );
  if (!nominalSize.exact) {
    return Object.freeze({
      nominalSize,
      dimensions: null,
      dimensionAuthority: 'TOPOLOGY_DIAMETER_AND_WALL_THICKNESS',
      verification: verification(false, nominalSize.status, {
        message: 'Topology outside diameter did not resolve one exact standard nominal size.',
        sourceOutsideDiameterMm: outsideDiameterMm,
        sourceWallThicknessMm: wallThicknessMm,
        masterOutsideDiameterMm: null,
        masterWallThicknessMm: null,
        outsideDiameterResidualMm: null,
        wallThicknessResidualMm: null,
        masterCoverage: false,
      }),
    });
  }

  const master = schedule == null ? null : getPipeDimensions(nominalSize.dn, schedule);
  const dimensions = Object.freeze({
    outsideDiameterMm,
    wallThicknessMm,
    nps: nominalSize.nps,
  });
  if (!master?.exact) {
    return Object.freeze({
      nominalSize,
      dimensions,
      dimensionAuthority: 'TOPOLOGY_DIAMETER_AND_WALL_THICKNESS',
      verification: verification(true, 'SOURCE_EXPLICIT_MASTER_COVERAGE_MISSING', {
        message: `Source OD/wall retained; the schedule master has no exact DN ${nominalSize.dn} Sch ${schedule} row.`,
        sourceOutsideDiameterMm: outsideDiameterMm,
        sourceWallThicknessMm: wallThicknessMm,
        masterOutsideDiameterMm: null,
        masterWallThicknessMm: null,
        outsideDiameterResidualMm: null,
        wallThicknessResidualMm: null,
        masterCoverage: false,
        masterDiagnostics: master?.diagnostics ?? [],
      }),
    });
  }

  const outsideDiameterResidualMm = outsideDiameterMm - master.od;
  const wallThicknessResidualMm = wallThicknessMm - master.wt;
  const agrees = Math.abs(outsideDiameterResidualMm) <= tolerances.outsideDiameterMm
    && Math.abs(wallThicknessResidualMm) <= tolerances.wallThicknessMm;
  return Object.freeze({
    nominalSize,
    dimensions,
    dimensionAuthority: 'TOPOLOGY_DIAMETER_AND_WALL_THICKNESS',
    verification: verification(agrees,
      agrees ? 'SOURCE_EXPLICIT_MASTER_VERIFIED' : 'BLOCKED_SOURCE_MASTER_DIMENSION_CONFLICT', {
        message: agrees
          ? 'Topology OD/wall agree with the resolved nominal-size/schedule master within configured tolerances.'
          : 'Topology OD/wall conflict with the resolved nominal-size/schedule master outside configured tolerances.',
        sourceOutsideDiameterMm: outsideDiameterMm,
        sourceWallThicknessMm: wallThicknessMm,
        masterOutsideDiameterMm: master.od,
        masterWallThicknessMm: master.wt,
        outsideDiameterResidualMm,
        wallThicknessResidualMm,
        masterCoverage: true,
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
      dimensionAuthority: 'ENGINEERING_PIPE_SCHEDULE_DATASET',
      verification: verification(false, 'BLOCKED_PIPE_DIMENSION_LOOKUP', {
        message: 'Source-only calculation requires exact nominal-bore/schedule master coverage.',
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
    nominalSize: Object.freeze({
      exact: true,
      status: 'SOURCE_NOMINAL_BORE',
      dn: nominalBoreMm,
      nps: master.nps,
    }),
    dimensions: Object.freeze({
      outsideDiameterMm: master.od,
      wallThicknessMm: master.wt,
      nps: master.nps,
    }),
    dimensionAuthority: master.source?.id || 'ENGINEERING_PIPE_SCHEDULE_DATASET',
    verification: verification(true, 'MASTER_DERIVED_SOURCE_ONLY', {
      message: 'Source-only fixture dimensions are derived from exact nominal-bore/schedule master coverage.',
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

function verification(acceptable, status, data) {
  return Object.freeze({ acceptable, status, ...data });
}

function blockedNominal(status) {
  return Object.freeze({ exact: false, status, dn: null, nps: null, diagnostics: Object.freeze([status]) });
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
