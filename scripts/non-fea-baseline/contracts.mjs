import { deepFreeze } from '../../src/core/shared-piping-model/immutable.js';

export const NON_FEA_BASELINE_SCHEMA = 'non-fea-current-main-baseline/v1';
export const NON_FEA_ROUTE_INVENTORY_SCHEMA = 'non-fea-production-route-inventory/v1';
export const NON_FEA_PROCESS_LOG_SCHEMA = 'non-fea-process-log/v1';

export const NON_FEA_STAGE_IDS = deepFreeze([
  'FILE_READ',
  'UTF8_DECODE',
  'JSON_PARSE',
  'SOURCE_SNAPSHOT',
  'SOURCE_INDEX',
  'NORMALIZATION',
  'SHARED_MODEL',
  'WORKSPACE_SNAPSHOT',
  'ENGINEERING_MODEL',
  'SUPPORT_SITES',
  'ROUTE_PARTITION',
  'MODEL_ZONE_PROJECTION',
  'RESOLVED_GEOMETRY',
  'RENDER_MODEL',
  'THREE_MATERIALIZATION',
  'GPU_SCENE_INSTALL',
  'FIT',
  'FIRST_MEANINGFUL_FRAME',
  'SELECTION',
  'ORBIT_PAN',
  'CANONICAL_TOPOLOGY',
  'CHECKER',
  'EDIT_PREVIEW_APPLY_UNDO_REDO',
  'ENRICHMENT_PROJECTION',
  'AUTHORIZED_HANDOFF',
  'EMPIRICAL_CALCULATION',
  'LOAD_PRESENTATION',
]);

export const NON_FEA_FAILURE_CLASSIFICATIONS = deepFreeze([
  'PRODUCT_DEFECT',
  'REGRESSION',
  'PRE_EXISTING_CURRENT_MAIN_DEFECT',
  'INFRASTRUCTURE_BLOCKER',
  'STALE_TEST',
  'MISSING_AUTHORITY',
  'OUT_OF_SCOPE_DEPENDENCY',
  'UNRESOLVED_GATE',
]);

export const NON_FEA_TOPOLOGY_FAILURE_CLASSIFICATIONS = deepFreeze([
  'AUTHORITY_DEFECT',
  'NORMALIZATION_DEFECT',
  'TOPOLOGY_DEFECT',
  'AUTOFIX_DEFECT',
  'EDIT_TRANSACTION_DEFECT',
  'RENDERER_DEFECT',
  'STALE_TEST',
  'MISSING_FIXTURE_AUTHORITY',
  'INFRASTRUCTURE_BLOCKER',
]);

export function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function nonFeaFailure({
  classification,
  code,
  message,
  stageId = null,
  details = null,
}) {
  if (!NON_FEA_FAILURE_CLASSIFICATIONS.includes(classification)) {
    throw new RangeError(`Unsupported Non-FEA failure classification: ${classification}.`);
  }
  if (typeof code !== 'string' || !code) throw new TypeError('Non-FEA failure code is required.');
  if (typeof message !== 'string' || !message) throw new TypeError('Non-FEA failure message is required.');
  if (stageId !== null && !NON_FEA_STAGE_IDS.includes(stageId)) {
    throw new RangeError(`Unsupported Non-FEA stage: ${stageId}.`);
  }
  return deepFreeze({ classification, code, message, stageId, details });
}

export function requireExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort(codeUnitCompare);
  const expected = [...expectedKeys].sort(codeUnitCompare);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} keys do not match the contract.`);
  }
  return value;
}

export function roundMilliseconds(value) {
  return Number(Number(value).toFixed(3));
}
