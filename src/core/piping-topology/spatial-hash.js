import { deepFreeze } from '../shared-piping-model/index.js';

export function buildSpatialHash(ports, cellSize) {
  if (!(Number.isFinite(cellSize) && cellSize > 0)) throw new TypeError('Spatial hash cell size must be positive.');
  const cells = new Map();
  ports.forEach((port) => {
    if (!port.positionCanonical) return;
    const key = cellKey(cellCoordinates(port.positionCanonical, cellSize));
    const bucket = cells.get(key) || [];
    bucket.push(port.portKey);
    cells.set(key, bucket);
  });
  cells.forEach((bucket) => bucket.sort());
  return deepFreeze({ cellSize, cells });
}

export function nearbyPortKeys(port, spatialHash) {
  if (!port?.positionCanonical) return [];
  const center = cellCoordinates(port.positionCanonical, spatialHash.cellSize);
  const keys = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const bucket = spatialHash.cells.get(cellKey({ x: center.x + dx, y: center.y + dy, z: center.z + dz }));
        if (bucket) keys.push(...bucket);
      }
    }
  }
  return [...new Set(keys)].sort();
}

function cellCoordinates(position, cellSize) {
  return {
    x: Math.floor(position.x / cellSize),
    y: Math.floor(position.y / cellSize),
    z: Math.floor(position.z / cellSize),
  };
}

function cellKey(cell) {
  return `${cell.x}|${cell.y}|${cell.z}`;
}
