import { createPipeDataDb } from '../../vendors/pipe-component-data/src/index.js';
import { COMPONENT_SOURCE_STATUS } from '../../data/componentMasterDb/defaultComponentMasterDb.js';

export const PIPE_DATA_SOURCE_ID = 'pipe-component-data';

const INCH_TO_MM = 25.4;

let _db = null;
function getDb() {
  if (!_db) _db = createPipeDataDb();
  return _db;
}

function lookupForComponentType(query) {
  const db = getDb();
  const componentType = String(query.componentType || '');
  const nps = query.nps != null ? String(query.nps) : undefined;
  const rating = query.rating != null ? String(query.rating) : undefined;

  if (componentType.startsWith('VALVE_')) {
    return db.lookupValve({
      valveType: componentType.slice('VALVE_'.length) || 'GATE',
      nps,
      classRating: rating,
      facing: 'RF',
    });
  }
  if (componentType.startsWith('FLANGE_')) {
    return db.lookupFlange({
      subtype: componentType.slice('FLANGE_'.length) || 'WN',
      nps,
      classRating: rating,
      facing: 'RF',
    });
  }
  if (componentType.startsWith('ELBOW_') || componentType.startsWith('TEE_') || componentType.startsWith('OLET_')) {
    return db.lookupFitting({
      subtype: componentType,
      nps,
      schedule: query.schedule != null ? String(query.schedule) : undefined,
    });
  }
  return { ok: false, code: 'UNSUPPORTED_COMPONENT_TYPE', query };
}

function toMasterDbRowShape(componentType, hit) {
  const row = hit.row;
  const mapped = {
    id: `PCD|${hit.matchKey}`,
    componentType,
    standard: row.standard,
    nps: Number(row.nps),
    dn: Number(row.dn),
    rating: row.classRating != null ? Number(row.classRating) : null,
    schedule: row.schedule ?? null,
    sourceStatus: row.dataStatus === 'VERIFIED_SCREENING'
      ? COMPONENT_SOURCE_STATUS.VERIFIED
      : COMPONENT_SOURCE_STATUS.SCREENING_SAMPLE,
    source: `${PIPE_DATA_SOURCE_ID}: ${row.source}`,
  };

  const ff = Number(row.ffRfMm);
  if (Number.isFinite(ff)) {
    mapped.faceToFace_mm = ff;
    mapped.faceToFace_in = ff / INCH_TO_MM;
  }
  const thk = Number(row.flangeThicknessMm);
  if (Number.isFinite(thk)) {
    mapped.thickness_mm = thk;
    mapped.thickness_in = thk / INCH_TO_MM;
  }
  const c2e = Number(row.centerlineRadiusMm);
  if (Number.isFinite(c2e)) {
    mapped.c2e_mm = c2e;
    mapped.c2e_in = c2e / INCH_TO_MM;
  }
  const wt = Number(row.weightKg);
  if (Number.isFinite(wt)) mapped.componentWeight_kg = wt;
  return mapped;
}

/**
 * Resolve component dimensions from the vendored pipe-component-data DB,
 * mirroring resolveComponentDimension()'s qualified-result shape. Misses
 * return isQualified:false so the caller falls back to the internal rows.
 */
export function resolveComponentDimensionFromPackage(query = {}) {
  const hit = lookupForComponentType(query);

  if (!hit.ok) {
    return {
      schemaVersion: 'component-dimension-resolution-v1',
      moduleId: 'component-data',
      methodId: 'PIPE_COMPONENT_DATA_LOOKUP',
      formulaIds: ['PIPE_COMPONENT_DATA_LOOKUP'],
      status: 'MISSING_COMPONENT_DATA',
      isQualified: false,
      sourceStatus: COMPONENT_SOURCE_STATUS.MISSING_COMPONENT_DATA,
      source: PIPE_DATA_SOURCE_ID,
      row: null,
      value: null,
      diagnostics: [{
        severity: 'info',
        code: 'PIPE_DATA_EXTERNAL_MISS',
        message: `pipe-component-data has no row for query: ${JSON.stringify(query)}`,
        data: query,
      }],
    };
  }

  const row = toMasterDbRowShape(query.componentType, hit);
  return {
    schemaVersion: 'component-dimension-resolution-v1',
    moduleId: 'component-data',
    methodId: 'PIPE_COMPONENT_DATA_LOOKUP',
    formulaIds: ['PIPE_COMPONENT_DATA_LOOKUP'],
    status: 'PASSED',
    isQualified: true,
    sourceStatus: row.sourceStatus,
    source: row.source,
    row,
    value: row,
    diagnostics: [{
      severity: 'info',
      code: 'PIPE_DATA_EXTERNAL_HIT',
      message: `Resolved from pipe-component-data (${hit.matchKey}).`,
    }],
  };
}
