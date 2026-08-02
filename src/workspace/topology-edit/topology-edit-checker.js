/**
 * Wave 3A pure topology checker.
 *
 * Detects canonical graph, pair-geometry, fitting, support/restraint, and rigid
 * findings in engineering coordinates. New Wave 3A findings are evidence only:
 * they contain no command payload and cannot mutate a draft or workspace.
 */
import {
  RESTRAINT_FAMILY_MAPPING,
  restraintFamily,
} from './support-restraint-family.js';

export const TOPOLOGY_ISSUE_KINDS = Object.freeze({
  ORPHAN_NODE: 'ORPHAN_NODE',
  ORPHAN_EDGE_ENDPOINT: 'ORPHAN_EDGE_ENDPOINT',
  SHORT_ELEMENT: 'SHORT_ELEMENT',
  BRANCH_DISCONNECTED: 'BRANCH_DISCONNECTED',
  SNAP_GAP: 'SNAP_GAP',
  OVERLAPPING_ELEMENTS: 'OVERLAPPING_ELEMENTS',
  PHYSICAL_CLEARANCE_CLASH: 'PHYSICAL_CLEARANCE_CLASH',
  CENTERLINE_CLASH: 'CENTERLINE_CLASH',
  PIPE_BACKTRACK: 'PIPE_BACKTRACK',
  BEND_WITHOUT_DIRECTION_CHANGE: 'BEND_WITHOUT_DIRECTION_CHANGE',
  RIGHT_ANGLE_WITHOUT_BEND: 'RIGHT_ANGLE_WITHOUT_BEND',
  UNDEFINED_KINK: 'UNDEFINED_KINK',
  MULTIWAY_WITHOUT_JUNCTION: 'MULTIWAY_WITHOUT_JUNCTION',
  JUNCTION_WITHOUT_MULTIWAY: 'JUNCTION_WITHOUT_MULTIWAY',
  BEND_AT_JUNCTION: 'BEND_AT_JUNCTION',
  ORPHAN_SUPPORT: 'ORPHAN_SUPPORT',
  UNKNOWN_RESTRAINT_FAMILY: 'UNKNOWN_RESTRAINT_FAMILY',
  UNRESOLVED_RESTRAINT_DIRECTION: 'UNRESOLVED_RESTRAINT_DIRECTION',
  ORPHAN_RIGID: 'ORPHAN_RIGID',
});

export function createTopologyIssue(kind, severity, target = {}, message = '') {
  if (!TOPOLOGY_ISSUE_KINDS[kind]) throw new RangeError(`Unknown topology issue kind ${kind}.`);
  const nodeIds = sorted(target.nodeIds || []);
  const edgeIds = sorted(target.edgeIds || (target.edgeId ? [target.edgeId] : []));
  const identity = sorted([
    ...nodeIds, ...edgeIds, target.junctionId, target.supportId,
    target.restraintId, target.rigidId,
  ].filter(Boolean));
  return Object.freeze({
    id: `issue:${kind}:${identity.join(':') || 'model'}`,
    kind,
    severity,
    nodeIds: Object.freeze(nodeIds),
    edgeId: target.edgeId || edgeIds[0] || null,
    edgeIds: Object.freeze(edgeIds),
    junctionId: target.junctionId || null,
    supportId: target.supportId || null,
    restraintId: target.restraintId || null,
    rigidId: target.rigidId || null,
    message,
    suggestedAutofix: target.suggestedAutofix || null,
    distanceMm: finiteNumber(target.distanceMm),
    angleDeg: finiteNumber(target.angleDeg),
  });
}

export function sortedTopologyIds(values = []) {
  return sorted(values.filter(Boolean));
}

