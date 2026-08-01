/**
 * Render an editable, evidence-neutral SVG preview of LAFEA geometry.
 *
 * The preview never derives engineering results. Pointer edits are emitted as
 * source-coordinate changes and must pass the store's canonical validation.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 760;
const HEIGHT = 440;
const PADDING = 36;
const KEYBOARD_NUDGE = 0.001;

/**
 * Replace a host's content with the current LAFEA geometry preview.
 *
 * @param {Element} host SVG host.
 * @param {{nodes:Array<Record<string, unknown>>,elements:Array<Record<string, unknown>>,nodePath:string|null}} geometry Preview geometry.
 * @param {{onMoveNode?:(nodePath:string,nodeId:string,x:number,y:number)=>void}} handlers Edit callbacks.
 * @param {object|null} viewport Optional governed `LafeaViewportState.v2`.
 * @returns {void}
 */
export function renderLafeaWorkbenchSvg(host, geometry, handlers, viewport = null) {
  host.replaceChildren();
  const documentRef = host.ownerDocument;
  const dimensions = rendererDimensions(viewport);
  const svg = documentRef.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${dimensions.width} ${dimensions.height}`);
  svg.setAttribute('role', geometry.nodePath ? 'group' : 'img');
  svg.setAttribute('aria-label', 'LAFEA editable geometry preview');
  const transform = viewport === null
    ? legacyViewportTransform(geometry.nodes, dimensions)
    : governedViewportTransform(viewport, dimensions);
  bindGlobalHighlight(svg);
  renderElements(svg, geometry, transform);
  renderNodes(svg, geometry, transform, handlers);
  if (!geometry.nodes.length) renderEmpty(svg, documentRef, dimensions);
  host.append(svg);
}

function bindGlobalHighlight(svg) {
  svg.addEventListener('click', (event) => {
    const target = event.target.closest('[data-element-id], [data-node-id]');
    if (!target) return;
    event.stopPropagation();
    const id = target.dataset.elementId || target.dataset.nodeId;
    svg.ownerDocument.querySelectorAll('.lafea-svg-highlighted').forEach((node) => node.classList.remove('lafea-svg-highlighted'));
    target.classList.add('lafea-svg-highlighted');
    const tr = svg.ownerDocument.querySelector(`tr[data-row-id="${id}"]`);
    if (tr) {
      svg.ownerDocument.querySelectorAll('tr.lafea-row-selected').forEach((row) => row.classList.remove('lafea-row-selected'));
      tr.classList.add('lafea-row-selected');
      tr.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
  });
}

function renderElements(svg, geometry, transform) {
  const nodeMap = new Map(geometry.nodes.map((node) => [node.nodeId, node]));
  for (const element of geometry.elements) {
    const points = element.nodeIds.map((nodeId) => nodeMap.get(nodeId)).filter(Boolean);
    if (points.length < 2) continue;
    const polygon = svg.ownerDocument.createElementNS(SVG_NS, points.length > 2 ? 'polygon' : 'polyline');
    polygon.setAttribute('points', points.map((point) => screenPoint(point, transform).join(',')).join(' '));
    polygon.setAttribute('class', 'lafea-workbench-svg__element');
    polygon.dataset.elementId = element.elementId;
    svg.append(polygon);
  }
}

function renderNodes(svg, geometry, transform, handlers) {
  for (const node of geometry.nodes) {
    const [x, y] = screenPoint(node, transform);
    const group = svg.ownerDocument.createElementNS(SVG_NS, 'g');
    group.dataset.nodeId = node.nodeId;
    group.setAttribute('class', 'lafea-workbench-svg__node');
    const marker = svg.ownerDocument.createElementNS(SVG_NS, 'circle');
    marker.setAttribute('cx', String(x));
    marker.setAttribute('cy', String(y));
    marker.setAttribute('r', '6');
    marker.setAttribute('tabindex', '0');
    marker.setAttribute('role', geometry.nodePath ? 'button' : 'graphics-symbol');
    marker.setAttribute(
      'aria-label',
      geometry.nodePath
        ? `${node.nodeId} at ${node.x}, ${node.y}. Use arrow keys to move.`
        : `${node.nodeId} at ${node.x}, ${node.y}.`,
    );
    const label = svg.ownerDocument.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(x + 8));
    label.setAttribute('y', String(y - 8));
    label.textContent = node.nodeId;
    group.append(marker, label);
    if (geometry.nodePath) {
      bindDrag(svg, marker, node, geometry.nodePath, transform, handlers);
      bindKeyboard(marker, node, geometry.nodePath, handlers);
    }
    svg.append(group);
  }
}

function bindKeyboard(marker, node, nodePath, handlers) {
  marker.addEventListener('keydown', (event) => {
    const offsets = {
      ArrowLeft: [-KEYBOARD_NUDGE, 0],
      ArrowRight: [KEYBOARD_NUDGE, 0],
      ArrowUp: [0, KEYBOARD_NUDGE],
      ArrowDown: [0, -KEYBOARD_NUDGE],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    handlers.onMoveNode(nodePath, node.nodeId, node.x + offset[0], node.y + offset[1]);
  });
}

function bindDrag(svg, marker, node, nodePath, transform, handlers) {
  marker.style.cursor = 'move';
  marker.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    marker.setPointerCapture?.(event.pointerId);
    const move = (moveEvent) => {
      const point = sourcePoint(svg, moveEvent, transform);
      marker.setAttribute('cx', String(transform.x(point.x)));
      marker.setAttribute('cy', String(transform.y(point.y)));
    };
    const finish = (upEvent) => {
      marker.removeEventListener('pointermove', move);
      marker.removeEventListener('pointerup', finish);
      marker.removeEventListener('pointercancel', cancel);
      const point = sourcePoint(svg, upEvent, transform);
      handlers.onMoveNode(nodePath, node.nodeId, point.x, point.y);
    };
    const cancel = () => {
      marker.removeEventListener('pointermove', move);
      marker.removeEventListener('pointerup', finish);
      marker.removeEventListener('pointercancel', cancel);
    };
    marker.addEventListener('pointermove', move);
    marker.addEventListener('pointerup', finish);
    marker.addEventListener('pointercancel', cancel);
  });
}

function sourcePoint(svg, event, transform) {
  const rect = svg.getBoundingClientRect();
  const screenX = (event.clientX - rect.left) * transform.width / Math.max(rect.width, 1);
  const screenY = (event.clientY - rect.top) * transform.height / Math.max(rect.height, 1);
  return { x: transform.sourceX(screenX), y: transform.sourceY(screenY) };
}

function rendererDimensions(viewport) {
  if (viewport === null) return { width: WIDTH, height: HEIGHT };
  const width = viewport?.cssWidth;
  const height = viewport?.cssHeight;
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new TypeError('LAFEA_SVG_VIEWPORT_DIMENSIONS_INVALID');
  }
  return { width, height };
}

function governedViewportTransform(viewport, dimensions) {
  const worldBounds = viewport.worldBounds;
  const minimumX = worldBounds?.minimum?.x;
  const maximumX = worldBounds?.maximum?.x;
  const minimumY = worldBounds?.minimum?.y;
  const maximumY = worldBounds?.maximum?.y;
  if (![minimumX, maximumX, minimumY, maximumY].every(Number.isFinite)
    || maximumX <= minimumX || maximumY <= minimumY) {
    throw new TypeError('LAFEA_SVG_WORLD_BOUNDS_INVALID');
  }
  const spanX = maximumX - minimumX;
  const spanY = maximumY - minimumY;
  return {
    width: dimensions.width,
    height: dimensions.height,
    x: (value) => (value - minimumX) * dimensions.width / spanX,
    y: (value) => dimensions.height - (value - minimumY) * dimensions.height / spanY,
    sourceX: (value) => minimumX + value * spanX / dimensions.width,
    sourceY: (value) => minimumY + (dimensions.height - value) * spanY / dimensions.height,
  };
}

function legacyViewportTransform(nodes, dimensions) {
  const xs = nodes.map((row) => row.x);
  const ys = nodes.map((row) => row.y);
  const minimumX = xs.length ? Math.min(...xs) : 0;
  const maximumX = xs.length ? Math.max(...xs) : 1;
  const minimumY = ys.length ? Math.min(...ys) : 0;
  const maximumY = ys.length ? Math.max(...ys) : 1;
  const spanX = Math.max(maximumX - minimumX, 1e-12);
  const spanY = Math.max(maximumY - minimumY, 1e-12);
  const scale = Math.min(
    (dimensions.width - 2 * PADDING) / spanX,
    (dimensions.height - 2 * PADDING) / spanY,
  );
  const offsetX = (dimensions.width - scale * spanX) / 2;
  const offsetY = (dimensions.height - scale * spanY) / 2;
  return {
    width: dimensions.width,
    height: dimensions.height,
    x: (value) => offsetX + (value - minimumX) * scale,
    y: (value) => dimensions.height - offsetY - (value - minimumY) * scale,
    sourceX: (value) => (value - offsetX) / scale + minimumX,
    sourceY: (value) => (dimensions.height - offsetY - value) / scale + minimumY,
  };
}

function screenPoint(node, transform) {
  return [transform.x(node.x), transform.y(node.y)];
}

function renderEmpty(svg, documentRef, dimensions) {
  const text = documentRef.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', String(dimensions.width / 2));
  text.setAttribute('y', String(dimensions.height / 2));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('class', 'lafea-workbench-svg__empty');
  text.textContent = 'Import a valid stage document to preview its geometry.';
  svg.append(text);
}
