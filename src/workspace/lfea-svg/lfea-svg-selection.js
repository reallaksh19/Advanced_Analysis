/**
 * LFEA SVG Selection Service
 * Handles point, window, and crossing entity selection with stable ASCII sorted IDs.
 */
import { asciiSort, createLfeaSvgSelection } from './lfea-svg-contracts.js';

export function selectPoint(primitives, point, radius = 5.0) {
  const selected = [];
  primitives.forEach((prim) => {
    if (!prim.points || prim.points.length === 0) return;
    const hit = prim.points.some((p) => Math.hypot(p.px - point.px, p.py - point.py) <= radius);
    if (hit && prim.sourceEntityId) {
      selected.push(prim.sourceEntityId);
    }
  });
  return createLfeaSvgSelection({
    selectedIds: asciiSort([...new Set(selected)]),
    selectionType: 'point',
  });
}

export function selectWindow(primitives, rect) {
  const minX = Math.min(rect.x1, rect.x2);
  const maxX = Math.max(rect.x1, rect.x2);
  const minY = Math.min(rect.y1, rect.y2);
  const maxY = Math.max(rect.y1, rect.y2);

  const selected = [];
  primitives.forEach((prim) => {
    if (!prim.points || prim.points.length === 0) return;
    const inside = prim.points.every((p) => p.px >= minX && p.px <= maxX && p.py >= minY && p.py <= maxY);
    if (inside && prim.sourceEntityId) {
      selected.push(prim.sourceEntityId);
    }
  });
  return createLfeaSvgSelection({
    selectedIds: asciiSort([...new Set(selected)]),
    selectionType: 'window',
  });
}

export function selectCrossing(primitives, rect) {
  const minX = Math.min(rect.x1, rect.x2);
  const maxX = Math.max(rect.x1, rect.x2);
  const minY = Math.min(rect.y1, rect.y2);
  const maxY = Math.max(rect.y1, rect.y2);

  const selected = [];
  primitives.forEach((prim) => {
    if (!prim.points || prim.points.length === 0) return;
    const anyInside = prim.points.some((p) => p.px >= minX && p.px <= maxX && p.py >= minY && p.py <= maxY);
    if (anyInside && prim.sourceEntityId) {
      selected.push(prim.sourceEntityId);
    }
  });
  return createLfeaSvgSelection({
    selectedIds: asciiSort([...new Set(selected)]),
    selectionType: 'crossing',
  });
}
