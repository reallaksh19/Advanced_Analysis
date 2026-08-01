/**
 * Separates immediate selection from OrbitControls navigation. Timing and
 * pointer travel limits are supplied by approved Project Data.
 */
export class ThreeInteractionArbiter {
  constructor(canvas, controls, callbacks, configuration) {
    assertConfiguration(configuration);
    this.canvas = canvas;
    this.controls = controls;
    this.callbacks = callbacks;
    this.configuration = configuration;
    this.mode = 'select';
    this.pointerStart = null;
    this.lastClickAt = null;
    this.ownerDocument = canvas.ownerDocument;
    this.handlePointerDown = (event) => this.pointerDown(event);
    this.handlePointerUp = (event) => this.pointerUp(event);
    this.handlePointerCancel = () => { this.pointerStart = null; };
    this.handleKeyDown = (event) => this.keyDown(event);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerCancel);
    this.ownerDocument.addEventListener('keydown', this.handleKeyDown);
    controls.enabled = true;
    this.setMode('select');
  }

  setMode(mode) {
    if (!['select', 'orbit', 'pan'].includes(mode)) throw new TypeError(`Unsupported WebGL interaction mode: ${mode}`);
    this.mode = mode;
    this.controls.enableRotate = mode === 'orbit';
    this.controls.enablePan = mode === 'pan';
    this.controls.enableZoom = true;
  }

  updateConfiguration(configuration) {
    assertConfiguration(configuration);
    this.configuration = configuration;
  }

  pointerDown(event) {
    if (event.button !== 0) return;
    this.pointerStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startedAt: performance.now() };
  }

  pointerUp(event) {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!start || start.pointerId !== event.pointerId || this.mode !== 'select') return;
    const travel = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    const elapsed = performance.now() - start.startedAt;
    if (travel > this.configuration.clickTravelTolerancePx || elapsed > this.configuration.clickTimingMs) return;
    const clickedAt = performance.now();
    this.callbacks.onSelect?.(event);
    if (this.lastClickAt !== null && clickedAt - this.lastClickAt <= this.configuration.doubleClickTimingMs) {
      this.callbacks.onFitSelection?.(event);
      this.lastClickAt = null;
    } else this.lastClickAt = clickedAt;
  }

  keyDown(event) {
    if (this.ownerDocument.activeElement?.matches?.('input, textarea, [contenteditable]')) return;
    if (event.key === 'Escape') { this.setMode('select'); this.pointerStart = null; this.callbacks.onClearSelection?.(); }
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.ownerDocument.removeEventListener('keydown', this.handleKeyDown);
    this.pointerStart = null;
    this.lastClickAt = null;
  }
}

function assertConfiguration(value) {
  if (!value || !Number.isFinite(value.clickTravelTolerancePx) || value.clickTravelTolerancePx <= 0 || !Number.isFinite(value.clickTimingMs) || value.clickTimingMs <= 0 || !Number.isFinite(value.doubleClickTimingMs) || value.doubleClickTimingMs <= 0) throw new TypeError('WebGL interaction requires approved click travel and timing values.');
}
