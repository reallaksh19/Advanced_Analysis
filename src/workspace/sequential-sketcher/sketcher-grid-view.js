/**
 * Engineering Grid and SVG Definitions for Sequential Sketcher Canvas.
 * STRICT MODULE LIMIT: Maximum 300 lines.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export function buildSvgDefs(doc) {
  const defs = doc.createElementNS(SVG_NS, 'defs');

  // Cyan FEA reaction vector marker arrow head
  const marker = doc.createElementNS(SVG_NS, 'marker');
  marker.setAttribute('id', 'fea-arrow-head');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '5');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto-start-reverse');

  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M 0 1 L 8 5 L 0 9 z');
  path.setAttribute('fill', '#38bdf8');

  marker.append(path);
  defs.append(marker);
  return defs;
}

export function buildEngineeringGrid(doc, minX, maxX, minY, maxY, margin, extent, size) {
  const gridGroup = doc.createElementNS(SVG_NS, 'g');
  gridGroup.setAttribute('class', 'engineering-grid');
  gridGroup.setAttribute('opacity', '0.15');

  const step = extent / 10;
  for (let x = Math.floor(minX - margin); x <= maxX + margin; x += step) {
    const gridLine = doc.createElementNS(SVG_NS, 'line');
    gridLine.setAttribute('x1', String(x));
    gridLine.setAttribute('y1', String(minY - margin));
    gridLine.setAttribute('x2', String(x));
    gridLine.setAttribute('y2', String(maxY + margin));
    gridLine.setAttribute('stroke', '#64748b');
    gridLine.setAttribute('stroke-width', String(size / 600));
    gridGroup.append(gridLine);
  }

  for (let y = Math.floor(minY - margin); y <= maxY + margin; y += step) {
    const gridLine = doc.createElementNS(SVG_NS, 'line');
    gridLine.setAttribute('x1', String(minX - margin));
    gridLine.setAttribute('y1', String(y));
    gridLine.setAttribute('x2', String(maxX + margin));
    gridLine.setAttribute('y2', String(y));
    gridLine.setAttribute('stroke', '#64748b');
    gridLine.setAttribute('stroke-width', String(size / 600));
    gridGroup.append(gridLine);
  }

  return gridGroup;
}
