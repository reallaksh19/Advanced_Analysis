import * as THREE from 'three';

/**
 * Creates and manages a mini-scene for the bottom-left axis HUD.
 */
export class ViewportAxisHUD {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld(true);
    this.axisGroup = new THREE.Group();
    this.axisGroup.add(new THREE.AxesHelper(1));
    this.scene.add(this.axisGroup);
    this.mainCameraQuaternion = new THREE.Quaternion();
    this.disposed = false;
  }

  /**
   * Rotates the axis triad opposite to the main camera's world orientation.
   * @param {THREE.Camera} mainCamera
   */
  updateOrientation(mainCamera) {
    if (this.disposed) return;
    mainCamera.getWorldQuaternion(this.mainCameraQuaternion);
    this.axisGroup.quaternion.copy(this.mainCameraQuaternion).invert();
    this.axisGroup.updateMatrixWorld(true);
  }

  /**
   * Renders the HUD in the bottom left corner of the main renderer.
   * @param {THREE.WebGLRenderer} renderer
   * @param {number} width Main canvas width
   * @param {number} height Main canvas height
   */
  render(renderer, width, height) {
    if (this.disposed) return;
    const previousViewport = renderer.getViewport(new THREE.Vector4());
    const previousScissor = renderer.getScissor(new THREE.Vector4());
    const previousScissorTest = renderer.getScissorTest();
    try {
      const size = Math.max(Math.min(100, width - 20, height - 20), 1);
      renderer.setViewport(10, 10, size, size);
      renderer.setScissor(10, 10, size, size);
      renderer.setScissorTest(true);
      renderer.clearDepth();
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setViewport(previousViewport);
      renderer.setScissor(previousScissor);
      renderer.setScissorTest(previousScissorTest);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const scene = this.scene;
    scene.traverse((object) => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => material.dispose?.());
    });
    scene.clear();
    this.axisGroup = null;
    this.mainCameraQuaternion = null;
    this.camera = null;
    this.scene = null;
  }
}
