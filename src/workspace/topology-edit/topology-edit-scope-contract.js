/**
 * Topology Edit Draft — Wave 5 scope and canonical spatial-index contracts.
 *
 * Full-model canonical authority is never truncated by viewport scope. This
 * module derives deterministic branch projections, authorizes command targets,
 * and builds a serializable canonical AABB index for worker and CPU broad phase.
 */

import {
  deepFreeze,
  semanticHash,
  stringValue,
} from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_SCOPE_CONTRACT =
  'advanced-topology-edit-scope-contract/v2';
export const TOPOLOGY_EDIT_SCOPE_TREE_SCHEMA =
  'advanced-topology-edit-scope-tree/v1';
export const TOPOLOGY_EDIT_SCOPED_PROJECTION_SCHEMA =
  'advanced-topology-edit-scoped-projection/v1';
export const TOPOLOGY_EDIT_SPATIAL_INDEX_SCHEMA =
  'advanced-topology-edit-spatial-index/v1';
export const TOPOLOGY_EDIT_MODEL_WIDE_GRANT_SCHEMA =
  'advanced-topology-edit-model-wide-grant/v1';
export const UNASSIGNED_BRANCH_ID = '__UNASSIGNED__';

const DEFAULT_COMPONENT_THRESHOLD = 500;
const DEFAULT_BYTE_THRESHOLD = 5 * 1024 * 1024;
const DEFAULT_LEAF_SIZE = 16;

export function createTopologyEditScopeContract(input = {}) {
  const selectedBranchIds = normalizeIds(input.selectedBranchIds);
  const selectedBranchSet = new Set(selectedBranchIds);
  const sourceHash = stringValue(input.sourceHash);
  const baseCanonicalHash = stringValue(input.baseCanonicalHash);
  const componentThreshold = positiveInteger(
    input.componentThreshold,
    DEFAULT_COMPONENT_THRESHOLD,
    'componentThreshold',
  );
  const byteThreshold = positiveInteger(
    input.byteThreshold,
    DEFAULT_BYTE_THRESHOLD,
    'byteThreshold',
  );

  const contract = {
    schema: TOPOLOGY_EDIT_SCOPE_CONTRACT,
    sourceHash,
    baseCanonicalHash,
    componentThreshold,
    byteThreshold,
    selectedBranchIds: Object.freeze(selectedBranchIds),

    isBranchInScope(branchId) {
      if (selectedBranchSet.size === 0) return true;
      return selectedBranchSet.has(normalizeBranchId(branchId));
    },

    buildScopeTree(entities = [], options = {}) {
      return buildTopologyEditScopeTree(entities, options);
    },

    deriveProjection(entities = [], options = {}) {
      return deriveTopologyEditScopedProjection({
        entities,
        sourceHash,
        baseCanonicalHash,
        selectedBranchIds,
        contextEntityIds: options.contextEntityIds,
      });
    },

    filterEntitiesByScope(entities = [], options = {}) {
      const projection = this.deriveProjection(entities, options);
      const included = new Set([
        ...projection.includedEntityIds,
        ...projection.contextOnlyEntityIds,
      ]);
      return Object.freeze(
        entities.filter((entity) => included.has(entityIdOf(entity))),
      );
    },

    authorizeTargets({
      targets = [],
      entities = [],
      modelWideGrant = null,
    } = {}) {
      const projection = this.deriveProjection(entities);
      return authorizeTopologyEditTargets({
        targets,
        entities,
        projection,
        modelWideGrant,
      });
    },
  };

  return Object.freeze(contract);
}

/**
 * Builds a deterministic branch inventory without inventing hierarchy. Parent
 * relationships are accepted only from explicit source fields or an explicit
 * caller resolver.
 */
