import {
  createTopologyEditSnapCandidate,
  normalizeTopologyEditSnapCandidates,
  TOPOLOGY_EDIT_SNAP_EVIDENCE,
} from './topology-edit-snap-candidates.js';
import { resolveTopologyEditSnap } from './topology-edit-snap-resolver.js';
import {
  finiteTopologyEditPoint,
  nonNegativeTopologyEditNumber,
  positiveTopologyEditNumber,
  requiredTopologyEditText,
} from './topology-edit-interaction-values.js';

const AXES = Object.freeze({
  X: Object.freeze({ x: 1, y: 0, z: 0 }),
  Y: Object.freeze({ x: 0, y: 1, z: 0 }),
  Z: Object.freeze({ x: 0, y: 0, z: 1 }),
});

export function collectTopologyEditSnapCandidates(input = {}) {
  const topology = requireTopology(input.topology);
  const basisHash = requiredTopologyEditText(
    input.basisHash ?? topology.canonicalTopologyHash,
    'basisHash',
  );
  const nodeId = requiredNodeId(input.nodeId);
  const anchorPosition = finiteTopologyEditPoint(
    input.anchorPosition,
    'anchorPosition',
  );
  const pointerPoint = finiteTopologyEditPoint(
    input.pointerPoint,
    'pointerPoint',
  );
  const transformMode = normalizeMode(input.transformMode);
  const gridSizeMm = positiveTopologyEditNumber(
    input.gridSizeMm ?? 25,
    'gridSizeMm',
  );
  const nodes = new Map(topology.nodes.map((node) => [
    requiredNodeId(node?.id),
    finiteTopologyEditPoint(node.position, `${node.id}.position`),
  ]));
  if (!nodes.has(nodeId)) {
    throw new RangeError(`Snap source node ${nodeId} is unavailable.`);
  }
  const candidates = [];
  addExplicitTarget(candidates, input.explicitTarget, basisHash);
  addEndpointCandidates(candidates, nodes, nodeId, basisHash);
  addDatumCandidates(candidates, topology, basisHash);
  addEdgeCandidates(candidates, topology.edges, nodes, pointerPoint, basisHash);
  addConstraintProjectionCandidates(
    candidates,
    nodes,
    topology.edges,
    anchorPosition,
    transformMode,
    basisHash,
  );
  candidates.push(createTopologyEditSnapCandidate({
    basisHash,
    evidenceType: TOPOLOGY_EDIT_SNAP_EVIDENCE.GRID,
    position: gridPoint(pointerPoint, anchorPosition, transformMode, gridSizeMm),
    sourceEvidenceId: `grid:${gridSizeMm}`,
    label: `${gridSizeMm} mm grid`,
  }));
  return normalizeTopologyEditSnapCandidates(candidates);
}

export function resolveTopologyEditSceneSnap(input = {}) {
  const topology = requireTopology(input.topology);
  const basisHash = requiredTopologyEditText(
    input.basisHash ?? topology.canonicalTopologyHash,
    'basisHash',
  );
  const pointerPoint = finiteTopologyEditPoint(
    input.pointerPoint,
    'pointerPoint',
  );
  const toleranceMm = nonNegativeTopologyEditNumber(
    input.toleranceMm ?? 25,
    'toleranceMm',
  );
  return resolveTopologyEditSnap({
    basisHash,
    pointerPoint,
    toleranceMm,
    candidates: collectTopologyEditSnapCandidates({ ...input, basisHash, pointerPoint }),
  });
}

function addExplicitTarget(candidates, target, basisHash) {
  if (!target) return;
  candidates.push(createTopologyEditSnapCandidate({
    basisHash,
    evidenceType: TOPOLOGY_EDIT_SNAP_EVIDENCE.EXPLICIT_TARGET,
    position: target.position,
    targetCanonicalId: target.targetCanonicalId,
    sourceEvidenceId: target.sourceEvidenceId,
    label: target.label ?? 'Explicit target',
  }));
}

function addEndpointCandidates(candidates, nodes, nodeId, basisHash) {
  for (const [targetCanonicalId, position] of [...nodes.entries()].sort(compareEntry)) {
    if (targetCanonicalId === nodeId) continue;
    candidates.push(createTopologyEditSnapCandidate({
      basisHash,
      evidenceType: TOPOLOGY_EDIT_SNAP_EVIDENCE.ENDPOINT,
      position,
      targetCanonicalId,
      sourceEvidenceId: `${targetCanonicalId}:endpoint`,
      label: 'Endpoint',
    }));
  }
}

function addDatumCandidates(candidates, topology, basisHash) {
  const rows = [...(topology.datums ?? []), ...(topology.sourceDatums ?? [])];
  for (const datum of rows) {
    const targetCanonicalId = requiredDatumId(datum?.id);
    candidates.push(createTopologyEditSnapCandidate({
      basisHash,
      evidenceType: TOPOLOGY_EDIT_SNAP_EVIDENCE.SOURCE_DATUM,
      position: datum.position,
      targetCanonicalId,
      sourceEvidenceId: datum.sourceEvidenceId ?? targetCanonicalId,
      label: datum.label ?? 'Source datum',
    }));
  }
}

