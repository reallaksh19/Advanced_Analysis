import { DEFAULT_COMPONENT_MASTER_ROWS, COMPONENT_SOURCE_STATUS, COMPONENT_TYPES } from '../../data/componentMasterDb/defaultComponentMasterDb.js';
import { resolveComponentDimensionFromPackage, PIPE_DATA_SOURCE_ID } from './pipeDataComponentDimensions.js';

export const COMPONENT_DATA_SCHEMA_VERSION = 'component-dimension-resolution-v1';

// Optional provider mirroring resolveEngineeringData's source switch; the app
// store registers it so engineeringDefaults.pipeDataSource selects the source
// without import cycles. Default (null) keeps the internal master rows.
let _componentDataSourceProvider = null;

export function setComponentDataSourceProvider(provider) {
  _componentDataSourceProvider = typeof provider === 'function' ? provider : null;
}

function packageSourceActive() {
  try {
    return _componentDataSourceProvider ? _componentDataSourceProvider() === PIPE_DATA_SOURCE_ID : false;
  } catch {
    return false;
  }
}

export const COMPONENT_DATA_STATUS = Object.freeze({
  PASSED: 'PASSED',
  SCREENING_SAMPLE: 'SCREENING_SAMPLE',
  USER_DEFINED: 'USER_DEFINED',
  MISSING_COMPONENT_DATA: 'MISSING_COMPONENT_DATA',
  NOT_QUALIFIED: 'NOT_QUALIFIED',
});

function mapSourceStatus(sourceStatus) {
  if (sourceStatus === COMPONENT_SOURCE_STATUS.VERIFIED) return COMPONENT_DATA_STATUS.PASSED;
  if (sourceStatus === COMPONENT_SOURCE_STATUS.USER_DEFINED) return COMPONENT_DATA_STATUS.USER_DEFINED;
  if (sourceStatus === COMPONENT_SOURCE_STATUS.SCREENING_SAMPLE) return COMPONENT_DATA_STATUS.SCREENING_SAMPLE;
  return COMPONENT_DATA_STATUS.NOT_QUALIFIED;
}

export function resolveComponentDimension(query = {}, rows = DEFAULT_COMPONENT_MASTER_ROWS) {
  if (packageSourceActive()) {
    const external = resolveComponentDimensionFromPackage(query);
    if (external.isQualified) return external;
  }

  const candidates = rows.filter(row => {
    if (query.componentType && row.componentType !== query.componentType) return false;
    if (query.nps !== undefined && query.nps !== null && row.nps !== undefined && Math.abs(row.nps - query.nps) > 0.01) return false;
    if (query.dn !== undefined && query.dn !== null && row.dn !== undefined && Math.abs(row.dn - query.dn) > 1) return false;
    if (query.branchNps !== undefined && query.branchNps !== null && row.branchNps !== undefined && Math.abs(row.branchNps - query.branchNps) > 0.01) return false;
    if (query.branchDn !== undefined && query.branchDn !== null && row.branchDn !== undefined && Math.abs(row.branchDn - query.branchDn) > 1) return false;
    if (query.rating !== undefined && query.rating !== null && row.rating !== undefined && row.rating !== null && row.rating !== query.rating) return false;
    return true;
  });

  if (candidates.length === 0) {
    return {
      schemaVersion: COMPONENT_DATA_SCHEMA_VERSION,
      moduleId: 'component-data',
      methodId: 'COMPONENT_MASTER_DB_LOOKUP',
      formulaIds: ['COMPONENT_MASTER_DB_REQUIRED'],
      status: COMPONENT_DATA_STATUS.MISSING_COMPONENT_DATA,
      isQualified: false,
      sourceStatus: COMPONENT_SOURCE_STATUS.MISSING_COMPONENT_DATA,
      source: null,
      row: null,
      value: null,
      diagnostics: [{ severity: 'error', code: 'MISSING_COMPONENT_DATA', message: `No component DB row found for query: ${JSON.stringify(query)}`, data: query }],
    };
  }

  const row = candidates[0];
  const status = mapSourceStatus(row.sourceStatus);
  const diagnostics = status === COMPONENT_DATA_STATUS.SCREENING_SAMPLE
    ? [{ severity: 'warn', code: 'COMPONENT_DATA_SCREENING_SAMPLE', message: 'Component data is a screening sample. Verify before final issue.', data: { id: row.id } }]
    : [];

  return {
    schemaVersion: COMPONENT_DATA_SCHEMA_VERSION,
    moduleId: 'component-data',
    methodId: 'COMPONENT_MASTER_DB_LOOKUP',
    formulaIds: ['COMPONENT_MASTER_DB_LOOKUP'],
    status,
    isQualified: status === COMPONENT_DATA_STATUS.PASSED || status === COMPONENT_DATA_STATUS.USER_DEFINED,
    sourceStatus: row.sourceStatus,
    source: row.source,
    row,
    value: row,
    diagnostics,
  };
}

export function resolveElbowC2E({ nps, dn, schedule, angle } = {}) {
  const componentType = angle === 45 ? COMPONENT_TYPES.ELBOW_45_LR : COMPONENT_TYPES.ELBOW_90_LR;
  return resolveComponentDimension({ componentType, nps, dn, schedule });
}

export function resolveTeeC2E({ nps, branchNps, dn, branchDn, schedule } = {}) {
  const isSameSize = nps && branchNps && Math.abs(nps - branchNps) < 0.01;
  const componentType = isSameSize ? COMPONENT_TYPES.TEE_EQUAL : COMPONENT_TYPES.TEE_REDUCING;
  return resolveComponentDimension({ componentType, nps, branchNps, dn, branchDn, schedule });
}

export function resolveOletBRLEN({ nps, branchNps, dn, branchDn, rating, schedule } = {}) {
  return resolveComponentDimension({ componentType: COMPONENT_TYPES.OLET_WELDOLET, nps, branchNps, dn, branchDn, rating, schedule });
}

export function resolveValveFaceToFace({ nps, dn, rating } = {}) {
  return resolveComponentDimension({ componentType: COMPONENT_TYPES.VALVE_BALL, nps, dn, rating });
}

export function resolveFlangeThickness({ nps, dn, rating } = {}) {
  return resolveComponentDimension({ componentType: COMPONENT_TYPES.FLANGE_WN, nps, dn, rating });
}