export function buildTopologyEditScopeTree(entities = [], options = {}) {
  if (!Array.isArray(entities)) {
    throw new TypeError('buildTopologyEditScopeTree requires an entity array.');
  }

  const branchResolver =
    typeof options.branchResolver === 'function'
      ? options.branchResolver
      : branchIdOf;
  const parentResolver =
    typeof options.parentBranchResolver === 'function'
      ? options.parentBranchResolver
      : explicitParentBranchIdOf;
  const branches = new Map();

  for (const entity of entities) {
    const entityId = entityIdOf(entity);
    if (!entityId) {
      throw new TypeError('Every scoped entity requires a stable entityId.');
    }

    const branchId = normalizeBranchId(branchResolver(entity));
    const parentBranchId = nullableBranchId(parentResolver(entity));
    const existing = branches.get(branchId) || {
      branchId,
      parentBranchId,
      sourceBranchIndexes: new Set(),
      paths: new Set(),
      names: new Set(),
      entityIds: [],
      byteEstimate: 0,
    };

    if (
      existing.parentBranchId &&
      parentBranchId &&
      existing.parentBranchId !== parentBranchId
    ) {
      throw new Error(
        `Conflicting parent branch evidence for ${branchId}: ` +
        `${existing.parentBranchId} versus ${parentBranchId}`,
      );
    }
    if (!existing.parentBranchId && parentBranchId) {
      existing.parentBranchId = parentBranchId;
    }

    const sourceBranchIndex = sourceBranchIndexOf(entity);
    if (sourceBranchIndex !== null) {
      existing.sourceBranchIndexes.add(sourceBranchIndex);
    }
    const path = branchPathOf(entity);
    if (path) existing.paths.add(path);
    const name = branchNameOf(entity);
    if (name) existing.names.add(name);

    existing.entityIds.push(entityId);
    existing.byteEstimate += estimateEntityBytes(entity);
    branches.set(branchId, existing);
  }

  const normalized = [...branches.values()]
    .map((branch) => {
      const sourceBranchIndexes = [...branch.sourceBranchIndexes].sort(
        compareNumbersThenStrings,
      );
      const paths = [...branch.paths].sort();
      const names = [...branch.names].sort();
      return {
        branchId: branch.branchId,
        parentBranchId: branch.parentBranchId,
        sourceBranchIndexes,
        path: paths.length === 1 ? paths[0] : null,
        name: names.length === 1 ? names[0] : null,
        componentCount: branch.entityIds.length,
        byteEstimate: branch.byteEstimate,
        entityIds: [...branch.entityIds].sort(),
        childBranchIds: [],
      };
    })
    .sort((left, right) => left.branchId.localeCompare(right.branchId));

  const byId = new Map(normalized.map((branch) => [branch.branchId, branch]));
  for (const branch of normalized) {
    if (!branch.parentBranchId) continue;
    const parent = byId.get(branch.parentBranchId);
    if (parent) parent.childBranchIds.push(branch.branchId);
  }
  for (const branch of normalized) branch.childBranchIds.sort();

  const roots = normalized
    .filter(
      (branch) =>
        !branch.parentBranchId || !byId.has(branch.parentBranchId),
    )
    .map((branch) => branch.branchId)
    .sort();

  const evidence = {
    schema: TOPOLOGY_EDIT_SCOPE_TREE_SCHEMA,
    branchCount: normalized.length,
    componentCount: entities.length,
    roots,
    branches: normalized,
  };

  return deepFreeze({
    ...evidence,
    treeHash: semanticHash(evidence),
  });
}

