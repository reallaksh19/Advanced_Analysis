/**
 * Topology Edit Draft — Phase 5 Topology Rule Checker
 *
 * A bounded subset of the source's 6 rule groups, operating on the real
 * CanonicalTopology.v1-shaped draft (topology-edit-source-adapter.js), not a
 * separate nodes/elements/supports shape — this is what makes the issue
 * objects here consistent with what the grouper/callout/autofix modules
 * consume (the prior version of this file used a different shape than either
 * of those, so they were never actually compatible when run together).
 *
 * Ported rules: ORPHAN_NODE, ORPHAN_EDGE_ENDPOINT, SHORT_ELEMENT,
 * BRANCH_DISCONNECTED, SNAP_GAP. The remaining rule groups
 * (pairGeometryIssues, fittingIssues, most of attachmentIssues) are phase 2 —
 * see futureplan.md item 2.
 */

export const TOPOLOGY_ISSUE_KINDS = Object.freeze({
  ORPHAN_NODE: 'ORPHAN_NODE',
  ORPHAN_EDGE_ENDPOINT: 'ORPHAN_EDGE_ENDPOINT',
  SHORT_ELEMENT: 'SHORT_ELEMENT',
  BRANCH_DISCONNECTED: 'BRANCH_DISCONNECTED',
  SNAP_GAP: 'SNAP_GAP',
});

export function checkCanonicalTopology(canonical, options = {}) {
  if (!canonical?.nodes || !canonical?.edges) return Object.freeze([]);
  const shortElementThresholdMm = Number.isFinite(options.shortElementThresholdMm) ? options.shortElementThresholdMm : 6;
  const snapGapToleranceMm = Number.isFinite(options.snapGapToleranceMm) ? options.snapGapToleranceMm : 25;

  const nodesById = new Map(canonical.nodes.map((node) => [node.id, node]));
  const degree = new Map(canonical.nodes.map((node) => [node.id, 0]));
  const issues = [];

  canonical.edges.forEach((edge) => {
    const from = nodesById.get(edge.fromNodeId);
    const to = nodesById.get(edge.toNodeId);
    if (!from || !to) {
      issues.push(makeIssue('ORPHAN_EDGE_ENDPOINT', 'HIGH', { edgeId: edge.id, nodeIds: [] },
        `Edge ${edge.id} references a node that no longer exists.`, null));
      return;
    }
    degree.set(edge.fromNodeId, (degree.get(edge.fromNodeId) || 0) + 1);
    degree.set(edge.toNodeId, (degree.get(edge.toNodeId) || 0) + 1);
    const length = distance(from.position, to.position);
    if (length > 0 && length <= shortElementThresholdMm) {
      issues.push(makeIssue('SHORT_ELEMENT', 'MEDIUM', { edgeId: edge.id, nodeIds: [edge.fromNodeId, edge.toNodeId] },
        `Edge ${edge.id} is ${length.toFixed(2)}mm long (<= ${shortElementThresholdMm}mm threshold).`, null));
    }
  });
  (canonical.junctions || []).forEach((junction) => {
    junction.nodeIds.forEach((nodeId) => degree.set(nodeId, (degree.get(nodeId) || 0) + 1));
  });

  canonical.nodes.forEach((node) => {
    if ((degree.get(node.id) || 0) === 0) {
      issues.push(makeIssue('ORPHAN_NODE', 'MEDIUM', { nodeIds: [node.id] },
        `Node ${node.id} has no incident edges or junctions.`, null));
    }
  });

  const components = buildConnectedComponents(canonical.nodes.map((node) => node.id), canonical.edges);
  const largest = components.reduce((best, component) => (component.length > best.length ? component : best), []);
  const componentIndexByNode = new Map();
  components.forEach((component, index) => component.forEach((nodeId) => componentIndexByNode.set(nodeId, index)));
  if (components.length > 1) {
    components.forEach((component) => {
      if (component !== largest && component.length) {
        issues.push(makeIssue('BRANCH_DISCONNECTED', 'MEDIUM', { nodeIds: component },
          `Isolated branch of ${component.length} node(s) is disconnected from the main network.`, null));
      }
    });
  }

  const openEndpoints = canonical.nodes.filter((node) => (degree.get(node.id) || 0) === 1);
  for (let i = 0; i < openEndpoints.length; i += 1) {
    for (let j = i + 1; j < openEndpoints.length; j += 1) {
      const a = openEndpoints[i];
      const b = openEndpoints[j];
      if (componentIndexByNode.get(a.id) === componentIndexByNode.get(b.id)) continue;
      const gap = distance(a.position, b.position);
      if (gap > 0 && gap <= snapGapToleranceMm) {
        issues.push(makeIssue('SNAP_GAP', 'HIGH', { nodeIds: [a.id, b.id] },
          `Open endpoints ${a.id} and ${b.id} are ${gap.toFixed(2)}mm apart (<= ${snapGapToleranceMm}mm).`, 'MERGE_NODES', gap));
      }
    }
  }

  return Object.freeze(issues.sort((left, right) => left.id.localeCompare(right.id)));
}

