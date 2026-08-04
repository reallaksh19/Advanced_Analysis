/** M004 engineering-axis HUD, M005 transactional optimization and M006 orientation presentation. */
import * as THREE from 'three';
import { ViewportAxisHUD } from '../viewport-axis-hud.js';
import { ENGINEERING_TO_RENDER_MATRIX4_ELEMENTS } from './topology-edit-coordinate-transform.js';
import { createTopologyEditOrientationSnapshot } from './topology-edit-orientation-contract.js';
import { TopologyEditOrientationCubeRuntime } from './topology-edit-orientation-cube-runtime.js';
import { optimizeTopologyEditRenderGroups } from './topology-edit-render-optimizer.js';
import { TopologyEditSupportViewportBackend } from './topology-edit-support-viewport-backend.js';

export class TopologyEditNavigationHudViewportBackend extends TopologyEditSupportViewportBackend {
  constructor(options = {}) {
    super(options);
    this.axisHud = null;
    this.orientationCube = null;
    this.renderOptimizationEvidence = null;
  }

  mount(host) {
    super.mount(host);
    try {
      this.axisHud = new ViewportAxisHUD({ basisQuaternion: engineeringBasisQuaternion() });
      this.orientationCube = new TopologyEditOrientationCubeRuntime();
      this.orientationCube.mount(host);
      this.renderer.domElement.tabIndex = 0;
      this.invalidate('orientation-presentation-mount');
    } catch (error) {
      this.orientationCube?.destroy();
      this.orientationCube = null;
      this.axisHud?.dispose();
      this.axisHud = null;
      super.destroy();
      throw error;
    }
  }

  /**
   * Keep the GPU picker as the preferred dense-scene identity source, but do
   * not allow its pixel-radius candidate to suppress a valid exact ray hit.
   * A nearby GPU object can legitimately fail exact-point resolution; in that
   * case the governed raycaster fallback must still decide the selection.
   */
  pickAt(clientX, clientY) {
    if (this.contextLost || this.configurationError) return null;
    const context = this.pickContext(clientX, clientY);
    if (!context) return null;
    const gpuHit = this.gpuPicker?.pick({
      clientX,
      clientY,
      rect: context.rect,
      camera: this.activeCamera,
    });
    if (gpuHit) {
      const point = this.resolveGpuPickPoint(gpuHit, context.pointer);
      if (point) return this.pickReceipt(gpuHit.target, point);
    }
    return this.pickWithRaycaster(context.pointer);
  }

  renderSession(model) {
    this.renderOptimizationEvidence = null;
    super.renderSession(model);
    this.renderOptimizationEvidence = optimizeTopologyEditRenderGroups(this.groups);
    this.engineeringRoot.updateMatrixWorld(true);
    this.invalidate('render-resource-optimization');
  }

  orientationSnapshot() {
    if (!this.activeCamera || !this.controls) {
      throw new Error('TOPOLOGY_EDIT_ORIENTATION_CAMERA_UNAVAILABLE: Active camera and controls are required.');
    }
    const direction = this.activeCamera.position.clone().sub(this.controls.target);
    if (!(direction.lengthSq() > 1e-24)) {
      throw new Error('TOPOLOGY_EDIT_ORIENTATION_CAMERA_DIRECTION_INVALID: Camera and target must differ.');
    }
    direction.normalize();
    return createTopologyEditOrientationSnapshot({
      projection: this.activeCamera.isOrthographicCamera ? 'ORTHOGRAPHIC' : 'PERSPECTIVE',
      quaternion: {
        x: this.activeCamera.quaternion.x,
        y: this.activeCamera.quaternion.y,
        z: this.activeCamera.quaternion.z,
        w: this.activeCamera.quaternion.w,
      },
      cameraDirection: { x: direction.x, y: direction.y, z: direction.z },
    });
  }

  renderFrame() {
    const shouldRender = Boolean(
      this.renderDirty && this.isMounted && this.renderer && !this.contextLost,
    );
    super.renderFrame();
    if (!shouldRender || !this.hostElement || !this.activeCamera || !this.controls) return;
    if (this.axisHud) {
      const width = Math.max(this.hostElement.clientWidth, 1);
      const height = Math.max(this.hostElement.clientHeight, 1);
      this.axisHud.updateOrientation(this.activeCamera);
      this.axisHud.render(this.renderer, width, height);
    }
    this.orientationCube?.update(this.orientationSnapshot());
  }

  destroy() {
    this.orientationCube?.destroy();
    this.orientationCube = null;
    this.axisHud?.dispose();
    this.axisHud = null;
    this.renderOptimizationEvidence = null;
    super.destroy();
  }
}

export function engineeringBasisQuaternion() {
  const matrix = new THREE.Matrix4().fromArray([...ENGINEERING_TO_RENDER_MATRIX4_ELEMENTS]);
  return new THREE.Quaternion().setFromRotationMatrix(matrix).normalize();
}
