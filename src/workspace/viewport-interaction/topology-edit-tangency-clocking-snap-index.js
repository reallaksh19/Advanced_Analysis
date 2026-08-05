import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  createTopologyEditOperationSnapSpatialIndex,
  installTopologyEditOperationSnapIndex,
  TOPOLOGY_EDIT_OPERATION_SNAP_FEATURE_SCHEMA,
} from './topology-edit-operation-snap-index.js';
import { TOPOLOGY_EDIT_SNAP_SPATIAL_INDEX_SCHEMA } from './topology-edit-snap-spatial-index.js';

export const TOPOLOGY_EDIT_TANGENCY_CLOCKING_SNAP_SCHEMA =
  'TopologyEditTangencyClockingSnapFeatures.v1';

const ELBOW_TYPES = new Set(['ELBOW', 'BEND']);
const BRANCH_TYPES = new Set(['TEE', 'BRANCH', 'OLET', 'LATERAL']);

export function createTopologyEditTangencyClockingSnapSpatialIndex(input = {}) {
  const topology = requireTopology(input.topology);
  const base = createTopologyEditOperationSnapSpatialIndex(input);
  const extentMm = positive(
    input.operationLineExtentMm ?? Math.max(base.cellSizeMm * 2, 500),
    'operationLineExtentMm',
  );
  const nodes = nodeIndex(topology.nodes);
  const elbowTangents = elbowTangentFeatures(topology, nodes, extentMm);
  const branchClocking = branchClockingFeatures(topology, nodes, extentMm);
  const added = [...elbowTangents, ...branchClocking].sort(compareFeature);
  const segmentFeatures = deepFreeze([
    ...base.segmentFeatures,
    ...added,
  ].sort(compareFeature));
  const { segmentCells, largeSegmentFeatureIds } = buildSegmentCells(
    segmentFeatures,
    base.cellSizeMm,
    base.maximumCellsPerSegment,
  );
  const material = {
    schema: TOPOLOGY_EDIT_SNAP_SPATIAL_INDEX_SCHEMA,
    basisHash: base.basisHash,
    cellSizeMm: base.cellSizeMm,
    maximumCellsPerSegment: base.maximumCellsPerSegment,
    pointFeatures: base.pointFeatures,
    segmentFeatures,
    pointCells: base.pointCells,
    segmentCells,
    largeSegmentFeatureIds,
  };
  const featureAuthority = deepFreeze({
    schema: TOPOLOGY_EDIT_TANGENCY_CLOCKING_SNAP_SCHEMA,
    elbowTangencyCount: elbowTangents.length,
    branchClockingCount: branchClocking.length,
    operationLineExtentMm: extentMm,
    authorityHash: semanticHash({
      elbowTangencyFeatureIds: elbowTangents.map((row) => row.featureId),
      branchClockingFeatureIds: branchClocking.map((row) => row.featureId),
      operationLineExtentMm: extentMm,
    }),
  });
  return deepFreeze({
    ...material,
    indexHash: semanticHash(material),
    operationFeatureAuthority: base.operationFeatureAuthority,
    tangencyClockingFeatureAuthority: featureAuthority,
  });
}

