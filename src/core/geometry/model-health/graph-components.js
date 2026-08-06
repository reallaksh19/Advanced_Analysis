function compareAscii(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

export function buildTopologyGraph(geometry) {
  if (!geometry || !Array.isArray(geometry.nodes) || !Array.isArray(geometry.segments)) {
    throw new TypeError('buildTopologyGraph requires canonical geometry nodes and segments.');
  }
  const nodeIds = geometry.nodes.map((node) => String(node.id)).sort(compareAscii);
  const nodeIdSet = new Set(nodeIds);
  const adjacency = new Map(nodeIds.map((nodeId) => [nodeId, new Set()]));
  const incidentSegments = new Map(nodeIds.map((nodeId) => [nodeId, []]));
  const unboundSegments = [];

  for (const segment of geometry.segments) {
    const segmentId = String(segment.id);
    const startNodeId = String(segment.startNodeId);
    const endNodeId = String(segment.endNodeId);
    if (!nodeIdSet.has(startNodeId) || !nodeIdSet.has(endNodeId)) {
      unboundSegments.push(Object.freeze({ segmentId, startNodeId, endNodeId }));
      continue;
    }
    adjacency.get(startNodeId).add(endNodeId);
    adjacency.get(endNodeId).add(startNodeId);
    incidentSegments.get(startNodeId).push(segmentId);
    incidentSegments.get(endNodeId).push(segmentId);
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
      const neighbours = [...(adjacency.get(nodeId) ?? [])].sort(compareAscii);
      for (const neighbour of neighbours) {
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

  const isolatedNodeIds = components
    .filter((component) => component.segmentIds.length === 0)
    .flatMap((component) => component.nodeIds)
    .sort(compareAscii);

  return Object.freeze({
    components: Object.freeze(components),
    isolatedNodeIds: Object.freeze(isolatedNodeIds),
    unboundSegments: Object.freeze(unboundSegments.sort((a, b) => compareAscii(a.segmentId, b.segmentId))),
    incidentSegments: Object.freeze(Object.fromEntries(
      [...incidentSegments.entries()]
        .sort(([left], [right]) => compareAscii(left, right))
        .map(([nodeId, segmentIds]) => [nodeId, Object.freeze([...segmentIds].sort(compareAscii))]),
    )),
  });
}
