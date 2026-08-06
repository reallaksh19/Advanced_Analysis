export function buildTopologyGraph(geometry) {
  if (!geometry || !Array.isArray(geometry.nodes) || !Array.isArray(geometry.segments)) {
    throw new TypeError('buildTopologyGraph requires canonical geometry nodes and segments.');
  }

  const invalidNodeIdentityOrdinals = invalidIdentityOrdinals(geometry.nodes, (node) => node?.id);
  const invalidSegmentIdentityOrdinals = invalidIdentityOrdinals(geometry.segments, (segment) => segment?.id);
  const nodeCounts = countIdentities(geometry.nodes, (node) => node?.id);
  const segmentCounts = countIdentities(geometry.segments, (segment) => segment?.id);
  const nodeIds = [...nodeCounts.keys()].sort(compareAscii);
  const nodeIdSet = new Set(nodeIds);
  const adjacency = new Map(nodeIds.map((nodeId) => [nodeId, new Set()]));
  const incidentSegments = new Map(nodeIds.map((nodeId) => [nodeId, []]));
  const unboundSegments = [];
  const selfLoopSegments = [];

  for (const segment of geometry.segments) {
    const segmentId = normalizeIdentity(segment?.id);
    const startNodeId = normalizeIdentity(segment?.startNodeId);
    const endNodeId = normalizeIdentity(segment?.endNodeId);
    if (segmentId === null || startNodeId === null || endNodeId === null
      || !nodeIdSet.has(startNodeId) || !nodeIdSet.has(endNodeId)) {
      unboundSegments.push(Object.freeze({ segmentId, startNodeId, endNodeId }));
      continue;
    }
    if (startNodeId === endNodeId) selfLoopSegments.push(Object.freeze({ segmentId, nodeId: startNodeId }));
    adjacency.get(startNodeId).add(endNodeId);
    adjacency.get(endNodeId).add(startNodeId);
    incidentSegments.get(startNodeId).push(segmentId);
    if (startNodeId !== endNodeId) incidentSegments.get(endNodeId).push(segmentId);
  }

  const visited = new Set();
  const components = [];
  for (const seed of nodeIds) {
    if (visited.has(seed)) continue;
    const queue = [seed];
    visited.add(seed);
    const componentNodeIds = [];
    const componentSegmentIds = new Set();
    while (queue.length > 0) {
      const nodeId = queue.shift();
      componentNodeIds.push(nodeId);
      for (const segmentId of incidentSegments.get(nodeId) ?? []) componentSegmentIds.add(segmentId);
      for (const neighbour of [...(adjacency.get(nodeId) ?? [])].sort(compareAscii)) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        queue.push(neighbour);
      }
    }
    componentNodeIds.sort(compareAscii);
    components.push(Object.freeze({
      componentId: `TOPO-C${components.length + 1}`,
      nodeIds: Object.freeze(componentNodeIds),
      segmentIds: Object.freeze([...componentSegmentIds].sort(compareAscii)),
    }));
  }

  const incidentRecord = Object.fromEntries(
    [...incidentSegments.entries()]
      .sort(([left], [right]) => compareAscii(left, right))
      .map(([nodeId, segmentIds]) => [nodeId, Object.freeze([...segmentIds].sort(compareAscii))]),
  );
  const isolatedNodeIds = nodeIds.filter((nodeId) => incidentRecord[nodeId].length === 0);
  const nodeDegrees = Object.freeze(Object.fromEntries(
    nodeIds.map((nodeId) => [nodeId, adjacency.get(nodeId)?.size ?? 0]),
  ));

  return Object.freeze({
    components: Object.freeze(components),
    isolatedNodeIds: Object.freeze(isolatedNodeIds),
    unboundSegments: Object.freeze(unboundSegments.sort(compareSegmentRow)),
    selfLoopSegments: Object.freeze(selfLoopSegments.sort(compareSegmentRow)),
    invalidNodeIdentityOrdinals: Object.freeze(invalidNodeIdentityOrdinals),
    invalidSegmentIdentityOrdinals: Object.freeze(invalidSegmentIdentityOrdinals),
    duplicateNodeIds: Object.freeze(duplicates(nodeCounts)),
    duplicateSegmentIds: Object.freeze(duplicates(segmentCounts)),
    incidentSegments: Object.freeze(incidentRecord),
    nodeDegrees,
  });
}

function invalidIdentityOrdinals(rows, identityOf) {
  return rows
    .map((row, ordinal) => ({ ordinal, identity: normalizeIdentity(identityOf(row)) }))
    .filter((row) => row.identity === null)
    .map((row) => row.ordinal);
}

function countIdentities(rows, identityOf) {
  const counts = new Map();
  for (const row of rows) {
    const identity = normalizeIdentity(identityOf(row));
    if (identity === null) continue;
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  return counts;
}

function duplicates(counts) {
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([identity]) => identity)
    .sort(compareAscii);
}

function normalizeIdentity(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function compareSegmentRow(left, right) {
  return compareAscii(left.segmentId ?? '', right.segmentId ?? '')
    || compareAscii(left.startNodeId ?? left.nodeId ?? '', right.startNodeId ?? right.nodeId ?? '')
    || compareAscii(left.endNodeId ?? '', right.endNodeId ?? '');
}

function compareAscii(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}
