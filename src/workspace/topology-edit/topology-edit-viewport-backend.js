/** Three.js rendering adapter for disposable topology-edit visual projections. */
import * as THREE from 'three';
import { TopologyEditGpuPicker } from './topology-edit-gpu-picker.js';
import { TopologyEditIssueRenderer } from './topology-edit-issue-renderer.js';
import { createTopologyEditPick } from './topology-edit-picking-contract.js';
import { createTopologyEditViewState } from './topology-edit-view-state.js';

const STANDARD_VIEW_DIRECTIONS = Object.freeze({
  TOP: new THREE.Vector3(0, 1, 0.001).normalize(), BOTTOM: new THREE.Vector3(0, -1, 0.001).normalize(),
  FRONT: new THREE.Vector3(0, 0, 1), BACK: new THREE.Vector3(0, 0, -1),
  LEFT: new THREE.Vector3(-1, 0, 0), RIGHT: new THREE.Vector3(1, 0, 0), ISO: new THREE.Vector3(1, 1, 1).normalize(),
});

export class TopologyEditViewportBackend {
  constructor(options = {}) {
    this.hostElement = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000000);
    this.orthoCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000000);
    this.activeCamera = this.camera;
    this.renderer = null;
    this.gpuPicker = null;
    this.issueRenderer = null;
    this.pickRaycaster = new THREE.Raycaster();
    this.hasFitOnce = false;
    this.groups = Object.freeze({
      sourceGroup: new THREE.Group(), draftGroup: new THREE.Group(), ghostGroup: new THREE.Group(),
      connectorGroup: new THREE.Group(), transientGroup: new THREE.Group(), measurementGroup: new THREE.Group(),
      issueGroup: new THREE.Group(), supportGroup: new THREE.Group(), selectionGroup: new THREE.Group(),
    });
    this.groups.ghostGroup.userData.nonPickable = true;
    Object.values(this.groups).forEach((group) => this.scene.add(group));
    this.viewState = createTopologyEditViewState(options.viewState);
    this.animationFrameId = null;
    this.isMounted = false;
    this.setupLights();
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    const primary = new THREE.DirectionalLight(0xffffff, 0.8);
    const secondary = new THREE.DirectionalLight(0x38bdf8, 0.4);
    primary.position.set(100, 200, 150); secondary.position.set(-100, -100, -100);
    this.scene.add(ambientLight, primary, secondary);
  }

  mount(host) {
    if (!host) throw new TypeError('TopologyEditViewportBackend: Invalid host element.');
    this.destroy();
    this.hostElement = host;
    const width = host.clientWidth || 800; const height = host.clientHeight || 500;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x020617, 1);
    this.gpuPicker = new TopologyEditGpuPicker({ renderer: this.renderer, scene: this.scene });
    this.issueRenderer = new TopologyEditIssueRenderer(this.groups.issueGroup);
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => this.handleContextLost(event), false);
    this.renderer.domElement.addEventListener('webglcontextrestored', () => this.startLoop(), false);
    host.replaceChildren(this.renderer.domElement);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.camera.position.set(20, 20, 20); this.camera.lookAt(0, 0, 0);
    this.isMounted = true; this.startLoop();
  }

  handleContextLost(event) { event.preventDefault(); if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
  startLoop() {
    if (this.animationFrameId || !this.isMounted || !this.renderer) return;
    const animate = () => {
      if (!this.isMounted || !this.renderer) { this.animationFrameId = null; return; }
      this.renderer.render(this.scene, this.activeCamera);
      this.animationFrameId = requestAnimationFrame(animate);
    };
    animate();
  }

  renderSession(model) {
    if (!model) return;
    this.clearGroup(this.groups.sourceGroup); this.clearGroup(this.groups.draftGroup);
    this.clearGroup(this.groups.supportGroup); this.clearGhost();
    const projections = [model.source, model.draft, model.supports].filter(Boolean);
    const allElements = projections.flatMap((row) => row.elements || []);
    const allSegments = projections.flatMap((row) => row.segments || []);
    this.lastBounds = computeBounds(allElements, allSegments);
    const markerSize = markerSizeForBounds(this.lastBounds);
    this.renderProjection(this.groups.sourceGroup, model.source, 0x38bdf8, 0.4, markerSize);
    this.renderProjection(this.groups.draftGroup, model.draft, 0x0284c7, 1, markerSize);
    this.renderProjection(this.groups.supportGroup, model.supports, 0x22d3ee, 1, markerSize);
    this.renderGhost(model.ghost, markerSize);
    if (!this.hasFitOnce && (allElements.length || allSegments.length)) { this.hasFitOnce = true; this.fitAll(); }
  }

  renderGhost(ghost, markerSize = markerSizeForBounds(this.lastBounds)) {
    this.clearGhost();
    if (!ghost) return;
    const visualRadius = Math.max(markerSize * 0.18, 1);
    const projection = {
      elements: ghost.elements || [],
      segments: (ghost.segments || []).map((row) => ({ ...row, radiusMm: positive(row.radiusMm) || visualRadius })),
    };
    this.renderProjection(this.groups.ghostGroup, projection, 0xf59e0b, 0.38, markerSize * 1.2);
  }
  clearGhost() { this.clearGroup(this.groups.ghostGroup); }
  renderIssues(overlay) { return this.issueRenderer?.render(overlay, this.lastBounds) ?? 0; }
  clearIssues() { this.issueRenderer?.clear(); }

  renderProjection(group, projection, colorHex, opacity, markerSize) {
    if (!projection) return;
    this.buildSegmentGroup(group, projection.segments, colorHex, opacity);
    this.buildMeshGroup(group, projection.elements, colorHex, opacity, markerSize);
  }

  buildSegmentGroup(group, segments = [], colorHex = 0x0284c7, opacity = 1) {
    const materials = new Map();
    for (const segment of segments || []) {
      if (!isFinitePoint(segment.start) || !isFinitePoint(segment.end)) continue;
      const radius = positive(segment.radiusMm); if (radius === null) continue;
      const color = Number.isInteger(segment.colorInt) ? segment.colorInt : colorHex;
      const geometry = segmentGeometry(segment, radius); if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry.geometry, cachedMaterial(materials, color, opacity));
      if (geometry.position) mesh.position.copy(geometry.position);
      if (geometry.quaternion) mesh.quaternion.copy(geometry.quaternion);
      mesh.userData = pickUserData(segment); group.add(mesh);
    }
  }

  buildMeshGroup(group, elements = [], colorHex = 0x0284c7, opacity = 1, markerSize = 10) {
    const valid = (elements || []).filter((element) => finiteElement(element)); if (!valid.length) return;
    const material = createMaterial(colorHex, opacity); const geometry = new THREE.SphereGeometry(markerSize, 12, 10);
    if (valid.length >= 500 && valid.every((element) => !positive(element.sizeMm))) { this.buildInstancedMarkers(group, valid, geometry, material); return; }
    for (const element of valid) {
      const size = positive(element.sizeMm); const elementGeometry = size ? new THREE.SphereGeometry(size, 12, 10) : geometry;
      const mesh = new THREE.Mesh(elementGeometry, material); mesh.position.set(element.x, element.y, element.z);
      mesh.userData = pickUserData(element); group.add(mesh);
    }
  }

  buildInstancedMarkers(group, elements, geometry, material) {
    const mesh = new THREE.InstancedMesh(geometry, material, elements.length); const dummy = new THREE.Object3D();
    mesh.userData.pickTable = elements.map((element) => element.pickTarget || fallbackPick(element));
    elements.forEach((element, index) => { dummy.position.set(element.x, element.y, element.z); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); });
    mesh.instanceMatrix.needsUpdate = true; group.add(mesh);
  }

  clearGroup(group) {
    const geometries = new Set(); const materials = new Set();
    group.traverse((object) => { if (object.geometry) geometries.add(object.geometry); const rows = Array.isArray(object.material) ? object.material : [object.material]; rows.filter(Boolean).forEach((material) => materials.add(material)); });
    while (group.children.length) group.remove(group.children[0]);
    geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose());
  }

  setStandardView(viewName) {
    const bounds = this.lastBounds; const center = bounds ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0);
    const distance = bounds ? Math.max(bounds.getSize(new THREE.Vector3()).length(), 10) : 30;
    const direction = STANDARD_VIEW_DIRECTIONS[String(viewName).toUpperCase()] || STANDARD_VIEW_DIRECTIONS.ISO;
    this.camera.position.copy(center).addScaledVector(direction, distance); this.camera.lookAt(center);
    this.camera.near = Math.max(distance / 1000, 0.01); this.camera.far = Math.max(distance * 100, 1000); this.camera.updateProjectionMatrix();
  }

  fitAll() {
    const bounds = this.lastBounds && !this.lastBounds.isEmpty() ? this.lastBounds : new THREE.Box3().setFromObject(this.scene);
    if (bounds.isEmpty()) { this.camera.position.set(25, 25, 25); this.camera.lookAt(0, 0, 0); return; }
    this.lastBounds = bounds; this.setStandardView('ISO');
  }

  pickAt(clientX, clientY) {
    const context = this.pickContext(clientX, clientY);
    if (!context) return null;
    const gpuHit = this.gpuPicker?.pick({ clientX, clientY, rect: context.rect, camera: this.activeCamera });
    if (gpuHit) return this.pickReceipt(gpuHit.target, this.resolveGpuPickPoint(gpuHit, context.pointer));
    return this.pickWithRaycaster(context.pointer);
  }

  pickContext(clientX, clientY) {
    if (!this.hostElement || !this.renderer) return null;
    const rect = this.hostElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    return { rect, pointer };
  }

  pickWithRaycaster(pointer) {
    this.pickRaycaster.setFromCamera(pointer, this.activeCamera);
    const hit = this.pickRaycaster.intersectObjects(this.scene.children, true).find((row) => !hasNonPickableAncestor(row.object));
    if (!hit) return null;
    return this.pickReceipt(resolveHitTarget(hit), hit.point);
  }

  resolveGpuPickPoint(gpuHit, pointer) {
    this.pickRaycaster.setFromCamera(pointer, this.activeCamera);
    const hit = this.pickRaycaster.intersectObject(gpuHit.object, true).find((row) => gpuHit.instanceId === null || row.instanceId === gpuHit.instanceId);
    if (hit?.point) return hit.point;
    if (gpuHit.instanceId !== null && gpuHit.object?.getMatrixAt) {
      const matrix = new THREE.Matrix4();
      gpuHit.object.getMatrixAt(gpuHit.instanceId, matrix);
      matrix.premultiply(gpuHit.object.matrixWorld);
      return new THREE.Vector3().setFromMatrixPosition(matrix);
    }
    return gpuHit.object?.getWorldPosition?.(new THREE.Vector3()) ?? new THREE.Vector3();
  }

  pickReceipt(target, point) {
    if (!target?.objectId) return null;
    return createTopologyEditPick({ ...target, point: { x: point.x, y: point.y, z: point.z } });
  }

  destroy() {
    this.isMounted = false; if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null;
    this.gpuPicker?.dispose(); this.gpuPicker = null;
    this.issueRenderer?.destroy(); this.issueRenderer = null;
    Object.values(this.groups).forEach((group) => this.clearGroup(group));
    if (this.renderer) { this.renderer.dispose(); this.renderer.domElement?.parentElement?.removeChild(this.renderer.domElement); this.renderer = null; }
  }
}

