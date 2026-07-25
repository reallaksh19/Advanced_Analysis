import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createThreeEngineeringObject,
  disposeThreeEngineeringObject,
  setThreeEngineeringSelection,
} from './three-engineering-primitives.js';
import { assertViewportRenderModel } from './viewport-render-model.js';

const SELECTED_COLOR = 0xfbbf24;
const MAX_POINTER_TRAVEL_PX = 5;

export class ThreeViewportBackend {
  constructor() {
    this.hostElement = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.modelGroup = null;
    this.objects = new Map();
    this.model = null;
    this.selectedEntityId = '';
    this.resizeObserver = null;
    this.animationFrame = 0;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerStart = null;
    this.selectionRequestHandler = null;
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
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
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    this.camera.up.set(0, 1, 0);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => this.renderOnce());

    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);
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

    model.items.forEach((item) => {
      const object = createThreeEngineeringObject(item, markerRadius);
      object.userData.entityId = item.entityId;
      object.traverse((child) => {
        if (!child.userData.entityId) child.userData.entityId = item.entityId;
      });
      this.objects.set(item.entityId, object);
      this.modelGroup.add(object);
    });

    this.updateHostMetadata();
    this.fitView();
  }

  clear() {
    this.clearSceneObjects();
    this.model = null;
    this.selectedEntityId = '';
    this.pointerStart = null;
    this.updateHostMetadata();
    this.renderOnce();
  }

  setSelection(entityId) {
    this.selectedEntityId = String(entityId || '');
    this.objects.forEach((object, id) => {
      setThreeEngineeringSelection(object, id === this.selectedEntityId, SELECTED_COLOR);
    });
    this.updateHostMetadata();
    this.renderOnce();
  }

  fitView() {
    if (!this.model || !this.camera || !this.controls) return;
    const { center, radius } = this.model.bounds;
    const distance = Math.max(radius * 2.8, 10);
    this.camera.near = Math.max(distance / 10000, 0.01);
    this.camera.far = Math.max(distance * 100, 1000);
    this.camera.position.set(
      center.x + distance * 0.9,
      center.y + distance * 0.65,
      center.z + distance,
    );
    this.camera.updateProjectionMatrix();
    this.controls.target.set(center.x, center.y, center.z);
    this.controls.update();
    this.markViewCommand('fit');
    this.renderOnce();
  }

  resetView() {
    this.fitView();
    this.markViewCommand('reset');
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

  handlePointerDown(event) {
    if (event.button !== 0) return;
    this.pointerStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  handlePointerUp(event) {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!start || event.button !== 0 || start.pointerId !== event.pointerId || !this.model) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MAX_POINTER_TRAVEL_PX) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersection = this.raycaster.intersectObjects([...this.objects.values()], true)[0];
    const entityId = resolveEntityId(intersection?.object);
    if (!entityId) return;

    this.hostElement.dataset.lastPickEntityId = entityId;
    this.selectionRequestHandler?.(entityId);
  }

  destroy() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.renderer?.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer?.domElement.removeEventListener('pointerup', this.handlePointerUp);
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
    this.modelGroup = null;
    this.model = null;
    this.pointerStart = null;
    this.selectionRequestHandler = null;
    this.objects.clear();
  }

  clearSceneObjects() {
    if (!this.modelGroup) return;
    [...this.modelGroup.children].forEach((object) => {
      this.modelGroup.remove(object);
      disposeThreeEngineeringObject(object);
    });
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
