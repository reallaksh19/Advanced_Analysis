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

    const axesHelper = new THREE.AxesHelper(1);
    this.scene.add(axesHelper);

    // Optional: Add X, Y, Z labels using sprites or text geometry,
    // but the AxesHelper provides the colored red/green/blue triad as a baseline.
  }

  /**
   * Syncs the HUD camera orientation with the main viewport camera.
   * @param {THREE.Camera} mainCamera
   */
  updateOrientation(mainCamera) {
    this.camera.quaternion.copy(mainCamera.quaternion);
    this.camera.updateMatrixWorld();
  }

  /**
   * Renders the HUD in the bottom left corner of the main renderer.
   * @param {THREE.WebGLRenderer} renderer 
   * @param {number} width Main canvas width
   * @param {number} height Main canvas height
   */
  render(renderer, width, height) {
    const size = 100; // 100px square for the HUD
    renderer.setViewport(10, 10, size, size);
    renderer.setScissor(10, 10, size, size);
    renderer.setScissorTest(true);
    
    renderer.render(this.scene, this.camera);
    
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
  }

  dispose() {
    this.scene.clear();
  }
}
