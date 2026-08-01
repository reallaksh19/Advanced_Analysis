import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEFAULT_VIEWPORT_CAPABILITIES } from './viewport-command-contract.js';
import { ThreeInteractionArbiter } from './three-interaction-arbiter.js';
import { ThreeSelectionOverlay } from './three-selection-overlay.js';
import { fitThreeSelection, fitThreeView, restoreThreeHome, setThreeStandardView } from './three-viewport-camera.js';
import { clearThreeHostMetadata, clearThreeSceneObjects, renderThreeModel, resolveThreeEntityId, updateThreeHostMetadata } from './three-viewport-scene.js';

/** One lifecycle-safe Three.js viewport shared by Workspace and Load Calc. */
export class ThreeViewportBackend {
  constructor() {
    this.hostElement = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.groups = [];
    this.objects = new Map();
    this.model = null;
    this.selectedEntityId = '';
    this.selectionRequestHandler = null;
    this.resizeObserver = null;
    this.animationFrame = 0;
    this.contextLost = false;
    this.viewHistory = [];
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.renderDirty = true;
  }

  mount(hostElement) {
    if (!hostElement) throw new TypeError('Three viewport requires a host element.');
    if (this.renderer) throw new Error('Three viewport is already mounted.');
    this.hostElement = hostElement;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const pixelRatio = Number(globalThis.devicePixelRatio);
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) throw new Error('WebGL viewport requires a positive browser devicePixelRatio.');
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setClearColor(0x020711, 1);
    this.renderer.domElement.className = 'viewport-canvas';
    this.renderer.domElement.dataset.viewportBackend = 'webgl';
    this.renderer.domElement.setAttribute('aria-label', 'WebGL piping model viewport');
    this.contextLostHandler = (event) => this.handleContextLost(event);
    this.contextRestoredHandler = () => this.handleContextRestored();
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLostHandler);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.contextRestoredHandler);
    this.scene = new THREE.Scene();
    this.physicalGroup = new THREE.Group();
    this.supportGroup = new THREE.Group();
    this.diagnosticGroup = new THREE.Group();
    this.groups = [this.physicalGroup, this.supportGroup, this.diagnosticGroup];
    this.scene.add(...this.groups);
    this.selectionOverlay = new ThreeSelectionOverlay();
    this.scene.add(this.selectionOverlay.group);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(1, 2, 3);
    this.scene.add(light);
    hostElement.replaceChildren(this.renderer.domElement);
    hostElement.dataset.viewportBackend = 'webgl';
    if (typeof ResizeObserver === 'function') { this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(hostElement); }
    this.resize();
    this.startAnimation();
  }

  applyModelConfiguration(model) {
    const config = model.webglNavigation;
    assertWebglConfiguration(config);
    if (!this.camera) this.createCamera(config);
    else if (this.camera.isPerspectiveCamera) { this.camera.fov = config.perspectiveFovDeg; this.camera.updateProjectionMatrix(); }
    this.controls.rotateSpeed = config.navigationSensitivity;
    this.controls.panSpeed = config.navigationSensitivity;
    this.controls.zoomSpeed = config.zoomRate;
    const interactionConfig = { clickTravelTolerancePx: config.clickTravelTolerancePx, clickTimingMs: config.clickTimingMs, doubleClickTimingMs: config.doubleClickTimingMs };
    if (this.arbiter) this.arbiter.updateConfiguration(interactionConfig);
    else this.arbiter = new ThreeInteractionArbiter(this.renderer.domElement, this.controls, { onSelect: (event) => this.handlePick(event), onFitSelection: () => this.fitSelection(), onClearSelection: () => this.selectionRequestHandler?.(null) }, interactionConfig);
    applyCoordinateTransform(this.groups, model.coordinateTransform, model.bounds.center);
    this.hostElement.dataset.configurationStatus = 'READY';
  }

  createCamera(config) {
    this.camera = new THREE.PerspectiveCamera(config.perspectiveFovDeg, 1, config.cameraNearMm, config.cameraFarMm);
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(1, 1, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = true;
    this.controlsChangeHandler = () => { this.renderDirty = true; };
    this.controls.addEventListener('change', this.controlsChangeHandler);
  }

  renderModel(model) { renderThreeModel(this, model); this.renderDirty = true; }
  getCapabilities() { return DEFAULT_VIEWPORT_CAPABILITIES; }
  setInteractionContext(mode) { this.arbiter?.setMode(mode === 'mode-select' ? 'select' : mode); }
  setSelectionRequestHandler(callback) { if (callback !== null && typeof callback !== 'function') throw new TypeError('Three viewport selection handler must be a function or null.'); this.selectionRequestHandler = callback; }

  clear() {
    clearThreeSceneObjects(this);
    this.model = null;
    this.selectedEntityId = '';
    this.hasFittedFirstModel = false;
    this.selectionOverlay?.clear();
    updateThreeHostMetadata(this);
    this.renderDirty = true;
  }

  setSelection(entityId) {
    this.selectedEntityId = entityId ? String(entityId) : '';
    this.selectionOverlay?.setSelection(this.selectedEntityId ? this.objects.get(this.selectedEntityId) : null);
    updateThreeHostMetadata(this);
    this.renderDirty = true;
  }

  fitView() { this.rememberView(); fitThreeView(this, null); }
  fitSelection() { this.rememberView(); fitThreeSelection(this); }
  pivotSelection() {
    const selected = this.objects.get(this.selectedEntityId);
    if (!selected?.length || !this.controls) return;
    this.rememberView();
    const bounds = new THREE.Box3(); selected.forEach((object) => bounds.expandByObject(object));
    if (!bounds.isEmpty()) { bounds.getCenter(this.controls.target); this.controls.update(); this.renderDirty = true; }
  }
  home() { this.rememberView(); restoreThreeHome(this); }
  resetView() { this.home(); }
  setStandardView(preset) { this.rememberView(); setThreeStandardView(this, preset); }

  previousView() {
    const state = this.viewHistory.pop();
    if (!state || !this.camera || !this.controls) return;
    this.camera.position.copy(state.position); this.camera.quaternion.copy(state.quaternion); this.camera.zoom = state.zoom;
    this.controls.target.copy(state.target); this.camera.updateProjectionMatrix(); this.controls.update(); this.renderDirty = true;
  }

  toggleProjection() {
    if (!this.camera || !this.controls || !this.model) return;
    this.rememberView();
    const position = this.camera.position.clone(); const quaternion = this.camera.quaternion.clone(); const target = this.controls.target.clone();
    const aspect = Math.max(this.hostElement.clientWidth, 1) / Math.max(this.hostElement.clientHeight, 1);
    if (this.camera.isPerspectiveCamera) {
      const distance = position.distanceTo(target); const height = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
      this.replaceCamera(new THREE.OrthographicCamera(-height * aspect / 2, height * aspect / 2, height / 2, -height / 2, this.camera.near, this.camera.far), position, quaternion, target);
    } else {
      const fov = this.model.webglNavigation.perspectiveFovDeg;
      this.replaceCamera(new THREE.PerspectiveCamera(fov, aspect, this.camera.near, this.camera.far), position, quaternion, target);
    }
  }

  replaceCamera(camera, position, quaternion, target) {
    this.controls.removeEventListener('change', this.controlsChangeHandler); this.controls.dispose();
    this.camera = camera; this.camera.position.copy(position); this.camera.quaternion.copy(quaternion); this.camera.up.set(0, 1, 0); this.camera.updateProjectionMatrix();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.target.copy(target); this.controls.enableDamping = false; this.controls.screenSpacePanning = true;
    this.controlsChangeHandler = () => { this.renderDirty = true; }; this.controls.addEventListener('change', this.controlsChangeHandler);
    this.arbiter?.dispose(); this.arbiter = null; this.applyModelConfiguration(this.model); this.controls.update(); this.renderDirty = true;
  }

  rememberView() {
    if (!this.camera || !this.controls) return;
    this.viewHistory = [{ position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(), zoom: this.camera.zoom, target: this.controls.target.clone() }];
  }

  resize() {
    if (!this.renderer || !this.hostElement) return;
    const width = Math.max(this.hostElement.clientWidth, 1); const height = Math.max(this.hostElement.clientHeight, 1);
    this.renderer.setSize(width, height, false);
    if (this.camera?.isPerspectiveCamera) this.camera.aspect = width / height;
    if (this.camera) this.camera.updateProjectionMatrix();
    this.renderDirty = true;
  }

  handlePick(event) {
    if (!this.model || !this.camera) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.params.Line.threshold = this.model.webglNavigation.pickingRadius;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const candidates = [...this.objects.values()].flat();
    const entityId = resolveThreeEntityId(this.raycaster.intersectObjects(candidates, true)[0]?.object);
    if (entityId) this.hostElement.dataset.lastPickEntityId = entityId;
    this.selectionRequestHandler?.(entityId || null);
  }

  handleContextLost(event) { event.preventDefault(); this.contextLost = true; this.stopAnimation(); this.hostElement.dataset.contextStatus = 'LOST'; }
  handleContextRestored() { this.contextLost = false; this.hostElement.dataset.contextStatus = 'RESTORED'; if (this.model) renderThreeModel(this, this.model, { resetCamera: false }); this.startAnimation(); }
  markViewCommand(command) { if (this.hostElement) this.hostElement.dataset.viewCommand = command; }

  startAnimation() {
    if (this.animationFrame || this.contextLost) return;
    const frame = () => { this.animationFrame = requestAnimationFrame(frame); if (this.renderDirty) { this.renderOnce(); this.renderDirty = false; } };
    this.animationFrame = requestAnimationFrame(frame);
  }

  stopAnimation() { if (this.animationFrame) cancelAnimationFrame(this.animationFrame); this.animationFrame = 0; }
  renderOnce() { if (this.renderer && this.scene && this.camera && this.hostElement.clientWidth > 0 && this.hostElement.clientHeight > 0) this.renderer.render(this.scene, this.camera); }
  clearSceneObjects() { clearThreeSceneObjects(this); }
  updateHostMetadata() { updateThreeHostMetadata(this); }

  destroy() {
    this.stopAnimation(); this.resizeObserver?.disconnect(); this.resizeObserver = null;
    this.arbiter?.dispose(); this.arbiter = null; this.selectionOverlay?.dispose(); this.selectionOverlay = null;
    if (this.controls) { this.controls.removeEventListener('change', this.controlsChangeHandler); this.controls.dispose(); }
    clearThreeSceneObjects(this);
    if (this.renderer) { this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLostHandler); this.renderer.domElement.removeEventListener('webglcontextrestored', this.contextRestoredHandler); this.renderer.dispose(); this.renderer.forceContextLoss?.(); }
    if (this.hostElement) clearThreeHostMetadata(this.hostElement);
    this.hostElement = null; this.renderer = null; this.scene = null; this.camera = null; this.controls = null; this.groups = []; this.objects.clear(); this.model = null; this.selectionRequestHandler = null;
  }
}

