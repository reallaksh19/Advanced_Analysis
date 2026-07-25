import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createThreePrimitive } from './three-primitive-factory.js';
import { disposeThreeEngineeringObject } from './three-object-disposal.js';
import { assertViewportRenderModel } from './viewport-render-model.js';
import { DEFAULT_VIEWPORT_CAPABILITIES } from './viewport-command-contract.js';
import { ThreeInteractionArbiter } from './three-interaction-arbiter.js';
import { ThreeSelectionOverlay } from './three-selection-overlay.js';
import { ViewportAxisHUD } from './viewport-axis-hud.js';

export class ThreeViewportBackend {
  constructor() {
    this.hostElement = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.physicalGroup = null;
    this.supportGroup = null;
    this.diagnosticGroup = null;
    this.objects = new Map();
    this.model = null;
    this.selectedEntityId = '';
    this.resizeObserver = null;
    this.animationFrame = 0;
    
    this.arbiter = null;
    this.selectionOverlay = null;
    this.axisHUD = null;
    
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.selectionRequestHandler = null;
    
    this.initialCameraState = null;
  }

  mount(hostElement) {
    if (!hostElement) throw new TypeError('Three viewport requires a host element.');
    this.hostElement = hostElement;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x020711, 1);
    this.renderer.domElement.className = 'viewport-canvas';
    this.renderer.domElement.dataset.viewportBackend = 'webgl';
    this.renderer.domElement.setAttribute('aria-label', 'Read-only WebGL model viewport');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    this.camera.up.set(0, 1, 0);
    
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => this.renderOnce());

    this.arbiter = new ThreeInteractionArbiter(this.renderer.domElement, this.controls, {
      onSelect: (event) => this.handlePick(event),
      onFitSelection: (event) => {
        this.handlePick(event);
        // Short delay to allow selection state to propagate before fitting
        setTimeout(() => this.fitSelection(), 50);
      },
      onClearSelection: () => this.selectionRequestHandler?.(null)
    });

    this.selectionOverlay = new ThreeSelectionOverlay();
    this.scene.add(this.selectionOverlay.group);

    this.axisHUD = new ViewportAxisHUD();

    this.physicalGroup = new THREE.Group();
    this.supportGroup = new THREE.Group();
    this.diagnosticGroup = new THREE.Group();
    this.scene.add(this.physicalGroup);
    this.scene.add(this.supportGroup);
    this.scene.add(this.diagnosticGroup);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(1, 2, 3);
    this.scene.add(light);

    hostElement.replaceChildren(this.renderer.domElement);
    hostElement.dataset.viewportBackend = 'webgl';
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(hostElement);
    }
    this.resize();
    this.startAnimation();
  }

  getCapabilities() {
    return DEFAULT_VIEWPORT_CAPABILITIES;
  }

  setInteractionContext(mode) {
    if (this.arbiter) {
      this.arbiter.setMode(mode);
    }
  }

  setSelectionRequestHandler(callback) {
    if (callback !== null && typeof callback !== 'function') {
      throw new TypeError('Three viewport selection handler must be a function or null.');
    }
    this.selectionRequestHandler = callback;
  }

  renderModel(model) {
    assertViewportRenderModel(model);
    this.clearSceneObjects();
    this.model = model;
    this.selectedEntityId = '';
    const markerRadius = Math.max(model.bounds.radius * 0.018, 0.5);
    this.raycaster.params.Line.threshold = Math.max(model.bounds.radius * 0.015, 0.5);

    const processPrimitives = (primitives, group) => {
      primitives.forEach((item) => {
        const object = createThreePrimitive(item);
        if (object) {
          object.userData.entityId = item.objectId;
          object.traverse((child) => {
            if (!child.userData.entityId) child.userData.entityId = item.objectId;
          });
          
          if (!this.objects.has(item.objectId)) {
            this.objects.set(item.objectId, []);
          }
          this.objects.get(item.objectId).push(object);
          group.add(object);
        }
      });
    };

    processPrimitives(model.physicalPrimitives || [], this.physicalGroup);
    processPrimitives(model.supportOverlayPrimitives || [], this.supportGroup);
    processPrimitives(model.diagnosticPrimitives || [], this.diagnosticGroup);

    this.updateHostMetadata();
    this.fitView();
    
    // Save initial camera state for 'Home'
    this.initialCameraState = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      zoom: this.camera.zoom
    };
  }

  clear() {
    this.clearSceneObjects();
    this.model = null;
    this.selectedEntityId = '';
    this.selectionOverlay?.clear();
    this.updateHostMetadata();
    this.renderOnce();
  }

  setSelection(entityId) {
    this.selectedEntityId = entityId ? String(entityId) : '';
    const selectedObject = this.selectedEntityId ? this.objects.get(this.selectedEntityId) : null;
    
    if (this.selectionOverlay) {
      this.selectionOverlay.setSelection(selectedObject);
    }
    
    this.updateHostMetadata();
    this.renderOnce();
  }

  fitView(targetBox = null) {
    if (!this.camera || !this.controls) return;
    
    let box = targetBox;
    if (!box) {
      if (!this.model) return;
      // Default to model bounds
      box = new THREE.Box3();
      const { center, radius } = this.model.bounds;
      box.expandByPoint(new THREE.Vector3(center.x - radius, center.y - radius, center.z - radius));
      box.expandByPoint(new THREE.Vector3(center.x + radius, center.y + radius, center.z + radius));
    }
    
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Get 8 corners of the box
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z)
    ];

    // Compute view-space bounds
    const v = new THREE.Vector3();
    const viewMatrix = this.camera.matrixWorldInverse;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const corner of corners) {
      v.copy(corner).applyMatrix4(viewMatrix);
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }

    const w = maxX - minX;
    const h = maxY - minY;
    
    const aspect = this.camera.aspect;
    const fovY = this.camera.fov * THREE.MathUtils.DEG2RAD;
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * aspect);
    
    const distY = (h / 2) / Math.tan(fovY / 2);
    const distX = (w / 2) / Math.tan(fovX / 2);
    
    // Apply 10% margin
    const margin = 1.1;
    let distance = Math.max(distX, distY) * margin;
    
    // Clamp to prevent degenerate zooming
    distance = Math.max(distance, 1.0);

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    
    this.camera.position.copy(center).addScaledVector(forward, -distance);
    this.controls.target.copy(center);
    
    if (this.model) {
      const sceneRadius = this.model.bounds.radius;
      this.camera.near = Math.max(distance / 1000, 0.01);
      this.camera.far = Math.max(distance + sceneRadius * 2, 1000);
    }
    
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.markViewCommand('fit');
    this.renderOnce();
  }

  fitSelection() {
    if (!this.selectedEntityId) return;
    const objects = this.objects.get(this.selectedEntityId);
    if (!objects || !objects.length) return;
    
    const box = new THREE.Box3();
    objects.forEach(obj => {
      const objBox = new THREE.Box3().setFromObject(obj);
      if (!objBox.isEmpty()) box.union(objBox);
    });
    if (!box.isEmpty()) {
      this.fitView(box);
    }
  }
  
  home() {
    if (!this.initialCameraState || !this.camera || !this.controls) return;
    this.camera.position.copy(this.initialCameraState.position);
    this.camera.zoom = this.initialCameraState.zoom;
    this.controls.target.copy(this.initialCameraState.target);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.markViewCommand('home');
    this.renderOnce();
  }

  setStandardView(preset) {
    if (!this.camera || !this.controls) return;
    
    const center = this.controls.target.clone();
    const distance = this.camera.position.distanceTo(center);
    
    const dirs = {
      'iso': new THREE.Vector3(1, 1, 1).normalize(),
      'top': new THREE.Vector3(0, 1, 0),
      'front': new THREE.Vector3(0, 0, 1),
      'right': new THREE.Vector3(1, 0, 0)
    };
    
    const dir = dirs[preset.toLowerCase()] || dirs.iso;
    
    this.camera.position.copy(center).addScaledVector(dir, distance);
    this.camera.lookAt(center);
    // When doing top view, align 'up' nicely to z axis
    if (preset.toLowerCase() === 'top') {
      this.camera.up.set(0, 0, -1);
    } else {
      this.camera.up.set(0, 1, 0);
    }
    
    this.camera.updateProjectionMatrix();
    this.controls.update();
    
    // Fit view slightly to ensure the standard view bounds look right
    this.fitView();
    
    this.markViewCommand(preset.toLowerCase());
    this.renderOnce();
  }

  resetView() {
    this.home();
  }

  resize() {
    if (!this.renderer || !this.camera || !this.hostElement) return;
    const width = Math.max(this.hostElement.clientWidth, 1);
    const height = Math.max(this.hostElement.clientHeight, 1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderOnce();
  }

  handlePick(event) {
    if (!this.model) return;
    
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const allMeshes = [];
    this.objects.forEach(groupList => {
      groupList.forEach(obj => allMeshes.push(obj));
    });
    
    const intersection = this.raycaster.intersectObjects(allMeshes, true)[0];
    const entityId = resolveEntityId(intersection?.object);
    
    if (entityId) {
      this.hostElement.dataset.lastPickEntityId = entityId;
      this.selectionRequestHandler?.(entityId);
    } else {
      // Empty click clears selection
      this.selectionRequestHandler?.(null);
    }
  }

  destroy() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    
    this.arbiter?.dispose();
    this.arbiter = null;
    
    this.selectionOverlay?.dispose();
    this.selectionOverlay = null;

    this.axisHUD?.dispose();
    this.axisHUD = null;

    this.controls?.dispose();
    this.clearSceneObjects();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
    this.renderer?.domElement.remove();
    if (this.hostElement) clearHostMetadata(this.hostElement);
    this.hostElement = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.physicalGroup = null;
    this.supportGroup = null;
    this.diagnosticGroup = null;
    this.model = null;
    this.selectionRequestHandler = null;
    this.objects.clear();
  }

  clearSceneObjects() {
    const clearGroup = (group) => {
      if (!group) return;
      [...group.children].forEach((object) => {
        group.remove(object);
        disposeThreeEngineeringObject(object);
      });
    };
    clearGroup(this.physicalGroup);
    clearGroup(this.supportGroup);
    clearGroup(this.diagnosticGroup);
    this.objects.clear();
  }

  updateHostMetadata() {
    if (!this.hostElement) return;
    const summary = this.model?.summary || {};
    this.hostElement.dataset.renderableCount = String(summary.renderableCount || 0);
    this.hostElement.dataset.skippedCount = String(summary.skippedCount || 0);
    this.hostElement.dataset.resolvedCount = String(summary.resolvedCount || 0);
    this.hostElement.dataset.fallbackCount = String(summary.fallbackCount || 0);
    this.hostElement.dataset.componentKinds = Object.keys(summary.byKind || {}).sort().join(',');
    this.hostElement.dataset.selectedEntityId = this.selectedEntityId;
  }

  markViewCommand(command) {
    if (this.hostElement) this.hostElement.dataset.viewCommand = command;
    if (this.renderer) this.renderer.domElement.dataset.viewCommand = command;
  }

  startAnimation() {
    const animate = () => {
      this.animationFrame = requestAnimationFrame(animate);
      this.controls?.update();
      this.renderOnce();
    };
    animate();
  }

  renderOnce() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
      
      // Render HUD over the main scene
      if (this.axisHUD) {
        this.axisHUD.updateOrientation(this.camera);
        this.renderer.clearDepth(); // ensure HUD is on top
        this.axisHUD.render(this.renderer, this.renderer.domElement.width, this.renderer.domElement.height);
      }
    }
  }
}

function resolveEntityId(object) {
  let current = object;
  while (current) {
    if (current.userData?.entityId) return current.userData.entityId;
    current = current.parent;
  }
  return '';
}

function clearHostMetadata(hostElement) {
  ['viewportBackend', 'renderableCount', 'skippedCount', 'resolvedCount', 'fallbackCount',
    'componentKinds', 'selectedEntityId', 'lastPickEntityId'].forEach((key) => delete hostElement.dataset[key]);
}
