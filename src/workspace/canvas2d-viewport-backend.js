import { assertViewportRenderModel } from './viewport-render-model.js';
import { buildCanvasProjection, pickViewportItem } from './viewport-hit-test.js';

const DEVICE_PIXEL_RATIO_LIMIT = 2;
const MAX_POINTER_TRAVEL_PX = 5;

export class Canvas2DViewportBackend {
  constructor() {
    this.hostElement = null;
    this.canvas = null;
    this.context = null;
    this.model = null;
    this.selectedEntityId = '';
    this.resizeObserver = null;
    this.selectionRequestHandler = null;
    this.pointerStart = null;
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  mount(hostElement) {
    if (!hostElement) throw new TypeError('Canvas viewport requires a host element.');
    this.hostElement = hostElement;
    this.canvas = hostElement.ownerDocument.createElement('canvas');
    this.canvas.className = 'viewport-canvas';
    this.canvas.dataset.viewportBackend = 'canvas2d';
    this.canvas.setAttribute('aria-label', 'Read-only model viewport');
    this.context = this.canvas.getContext('2d');
    if (!this.context) throw new Error('Canvas 2D context is unavailable.');

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    hostElement.replaceChildren(this.canvas);
    hostElement.dataset.viewportBackend = 'canvas2d';

    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(hostElement);
    }
    this.resize();
  }

  setSelectionRequestHandler(callback) {
    if (callback !== null && typeof callback !== 'function') {
      throw new TypeError('Canvas viewport selection handler must be a function or null.');
    }
    this.selectionRequestHandler = callback;
  }

  renderModel(model) {
    assertViewportRenderModel(model);
    this.model = model;
    this.selectedEntityId = '';
    this.updateHostMetadata();
    this.draw();
  }

  clear() {
    this.model = null;
    this.selectedEntityId = '';
    this.pointerStart = null;
    this.updateHostMetadata();
    this.draw();
  }

  setSelection(entityId) {
    this.selectedEntityId = String(entityId || '');
    this.updateHostMetadata();
    this.draw();
  }

  fitView() {
    this.markViewCommand('fit');
    this.draw();
  }

  resetView() {
    this.markViewCommand('reset');
    this.draw();
  }

