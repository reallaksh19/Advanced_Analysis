const MAX_POINTER_TRAVEL_PX = 5;

export class ThreeInteractionArbiter {
  constructor(canvas, controls, callbacks) {
    this.canvas = canvas;
    this.controls = controls;
    this.callbacks = callbacks; // { onSelect, onFitSelection, onClearSelection }
    this.mode = 'select'; // 'select' | 'orbit' | 'pan'
    
    // Disable OrbitControls' default pointer listeners since the Arbiter handles them
    this.controls.enabled = false;

    this.pointerStart = null;
    this.pointerDownTime = 0;
    this.lastClickTime = 0;
    this.doubleClickThreshold = 250;
    this.clickDelayTimer = null;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    document.addEventListener('keydown', this.handleKeyDown);
  }

  setMode(mode) {
    this.mode = mode;
  }

  handlePointerDown(event) {
    if (event.__simulated) return;
    if (this.pointerStart) return; // already tracking a pointer
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    
    this.pointerStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      button: event.button
    };
    this.pointerDownTime = performance.now();
    this.canvas.setPointerCapture(event.pointerId);

    // Pass event to OrbitControls if it's a drag action
    this.controls.enabled = true;
    
    // Map buttons to controls state if not in 'select' mode or if right/middle clicking
    // OrbitControls natively maps: Left=Rotate, Middle=Zoom, Right=Pan
    // We override this based on our mode.
    if (this.mode === 'orbit' || event.button === 2) {
      this.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 }; // 0 = rotate
      if (event.button === 0) this.simulateEvent(this.controls, 'pointerdown', event, 0); // orbit
      else if (event.button === 2) this.simulateEvent(this.controls, 'pointerdown', event, 2); // pan
    } else if (this.mode === 'pan' || event.button === 1 || (event.button === 0 && event.shiftKey)) {
      this.controls.mouseButtons = { LEFT: 2, MIDDLE: 1, RIGHT: 2 }; // 2 = pan
      this.simulateEvent(this.controls, 'pointerdown', event, 2);
    }
  }

  handlePointerMove(event) {
    if (event.__simulated) return;
    if (!this.pointerStart || this.pointerStart.pointerId !== event.pointerId) return;
    
    // Determine if drag threshold is crossed
    const dist = Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y);
    if (dist > MAX_POINTER_TRAVEL_PX) {
      if (this.clickDelayTimer) {
        clearTimeout(this.clickDelayTimer);
        this.clickDelayTimer = null;
      }
    }
    
    this.simulateEvent(this.controls, 'pointermove', event, this.pointerStart.button);
  }

  handlePointerUp(event) {
    if (event.__simulated) return;
    const start = this.pointerStart;
    this.pointerStart = null;
    this.canvas.releasePointerCapture(event.pointerId);

    if (!start || start.pointerId !== event.pointerId) return;

    this.simulateEvent(this.controls, 'pointerup', event, start.button);
    this.controls.enabled = false;

    // Check if it qualifies as a click
    const timeElapsed = performance.now() - this.pointerDownTime;
    const dist = Math.hypot(event.clientX - start.x, event.clientY - start.y);

    if (dist <= MAX_POINTER_TRAVEL_PX && timeElapsed < 300) {
      // It's a click
      if (start.button === 0 && (this.mode === 'select' || this.mode === 'orbit')) {
        const now = performance.now();
        if (now - this.lastClickTime < this.doubleClickThreshold) {
          // Double click
          clearTimeout(this.clickDelayTimer);
          this.clickDelayTimer = null;
          this.lastClickTime = 0;
          this.callbacks.onFitSelection?.(event);
        } else {
          // Single click
          this.lastClickTime = now;
          this.clickDelayTimer = setTimeout(() => {
            this.callbacks.onSelect?.(event);
          }, this.doubleClickThreshold);
          // If we want immediate feedback without waiting for double click:
          // this.callbacks.onSelect?.(event);
        }
      }
    }
  }

  handlePointerCancel(event) {
    if (event.__simulated) return;
    this.pointerStart = null;
    if (this.pointerStart && this.pointerStart.pointerId === event.pointerId) {
      this.simulateEvent(this.controls, 'pointercancel', event, this.pointerStart.button);
      this.pointerStart = null;
      this.controls.enabled = false;
    }
  }

  handleWheel(event) {
    this.controls.enabled = true;
    this.controls.domElement.dispatchEvent(new WheelEvent('wheel', event));
    this.controls.enabled = false;
  }

  handleKeyDown(event) {
    if (document.activeElement.matches('input, textarea, [contenteditable]')) return;
    
    if (event.key === 'Escape') {
      if (this.pointerStart) {
        // Abort drag
        this.pointerStart = null;
        this.controls.enabled = false;
      } else {
        // Clear selection
        this.callbacks.onClearSelection?.();
      }
    }
  }

  simulateEvent(controls, type, originalEvent, button) {
    // OrbitControls attaches listeners to the domElement
    const evt = new PointerEvent(type, {
      pointerId: originalEvent.pointerId,
      clientX: originalEvent.clientX,
      clientY: originalEvent.clientY,
      button: button,
      buttons: originalEvent.buttons,
      pointerType: originalEvent.pointerType,
      bubbles: true,
      cancelable: true
    });
    evt.__simulated = true;
    controls.domElement.dispatchEvent(evt);
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    document.removeEventListener('keydown', this.handleKeyDown);
    if (this.clickDelayTimer) clearTimeout(this.clickDelayTimer);
  }
}
