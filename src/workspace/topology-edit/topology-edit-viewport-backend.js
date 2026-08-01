/**
 * Topology Edit Draft — Phase 3 Dedicated 3D Edit Viewport Backend
 *
 * Implements a high-performance Three.js rendering backend with 9 isolated scene groups:
 * 1. sourceGroup    (Immutable source visual geometry)
 * 2. draftGroup     (Accepted draft topology)
 * 3. ghostGroup     (Proposal preview ghosts)
 * 4. connectorGroup (Node connection snap handles)
 * 5. transientGroup (Active drag gesture preview)
 * 6. measurementGroup (Distance/dimension callouts)
 * 7. issueGroup     (Topology rule violation markers)
 * 8. supportGroup   (Directional piping restraint 3D symbols)
 * 9. selectionGroup (Active selection bounding boxes/highlights)
 */

import * as THREE from 'three';
import { createTopologyEditPick } from './topology-edit-picking-contract.js';
import { createTopologyEditViewState } from './topology-edit-view-state.js';

export class TopologyEditViewportBackend {
  constructor(options = {}) {
    this.hostElement = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    this.orthoCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 2000);
    this.activeCamera = this.camera;
    this.renderer = null;

    // 9 Isolated Scene Groups
    this.groups = Object.freeze({
      sourceGroup: new THREE.Group(),
      draftGroup: new THREE.Group(),
      ghostGroup: new THREE.Group(),
      connectorGroup: new THREE.Group(),
      transientGroup: new THREE.Group(),
      measurementGroup: new THREE.Group(),
      issueGroup: new THREE.Group(),
      supportGroup: new THREE.Group(),
      selectionGroup: new THREE.Group(),
    });

    Object.values(this.groups).forEach(g => this.scene.add(g));

    this.viewState = createTopologyEditViewState(options.viewState);
    this.animationFrameId = null;
    this.isMounted = false;
    this.setupLights();
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(100, 200, 150);
    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.4);
    dirLight2.position.set(-100, -100, -100);

    this.scene.add(ambientLight, dirLight1, dirLight2);
  }

  mount(host) {
    if (!host) throw new TypeError('TopologyEditViewportBackend: Invalid host element.');
    this.destroy(); // Clear existing mount

    this.hostElement = host;
    const width = host.clientWidth || 800;
    const height = host.clientHeight || 500;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x020617, 1);

    host.replaceChildren(this.renderer.domElement);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.camera.position.set(20, 20, 20);
    this.camera.lookAt(0, 0, 0);

    this.isMounted = true;
    this.startLoop();
  }

  startLoop() {
    const animate = () => {
      if (!this.isMounted || !this.renderer) return;
      this.renderer.render(this.scene, this.activeCamera);
      this.animationFrameId = requestAnimationFrame(animate);
    };
    animate();
  }

  renderSession(model) {
    if (!model) return;
    this.clearGroup(this.groups.sourceGroup);
    this.clearGroup(this.groups.draftGroup);

    // Build source & draft visual meshes
    if (model.source && model.source.elements) {
      this.buildMeshGroup(this.groups.sourceGroup, model.source.elements, 0x38bdf8, 0.4);
    }
    if (model.draft && model.draft.elements) {
      this.buildMeshGroup(this.groups.draftGroup, model.draft.elements, 0x0284c7, 1.0);
    }
  }

  buildMeshGroup(group, elements, colorHex, opacity = 1.0) {
    const material = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.3,
      metalness: 0.2,
      transparent: opacity < 1.0,
      opacity: opacity,
    });

    elements.forEach(el => {
      const geometry = new THREE.CylinderGeometry(0.2, 0.2, 5, 12);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { canonicalId: el.id || el.entityId, type: el.type };
      group.add(mesh);
    });
  }

  clearGroup(group) {
    while (group.children.length > 0) {
      const obj = group.children.pop();
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }
  }

  setStandardView(viewName) {
    const dist = 30;
    switch (viewName.toUpperCase()) {
      case 'TOP':
        this.camera.position.set(0, dist, 0.001);
        break;
      case 'FRONT':
        this.camera.position.set(0, 0, dist);
        break;
      case 'RIGHT':
        this.camera.position.set(dist, 0, 0);
        break;
      case 'ISO':
      default:
        this.camera.position.set(dist, dist, dist);
        break;
    }
    this.camera.lookAt(0, 0, 0);
  }

  fitAll() {
    this.camera.position.set(25, 25, 25);
    this.camera.lookAt(0, 0, 0);
  }

  pickAt(clientX, clientY) {
    if (!this.hostElement || !this.renderer) return null;
    const rect = this.hostElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), this.activeCamera);
    const intersects = raycaster.intersectObjects(this.scene.children, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      return createTopologyEditPick({
        objectId: hit.object.userData?.canonicalId || 'primitive-hit',
        point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      });
    }
    return null;
  }

  destroy() {
    this.isMounted = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    Object.values(this.groups).forEach(g => this.clearGroup(g));
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }
  }
}
