/**
 * Topology Edit Draft — Phase 4 Pointer Drag Gesture Handler
 *
 * Binds pointer events to 3D pick targets, computes plane intersections,
 * and updates transient drag previews during interactive gestures.
 */

import { EDIT_TOOLS } from './topology-edit-tools-controller.js';

export class TopologyEditGestureHandler {
  constructor(viewportBackend, sessionController, toolsController) {
    this.viewportBackend = viewportBackend;
    this.sessionController = sessionController;
    this.toolsController = toolsController;
    this.isDragging = false;
    this.dragTarget = null;
    this.startPoint = null;
  }

  handlePointerDown(clientX, clientY) {
    const pick = this.viewportBackend?.pickAt(clientX, clientY);
    if (!pick) return null;

    this.isDragging = true;
    this.dragTarget = pick;
    this.startPoint = pick.point;

    return pick;
  }

  handlePointerMove(clientX, clientY) {
    if (!this.isDragging || !this.dragTarget) return null;

    const activeTool = this.toolsController?.getActiveTool();
    const currentPick = this.viewportBackend?.pickAt(clientX, clientY);
    const currentPoint = currentPick?.point || this.startPoint;

    // Transient Drag Preview
    const delta = {
      x: currentPoint.x - this.startPoint.x,
      y: currentPoint.y - this.startPoint.y,
      z: currentPoint.z - this.startPoint.z,
    };

    return Object.freeze({
      tool: activeTool,
      targetId: this.dragTarget.objectId,
      startPoint: this.startPoint,
      currentPoint: currentPoint,
      delta: delta,
    });
  }

  handlePointerUp() {
    if (!this.isDragging) return null;

    const gestureResult = {
      targetId: this.dragTarget?.objectId,
      startPoint: this.startPoint,
    };

    this.isDragging = false;
    this.dragTarget = null;
    this.startPoint = null;

    return Object.freeze(gestureResult);
  }
}
