/**
 * LAFEA.4 shell result visualization using the shared field/plot contract.
 *
 * Values are selected from qualified surface-stress evidence. Geometry is
 * explicitly undeformed and every element exposes its numeric value and unit.
 */
import { selectShellSurfaceField } from './lfea-field-adapter.js';
import {
  createLockedColourScale,
  createPlotDescriptor,
  GEOMETRY_STATES,
} from './lfea-plot-descriptor.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 700;
const HEIGHT = 380;
const PADDING = 38;

export function renderLafeaShellResult(host, documentValue, result, units) {
  const field = selectShellSurfaceField(result, units.stress);
  const plot = createPlotDescriptor({
    field,
    geometryState: GEOMETRY_STATES.UNDEFORMED,
    deformationScale: 0,
    authority: field.authority,
    unitsIdentity: `${units.length}/${units.stress}`,
  });
  const nodes = documentValue.nodes ?? [];
  const transform = viewportTransform(nodes);
  const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));
  const colour = createLockedColourScale(plot.min, plot.max);
  const svg = host.ownerDocument.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', plot.caption);
  for (const element of documentValue.elements ?? []) {
    const points = (element.nodeIds ?? []).map((nodeId) => nodeMap.get(nodeId)).filter(Boolean);
    const value = field.byElement[element.elementId];
    if (points.length < 3 || !Number.isFinite(value)) continue;
    const polygon = host.ownerDocument.createElementNS(SVG_NS, 'polygon');
    polygon.setAttribute('points', points.map((node) => point(node, transform).join(',')).join(' '));
    polygon.setAttribute('fill', colour(value));
    polygon.setAttribute('stroke', '#d5dbea');
    polygon.setAttribute('tabindex', '0');
    polygon.setAttribute('role', 'graphics-symbol');
    polygon.setAttribute('aria-label', `${element.elementId}: ${format(value)} ${plot.unit}`);
    const title = host.ownerDocument.createElementNS(SVG_NS, 'title');
    title.textContent = `${element.elementId}: ${format(value)} ${plot.unit}`;
    polygon.append(title);
    svg.append(polygon);
  }
  host.replaceChildren(svg, legend(host, plot, colour));
  return plot;
}

function legend(host, plot, colour) {
  const wrapper = host.ownerDocument.createElement('div');
  wrapper.className = 'lafea-result-legend';
  const caption = host.ownerDocument.createElement('p');
  caption.textContent = plot.caption;
  const ticks = host.ownerDocument.createElement('ol');
  ticks.setAttribute('aria-label', `${plot.quantityId} legend`);
  for (const value of plot.ticks) {
    const item = host.ownerDocument.createElement('li');
    const swatch = host.ownerDocument.createElement('span');
    swatch.style.background = colour(value);
    swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, `${format(value)} ${plot.unit}`);
    ticks.append(item);
  }
  wrapper.append(caption, ticks);
  return wrapper;
}

function viewportTransform(nodes) {
  const positions = nodes.map((node) => position(node));
  const xs = positions.map((row) => row[0]);
  const ys = positions.map((row) => row[1]);
  const minimumX = xs.length ? Math.min(...xs) : 0;
  const maximumX = xs.length ? Math.max(...xs) : 1;
  const minimumY = ys.length ? Math.min(...ys) : 0;
  const maximumY = ys.length ? Math.max(...ys) : 1;
  const spanX = Math.max(maximumX - minimumX, 1e-12);
  const spanY = Math.max(maximumY - minimumY, 1e-12);
  const scale = Math.min((WIDTH - 2 * PADDING) / spanX, (HEIGHT - 2 * PADDING) / spanY);
  return {
    x: (value) => PADDING + (value - minimumX) * scale,
    y: (value) => HEIGHT - PADDING - (value - minimumY) * scale,
  };
}

function point(node, transform) {
  const [x, y] = position(node);
  return [transform.x(x), transform.y(y)];
}

function position(node) {
  return Array.isArray(node.position) ? node.position : [node.x, node.y, node.z ?? 0];
}

function format(value) {
  return Number(value).toPrecision(6);
}
