import { freezeDeep } from './dataset-utils.js';

const CONNECTION_TOLERANCE = 1e-6;

export function connectedPipeComponent(selectedEntity, candidates) {
  const byId = new Map(candidates.map((entity) => [entity.entityId, entity]));
  if (!byId.has(selectedEntity.entityId)) return freezeDeep([]);

  const visited = new Set();
  const queue = [selectedEntity];
  while (queue.length) {
    const entity = queue.shift();
    if (!entity || visited.has(entity.entityId)) continue;
    visited.add(entity.entityId);
    candidates.forEach((candidate) => {
      if (visited.has(candidate.entityId)) return;
      if (entitiesTouch(entity, candidate)) queue.push(candidate);
    });
  }
  return freezeDeep([...visited].map((entityId) => byId.get(entityId)).filter(Boolean));
}

function entitiesTouch(left, right) {
  const leftPoints = endpoints(left);
  const rightPoints = endpoints(right);
  return leftPoints.some((leftPoint) => (
    rightPoints.some((rightPoint) => pointsNear(leftPoint, rightPoint))
  ));
}

function endpoints(entity) {
  const geometry = entity.properties?.geometry || {};
  return [geometry.start, geometry.end].filter(Boolean);
}

function pointsNear(left, right) {
  return Math.abs(left.x - right.x) <= CONNECTION_TOLERANCE
    && Math.abs(left.y - right.y) <= CONNECTION_TOLERANCE
    && Math.abs(left.z - right.z) <= CONNECTION_TOLERANCE;
}
