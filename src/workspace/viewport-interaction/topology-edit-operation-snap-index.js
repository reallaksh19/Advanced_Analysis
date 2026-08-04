import {
  deepFreeze,
  semanticHash,
} from '../../core/shared-piping-model/index.js';
import {
  createTopologyEditSnapSpatialIndex,
  TOPOLOGY_EDIT_SNAP_SPATIAL_INDEX_SCHEMA,
} from './topology-edit-snap-spatial-index.js';

export const TOPOLOGY_EDIT_OPERATION_SNAP_FEATURE_SCHEMA =
  'TopologyEditOperationSnapFeatures.v1';

const COMPONENT_FACE_TYPES = new Set(['FLANGE', 'VALVE', 'REDUCER']);
const COMPATIBILITY = new Set(['EXACT', 'ADAPTABLE', 'INCOMPATIBLE']);
const AXIS_TOKENS = Object.freeze({
  X: Object.freeze({ x: 1, y: 0, z: 0 }),
  '+X': Object.freeze({ x: 1, y: 0, z: 0 }),
  '-X': Object.freeze({ x: -1, y: 0, z: 0 }),
  Y: Object.freeze({ x: 0, y: 1, z: 0 }),
  '+Y': Object.freeze({ x: 0, y: 1, z: 0 }),
  '-Y': Object.freeze({ x: 0, y: -1, z: 0 }),
  Z: Object.freeze({ x: 0, y: 0, z: 1 }),
  '+Z': Object.freeze({ x: 0, y: 0, z: 1 }),
  '-Z': Object.freeze({ x: 0, y: 0, z: -1 }),
});

export function createTopologyEditOperationSnapSpatialIndex(input = {}) {
  const topology = requireTopology(input.topology);
  const base = createTopologyEditSnapSpatialIndex(input);
  const hiddenIds = new Set(canonicalIds(input.hiddenCanonicalIds ?? []));
  const lockedIds = new Set(canonicalIds(input.lockedCanonicalIds ?? []));
  const compatibilityByFeatureId = compatibilityMap(
    input.compatibilityByFeatureId ?? {},
  );
  const supportAxisExtentMm = positiveNumber(
    input.supportAxisExtentMm ?? Math.max(base.cellSizeMm * 2, 500),
    'supportAxisExtentMm',
  );
  const nodeById = new Map((topology.nodes ?? []).map((node, index) => [
    canonicalId(node?.id, `nodes[${index}].id`, 'node'),
    finitePoint(node?.position, `nodes[${index}].position`),
  ]));
  const operationPointFeatures = componentFaceFeatures({
    topology,
    nodeById,
    hiddenIds,
    lockedIds,
    compatibilityByFeatureId,
  });
  const operationSegmentFeatures = supportAxisFeatures({
    topology,
    nodeById,
    hiddenIds,
    lockedIds,
    compatibilityByFeatureId,
    extentMm: supportAxisExtentMm,
  });
  const pointFeatures = deepFreeze([
    ...base.pointFeatures,
    ...operationPointFeatures,
  ].sort(compareFeature));
  const segmentFeatures = deepFreeze([
    ...base.segmentFeatures,
    ...operationSegmentFeatures,
  ].sort(compareFeature));
  const pointCells = buildPointCells(pointFeatures, base.cellSizeMm);
  const {
    segmentCells,
    largeSegmentFeatureIds,
  } = buildSegmentCells(
    segmentFeatures,
    base.cellSizeMm,
    base.maximumCellsPerSegment,
  );
  const material = {
    schema: TOPOLOGY_EDIT_SNAP_SPATIAL_INDEX_SCHEMA,
    basisHash: base.basisHash,
    cellSizeMm: base.cellSizeMm,
    maximumCellsPerSegment: base.maximumCellsPerSegment,
    pointFeatures,
    segmentFeatures,
    pointCells,
    segmentCells,
    largeSegmentFeatureIds,
  };
  return deepFreeze({
    ...material,
    indexHash: semanticHash(material),
    operationFeatureAuthority: deepFreeze({
      schema: TOPOLOGY_EDIT_OPERATION_SNAP_FEATURE_SCHEMA,
      componentFaceCount: operationPointFeatures.length,
      supportAxisCount: operationSegmentFeatures.length,
      supportAxisExtentMm,
      authorityHash: semanticHash({
        componentFaceFeatureIds: operationPointFeatures.map((row) => row.featureId),
        supportAxisFeatureIds: operationSegmentFeatures.map((row) => row.featureId),
        supportAxisExtentMm,
      }),
    }),
  });
}

