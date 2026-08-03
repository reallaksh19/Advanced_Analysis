import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import { createEvidenceValue } from '../project-data/project-data-contract.js';

export const ANALYSIS_AUTHORITY_OVERLAY_SCHEMA = 'analysis-authority-overlay/v1';
const HASH = /^fnv1a64:[0-9a-f]{16}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const TOP_KEYS = ['schema', 'overlayId', 'revision', 'datasetRef', 'scope', 'authorityRecords', 'assignments', 'governance', 'semanticHash', 'evidenceHash'];
const FIXED_GOVERNANCE = ['missingAssignment', 'ambiguousAssignment', 'conflictingAssignment', 'orphanAssignment', 'staleEvidence'];
const ASSIGNMENT_FIELDS = ['material', 'section', 'loadCases', 'support'];

export class AnalysisAuthorityOverlayError extends Error {
  constructor(code, message, details = undefined) {
    super(message); this.name = 'AnalysisAuthorityOverlayError'; this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function computeAuthorityOverlaySemanticHash(value) {
  return semanticHash(semanticProjection(value));
}

export function computeAuthorityOverlayEvidenceHash(value) {
  return semanticHash(evidenceProjection(value));
}

export function sealAnalysisAuthorityOverlay(input, { dataset }) {
  const draft = normalizeOverlay(input, dataset, false);
  draft.semanticHash = computeAuthorityOverlaySemanticHash(draft);
  draft.evidenceHash = computeAuthorityOverlayEvidenceHash(draft);
  return deepFreeze(draft);
}

export function requireAnalysisAuthorityOverlay(value, { dataset }) {
  const accepted = normalizeOverlay(value, dataset, true);
  if (accepted.semanticHash !== computeAuthorityOverlaySemanticHash(accepted)
    || accepted.evidenceHash !== computeAuthorityOverlayEvidenceHash(accepted)) {
    fail('AUTHORITY_OVERLAY_HASH_MISMATCH', 'Analysis authority overlay hash mismatch.');
  }
  return deepFreeze(accepted);
}

function normalizeOverlay(input, dataset, sealed) {
  exactKeys(input, sealed ? TOP_KEYS : TOP_KEYS.filter((key) => !key.endsWith('Hash')), 'overlay');
  if (input.schema !== ANALYSIS_AUTHORITY_OVERLAY_SCHEMA) fail('AUTHORITY_OVERLAY_SCHEMA_INVALID', `Expected ${ANALYSIS_AUTHORITY_OVERLAY_SCHEMA}.`);
  const accepted = {
    schema: input.schema,
    overlayId: text(input.overlayId, 'overlay.overlayId'),
    revision: integer(input.revision, 'overlay.revision'),
    datasetRef: normalizeDatasetRef(input.datasetRef, dataset),
    scope: normalizeScope(input.scope, dataset),
    authorityRecords: normalizeRecords(input.authorityRecords),
    assignments: null,
    governance: normalizeGovernance(input.governance),
    semanticHash: sealed ? hash(input.semanticHash, 'overlay.semanticHash') : '',
    evidenceHash: sealed ? hash(input.evidenceHash, 'overlay.evidenceHash') : '',
  };
  accepted.assignments = normalizeAssignments(input.assignments, accepted.scope, accepted.authorityRecords, dataset);
  return accepted;
}

function normalizeDatasetRef(value, dataset) {
  exactKeys(value, ['datasetId', 'sourceId', 'sourceSha256', 'sourceSnapshotSemanticHash'], 'overlay.datasetRef');
  const result = {
    datasetId: text(value.datasetId, 'overlay.datasetRef.datasetId'),
    sourceId: text(value.sourceId, 'overlay.datasetRef.sourceId'),
    sourceSha256: sha256(value.sourceSha256, 'overlay.datasetRef.sourceSha256'),
    sourceSnapshotSemanticHash: hash(value.sourceSnapshotSemanticHash, 'overlay.datasetRef.sourceSnapshotSemanticHash'),
  };
  if (!dataset || result.datasetId !== dataset.datasetId || result.sourceId !== dataset.sourceName
    || result.sourceSha256 !== dataset.sourceSha256
    || result.sourceSnapshotSemanticHash !== dataset.sourceSnapshot?.sourceSemanticHash) {
    fail('AUTHORITY_OVERLAY_DATASET_STALE', 'Overlay dataset reference does not match the active dataset.');
  }
  return result;
}

function normalizeScope(value, dataset) {
  exactKeys(value, ['kind', 'branchId'], 'overlay.scope');
  if (value.kind !== 'BRANCH') fail('AUTHORITY_OVERLAY_SCOPE_UNSUPPORTED', 'Only BRANCH scope is supported.');
  const branchId = text(value.branchId, 'overlay.scope.branchId');
  if (!dataset.entities.some((entity) => entity.branchId === branchId)) {
    fail('AUTHORITY_OVERLAY_ASSIGNMENT_ORPHANED', 'Overlay scope branch is absent from the dataset.');
  }
  return { kind: 'BRANCH', branchId };
}

function normalizeRecords(value) {
  exactKeys(value, ['materials', 'sections', 'supports', 'loadCases'], 'overlay.authorityRecords');
  return {
    materials: recordList(value.materials, 'materialStateId', 'materials'),
    sections: recordList(value.sections, 'sectionStateId', 'sections'),
    supports: recordList(value.supports, 'supportAuthorityId', 'supports'),
    loadCases: recordList(value.loadCases, 'loadCaseId', 'loadCases'),
  };
}

function recordList(value, idKey, field) {
  if (!Array.isArray(value)) fail('AUTHORITY_OVERLAY_RECORD_INVALID', `${field} must be an array.`);
  const seen = new Map();
  const rows = value.map((row, index) => {
    exactKeys(row, [idKey, 'resolutionSemanticHash'], `overlay.authorityRecords.${field}[${index}]`);
    const result = { [idKey]: text(row[idKey], `${field}[${index}].${idKey}`), resolutionSemanticHash: hash(row.resolutionSemanticHash, `${field}[${index}].resolutionSemanticHash`) };
    const previous = seen.get(result[idKey]);
    if (previous && previous !== result.resolutionSemanticHash) fail('AUTHORITY_OVERLAY_RECORD_HASH_CONFLICT', `${idKey} resolves to conflicting hashes.`);
    if (previous) fail('AUTHORITY_OVERLAY_RECORD_DUPLICATE', `${idKey} is duplicated.`);
    seen.set(result[idKey], result.resolutionSemanticHash); return result;
  });
  return rows.sort((left, right) => ascii(left[idKey], right[idKey]));
}

function normalizeAssignments(value, scope, records, dataset) {
  exactKeys(value, ['branches', 'entities'], 'overlay.assignments');
  return {
    branches: assignmentList(value.branches, 'branchId', scope, records, dataset),
    entities: assignmentList(value.entities, 'entityId', scope, records, dataset),
  };
}

function assignmentList(value, idKey, scope, records, dataset) {
  if (!Array.isArray(value)) fail('AUTHORITY_OVERLAY_ASSIGNMENT_INVALID', `${idKey} assignments must be an array.`);
  const seen = new Set();
  return value.map((row, index) => {
    const path = `overlay.assignments.${idKey === 'branchId' ? 'branches' : 'entities'}[${index}]`;
    if (!isPlainRecord(row)) fail('AUTHORITY_OVERLAY_ASSIGNMENT_INVALID', `${path} must be a record.`);
    const keys = Object.keys(row); const allowed = new Set([idKey, ...ASSIGNMENT_FIELDS]);
    if (keys.some((key) => !allowed.has(key)) || !Object.hasOwn(row, idKey)) fail('AUTHORITY_OVERLAY_ASSIGNMENT_INVALID', `${path} has invalid keys.`);
    const identity = text(row[idKey], `${path}.${idKey}`);
    if (seen.has(identity)) fail('AUTHORITY_OVERLAY_ASSIGNMENT_CONFLICT', `${idKey} assignment is duplicated.`);
    seen.add(identity); requireInScope(idKey, identity, scope, dataset);
    const result = { [idKey]: identity };
    for (const field of ASSIGNMENT_FIELDS) if (Object.hasOwn(row, field)) result[field] = assignmentValue(row[field], field, records, path);
    if (Object.keys(result).length === 1) fail('AUTHORITY_OVERLAY_ASSIGNMENT_INVALID', `${path} must declare at least one authority field.`);
    return result;
  }).sort((left, right) => ascii(left[idKey], right[idKey]));
}

function assignmentValue(value, field, records, path) {
  exactKeys(value, ['value', 'evidence', 'approved'], `${path}.${field}`);
  const accepted = createEvidenceValue(value.value, value.evidence, value.approved);
  if (!accepted.approved || !isPlainRecord(accepted.evidence) || !text(accepted.evidence.source, `${path}.${field}.evidence.source`)) {
    fail('AUTHORITY_OVERLAY_ASSIGNMENT_NOT_APPROVED', `${path}.${field} requires approved evidence.`);
  }
  const normalizedValue = assignmentReference(accepted.value, field, records, path);
  return Object.fromEntries([['value', normalizedValue], ['evidence', clone(accepted.evidence)], ['approved', true]]);
}

function assignmentReference(value, field, records, path) {
  const map = { material: ['materialStateId', records.materials], section: ['sectionStateId', records.sections], support: ['supportAuthorityId', records.supports] };
  if (field === 'loadCases') {
    exactKeys(value, ['loadCaseIds'], `${path}.loadCases.value`);
    const ids = uniqueTextList(value.loadCaseIds, `${path}.loadCases.value.loadCaseIds`);
    const available = new Set(records.loadCases.map((row) => row.loadCaseId));
    if (ids.some((id) => !available.has(id))) fail('AUTHORITY_OVERLAY_ASSIGNMENT_REFERENCE_MISSING', 'Load-case assignment references an unknown authority record.');
    return { loadCaseIds: ids };
  }
  const [idKey, rows] = map[field]; exactKeys(value, [idKey], `${path}.${field}.value`);
  const id = text(value[idKey], `${path}.${field}.value.${idKey}`);
  if (!rows.some((row) => row[idKey] === id)) fail('AUTHORITY_OVERLAY_ASSIGNMENT_REFERENCE_MISSING', `${field} assignment references an unknown authority record.`);
  return { [idKey]: id };
}

function requireInScope(idKey, identity, scope, dataset) {
  if (idKey === 'branchId') {
    if (identity !== scope.branchId || !dataset.entities.some((entity) => entity.branchId === identity)) fail('AUTHORITY_OVERLAY_ASSIGNMENT_ORPHANED', 'Branch assignment is outside overlay scope.');
    return;
  }
  const entity = dataset.entities.find((row) => row.entityId === identity);
  if (!entity || entity.branchId !== scope.branchId) fail('AUTHORITY_OVERLAY_ASSIGNMENT_ORPHANED', 'Entity assignment is outside overlay scope.');
}

function normalizeGovernance(value) {
  exactKeys(value, ['precedence', ...FIXED_GOVERNANCE], 'overlay.governance');
  if (!Array.isArray(value.precedence) || value.precedence.length !== 2 || value.precedence[0] !== 'ENTITY' || value.precedence[1] !== 'BRANCH') fail('AUTHORITY_OVERLAY_PRECEDENCE_UNSUPPORTED', 'Only ENTITY then BRANCH precedence is supported.');
  for (const field of FIXED_GOVERNANCE) if (value[field] !== 'BLOCK') fail('AUTHORITY_OVERLAY_GOVERNANCE_UNSUPPORTED', `${field} must be BLOCK.`);
  return { precedence: ['ENTITY', 'BRANCH'], ...Object.fromEntries(FIXED_GOVERNANCE.map((field) => [field, 'BLOCK'])) };
}

function semanticProjection(value) {
  return { schema: value.schema, overlayId: value.overlayId, revision: value.revision, datasetRef: value.datasetRef, scope: value.scope, authorityRecords: value.authorityRecords, assignments: projectAssignments(value.assignments, 'value'), governance: value.governance };
}
function evidenceProjection(value) { return { semanticHash: value.semanticHash, assignments: projectAssignments(value.assignments, 'evidence') }; }
function projectAssignments(assignments, mode) {
  return Object.fromEntries(['branches', 'entities'].map((group) => [group, assignments[group].map((row) => Object.fromEntries(Object.entries(row).map(([key, entry]) => [key, ASSIGNMENT_FIELDS.includes(key) ? (mode === 'value' ? entry.value : { evidence: entry.evidence, approved: entry.approved }) : entry])))]));
}
function uniqueTextList(value, path) { if (!Array.isArray(value) || value.length === 0) fail('AUTHORITY_OVERLAY_ASSIGNMENT_INVALID', `${path} must be nonempty.`); const rows = value.map((item, index) => text(item, `${path}[${index}]`)).sort(ascii); if (new Set(rows).size !== rows.length) fail('AUTHORITY_OVERLAY_ASSIGNMENT_CONFLICT', `${path} contains duplicates.`); return rows; }
function exactKeys(value, keys, path) { if (!isPlainRecord(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail('AUTHORITY_OVERLAY_STRUCTURE_INVALID', `${path} must contain exact keys: ${keys.join(', ')}.`); }
function text(value, path) { if (typeof value !== 'string' || !value.trim()) fail('AUTHORITY_OVERLAY_STRUCTURE_INVALID', `${path} must be a nonempty string.`); return value.trim(); }
function integer(value, path) { if (!Number.isInteger(value) || value < 0) fail('AUTHORITY_OVERLAY_STRUCTURE_INVALID', `${path} must be a non-negative integer.`); return value; }
function hash(value, path) { const result = text(value, path); if (!HASH.test(result)) fail('AUTHORITY_OVERLAY_STRUCTURE_INVALID', `${path} must be a semantic hash.`); return result; }
function sha256(value, path) { const result = text(value, path).toLowerCase(); if (!SHA256.test(result)) fail('AUTHORITY_OVERLAY_STRUCTURE_INVALID', `${path} must be SHA-256.`); return result; }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function fail(code, message, details) { throw new AnalysisAuthorityOverlayError(code, message, details); }