/**
 * Applies the fix for a single issue against a canonical topology, returning
 * a new candidate topology (or null if this issue kind has no confident
 * automatic fix). Only SNAP_GAP has one here: co-locating two open endpoints
 * is unambiguous. SHORT_ELEMENT/ORPHAN_NODE/BRANCH_DISCONNECTED are flagged
 * for manual review rather than guessed at — the source's own fix for
 * SHORT_ELEMENT, for example, requires reasoning about which neighboring
 * component (pipe/flange/valve/gasket) can safely absorb the length deficit,
 * which this app does not have modeled with enough fidelity to do safely.
 */
export function applyFixForIssue(canonical, issue) {
  if (issue.kind === 'SNAP_GAP' && issue.suggestedAutofix === 'MERGE_NODES') {
    const [keepId, mergeId] = issue.nodeIds;
    const keepNode = canonical.nodes.find((node) => node.id === keepId);
    if (!keepNode) return null;
    const nodes = canonical.nodes.map((node) => (node.id === mergeId ? { ...node, position: keepNode.position } : node));
    return { ...canonical, nodes };
  }
  return null;
}

/**
 * Safe autofix loop: applies one candidate at a time against an evolving
 * topology, keeping it only if the targeted issue is actually resolved and
 * the total issue count doesn't increase — mirroring the source's
 * "reject if it creates a new or worse issue" rule rather than an unguarded
 * batch mutation.
 */
export function planSafeAutofix(canonical, issues, options = {}) {
  let working = canonical;
  let workingIssues = checkCanonicalTopology(working, options);
  const applied = [];
  const rejected = [];

  issues.forEach((issue) => {
    const candidate = applyFixForIssue(working, issue);
    if (!candidate) { rejected.push(Object.freeze({ issueId: issue.id, reason: 'NO_SAFE_AUTOFIX' })); return; }
    const candidateIssues = checkCanonicalTopology(candidate, options);
    const issueStillPresent = candidateIssues.some((row) => row.kind === issue.kind && sameNodeSet(row.nodeIds, issue.nodeIds));
    const worsened = candidateIssues.length > workingIssues.length;
    if (issueStillPresent || worsened) {
      rejected.push(Object.freeze({ issueId: issue.id, reason: issueStillPresent ? 'ISSUE_NOT_RESOLVED' : 'WOULD_WORSEN_TOPOLOGY' }));
      return;
    }
    applied.push(Object.freeze({ issueId: issue.id, kind: issue.kind, suggestedAutofix: issue.suggestedAutofix }));
    working = candidate;
    workingIssues = candidateIssues;
  });

  return Object.freeze({ finalTopology: working, applied: Object.freeze(applied), rejected: Object.freeze(rejected) });
}

function makeIssue(kind, severity, target, message, suggestedAutofix, distanceMm = null) {
  const nodeIds = target.nodeIds || [];
  const edgeId = target.edgeId || null;
  return Object.freeze({
    id: `issue:${kind}:${edgeId || nodeIds.join(':')}`,
    kind,
    severity,
    nodeIds: Object.freeze([...nodeIds]),
    edgeId,
    message,
    suggestedAutofix,
    distanceMm,
  });
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function sameNodeSet(left = [], right = []) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function buildConnectedComponents(nodeIds, edges) {
  const parent = new Map(nodeIds.map((id) => [id, id]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    let current = id;
    while (current !== root) { const next = parent.get(current); parent.set(current, root); current = next; }
    return root;
  };
  const union = (left, right) => { const rootLeft = find(left); const rootRight = find(right); if (rootLeft !== rootRight) parent.set(rootLeft, rootRight); };
  edges.forEach((edge) => {
    if (parent.has(edge.fromNodeId) && parent.has(edge.toNodeId)) union(edge.fromNodeId, edge.toNodeId);
  });
  const groups = new Map();
  nodeIds.forEach((id) => {
    const root = find(id);
    const bucket = groups.get(root) || [];
    bucket.push(id);
    groups.set(root, bucket);
  });
  return [...groups.values()];
}