function sorted(values) {
  return [...new Set(values.map((value) => String(value)))].sort((a, b) => a.localeCompare(b));
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function checkCanonicalTopology(canonical, options = {}) {
  if (!Array.isArray(canonical?.nodes) || !Array.isArray(canonical?.edges)) {
    return Object.freeze([]);
  }
  const graph = buildGraph(canonical);
  const issues = [
    ...baseGraphIssues(canonical, graph, options),
    ...extendedTopologyIssues(canonical, graph, options),
  ].sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze(issues);
}

function buildGraph(canonical) {
  const nodesById = new Map(canonical.nodes.map((node) => [node.id, node]));
  const incident = new Map(canonical.nodes.map((node) => [node.id, []]));
  for (const edge of canonical.edges) {
    if (incident.has(edge.fromNodeId)) incident.get(edge.fromNodeId).push(edge);
    if (incident.has(edge.toNodeId)) incident.get(edge.toNodeId).push(edge);
  }
  for (const edges of incident.values()) edges.sort((a, b) => a.id.localeCompare(b.id));
  return {
    nodesById,
    incident,
    degree: new Map([...incident].map(([id, edges]) => [id, edges.length])),
  };
}

function baseGraphIssues(canonical, graph, options) {
  const shortThreshold = positive(options.shortElementThresholdMm, 6);
  const issues = [];
  for (const edge of canonical.edges) {
    const from = graph.nodesById.get(edge.fromNodeId);
    const to = graph.nodesById.get(edge.toNodeId);
    if (!from || !to) {
      issues.push(createTopologyIssue('ORPHAN_EDGE_ENDPOINT', 'HIGH', {
        edgeId: edge.id,
      }, `Edge ${edge.id} references a missing node.`));
      continue;
    }
    const lengthMm = distance(from.position, to.position);
    if (lengthMm > 0 && lengthMm <= shortThreshold) {
      issues.push(createTopologyIssue('SHORT_ELEMENT', 'MEDIUM', {
        edgeId: edge.id,
        nodeIds: [edge.fromNodeId, edge.toNodeId],
        distanceMm: lengthMm,
      }, `Edge ${edge.id} is ${lengthMm.toFixed(2)}mm long.`));
    }
  }
  for (const node of canonical.nodes) {
    if ((graph.degree.get(node.id) || 0) === 0) {
      issues.push(createTopologyIssue('ORPHAN_NODE', 'MEDIUM', {
        nodeIds: [node.id],
      }, `Node ${node.id} has no incident edge.`));
    }
  }
  issues.push(...connectivityIssues(canonical, graph, options));
  return issues;
}

function connectivityIssues(canonical, graph, options) {
  const tolerance = positive(options.snapGapToleranceMm, 25);
  const components = connectedComponents(canonical.nodes.map((node) => node.id), canonical.edges);
  const largest = [...components].sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))[0] || [];
  const componentByNode = new Map();
  components.forEach((nodes, index) => nodes.forEach((id) => componentByNode.set(id, index)));
  const issues = components.filter((nodes) => nodes.length && nodes !== largest).map((nodes) => (
    createTopologyIssue('BRANCH_DISCONNECTED', 'MEDIUM', { nodeIds: nodes },
      `Isolated branch of ${nodes.length} node(s) is disconnected.`)
  ));
  const open = canonical.nodes.filter((node) => (graph.degree.get(node.id) || 0) === 1);
  for (let left = 0; left < open.length; left += 1) {
    for (let right = left + 1; right < open.length; right += 1) {
      const a = open[left]; const b = open[right];
      if (componentByNode.get(a.id) === componentByNode.get(b.id)) continue;
      const gap = distance(a.position, b.position);
      if (gap > 0 && gap <= tolerance) {
        issues.push(createTopologyIssue('SNAP_GAP', 'HIGH', {
          nodeIds: [a.id, b.id],
          distanceMm: gap,
          suggestedAutofix: 'MERGE_NODES',
        }, `Open endpoints ${a.id} and ${b.id} are ${gap.toFixed(2)}mm apart.`));
      }
    }
  }
  return issues;
}

