import { isPlainRecord } from '../../core/shared-piping-model/immutable.js';

export const STAGEDJSON_RESOLUTION_STATUS = Object.freeze({
  DECLARED: 'DECLARED',
  INHERITED: 'INHERITED',
  MISSING: 'MISSING',
});
export const STAGEDJSON_PROCESS_INHERITANCE_POLICY = 'PROHIBIT_ENTITY_ORDER_CARRY_FORWARD';
export const STAGEDJSON_TEMPERATURE_ROLES = Object.freeze(['REFERENCE', 'OPERATING', 'DESIGN']);
const HASH = /^fnv1a64:[0-9a-f]{16}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const FIELD_KEYS = ['status', 'value', 'unit', 'sourceEntityId', 'sourceField', 'fromEntityId', 'diagnosticCodes', 'evidence'];
const EVIDENCE_KEYS = ['source', 'locator', 'sourceSemanticHash'];

export function normalizeStagedJsonResolvedField(input, options) {
  const {
    path,
    allowedUnits,
    allowInherited = true,
    expectedSourceEntityId = null,
    normalizeValue = clone,
  } = options;
  exactKeys(input, FIELD_KEYS, path);
  const status = enumValue(input.status, Object.values(STAGEDJSON_RESOLUTION_STATUS), `${path}.status`);
  const unit = enumValue(input.unit, allowedUnits, `${path}.unit`);
  const diagnosticCodes = uniqueTextList(input.diagnosticCodes, `${path}.diagnosticCodes`, true);
  const evidence = normalizeStagedJsonEvidence(input.evidence, `${path}.evidence`);
  if (status === STAGEDJSON_RESOLUTION_STATUS.MISSING) {
    if (input.value !== null || input.sourceEntityId !== null || input.sourceField !== null || input.fromEntityId !== null) {
      fail('STAGEDJSON_RESOLUTION_MISSING_INVALID', `${path} MISSING fields must not carry a value or source identity.`);
    }
    if (diagnosticCodes.length === 0) fail('STAGEDJSON_RESOLUTION_MISSING_UNDIAGNOSED', `${path} MISSING requires a diagnostic code.`);
    return { status, value: null, unit, sourceEntityId: null, sourceField: null, fromEntityId: null, diagnosticCodes, evidence };
  }
  if (input.value === null || input.value === undefined) fail('STAGEDJSON_RESOLUTION_VALUE_MISSING', `${path} ${status} requires a value.`);
  const sourceEntityId = text(input.sourceEntityId, `${path}.sourceEntityId`);
  const sourceField = text(input.sourceField, `${path}.sourceField`);
  if (expectedSourceEntityId !== null && sourceEntityId !== expectedSourceEntityId) {
    fail('STAGEDJSON_RESOLUTION_SOURCE_ENTITY_MISMATCH', `${path} must be declared on ${expectedSourceEntityId}.`);
  }
  let fromEntityId = null;
  if (status === STAGEDJSON_RESOLUTION_STATUS.INHERITED) {
    if (!allowInherited) fail('STAGEDJSON_RESOLUTION_INHERITANCE_PROHIBITED', `${path} does not permit inherited values.`);
    fromEntityId = text(input.fromEntityId, `${path}.fromEntityId`);
    if (fromEntityId === sourceEntityId) fail('STAGEDJSON_RESOLUTION_INHERITANCE_SELF_REFERENCE', `${path} cannot inherit from itself.`);
  } else if (input.fromEntityId !== null) {
    fail('STAGEDJSON_RESOLUTION_DECLARED_SOURCE_INVALID', `${path} DECLARED must not name fromEntityId.`);
  }
  return {
    status,
    value: normalizeValue(input.value, `${path}.value`),
    unit,
    sourceEntityId,
    sourceField,
    fromEntityId,
    diagnosticCodes,
    evidence,
  };
}

export function stagedJsonFieldSemanticProjection(field) {
  return {
    status: field.status,
    value: field.value,
    unit: field.unit,
    sourceEntityId: field.sourceEntityId,
    sourceField: field.sourceField,
    fromEntityId: field.fromEntityId,
    diagnosticCodes: field.diagnosticCodes,
  };
}

export function stagedJsonFieldEvidenceProjection(field) {
  return { status: field.status, evidence: field.evidence };
}

export function normalizeDatasetRef(value, dataset, path = 'datasetRef') {
  exactKeys(value, ['datasetId', 'sourceId', 'sourceSha256', 'sourceSnapshotSemanticHash'], path);
  requireDataset(dataset);
  const result = {
    datasetId: text(value.datasetId, `${path}.datasetId`),
    sourceId: text(value.sourceId, `${path}.sourceId`),
    sourceSha256: sha256(value.sourceSha256, `${path}.sourceSha256`),
    sourceSnapshotSemanticHash: hash(value.sourceSnapshotSemanticHash, `${path}.sourceSnapshotSemanticHash`),
  };
  if (result.datasetId !== dataset.datasetId
    || result.sourceId !== dataset.sourceName
    || result.sourceSha256 !== dataset.sourceSha256
    || result.sourceSnapshotSemanticHash !== dataset.sourceSnapshot?.sourceSemanticHash) {
    fail('STAGEDJSON_RESOLUTION_DATASET_STALE', `${path} does not match the active dataset.`);
  }
  return result;
}