export function installTopologyEditOperationSnapIndex(runtime, options = {}) {
  if (!runtime || typeof runtime !== 'object') {
    throw new TypeError('TopologyEditOperationSnapIndex: runtime is required.');
  }
  if (runtime.__operationSnapIndexInstalled) return runtime;
  const supportAxisExtentMm = positiveNumber(
    options.supportAxisExtentMm
      ?? Math.max(Number(runtime.snapIndexCellSizeMm ?? 500) * 2, 500),
    'supportAxisExtentMm',
  );
  runtime.ensureSnapIndex = function ensureOperationSnapIndex(topology) {
    const context = {
      basisHash: topology?.canonicalTopologyHash,
      hiddenCanonicalIds: canonicalArray(
        this.controller.snapHiddenCanonicalIds,
      ),
      lockedCanonicalIds: canonicalArray(
        this.controller.snapLockedCanonicalIds,
      ),
      compatibilityByFeatureId:
        this.controller.snapCompatibilityByFeatureId ?? {},
      cellSizeMm: this.snapIndexCellSizeMm,
      supportAxisExtentMm,
      featureAuthority: TOPOLOGY_EDIT_OPERATION_SNAP_FEATURE_SCHEMA,
    };
    const contextHash = semanticHash(context);
    if (this.snapIndex && this.snapIndexContextHash === contextHash) {
      return this.snapIndex;
    }
    this.snapIndex = createTopologyEditOperationSnapSpatialIndex({
      topology,
      basisHash: context.basisHash,
      cellSizeMm: context.cellSizeMm,
      hiddenCanonicalIds: context.hiddenCanonicalIds,
      lockedCanonicalIds: context.lockedCanonicalIds,
      compatibilityByFeatureId: context.compatibilityByFeatureId,
      supportAxisExtentMm: context.supportAxisExtentMm,
    });
    this.snapIndexContextHash = contextHash;
    const host = this.controller.hostElement;
    if (host) {
      host.dataset.topologyEditSnapFeatureAuthority =
        this.snapIndex.operationFeatureAuthority.authorityHash;
      host.dataset.topologyEditComponentFaceSnapCount = String(
        this.snapIndex.operationFeatureAuthority.componentFaceCount,
      );
      host.dataset.topologyEditSupportAxisSnapCount = String(
        this.snapIndex.operationFeatureAuthority.supportAxisCount,
      );
    }
    return this.snapIndex;
  };
  Object.defineProperty(runtime, '__operationSnapIndexInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
  return runtime;
}

function componentFaceFeatures({
  topology,
  nodeById,
  hiddenIds,
  lockedIds,
  compatibilityByFeatureId,
}) {
  const rows = [];
  (topology.edges ?? []).forEach((edge, index) => {
    const edgeId = canonicalId(edge?.id, `edges[${index}].id`, 'edge');
    const componentType = String(
      edge?.entityType ?? edge?.type ?? edge?.fittingType ?? '',
    ).trim().toUpperCase();
    if (!COMPONENT_FACE_TYPES.has(componentType)) return;
    const endpoints = [
      ['FROM', canonicalId(edge.fromNodeId, `${edgeId}.fromNodeId`, 'node')],
      ['TO', canonicalId(edge.toNodeId, `${edgeId}.toNodeId`, 'node')],
    ];
    endpoints.forEach(([side, nodeId]) => {
      const worldPoint = nodeById.get(nodeId);
      if (!worldPoint) {
        fail(`${edgeId} ${side} face references unavailable node ${nodeId}.`, RangeError);
      }
      const featureId = `${edgeId}:component-face:${side}`;
      rows.push(deepFreeze({
        featureId,
        kind: 'PORT',
        canonicalTargetIds: deepFreeze([edgeId, nodeId].sort(compareText)),
        worldPoint,
        compatibility: featureCompatibility(
          compatibilityByFeatureId,
          featureId,
          edgeId,
          nodeId,
        ),
        hidden: Boolean(edge.hidden)
          || hiddenIds.has(edgeId)
          || hiddenIds.has(nodeId),
        locked: Boolean(edge.locked)
          || lockedIds.has(edgeId)
          || lockedIds.has(nodeId),
        label: `${componentType} ${side} connection face`,
        operationVariant: 'COMPONENT_FACE',
      }));
    });
  });
  return rows.sort(compareFeature);
}

function supportAxisFeatures({
  topology,
  nodeById,
  hiddenIds,
  lockedIds,
  compatibilityByFeatureId,
  extentMm,
}) {
  const rows = [];
  (topology.supports ?? []).forEach((support, supportIndex) => {
    const supportId = canonicalId(
      support?.id,
      `supports[${supportIndex}].id`,
      'support',
    );
    const nodeId = canonicalId(
      support?.nodeId,
      `${supportId}.nodeId`,
      'node',
    );
    const origin = nodeById.get(nodeId);
    if (!origin || support.resolved === false) return;
    restraintRows(support).forEach((restraint, restraintIndex) => {
      if (restraint?.directionStatus === 'UNRESOLVED'
        || restraint?.resolvedDirection === false) return;
      const direction = resolvedDirection(restraint);
      if (!direction) return;
      const restraintId = text(
        restraint.id ?? restraint.restraintId,
      ) || `restraint-${restraintIndex}`;
      const directionToken = vectorToken(direction);
      const featureId = `${supportId}:support-axis:${restraintId}:${directionToken}`;
      const start = subtract(origin, scale(direction, extentMm));
      const end = add(origin, scale(direction, extentMm));
      rows.push(deepFreeze({
        featureId,
        kind: 'EDGE_SEGMENT',
        canonicalTargetIds: deepFreeze([supportId, nodeId].sort(compareText)),
        start,
        end,
        bounds: bounds(start, end),
        compatibility: featureCompatibility(
          compatibilityByFeatureId,
          featureId,
          supportId,
          nodeId,
        ),
        hidden: Boolean(support.hidden)
          || hiddenIds.has(supportId)
          || hiddenIds.has(nodeId),
        locked: Boolean(support.locked)
          || lockedIds.has(supportId)
          || lockedIds.has(nodeId),
        label: `Support axis ${directionToken}`,
        operationVariant: 'SUPPORT_AXIS',
      }));
    });
  });
  return rows.sort(compareFeature);
}

function restraintRows(support) {
  if (Array.isArray(support.restraints)) return support.restraints;
  if (Array.isArray(support.restraint?.restraints)) {
    return support.restraint.restraints;
  }
  if (Array.isArray(support.restraint)) return support.restraint;
  return support.restraint && typeof support.restraint === 'object'
    ? [support.restraint]
    : [];
}

function resolvedDirection(restraint = {}) {
  const value = restraint.direction
    ?? restraint.axis
    ?? restraint.directionToken
    ?? restraint.vector;
  if (typeof value === 'string') {
    const token = value.trim().toUpperCase().replace(/\s+/gu, '');
    if (AXIS_TOKENS[token]) return AXIS_TOKENS[token];
    const parsed = token.split(',').map(Number);
    if (parsed.length === 3 && parsed.every(Number.isFinite)) {
      return normalizedVector({ x: parsed[0], y: parsed[1], z: parsed[2] });
    }
    return null;
  }
  if (value && typeof value === 'object') {
    return normalizedVector(value);
  }
  return null;
}

function normalizedVector(value) {
  const vector = {
    x: Number(value?.x),
    y: Number(value?.y),
    z: Number(value?.z),
  };
  if (![vector.x, vector.y, vector.z].every(Number.isFinite)) return null;
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!(length > 0)) return null;
  return deepFreeze({
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  });
}