function assertWebglConfiguration(value) {
    const required = ['pickingRadius', 'cameraFitMargin', 'clickTimingMs', 'doubleClickTimingMs', 'clickTravelTolerancePx', 'zoomRate', 'navigationSensitivity', 'perspectiveFovDeg', 'meshRadialSegments', 'cameraNearMm', 'cameraFarMm'];
  const missing = required.filter((key) => !Number.isFinite(value?.[key]) || value[key] <= 0);
  if (missing.length) throw new Error(`WebGL BLOCKED: approved Project Data is missing ${missing.join(', ')}.`);
  if (!Number.isInteger(value.meshRadialSegments)) throw new Error('WebGL BLOCKED: meshRadialSegments must be an integer.');
}

function applyCoordinateTransform(groups, transform, sourceCenter) {
  const valid = transform?.boundary === 'rendering-only' && JSON.stringify(transform.source) === '["x","y","z"]' && JSON.stringify(transform.threeJs) === '["x","z","-y"]';
  if (!valid) throw new Error('WebGL BLOCKED: supported source Z-up rendering transform is not approved.');
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const translation = new THREE.Vector3(sourceCenter.x, sourceCenter.y, sourceCenter.z).applyQuaternion(rotation).negate();
  groups.forEach((group) => { group.quaternion.copy(rotation); group.position.copy(translation); group.updateMatrixWorld(true); });
}