export function applyFixForIssue(canonical, finding) {
  if (finding.kind !== 'SNAP_GAP' || finding.suggestedAutofix !== 'MERGE_NODES') return null;
  const [keepId, mergeId] = finding.nodeIds;
  const keep = canonical.nodes.find((node) => node.id === keepId);
  if (!keep) return null;
  return {
    ...canonical,
    nodes: canonical.nodes.map((node) => (
      node.id === mergeId ? { ...node, position: keep.position } : node
    )),
  };
}

export function planSafeAutofix(canonical, findings, options = {}) {
  let working = canonical;
  let current = checkCanonicalTopology(working, options);
  const applied = [];
  const rejected = [];
  for (const finding of findings) {
    const candidate = applyFixForIssue(working, finding);
    if (!candidate) {
      rejected.push(Object.freeze({ issueId: finding.id, reason: 'NO_SAFE_AUTOFIX' }));
      continue;
    }
    const next = checkCanonicalTopology(candidate, options);
    const unresolved = next.some((row) => row.id === finding.id);
    if (unresolved || next.length > current.length) {
      rejected.push(Object.freeze({
        issueId: finding.id,
        reason: unresolved ? 'ISSUE_NOT_RESOLVED' : 'WOULD_WORSEN_TOPOLOGY',
      }));
      continue;
    }
    applied.push(Object.freeze({
      issueId: finding.id,
      kind: finding.kind,
      suggestedAutofix: finding.suggestedAutofix,
    }));
    working = candidate;
    current = next;
  }
  return Object.freeze({
    finalTopology: working,
    applied: Object.freeze(applied),
    rejected: Object.freeze(rejected),
  });
}