export function deriveTopologyEditScopedProjection({
  entities = [],
  sourceHash = '',
  baseCanonicalHash = '',
  selectedBranchIds = [],
  contextEntityIds = [],
} = {}) {
  if (!Array.isArray(entities)) {
    throw new TypeError(
      'deriveTopologyEditScopedProjection requires an entity array.',
    );
  }

  const selected = normalizeIds(selectedBranchIds).map(normalizeBranchId);
  const selectedSet = new Set(selected);
  const explicitContext = new Set(normalizeIds(contextEntityIds));
  const includedEntityIds = [];
  const contextOnlyEntityIds = [];
  const entityBranches = [];

  for (const entity of entities) {
    const entityId = entityIdOf(entity);
    if (!entityId) {
      throw new TypeError('Every scoped entity requires a stable entityId.');
    }
    const branchId = branchIdOf(entity);
    entityBranches.push({ entityId, branchId });

    if (selectedSet.size === 0 || selectedSet.has(branchId)) {
      includedEntityIds.push(entityId);
    } else if (explicitContext.has(entityId)) {
      contextOnlyEntityIds.push(entityId);
    }
  }

  includedEntityIds.sort();
  contextOnlyEntityIds.sort();
  entityBranches.sort((left, right) => left.entityId.localeCompare(right.entityId));

  const evidence = {
    schema: TOPOLOGY_EDIT_SCOPED_PROJECTION_SCHEMA,
    sourceHash: stringValue(sourceHash),
    baseCanonicalHash: stringValue(baseCanonicalHash),
    selectedBranchIds: selected,
    fullModelEntityCount: entities.length,
    includedEntityIds,
    contextOnlyEntityIds,
    entityBranches,
  };

  return deepFreeze({
    ...evidence,
    scopeHash: semanticHash(evidence),
  });
}

export function authorizeTopologyEditTargets({
  targets = [],
  entities = [],
  projection,
  modelWideGrant = null,
} = {}) {
  if (!projection?.scopeHash) {
    throw new TypeError('Target authorization requires a scoped projection.');
  }
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new TypeError('Target authorization requires at least one target.');
  }

  const entitiesById = new Map(
    entities.map((entity) => [entityIdOf(entity), entity]),
  );
  const included = new Set(projection.includedEntityIds || []);
  const grant = validateModelWideGrant(modelWideGrant, projection);
  const authorized = [];

  for (const target of targets) {
    const entityId = stringValue(target?.entityId || target?.id);
    if (!entityId) throw scopeError('TARGET_ID_REQUIRED');
    const entity = entitiesById.get(entityId);
    if (!entity) throw scopeError('TARGET_NOT_FOUND', { entityId });
    const branchId = branchIdOf(entity);

    if (!included.has(entityId) && !grant) {
      throw scopeError('TARGET_OUT_OF_SCOPE', { entityId, branchId });
    }

    authorized.push({
      entityId,
      branchId,
      authorization: included.has(entityId)
        ? 'ACTIVE_SCOPE'
        : 'MODEL_WIDE_GRANT',
    });
  }

  return deepFreeze({
    schema: 'advanced-topology-edit-target-authorization/v1',
    sourceHash: projection.sourceHash,
    baseCanonicalHash: projection.baseCanonicalHash,
    scopeHash: projection.scopeHash,
    grantId: grant?.grantId || null,
    targets: authorized,
  });
}

export function createTopologyEditModelWideGrant(input = {}) {
  const grant = {
    schema: TOPOLOGY_EDIT_MODEL_WIDE_GRANT_SCHEMA,
    grantId: stringValue(input.grantId),
    sourceHash: stringValue(input.sourceHash),
    baseCanonicalHash: stringValue(input.baseCanonicalHash),
    sessionAuthorityId: stringValue(input.sessionAuthorityId),
    sessionVersion: Number(input.sessionVersion),
  };
  if (!grant.grantId || !grant.sourceHash || !grant.baseCanonicalHash) {
    throw new TypeError(
      'Model-wide grant requires grantId, sourceHash, and baseCanonicalHash.',
    );
  }
  if (!Number.isSafeInteger(grant.sessionVersion) || grant.sessionVersion < 0) {
    throw new TypeError('Model-wide grant requires a valid sessionVersion.');
  }
  return deepFreeze(grant);
}

/**
 * Creates a deterministic serializable BVH over canonical engineering-space
 * AABBs. Records contain canonical IDs, not mesh UUIDs.
 */