function segmentGeometry(segment, radius) {
  if (Array.isArray(segment.points) && segment.points.length >= 2) {
    const points = segment.points.filter(isFinitePoint).map((point) => new THREE.Vector3(point.x, point.y, point.z));
    if (points.length < 2) return null;
    return { geometry: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'centripetal'), Math.max(points.length - 1, 1), radius, 12, false) };
  }
  const start = new THREE.Vector3(segment.start.x, segment.start.y, segment.start.z); const end = new THREE.Vector3(segment.end.x, segment.end.y, segment.end.z);
  const direction = new THREE.Vector3().subVectors(end, start); const length = direction.length(); if (length < 1e-6) return null;
  const geometry = new THREE.CylinderGeometry(positive(segment.endRadiusMm) || radius, radius, length, 12);
  return { geometry, position: new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5), quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()) };
}
function computeBounds(elements, segments) {
  const bounds = new THREE.Box3();
  elements.forEach((element) => { if (finiteElement(element)) bounds.expandByPoint(new THREE.Vector3(element.x, element.y, element.z)); });
  segments.forEach((segment) => (segment.points || [segment.start, segment.end]).filter(isFinitePoint).forEach((point) => bounds.expandByPoint(new THREE.Vector3(point.x, point.y, point.z))));
  return bounds;
}
function markerSizeForBounds(bounds) { return !bounds || bounds.isEmpty() ? 10 : Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.008, 5); }
function isFinitePoint(point) { return point && [point.x, point.y, point.z].every(Number.isFinite); }
function finiteElement(element) { return element && [element.x, element.y, element.z].every(Number.isFinite); }
function positive(value) { return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null; }
function createMaterial(color, opacity) { return new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.2, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }); }
function cachedMaterial(cache, color, opacity) { const key = `${color}:${opacity}`; if (!cache.has(key)) cache.set(key, createMaterial(color, opacity)); return cache.get(key); }
function fallbackPick(value) { return { objectKind: value.type === 'node' ? 'node' : 'component', objectId: value.entityId || value.id, nodeId: value.type === 'node' ? value.entityId || value.id : '' }; }
function pickUserData(value) { return { canonicalId: value.entityId || value.id, type: value.type, pickTarget: value.pickTarget || fallbackPick(value) }; }
function resolveHitTarget(hit) { return hit.instanceId !== undefined ? hit.object.userData?.pickTable?.[hit.instanceId] : hit.object.userData?.pickTarget; }
function hasNonPickableAncestor(object) { let current = object; while (current) { if (current.userData?.nonPickable) return true; current = current.parent; } return false; }
