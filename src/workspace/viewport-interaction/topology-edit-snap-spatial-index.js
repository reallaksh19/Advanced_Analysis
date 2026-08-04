import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { finiteTopologyEditPoint } from './topology-edit-interaction-values.js';

export const TOPOLOGY_EDIT_SNAP_SPATIAL_INDEX_SCHEMA =
  'TopologyEditSnapSpatialIndex.v1';
export const TOPOLOGY_EDIT_SNAP_INDEX_QUERY_SCHEMA =
  'TopologyEditSnapSpatialIndexQuery.v1';

const CANONICAL_ID = /^(?:node|edge|junction|support|boundary|rigid):[^\s]+$/u;
const COMPATIBILITY = new Set(['EXACT', 'ADAPTABLE', 'INCOMPATIBLE']);

export function createTopologyEditSnapSpatialIndex(input = {}) {
  const topology = requireTopology(input.topology);
  const basisHash = requiredText(
    input.basisHash ?? topology.canonicalTopologyHash,
    'basisHash',
  );
  const cellSizeMm = positiveNumber(input.cellSizeMm ?? 500, 'cellSizeMm');
  const maximumCellsPerSegment = positiveInteger(
    input.maximumCellsPerSegment ?? 4096,
    'maximumCellsPerSegment',
  );
  const hiddenIds = canonicalIdSet(input.hiddenCanonicalIds ?? []);
  const lockedIds = canonicalIdSet(input.lockedCanonicalIds ?? []);
  const compatibilityByFeatureId = compatibilityMap(
    input.compatibilityByFeatureId ?? {},
  );
  const nodes = normalizedNodes(topology.nodes);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const pointFeatures = [];
  for (const node of nodes) {
    const hidden = hiddenIds.has(node.id) || Boolean(node.hidden);
    const locked = lockedIds.has(node.id) || Boolean(node.locked);
    pointFeatures.push(pointFeature({
      featureId: `${node.id}:node`,
      kind: 'NODE',
      canonicalTargetIds: [node.id],
      worldPoint: node.position,
      compatibility: featureCompatibility(
        compatibilityByFeatureId,
        `${node.id}:node`,
        node.id,
      ),
      hidden,
      locked,
      label: 'Node',
    }));
    for (const portKey of node.portKeys) {
      pointFeatures.push(pointFeature({
        featureId: `port:${portKey}`,
        kind: 'PORT',
        canonicalTargetIds: [node.id],
        worldPoint: node.position,
        compatibility: featureCompatibility(
          compatibilityByFeatureId,
          `port:${portKey}`,
          portKey,
          node.id,
        ),
        hidden,
        locked,
        label: `Port ${portKey}`,
      }));
    }
  }
  const segmentFeatures = normalizedEdges(topology.edges).map((edge) => {
    const start = nodeById.get(edge.fromNodeId)?.position;
    const end = nodeById.get(edge.toNodeId)?.position;
    if (!start || !end) {
      fail(`Edge ${edge.id} references unavailable nodes.`, RangeError);
    }
    return segmentFeature({
      featureId: `${edge.id}:segment`,
      canonicalTargetIds: [edge.id],
      start,
      end,
      compatibility: featureCompatibility(
        compatibilityByFeatureId,
        `${edge.id}:segment`,
        edge.id,
      ),
      hidden: hiddenIds.has(edge.id) || Boolean(edge.hidden),
      locked: lockedIds.has(edge.id) || Boolean(edge.locked),
      label: 'Edge centerline',
    });
  });

  pointFeatures.sort(compareFeature);
  segmentFeatures.sort(compareFeature);
  const pointCells = {};
  for (const feature of pointFeatures) {
    addCell(pointCells, cellKey(feature.worldPoint, cellSizeMm), feature.featureId);
  }
  const segmentCells = {};
  const largeSegmentFeatureIds = [];
  for (const feature of segmentFeatures) {
    const range = cellRange(feature.bounds, cellSizeMm);
    const count = rangeCount(range);
    if (count > maximumCellsPerSegment) {
      largeSegmentFeatureIds.push(feature.featureId);
      continue;
    }
    forEachCell(range, (key) => addCell(segmentCells, key, feature.featureId));
  }
  freezeCellObject(pointCells);
  freezeCellObject(segmentCells);
  const material = {
    schema: TOPOLOGY_EDIT_SNAP_SPATIAL_INDEX_SCHEMA,
    basisHash,
    cellSizeMm,
    maximumCellsPerSegment,
    pointFeatures: deepFreeze(pointFeatures),
    segmentFeatures: deepFreeze(segmentFeatures),
    pointCells: deepFreeze(pointCells),
    segmentCells: deepFreeze(segmentCells),
    largeSegmentFeatureIds: deepFreeze(largeSegmentFeatureIds.sort(compareText)),
  };
  return deepFreeze({ ...material, indexHash: semanticHash(material) });
}

