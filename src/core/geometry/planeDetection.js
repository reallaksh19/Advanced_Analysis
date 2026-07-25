const toPoint3 = (point) => {
  if (Array.isArray(point)) return { x: Number(point[0]) || 0, y: Number(point[1]) || 0, z: Number(point[2]) || 0 };
  return { x: Number(point?.x) || 0, y: Number(point?.y) || 0, z: Number(point?.z) || 0 };
};

export const getSegmentEndpoints = (segment, nodesById = new Map()) => {
  if (segment?.start && segment?.end) return { start: toPoint3(segment.start), end: toPoint3(segment.end) };
  const start = nodesById.get(segment?.startNodeId) || nodesById.get(segment?.startNode);
  const end = nodesById.get(segment?.endNodeId) || nodesById.get(segment?.endNode);
  return { start: toPoint3(start), end: toPoint3(end) };
};

export const projectPointToPlane = (point, plane = 'XY') => {
  const p = toPoint3(point);
  if (plane === 'XZ') return [p.x, p.z, 0];
  if (plane === 'YZ') return [p.y, p.z, 0];
  return [p.x, p.y, 0];
};

export const detectDominantPlaneFromSegments = (segments = [], options = {}) => {
  const nodesById = new Map((options.nodes || []).map((node) => [node.id, node]));
  const axisMovement = { x: 0, y: 0, z: 0 };
  segments.forEach((segment) => {
    const { start, end } = getSegmentEndpoints(segment, nodesById);
    axisMovement.x += Math.abs(end.x - start.x);
    axisMovement.y += Math.abs(end.y - start.y);
    axisMovement.z += Math.abs(end.z - start.z);
  });
  const sorted = Object.entries(axisMovement).map(([axis, movement]) => ({ axis, movement })).sort((a, b) => b.movement - a.movement);
  const primary = sorted[0] || { axis: 'x', movement: 0 };
  const secondary = sorted[1] || { axis: 'y', movement: 0 };
  const total = axisMovement.x + axisMovement.y + axisMovement.z;
  const pair = [primary.axis, secondary.axis].sort().join('').toUpperCase();
  const plane = pair === 'XZ' ? 'XZ' : pair === 'YZ' ? 'YZ' : 'XY';
  return {
    plane,
    axisMovement,
    confidence: total > 0 ? (primary.movement + secondary.movement) / total : 0,
    reason: total > 0 ? `Selected ${plane} from dominant axes ${primary.axis.toUpperCase()} and ${secondary.axis.toUpperCase()}.` : 'No movement detected; defaulted to XY.',
  };
};