  resize() {
    if (!this.canvas || !this.hostElement || !this.context) return;
    const width = Math.max(this.hostElement.clientWidth, 1);
    const height = Math.max(this.hostElement.clientHeight, 1);
    const ratio = Math.min(globalThis.devicePixelRatio || 1, DEVICE_PIXEL_RATIO_LIMIT);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  handlePointerDown(event) {
    if (event.button !== 0) return;
    this.pointerStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  handlePointerUp(event) {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!start || event.button !== 0 || start.pointerId !== event.pointerId || !this.model) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MAX_POINTER_TRAVEL_PX) return;

    const rect = this.canvas.getBoundingClientRect();
    const entityId = pickViewportItem(this.model, rect.width, rect.height, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
    if (!entityId) return;

    this.hostElement.dataset.lastPickEntityId = entityId;
    this.selectionRequestHandler?.(entityId);
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.canvas?.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas?.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas?.remove();
    this.canvas = null;
    this.context = null;
    this.model = null;
    this.pointerStart = null;
    this.selectionRequestHandler = null;
    if (this.hostElement) clearHostMetadata(this.hostElement);
    this.hostElement = null;
  }

  draw() {
    if (!this.context || !this.canvas) return;
    const width = parseFloat(this.canvas.style.width) || 1;
    const height = parseFloat(this.canvas.style.height) || 1;
    this.context.clearRect(0, 0, width, height);
    if (!this.model || this.model.items.length === 0) return;

    const projection = buildCanvasProjection(this.model, width, height);
    this.model.items.forEach((item) => this.drawItem(item, projection));
  }

  drawItem(item, projection) {
    const selected = item.entityId === this.selectedEntityId;
    const color = selected ? '#fbbf24' : categoryColor(item.category);
    this.context.strokeStyle = color;
    this.context.fillStyle = color;
    this.context.lineWidth = selected ? 4 : item.resolutionStatus === 'fallback' ? 2 : 3;
    this.context.setLineDash(item.resolutionStatus === 'fallback' ? [6, 4] : []);

    if (Array.isArray(item.path) && item.path.length > 1) {
      this.drawPath(item.path, projection);
    } else if (Array.isArray(item.legs) && item.legs.length) {
      item.legs.forEach((leg) => this.drawSegment(leg.start, leg.end, projection));
      this.drawMarker(item.center, projection, selected ? 7 : 5, 'circle');
    } else if (item.start && item.end) {
      this.drawSegment(item.start, item.end, projection);
      this.drawBodySymbol(item, projection, selected);
    } else if (item.center) {
      this.drawBodySymbol(item, projection, selected);
    }
    this.context.setLineDash([]);
  }

  drawPath(path, projection) {
    const first = projection(path[0]);
    this.context.beginPath();
    this.context.moveTo(first.x, first.y);
    path.slice(1).forEach((point) => {
      const screen = projection(point);
      this.context.lineTo(screen.x, screen.y);
    });
    this.context.stroke();
  }

  drawSegment(start, end, projection) {
    const a = projection(start);
    const b = projection(end);
    this.context.beginPath();
    this.context.moveTo(a.x, a.y);
    this.context.lineTo(b.x, b.y);
    this.context.stroke();
  }

  drawBodySymbol(item, projection, selected) {
    const center = item.center || midpoint(item.start, item.end);
    if (!center) return;
    const radius = selected ? 7 : 5;
    if (item.kind === 'disc') return this.drawMarker(center, projection, radius, 'double-circle');
    if (item.kind === 'valve-body') return this.drawMarker(center, projection, radius, 'diamond');
    if (item.kind === 'support-marker') return this.drawMarker(center, projection, radius, 'square');
    if (item.kind === 'frustum') return this.drawMarker(center, projection, radius, 'triangle');
    if (!item.start || !item.end) this.drawMarker(center, projection, radius, 'circle');
  }

  drawMarker(center, projection, radius, shape) {
    const point = projection(center);
    this.context.beginPath();
    if (shape === 'diamond') {
      this.context.moveTo(point.x, point.y - radius);
      this.context.lineTo(point.x + radius, point.y);
      this.context.lineTo(point.x, point.y + radius);
      this.context.lineTo(point.x - radius, point.y);
      this.context.closePath();
    } else if (shape === 'square') {
      this.context.rect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    } else if (shape === 'triangle') {
      this.context.moveTo(point.x, point.y - radius);
      this.context.lineTo(point.x + radius, point.y + radius);
      this.context.lineTo(point.x - radius, point.y + radius);
      this.context.closePath();
    } else {
      this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    }
    this.context.stroke();
    if (shape === 'double-circle') {
      this.context.beginPath();
      this.context.arc(point.x, point.y, Math.max(radius - 3, 1), 0, Math.PI * 2);
      this.context.stroke();
    }
  }

  updateHostMetadata() {
    if (!this.hostElement) return;
    const summary = this.model?.summary || {};
    this.hostElement.dataset.renderableCount = String(summary.renderableCount || 0);
    this.hostElement.dataset.skippedCount = String(summary.skippedCount || 0);
    this.hostElement.dataset.resolvedCount = String(summary.resolvedCount || 0);
    this.hostElement.dataset.fallbackCount = String(summary.fallbackCount || 0);
    this.hostElement.dataset.componentKinds = Object.keys(summary.byKind || {}).sort().join(',');
    this.hostElement.dataset.selectedEntityId = this.selectedEntityId;
  }

  markViewCommand(command) {
    if (this.hostElement) this.hostElement.dataset.viewCommand = command;
    if (this.canvas) this.canvas.dataset.viewCommand = command;
  }
}

function clearHostMetadata(hostElement) {
  ['viewportBackend', 'renderableCount', 'skippedCount', 'resolvedCount', 'fallbackCount',
    'componentKinds', 'selectedEntityId', 'lastPickEntityId'].forEach((key) => delete hostElement.dataset[key]);
}

function categoryColor(category) {
  if (category === 'support') return '#f97316';
  if (category === 'pipe') return '#60a5fa';
  return '#a78bfa';
}

function midpoint(a, b) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}
