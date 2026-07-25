export const buildDegreeMap = (geometry) => {
  const degreeMap = new Map();
  (geometry?.nodes || []).forEach((node) => degreeMap.set(node.id, 0));
  (geometry?.segments || []).forEach((segment) => {
    degreeMap.set(segment.startNodeId, (degreeMap.get(segment.startNodeId) || 0) + 1);
    degreeMap.set(segment.endNodeId, (degreeMap.get(segment.endNodeId) || 0) + 1);
  });
  return degreeMap;
};

export const classifyCanonicalTopology = (geometry) => {
  const degreeMap = buildDegreeMap(geometry);
  const degrees = Array.from(degreeMap.values());
  const openEndCount = degrees.filter((degree) => degree === 1).length;
  const branchNodeCount = degrees.filter((degree) => degree >= 3).length;
  const isolatedNodeCount = degrees.filter((degree) => degree === 0).length;
  const segmentCount = geometry?.segments?.length || 0;
  let topology = 'EMPTY';
  if (segmentCount === 1) topology = 'SINGLE_LEG';
  else if (branchNodeCount > 0) topology = 'BRANCHED';
  else if (openEndCount === 0 && segmentCount > 1) topology = 'CLOSED_LOOP';
  else if (openEndCount === 2 && segmentCount > 1) topology = 'OPEN_CHAIN';
  else if (segmentCount > 1) topology = 'MULTI_PATH';
  return { topology, segmentCount, nodeCount: geometry?.nodes?.length || 0, openEndCount, branchNodeCount, isolatedNodeCount, degreeByNode: Object.fromEntries(degreeMap) };
};
