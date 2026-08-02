import { semanticHash, stringValue } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_CHECK_REPORT_SCHEMA = 'TopologyCheckReport.v1';
export const TOPOLOGY_ISSUE_KINDS = Object.freeze({
  ORPHAN_NODE: 'ORPHAN_NODE', ORPHAN_EDGE_ENDPOINT: 'ORPHAN_EDGE_ENDPOINT',
  SELF_LOOP_EDGE: 'SELF_LOOP_EDGE', ZERO_LENGTH_EDGE: 'ZERO_LENGTH_EDGE',
  DUPLICATE_EDGE: 'DUPLICATE_EDGE', SHORT_ELEMENT: 'SHORT_ELEMENT',
  BRANCH_DISCONNECTED: 'BRANCH_DISCONNECTED', SNAP_GAP: 'SNAP_GAP',
  JUNCTION_NODE_MISSING: 'JUNCTION_NODE_MISSING', SUPPORT_NODE_MISSING: 'SUPPORT_NODE_MISSING',
  SUPPORT_HOST_MISSING: 'SUPPORT_HOST_MISSING', SUPPORT_HOST_UNRESOLVED: 'SUPPORT_HOST_UNRESOLVED',
});
const DEFAULT_POLICY = Object.freeze({
  schema: 'TopologyCheckPolicy.v1', shortElementThresholdMm: 6,
  snapGapToleranceMm: 25, zeroLengthToleranceMm: 1e-9,
});

export function createTopologyCheckPolicy(options = {}) {
  return Object.freeze({ ...DEFAULT_POLICY,
    shortElementThresholdMm: nonNegative(options.shortElementThresholdMm, 6),
    snapGapToleranceMm: nonNegative(options.snapGapToleranceMm, 25),
    zeroLengthToleranceMm: nonNegative(options.zeroLengthToleranceMm, 1e-9),
  });
}

export function runTopologyEditChecks(canonical, options = {}) {
  const policy = createTopologyCheckPolicy(options);
  if (!canonical?.nodes || !canonical?.edges) return createReport(canonical, policy, []);
  const context = createContext(canonical);
  const issues = [
    ...edgeIssues(canonical, context, policy), ...junctionIssues(canonical, context),
    ...orphanNodeIssues(canonical, context), ...componentIssues(canonical, context),
    ...snapGapIssues(canonical, context, policy), ...supportIssues(canonical, context),
  ].sort((left, right) => left.id.localeCompare(right.id));
  return createReport(canonical, policy, issues);
}

export function checkCanonicalTopology(canonical, options = {}) {
  return runTopologyEditChecks(canonical, options).issues;
}

export function applyFixForIssue(canonical, issue) {
  if (issue.kind !== 'SNAP_GAP' || issue.suggestedAutofix !== 'MERGE_NODES') return null;
  const [keepId, mergeId] = issue.nodeIds;
  const keepNode = canonical.nodes.find((node) => node.id === keepId);
  if (!keepNode) return null;
  const nodes = canonical.nodes.map((node) => node.id === mergeId
    ? { ...node, position: keepNode.position } : node);
  return { ...canonical, nodes };
}

export function planSafeAutofix(canonical, issues, options = {}) {
  let working = canonical, workingIssues = checkCanonicalTopology(working, options);
  const applied = [], rejected = [];
  for (const issue of issues) {
    const candidate = applyFixForIssue(working, issue);
    if (!candidate) { rejected.push(rejection(issue.id, 'NO_SAFE_AUTOFIX')); continue; }
    const candidateIssues = checkCanonicalTopology(candidate, options);
    const persists = candidateIssues.some((row) => row.id === issue.id);
    const introduced = candidateIssues.some((row) => !workingIssues.some((before) => before.id === row.id));
    if (persists || introduced) {
      rejected.push(rejection(issue.id, persists ? 'ISSUE_NOT_RESOLVED' : 'NEW_FINDINGS_INTRODUCED'));
      continue;
    }
    applied.push(Object.freeze({ issueId: issue.id, kind: issue.kind,
      suggestedAutofix: issue.suggestedAutofix }));
    working = candidate; workingIssues = candidateIssues;
  }
  return Object.freeze({ finalTopology: working,
    applied: Object.freeze(applied), rejected: Object.freeze(rejected) });
}

function createContext(canonical) {
  const nodesById = new Map(canonical.nodes.map((node) => [stringValue(node.id), node]));
  const edgesByAuthorityId = new Map();
  for (const edge of canonical.edges) for (const id of [edge.id, edge.componentKey].map(stringValue).filter(Boolean)) {
    edgesByAuthorityId.set(id, edge);
  }
  return { nodesById, edgesByAuthorityId,
    degree: new Map(canonical.nodes.map((node) => [stringValue(node.id), 0])),
    validEdges: [], componentIndexByNode: new Map() };
}

