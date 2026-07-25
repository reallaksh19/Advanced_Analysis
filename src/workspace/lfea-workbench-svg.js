/**
 * SVG mesh/result renderer for the independent LFEA workbench.
 *
 * Raw stress uses retained solver evidence. Projected stress is colored only as
 * non-authoritative review data and is always labelled with its authority.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 760;
const HEIGHT = 440;
const PADDING = 38;

/**
 * Render an LFEA mesh or result field.
 *
 * @param {Element} host SVG host.
 * @param {Readonly<Record<string, unknown>>} geometry SVG-ready geometry.
 * @param {Readonly<Record<string, unknown>>|null} packageValue Source package.
 * @param {{onMoveNode:(nodeId:string,x:number,y:number)=>void}} handlers Edit callbacks.
 * @returns {void}
 */
export function renderLfeaWorkbenchSvg(host, geometry, packageValue, handlers) {
  host.replaceChildren();
  const svg = host.ownerDocument.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `LFEA ${geometry.mode.toLowerCase()} mesh view`);
  const transform = viewportTransform(geometry.nodes);
  renderElements(svg, geometry, transform);
  renderLoads(svg, packageValue, geometry.nodes, transform);
  renderConstraints(svg, packageValue, geometry.nodes, transform);
  renderNodes(svg, geometry, transform, handlers);
  renderLegend(svg, geometry);
  host.append(svg);
}

function renderElements(svg, geometry, transform) {
  const nodeMap = new Map(geometry.nodes.map((node) => [node.nodeId, node]));
  const scale = colorScale(Object.values(geometry.values).filter(Number.isFinite));
  for (const element of geometry.elements) {
    const nodes = element.nodeIds.map((nodeId) => nodeMap.get(nodeId)).filter(Boolean);
    if (nodes.length < 3) continue;
    const polygon = svg.ownerDocument.createElementNS(SVG_NS, 'polygon');
    polygon.dataset.elementId = element.elementId;
    polygon.setAttribute('points', nodes.map((node) => screenPoint(node, transform).join(',')).join(' '));
    polygon.setAttribute('class', 'lfea-workbench-svg__element');
    const value = geometry.values[element.elementId];
    if (Number.isFinite(value)) polygon.style.fill = scale(value);
    svg.append(polygon);
  }
}

function renderNodes(svg, geometry, transform, handlers) {
  for (const node of geometry.nodes) {
    const [x, y] = screenPoint(node, transform);
    const group = svg.ownerDocument.createElementNS(SVG_NS, 'g');
    group.dataset.nodeId = node.nodeId;
    group.setAttribute('class', 'lfea-workbench-svg__node');
    const marker = svg.ownerDocument.createElementNS(SVG_NS, 'circle');
    marker.setAttribute('cx', String(x));
    marker.setAttribute('cy', String(y));
    marker.setAttribute('r', '5');
    const label = svg.ownerDocument.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(x + 7));
    label.setAttribute('y', String(y - 7));
    label.textContent = node.nodeId;
    group.append(marker, label);
    if (geometry.mode === 'MODEL') bindDrag(svg, marker, node, transform, handlers);
    svg.append(group);
  }
}

function renderLoads(svg, packageValue, nodes, transform) {
  const pointMap = new Map((packageValue?.points ?? []).map((row) => [row.pointId, row.nodeId]));
  const nodeMap = new Map(nodes.map((row) => [row.nodeId, row]));
  for (const load of packageValue?.analysisDefinition?.loadCase?.pointForces ?? []) {
    const node = nodeMap.get(pointMap.get(load.pointId));
    if (!node) continue;
    const [x, y] = screenPoint(node, transform);
    const magnitude = Math.hypot(load.fx, load.fy);
    if (!magnitude) continue;
    const line = svg.ownerDocument.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(x));
    line.setAttribute('y1', String(y));
    line.setAttribute('x2', String(x + 26 * load.fx / magnitude));
    line.setAttribute('y2', String(y - 26 * load.fy / magnitude));
    line.setAttribute('class', 'lfea-workbench-svg__load');
    svg.append(line);
  }
}

function renderConstraints(svg, packageValue, nodes, transform) {
  const pointMap = new Map((packageValue?.points ?? []).map((row) => [row.pointId, row.nodeId]));
  const nodeMap = new Map(nodes.map((row) => [row.nodeId, row]));
  for (const constraint of packageValue?.analysisDefinition?.constraints ?? []) {
    if (constraint.selectorType !== 'POINT') continue;
    const node = nodeMap.get(pointMap.get(constraint.selectorId));
    if (!node) continue;
    const [x, y] = screenPoint(node, transform);
    const marker = svg.ownerDocument.createElementNS(SVG_NS, 'rect');
    marker.setAttribute('x', String(x - 8));
    marker.setAttribute('y', String(y + 7));
    marker.setAttribute('width', '16');
    marker.setAttribute('height', '6');
    marker.setAttribute('class', 'lfea-workbench-svg__constraint');
    svg.append(marker);
  }
}

function renderLegend(svg, geometry) {
  const text = svg.ownerDocument.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', '14');
  text.setAttribute('y', '24');
  text.setAttribute('class', 'lfea-workbench-svg__legend');
  text.textContent = `${geometry.mode.replaceAll('_', ' ')} — ${geometry.authority}`;
  svg.append(text);
}

function bindDrag(svg, marker, node, transform, handlers) {
  marker.style.cursor = 'move';
  marker.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    marker.setPointerCapture?.(event.pointerId);
    const finish = (upEvent) => {
      marker.removeEventListener('pointerup', finish);
      marker.removeEventListener('pointercancel', cancel);
      const source = sourcePoint(svg, upEvent, transform);
      handlers.onMoveNode(node.nodeId, source.x, source.y);
    };
    const cancel = () => {
      marker.removeEventListener('pointerup', finish);
      marker.removeEventListener('pointercancel', cancel);
    };
    marker.addEventListener('pointerup', finish);
    marker.addEventListener('pointercancel', cancel);
  });
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

function sourcePoint(svg, event, transform) {
  const rect = svg.getBoundingClientRect();
  const x = (event.clientX - rect.left) * WIDTH / Math.max(rect.width, 1);
  const y = (event.clientY - rect.top) * HEIGHT / Math.max(rect.height, 1);
  return { x: transform.sourceX(x), y: transform.sourceY(y) };
}

function screenPoint(node, transform) {
  return [transform.x(node.x), transform.y(node.y)];
}

function colorScale(values) {
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 1;
  const span = Math.max(maximum - minimum, 1e-12);
  return (value) => {
    const ratio = (value - minimum) / span;
    const red = Math.round(40 + ratio * 210);
    const blue = Math.round(245 - ratio * 200);
    return `rgb(${red},85,${blue})`;
  };
}
