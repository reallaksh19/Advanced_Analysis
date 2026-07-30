import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEFAULT_VIEWPORT_CAPABILITIES } from './viewport-command-contract.js';
import { ThreeInteractionArbiter } from './three-interaction-arbiter.js';
import { ThreeSelectionOverlay } from './three-selection-overlay.js';
import {
  fitThreeSelection,
  fitThreeView,
  restoreThreeHome,
  setThreeStandardView,
} from './three-viewport-camera.js';
import {
  clearThreeHostMetadata,
  clearThreeSceneObjects,
  renderThreeModel,
  resolveThreeEntityId,
  updateThreeHostMetadata,
} from './three-viewport-scene.js';
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
    renderThreeModel(this, model);
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
    fitThreeView(this, targetBox);
  }

  fitSelection() {
    fitThreeSelection(this);
  }
  
  home() {
    restoreThreeHome(this);
  }

  setStandardView(preset) {
    setThreeStandardView(this, preset);
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
    const entityId = resolveThreeEntityId(intersection?.object);
    
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
    if (this.hostElement) clearThreeHostMetadata(this.hostElement);
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
    clearThreeSceneObjects(this);
  }

  updateHostMetadata() {
    updateThreeHostMetadata(this);
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
    if (!this.hostElement || this.hostElement.offsetWidth === 0 || this.hostElement.offsetHeight === 0 || this.hostElement.style.display === 'none') {
      return; // Pause WebGL render loop when tab is hidden or collapsed
    }
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
