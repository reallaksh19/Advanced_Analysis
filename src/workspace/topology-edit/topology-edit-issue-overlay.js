import { semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_ISSUE_OVERLAY_SCHEMA =
  'TopologyEditIssueOverlay.v1';

export function buildTopologyEditIssueOverlay({
  canonicalTopology,
  issues = [],
  suggestions = [],
} = {}) {
  assertCanonical(canonicalTopology);
  if (!Array.isArray(issues) || !Array.isArray(suggestions)) {
    throw new TypeError('Issue overlay inputs must be arrays.');
  }
  const context = buildContext(canonicalTopology);
  const suggestionsByIssue = new Map(
    suggestions
      .filter((row) => row?.issueId && row?.suggestionHash)
      .map((row) => [row.issueId, row]),
  );
  const entries = [];
  const unanchoredIssueIds = [];
  for (const issue of [...issues].sort(compareIssues)) {
    if (!issue?.id || !issue.kind) continue;
    const anchor = issueAnchor(issue, context);
    if (!anchor) {
      unanchoredIssueIds.push(issue.id);
      continue;
    }
    const suggestion = suggestionsByIssue.get(issue.id) ?? null;
    entries.push(freezeDeep({
      issueId: issue.id,
      kind: issue.kind,
      severity: normalizedSeverity(issue.severity),
      message: String(issue.message ?? ''),
      position: anchor.position,
      anchorSource: anchor.source,
      canonicalIds: issueCanonicalIds(issue),
      distanceMm: finiteOrNull(issue.distanceMm),
      angleDeg: finiteOrNull(issue.angleDeg),
      suggestionHash: suggestion?.suggestionHash ?? null,
      commandType: suggestion?.commandType ?? null,
    }));
  }
  const base = {
    schema: TOPOLOGY_EDIT_ISSUE_OVERLAY_SCHEMA,
    canonicalTopologyHash: canonicalTopology.canonicalTopologyHash ?? null,
    issueCount: issues.length,
    anchoredIssueCount: entries.length,
    entries,
    unanchoredIssueIds: [...unanchoredIssueIds].sort(),
  };
  return freezeDeep({
    ...base,
    overlayHash: semanticHash(base),
  });
}

export function topologyEditIssueTargetIds(issue) {
  if (!issue) return Object.freeze([]);
  return Object.freeze(issueCanonicalIds(issue));
}

function buildContext(canonical) {
  return {
    nodes: new Map((canonical.nodes ?? []).map((row) => [row.id, row])),
    edges: new Map((canonical.edges ?? []).map((row) => [row.id, row])),
    junctions: new Map((canonical.junctions ?? []).map((row) => [row.id, row])),
    supports: new Map((canonical.supports ?? []).map((row) => [row.id, row])),
    rigids: new Map((canonical.rigids ?? []).map((row) => [row.id, row])),
  };
}

function issueAnchor(issue, context) {
  const nodePoints = pointsForNodeIds(issue.nodeIds, context);
  if (nodePoints.length) return anchor('NODE_TARGETS', nodePoints);

  const edgePoints = pointsForEdges(issue.edgeIds, context);
  if (edgePoints.length) return anchor('EDGE_TARGETS', edgePoints);

  const junction = issue.junctionId
    ? context.junctions.get(issue.junctionId)
    : null;
  const junctionPoints = recordPoints(junction, context);
  if (junctionPoints.length) return anchor('JUNCTION_TARGET', junctionPoints);

  const support = issue.supportId ? context.supports.get(issue.supportId) : null;
  const supportPoints = recordPoints(support, context);
  if (supportPoints.length) return anchor('SUPPORT_TARGET', supportPoints);

  const rigid = issue.rigidId ? context.rigids.get(issue.rigidId) : null;
  const rigidPoints = recordPoints(rigid, context);
  if (rigidPoints.length) return anchor('RIGID_TARGET', rigidPoints);
  return null;
}

function pointsForNodeIds(nodeIds = [], context) {
  return sortedIds(nodeIds)
    .map((id) => context.nodes.get(id)?.position)
    .filter(finitePoint)
    .map(copyPoint);
}

function pointsForEdges(edgeIds = [], context) {
  const points = [];
  for (const id of sortedIds(edgeIds)) {
    const edge = context.edges.get(id);
    if (!edge) continue;
    const from = context.nodes.get(edge.fromNodeId)?.position;
    const to = context.nodes.get(edge.toNodeId)?.position;
    if (finitePoint(from) && finitePoint(to)) {
      points.push({
        x: (Number(from.x) + Number(to.x)) / 2,
        y: (Number(from.y) + Number(to.y)) / 2,
        z: (Number(from.z) + Number(to.z)) / 2,
      });
    }
  }
  return points;
}

function recordPoints(record, context) {
  if (!record) return [];
  const direct = [
    record.position,
    record.anchorPosition,
    record.centroid,
    record.location,
  ].filter(finitePoint).map(copyPoint);
  if (direct.length) return direct;
  const nodeIds = [
    ...(record.nodeIds ?? []),
    record.nodeId,
    record.attachmentNodeId,
    record.hostNodeId,
  ].filter(Boolean);
  return pointsForNodeIds(nodeIds, context);
}

function anchor(source, points) {
  const unique = uniquePoints(points);
  const count = unique.length;
  if (!count) return null;
  const total = unique.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y,
    z: sum.z + point.z,
  }), { x: 0, y: 0, z: 0 });
  return freezeDeep({
    source,
    position: {
      x: total.x / count,
      y: total.y / count,
      z: total.z / count,
    },
  });
}

function issueCanonicalIds(issue) {
  return sortedIds([
    ...(issue.nodeIds ?? []),
    ...(issue.edgeIds ?? []),
    issue.edgeId,
    issue.junctionId,
    issue.supportId,
    issue.restraintId,
    issue.rigidId,
  ]);
}

function uniquePoints(points) {
  const byKey = new Map();
  for (const point of points) {
    if (!finitePoint(point)) continue;
    const copied = copyPoint(point);
    byKey.set(`${copied.x}:${copied.y}:${copied.z}`, copied);
  }
  return [...byKey.values()].sort((left, right) => (
    left.x - right.x || left.y - right.y || left.z - right.z
  ));
}

function normalizedSeverity(value) {
  const token = String(value ?? 'LOW').trim().toUpperCase();
  return ['HIGH', 'MEDIUM', 'LOW'].includes(token) ? token : 'LOW';
}

function compareIssues(left, right) {
  return String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
}

function sortedIds(values = []) {
  return [...new Set(values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function finitePoint(value) {
  return value && [value.x, value.y, value.z]
    .every((row) => Number.isFinite(Number(row)));
}

function copyPoint(value) {
  return { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
}

function finiteOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assertCanonical(canonical) {
  if (!canonical || !Array.isArray(canonical.nodes)
    || !Array.isArray(canonical.edges)) {
    throw new TypeError('Issue overlays require a canonical topology.');
  }
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
}