export function installTopologyEditTangencyClockingSnapIndex(runtime, options = {}) {
  if (!runtime || typeof runtime !== 'object') {
    fail('runtime is required.');
  }
  if (runtime.__tangencyClockingSnapIndexInstalled) return runtime;
  installTopologyEditOperationSnapIndex(runtime, options);
  const extentMm = positive(
    options.operationLineExtentMm
      ?? Math.max(Number(runtime.snapIndexCellSizeMm ?? 500) * 2, 500),
    'operationLineExtentMm',
  );
  runtime.ensureSnapIndex = function ensureTangencyClockingSnapIndex(topology) {
    const context = {
      basisHash: topology?.canonicalTopologyHash,
      hiddenCanonicalIds: canonicalArray(this.controller.snapHiddenCanonicalIds),
      lockedCanonicalIds: canonicalArray(this.controller.snapLockedCanonicalIds),
      compatibilityByFeatureId: this.controller.snapCompatibilityByFeatureId ?? {},
      cellSizeMm: this.snapIndexCellSizeMm,
      operationLineExtentMm: extentMm,
      featureAuthority: [
        TOPOLOGY_EDIT_OPERATION_SNAP_FEATURE_SCHEMA,
        TOPOLOGY_EDIT_TANGENCY_CLOCKING_SNAP_SCHEMA,
      ],
    };
    const contextHash = semanticHash(context);
    if (this.snapIndex && this.snapIndexContextHash === contextHash) return this.snapIndex;
    this.snapIndex = createTopologyEditTangencyClockingSnapSpatialIndex({
      topology,
      basisHash: context.basisHash,
      cellSizeMm: context.cellSizeMm,
      hiddenCanonicalIds: context.hiddenCanonicalIds,
      lockedCanonicalIds: context.lockedCanonicalIds,
      compatibilityByFeatureId: context.compatibilityByFeatureId,
      operationLineExtentMm: context.operationLineExtentMm,
    });
    this.snapIndexContextHash = contextHash;
    const host = this.controller.hostElement;
    if (host) {
      const f1 = this.snapIndex.operationFeatureAuthority;
      const f2 = this.snapIndex.tangencyClockingFeatureAuthority;
      host.dataset.topologyEditSnapFeatureAuthority = f1.authorityHash;
      host.dataset.topologyEditComponentFaceSnapCount = String(f1.componentFaceCount);
      host.dataset.topologyEditSupportAxisSnapCount = String(f1.supportAxisCount);
      host.dataset.topologyEditTangencyClockingAuthority = f2.authorityHash;
      host.dataset.topologyEditElbowTangencySnapCount = String(f2.elbowTangencyCount);
      host.dataset.topologyEditBranchClockingSnapCount = String(f2.branchClockingCount);
    }
    return this.snapIndex;
  };
  Object.defineProperty(runtime, '__tangencyClockingSnapIndexInstalled', {
    value: true,
    enumerable: false,
  });
  return runtime;
}

function elbowTangentFeatures(topology, nodes, extentMm) {
  const bendByEdge = new Map((topology.bends ?? []).flatMap((bend) => (
    text(bend?.edgeId) ? [[bend.edgeId, bend]] : []
  )));
  const rows = [];
  (topology.edges ?? []).forEach((edge, index) => {
    const edgeId = canonicalId(edge?.id, `edges[${index}].id`, 'edge');
    const type = text(edge?.entityType ?? edge?.type).toUpperCase();
    if (!ELBOW_TYPES.has(type)) return;
    const linked = bendByEdge.get(edgeId) ?? {};
    const fromNodeId = canonicalId(edge.fromNodeId, `${edgeId}.fromNodeId`, 'node');
    const toNodeId = canonicalId(edge.toNodeId, `${edgeId}.toNodeId`, 'node');
    const fromPoint = nodes.get(fromNodeId);
    const toPoint = nodes.get(toNodeId);
    if (!fromPoint || !toPoint) return;
    const center = firstPoint(
      edge.arcCenter, edge.centerPoint, edge.center,
      linked.arcCenter, linked.centerPoint, linked.center,
    );
    let fromTangent = firstVector(
      edge.fromTangent, edge.tangentFrom, edge.startTangent,
      linked.fromTangent, linked.tangentFrom, linked.startTangent,
    );
    let toTangent = firstVector(
      edge.toTangent, edge.tangentTo, edge.endTangent,
      linked.toTangent, linked.tangentTo, linked.endTangent,
    );
    if ((!fromTangent || !toTangent) && center) {
      const radialFrom = normalize(subtract(fromPoint, center));
      const radialTo = normalize(subtract(toPoint, center));
      const normal = radialFrom && radialTo ? normalize(cross(radialFrom, radialTo)) : null;
      if (normal) {
        fromTangent ??= orient(normalize(cross(normal, radialFrom)), subtract(toPoint, fromPoint));
        toTangent ??= orient(normalize(cross(normal, radialTo)), subtract(toPoint, fromPoint));
      }
    }
    addTangent(rows, edgeId, 'FROM', fromNodeId, fromPoint, fromTangent, extentMm);
    addTangent(rows, edgeId, 'TO', toNodeId, toPoint, toTangent, extentMm);
  });
  return rows.sort(compareFeature);
}