function edgeIssues(canonical, context, policy) {
  const issues = [], duplicateGroups = new Map();
  for (const edge of canonical.edges) inspectEdge(edge, context, policy, issues, duplicateGroups);
  for (const [pairKey, edgeIds] of duplicateGroups) {
    if (edgeIds.length < 2) continue;
    const sortedEdges = [...edgeIds].sort();
    issues.push(issue('DUPLICATE_EDGE', 'HIGH', 'CONNECTIVITY',
      { edgeIds: sortedEdges, nodeIds: pairKey.split('|') },
      `Multiple edges share the same canonical endpoints: ${sortedEdges.join(', ')}.`));
  }
  return issues;
}

function inspectEdge(edge, context, policy, issues, duplicateGroups) {
  const edgeId = stringValue(edge.id), fromId = stringValue(edge.fromNodeId), toId = stringValue(edge.toNodeId);
  const from = context.nodesById.get(fromId), to = context.nodesById.get(toId);
  if (!from || !to) {
    const missing = [from ? '' : fromId, to ? '' : toId].filter(Boolean);
    issues.push(issue('ORPHAN_EDGE_ENDPOINT', 'HIGH', 'CONNECTIVITY',
      { edgeIds: [edgeId], nodeIds: missing }, `Edge ${edgeId} references missing node authority.`,
      null, { missingNodeIds: missing }));
    return;
  }
  context.validEdges.push(edge); increment(context.degree, fromId); increment(context.degree, toId);
  if (fromId === toId) issues.push(issue('SELF_LOOP_EDGE', 'HIGH', 'CONNECTIVITY',
    { edgeIds: [edgeId], nodeIds: [fromId] }, `Edge ${edgeId} starts and ends at node ${fromId}.`));
  const lengthMm = distance(from.position, to.position);
  if (lengthMm <= policy.zeroLengthToleranceMm) issues.push(issue('ZERO_LENGTH_EDGE', 'HIGH', 'GEOMETRY',
    { edgeIds: [edgeId], nodeIds: [fromId, toId] }, `Edge ${edgeId} has zero geometric length.`, null, { lengthMm }));
  else if (lengthMm <= policy.shortElementThresholdMm) issues.push(issue('SHORT_ELEMENT', 'MEDIUM', 'GEOMETRY',
    { edgeIds: [edgeId], nodeIds: [fromId, toId] }, `Edge ${edgeId} is ${lengthMm.toFixed(2)}mm long.`, null, { lengthMm }));
  const pairKey = [fromId, toId].sort().join('|'), group = duplicateGroups.get(pairKey) || [];
  group.push(edgeId); duplicateGroups.set(pairKey, group);
}

function junctionIssues(canonical, context) {
  const issues = [];
  for (const junction of canonical.junctions || []) {
    const junctionId = stringValue(junction.id), nodeIds = sortedUnique(junction.nodeIds);
    const missing = nodeIds.filter((nodeId) => !context.nodesById.has(nodeId));
    if (missing.length) issues.push(issue('JUNCTION_NODE_MISSING', 'HIGH', 'CONNECTIVITY',
      { junctionIds: [junctionId], nodeIds: missing },
      `Junction ${junctionId} references missing node authority.`, null, { missingNodeIds: missing }));
    for (const nodeId of nodeIds) if (context.nodesById.has(nodeId)) increment(context.degree, nodeId);
  }
  return issues;
}

function orphanNodeIssues(canonical, context) {
  return canonical.nodes.flatMap((node) => {
    const nodeId = stringValue(node.id);
    return (context.degree.get(nodeId) || 0) > 0 ? [] : [issue('ORPHAN_NODE', 'MEDIUM',
      'CONNECTIVITY', { nodeIds: [nodeId] }, `Node ${nodeId} has no incident edge or junction.`)];
  });
}

function componentIssues(canonical, context) {
  const components = connectedComponents(canonical.nodes.map((node) => stringValue(node.id)), context.validEdges);
  components.forEach((component, index) => component.forEach((nodeId) => context.componentIndexByNode.set(nodeId, index)));
  if (components.length < 2) return [];
  const largestKey = [...components].sort(compareComponents)[0].join('|');
  return components.flatMap((component) => component.join('|') === largestKey ? [] : [issue(
    'BRANCH_DISCONNECTED', 'MEDIUM', 'CONNECTIVITY', { nodeIds: component },
    `Isolated branch of ${component.length} node(s) is disconnected from the main network.`,
  )]);
}

function snapGapIssues(canonical, context, policy) {
  const open = canonical.nodes.filter((node) => (context.degree.get(stringValue(node.id)) || 0) === 1), issues = [];
  for (let leftIndex = 0; leftIndex < open.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < open.length; rightIndex += 1) {
    const left = open[leftIndex], right = open[rightIndex];
    if (context.componentIndexByNode.get(left.id) === context.componentIndexByNode.get(right.id)) continue;
    const gapMm = distance(left.position, right.position);
    if (gapMm > 0 && gapMm <= policy.snapGapToleranceMm) issues.push(issue('SNAP_GAP', 'HIGH', 'GEOMETRY',
      { nodeIds: [left.id, right.id] }, `Open endpoints ${left.id} and ${right.id} are ${gapMm.toFixed(2)}mm apart.`,
      'MERGE_NODES', { gapMm }));
  }
  return issues;
}