export function normalizeScope(value, dataset, { entityRequired = false, path = 'scope' } = {}) {
  exactKeys(value, entityRequired ? ['branchId', 'entityId'] : ['branchId'], path);
  const branchId = text(value.branchId, `${path}.branchId`);
  if (!dataset.entities.some((entity) => entity.branchId === branchId)) {
    fail('STAGEDJSON_RESOLUTION_BRANCH_ORPHANED', `${path}.branchId is absent from the dataset.`);
  }
  if (!entityRequired) return { branchId };
  const entityId = text(value.entityId, `${path}.entityId`);
  const entity = dataset.entities.find((row) => row.entityId === entityId);
  if (!entity || entity.branchId !== branchId) fail('STAGEDJSON_RESOLUTION_ENTITY_ORPHANED', `${entityId} is not in ${branchId}.`);
  return { branchId, entityId };
}

export function normalizeDiagnostics(value, path) {
  if (!Array.isArray(value)) fail('STAGEDJSON_RESOLUTION_DIAGNOSTICS_INVALID', `${path} must be an array.`);
  return value.map((row, index) => {
    if (!isPlainRecord(row)) fail('STAGEDJSON_RESOLUTION_DIAGNOSTICS_INVALID', `${path}[${index}] must be a record.`);
    return clone(row);
  });
}

export function normalizeJsonValue(value, path) {
  try { return clone(value); } catch { fail('STAGEDJSON_RESOLUTION_VALUE_INVALID', `${path} must be JSON-compatible.`); }
}
export function normalizeFiniteNumber(value, path) { if (!Number.isFinite(value)) fail('STAGEDJSON_RESOLUTION_VALUE_INVALID', `${path} must be finite.`); return value; }
export function normalizePositiveNumber(value, path) { const result = normalizeFiniteNumber(value, path); if (result <= 0) fail('STAGEDJSON_RESOLUTION_VALUE_INVALID', `${path} must be positive.`); return result; }
export function normalizeNonNegativeNumber(value, path) { const result = normalizeFiniteNumber(value, path); if (result < 0) fail('STAGEDJSON_RESOLUTION_VALUE_INVALID', `${path} must be non-negative.`); return result; }
export function normalizeNullableNonNegativeNumber(value, path) { return value === null ? null : normalizeNonNegativeNumber(value, path); }
export function normalizeText(value, path) { return text(value, path); }
export function exactKeys(value, keys, path) { if (!isPlainRecord(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail('STAGEDJSON_RESOLUTION_STRUCTURE_INVALID', `${path} must contain exact keys: ${keys.join(', ')}.`); }
export function text(value, path) { if (typeof value !== 'string' || !value.trim()) fail('STAGEDJSON_RESOLUTION_STRUCTURE_INVALID', `${path} must be a nonempty string.`); return value.trim(); }
export function hash(value, path) { const result = text(value, path); if (!HASH.test(result)) fail('STAGEDJSON_RESOLUTION_STRUCTURE_INVALID', `${path} must be a semantic hash.`); return result; }
export function uniqueTextList(value, path, allowEmpty) { if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) fail('STAGEDJSON_RESOLUTION_LIST_INVALID', `${path} must be ${allowEmpty ? 'an array' : 'a nonempty array'}.`); const rows = value.map((item, index) => text(item, `${path}[${index}]`)).sort(ascii); if (new Set(rows).size !== rows.length) fail('STAGEDJSON_RESOLUTION_LIST_DUPLICATE', `${path} contains duplicates.`); return rows; }
export function enumValue(value, allowed, path) { if (!allowed.includes(value)) fail('STAGEDJSON_RESOLUTION_ENUM_INVALID', `${path} must be one of ${allowed.join(', ')}.`); return value; }
export function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
export function clone(value) { return JSON.parse(JSON.stringify(value)); }
export function fail(code, message, details) { const error = new Error(message); error.name = 'StagedJsonResolutionError'; error.code = code; if (details !== undefined) error.details = details; throw error; }
export function normalizeStagedJsonEvidence(value, path) { if (!Array.isArray(value)) fail('STAGEDJSON_RESOLUTION_EVIDENCE_INVALID', `${path} must be an array.`); return value.map((row, index) => { exactKeys(row, EVIDENCE_KEYS, `${path}[${index}]`); return { source: text(row.source, `${path}[${index}].source`), locator: text(row.locator, `${path}[${index}].locator`), sourceSemanticHash: hash(row.sourceSemanticHash, `${path}[${index}].sourceSemanticHash`) }; }).sort((left, right) => ascii(`${left.source}|${left.locator}`, `${right.source}|${right.locator}`)); }
function sha256(value, path) { const result = text(value, path).toLowerCase(); if (!SHA256.test(result)) fail('STAGEDJSON_RESOLUTION_STRUCTURE_INVALID', `${path} must be SHA-256.`); return result; }
function requireDataset(dataset) { if (!dataset || dataset.schema !== 'analysis-workspace-dataset/v1' || typeof dataset.datasetId !== 'string' || !Array.isArray(dataset.entities)) fail('STAGEDJSON_RESOLUTION_DATASET_INVALID', 'A normalized workspace dataset is required.'); }