export function assertTopologyEditSnapSpatialIndex(value) {
  if (value?.schema !== TOPOLOGY_EDIT_SNAP_SPATIAL_INDEX_SCHEMA) {
    fail('A valid topology-edit snap spatial index is required.');
  }
  const material = indexMaterial(value);
  if (semanticHash(material) !== value.indexHash) {
    fail('Topology-edit snap spatial index differs from normalized authority.', RangeError);
  }
  return value;
}

export function queryTopologyEditSnapSpatialIndex(indexInput, input = {}) {
  const index = assertTopologyEditSnapSpatialIndex(indexInput);
  const centerWorld = finiteTopologyEditPoint(input.centerWorld, 'centerWorld');
  const radiusMm = nonNegativeNumber(input.radiusMm, 'radiusMm');
  const bounds = {
    minimum: {
      x: centerWorld.x - radiusMm,
      y: centerWorld.y - radiusMm,
      z: centerWorld.z - radiusMm,
    },
    maximum: {
      x: centerWorld.x + radiusMm,
      y: centerWorld.y + radiusMm,
      z: centerWorld.z + radiusMm,
    },
  };
  const range = cellRange(bounds, index.cellSizeMm);
  const pointIds = new Set();
  const segmentIds = new Set();
  let pointCellsVisited = 0;
  let segmentCellsVisited = 0;
  forEachCell(range, (key) => {
    pointCellsVisited += 1;
    segmentCellsVisited += 1;
    for (const featureId of index.pointCells[key] ?? []) pointIds.add(featureId);
    for (const featureId of index.segmentCells[key] ?? []) segmentIds.add(featureId);
  });
  for (const featureId of index.largeSegmentFeatureIds) segmentIds.add(featureId);
  const pointById = new Map(index.pointFeatures.map((row) => [row.featureId, row]));
  const segmentById = new Map(index.segmentFeatures.map((row) => [row.featureId, row]));
  const pointFeatures = [...pointIds]
    .map((featureId) => pointById.get(featureId))
    .filter(Boolean)
    .filter((feature) => distance(feature.worldPoint, centerWorld) <= radiusMm)
    .sort(compareFeature);
  const segmentFeatures = [...segmentIds]
    .map((featureId) => segmentById.get(featureId))
    .filter(Boolean)
    .filter((feature) => pointBoundsDistance(centerWorld, feature.bounds) <= radiusMm)
    .sort(compareFeature);
  const material = {
    schema: TOPOLOGY_EDIT_SNAP_INDEX_QUERY_SCHEMA,
    indexHash: index.indexHash,
    basisHash: index.basisHash,
    centerWorld,
    radiusMm,
    pointFeatures: deepFreeze(pointFeatures),
    segmentFeatures: deepFreeze(segmentFeatures),
    statistics: deepFreeze({
      pointCellsVisited,
      segmentCellsVisited,
      sourceFeaturesVisited: pointFeatures.length + segmentFeatures.length,
    }),
  };
  return deepFreeze({ ...material, queryHash: semanticHash(material) });
}

function pointFeature(input) {
  return deepFreeze({
    featureId: requiredText(input.featureId, 'featureId'),
    kind: enumValue(input.kind, new Set(['NODE', 'PORT']), 'kind'),
    canonicalTargetIds: canonicalIds(input.canonicalTargetIds),
    worldPoint: finiteTopologyEditPoint(input.worldPoint, 'worldPoint'),
    compatibility: compatibilityValue(input.compatibility),
    hidden: Boolean(input.hidden),
    locked: Boolean(input.locked),
    label: requiredText(input.label, 'label'),
  });
}

function segmentFeature(input) {
  const start = finiteTopologyEditPoint(input.start, 'start');
  const end = finiteTopologyEditPoint(input.end, 'end');
  return deepFreeze({
    featureId: requiredText(input.featureId, 'featureId'),
    kind: 'EDGE_SEGMENT',
    canonicalTargetIds: canonicalIds(input.canonicalTargetIds),
    start,
    end,
    bounds: deepFreeze({
      minimum: {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        z: Math.min(start.z, end.z),
      },
      maximum: {
        x: Math.max(start.x, end.x),
        y: Math.max(start.y, end.y),
        z: Math.max(start.z, end.z),
      },
    }),
    compatibility: compatibilityValue(input.compatibility),
    hidden: Boolean(input.hidden),
    locked: Boolean(input.locked),
    label: requiredText(input.label, 'label'),
  });
}

