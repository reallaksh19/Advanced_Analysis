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
    this.handlePointerMove = (event) => this.pointerMove(event);
    this.handlePointerUp = (event) => this.pointerUp(event);
    this.handlePointerCancel = (event) => this.cancelPointer(event?.pointerId);
    this.handleLostPointerCapture = (event) => this.lostPointerCapture(event);
    this.handleKeyDown = (event) => this.keyDown(event);
    this.handleVisibilityChange = () => {
      if (this.ownerDocument.visibilityState === 'hidden') this.cancelPointer();
    };
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerCancel);
    canvas.addEventListener('lostpointercapture', this.handleLostPointerCapture);
    this.ownerDocument.addEventListener('keydown', this.handleKeyDown);
    this.ownerDocument.addEventListener('visibilitychange', this.handleVisibilityChange);
    controls.enabled = true;
    this.setMode('select');
  }

  setMode(mode) {
    if (!['select', 'orbit', 'pan'].includes(mode)) throw new TypeError(`Unsupported WebGL interaction mode: ${mode}`);
    this.cancelPointer();
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
    if (this.pointerStart && this.pointerStart.pointerId !== event.pointerId) {
      this.cancelPointer();
    }
    const startedAt = performance.now();
    this.pointerStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt,
      maximumTravelSquared: 0,
    };
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  pointerMove(event) {
    const start = this.pointerStart;
    if (!start || start.pointerId !== event.pointerId) return;
    const travelSquared = squaredTravel(start, event);
    start.maximumTravelSquared = Math.max(start.maximumTravelSquared, travelSquared);
  }

  pointerUp(event) {
    const start = this.pointerStart;
    if (!start || start.pointerId !== event.pointerId) return;
    this.pointerMove(event);
    this.pointerStart = null;
    this.releasePointerCapture(event.pointerId);
    if (this.mode !== 'select') return;
    const elapsed = performance.now() - start.startedAt;
    const toleranceSquared = this.configuration.clickTravelTolerancePx ** 2;
    if (start.maximumTravelSquared > toleranceSquared || elapsed > this.configuration.clickTimingMs) return;
    const clickedAt = performance.now();
    this.callbacks.onSelect?.(event);
    if (this.lastClickAt !== null && clickedAt - this.lastClickAt <= this.configuration.doubleClickTimingMs) {
      this.callbacks.onFitSelection?.(event);
      this.lastClickAt = null;
    } else this.lastClickAt = clickedAt;
  }

  lostPointerCapture(event) {
    if (this.pointerStart?.pointerId === event.pointerId) this.pointerStart = null;
  }

  cancelPointer(pointerId = null) {
    const active = this.pointerStart;
    if (!active || (pointerId !== null && active.pointerId !== pointerId)) return;
    this.pointerStart = null;
    this.releasePointerCapture(active.pointerId);
  }

  releasePointerCapture(pointerId) {
    if (this.canvas.hasPointerCapture?.(pointerId)) this.canvas.releasePointerCapture(pointerId);
  }

  keyDown(event) {
    if (this.ownerDocument.activeElement?.matches?.('input, textarea, [contenteditable]')) return;
    if (event.key === 'Escape') {
      this.setMode('select');
      this.callbacks.onClearSelection?.();
    }
  }

  dispose() {
    this.cancelPointer();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.removeEventListener('lostpointercapture', this.handleLostPointerCapture);
    this.ownerDocument.removeEventListener('keydown', this.handleKeyDown);
    this.ownerDocument.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.lastClickAt = null;
  }
}

function squaredTravel(start, event) {
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  return (dx * dx) + (dy * dy);
}

function assertConfiguration(value) {
  if (!value || !Number.isFinite(value.clickTravelTolerancePx) || value.clickTravelTolerancePx <= 0 || !Number.isFinite(value.clickTimingMs) || value.clickTimingMs <= 0 || !Number.isFinite(value.doubleClickTimingMs) || value.doubleClickTimingMs <= 0) throw new TypeError('WebGL interaction requires approved click travel and timing values.');
}
