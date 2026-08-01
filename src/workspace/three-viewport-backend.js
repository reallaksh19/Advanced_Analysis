import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createOverlapHighlight, createNewConnectionLine } from './three-support-overlay.js';
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
    
    this.selectionRequestHandler = null;
    
    this.htmlLabels = [];
    this.htmlLabelContainer = document.createElement('div');
    this.htmlLabelContainer.className = 'webgl-label-container';
    this.htmlLabelContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; overflow: hidden;';
    
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

    hostElement.replaceChildren(this.renderer.domElement, this.htmlLabelContainer);
    hostElement.dataset.viewportBackend = 'webgl';
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(hostElement);
    }
    
    // Bind Autofix Visualization Listeners
    document.addEventListener('viewport:render-autofix-overlays', (e) => this.renderAutofixOverlays(e.detail.merges));
    document.addEventListener('viewport:clear-autofix-overlays', () => this.clearAutofixOverlays());
    document.addEventListener('viewport:fly-to', (e) => {
      const target = e.detail.target;
      if (this.controls && target) {
        this.controls.target.set(target.x, target.y, target.z);
        this.camera.position.set(target.x + 5000, target.y + 5000, target.z + 5000);
        this.controls.update();
      }
    });

    window.addEventListener('viewport-navigation-action', (e) => {
      const action = e.detail?.action;
      if (!action) return;

      switch (action) {
        case 'view-iso': this.setStandardView('iso'); break;
        case 'view-top': this.setStandardView('top'); break;
        case 'view-bottom': this.setStandardView('bottom'); break;
        case 'view-front': this.setStandardView('front'); break;
        case 'view-back': this.setStandardView('back'); break;
        case 'view-left': this.setStandardView('left'); break;
        case 'view-right': this.setStandardView('right'); break;
        case 'fit': this.fitView(); break;
        case 'fit-selection': this.fitSelection(); break;
        case 'home': this.home(); break;
        case 'pivot-selection':
          if (this.selectedEntityId && this.controls) {
            const obj = this.objects.get(this.selectedEntityId);
            if (obj && obj[0]) {
              const pos = new THREE.Vector3();
              obj[0].getWorldPosition(pos);
              this.controls.target.copy(pos);
              this.controls.update();
            }
          }
          break;
        case 'clear-pivot':
          if (this.controls) {
            this.controls.target.set(0, 0, 0);
            this.controls.update();
          }
          break;
        case 'toggle-axis':
          if (this.camera) {
            const isYUp = this.camera.up.y === 1;
            this.camera.up.set(0, isYUp ? 0 : 1, isYUp ? 1 : 0);
            this.camera.updateProjectionMatrix();
            this.renderOnce();
          }
          break;
      }
    });

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
    this.isDirty = true;
    this.requestRender = () => { this.isDirty = true; };
    if (this.controls && !this._controlsListenerAttached) {
      this.controls.addEventListener('change', () => { this.isDirty = true; });
      this._controlsListenerAttached = true;
    }
    const animate = () => {
      this.animationFrame = requestAnimationFrame(animate);
      if (this.isDirty || this.controls?.isAnimating) {
        this.controls?.update();
        this.renderOnce();
        this.isDirty = false;
      }
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
      
      this.updateHtmlLabels();
    }
  }

  updateHtmlLabels() {
    if (!this.htmlLabels.length) return;
    const widthHalf = this.hostElement.offsetWidth / 2;
    const heightHalf = this.hostElement.offsetHeight / 2;

    for (const label of this.htmlLabels) {
      if (!label.element || !label.position) continue;
      // Copy pos and project
      const projected = new THREE.Vector3().copy(label.position).project(this.camera);
      // Check if behind camera
      if (projected.z > 1 || projected.z < -1) {
        label.element.style.display = 'none';
        continue;
      }
      label.element.style.display = 'block';
      const x = (projected.x * widthHalf) + widthHalf;
      const y = -(projected.y * heightHalf) + heightHalf;
      // Center the label
      label.element.style.transform = `translate(-50%, -50%) translate(${x}px,${y}px)`;
    }
  }
  
  addHtmlLabel(text, position) {
    const el = document.createElement('div');
    el.className = 'webgl-diagnostic-label';
    el.style.cssText = 'position: absolute; top: 0; left: 0; background: rgba(15, 23, 42, 0.9); color: #38bdf8; padding: 4px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #0284c7; white-space: nowrap; font-family: monospace; box-shadow: 0 4px 6px rgba(0,0,0,0.3); pointer-events: auto;';
    el.textContent = text;
    this.htmlLabelContainer.appendChild(el);
    const labelObj = { element: el, position: new THREE.Vector3(position.x || 0, position.y || 0, position.z || 0) };
    this.htmlLabels.push(labelObj);
    return labelObj;
  }
  
  clearHtmlLabels() {
    this.htmlLabels.forEach(l => l.element?.remove());
    this.htmlLabels = [];
  }
  
  renderAutofixOverlays(merges) {
    this.clearAutofixOverlays();
    merges.forEach(merge => {
      // 1. Blue Sphere Overlaps
      const highlight = createOverlapHighlight(merge.coordinate, 150);
      this.diagnosticGroup.add(highlight);
      
      // 2. HTML Label
      this.addHtmlLabel(`Merged: ${merge.dominant.name} absorbs ${merge.absorbed.length}`, merge.coordinate);
      
      // 3. New Connection Line (dummy logic to show a connection from the node)
      const endPos = { x: merge.coordinate.x, y: merge.coordinate.y + 1000, z: merge.coordinate.z };
      const line = createNewConnectionLine(merge.coordinate, endPos);
      this.diagnosticGroup.add(line);
    });
    this.renderOnce();
  }
  
  clearAutofixOverlays() {
    while(this.diagnosticGroup.children.length > 0) { 
      this.diagnosticGroup.remove(this.diagnosticGroup.children[0]); 
    }
    this.clearHtmlLabels();
    this.renderOnce();
  }
}
