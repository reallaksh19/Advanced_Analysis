/** Three.js adapter for governed visual projections and display-only sectioning. */
import * as THREE from 'three';
import { createTopologyEditPick } from './topology-edit-picking-contract.js';
import { createTopologyEditViewState } from './topology-edit-view-state.js';
import {
  createTopologyEditSectionPlaneEquations,
  isEngineeringPointInsideSectionPlanes,
} from '../viewport-presentation/topology-edit-section-model.js';
import {
  STANDARD_VIEW_DIRECTIONS,
  applyObjectClipping,
  cachedViewportMaterial,
  computeProjectionBounds,
  createViewportMaterial,
  disposeViewportGroup,
  fallbackPick,
  finiteElement,
  isFinitePoint,
  markerSizeForBounds,
  pickUserData,
  positiveNumber,
  segmentGeometry,
} from './topology-edit-viewport-renderer.js';

export class TopologyEditViewportBackend {
  constructor(options = {}) {
    this.hostElement = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000000);
    this.orthoCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000000);
    this.activeCamera = this.camera;
    this.renderer = null;
    this.hasFitOnce = false;
    this.presentationSectionPlanes = Object.freeze([]);
    this.presentationClippingPlanes = Object.freeze([]);
    this.groups = createGroups(this.scene);
    this.viewState = createTopologyEditViewState(options.viewState);
    this.animationFrameId = null;
    this.isMounted = false;
    this.setupLights();
  }

  setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const primary = new THREE.DirectionalLight(0xffffff, 0.8);
    const secondary = new THREE.DirectionalLight(0x38bdf8, 0.4);
    primary.position.set(100, 200, 150);
    secondary.position.set(-100, -100, -100);
    this.scene.add(ambient, primary, secondary);
  }

  mount(host) {
    if (!host) throw new TypeError('TopologyEditViewportBackend: Invalid host element.');
    this.destroy();
    this.hostElement = host;
    const width = host.clientWidth || 800;
    const height = host.clientHeight || 500;
    this.renderer = createRenderer(width, height, this.presentationClippingPlanes.length > 0);
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => this.handleContextLost(event), false);
    this.renderer.domElement.addEventListener('webglcontextrestored', () => this.startLoop(), false);
    host.replaceChildren(this.renderer.domElement);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(20, 20, 20);
    this.camera.lookAt(0, 0, 0);
    this.isMounted = true;
    this.startLoop();
  }

  handleContextLost(event) {
    event.preventDefault();
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  startLoop() {
    if (this.animationFrameId || !this.isMounted || !this.renderer) return;
    const animate = () => {
      if (!this.isMounted || !this.renderer) {
        this.animationFrameId = null;
        return;
      }
      this.renderer.render(this.scene, this.activeCamera);
      this.animationFrameId = requestAnimationFrame(animate);
    };
    animate();
  }

  renderSession(model) {
    if (!model) return;
    this.clearVisualGroups();
    const projections = [model.source, model.draft, model.supports].filter(Boolean);
    const allElements = projections.flatMap((row) => row.elements || []);
    const allSegments = projections.flatMap((row) => row.segments || []);
    this.lastBounds = computeProjectionBounds(allElements, allSegments);
    const markerSize = markerSizeForBounds(this.lastBounds);
    this.renderProjection(this.groups.sourceGroup, model.source, 0x38bdf8, 0.4, markerSize);
    this.renderProjection(this.groups.draftGroup, model.draft, 0x0284c7, 1, markerSize);
    this.renderProjection(this.groups.supportGroup, model.supports, 0x22d3ee, 1, markerSize);
    this.applyPresentationClippingToGroups();
    if (!this.hasFitOnce && (allElements.length || allSegments.length)) {
      this.hasFitOnce = true;
      this.fitAll();
    }
  }

  clearVisualGroups() {
    disposeViewportGroup(this.groups.sourceGroup);
    disposeViewportGroup(this.groups.draftGroup);
    disposeViewportGroup(this.groups.supportGroup);
  }

  renderProjection(group, projection, color, opacity, markerSize) {
    if (!projection) return;
    this.buildSegmentGroup(group, projection.segments, color, opacity);
    this.buildMeshGroup(group, projection.elements, color, opacity, markerSize);
  }

  buildSegmentGroup(group, segments = [], colorHex = 0x0284c7, opacity = 1) {
    const materials = new Map();
    for (const segment of segments || []) {
      if (!isFinitePoint(segment.start) || !isFinitePoint(segment.end)) continue;
      const radius = positiveNumber(segment.radiusMm);
      if (radius === null) continue;
      const color = Number.isInteger(segment.colorInt) ? segment.colorInt : colorHex;
      const geometry = segmentGeometry(segment, radius);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry.geometry, cachedViewportMaterial(materials, color, opacity));
      if (geometry.position) mesh.position.copy(geometry.position);
      if (geometry.quaternion) mesh.quaternion.copy(geometry.quaternion);
      mesh.userData = pickUserData(segment);
      group.add(mesh);
    }
  }

  buildMeshGroup(group, elements = [], colorHex = 0x0284c7, opacity = 1, markerSize = 10) {
    const valid = (elements || []).filter(finiteElement);
    if (!valid.length) return;
    const material = createViewportMaterial(colorHex, opacity);
    const geometry = new THREE.SphereGeometry(markerSize, 12, 10);
    if (valid.length >= 500 && valid.every((element) => !positiveNumber(element.sizeMm))) {
      this.buildInstancedMarkers(group, valid, geometry, material);
      return;
    }
    for (const element of valid) {
      const size = positiveNumber(element.sizeMm);
      const mesh = new THREE.Mesh(
        size ? new THREE.SphereGeometry(size, 12, 10) : geometry,
        material,
      );
      mesh.position.set(element.x, element.y, element.z);
      mesh.userData = pickUserData(element);
      group.add(mesh);
    }
  }

  buildInstancedMarkers(group, elements, geometry, material) {
    const mesh = new THREE.InstancedMesh(geometry, material, elements.length);
    const dummy = new THREE.Object3D();
    mesh.userData.pickTable = elements.map((element) => element.pickTarget || fallbackPick(element));
    elements.forEach((element, index) => {
      dummy.position.set(element.x, element.y, element.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  setPresentationSectionPlanes(planeEquations = []) {
    this.presentationSectionPlanes = createTopologyEditSectionPlaneEquations(planeEquations);
    this.presentationClippingPlanes = Object.freeze(this.presentationSectionPlanes.map(({ normal, constant }) => (
      new THREE.Plane(new THREE.Vector3(normal.x, normal.y, normal.z), constant)
    )));
    if (this.renderer) this.renderer.localClippingEnabled = this.presentationClippingPlanes.length > 0;
    this.applyPresentationClippingToGroups();
    return this.presentationSectionPlanes.length;
  }

  applyPresentationClippingToGroups() {
    [this.groups.sourceGroup, this.groups.draftGroup, this.groups.supportGroup].forEach((group) => {
      group.traverse((object) => applyObjectClipping(object, this.presentationClippingPlanes));
    });
  }

  setStandardView(viewName) {
    const bounds = this.lastBounds;
    const center = bounds ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3();
    const distance = bounds ? Math.max(bounds.getSize(new THREE.Vector3()).length(), 10) : 30;
    const direction = STANDARD_VIEW_DIRECTIONS[String(viewName).toUpperCase()]
      || STANDARD_VIEW_DIRECTIONS.ISO;
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.lookAt(center);
    this.camera.near = Math.max(distance / 1000, 0.01);
    this.camera.far = Math.max(distance * 100, 1000);
    this.camera.updateProjectionMatrix();
  }

  fitAll() {
    const bounds = this.lastBounds && !this.lastBounds.isEmpty()
      ? this.lastBounds
      : new THREE.Box3().setFromObject(this.scene);
    if (bounds.isEmpty()) {
      this.camera.position.set(25, 25, 25);
      this.camera.lookAt(0, 0, 0);
      return;
    }
    this.lastBounds = bounds;
    this.setStandardView('ISO');
  }

  pickAt(clientX, clientY) {
    if (!this.hostElement || !this.renderer) return null;
    const rect = this.hostElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.activeCamera);
    const intersects = raycaster.intersectObjects(this.scene.children, true);
    const hit = intersects.find((candidate) => (
      isEngineeringPointInsideSectionPlanes(candidate.point, this.presentationSectionPlanes)
    ));
    if (!hit) return null;
    const target = hit.instanceId !== undefined
      ? hit.object.userData?.pickTable?.[hit.instanceId]
      : hit.object.userData?.pickTarget;
    if (!target?.objectId) return null;
    return createTopologyEditPick({
      ...target,
      point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
    });
  }

  destroy() {
    this.isMounted = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    this.setPresentationSectionPlanes([]);
    Object.values(this.groups).forEach(disposeViewportGroup);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement?.parentElement?.removeChild(this.renderer.domElement);
      this.renderer = null;
    }
    this.hostElement = null;
  }
}

function createGroups(scene) {
  const groups = Object.freeze({
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
  Object.values(groups).forEach((group) => scene.add(group));
  return groups;
}

function createRenderer(width, height, clippingEnabled) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x020617, 1);
  renderer.localClippingEnabled = clippingEnabled;
  return renderer;
}