function normalizedNodes(values) {
  if (!Array.isArray(values)) fail('Topology nodes must be an array.');
  return values.map((node, index) => ({
    id: canonicalId(node?.id, `nodes[${index}].id`, 'node'),
    position: finiteTopologyEditPoint(node?.position, `nodes[${index}].position`),
    portKeys: textArray(node?.portKeys ?? [], `nodes[${index}].portKeys`),
    hidden: Boolean(node?.hidden),
    locked: Boolean(node?.locked),
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function normalizedEdges(values) {
  if (!Array.isArray(values)) fail('Topology edges must be an array.');
  return values.map((edge, index) => ({
    id: canonicalId(edge?.id, `edges[${index}].id`, 'edge'),
    fromNodeId: canonicalId(edge?.fromNodeId, `edges[${index}].fromNodeId`, 'node'),
    toNodeId: canonicalId(edge?.toNodeId, `edges[${index}].toNodeId`, 'node'),
    hidden: Boolean(edge?.hidden),
    locked: Boolean(edge?.locked),
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function compatibilityMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('compatibilityByFeatureId must be an object.');
  }
  return new Map(Object.entries(value).map(([key, row]) => [
    requiredText(key, 'compatibility feature ID'),
    compatibilityValue(row),
  ]));
}

function featureCompatibility(map, ...keys) {
  for (const key of keys) {
    if (map.has(key)) return map.get(key);
  }
  return 'EXACT';
}

function addCell(target, key, featureId) {
  if (!target[key]) target[key] = [];
  target[key].push(featureId);
}

function freezeCellObject(value) {
  for (const key of Object.keys(value)) {
    value[key] = deepFreeze([...new Set(value[key])].sort(compareText));
  }
}

function cellKey(point, size) {
  return `${Math.floor(point.x / size)}:${Math.floor(point.y / size)}:${Math.floor(point.z / size)}`;
}

function cellRange(bounds, size) {
  return {
    minimum: {
      x: Math.floor(bounds.minimum.x / size),
      y: Math.floor(bounds.minimum.y / size),
      z: Math.floor(bounds.minimum.z / size),
    },
    maximum: {
      x: Math.floor(bounds.maximum.x / size),
      y: Math.floor(bounds.maximum.y / size),
      z: Math.floor(bounds.maximum.z / size),
    },
  };
}

function rangeCount(range) {
  return (range.maximum.x - range.minimum.x + 1)
    * (range.maximum.y - range.minimum.y + 1)
    * (range.maximum.z - range.minimum.z + 1);
}

function forEachCell(range, callback) {
  for (let x = range.minimum.x; x <= range.maximum.x; x += 1) {
    for (let y = range.minimum.y; y <= range.maximum.y; y += 1) {
      for (let z = range.minimum.z; z <= range.maximum.z; z += 1) {
        callback(`${x}:${y}:${z}`);
      }
    }
  }
}

function pointBoundsDistance(point, bounds) {
  const dx = point.x < bounds.minimum.x
    ? bounds.minimum.x - point.x
    : point.x > bounds.maximum.x
      ? point.x - bounds.maximum.x
      : 0;
  const dy = point.y < bounds.minimum.y
    ? bounds.minimum.y - point.y
    : point.y > bounds.maximum.y
      ? point.y - bounds.maximum.y
      : 0;
  const dz = point.z < bounds.minimum.z
    ? bounds.minimum.z - point.z
    : point.z > bounds.maximum.z
      ? point.z - bounds.maximum.z
      : 0;
  return Math.hypot(dx, dy, dz);
}

function distance(left, right) {
  return Math.hypot(
    left.x - right.x,
    left.y - right.y,
    left.z - right.z,
  );
}

function indexMaterial(value) {
  return {
    schema: value.schema,
    basisHash: value.basisHash,
    cellSizeMm: value.cellSizeMm,
    maximumCellsPerSegment: value.maximumCellsPerSegment,
    pointFeatures: value.pointFeatures,
    segmentFeatures: value.segmentFeatures,
    pointCells: value.pointCells,
    segmentCells: value.segmentCells,
    largeSegmentFeatureIds: value.largeSegmentFeatureIds,
  };
}

function requireTopology(value) {
  if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    fail('Current canonical topology is required.');
  }
  return value;
}

function canonicalIdSet(value) {
  return new Set(canonicalIds(value));
}

function canonicalIds(value) {
  if (!Array.isArray(value)) fail('Canonical IDs must be an array.');
  return deepFreeze([...new Set(value.map((row, index) => canonicalId(
    row,
    `canonicalIds[${index}]`,
  )))].sort(compareText));
}

function canonicalId(value, label, expectedKind = null) {
  const id = requiredText(value, label);
  if (!CANONICAL_ID.test(id)) fail(`${label} must be an exact canonical ID.`, RangeError);
  if (expectedKind && !id.startsWith(`${expectedKind}:`)) {
    fail(`${label} must use the ${expectedKind}: namespace.`, RangeError);
  }
  return id;
}

function textArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return deepFreeze([...new Set(value.map((row, index) => requiredText(
    row,
    `${label}[${index}]`,
  )))].sort(compareText));
}

function compatibilityValue(value) {
  return enumValue(
    String(value ?? 'EXACT').toUpperCase(),
    COMPATIBILITY,
    'compatibility',
  );
}

function enumValue(value, allowed, label) {
  if (!allowed.has(value)) {
    fail(`${label} must be one of ${[...allowed].join(', ')}.`, RangeError);
  }
  return value;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    fail(`${label} must be a positive integer.`, RangeError);
  }
  return number;
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    fail(`${label} must be positive.`, RangeError);
  }
  return number;
}

function nonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    fail(`${label} must be non-negative.`, RangeError);
  }
  return number;
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}

function compareFeature(left, right) {
  return left.featureId.localeCompare(right.featureId);
}

function compareText(left, right) {
  return left.localeCompare(right);
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditSnapSpatialIndex: ${message}`);
}