function connectedComponents(nodeIds, edges) {
  const neighbors = new Map(nodeIds.map((id) => [id, []]));
  for (const edge of edges) {
    if (!neighbors.has(edge.fromNodeId) || !neighbors.has(edge.toNodeId)) continue;
    neighbors.get(edge.fromNodeId).push(edge.toNodeId);
    neighbors.get(edge.toNodeId).push(edge.fromNodeId);
  }
  const seen = new Set();
  const groups = [];
  for (const id of sortedTopologyIds(nodeIds)) {
    if (seen.has(id)) continue;
    const queue = [id];
    const group = [];
    seen.add(id);
    while (queue.length) {
      const current = queue.shift();
      group.push(current);
      for (const next of sortedTopologyIds(neighbors.get(current))) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    groups.push(sortedTopologyIds(group));
  }
  return groups;
}

const KNOWN_FAMILIES = new Set(Object.values(RESTRAINT_FAMILY_MAPPING));
const DIRECTIONAL_FAMILIES = new Set([
  'REST', 'HOLDOWN', 'GUIDE', 'LINE_STOP', 'LIMIT', 'U_BOLT',
  'SHOE', 'TRUNNION', 'HANGER', 'SPRING_HANGER', 'CAN', 'SPRING_WARNING',
]);

function extendedTopologyIssues(canonical, graph, options = {}) {
  const policy = {
    overlapToleranceMm: nonNegative(options.overlapToleranceMm, 0.1),
    centerlineClashToleranceMm: nonNegative(options.centerlineClashToleranceMm, 0.5),
    physicalClearanceMm: nonNegative(options.physicalClearanceMm, 0),
    angularToleranceDeg: nonNegative(options.angularToleranceDeg, 5),
  };
  return [
    ...pairGeometryIssues(canonical, graph, policy),
    ...fittingIssues(canonical, graph, policy),
    ...attachmentIssues(canonical, graph),
  ];
}

function pairGeometryIssues(canonical, graph, policy) {
  const edges = canonical.edges.filter((edge) => segment(edge, graph));
  const issues = [];
  for (let left = 0; left < edges.length; left += 1) {
    for (let right = left + 1; right < edges.length; right += 1) {
      const a = edges[left]; const b = edges[right];
      if (shareNode(a, b)) continue;
      const aSegment = segment(a, graph); const bSegment = segment(b, graph);
      const separation = segmentDistance(aSegment.start, aSegment.end, bSegment.start, bSegment.end);
      const overlap = collinearOverlap(aSegment, bSegment, policy.overlapToleranceMm);
      if (overlap > policy.overlapToleranceMm) {
        issues.push(pairIssue('OVERLAPPING_ELEMENTS', 'HIGH', a, b, overlap,
          `Edges ${a.id} and ${b.id} overlap by ${overlap.toFixed(2)}mm.`));
      }
      if (separation <= policy.centerlineClashToleranceMm) {
        issues.push(pairIssue('CENTERLINE_CLASH', 'HIGH', a, b, separation,
          `Edge centerlines are ${separation.toFixed(2)}mm apart.`));
      }
      const required = requiredPhysicalClearance(a, b, policy.physicalClearanceMm);
      if (required !== null && separation < required) {
        issues.push(pairIssue('PHYSICAL_CLEARANCE_CLASH', 'HIGH', a, b, separation,
          `Physical clearance ${separation.toFixed(2)}mm is below ${required.toFixed(2)}mm.`));
      }
    }
  }
  return issues;
}

function fittingIssues(canonical, graph, policy) {
  const issues = [];
  const junctionNodes = new Set((canonical.junctions || []).flatMap((row) => row.nodeIds || []));
  for (const node of canonical.nodes) {
    const edges = graph.incident.get(node.id) || [];
    if (edges.length === 2) issues.push(...twoWayIssues(node, edges, graph, policy));
    if (edges.length >= 3 && !junctionNodes.has(node.id)) {
      issues.push(createTopologyIssue('MULTIWAY_WITHOUT_JUNCTION', 'HIGH', {
        nodeIds: [node.id], edgeIds: edges.map((edge) => edge.id),
      }, `Multiway node ${node.id} has no junction definition.`));
    }
    for (const edge of edges.filter(isBend)) {
      if (edges.length >= 3) {
        issues.push(createTopologyIssue('BEND_AT_JUNCTION', 'HIGH', {
          nodeIds: [node.id], edgeId: edge.id,
        }, `Bend ${edge.id} is attached at multiway node ${node.id}.`));
      }
    }
  }
  for (const edge of canonical.edges.filter(isBend)) {
    const change = finite(edge.directionChangeDeg ?? edge.bendAngleDeg ?? edge.angleDeg);
    if (change !== null && Math.abs(change) <= policy.angularToleranceDeg) {
      issues.push(createTopologyIssue('BEND_WITHOUT_DIRECTION_CHANGE', 'MEDIUM', {
        edgeId: edge.id, angleDeg: change,
      }, `Bend ${edge.id} has no meaningful direction change.`));
    }
  }
  for (const junction of canonical.junctions || []) {
    const maxDegree = Math.max(0, ...(junction.nodeIds || []).map((id) => graph.degree.get(id) || 0));
    if (maxDegree < 3) {
      issues.push(createTopologyIssue('JUNCTION_WITHOUT_MULTIWAY', 'MEDIUM', {
        junctionId: junction.id, nodeIds: junction.nodeIds || [],
      }, `Junction ${junction.id} does not resolve to a multiway node.`));
    }
  }
  return issues;
}

function twoWayIssues(node, edges, graph, policy) {
  const directions = edges.map((edge) => directionFromNode(edge, node.id, graph));
  if (directions.some((direction) => !direction)) return [];
  const angle = angleDegrees(directions[0], directions[1]);
  const target = { nodeIds: [node.id], edgeIds: edges.map((edge) => edge.id), angleDeg: angle };
  const bendDefined = edges.some(isBend) || edges.some((edge) => edge.bendDefinition);
  if (angle <= policy.angularToleranceDeg && edges.every(isPipe)) {
    return [createTopologyIssue('PIPE_BACKTRACK', 'HIGH', target,
      `Pipe route backtracks at node ${node.id}.`)];
  }
  if (Math.abs(angle - 90) <= policy.angularToleranceDeg && !bendDefined) {
    return [createTopologyIssue('RIGHT_ANGLE_WITHOUT_BEND', 'HIGH', target,
      `Right-angle turn at ${node.id} has no bend definition.`)];
  }
  if (angle > policy.angularToleranceDeg && angle < 180 - policy.angularToleranceDeg
      && Math.abs(angle - 90) > policy.angularToleranceDeg && !bendDefined) {
    return [createTopologyIssue('UNDEFINED_KINK', 'MEDIUM', target,
      `Direction change at ${node.id} has no fitting definition.`)];
  }
  return [];
}

function attachmentIssues(canonical, graph) {
  const issues = [];
  for (const support of canonical.supports || []) {
    if (!support.nodeId || !graph.nodesById.has(support.nodeId) || support.resolved === false) {
      issues.push(createTopologyIssue('ORPHAN_SUPPORT', 'HIGH', {
        supportId: support.id, nodeIds: support.nodeId ? [support.nodeId] : [],
      }, `Support ${support.id} has no resolved host node.`));
    }
    restraintRows(support).forEach((restraint, index) => {
      const family = restraintFamily(restraint);
      const restraintId = restraint.id || restraint.restraintId || `${support.id}:restraint:${index}`;
      if (!KNOWN_FAMILIES.has(family)) {
        issues.push(createTopologyIssue('UNKNOWN_RESTRAINT_FAMILY', 'MEDIUM', {
          supportId: support.id, restraintId,
        }, `Restraint ${restraintId} has unknown family ${family || '(blank)'}.`));
      } else if (DIRECTIONAL_FAMILIES.has(family) && !hasResolvedDirection(restraint)) {
        issues.push(createTopologyIssue('UNRESOLVED_RESTRAINT_DIRECTION', 'HIGH', {
          supportId: support.id, restraintId,
        }, `Restraint ${restraintId} has unresolved direction evidence.`));
      }
    });
  }
  for (const rigid of canonical.rigids || []) {
    const nodeIds = rigidNodeIds(rigid);
    if (!nodeIds.length || nodeIds.some((nodeId) => !graph.nodesById.has(nodeId))) {
      issues.push(createTopologyIssue('ORPHAN_RIGID', 'HIGH', {
        rigidId: rigid.id, nodeIds,
      }, `Rigid ${rigid.id} references a missing node.`));
    }
  }
  return issues;
}

function pairIssue(kind, severity, a, b, distanceMm, message) {
  const edgeIds = sortedTopologyIds([a.id, b.id]);
  return createTopologyIssue(kind, severity, { edgeId: edgeIds[0], edgeIds, distanceMm }, message);
}

function segment(edge, graph) {
  const start = graph.nodesById.get(edge.fromNodeId)?.position;
  const end = graph.nodesById.get(edge.toNodeId)?.position;
  return finitePoint(start) && finitePoint(end) ? { start, end } : null;
}

function directionFromNode(edge, nodeId, graph) {
  const otherId = edge.fromNodeId === nodeId ? edge.toNodeId : edge.fromNodeId;
  const origin = graph.nodesById.get(nodeId)?.position;
  const other = graph.nodesById.get(otherId)?.position;
  return finitePoint(origin) && finitePoint(other) ? normalize(subtract(other, origin)) : null;
}

function requiredPhysicalClearance(a, b, minimum) {
  const radiusA = explicitRadius(a); const radiusB = explicitRadius(b);
  if (radiusA === null || radiusB === null) return null;
  return radiusA + radiusB + nonNegative(a.insulationThicknessMm, 0)
    + nonNegative(b.insulationThicknessMm, 0) + minimum;
}

function explicitRadius(edge) {
  const radius = finite(edge.outsideRadiusMm ?? edge.physicalRadiusMm);
  if (radius !== null && radius > 0) return radius;
  const diameter = finite(edge.outsideDiameterMm ?? edge.outerDiameterMm ?? edge.physicalDiameterMm);
  return diameter !== null && diameter > 0 ? diameter / 2 : null;
}

function hasResolvedDirection(restraint) {
  if (restraint.directionStatus === 'UNRESOLVED' || restraint.resolvedDirection === false) return false;
  const value = restraint.direction ?? restraint.axis ?? restraint.directionToken ?? restraint.vector;
  if (typeof value === 'string') return value.trim().length > 0;
  return finitePoint(value);
}

function restraintRows(support) {
  if (Array.isArray(support.restraints)) return support.restraints;
  if (Array.isArray(support.restraint?.restraints)) return support.restraint.restraints;
  if (Array.isArray(support.restraint)) return support.restraint;
  return support.restraint && typeof support.restraint === 'object' ? [support.restraint] : [];
}

function rigidNodeIds(rigid) {
  return sortedTopologyIds(rigid.nodeIds || [rigid.fromNodeId, rigid.toNodeId, rigid.nodeId]);
}

function isBend(edge) {
  return /BEND|ELBOW/.test(String(edge.entityType || edge.type || edge.fittingType || '').toUpperCase());
}

function isPipe(edge) {
  return /PIPE|TUBE/.test(String(edge.entityType || edge.type || 'PIPE').toUpperCase());
}

function shareNode(a, b) {
  return a.fromNodeId === b.fromNodeId || a.fromNodeId === b.toNodeId
    || a.toNodeId === b.fromNodeId || a.toNodeId === b.toNodeId;
}

function collinearOverlap(a, b, tolerance) {
  const axis = normalize(subtract(a.end, a.start));
  if (!axis) return 0;
  if (magnitude(cross(subtract(b.start, a.start), axis)) > tolerance
      || magnitude(cross(subtract(b.end, a.start), axis)) > tolerance) return 0;
  const lengthA = distance(a.start, a.end);
  const p1 = dot(subtract(b.start, a.start), axis);
  const p2 = dot(subtract(b.end, a.start), axis);
  return Math.max(0, Math.min(lengthA, Math.max(p1, p2)) - Math.max(0, Math.min(p1, p2)));
}

function segmentDistance(p1, q1, p2, q2) {
  const d1 = subtract(q1, p1); const d2 = subtract(q2, p2); const r = subtract(p1, p2);
  const a = dot(d1, d1); const e = dot(d2, d2); const f = dot(d2, r);
  let s = 0; let t = 0;
  if (a <= 1e-12 && e <= 1e-12) return distance(p1, p2);
  if (a <= 1e-12) t = clamp(f / e);
  else {
    const c = dot(d1, r);
    if (e <= 1e-12) s = clamp(-c / a);
    else {
      const b = dot(d1, d2); const denominator = a * e - b * b;
      s = denominator ? clamp((b * f - c * e) / denominator) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a); }
    }
  }
  return distance(add(p1, scale(d1, s)), add(p2, scale(d2, t)));
}

function angleDegrees(a, b) {
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180 / Math.PI;
}
function finitePoint(value) {
  return value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))
    && Number.isFinite(Number(value.z ?? 0));
}
function subtract(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: (a.z || 0) + (b.z || 0) }; }
function scale(a, value) { return { x: a.x * value, y: a.y * value, z: (a.z || 0) * value }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + (a.z || 0) * (b.z || 0); }
function cross(a, b) {
  return {
    x: a.y * (b.z || 0) - (a.z || 0) * b.y,
    y: (a.z || 0) * b.x - a.x * (b.z || 0),
    z: a.x * b.y - a.y * b.x,
  };
}
function magnitude(value) { return Math.hypot(value.x, value.y, value.z || 0); }
function normalize(value) { const length = magnitude(value); return length > 1e-12 ? scale(value, 1 / length) : null; }
function distance(a, b) { return magnitude(subtract(a, b)); }
function clamp(value) { return Math.max(0, Math.min(1, value)); }
function finite(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function nonNegative(value, fallback) {
  const parsed = finite(value);
  return parsed !== null && parsed >= 0 ? parsed : fallback;
}
function positive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
