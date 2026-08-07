/** Read-only SVG overlay for canonical retained analysis-mesh evidence. */
const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderLafeaRetainedMeshOverlay(input) {
  const svg = input?.target?.querySelector?.('svg');
  if (!svg || !input.evidence || !input.viewport) return null;
  const mesh = input.evidence.mesh;
  if (!Array.isArray(mesh?.nodes) || !Array.isArray(mesh?.elements)) {
    throw new TypeError('LAFEA_RETAINED_MESH_OVERLAY_EVIDENCE_INVALID');
  }
  const transform = viewportTransform(input.viewport);
  const nodeMap = new Map(mesh.nodes.map((node) => [node.nodeId, node]));
  const warning = new Set(input.evidence.quality?.warningElementIds ?? []);
  const blocking = new Set(input.evidence.quality?.blockingElementIds ?? []);
  const focused = input.focusedElementId === null || input.focusedElementId === undefined
    ? null
    : String(input.focusedElementId);
  svg.querySelector?.('[data-role="lafea-retained-mesh-overlay"]')?.remove();
  const group = svg.ownerDocument.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'lafea-retained-mesh');
  group.dataset.role = 'lafea-retained-mesh-overlay';
  group.dataset.custodyState = input.custodyState ?? 'UNKNOWN';
  group.setAttribute('aria-label', 'Retained authorized analysis mesh');

  for (const element of mesh.elements) {
    const points = element.nodeIds.map((id) => nodeMap.get(id)).filter(Boolean);
    if (points.length < 2) continue;
    const shape = svg.ownerDocument.createElementNS(
      SVG_NS,
      points.length > 2 ? 'polygon' : 'polyline',
    );
    shape.setAttribute(
      'points',
      points.map((point) => screenPoint(point, transform).join(',')).join(' '),
    );
    const id = String(element.elementId);
    const classes = ['lafea-retained-mesh__element'];
    if (warning.has(element.elementId)) classes.push('lafea-retained-mesh__element--warning');
    if (blocking.has(element.elementId)) classes.push('lafea-retained-mesh__element--block');
    if (id === focused) classes.push('lafea-retained-mesh__element--focused');
    shape.setAttribute('class', classes.join(' '));
    shape.dataset.meshElementId = id;
    shape.setAttribute('tabindex', '0');
    shape.setAttribute('role', 'button');
    shape.setAttribute('aria-label', `Analysis mesh element ${id}`);
    const focus = () => input.onFocusElement?.(element.elementId);
    shape.addEventListener('click', (event) => {
      event.stopPropagation();
      focus();
    });
    shape.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      focus();
    });
    group.append(shape);
  }
  svg.append(group);
  return group;
}

export function focusLafeaRetainedMeshElement(target, elementId) {
  const id = String(elementId);
  const nodes = target?.querySelectorAll?.('[data-mesh-element-id]') ?? [];
  let found = null;
  nodes.forEach((node) => {
    const selected = node.dataset.meshElementId === id;
    node.classList.toggle('lafea-retained-mesh__element--focused', selected);
    if (selected) found = node;
  });
  found?.focus?.({ preventScroll: true });
  return found !== null;
}

function viewportTransform(viewport) {
  const bounds = viewport.worldBounds;
  const width = viewport.cssWidth;
  const height = viewport.cssHeight;
  const minX = bounds?.minimum?.x;
  const maxX = bounds?.maximum?.x;
  const minY = bounds?.minimum?.y;
  const maxY = bounds?.maximum?.y;
  if (![width, height, minX, maxX, minY, maxY].every(Number.isFinite)
    || width <= 0 || height <= 0 || maxX <= minX || maxY <= minY) {
    throw new TypeError('LAFEA_RETAINED_MESH_OVERLAY_VIEWPORT_INVALID');
  }
  return {
    x: (value) => (value - minX) * width / (maxX - minX),
    y: (value) => height - (value - minY) * height / (maxY - minY),
  };
}

function screenPoint(node, transform) {
  if (!Number.isFinite(node?.x) || !Number.isFinite(node?.y)) {
    throw new TypeError('LAFEA_RETAINED_MESH_OVERLAY_NODE_INVALID');
  }
  return [transform.x(node.x), transform.y(node.y)];
}
