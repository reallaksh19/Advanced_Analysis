/**
 * Coordinate transforms for the LFEA SVG.
 *
 * Inputs and outputs are geometry coordinates only. No result quantity or
 * deformation is derived in this module.
 */
export function createLfeaViewport(nodes, dimensions) {
  const xs = nodes.map((row) => row.x);
  const ys = nodes.map((row) => row.y);
  const minimumX = xs.length ? Math.min(...xs) : 0;
  const maximumX = xs.length ? Math.max(...xs) : 1;
  const minimumY = ys.length ? Math.min(...ys) : 0;
  const maximumY = ys.length ? Math.max(...ys) : 1;
  const spanX = Math.max(maximumX - minimumX, 1e-12);
  const spanY = Math.max(maximumY - minimumY, 1e-12);
  const usableHeight = dimensions.height
    - dimensions.legendHeight
    - dimensions.padding;
  const scale = Math.min(
    (dimensions.width - 2 * dimensions.padding) / spanX,
    (usableHeight - dimensions.padding) / spanY,
  );
  const offsetX = (dimensions.width - scale * spanX) / 2;
  const offsetY = (usableHeight - scale * spanY) / 2;
  return {
    x: (value) => offsetX + (value - minimumX) * scale,
    y: (value) => usableHeight - offsetY - (value - minimumY) * scale,
    sourceX: (value) => (value - offsetX) / scale + minimumX,
    sourceY: (value) =>
      (usableHeight - offsetY - value) / scale + minimumY,
  };
}

export function lfeaSourcePoint(svg, event, transform, dimensions) {
  const rect = svg.getBoundingClientRect();
  const x = (event.clientX - rect.left)
    * dimensions.width
    / Math.max(rect.width, 1);
  const y = (event.clientY - rect.top)
    * dimensions.height
    / Math.max(rect.height, 1);
  return { x: transform.sourceX(x), y: transform.sourceY(y) };
}

export function lfeaScreenPoint(node, transform) {
  return [transform.x(node.x), transform.y(node.y)];
}
