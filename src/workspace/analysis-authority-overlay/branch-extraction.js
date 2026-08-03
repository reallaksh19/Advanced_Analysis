import { buildRoutePartitionModel } from '../routes/route-partition-model.js';
import { WORKSPACE_BRANCH_SUBSET_SCHEMA } from './branch-subset-contract.js';

const PHYSICAL_TERMINUS = 'NONE:PHYSICAL_TERMINUS';

export function extractBranchSubset(dataset, branchId, profile) {
  requireDataset(dataset);
  const targetBranchId = requireText(branchId, 'branchId');
  const selected = dataset.entities
    .filter((entity) => entity.branchId === targetBranchId)
    .sort((left, right) => ascii(left.entityId, right.entityId));
  if (selected.length === 0) throw extractionError('BRANCH_EXTRACTION_BRANCH_ORPHANED', `Branch ${targetBranchId} is absent from the dataset.`);

  const routePartition = buildRoutePartitionModel(dataset, profile);
  const routeIds = routePartition.routes
    .filter((route) => route.branchId === targetBranchId)
    .map((route) => route.routeId)
    .sort(ascii);

  return {
    schema: WORKSPACE_BRANCH_SUBSET_SCHEMA,
    datasetId: dataset.datasetId,
    branchId: targetBranchId,
    entityIds: selected.map((entity) => entity.entityId),
    routeIds,
    supportEntityIds: selected
      .filter((entity) => entity.category === 'support')
      .map((entity) => entity.entityId),
    boundaryPorts: deriveBoundaryPorts(dataset, selected, targetBranchId),
    externalDependencies: [],
    diagnostics: [],
  };
}

function deriveBoundaryPorts(dataset, selected, branchId) {
  const selectedIds = new Set(selected.map((entity) => entity.entityId));
  const selectedCounts = new Map();
  const outsideBranchesByPoint = new Map();

  for (const entity of selected) {
    for (const point of geometryPoints(entity)) {
      selectedCounts.set(point, (selectedCounts.get(point) || 0) + 1);
    }
  }
  for (const entity of dataset.entities) {
    if (selectedIds.has(entity.entityId)) continue;
    for (const point of geometryPoints(entity)) {
      if (!selectedCounts.has(point)) continue;
      const externalBranchId = requireExternalBranchId(entity, point, branchId);
      if (!outsideBranchesByPoint.has(point)) outsideBranchesByPoint.set(point, new Set());
      outsideBranchesByPoint.get(point).add(externalBranchId);
    }
  }

  return [...selectedCounts.entries()]
    .filter(([point, count]) => count === 1 || outsideBranchesByPoint.has(point))
    .map(([point]) => ({
      nodeId: `port:${point}`,
      externalReference: externalReference(point, outsideBranchesByPoint),
      treatment: 'DECLARED_BOUNDARY',
    }))
    .sort((left, right) => ascii(left.nodeId, right.nodeId));
}

function externalReference(point, outsideBranchesByPoint) {
  const candidates = [...(outsideBranchesByPoint.get(point) || [])].sort(ascii);
  if (candidates.length === 0) return PHYSICAL_TERMINUS;
  if (candidates.length > 1) {
    throw extractionError(
      'BRANCH_EXTRACTION_EXTERNAL_REFERENCE_AMBIGUOUS',
      `Boundary point ${point} touches multiple external branches.`,
      { point, branchIds: candidates },
    );
  }
  return candidates[0];
}

function requireExternalBranchId(entity, point, selectedBranchId) {
  if (typeof entity.branchId === 'string' && entity.branchId.trim()) return entity.branchId.trim();
  throw extractionError(
    'BRANCH_EXTRACTION_EXTERNAL_REFERENCE_INVALID',
    `Entity ${entity.entityId || '<unknown>'} touches boundary point ${point} without a branchId.`,
    { entityId: entity.entityId, point, selectedBranchId },
  );
}

function geometryPoints(entity) {
  if (entity.category === 'support' || entity.entityType === 'BRANCH') return [];
  const start = entity.properties?.geometry?.start;
  const end = entity.properties?.geometry?.end;
  if (!point(start) || !point(end)) return [];
  const left = pointKey(start);
  const right = pointKey(end);
  return left === right ? [left] : [left, right];
}

function requireDataset(dataset) {
  if (!dataset || typeof dataset.datasetId !== 'string' || !Array.isArray(dataset.entities)) {
    throw new TypeError('Branch extraction requires a normalized workspace dataset.');
  }
}

function requireText(value, path) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${path} must be a nonempty string.`);
  return value.trim();
}

function point(value) { return value && [value.x, value.y, value.z].every(Number.isFinite); }
function pointKey(value) { return `${value.x}|${value.y}|${value.z}`; }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function extractionError(code, message, details) {
  const error = new Error(message);
  error.name = 'BranchExtractionError';
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}
