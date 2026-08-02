import * as THREE from 'three';
import {
  clearTopologyEditGizmoGroup,
  renderTopologyEditGizmoGroup,
} from './topology-edit-gizmo-three-renderer.js';

const AXES = Object.freeze({
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
});

export class TopologyEditInteractionViewportAdapter {
  constructor({
    backend,
    onDragStart = () => {},
    onDragMove = () => {},
    onDragEnd = () => {},
    onCancel = () => {},
    onKey = () => {},
  } = {}) {
    if (!backend?.groups?.transientGroup || !backend?.activeCamera) {
      throw new TypeError('Interaction viewport adapter requires a topology viewport backend.');
    }
    this.backend = backend;
    this.onDragStart = requiredCallback(onDragStart, 'onDragStart');
    this.onDragMove = requiredCallback(onDragMove, 'onDragMove');
    this.onDragEnd = requiredCallback(onDragEnd, 'onDragEnd');
    this.onCancel = requiredCallback(onCancel, 'onCancel');
    this.onKey = requiredCallback(onKey, 'onKey');
    this.group = new THREE.Group();
    this.group.userData.nonPickable = true;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.activeDrag = null;
    this.canvas = null;
    this.previousTabIndex = null;
    this.gizmoModel = null;
    this.pointerDownHandler = (event) => this.handlePointerDown(event);
    this.pointerMoveHandler = (event) => this.handlePointerMove(event);
    this.pointerUpHandler = (event) => this.handlePointerUp(event);
    this.pointerCancelHandler = (event) => this.handlePointerCancel(event);
    this.keyHandler = (event) => this.onKey(event);
  }

  mount() {
    const canvas = this.backend.renderer?.domElement;
    if (!canvas) throw new Error('Interaction viewport canvas is unavailable.');
    this.destroy();
    this.canvas = canvas;
    this.previousTabIndex = canvas.getAttribute('tabindex');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Professional topology-edit viewport');
    this.backend.groups.transientGroup.add(this.group);
    canvas.addEventListener('pointerdown', this.pointerDownHandler, true);
    canvas.addEventListener('pointermove', this.pointerMoveHandler, true);
    canvas.addEventListener('pointerup', this.pointerUpHandler, true);
    canvas.addEventListener('pointercancel', this.pointerCancelHandler, true);
    canvas.addEventListener('keydown', this.keyHandler);
  }

  render(gizmoModel, preview = null) {
    this.gizmoModel = gizmoModel ?? null;
    renderTopologyEditGizmoGroup(this.group, gizmoModel, preview);
  }

  releasePointer(reason = 'RELEASED') {
    const active = this.activeDrag;
    if (!active) return false;
    if (this.canvas?.hasPointerCapture?.(active.pointerId)) {
      this.canvas.releasePointerCapture(active.pointerId);
    }
    this.activeDrag = null;
    return reason;
  }

