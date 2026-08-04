import { Canvas2DViewportBackend } from './canvas2d-viewport-backend.js';
import { ThreeViewportBackend } from './three-viewport-backend.js';

export class ViewportRenderer {
  constructor(backendPreference = globalThis.__WORKSPACE_VIEWPORT_BACKEND__ || 'auto') {
    this.backendPreference = backendPreference;
    this.backend = null;
    this.backendName = 'unmounted';
    this.hostElement = null;
    this.lastError = null;
    this.selectionRequestHandler = null;
  }

  mount(hostElement) {
    if (!hostElement) throw new TypeError('ViewportRenderer requires a host element.');
    if (this.backend) return;
    this.hostElement = hostElement;

    if (this.backendPreference === 'canvas2d') {
      this.mountCanvasBackend();
      return;
    }

    try {
      this.backend = new ThreeViewportBackend();
      this.backend.mount(hostElement);
      this.backend.setSelectionRequestHandler(this.selectionRequestHandler);
      this.backendName = 'webgl';
    } catch (error) {
      this.lastError = error;
      this.backend?.destroy?.();
      this.backend = new BlockedWebGlBackend(error);
      this.backend.mount(hostElement);
      this.backendName = 'webgl-blocked';
      hostElement.dataset.viewportBlocked = 'true';
    }
  }

  setSelectionRequestHandler(callback) {
    if (callback !== null && typeof callback !== 'function') {
      throw new TypeError('Viewport selection handler must be a function or null.');
    }
    this.selectionRequestHandler = callback;
    this.backend?.setSelectionRequestHandler(callback);
  }

  renderModel(model, presentation = {}) {
    this.requireBackend().renderModel(model, presentation);
  }

  clear() {
    this.requireBackend().clear();
  }

  setSelection(entityId) {
    this.requireBackend().setSelection(entityId);
  }

  fitView() {
    this.requireBackend().fitView();
  }

  fitSelection() {
    this.requireBackend().fitSelection?.();
  }

  pivotSelection() { this.requireBackend().pivotSelection?.(); }

  home() {
    this.requireBackend().home?.();
  }

  setStandardView(preset) {
    this.requireBackend().setStandardView?.(preset);
  }

  previousView() { this.requireBackend().previousView?.(); }

  toggleProjection() { this.requireBackend().toggleProjection?.(); }

  setInteractionContext(mode) {
    this.requireBackend().setInteractionContext?.(mode);
  }

  getCapabilities() {
    return this.requireBackend().getCapabilities?.() || {};
  }

  resetView() {
    if (this.requireBackend().resetView) {
      this.requireBackend().resetView();
    } else {
      this.home();
    }
  }

  resize() {
    this.requireBackend().resize();
  }

  destroy() {
    this.backend?.setSelectionRequestHandler(null);
    this.backend?.destroy();
    this.backend = null;
    this.backendName = 'destroyed';
    this.selectionRequestHandler = null;
    if (this.hostElement) {
      delete this.hostElement.dataset.viewportBlocked;
      this.hostElement.replaceChildren();
    }
    this.hostElement = null;
  }

  mountCanvasBackend() {
    const backend = new Canvas2DViewportBackend();
    backend.mount(this.hostElement);
    backend.setSelectionRequestHandler(this.selectionRequestHandler);
    this.backend = backend;
    this.backendName = 'canvas2d';
  }

  requireBackend() {
    if (!this.backend) throw new Error('ViewportRenderer is not mounted.');
    return this.backend;
  }
}

class BlockedWebGlBackend {
  constructor(error) { this.message = `WebGL BLOCKED: ${error instanceof Error ? error.message : String(error)}`; this.hostElement = null; }
  mount(hostElement) { this.hostElement = hostElement; this.hostElement.textContent = this.message; }
  renderModel() { throw new Error(this.message); }
  clear() { if (this.hostElement) this.hostElement.textContent = this.message; }
  setSelectionRequestHandler() {}
  setSelection() {}
  getCapabilities() { return { select: false, orbit: false, pan: false, fitAll: false, fitSelection: false, pivot: false, home: false, orthographic: false, standardViews: false }; }
  resize() {}
  destroy() { this.hostElement?.replaceChildren(); this.hostElement = null; }
}
