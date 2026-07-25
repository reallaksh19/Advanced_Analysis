import { deepFreeze } from '../shared-piping-model/index.js';

export function buildTargetSpatialIndex(targets, cellSize) {
  if (!(Number.isFinite(cellSize) && cellSize > 0)) throw new TypeError('Spatial index cell size must be positive.');
  const cells = new Map();
  targets.forEach((target) => targetCells(target, cellSize).forEach((key) => addCell(cells, key, target)));
  return deepFreeze({
    cellSize,
    query(point) {
      return queryCells(cells, point, cellSize);
    },
  });
}

function targetCells(target, cellSize) {
  if (target.pointCanonical) return [cellKey(target.pointCanonical, cellSize)];
  if (!target.startCanonical || !target.endCanonical) return [];
  return segmentCells(target.startCanonical, target.endCanonical, cellSize);
}

function segmentCells(start, end, cellSize) {
  const startCell = cellCoordinates(start, cellSize);
  const endCell = cellCoordinates(end, cellSize);
  const steps = Math.max(
    Math.abs(endCell.x - startCell.x),
    Math.abs(endCell.y - startCell.y),
    Math.abs(endCell.z - startCell.z),
    1,
  );
  const keys = new Set();
  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    keys.add(cellKey({
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
      z: start.z + (end.z - start.z) * ratio,
    }, cellSize));
  }
  return [...keys].sort();
}

function queryCells(cells, point, cellSize) {
  const center = cellCoordinates(point, cellSize);
  const targets = new Map();
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const key = `${center.x + dx}|${center.y + dy}|${center.z + dz}`;
        (cells.get(key) || []).forEach((target) => targets.set(target.targetId, target));
      }
    }
  }
  return [...targets.values()].sort((left, right) => left.targetId.localeCompare(right.targetId));
}

function addCell(cells, key, target) {
  const rows = cells.get(key) || [];
  rows.push(target);
  rows.sort((left, right) => left.targetId.localeCompare(right.targetId));
  cells.set(key, rows);
}

function cellKey(point, cellSize) {
  const cell = cellCoordinates(point, cellSize);
  return `${cell.x}|${cell.y}|${cell.z}`;
}

function cellCoordinates(point, cellSize) {
  return {
    x: Math.floor(point.x / cellSize),
    y: Math.floor(point.y / cellSize),
    z: Math.floor(point.z / cellSize),
  };
}