function supportIssues(canonical, context) {
  const issues = [];
  for (const support of canonical.supports || []) inspectSupport(support, context, issues);
  return issues;
}

function inspectSupport(support, context, issues) {
  const supportId = stringValue(support.id || support.entityId), nodeId = stringValue(support.nodeId);
  if (!nodeId || !context.nodesById.has(nodeId)) {
    issues.push(issue('SUPPORT_NODE_MISSING', 'HIGH', 'ATTACHMENTS',
      { supportIds: [supportId], nodeIds: nodeId ? [nodeId] : [] },
      `Support ${supportId} does not resolve to a canonical node.`));
    return;
  }
  const explicitHost = stringValue(support.hostEntityId || support.edgeId || support.attachedEdgeId);
  if (explicitHost && !context.edgesByAuthorityId.has(explicitHost)) {
    issues.push(issue('SUPPORT_HOST_MISSING', 'HIGH', 'ATTACHMENTS',
      { supportIds: [supportId], nodeIds: [nodeId], edgeIds: [explicitHost] },
      `Support ${supportId} references missing host ${explicitHost}.`));
    return;
  }
  if (explicitHost) return;
  const incident = context.validEdges.filter((edge) => edge.fromNodeId === nodeId || edge.toNodeId === nodeId);
  if (incident.length !== 1) issues.push(issue('SUPPORT_HOST_UNRESOLVED', 'MEDIUM', 'ATTACHMENTS',
    { supportIds: [supportId], nodeIds: [nodeId], edgeIds: incident.map((edge) => edge.id) },
    `Support ${supportId} has no unique canonical host edge.`, null, { incidentEdgeCount: incident.length }));
}

function issue(kind, severity, category, target, message, suggestedAutofix = null, details = {}) {
  const nodeIds = sortedUnique(target.nodeIds), edgeIds = sortedUnique(target.edgeIds);
  const supportIds = sortedUnique(target.supportIds), junctionIds = sortedUnique(target.junctionIds);
  const objectIds = sortedUnique([...nodeIds, ...edgeIds, ...supportIds, ...junctionIds]);
  const suffix = objectIds.join(':') || semanticHash({ kind, details }).slice(-16);
  return Object.freeze({ id: `issue:${kind}:${suffix}`, code: kind, kind, category, severity,
    blocking: severity === 'HIGH', confidence: 'HIGH',
    fixability: suggestedAutofix ? 'AUTO_CANDIDATE' : 'MANUAL', objectIds: Object.freeze(objectIds),
    nodeIds: Object.freeze(nodeIds), edgeIds: Object.freeze(edgeIds), edgeId: edgeIds[0] || null,
    supportIds: Object.freeze(supportIds), junctionIds: Object.freeze(junctionIds), message,
    suggestedAutofix, distanceMm: details.gapMm ?? null, details: Object.freeze({ ...details }) });
}

function createReport(canonical, policy, issues) {
  const frozenIssues = Object.freeze([...issues]);
  const base = { schema: TOPOLOGY_CHECK_REPORT_SCHEMA,
    canonicalTopologyHash: stringValue(canonical?.canonicalTopologyHash) || semanticHash(topologyPayload(canonical)),
    policyHash: semanticHash(policy), issueCount: frozenIssues.length, issues: frozenIssues };
  return Object.freeze({ ...base, reportHash: semanticHash(base) });
}

function connectedComponents(nodeIds, edges) {
  const parent = new Map(nodeIds.map((id) => [id, id]));
  const find = (id) => { let root = id; while (parent.get(root) !== root) root = parent.get(root);
    let current = id; while (current !== root) { const next = parent.get(current); parent.set(current, root); current = next; } return root; };
  for (const edge of edges) { const leftRoot = find(stringValue(edge.fromNodeId)), rightRoot = find(stringValue(edge.toNodeId));
    if (leftRoot !== rightRoot) parent.set(leftRoot, rightRoot); }
  const groups = new Map();
  for (const id of nodeIds) { const root = find(id), group = groups.get(root) || []; group.push(id); groups.set(root, group); }
  return [...groups.values()].map((group) => group.sort());
}

function topologyPayload(canonical) { return { nodes: canonical?.nodes || [], edges: canonical?.edges || [],
  junctions: canonical?.junctions || [], supports: canonical?.supports || [] }; }
function compareComponents(left, right) { return right.length - left.length || left.join('|').localeCompare(right.join('|')); }
function sortedUnique(values = []) { return [...new Set(values.map(stringValue).filter(Boolean))].sort(); }
function increment(map, key) { map.set(key, (map.get(key) || 0) + 1); }
function rejection(issueId, reason) { return Object.freeze({ issueId, reason }); }
function distance(left, right) { return Math.hypot(Number(left?.x) - Number(right?.x),
  Number(left?.y) - Number(right?.y), Number(left?.z || 0) - Number(right?.z || 0)); }
function nonNegative(value, fallback) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : fallback; }
