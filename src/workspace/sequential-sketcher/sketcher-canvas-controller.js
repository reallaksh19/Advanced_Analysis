/**
 * Canvas projection and interactive navigation controller for Sequential Sketcher.
 * STRICT MODULE LIMIT: Maximum 300 lines.
 */

import { project3DPoint } from '../lfea-svg/lfea-svg-scene-builder.js';

export function computeProjectedPoints(dataset, projection, zoomLevel, panOffset) {
  const projectedPoints = [];
  const entityProjected = (dataset.entities || []).map((entity) => {
    const geom = entity.properties?.geometry || {};
    const attrs = entity.properties?.attributes || {};
    const sourceAttrs = entity.properties?.sourceAttributes || {};
    const getPt = (keys) => keys.reduce((pt, key) => pt || geom[key] || attrs[key] || sourceAttrs[key], null);

    const start3D = getPt(['start', 'position', 'center', 'APOS', 'HPOS', 'POS']);
    const end3D = getPt(['end', 'center', 'LPOS', 'TPOS', 'BPOS']);

    const p1 = start3D ? project3DPoint(start3D, projection) : null;
    const p2 = end3D ? project3DPoint(end3D, projection) : null;

    const type = (entity.entityType || '').toUpperCase();
    const isPhysical = type !== 'BRANCH' && type !== 'ROOT' && type !== 'OBJECT' && entity.category !== 'container';

    if (p1 && (isPhysical || Math.hypot(p1.px, p1.py) > 100)) projectedPoints.push(p1);
    if (p2 && (isPhysical || Math.hypot(p2.px, p2.py) > 100)) projectedPoints.push(p2);

    return { entity, p1, p2 };
  });

  let minX = -100, maxX = 100, minY = -100, maxY = 100;
  if (projectedPoints.length > 0) {
    minX = Math.min(...projectedPoints.map((p) => p.px));
    maxX = Math.max(...projectedPoints.map((p) => p.px));
    minY = Math.min(...projectedPoints.map((p) => p.py));
    maxY = Math.max(...projectedPoints.map((p) => p.py));
  }

  const extent = Math.max(maxX - minX, maxY - minY, 100);
  const margin = extent * 0.08;
  const size = (extent + margin * 2) / zoomLevel;
  const cx = (minX + maxX) / 2 + panOffset.x;
  const cy = (minY + maxY) / 2 + panOffset.y;
  const viewBox = `${cx - size / 2} ${cy - size / 2} ${size} ${size}`;

  return {
    entityProjected,
    minX,
    maxX,
    minY,
    maxY,
    extent,
    margin,
    size,
    cx,
    cy,
    viewBox,
  };
}

export function attachCanvasNavigation(svg, size, viewInstance) {
  // Wheel Zoom
  svg.addEventListener('wheel', (event) => {
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.15 : 0.85;
    viewInstance.zoomLevel *= zoomFactor;
    viewInstance.render(viewInstance.currentDataset);
  });

  let hasDragged = false;
  let mouseDownPos = { x: 0, y: 0 };

  svg.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    viewInstance.isPanning = true;
    hasDragged = false;
    viewInstance.dragStart = { x: event.clientX, y: event.clientY };
    mouseDownPos = { x: event.clientX, y: event.clientY };
    svg.style.cursor = 'grabbing';
  });

  svg.addEventListener('mousemove', (event) => {
    if (!viewInstance.isPanning) return;
    const moveDist = Math.hypot(event.clientX - mouseDownPos.x, event.clientY - mouseDownPos.y);
    if (moveDist > 4) {
      hasDragged = true;
    }
    const dx = (event.clientX - viewInstance.dragStart.x) * (size / 500);
    const dy = (event.clientY - viewInstance.dragStart.y) * (size / 500);
    viewInstance.panOffset.x -= dx;
    viewInstance.panOffset.y -= dy;
    viewInstance.dragStart = { x: event.clientX, y: event.clientY };
    viewInstance.render(viewInstance.currentDataset);
  });

  const stopPan = () => {
    if (viewInstance.isPanning) {
      viewInstance.isPanning = false;
      svg.style.cursor = 'grab';
    }
  };

  svg.addEventListener('mouseup', stopPan);
  svg.addEventListener('mouseleave', stopPan);

  svg.addEventListener('click', (event) => {
    if (hasDragged) return;
    if (globalThis.getSelection) {
      globalThis.getSelection().removeAllRanges();
    }
    if (viewInstance.selectedEntity) {
      viewInstance.selectedEntity = null;
      if (viewInstance.onSelectEntity) viewInstance.onSelectEntity(null);
    }
  });
}