export function buildCanonicalSpatialIndex(records = [], options = {}) {
  if (!Array.isArray(records)) {
    throw new TypeError('buildCanonicalSpatialIndex requires an array.');
  }
  const leafSize = positiveInteger(
    options.leafSize,
    DEFAULT_LEAF_SIZE,
    'leafSize',
  );
  const normalizedRecords = records
    .map(normalizeSpatialRecord)
    .sort((left, right) => left.id.localeCompare(right.id));

  const ids = new Set();
  for (const record of normalizedRecords) {
    if (ids.has(record.id)) {
      throw new Error(`Duplicate canonical spatial-index ID: ${record.id}`);
    }
    ids.add(record.id);
  }

  const root = normalizedRecords.length
    ? buildBvhNode(
        normalizedRecords,
        normalizedRecords.map((_, index) => index),
        leafSize,
      )
    : null;
  const evidence = {
    schema: TOPOLOGY_EDIT_SPATIAL_INDEX_SCHEMA,
    coordinateFrame: 'ENGINEERING_CANONICAL',
    leafSize,
    indexedCount: normalizedRecords.length,
    records: normalizedRecords,
    root,
  };

  return deepFreeze({
    ...evidence,
    indexHash: semanticHash(evidence),
  });
}

export function queryCanonicalSpatialIndex(index, queryBounds) {
  assertSpatialIndex(index);
  const bounds = normalizeBounds(queryBounds, 'queryBounds');
  const matches = [];
  queryBvhBounds(index.root, index.records, bounds, matches);
  return Object.freeze([...new Set(matches)].sort());
}

export function queryCanonicalSpatialIndexRay(
  index,
  ray,
  maxDistance = Number.POSITIVE_INFINITY,
) {
  assertSpatialIndex(index);
  const normalizedRay = normalizeRay(ray);
  if (!(maxDistance >= 0) || !Number.isFinite(maxDistance)) {
    if (maxDistance !== Number.POSITIVE_INFINITY) {
      throw new TypeError('maxDistance must be finite and non-negative.');
    }
  }
  const hits = [];
  queryBvhRay(
    index.root,
    index.records,
    normalizedRay,
    maxDistance,
    hits,
  );
  hits.sort(
    (left, right) =>
      left.distance - right.distance || left.id.localeCompare(right.id),
  );
  return deepFreeze(hits);
}

function validateModelWideGrant(grant, projection) {
  if (!grant) return null;
  if (grant.schema !== TOPOLOGY_EDIT_MODEL_WIDE_GRANT_SCHEMA) {
    throw scopeError('MODEL_WIDE_GRANT_SCHEMA_MISMATCH');
  }
  if (grant.sourceHash !== projection.sourceHash) {
    throw scopeError('MODEL_WIDE_GRANT_SOURCE_STALE');
  }
  if (grant.baseCanonicalHash !== projection.baseCanonicalHash) {
    throw scopeError('MODEL_WIDE_GRANT_BASE_STALE');
  }
  return grant;
}

function buildBvhNode(records, indexes, leafSize) {
  const bounds = combineBounds(indexes.map((index) => records[index].bounds));
  if (indexes.length <= leafSize) {
    return {
      kind: 'LEAF',
      bounds,
      recordIndexes: [...indexes].sort(
        (left, right) => records[left].id.localeCompare(records[right].id),
      ),
    };
  }

  const axis = longestCentroidAxis(records, indexes);
  const sorted = [...indexes].sort((left, right) => {
    const delta = centroid(records[left].bounds, axis) -
      centroid(records[right].bounds, axis);
    return delta || records[left].id.localeCompare(records[right].id);
  });
  const midpoint = Math.floor(sorted.length / 2);
  return {
    kind: 'BRANCH',
    bounds,
    axis,
    left: buildBvhNode(records, sorted.slice(0, midpoint), leafSize),
    right: buildBvhNode(records, sorted.slice(midpoint), leafSize),
  };
}

