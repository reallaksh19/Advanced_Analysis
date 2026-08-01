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

const STANDARD_VIEW_DIRECTIONS = Object.freeze({
  TOP: new THREE.Vector3(0, 1, 0.001).normalize(),
  BOTTOM: new THREE.Vector3(0, -1, 0.001).normalize(),
  FRONT: new THREE.Vector3(0, 0, 1),
  BACK: new THREE.Vector3(0, 0, -1),
  LEFT: new THREE.Vector3(-1, 0, 0),
  RIGHT: new THREE.Vector3(1, 0, 0),
  ISO: new THREE.Vector3(1, 1, 1).normalize(),
});

function computeElementBounds(elements, segments = []) {
  const bounds = new THREE.Box3();
  elements.forEach((el) => {
    if (Number.isFinite(el.x) && Number.isFinite(el.y) && Number.isFinite(el.z)) {
      bounds.expandByPoint(new THREE.Vector3(el.x, el.y, el.z));
    }
  });
  segments.forEach((segment) => {
    if (isFinitePoint(segment.start)) bounds.expandByPoint(new THREE.Vector3(segment.start.x, segment.start.y, segment.start.z));
    if (isFinitePoint(segment.end)) bounds.expandByPoint(new THREE.Vector3(segment.end.x, segment.end.y, segment.end.z));
  });
  return bounds;
}

function isFinitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function markerSizeForBounds(bounds) {
  if (!bounds || bounds.isEmpty()) return 10;
  const diagonal = bounds.getSize(new THREE.Vector3()).length();
  return Math.max(diagonal * 0.008, 5);
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export class TopologyEditViewportBackend {
  constructor(options = {}) {
    this.hostElement = null;
    this.scene = new THREE.Scene();
    // Far plane and marker sizes are scaled from real scene bounds (renderSession),
    // not fixed unit-scale constants — piping models are typically thousands of mm
    // across, so a 2000-unit far plane / 0.2-unit marker (the original constants
    // here) leaves the actual geometry invisible or clipped.
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000000);
    this.orthoCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000000);
    this.activeCamera = this.camera;
    this.renderer = null;
    this.hasFitOnce = false;

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

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x020617, 1);

    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
      console.warn('⚠️ TopologyEditViewportBackend: WebGL Context Lost. Pausing animation loop.');
    }, false);

    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      console.log('⚡ TopologyEditViewportBackend: WebGL Context Restored. Resuming render loop.');
      this.startRenderLoop();
    }, false);

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

    const allElements = [...(model.source?.elements || []), ...(model.draft?.elements || [])];
    const allSegments = [...(model.source?.segments || []), ...(model.draft?.segments || [])];
    this.lastBounds = computeElementBounds(allElements, allSegments);
    const markerSize = markerSizeForBounds(this.lastBounds);

    // Build source & draft visual meshes — segments (pipe runs) first so node
    // markers render on top at each segment's endpoints/junctions.
    if (model.source) {
      this.buildSegmentGroup(this.groups.sourceGroup, model.source.segments, 0x38bdf8, 0.4, markerSize);
      this.buildMeshGroup(this.groups.sourceGroup, model.source.elements, 0x38bdf8, 0.4, markerSize);
    }
    if (model.draft) {
      this.buildSegmentGroup(this.groups.draftGroup, model.draft.segments, 0x0284c7, 1.0, markerSize);
      this.buildMeshGroup(this.groups.draftGroup, model.draft.elements, 0x0284c7, 1.0, markerSize);
    }

    if (!this.hasFitOnce && (allElements.length || allSegments.length)) {
      this.hasFitOnce = true;
      this.fitAll();
    }
  }

  /**
   * Renders real oriented pipe-run cylinders between each segment's actual
   * two endpoints (radius from source bore data where available), replacing
   * the earlier placeholder of one fixed-size, fixed-orientation cylinder
   * per element. Full per-type fitting shapes (valve/flange/tee/OLET/elbow)
   * are a later phase — see futureplan.md item 1.
   */
  buildSegmentGroup(group, segments = [], colorHex = 0x0284c7, opacity = 1.0, fallbackMarkerSize = 10) {
    if (!segments || segments.length === 0) return;
    const material = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.3,
      metalness: 0.2,
      transparent: opacity < 1.0,
      opacity,
    });
    const up = new THREE.Vector3(0, 1, 0);
    segments.forEach((segment) => {
      if (!isFinitePoint(segment.start) || !isFinitePoint(segment.end)) return;
      const start = new THREE.Vector3(segment.start.x, segment.start.y, segment.start.z);
      const end = new THREE.Vector3(segment.end.x, segment.end.y, segment.end.z);
      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();
      if (length < 1e-6) return;
      const radius = Number.isFinite(segment.radiusMm) && segment.radiusMm > 0 ? segment.radiusMm : fallbackMarkerSize * 0.6;
      const geometry = new THREE.CylinderGeometry(radius, radius, length, 12);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.addVectors(start, end).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(up, direction.normalize());
      mesh.userData = { canonicalId: segment.id ?? segment.entityId, type: segment.type || 'edge' };
      group.add(mesh);
    });
  }

  buildMeshGroup(group, elements = [], colorHex = 0x0284c7, opacity = 1.0, markerSize = 10) {
    if (!elements || elements.length === 0) return;

    const material = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.3,
      metalness: 0.2,
      transparent: opacity < 1.0,
      opacity: opacity,
    });
    // Real elbow/valve/flange/OLET shapes are a later phase (see futureplan.md);
    // for now every element renders as a sphere marker sized relative to the
    // scene's real coordinate range, not a fixed unit-scale constant.
    const geometry = new THREE.SphereGeometry(markerSize, 12, 10);

    if (elements.length >= 500) {
      const instancedMesh = new THREE.InstancedMesh(geometry, material, elements.length);
      const dummy = new THREE.Object3D();
      // Pick-ID table: InstancedMesh hits report an instanceId, not userData,
      // so pickAt() needs an explicit instanceId -> canonicalId lookup — the
      // prior version never built one, so every pick on an instanced scene
      // silently returned the literal string 'primitive-hit'.
      instancedMesh.userData.pickTable = elements.map((el) => el.id ?? el.entityId ?? null);

      elements.forEach((el, idx) => {
        dummy.position.set(finiteOr(el.x, 0), finiteOr(el.y, 0), finiteOr(el.z, 0));
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(idx, dummy.matrix);
      });

      instancedMesh.instanceMatrix.needsUpdate = true;
      group.add(instancedMesh);
    } else {
      elements.forEach(el => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(finiteOr(el.x, 0), finiteOr(el.y, 0), finiteOr(el.z, 0));
        mesh.userData = { canonicalId: el.id || el.entityId, type: el.type };
        group.add(mesh);
      });
    }
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
    const bounds = this.lastBounds;
    const center = bounds ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0);
    const dist = bounds ? Math.max(bounds.getSize(new THREE.Vector3()).length(), 10) : 30;
    const direction = STANDARD_VIEW_DIRECTIONS[viewName.toUpperCase()] || STANDARD_VIEW_DIRECTIONS.ISO;
    this.camera.position.copy(center).addScaledVector(direction, dist);
    this.camera.lookAt(center);
    this.camera.near = Math.max(dist / 1000, 0.01);
    this.camera.far = Math.max(dist * 100, 1000);
    this.camera.updateProjectionMatrix();
  }

  fitAll() {
    const bounds = this.lastBounds && !this.lastBounds.isEmpty() ? this.lastBounds : new THREE.Box3().setFromObject(this.scene);
    if (bounds.isEmpty()) { this.camera.position.set(25, 25, 25); this.camera.lookAt(0, 0, 0); return; }
    this.lastBounds = bounds;
    this.setStandardView('ISO');
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
      const objectId = hit.instanceId !== undefined
        ? (hit.object.userData?.pickTable?.[hit.instanceId] ?? 'primitive-hit')
        : (hit.object.userData?.canonicalId || 'primitive-hit');
      return createTopologyEditPick({
        objectId,
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
