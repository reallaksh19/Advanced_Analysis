import * as THREE from 'three';

const SELECTION_COLOR = 0xfbbf24;

export class ThreeSelectionOverlay {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'SelectionOverlay';
    
    this.boxHelper = new THREE.Box3Helper(new THREE.Box3(), SELECTION_COLOR);
    this.boxHelper.material.linewidth = 2;
    this.boxHelper.material.depthTest = false;
    this.boxHelper.material.transparent = true;
    this.boxHelper.material.opacity = 0.8;
    this.boxHelper.renderOrder = 999;
    this.boxHelper.visible = false;
    
    // Add a subtle transparent fill
    const fillGeometry = new THREE.BoxGeometry(1, 1, 1);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: SELECTION_COLOR,
      transparent: true,
      opacity: 0.15,
      depthTest: false,
      side: THREE.DoubleSide
    });
    this.fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
    this.fillMesh.renderOrder = 998;
    this.fillMesh.visible = false;
    
    this.group.add(this.boxHelper);
    this.group.add(this.fillMesh);
    
    // For hover, we could have a thinner/cyan helper if needed, 
    // but the spec for WV1.1 focuses on the selection bounding-box overlay first.
  }

  /**
   * Updates the selection overlay for the given Three.js objects.
   * If objects is null or empty, clears the selection overlay.
   * @param {THREE.Object3D[]|null} objects 
   */
  setSelection(objects) {
    if (!objects || objects.length === 0) {
      this.boxHelper.visible = false;
      this.fillMesh.visible = false;
      return;
    }

    const box = new THREE.Box3();
    objects.forEach(obj => {
      const objBox = new THREE.Box3().setFromObject(obj);
      if (!objBox.isEmpty()) box.union(objBox);
    });
    
    // Expand very slightly to prevent z-fighting with the geometry if it's perfectly flush
    box.expandByScalar(0.02);
    
    this.boxHelper.box.copy(box);
    this.boxHelper.visible = true;
    
    box.getCenter(this.fillMesh.position);
    box.getSize(this.fillMesh.scale);
    this.fillMesh.visible = true;
  }

  clear() {
    this.boxHelper.visible = false;
    this.fillMesh.visible = false;
  }

  dispose() {
    this.group.remove(this.boxHelper);
    this.group.remove(this.fillMesh);
    this.boxHelper.geometry.dispose();
    this.boxHelper.material.dispose();
    this.fillMesh.geometry.dispose();
    this.fillMesh.material.dispose();
  }
}