function queryBvhBounds(node, records, query, matches) {
  if (!node || !boundsIntersect(node.bounds, query)) return;
  if (node.kind === 'LEAF') {
    for (const index of node.recordIndexes) {
      if (boundsIntersect(records[index].bounds, query)) {
        matches.push(records[index].id);
      }
    }
    return;
  }
  queryBvhBounds(node.left, records, query, matches);
  queryBvhBounds(node.right, records, query, matches);
}

function queryBvhRay(node, records, ray, maxDistance, hits) {
  if (!node) return;
  const nodeDistance = rayBoundsDistance(ray, node.bounds);
  if (nodeDistance === null || nodeDistance > maxDistance) return;
  if (node.kind === 'LEAF') {
    for (const index of node.recordIndexes) {
      const distance = rayBoundsDistance(ray, records[index].bounds);
      if (distance !== null && distance <= maxDistance) {
        hits.push({ id: records[index].id, distance });
      }
    }
    return;
  }
  queryBvhRay(node.left, records, ray, maxDistance, hits);
  queryBvhRay(node.right, records, ray, maxDistance, hits);
}

function normalizeSpatialRecord(record, index) {
  const id = stringValue(record?.id || record?.entityId || record?.canonicalId);
  if (!id) {
    throw new TypeError(`Spatial record ${index} has no canonical ID.`);
  }
  return {
    id,
    kind: stringValue(record?.kind || record?.entityKind) || 'UNKNOWN',
    bounds: normalizeBounds(record?.bounds || record?.aabb, `record ${id}`),
  };
}

function normalizeBounds(bounds, label) {
  const source = bounds || {};
  const normalized = {
    minX: finiteNumber(source.minX ?? source.min?.x, `${label}.minX`),
    minY: finiteNumber(source.minY ?? source.min?.y, `${label}.minY`),
    minZ: finiteNumber(source.minZ ?? source.min?.z, `${label}.minZ`),
    maxX: finiteNumber(source.maxX ?? source.max?.x, `${label}.maxX`),
    maxY: finiteNumber(source.maxY ?? source.max?.y, `${label}.maxY`),
    maxZ: finiteNumber(source.maxZ ?? source.max?.z, `${label}.maxZ`),
  };
  if (
    normalized.minX > normalized.maxX ||
    normalized.minY > normalized.maxY ||
    normalized.minZ > normalized.maxZ
  ) {
    throw new RangeError(`${label} has inverted bounds.`);
  }
  return normalized;
}

function normalizeRay(ray = {}) {
  const origin = {
    x: finiteNumber(ray.origin?.x, 'ray.origin.x'),
    y: finiteNumber(ray.origin?.y, 'ray.origin.y'),
    z: finiteNumber(ray.origin?.z, 'ray.origin.z'),
  };
  const rawDirection = {
    x: finiteNumber(ray.direction?.x, 'ray.direction.x'),
    y: finiteNumber(ray.direction?.y, 'ray.direction.y'),
    z: finiteNumber(ray.direction?.z, 'ray.direction.z'),
  };
  const length = Math.hypot(
    rawDirection.x,
    rawDirection.y,
    rawDirection.z,
  );
  if (length < 1e-12) throw new RangeError('Ray direction cannot be zero.');
  return {
    origin,
    direction: {
      x: rawDirection.x / length,
      y: rawDirection.y / length,
      z: rawDirection.z / length,
    },
  };
}

function rayBoundsDistance(ray, bounds) {
  let near = 0;
  let far = Number.POSITIVE_INFINITY;
  for (const axis of ['x', 'y', 'z']) {
    const origin = ray.origin[axis];
    const direction = ray.direction[axis];
    const min = bounds[`min${axis.toUpperCase()}`];
    const max = bounds[`max${axis.toUpperCase()}`];
    if (Math.abs(direction) < 1e-12) {
      if (origin < min || origin > max) return null;
      continue;
    }
    let t1 = (min - origin) / direction;
    let t2 = (max - origin) / direction;
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1);
    far = Math.min(far, t2);
    if (near > far) return null;
  }
  return far < 0 ? null : Math.max(near, 0);
}