function addTangent(rows, edgeId, side, nodeId, point, direction, extentMm) {
  if (!direction) return;
  const start = subtract(point, scale(direction, extentMm));
  const end = add(point, scale(direction, extentMm));
  rows.push(segmentFeature({
    featureId: `${edgeId}:elbow-tangent:${side}`,
    targets: [edgeId, nodeId],
    start,
    end,
    label: `Elbow ${side} tangent`,
    operationVariant: 'ELBOW_TANGENCY',
  }));
}

function branchClockingFeatures(topology, nodes, extentMm) {
  const rows = [];
  (topology.junctions ?? []).forEach((junction, index) => {
    const junctionId = canonicalId(junction?.id, `junctions[${index}].id`, 'junction');
    const type = text(junction?.entityType ?? junction?.type).toUpperCase();
    if (!BRANCH_TYPES.has(type)) return;
    const geometry = branchGeometry(junction, nodes);
    if (!geometry) return;
    const reference = clockingReference(geometry.runAxis);
    if (!reference) return;
    const angleDeg = signedAngleDegrees(reference, geometry.branchDirection, geometry.runAxis);
    const end = add(geometry.center, scale(geometry.branchDirection, extentMm));
    rows.push(segmentFeature({
      featureId: `${junctionId}:branch-clocking:${geometry.branchNodeId}`,
      targets: [junctionId, geometry.branchNodeId],
      start: geometry.center,
      end,
      label: `Branch clocking ${formatAngle(angleDeg)}°`,
      operationVariant: 'BRANCH_CLOCKING',
      clockingAngleDeg: angleDeg,
    }));
  });
  return rows.sort(compareFeature);
}

function branchGeometry(junction, nodes) {
  const explicitBranch = text(junction.branchNodeId ?? junction.branchPortNodeId);
  const explicitRun = Array.isArray(junction.runNodeIds) ? junction.runNodeIds.map(text) : [];
  let runIds;
  let branchNodeId;
  if (explicitBranch && explicitRun.length === 2) {
    runIds = [...explicitRun].sort(compareText);
    branchNodeId = explicitBranch;
  } else {
    const ids = [...new Set((junction.nodeIds ?? []).map(text).filter(Boolean))].sort(compareText);
    if (ids.length !== 3) return null;
    const pairs = [
      [ids[0], ids[1]], [ids[0], ids[2]], [ids[1], ids[2]],
    ].map((pair) => ({ pair, distance: distance(nodes.get(pair[0]), nodes.get(pair[1])) }))
      .filter((row) => Number.isFinite(row.distance))
      .sort((left, right) => right.distance - left.distance
        || compareText(left.pair.join('|'), right.pair.join('|')));
    if (!pairs.length) return null;
    runIds = pairs[0].pair;
    branchNodeId = ids.find((id) => !runIds.includes(id));
  }
  const runA = nodes.get(runIds[0]);
  const runB = nodes.get(runIds[1]);
  const branchPoint = nodes.get(branchNodeId);
  if (!runA || !runB || !branchPoint) return null;
  const center = midpoint(runA, runB);
  const runAxis = normalize(subtract(runB, runA));
  const branchDirection = normalize(subtract(branchPoint, center));
  if (!runAxis || !branchDirection || Math.abs(dot(runAxis, branchDirection)) > 1 - 1e-9) return null;
  return { branchNodeId, center, runAxis, branchDirection };
}

function segmentFeature({ featureId, targets, start, end, label, operationVariant, clockingAngleDeg = null }) {
  return deepFreeze({
    featureId,
    kind: 'EDGE_SEGMENT',
    canonicalTargetIds: deepFreeze([...new Set(targets)].sort(compareText)),
    start: freezePoint(start),
    end: freezePoint(end),
    bounds: bounds(start, end),
    compatibility: 'EXACT',
    hidden: false,
    locked: false,
    label,
    operationVariant,
    ...(clockingAngleDeg === null ? {} : { clockingAngleDeg }),
  });
}

