import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';

export const WORKSPACE_BRANCH_SUBSET_SCHEMA = 'workspace-branch-subset/v1';
const HASH = /^fnv1a64:[0-9a-f]{16}$/u;
const TOP_KEYS = ['schema', 'datasetId', 'branchId', 'entityIds', 'routeIds', 'supportEntityIds', 'boundaryPorts', 'externalDependencies', 'diagnostics', 'semanticHash'];

export class BranchSubsetManifestError extends Error {
  constructor(code, message, details = undefined) {
    super(message); this.name = 'BranchSubsetManifestError'; this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function computeBranchSubsetSemanticHash(value) {
  return semanticHash(Object.fromEntries(TOP_KEYS.filter((key) => key !== 'semanticHash').map((key) => [key, value[key]])));
}

export function sealBranchSubsetManifest(input, { dataset }) {
  const draft = normalizeManifest(input, dataset, false);
  draft.semanticHash = computeBranchSubsetSemanticHash(draft);
  return deepFreeze(draft);
}

export function requireBranchSubsetManifest(value, { dataset }) {
  const accepted = normalizeManifest(value, dataset, true);
  if (accepted.semanticHash !== computeBranchSubsetSemanticHash(accepted)) {
    fail('BRANCH_SUBSET_HASH_MISMATCH', 'Branch subset semantic hash mismatch.');
  }
  return deepFreeze(accepted);
}

function normalizeManifest(input, dataset, sealed) {
  exactKeys(input, sealed ? TOP_KEYS : TOP_KEYS.filter((key) => key !== 'semanticHash'), 'manifest');
  if (input.schema !== WORKSPACE_BRANCH_SUBSET_SCHEMA) fail('BRANCH_SUBSET_SCHEMA_INVALID', `Expected ${WORKSPACE_BRANCH_SUBSET_SCHEMA}.`);
  requireDataset(dataset);
  const datasetId = text(input.datasetId, 'manifest.datasetId');
  if (datasetId !== dataset.datasetId) fail('BRANCH_SUBSET_DATASET_STALE', 'Manifest datasetId does not match the active dataset.');
  const branchId = text(input.branchId, 'manifest.branchId');
  if (!dataset.entities.some((entity) => entity.branchId === branchId)) fail('BRANCH_SUBSET_BRANCH_ORPHANED', 'Manifest branch is absent from the dataset.');
  const entityIds = uniqueTextList(input.entityIds, 'manifest.entityIds', false);
  const selected = resolveSelected(entityIds, branchId, dataset);
  const supportEntityIds = uniqueTextList(input.supportEntityIds, 'manifest.supportEntityIds', true);
  validateSupports(supportEntityIds, selected);
  const boundaryPorts = normalizeBoundaryPorts(input.boundaryPorts, selected, dataset);
  return {
    schema: input.schema,
    datasetId,
    branchId,
    entityIds,
    routeIds: uniqueTextList(input.routeIds, 'manifest.routeIds', true),
    supportEntityIds,
    boundaryPorts,
    externalDependencies: uniqueTextList(input.externalDependencies, 'manifest.externalDependencies', true),
    diagnostics: normalizeDiagnostics(input.diagnostics),
    semanticHash: sealed ? hash(input.semanticHash, 'manifest.semanticHash') : '',
  };
}

function resolveSelected(entityIds, branchId, dataset) {
  const byId = new Map(dataset.entities.map((entity) => [entity.entityId, entity]));
  return entityIds.map((entityId) => {
    const entity = byId.get(entityId);
    if (!entity) fail('BRANCH_SUBSET_ENTITY_ORPHANED', `Entity ${entityId} is absent from the dataset.`);
    if (entity.branchId !== branchId) fail('BRANCH_SUBSET_ENTITY_OUTSIDE_BRANCH', `Entity ${entityId} is outside the selected branch.`);
    return entity;
  });
}

function validateSupports(supportEntityIds, selected) {
  const byId = new Map(selected.map((entity) => [entity.entityId, entity]));
  for (const entityId of supportEntityIds) {
    const entity = byId.get(entityId);
    if (!entity || entity.category !== 'support') fail('BRANCH_SUBSET_SUPPORT_INVALID', `Support ${entityId} is not a selected support entity.`);
  }
}

function normalizeBoundaryPorts(value, selected, dataset) {
  if (!Array.isArray(value)) fail('BRANCH_SUBSET_BOUNDARY_INVALID', 'manifest.boundaryPorts must be an array.');
  const actual = boundaryNodeIds(selected, dataset);
  const seen = new Set();
  return value.map((row, index) => {
    exactKeys(row, ['nodeId', 'externalReference', 'treatment'], `manifest.boundaryPorts[${index}]`);
    const nodeId = text(row.nodeId, `manifest.boundaryPorts[${index}].nodeId`);
    if (!actual.has(nodeId)) fail('BRANCH_SUBSET_BOUNDARY_INVALID', `Boundary node ${nodeId} is not a boundary of the selected entities.`);
    if (seen.has(nodeId)) fail('BRANCH_SUBSET_BOUNDARY_DUPLICATE', `Boundary node ${nodeId} is duplicated.`);
    seen.add(nodeId);
    if (row.treatment !== 'DECLARED_BOUNDARY') fail('BRANCH_SUBSET_BOUNDARY_TREATMENT_UNSUPPORTED', 'Only DECLARED_BOUNDARY treatment is supported.');
    return { nodeId, externalReference: text(row.externalReference, `manifest.boundaryPorts[${index}].externalReference`), treatment: 'DECLARED_BOUNDARY' };
  }).sort((left, right) => ascii(left.nodeId, right.nodeId));
}

function boundaryNodeIds(selected, dataset) {
  const selectedIds = new Set(selected.map((entity) => entity.entityId));
  const selectedCounts = new Map();
  const outsidePoints = new Set();
  for (const entity of dataset.entities) {
    const points = geometryPoints(entity);
    if (selectedIds.has(entity.entityId)) {
      for (const point of points) selectedCounts.set(point, (selectedCounts.get(point) || 0) + 1);
    } else {
      for (const point of points) outsidePoints.add(point);
    }
  }
  return new Set([...selectedCounts.entries()]
    .filter(([point, count]) => count === 1 || outsidePoints.has(point))
    .map(([point]) => `port:${point}`));
}

function geometryPoints(entity) {
  if (entity.category === 'support' || entity.entityType === 'BRANCH') return [];
  const start = entity.properties?.geometry?.start;
  const end = entity.properties?.geometry?.end;
  if (!point(start) || !point(end)) return [];
  const left = pointKey(start); const right = pointKey(end);
  return left === right ? [left] : [left, right];
}

function normalizeDiagnostics(value) {
  if (!Array.isArray(value)) fail('BRANCH_SUBSET_DIAGNOSTIC_INVALID', 'manifest.diagnostics must be an array.');
  return value.map((row, index) => {
    if (!isPlainRecord(row)) fail('BRANCH_SUBSET_DIAGNOSTIC_INVALID', `manifest.diagnostics[${index}] must be a record.`);
    return clone(row);
  });
}

function uniqueTextList(value, path, allowEmpty) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) fail('BRANCH_SUBSET_LIST_INVALID', `${path} must be ${allowEmpty ? 'an array' : 'a nonempty array'}.`);
  const rows = value.map((item, index) => text(item, `${path}[${index}]`)).sort(ascii);
  if (new Set(rows).size !== rows.length) fail('BRANCH_SUBSET_DUPLICATE_ID', `${path} contains duplicates.`);
  return rows;
}

function requireDataset(dataset) { if (!dataset || typeof dataset.datasetId !== 'string' || !Array.isArray(dataset.entities)) fail('BRANCH_SUBSET_DATASET_INVALID', 'A normalized workspace dataset is required.'); }
function exactKeys(value, keys, path) { if (!isPlainRecord(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail('BRANCH_SUBSET_STRUCTURE_INVALID', `${path} must contain exact keys: ${keys.join(', ')}.`); }
function text(value, path) { if (typeof value !== 'string' || !value.trim()) fail('BRANCH_SUBSET_STRUCTURE_INVALID', `${path} must be a nonempty string.`); return value.trim(); }
function hash(value, path) { const result = text(value, path); if (!HASH.test(result)) fail('BRANCH_SUBSET_STRUCTURE_INVALID', `${path} must be a semantic hash.`); return result; }
function point(value) { return value && [value.x, value.y, value.z].every(Number.isFinite); }
function pointKey(value) { return `${value.x}|${value.y}|${value.z}`; }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function fail(code, message, details) { throw new BranchSubsetManifestError(code, message, details); }