  destroy() {
    if (this.activeDrag) {
      this.releasePointer('DESTROYED');
      this.onCancel({ reason: 'DESTROYED' });
    }
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.pointerDownHandler, true);
      this.canvas.removeEventListener('pointermove', this.pointerMoveHandler, true);
      this.canvas.removeEventListener('pointerup', this.pointerUpHandler, true);
      this.canvas.removeEventListener('pointercancel', this.pointerCancelHandler, true);
      this.canvas.removeEventListener('keydown', this.keyHandler);
      if (this.previousTabIndex === null) this.canvas.removeAttribute('tabindex');
      else this.canvas.setAttribute('tabindex', this.previousTabIndex);
    }
    this.group.parent?.remove(this.group);
    clearTopologyEditGizmoGroup(this.group);
    this.canvas = null;
    this.gizmoModel = null;
    this.previousTabIndex = null;
  }

  handlePointerDown(event) {
    if (event.button !== 0 || !this.gizmoModel || this.activeDrag) return;
    const mode = this.pickHandleMode(event);
    if (!mode) return;
    markHandled(event);
    this.canvas?.focus({ preventScroll: true });
    const anchor = new THREE.Vector3(
      this.gizmoModel.anchorPosition.x,
      this.gizmoModel.anchorPosition.y,
      this.gizmoModel.anchorPosition.z,
    );
    this.activeDrag = {
      pointerId: event.pointerId,
      mode,
      anchor,
      plane: dragPlane(mode, anchor, this.backend.activeCamera),
    };
    this.canvas?.setPointerCapture?.(event.pointerId);
    this.onDragStart({ mode, pointerId: event.pointerId });
  }

  handlePointerMove(event) {
    if (!this.isActivePointer(event)) return;
    markHandled(event);
    const target = this.pointerTarget(event, this.activeDrag);
    if (!target) return;
    this.onDragMove({
      mode: this.activeDrag.mode,
      pointerId: event.pointerId,
      targetPosition: pointRecord(target),
    });
  }

  handlePointerUp(event) {
    if (!this.isActivePointer(event)) return;
    markHandled(event);
    const active = this.activeDrag;
    const target = this.pointerTarget(event, active);
    this.releasePointer('COMPLETED');
    this.onDragEnd({
      mode: active.mode,
      pointerId: event.pointerId,
      targetPosition: target ? pointRecord(target) : null,
    });
  }

  handlePointerCancel(event) {
    if (!this.isActivePointer(event)) return;
    markHandled(event);
    this.releasePointer('POINTER_CANCELLED');
    this.onCancel({ reason: 'POINTER_CANCELLED' });
  }

  isActivePointer(event) {
    return Boolean(
      this.activeDrag
      && event.pointerId === this.activeDrag.pointerId,
    );
  }

  pickHandleMode(event) {
    const context = pointerContext(this.canvas, event, this.pointer);
    if (!context) return null;
    this.raycaster.setFromCamera(context, this.backend.activeCamera);
    const hit = this.raycaster.intersectObjects(this.group.children, true)
      .find((row) => interactionMode(row.object));
    return hit ? interactionMode(hit.object) : null;
  }

  pointerTarget(event, active) {
    const context = pointerContext(this.canvas, event, this.pointer);
    if (!context) return null;
    this.raycaster.setFromCamera(context, this.backend.activeCamera);
    const point = this.raycaster.ray.intersectPlane(
      active.plane,
      new THREE.Vector3(),
    );
    if (!point) return null;
    const axis = axisForMode(active.mode);
    if (!axis) return point;
    const distance = point.clone().sub(active.anchor).dot(axis);
    return active.anchor.clone().addScaledVector(axis, distance);
  }
}

function dragPlane(mode, anchor, camera) {
  const planeNormal = planeNormalForMode(mode);
  if (planeNormal) {
    return new THREE.Plane().setFromNormalAndCoplanarPoint(
      planeNormal,
      anchor,
    );
  }
  const axis = axisForMode(mode);
  const cameraDirection = camera.getWorldDirection(new THREE.Vector3());
  let side = cameraDirection.clone().cross(axis);
  if (side.lengthSq() < 1e-10) {
    side = Math.abs(axis.y) < 0.9
      ? AXES.Y.clone().cross(axis)
      : AXES.X.clone().cross(axis);
  }
  const normal = axis.clone().cross(side).normalize();
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, anchor);
}

function planeNormalForMode(mode) {
  if (mode === 'PLANE_XY') return AXES.Z;
  if (mode === 'PLANE_YZ') return AXES.X;
  if (mode === 'PLANE_XZ') return AXES.Y;
  return null;
}

function axisForMode(mode) {
  return mode?.startsWith('AXIS_')
    ? AXES[mode.slice(-1)] ?? null
    : null;
}

function pointerContext(canvas, event, target) {
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height) return null;
  target.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  return target;
}

function interactionMode(object) {
  let current = object;
  while (current) {
    if (current.userData?.interactionMode) return current.userData.interactionMode;
    current = current.parent;
  }
  return null;
}

function pointRecord(point) {
  return { x: point.x, y: point.y, z: point.z };
}

function markHandled(event) {
  event.topologyEditInteractionHandled = true;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function requiredCallback(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError(`${label} must be a function.`);
  }
  return value;
}
