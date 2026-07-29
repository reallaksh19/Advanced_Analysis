/**
 * SVG mesh/result renderer for the independent LFEA workbench.
 *
 * Raw stress uses retained solver evidence. Projected stress is colored only as
 * non-authoritative review data and is always labelled with its authority.
 */
import { createLockedColourScale } from './lfea-plot-descriptor.js';
import { bindLfeaNodeEditor } from './lfea-svg-node-editor.js';
import {
  createLfeaViewport,
  lfeaScreenPoint as screenPoint,
  lfeaSourcePoint,
} from './lfea-svg-viewport.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 760;
const HEIGHT = 470;
const PADDING = 38;
const LEGEND_HEIGHT = 34;
const DIMENSIONS = Object.freeze({
  width: WIDTH,
  height: HEIGHT,
  padding: PADDING,
  legendHeight: LEGEND_HEIGHT,
});

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
  svg.setAttribute('role', geometry.mode === 'MODEL' ? 'application' : 'img');
  svg.setAttribute('aria-label', `LFEA ${geometry.mode.toLowerCase()} mesh view`);
  const transform = createLfeaViewport(geometry.nodes, DIMENSIONS);
  renderElements(svg, geometry, transform);
  renderLoads(svg, packageValue, geometry.nodes, transform);
  renderConstraints(svg, packageValue, geometry.nodes, transform);
  renderNodes(svg, geometry, transform, handlers);
  renderLegend(svg, geometry);
  host.append(svg);
}