function vectorToken(vector) {
  const axis = [
    ['X', vector.x],
    ['Y', vector.y],
    ['Z', vector.z],
  ].find(([, value]) => Math.abs(Math.abs(value) - 1) <= 1e-12);
  if (axis && [vector.x, vector.y, vector.z]
    .filter((value) => Math.abs(value) > 1e-12).length === 1) {
    return `${axis[1] < 0 ? '-' : '+'}${axis[0]}`;
  }
  return [vector.x, vector.y, vector.z]
    .map((value) => quantized(value))
    .join(',');
}

function buildPointCells(features, cellSizeMm) {
  const cells = {};
  features.forEach((feature) => addCell(
    cells,
    cellKey(feature.worldPoint, cellSizeMm),
    feature.featureId,
  ));
  return freezeCells(cells);
}

function buildSegmentCells(features, cellSizeMm, maximumCellsPerSegment) {
  const cells = {};
  const large = [];
  features.forEach((feature) => {
    const range = cellRange(feature.bounds, cellSizeMm);
    if (rangeCount(range) > maximumCellsPerSegment) {
      large.push(feature.featureId);
      return;
    }
    forEachCell(range, (key) => addCell(cells, key, feature.featureId));
  });
  return {
    segmentCells: freezeCells(cells),
    largeSegmentFeatureIds: deepFreeze(large.sort(compareText)),
  };
}