function combineBounds(boundsList) {
  return boundsList.reduce(
    (combined, bounds) => ({
      minX: Math.min(combined.minX, bounds.minX),
      minY: Math.min(combined.minY, bounds.minY),
      minZ: Math.min(combined.minZ, bounds.minZ),
      maxX: Math.max(combined.maxX, bounds.maxX),
      maxY: Math.max(combined.maxY, bounds.maxY),
      maxZ: Math.max(combined.maxZ, bounds.maxZ),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  );
}

function longestCentroidAxis(records, indexes) {
  const extents = ['X', 'Y', 'Z'].map((axis) => {
    const values = indexes.map((index) =>
      centroid(records[index].bounds, axis.toLowerCase()),
    );
    return {
      axis: axis.toLowerCase(),
      extent: Math.max(...values) - Math.min(...values),
    };
  });
  extents.sort(
    (left, right) =>
      right.extent - left.extent || left.axis.localeCompare(right.axis),
  );
  return extents[0].axis;
}

function centroid(bounds, axis) {
  const suffix = axis.toUpperCase();
  return (bounds[`min${suffix}`] + bounds[`max${suffix}`]) / 2;
}

function boundsIntersect(left, right) {
  return !(
    left.maxX < right.minX ||
    left.minX > right.maxX ||
    left.maxY < right.minY ||
    left.minY > right.maxY ||
    left.maxZ < right.minZ ||
    left.minZ > right.maxZ
  );
}

function assertSpatialIndex(index) {
  if (index?.schema !== TOPOLOGY_EDIT_SPATIAL_INDEX_SCHEMA) {
    throw new TypeError('A canonical topology spatial index is required.');
  }
}

function entityIdOf(entity) {
  return stringValue(
    entity?.entityId || entity?.id || entity?.canonicalId,
  );
}

function branchIdOf(entity) {
  return normalizeBranchId(
    entity?.branchId ??
      entity?.sourceBranchId ??
      entity?.properties?.identity?.branchId ??
      entity?.properties?.attributes?.BRANCH_ID,
  );
}

function explicitParentBranchIdOf(entity) {
  return (
    entity?.parentBranchId ??
    entity?.sourceParentBranchId ??
    entity?.properties?.identity?.parentBranchId ??
    null
  );
}

function sourceBranchIndexOf(entity) {
  const value =
    entity?.sourceBranchIndex ??
    entity?.branchIndex ??
    entity?.properties?.identity?.sourceBranchIndex;
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : stringValue(value);
}

function branchPathOf(entity) {
  return stringValue(
    entity?.branchPath ||
      entity?.properties?.identity?.branchPath ||
      entity?.properties?.attributes?.BRANCH_PATH,
  );
}

function branchNameOf(entity) {
  return stringValue(
    entity?.branchName ||
      entity?.properties?.identity?.branchName ||
      entity?.properties?.attributes?.BRANCH_NAME,
  );
}

function estimateEntityBytes(entity) {
  const text = JSON.stringify(entity);
  return typeof TextEncoder === 'function'
    ? new TextEncoder().encode(text).byteLength
    : text.length;
}

function normalizeIds(values = []) {
  return [...new Set((values || []).map(stringValue).filter(Boolean))].sort();
}

function normalizeBranchId(value) {
  return stringValue(value) || UNASSIGNED_BRANCH_ID;
}

function nullableBranchId(value) {
  const normalized = stringValue(value);
  return normalized || null;
}

function positiveInteger(value, fallback, label) {
  if (value === undefined || value === null) return fallback;
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return numeric;
}

function finiteNumber(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return numeric;
}

function compareNumbersThenStrings(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

function scopeError(code, details = {}) {
  const error = new Error(code);
  error.name = 'TopologyEditScopeError';
  error.code = code;
  error.details = details;
  return error;
}