function nodeIndex(rows = []) {
  return new Map(rows.map((row, index) => [
    canonicalId(row?.id, `nodes[${index}].id`, 'node'),
    finitePoint(row?.position),
  ]));
}
function firstPoint(...values) { return values.map(finitePoint).find(Boolean) ?? null; }
function firstVector(...values) { return values.map(normalize).find(Boolean) ?? null; }
function finitePoint(value) {
  const point = { x: Number(value?.x), y: Number(value?.y), z: Number(value?.z) };
  return Object.values(point).every(Number.isFinite) ? freezePoint(point) : null;
}
function normalize(value) {
  const point = finitePoint(value);
  if (!point) return null;
  const length = Math.hypot(point.x, point.y, point.z);
  return length > 1e-12 ? freezePoint(scale(point, 1 / length)) : null;
}
function orient(direction, toward) {
  return direction && dot(direction, toward) < 0 ? scale(direction, -1) : direction;
}
function clockingReference(axis) {
  const seed = Math.abs(dot(axis, { x: 0, y: 0, z: 1 })) < 0.95
    ? { x: 0, y: 0, z: 1 }
    : { x: 0, y: 1, z: 0 };
  return normalize(subtract(seed, scale(axis, dot(seed, axis))));
}
function signedAngleDegrees(from, to, axis) {
  const angle = Math.atan2(dot(cross(from, to), axis), dot(from, to)) * 180 / Math.PI;
  return Math.round(angle * 1e9) / 1e9;
}
function formatAngle(value) { return String(Math.round(value * 1000) / 1000); }

function buildSegmentCells(features, cellSizeMm, maximumCellsPerSegment) {
  const cells = {};
  const large = [];
  features.forEach((feature) => {
    const range = cellRange(feature.bounds, cellSizeMm);
    if (rangeCount(range) > maximumCellsPerSegment) {
      large.push(feature.featureId);
      return;
    }
    forEachCell(range, (key) => {
      (cells[key] ??= []).push(feature.featureId);
    });
  });
  Object.keys(cells).forEach((key) => {
    cells[key] = deepFreeze([...new Set(cells[key])].sort(compareText));
  });
  return {
    segmentCells: deepFreeze(cells),
    largeSegmentFeatureIds: deepFreeze(large.sort(compareText)),
  };
}
function cellRange(value, size) {
  return {
    minimum: Object.fromEntries(['x', 'y', 'z'].map((axis) => [axis, Math.floor(value.minimum[axis] / size)])),
    maximum: Object.fromEntries(['x', 'y', 'z'].map((axis) => [axis, Math.floor(value.maximum[axis] / size)])),
  };
}
function rangeCount(range) {
  return ['x', 'y', 'z'].reduce((count, axis) => count * (range.maximum[axis] - range.minimum[axis] + 1), 1);
}
function forEachCell(range, callback) {
  for (let x = range.minimum.x; x <= range.maximum.x; x += 1)
    for (let y = range.minimum.y; y <= range.maximum.y; y += 1)
      for (let z = range.minimum.z; z <= range.maximum.z; z += 1) callback(`${x}:${y}:${z}`);
}
function bounds(start, end) {
  return deepFreeze({
    minimum: { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), z: Math.min(start.z, end.z) },
    maximum: { x: Math.max(start.x, end.x), y: Math.max(start.y, end.y), z: Math.max(start.z, end.z) },
  });
}
function midpoint(a, b) { return scale(add(a, b), 0.5); }
function distance(a, b) { return a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : NaN; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function subtract(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function scale(a, factor) { return { x: a.x * factor, y: a.y * factor, z: a.z * factor }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function freezePoint(value) { return deepFreeze({ x: value.x, y: value.y, z: value.z }); }
function compareFeature(a, b) { return compareText(a.featureId, b.featureId); }
function compareText(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function canonicalArray(value) { return Array.isArray(value) ? [...new Set(value.filter(Boolean))].sort(compareText) : []; }
function canonicalId(value, label, kind) {
  const id = text(value);
  if (!id || (kind && !id.startsWith(`${kind}:`))) fail(`${label} must use ${kind}: identity.`, RangeError);
  return id;
}
function requireTopology(value) {
  if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) fail('canonical topology is required.');
  return value;
}
function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail(`${label} must be positive.`, RangeError);
  return number;
}
function text(value) { return String(value ?? '').trim(); }
function fail(message, Constructor = TypeError) { throw new Constructor(`TopologyEditTangencyClockingSnapIndex: ${message}`); }