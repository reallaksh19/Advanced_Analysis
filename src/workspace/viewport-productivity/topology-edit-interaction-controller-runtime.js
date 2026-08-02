import * as THREE from 'three';
import {
  createTopologyEditGizmoModel,
} from '../viewport-interaction/topology-edit-gizmo-model.js';
import {
  TopologyEditInteractionViewportAdapter,
} from '../viewport-interaction/topology-edit-interaction-viewport-adapter.js';
import {
  createTopologyEditDragSessionPreview,
  selectedTopologyEditNodeContext,
} from './topology-edit-interaction-session.js';

export class TopologyEditInteractionControllerRuntime {
  constructor(controller) {
    if (!controller) throw new TypeError('Interaction controller runtime requires a controller.');
    this.controller = controller;
    this.viewport = null;
    this.gizmo = null;
    this.activeMode = null;
  }

  mount() {
    this.destroy();
    const backend = this.controller.viewportBackend;
    if (!backend) throw new Error('Topology-edit viewport backend is unavailable.');
    this.viewport = new TopologyEditInteractionViewportAdapter({
      backend,
      onDragStart: ({ mode }) => this.beginDrag(mode),
      onDragMove: ({ mode, targetPosition }) => this.previewDrag(mode, targetPosition, false),
      onDragEnd: ({ mode, targetPosition }) => this.endDrag(mode, targetPosition),
      onCancel: ({ reason }) => this.cancelDrag(reason),
      onKey: (event) => this.controller.handleInteractionKey(event),
    });
    this.viewport.mount();
    this.sync();
  }

  sync() {
    if (!this.viewport) return;
    const context = this.selectedContext();
    if (!context) {
      this.gizmo = null;
      this.viewport.render(null);
      return;
    }
    const backend = this.controller.viewportBackend;
    const camera = backend?.activeCamera;
    const canvas = backend?.renderer?.domElement;
    if (!camera || !canvas) {
      this.gizmo = null;
      this.viewport.render(null);
      return;
    }
    const anchor = new THREE.Vector3(
      context.anchorPosition.x,
      context.anchorPosition.y,
      context.anchorPosition.z,
    );
    const cameraDistanceMm = Math.max(camera.position.distanceTo(anchor), 0.001);
    this.gizmo = createTopologyEditGizmoModel({
      nodeId: context.nodeId,
      basisHash: context.basisHash,
      anchorPosition: context.anchorPosition,
      cameraDistanceMm,
      viewportHeightPx: canvas.clientHeight || 500,
      perspectiveFovDeg: camera.isPerspectiveCamera ? camera.fov : 45,
    });
    this.viewport.render(this.gizmo, this.controller.interactionPreview);
  }

  beginDrag(mode) {
    this.activeMode = mode;
    this.controller.interactionError = null;
    this.controller.setStatus(`Dragging ${mode}; preview remains display-only.`);
  }

  previewDrag(mode, targetPosition, announce) {
    try {
      const preview = createTopologyEditDragSessionPreview({
        topology: this.controller.session?.currentTopology(),
        selection: this.controller.selection,
        transformMode: mode,
        targetPosition,
      });
      this.controller.retainInteractionPreview(
        preview,
        `${mode} gizmo preview updated`,
        announce,
      );
    } catch (error) {
      this.controller.rejectInteraction(error);
    }
  }

  endDrag(mode, targetPosition) {
    this.activeMode = null;
    if (targetPosition) {
      this.previewDrag(mode, targetPosition, true);
      return;
    }
    this.controller.cancelInteractionPreview(false);
  }

  cancelDrag(reason) {
    this.activeMode = null;
    this.controller.cancelInteractionPreview(false);
    if (reason !== 'DESTROYED') {
      this.controller.setStatus(`Gizmo drag cancelled: ${reason}.`);
    }
  }

  selectedContext() {
    try {
      return selectedTopologyEditNodeContext(
        this.controller.session?.currentTopology(),
        this.controller.selection,
      );
    } catch {
      return null;
    }
  }

  destroy() {
    this.viewport?.destroy();
    this.viewport = null;
    this.gizmo = null;
    this.activeMode = null;
  }
}

export function axisDirection(axisInput) {
  const axis = String(axisInput ?? '').trim().toUpperCase();
  if (!['X', 'Y', 'Z'].includes(axis)) {
    throw new RangeError('Axis must be X, Y or Z.');
  }
  return {
    x: axis === 'X' ? 1 : 0,
    y: axis === 'Y' ? 1 : 0,
    z: axis === 'Z' ? 1 : 0,
  };
}

export function isTopologyEditTextControl(target) {
  const name = String(target?.tagName ?? '').toUpperCase();
  return Boolean(
    target?.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(name),
  );
}
