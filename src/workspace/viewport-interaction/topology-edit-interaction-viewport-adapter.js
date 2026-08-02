import * as THREE from 'three';
import {
  finiteTopologyEditPoint,
} from './topology-edit-interaction-values.js';

const AXES = Object.freeze({
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
});

const COLORS = Object.freeze({
  X: 0xef4444,
  Y: 0x22c55e,
  Z: 0x3b82f6,
  ANCHOR: 0xf8fafc,
  TARGET: 0xf59e0b,
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
    this.keyHandler = (event) => this.handleKey(event);
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
    this.clearGroup();
    this.gizmoModel = gizmoModel ?? null;
    if (!gizmoModel) return;
    const anchor = finiteTopologyEditPoint(
      gizmoModel.anchorPosition,
      'gizmo.anchorPosition',
    );
    const scale = Number(gizmoModel.scaleMm);
    if (!(scale > 0)) throw new RangeError('Gizmo scale must be positive.');
    this.group.position.set(anchor.x, anchor.y, anchor.z);
    this.group.add(markerMesh(scale * 0.065, COLORS.ANCHOR));
    for (const handle of gizmoModel.handles ?? []) {
      if (handle.kind === 'AXIS') this.group.add(axisHandle(handle.mode, scale));
      if (handle.kind === 'PLANE') this.group.add(planeHandle(handle.mode, scale));
    }
    if (preview?.targetPosition) {
      const target = finiteTopologyEditPoint(
        preview.targetPosition,
        'preview.targetPosition',
      );
      const marker = markerMesh(scale * 0.08, COLORS.TARGET);
      marker.position.set(
        target.x - anchor.x,
        target.y - anchor.y,
        target.z - anchor.z,
      );
      marker.userData.nonPickable = true;
      this.group.add(marker);
    }
  }

  clearPreview() {
    if (this.gizmoModel) this.render(this.gizmoModel, null);
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
    this.clearGroup();
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
    if (!this.activeDrag || event.pointerId !== this.activeDrag.pointerId) return;
    markHandled(event);
    const target = this.pointerTarget(event, this.activeDrag);
    if (!target) return;
    this.onDragMove({
      mode: this.activeDrag.mode,
      pointerId: event.pointerId,
      targetPosition: { x: target.x, y: target.y, z: target.z },
    });
  }

  handlePointerUp(event) {
    if (!this.activeDrag || event.pointerId !== this.activeDrag.pointerId) return;
    markHandled(event);
    const mode = this.activeDrag.mode;
    const target = this.pointerTarget(event, this.activeDrag);
    this.releasePointer('COMPLETED');
    this.onDragEnd({
      mode,
      pointerId: event.pointerId,
      targetPosition: target
        ? { x: target.x, y: target.y, z: target.z }
        : null,
    });
  }

  handlePointerCancel(event) {
    if (!this.activeDrag || event.pointerId !== this.activeDrag.pointerId) return;
    markHandled(event);
    this.releasePointer('POINTER_CANCELLED');
    this.onCancel({ reason: 'POINTER_CANCELLED' });
  }

  handleKey(event) {
    this.onKey(event);
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

  clearGroup() {
    disposeObject(this.group);
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    this.group.position.set(0, 0, 0);
  }
}

function axisHandle(mode, scale) {
  const axisName = mode.slice(-1);
  const axis = AXES[axisName];
  const root = new THREE.Group();
  root.userData.interactionMode = mode;
  const material = new THREE.MeshBasicMaterial({ color: COLORS[axisName] });
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.025, scale * 0.025, scale * 0.7, 12),
    material,
  );
  shaft.position.copy(axis).multiplyScalar(scale * 0.35);
  shaft.quaternion.setFromUnitVectors(AXES.Y, axis);
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(scale * 0.07, scale * 0.2, 16),
    material,
  );
  head.position.copy(axis).multiplyScalar(scale * 0.8);
  head.quaternion.setFromUnitVectors(AXES.Y, axis);
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.08, scale * 0.08, scale, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.01, depthWrite: false }),
  );
  hit.position.copy(axis).multiplyScalar(scale * 0.5);
  hit.quaternion.setFromUnitVectors(AXES.Y, axis);
  hit.userData.interactionMode = mode;
  root.add(shaft, head, hit);
  return root;
}

function planeHandle(mode, scale) {
  const axes = mode.slice(-2).split('');
  const root = new THREE.Group();
  root.userData.interactionMode = mode;
  const material = new THREE.MeshBasicMaterial({
    color: COLORS[axes[0]],
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(scale * 0.24, scale * 0.24),
    material,
  );
  mesh.position.copy(AXES[axes[0]]).add(AXES[axes[1]]).multiplyScalar(scale * 0.22);
  if (mode === 'PLANE_YZ') mesh.rotation.y = Math.PI / 2;
  if (mode === 'PLANE_XZ') mesh.rotation.x = Math.PI / 2;
  mesh.userData.interactionMode = mode;
  root.add(mesh);
  return root;
}

function markerMesh(radius, color) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    new THREE.MeshBasicMaterial({ color }),
  );
  mesh.userData.nonPickable = true;
  return mesh;
}

function dragPlane(mode, anchor, camera) {
  const planeNormal = planeNormalForMode(mode);
  if (planeNormal) return new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, anchor);
  const axis = axisForMode(mode);
  const cameraDirection = camera.getWorldDirection(new THREE.Vector3());
  let side = cameraDirection.clone().cross(axis);
  if (side.lengthSq() < 1e-10) {
    side = Math.abs(axis.y) < 0.9 ? AXES.Y.clone().cross(axis) : AXES.X.clone().cross(axis);
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
  return mode?.startsWith('AXIS_') ? AXES[mode.slice(-1)] ?? null : null;
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

function markHandled(event) {
  event.topologyEditInteractionHandled = true;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function disposeObject(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const rows = Array.isArray(object.material) ? object.material : [object.material];
    rows.filter(Boolean).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function requiredCallback(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function.`);
  return value;
}
