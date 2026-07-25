import { resolvePipeProperty } from '../../data/pipeProperties.js';
import { resolveMaterial } from '../../data/materialProperties.js';
import { resolvePipeSectionFromPackage, PIPE_DATA_SOURCE_ID } from './pipeDataComponentSource.js';

// Optional provider so the app store can expose engineeringDefaults.pipeDataSource
// without creating an import cycle. Default (null) keeps the internal table path.
let _pipeDataSourceProvider = null;

export function setPipeDataSourceProvider(provider) {
  _pipeDataSourceProvider = typeof provider === 'function' ? provider : null;
}

function activePipeDataSource(override) {
  if (override) return override;
  try {
    return _pipeDataSourceProvider ? _pipeDataSourceProvider() : null;
  } catch {
    return null;
  }
}

export const DATA_STATUS = Object.freeze({
  PASSED: 'PASSED',
  MISSING_DATA: 'MISSING_DATA',
  NOT_QUALIFIED: 'NOT_QUALIFIED',
  SCREENING_APPROXIMATION: 'SCREENING_APPROXIMATION',
  USER_DEFINED: 'USER_DEFINED',
});

export const INCH_TO_MM = 25.4;

/**
 * Normalize pipe value by computing derived dimensions from raw data.
 * Converts inches to millimeters and calculates missing properties.
 *
 * @param {Object} value - { od_in, wall_in, id_in, I_in4, Z_in3, ... }
 * @returns {Object} Normalized value with both inch and mm properties
 */
function normalizePipeValue(value = {}) {
  const wall_in = Number(value.wall_in ?? value.wt_in ?? 0);
  const od_in = Number(value.od_in ?? 0);
  const id_in = Number(value.id_in ?? (od_in - 2 * wall_in));
  const I_in4 = Number(value.I_in4 ?? (Math.PI / 64 * (od_in ** 4 - id_in ** 4)));
  const Z_in3 = Number(value.Z_in3 ?? (I_in4 / (od_in / 2 || 1)));

  return {
    ...value,
    od_in,
    wall_in,
    wt_in: wall_in,
    id_in,
    I_in4,
    Z_in3,
    od_mm: od_in * INCH_TO_MM,
    wall_mm: wall_in * INCH_TO_MM,
    wt_mm: wall_in * INCH_TO_MM,
  };
}

/**
 * Resolve pipe section properties for a given NPS and schedule.
 * Wraps resolvePipeProperty() from pipeProperties.js.
 * Normalizes returned value with metric conversions.
 *
 * @param {Object} params - { nps, schedule }
 * @returns {Object} { status, isQualified, source, value, diagnostics }
 */
export function resolvePipeSection({ nps, schedule, pipeDataSource } = {}) {
  if (!Number.isFinite(nps) || !schedule) {
    return {
      status: DATA_STATUS.MISSING_DATA,
      isQualified: false,
      source: 'engineering-data/resolveEngineeringData.js',
      value: null,
      diagnostics: [
        {
          code: 'INVALID_PIPE_INPUT',
          severity: 'ERROR',
          message: 'Pipe resolution requires valid nps and schedule parameters.'
        }
      ]
    };
  }

  let fallbackDiagnostics = [];
  if (activePipeDataSource(pipeDataSource) === PIPE_DATA_SOURCE_ID) {
    const external = resolvePipeSectionFromPackage({ nps, schedule });
    if (external.isQualified) return external;
    fallbackDiagnostics = external.diagnostics || [];
  }

  const result = resolvePipeProperty({ nps, schedule });

  return {
    status: result.status === 'PASSED' ? DATA_STATUS.PASSED : DATA_STATUS.MISSING_DATA,
    isQualified: result.isQualified,
    source: result.source || 'Project screening master DB / ASME B36.10M reference required before final issue',
    value: result.value ? normalizePipeValue(result.value) : null,
    diagnostics: [...fallbackDiagnostics, ...(result.diagnostics || [])]
  };
}

/**
 * Resolve material properties at a given temperature.
 * Wraps resolveMaterial() from materialProperties.js.
 *
 * @param {Object} params - { materialId, temperature_F }
 * @returns {Object} { status, isQualified, source, value, diagnostics }
 */
export function resolveMaterialAtTemperature({ materialId, temperature_F } = {}) {
  if (!materialId || !Number.isFinite(temperature_F)) {
    return {
      status: DATA_STATUS.MISSING_DATA,
      isQualified: false,
      source: 'engineering-data/resolveEngineeringData.js',
      value: null,
      diagnostics: [
        {
          code: 'INVALID_MATERIAL_INPUT',
          severity: 'ERROR',
          message: 'Material resolution requires valid materialId and temperature_F parameters.'
        }
      ]
    };
  }

  const result = resolveMaterial({ materialId, temperature_F });

  let status = DATA_STATUS.MISSING_DATA;
  if (result.status === 'PASSED') {
    status = DATA_STATUS.PASSED;
  } else if (result.status === 'NOT_QUALIFIED') {
    status = DATA_STATUS.NOT_QUALIFIED;
  }

  // Enrich value with E_psi and alpha_in_in_F
  const enrichedValue = result.value ? {
    ...result.value,
    E_psi: result.E_psi,
    alpha_in_in_F: result.alpha_in_in_F,
  } : null;

  return {
    status,
    isQualified: result.isQualified,
    source: result.source || 'Project master DB',
    value: enrichedValue,
    diagnostics: result.diagnostics || []
  };
}

/**
 * Resolve both pipe and material for a calculation.
 * Combines resolvePipeSection() and resolveMaterialAtTemperature().
 *
 * @param {Object} params - { nps, schedule, materialId, temperature_F }
 * @returns {Object} { pipe, material, isFullyQualified, diagnostics }
 */
export function resolveEngineeringDataForCalculation({
  nps,
  schedule,
  materialId,
  temperature_F
} = {}) {
  const pipe = resolvePipeSection({ nps, schedule });
  const material = resolveMaterialAtTemperature({ materialId, temperature_F });

  const isFullyQualified = pipe.isQualified && material.isQualified;

  const allDiagnostics = [
    ...pipe.diagnostics,
    ...material.diagnostics
  ];

  return {
    pipe,
    material,
    isFullyQualified,
    diagnostics: allDiagnostics
  };
}
