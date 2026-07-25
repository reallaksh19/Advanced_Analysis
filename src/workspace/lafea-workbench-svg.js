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

/**
 * Replace a host's content with the current LAFEA geometry preview.
 *
 * @param {Element} host SVG host.
 * @param {{nodes:Array<Record<string, unknown>>,elements:Array<Record<string, unknown>>,nodePath:string|null}} geometry Preview geometry.
 * @param {{onMoveNode:(nodePath:string,nodeId:string,x:number,y:number)=>void}} handlers Edit callbacks.
 * @returns {void}
 */
export function renderLafeaWorkbenchSvg(host, geometry, handlers) {
  host.replaceChildren();
  const documentRef = host.ownerDocument;
  const svg = documentRef.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'LAFEA editable geometry preview');
  const transform = viewportTransform(geometry.nodes);
  renderElements(svg, geometry, transform);
  renderNodes(svg, geometry, transform, handlers);
  if (!geometry.nodes.length) renderEmpty(svg, documentRef);
  host.append(svg);
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
    marker.tabIndex = 0;
    const label = svg.ownerDocument.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(x + 8));
    label.setAttribute('y', String(y - 8));
    label.textContent = node.nodeId;
    group.append(marker, label);
    if (geometry.nodePath) bindDrag(svg, marker, node, geometry.nodePath, transform, handlers);
    svg.append(group);
  }
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
  const screenX = (event.clientX - rect.left) * WIDTH / Math.max(rect.width, 1);
  const screenY = (event.clientY - rect.top) * HEIGHT / Math.max(rect.height, 1);
  return { x: transform.sourceX(screenX), y: transform.sourceY(screenY) };
}

function viewportTransform(nodes) {
  const xs = nodes.map((row) => row.x);
  const ys = nodes.map((row) => row.y);
  const minimumX = xs.length ? Math.min(...xs) : 0;
  const maximumX = xs.length ? Math.max(...xs) : 1;
  const minimumY = ys.length ? Math.min(...ys) : 0;
  const maximumY = ys.length ? Math.max(...ys) : 1;
  const spanX = Math.max(maximumX - minimumX, 1e-12);
  const spanY = Math.max(maximumY - minimumY, 1e-12);
  const scale = Math.min((WIDTH - 2 * PADDING) / spanX, (HEIGHT - 2 * PADDING) / spanY);
  const offsetX = (WIDTH - scale * spanX) / 2;
  const offsetY = (HEIGHT - scale * spanY) / 2;
  return {
    x: (value) => offsetX + (value - minimumX) * scale,
    y: (value) => HEIGHT - offsetY - (value - minimumY) * scale,
    sourceX: (value) => (value - offsetX) / scale + minimumX,
    sourceY: (value) => (HEIGHT - offsetY - value) / scale + minimumY,
  };
}

function screenPoint(node, transform) {
  return [transform.x(node.x), transform.y(node.y)];
}

function renderEmpty(svg, documentRef) {
  const text = documentRef.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', String(WIDTH / 2));
  text.setAttribute('y', String(HEIGHT / 2));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('class', 'lafea-workbench-svg__empty');
  text.textContent = 'Import a valid stage document to preview its geometry.';
  svg.append(text);
}
