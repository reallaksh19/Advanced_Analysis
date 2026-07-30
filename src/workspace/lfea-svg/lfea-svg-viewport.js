/**
 * LFEA SVG Viewport & Navigation Module
 * Supports XY, XZ, YZ, ISO projections, fit/pan/zoom, and getScreenCTM pointer mapping.
 */
import { createLfeaSvgViewportState } from './lfea-svg-contracts.js';
import { project3DPoint } from './lfea-svg-scene-builder.js';

export function clientToSvgPoint(svg, clientX, clientY) {
  if (!svg || typeof svg.getScreenCTM !== 'function') {
    throw new Error('LFEA_SVG_SCREEN_MATRIX_UNAVAILABLE');
  }
  const matrix = svg.getScreenCTM();
  if (!matrix) {
    throw new Error('LFEA_SVG_SCREEN_MATRIX_UNAVAILABLE');
  }
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || determinant === 0) {
    throw new Error('LFEA_SVG_SCREEN_MATRIX_SINGULAR');
  }
  if (typeof DOMPoint !== 'undefined' && typeof DOMPoint.prototype.matrixTransform === 'function') {
    return new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  }
  // Fallback for non-DOM Node environments
  const invDet = 1.0 / determinant;
  const dx = clientX - matrix.e;
  const dy = clientY - matrix.f;
  const x = (dx * matrix.d - dy * matrix.c) * invDet;
  const y = (dy * matrix.a - dx * matrix.b) * invDet;
  return { x, y };
}

export function computeFitBounds(points, projection = 'ISO') {
  if (!Array.isArray(points) || points.length === 0) {
    return { minX: -10, minY: -10, maxX: 10, maxY: 10, width: 20, height: 20 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  points.forEach((pt) => {
    const projected = project3DPoint(pt, projection);
    if (projected.px < minX) minX = projected.px;
    if (projected.px > maxX) maxX = projected.px;
    if (projected.py < minY) minY = projected.py;
    if (projected.py > maxY) maxY = projected.py;
  });

  if (!Number.isFinite(minX)) minX = -10;
  if (!Number.isFinite(minY)) minY = -10;
  if (!Number.isFinite(maxX)) maxX = 10;
  if (!Number.isFinite(maxY)) maxY = 10;

  const width = Math.max(maxX - minX, 1.0);
  const height = Math.max(maxY - minY, 1.0);

  return { minX, minY, maxX, maxY, width, height };
}

export function createLfeaSvgViewportManager(initialProjection = 'ISO') {
  let state = createLfeaSvgViewportState({ projection: initialProjection });

  function getState() {
    return state;
  }

  function setProjection(projection) {
    state = createLfeaSvgViewportState({
      projection,
      fitMatrix: state.fitMatrix,
      pan: state.pan,
      zoom: state.zoom,
      visibility: state.visibility,
    });
    return state;
  }

  function applyPan(dx, dy) {
    state = createLfeaSvgViewportState({
      projection: state.projection,
      fitMatrix: state.fitMatrix,
      pan: { x: state.pan.x + dx, y: state.pan.y + dy },
      zoom: state.zoom,
      visibility: state.visibility,
    });
    return state;
  }

  function applyZoom(scaleFactor) {
    const newZoom = Math.max(0.1, Math.min(50.0, state.zoom * scaleFactor));
    state = createLfeaSvgViewportState({
      projection: state.projection,
      fitMatrix: state.fitMatrix,
      pan: state.pan,
      zoom: newZoom,
      visibility: state.visibility,
    });
    return state;
  }

  function fitToPoints(points) {
    const bounds = computeFitBounds(points, state.projection);
    const zoom = 1.0;
    const pan = { x: -(bounds.minX + bounds.width / 2), y: -(bounds.minY + bounds.height / 2) };
    state = createLfeaSvgViewportState({
      projection: state.projection,
      fitMatrix: [1, 0, 0, 1, pan.x, pan.y],
      pan,
      zoom,
      visibility: state.visibility,
    });
    return state;
  }

  return Object.freeze({
    getState,
    setProjection,
    applyPan,
    applyZoom,
    fitToPoints,
  });
}