function addEdgeCandidates(candidates, edges, nodes, pointerPoint, basisHash) {
  for (const edge of normalizedEdges(edges)) {
    const start = nodes.get(edge.fromNodeId);
    const end = nodes.get(edge.toNodeId);
    if (!start || !end) continue;
    const middle = midpoint(start, end);
    const centerline = closestSegmentPoint(pointerPoint, start, end);
    candidates.push(createTopologyEditSnapCandidate({
      basisHash,
      evidenceType: TOPOLOGY_EDIT_SNAP_EVIDENCE.MIDPOINT,
      position: middle,
      targetCanonicalId: edge.id,
      sourceEvidenceId: `${edge.id}:midpoint`,
      label: 'Edge midpoint',
    }));
    if (distance(centerline, middle) > 1e-9) {
      candidates.push(createTopologyEditSnapCandidate({
        basisHash,
        evidenceType: TOPOLOGY_EDIT_SNAP_EVIDENCE.CENTERLINE,
        position: centerline,
        targetCanonicalId: edge.id,
        sourceEvidenceId: `${edge.id}:centerline`,
        label: 'Edge centerline',
      }));
    }
  }
}

function addConstraintProjectionCandidates(
  candidates,
  nodes,
  edges,
  anchor,
  mode,
  basisHash,
) {
  if (mode === 'FREE') return;
  const evidenceType = mode.startsWith('AXIS_')
    ? TOPOLOGY_EDIT_SNAP_EVIDENCE.AXIS_PROJECTION
    : TOPOLOGY_EDIT_SNAP_EVIDENCE.PLANE_PROJECTION;
  const sourcePoints = [...nodes.entries()].map(([id, position]) => ({ id, position }));
  for (const edge of normalizedEdges(edges)) {
    const start = nodes.get(edge.fromNodeId);
    const end = nodes.get(edge.toNodeId);
    if (start && end) sourcePoints.push({ id: `${edge.id}:midpoint`, position: midpoint(start, end) });
  }
  for (const source of sourcePoints.sort((a, b) => a.id.localeCompare(b.id))) {
    candidates.push(createTopologyEditSnapCandidate({
      basisHash,
      evidenceType,
      position: projectToConstraint(source.position, anchor, mode),
      sourceEvidenceId: source.id,
      label: mode.startsWith('AXIS_') ? 'Axis projection' : 'Plane projection',
    }));
  }
}

function projectToConstraint(point, anchor, mode) {
  if (mode.startsWith('AXIS_')) {
    const axis = AXES[mode.slice(-1)];
    const delta = subtract(point, anchor);
    const distanceMm = dot(delta, axis);
    return add(anchor, scale(axis, distanceMm));
  }
  const result = { ...point };
  if (mode === 'PLANE_XY') result.z = anchor.z;
  if (mode === 'PLANE_YZ') result.x = anchor.x;
  if (mode === 'PLANE_XZ') result.y = anchor.y;
  return result;
}

function gridPoint(point, anchor, mode, size) {
  const rounded = {
    x: Math.round(point.x / size) * size,
    y: Math.round(point.y / size) * size,
    z: Math.round(point.z / size) * size,
  };
  if (mode === 'AXIS_X') return { x: rounded.x, y: anchor.y, z: anchor.z };
  if (mode === 'AXIS_Y') return { x: anchor.x, y: rounded.y, z: anchor.z };
  if (mode === 'AXIS_Z') return { x: anchor.x, y: anchor.y, z: rounded.z };
  if (mode === 'PLANE_XY') rounded.z = anchor.z;
  if (mode === 'PLANE_YZ') rounded.x = anchor.x;
  if (mode === 'PLANE_XZ') rounded.y = anchor.y;
  return rounded;
}

function closestSegmentPoint(point, start, end) {
  const segment = subtract(end, start);
  const lengthSquared = dot(segment, segment);
  if (!(lengthSquared > 0)) return start;
  const t = Math.max(0, Math.min(1, dot(subtract(point, start), segment) / lengthSquared));
  return add(start, scale(segment, t));
}

function normalizedEdges(values) {
  if (!Array.isArray(values)) throw new TypeError('Topology edges must be an array.');
  return values.map((edge) => ({
    id: requiredEdgeId(edge?.id),
    fromNodeId: requiredNodeId(edge?.fromNodeId),
    toNodeId: requiredNodeId(edge?.toNodeId),
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function requireTopology(value) {
  if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new TypeError('Current canonical topology is required for snap collection.');
  }
  return value;
}
function normalizeMode(value) {
  const mode = String(value ?? 'FREE').trim().toUpperCase();
  if (!['FREE', 'AXIS_X', 'AXIS_Y', 'AXIS_Z', 'PLANE_XY', 'PLANE_YZ', 'PLANE_XZ'].includes(mode)) {
    throw new RangeError(`Unsupported transform mode ${mode}.`);
  }
  return mode;
}
function requiredNodeId(value) {
  const id = requiredTopologyEditText(value, 'nodeId');
  if (!/^node:[^\s]+$/.test(id)) throw new TypeError('nodeId must be exact canonical identity.');
  return id;
}
function requiredEdgeId(value) {
  const id = requiredTopologyEditText(value, 'edgeId');
  if (!/^edge:[^\s]+$/.test(id)) throw new TypeError('edgeId must be exact canonical identity.');
  return id;
}
function requiredDatumId(value) {
  const id = requiredTopologyEditText(value, 'datumId');
  if (!/^datum:[^\s]+$/.test(id)) throw new TypeError('datumId must be exact canonical identity.');
  return id;
}
function midpoint(left, right) {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, z: (left.z + right.z) / 2 };
}
function subtract(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function add(left, right) { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function scale(point, factor) { return { x: point.x * factor, y: point.y * factor, z: point.z * factor }; }
function dot(left, right) { return left.x * right.x + left.y * right.y + left.z * right.z; }
function distance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z); }
function compareEntry(left, right) { return left[0].localeCompare(right[0]); }