function freezeCells(cells) {
  Object.keys(cells).forEach((key) => {
    cells[key] = deepFreeze([...new Set(cells[key])].sort(compareText));
  });
  return deepFreeze(cells);
}

function addCell(cells, key, featureId) {
  if (!cells[key]) cells[key] = [];
  cells[key].push(featureId);
}
function cellKey(point, size) {
  return `${Math.floor(point.x / size)}:${Math.floor(point.y / size)}:${Math.floor(point.z / size)}`;
}
function cellRange(value, size) {
  return {
    minimum: {
      x: Math.floor(value.minimum.x / size),
      y: Math.floor(value.minimum.y / size),
      z: Math.floor(value.minimum.z / size),
    },
    maximum: {
      x: Math.floor(value.maximum.x / size),
      y: Math.floor(value.maximum.y / size),
      z: Math.floor(value.maximum.z / size),
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
function bounds(start, end) {
  return deepFreeze({
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
  });
}
function compatibilityMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('compatibilityByFeatureId must be an object.');
  }
  return new Map(Object.entries(value).map(([key, row]) => {
    const compatibility = String(row ?? '').trim().toUpperCase();
    if (!COMPATIBILITY.has(compatibility)) {
      fail(`Unsupported compatibility ${compatibility}.`, RangeError);
    }
    return [requiredText(key, 'compatibility feature ID'), compatibility];
  }));
}
function featureCompatibility(map, ...keys) {
  for (const key of keys) {
    if (map.has(key)) return map.get(key);
  }
  return 'EXACT';
}
function canonicalArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((row) => typeof row === 'string' && row))]
    .sort(compareText);
}
function canonicalIds(value) {
  if (!Array.isArray(value)) fail('Canonical IDs must be an array.');
  return [...new Set(value.map((row, index) => canonicalId(
    row,
    `canonicalIds[${index}]`,
  )))].sort(compareText);
}
function canonicalId(value, label, expectedKind = null) {
  const id = requiredText(value, label);
  if (!/^(?:node|edge|junction|support|boundary|rigid):[^\s]+$/u.test(id)) {
    fail(`${label} must be an exact canonical ID.`, RangeError);
  }
  if (expectedKind && !id.startsWith(`${expectedKind}:`)) {
    fail(`${label} must use the ${expectedKind}: namespace.`, RangeError);
  }
  return id;
}
function finitePoint(value, label) {
  const point = {
    x: Number(value?.x),
    y: Number(value?.y),
    z: Number(value?.z),
  };
  if (![point.x, point.y, point.z].every(Number.isFinite)) {
    fail(`${label} must be a finite point.`, RangeError);
  }
  return deepFreeze(point);
}
function requireTopology(value) {
  if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    fail('Current canonical topology is required.');
  }
  return value;
}
function compareFeature(left, right) {
  return compareText(left.featureId, right.featureId);
}
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function add(left, right) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}
function subtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}
function scale(value, factor) {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}
function quantized(value) { return String(Math.round(value * 1e9) / 1e9); }
function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    fail(`${label} must be positive.`, RangeError);
  }
  return number;
}
function text(value) { return String(value ?? '').trim(); }
function requiredText(value, label) {
  const result = text(value);
  if (!result) fail(`${label} is required.`);
  return result;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditOperationSnapIndex: ${message}`);
}