function renderElements(svg, geometry, transform) {
  const nodeMap = new Map(geometry.nodes.map((node) => [node.nodeId, node]));
  // The colour scale is LOCKED to the descriptor's declared range, not
  // re-normalised from whatever data happens to be present. A value therefore
  // keeps its colour across edits and between two runs being compared.
  const plot = geometry.plot;
  const scale = Number.isFinite(plot?.min) && Number.isFinite(plot?.max)
    ? createLockedColourScale(plot.min, plot.max)
    : () => null;
  for (const element of geometry.elements) {
    const nodes = element.nodeIds.map((nodeId) => nodeMap.get(nodeId)).filter(Boolean);
    if (nodes.length < 3) continue;
    const polygon = svg.ownerDocument.createElementNS(SVG_NS, 'polygon');
    polygon.dataset.elementId = element.elementId;
    polygon.setAttribute('points', nodes.map((node) => screenPoint(node, transform).join(',')).join(' '));
    polygon.setAttribute('class', 'lfea-workbench-svg__element');
    const value = geometry.values[element.elementId];
    if (Number.isFinite(value)) {
      const fill = scale(value);
      if (fill) polygon.style.fill = fill;
      polygon.dataset.fieldValue = String(value);
      polygon.dataset.fieldUnit = plot?.unit ?? '';
      const title = svg.ownerDocument.createElementNS(SVG_NS, 'title');
      title.textContent = `${element.elementId} — ${plot?.quantityId ?? 'value'} `
        + `${value.toPrecision(6)} ${plot?.unit ?? ''} (${plot?.reduction ?? ''})`;
      polygon.append(title);
    }
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
    if (geometry.mode === 'MODEL') {
      bindLfeaNodeEditor({
        svg,
        marker,
        node,
        transform,
        handlers,
        sourcePoint: (target, event, viewport) =>
          lfeaSourcePoint(target, event, viewport, DIMENSIONS),
      });
    }
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

/**
 * Render the caption, the geometry-state badge and a numeric colour bar.
 *
 * A colour ramp without numeric ticks and a unit is not a reviewable
 * engineering output, so the bar is drawn whenever a field is present.
 */
function renderLegend(svg, geometry) {
  const documentRef = svg.ownerDocument;
  const plot = geometry.plot;

  const caption = documentRef.createElementNS(SVG_NS, 'text');
  caption.setAttribute('x', '14');
  caption.setAttribute('y', '20');
  caption.setAttribute('class', 'lfea-workbench-svg__legend');
  caption.dataset.role = 'lfea-plot-caption';
  caption.textContent = plot?.caption ?? `${geometry.mode.replaceAll('_', ' ')} — ${geometry.authority}`;
  svg.append(caption);

  const badge = documentRef.createElementNS(SVG_NS, 'text');
  badge.setAttribute('x', String(WIDTH - 14));
  badge.setAttribute('y', '20');
  badge.setAttribute('text-anchor', 'end');
  badge.setAttribute('class', 'lfea-workbench-svg__geometry-state');
  badge.dataset.role = 'lfea-geometry-state';
  badge.dataset.geometryState = plot?.geometryState ?? 'UNKNOWN';
  badge.textContent = plot?.deformationScale
    ? `DEFORMED ×${plot.deformationScale}`
    : 'UNDEFORMED';
  svg.append(badge);

  if (!plot || !Array.isArray(plot.ticks) || !plot.ticks.length) return;
  if (plot.ticks.length === 1) {
    // Degenerate field (a single element, or a perfectly uniform state). A bar
    // would imply a range that does not exist, so the single value is stated.
    const uniform = svg.ownerDocument.createElementNS(SVG_NS, 'text');
    uniform.setAttribute('x', String(WIDTH / 2));
    uniform.setAttribute('y', String(HEIGHT - LEGEND_HEIGHT + 14));
    uniform.setAttribute('text-anchor', 'middle');
    uniform.setAttribute('class', 'lfea-workbench-svg__tick');
    uniform.dataset.role = 'lfea-uniform-value';
    uniform.textContent = `${plot.quantityId} uniform at ${formatTick(plot.ticks[0])} ${plot.unit}`;
    svg.append(uniform);
    return;
  }
  renderColourBar(svg, plot);
}

function renderColourBar(svg, plot) {
  const documentRef = svg.ownerDocument;
  const barLeft = 14;
  const barWidth = WIDTH - 28;
  const barTop = HEIGHT - LEGEND_HEIGHT;
  const scale = createLockedColourScale(plot.min, plot.max);
  const group = documentRef.createElementNS(SVG_NS, 'g');
  group.dataset.role = 'lfea-colour-bar';

  const steps = 64;
  for (let index = 0; index < steps; index += 1) {
    const ratio = index / (steps - 1);
    const cell = documentRef.createElementNS(SVG_NS, 'rect');
    cell.setAttribute('x', String(barLeft + (index * barWidth) / steps));
    cell.setAttribute('y', String(barTop));
    cell.setAttribute('width', String(barWidth / steps + 0.6));
    cell.setAttribute('height', '10');
    cell.setAttribute('fill', scale(plot.min + ratio * (plot.max - plot.min)));
    group.append(cell);
  }

  plot.ticks.forEach((value, index) => {
    const ratio = index / (plot.ticks.length - 1);
    const label = documentRef.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(barLeft + ratio * barWidth));
    label.setAttribute('y', String(barTop + 23));
    label.setAttribute('text-anchor', index === 0 ? 'start' : index === plot.ticks.length - 1 ? 'end' : 'middle');
    label.setAttribute('class', 'lfea-workbench-svg__tick');
    label.textContent = formatTick(value);
    group.append(label);
  });

  const unit = documentRef.createElementNS(SVG_NS, 'text');
  unit.setAttribute('x', String(barLeft + barWidth / 2));
  unit.setAttribute('y', String(barTop - 4));
  unit.setAttribute('text-anchor', 'middle');
  unit.setAttribute('class', 'lfea-workbench-svg__tick');
  unit.textContent = `${plot.quantityId} [${plot.unit}]`;
  group.append(unit);

  svg.append(group);
}

function formatTick(value) {
  if (!Number.isFinite(value)) return '';
  const magnitude = Math.abs(value);
  if (magnitude === 0) return '0';
  if (magnitude < 1e-2 || magnitude >= 1e5) return value.toExponential(2);
  return value.toPrecision(4);
}
