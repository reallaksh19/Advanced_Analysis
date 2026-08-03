/** Three.js rendering adapter for governed topology-edit visual projections. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { deepFreeze } from '../../core/shared-piping-model/index.js';
import { projectDataStore } from '../project-data/project-data-store.js';
import { ThreeInteractionArbiter } from '../three-interaction-arbiter.js';
import { fitThreeView, setThreeStandardView } from '../three-viewport-camera.js';
import {
  createTopologyEditSectionPlaneEquations,
} from '../viewport-presentation/topology-edit-section-model.js';
import {
  ENGINEERING_TO_RENDER_MATRIX4_ELEMENTS,
  assertTopologyEditCoordinateTransform,
  engineeringBoundsToRender,
  engineeringPlaneToRender,
  renderPointToEngineering,
} from './topology-edit-coordinate-transform.js';
import { TopologyEditGpuPicker } from './topology-edit-gpu-picker.js';
import { topologyEditPickTargetKey } from './topology-edit-gpu-pick-helpers.js';
import { TopologyEditInspectionRenderer } from './topology-edit-inspection-renderer.js';
import { TopologyEditIssueRenderer } from './topology-edit-issue-renderer.js';
import { createTopologyEditPick } from './topology-edit-picking-contract.js';
import {
  assertTopologyEditViewportConfiguration,
  createTopologyEditViewportConfiguration,
} from './topology-edit-viewport-configuration.js';
import { createTopologyEditViewState } from './topology-edit-view-state.js';

const CAMERA_STATE_SCHEMA = 'TopologyEditCameraState.v1';
const INTERACTION_MODES = new Set(['select', 'orbit', 'pan']);
const MIN_GEOMETRY_LENGTH = 1e-6;

export class TopologyEditViewportBackend {
  constructor(options = {}) {
    assertTopologyEditCoordinateTransform();
    this.usesProjectDataStore = !options.navigationConfiguration && !options.projectDataProfile;
    const profile = options.projectDataProfile ? options.projectDataProfile : projectDataStore.getProfile();
    this.navigationConfiguration = options.navigationConfiguration
      ? assertTopologyEditViewportConfiguration(options.navigationConfiguration)
      : createTopologyEditViewportConfiguration(profile);
    this.model = deepFreeze({ webglNavigation: this.navigationConfiguration });
    this.viewState = createTopologyEditViewState(options.viewState);
    this.scene = new THREE.Scene();
    this.engineeringRoot = createEngineeringRoot();
    this.groups = {
      sourceGroup: new THREE.Group(),
      draftGroup: new THREE.Group(),
      ghostGroup: new THREE.Group(),
      connectorGroup: new THREE.Group(),
      transientGroup: new THREE.Group(),
      measurementGroup: new THREE.Group(),
      issueGroup: new THREE.Group(),
      supportGroup: new THREE.Group(),
      selectionGroup: new THREE.Group(),
    };
    this.groups.ghostGroup.userData.nonPickable = true;
    this.groups.measurementGroup.userData.nonPickable = true;
    this.groups.selectionGroup.userData.nonPickable = true;
    Object.values(this.groups).forEach((group) => this.engineeringRoot.add(group));
    this.scene.add(this.engineeringRoot);
    this.hostElement = null;
    this.renderer = null;
    this.gpuPicker = null;
    this.inspectionRenderer = null;
    this.issueRenderer = null;
    this.controls = null;
    this.arbiter = null;
    this.resizeObserver = null;
    this.projectDataUnsubscribe = null;
    this.pickRaycaster = new THREE.Raycaster();
    this.pickRaycaster.params.Line.threshold = this.navigationConfiguration.pickingRadius;
    this.activeSectionPlaneEquations = deepFreeze([]);
    this.activeRenderSectionPlaneEquations = deepFreeze([]);
    this.activeSectionPlanes = [];
    this.engineeringBounds = null;
    this.lastBounds = null;
    this.sceneBoundsCache = null;
    this.objects = new Map();
    this.hasFitOnce = false;
    this.initialCameraState = null;
    this.viewHistory = [];
    this.lastSelectionPick = null;
    this.lastPickIdentity = '';
    this.doubleClickEligible = false;
    this.selectionRequestHandler = null;
    this.interactionMode = 'select';
    this.animationFrameId = 0;
    this.renderDirty = false;
    this.contextLost = false;
    this.isMounted = false;
    this.configurationError = null;
    this.boundsRevision = 0;
    this.contextLostHandler = null;
    this.contextRestoredHandler = null;
    this.controlsChangeHandler = null;
    this.renderFrameHandler = () => this.renderFrame();
    this.initializeCameras();
    this.setupLights();
  }

  initializeCameras() {
    const config = this.navigationConfiguration;
    this.perspectiveCamera = new THREE.PerspectiveCamera(
      config.perspectiveFovDeg,
      1,
      config.cameraNearMm,
      config.cameraFarMm,
    );
    this.orthoCamera = new THREE.OrthographicCamera(
      -10,
      10,
      10,
      -10,
      config.cameraNearMm,
      config.cameraFarMm,
    );
    this.perspectiveCamera.position.set(20, 20, 20);
    this.perspectiveCamera.up.set(0, 1, 0);
    this.perspectiveCamera.lookAt(0, 0, 0);
    this.orthoCamera.position.copy(this.perspectiveCamera.position);
    this.orthoCamera.quaternion.copy(this.perspectiveCamera.quaternion);
    this.orthoCamera.up.copy(this.perspectiveCamera.up);
    this.activeCamera = this.perspectiveCamera;
    this.camera = this.activeCamera;
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    const primary = new THREE.DirectionalLight(0xffffff, 0.8);
    const secondary = new THREE.DirectionalLight(0x38bdf8, 0.4);
    primary.position.set(100, 200, 150);
    secondary.position.set(-100, -100, -100);
    this.scene.add(ambientLight, primary, secondary);
  }

  mount(host) {
    if (!host) throw new TypeError('TopologyEditViewportBackend: Invalid host element.');
    this.destroy();
    this.initializeCameras();
    this.hostElement = host;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    const pixelRatio = Number(globalThis.devicePixelRatio);
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
      throw new Error('TOPOLOGY_EDIT_VIEWPORT_PIXEL_RATIO_INVALID: A positive browser devicePixelRatio is required.');
    }
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setClearColor(0x020617, 1);
    this.renderer.domElement.className = 'topology-edit-viewport-canvas';
    this.renderer.domElement.dataset.viewportBackend = 'topology-edit-webgl';
    this.renderer.domElement.setAttribute('aria-label', 'Topology edit WebGL viewport');
    this.contextLostHandler = (event) => this.handleContextLost(event);
    this.contextRestoredHandler = () => this.handleContextRestored();
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLostHandler, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.contextRestoredHandler, false);
    host.replaceChildren(this.renderer.domElement);
    host.dataset.viewportBackend = 'topology-edit-webgl';
    this.gpuPicker = new TopologyEditGpuPicker({
      renderer: this.renderer,
      scene: this.scene,
    });
    this.issueRenderer = new TopologyEditIssueRenderer(this.groups.issueGroup);
    this.inspectionRenderer = new TopologyEditInspectionRenderer({
      selectionGroup: this.groups.selectionGroup,
      measurementGroup: this.groups.measurementGroup,
    });
    this.createNavigation(new THREE.Vector3());
    if (typeof globalThis.ResizeObserver === 'function') {
      this.resizeObserver = new globalThis.ResizeObserver(() => this.resize());
      this.resizeObserver.observe(host);
    }
    if (this.usesProjectDataStore) {
      this.projectDataUnsubscribe = projectDataStore.subscribe(({ profile }) => {
        this.handleProjectDataChange(profile);
      });
    }
    this.isMounted = true;
    this.resize();
    this.invalidate('mount');
  }

  createNavigation(target) {
    if (!this.renderer) return;
    this.disposeNavigation();
    this.controls = new OrbitControls(this.activeCamera, this.renderer.domElement);
    this.controls.target.copy(target);
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = true;
    this.controls.rotateSpeed = this.navigationConfiguration.navigationSensitivity;
    this.controls.panSpeed = this.navigationConfiguration.navigationSensitivity;
    this.controls.zoomSpeed = this.navigationConfiguration.zoomRate;
    this.controlsChangeHandler = () => this.invalidate('controls-change');
    this.controls.addEventListener('change', this.controlsChangeHandler);
    this.arbiter = new ThreeInteractionArbiter(
      this.renderer.domElement,
      this.controls,
      {
        onSelect: (event) => this.handlePointerSelection(event),
        onFitSelection: () => this.handleFitSelectionIntent(),
        onClearSelection: () => this.handleClearSelectionIntent(),
      },
      interactionConfiguration(this.navigationConfiguration),
    );
    this.arbiter.setMode(this.interactionMode);
    this.controls.update();
  }

  disposeNavigation() {
    this.arbiter?.dispose();
    this.arbiter = null;
    if (this.controls) {
      if (this.controlsChangeHandler) {
        this.controls.removeEventListener('change', this.controlsChangeHandler);
      }
      this.controls.dispose();
    }
    this.controls = null;
    this.controlsChangeHandler = null;
  }

  handleProjectDataChange(profile) {
    try {
      this.configurationError = null;
      this.updateNavigationConfiguration(createTopologyEditViewportConfiguration(profile));
      if (this.hostElement) this.hostElement.dataset.configurationStatus = 'READY';
    } catch (error) {
      this.configurationError = error;
      this.disposeNavigation();
      if (this.hostElement) this.hostElement.dataset.configurationStatus = 'BLOCKED';
    }
  }

  updateNavigationConfiguration(configuration) {
    this.navigationConfiguration = assertTopologyEditViewportConfiguration(configuration);
    this.model = deepFreeze({ webglNavigation: this.navigationConfiguration });
    this.pickRaycaster.params.Line.threshold = this.navigationConfiguration.pickingRadius;
    this.perspectiveCamera.fov = this.navigationConfiguration.perspectiveFovDeg;
    this.perspectiveCamera.updateProjectionMatrix();
    if (this.controls) {
      this.controls.rotateSpeed = this.navigationConfiguration.navigationSensitivity;
      this.controls.panSpeed = this.navigationConfiguration.navigationSensitivity;
      this.controls.zoomSpeed = this.navigationConfiguration.zoomRate;
    } else if (this.isMounted && this.renderer) {
      this.createNavigation(new THREE.Vector3());
    }
    this.arbiter?.updateConfiguration(interactionConfiguration(this.navigationConfiguration));
    this.invalidate('configuration-change');
  }

  setSelectionRequestHandler(callback) {
    if (callback !== null && typeof callback !== 'function') {
      throw new TypeError('Topology edit selection handler must be a function or null.');
    }
    this.selectionRequestHandler = callback;
  }

  setInteractionContext(modeInput) {
    const mode = modeInput === 'mode-select' ? 'select' : String(modeInput);
    if (!INTERACTION_MODES.has(mode)) {
      throw new TypeError(`Unsupported topology edit interaction mode: ${mode}`);
    }
    this.interactionMode = mode;
    this.arbiter?.setMode(mode);
    if (this.hostElement) this.hostElement.dataset.interactionMode = mode;
    this.invalidate('interaction-mode');
  }

  handlePointerSelection(event) {
    const pick = this.pickAt(event.clientX, event.clientY);
    if (!pick) {
      this.lastSelectionPick = null;
      this.lastPickIdentity = '';
      this.doubleClickEligible = false;
      this.selectionRequestHandler?.(null, event);
      this.invalidate('selection-clear');
      return;
    }
    const key = pickIdentityKey(pick);
    this.doubleClickEligible = Boolean(this.lastPickIdentity) && this.lastPickIdentity === key;
    this.lastPickIdentity = key;
    this.lastSelectionPick = pick;
    this.selectionRequestHandler?.(pick, event);
    this.invalidate('selection');
  }

  handleFitSelectionIntent() {
    const eligible = this.doubleClickEligible;
    this.doubleClickEligible = false;
    this.lastPickIdentity = '';
    if (eligible) this.fitSelection();
  }

  handleClearSelectionIntent() {
    this.lastSelectionPick = null;
    this.lastPickIdentity = '';
    this.doubleClickEligible = false;
    this.selectionRequestHandler?.(null, null);
    this.invalidate('selection-clear');
  }

  renderSession(model) {
    if (!model) return;
    this.clearGroup(this.groups.sourceGroup);
    this.clearGroup(this.groups.draftGroup);
    this.clearGroup(this.groups.supportGroup);
    this.clearGroup(this.groups.ghostGroup);
    const projections = [model.source, model.draft, model.supports].filter(Boolean);
    const allElements = projections.flatMap((row) => Array.isArray(row.elements) ? row.elements : []);
    const allSegments = projections.flatMap((row) => Array.isArray(row.segments) ? row.segments : []);
    this.engineeringBounds = computeBounds(allElements, allSegments);
    this.lastBounds = transformEngineeringBox(this.engineeringBounds);
    this.sceneBoundsCache = this.lastBounds.isEmpty() ? null : this.lastBounds.clone();
    this.boundsRevision += 1;
    const markerSize = markerSizeForBounds(this.engineeringBounds);
    this.renderProjection(this.groups.sourceGroup, model.source, 0x38bdf8, 0.4, markerSize);
    this.renderProjection(this.groups.draftGroup, model.draft, 0x0284c7, 1, markerSize);
    this.renderProjection(this.groups.supportGroup, model.supports, 0x22d3ee, 1, markerSize);
    this.renderGhost(model.ghost, markerSize);
    this.engineeringRoot.updateMatrixWorld(true);
    this.invalidate('model-replacement');
    if (!this.hasFitOnce && (allElements.length || allSegments.length)) {
      this.hasFitOnce = true;
      this.fitAll({ remember: false });
      if (this.controls) this.initialCameraState = this.captureCameraState();
    }
  }

  renderGhost(ghost, markerSize = markerSizeForBounds(this.engineeringBounds)) {
    this.clearGroup(this.groups.ghostGroup);
    if (!ghost) {
      this.invalidate('ghost-clear');
      return;
    }
    const visualRadius = Math.max(markerSize * 0.18, 1);
    const segments = Array.isArray(ghost.segments) ? ghost.segments : [];
    const projection = {
      elements: Array.isArray(ghost.elements) ? ghost.elements : [],
      segments: segments.map((row) => {
        const resolvedRadius = positive(row.radiusMm);
        return { ...row, radiusMm: resolvedRadius === null ? visualRadius : resolvedRadius };
      }),
    };
    this.renderProjection(this.groups.ghostGroup, projection, 0xf59e0b, 0.38, markerSize * 1.2);
    this.invalidate('ghost-replacement');
  }

  clearGhost() {
    this.clearGroup(this.groups.ghostGroup);
    this.invalidate('ghost-clear');
  }

  renderIssues(overlay) {
    const count = this.issueRenderer ? this.issueRenderer.render(overlay, this.engineeringBounds) : 0;
    this.invalidate('issue-overlay');
    return count;
  }

  clearIssues() {
    this.issueRenderer?.clear();
    this.invalidate('issue-overlay-clear');
  }

  renderInspection(model) {
    const result = this.inspectionRenderer ? this.inspectionRenderer.render(model, this.engineeringBounds) : null;
    this.invalidate('inspection-overlay');
    return result;
  }

  clearInspection() {
    this.inspectionRenderer?.clear();
    this.invalidate('inspection-overlay-clear');
  }

  renderProjection(group, projection, colorHex, opacity, markerSize) {
    if (!projection) return;
    this.buildSegmentGroup(group, projection.segments, colorHex, opacity);
    this.buildMeshGroup(group, projection.elements, colorHex, opacity, markerSize);
    this.applySectionPlanesToGroup(group);
  }

  setPresentationSectionPlanes(planes) {
    if (!Array.isArray(planes)) {
      throw new TypeError('TopologyEditViewportBackend: Section planes must be an array.');
    }
    if (planes.length !== 0 && planes.length !== 6) {
      throw new RangeError('TopologyEditViewportBackend: Section planes must contain zero or six equations.');
    }
    const engineeringEquations = createTopologyEditSectionPlaneEquations(planes);
    const renderEquations = engineeringEquations.map(engineeringPlaneToRender);
    this.activeSectionPlaneEquations = engineeringEquations;
    this.activeRenderSectionPlaneEquations = deepFreeze(renderEquations);
    this.activeSectionPlanes = renderEquations.map(({ normal, constant }) => (
      new THREE.Plane(new THREE.Vector3(normal.x, normal.y, normal.z), constant)
    ));
    if (this.renderer) this.renderer.localClippingEnabled = renderEquations.length > 0;
    this.sectionedGroups().forEach((group) => this.applySectionPlanesToGroup(group));
    this.invalidate('section-planes');
    return renderEquations.length;
  }

  sectionedGroups() {
    return [
      this.groups.sourceGroup,
      this.groups.draftGroup,
      this.groups.supportGroup,
      this.groups.ghostGroup,
    ];
  }

  pickableGroups() {
    return [
      this.groups.sourceGroup,
      this.groups.draftGroup,
      this.groups.supportGroup,
      this.groups.connectorGroup,
      this.groups.transientGroup,
      this.groups.issueGroup,
    ];
  }

  applySectionPlanesToGroup(group) {
    const materials = new Set();
    group.traverse((object) => {
      const rows = Array.isArray(object.material) ? object.material : [object.material];
      rows.filter(Boolean).forEach((material) => materials.add(material));
    });
    materials.forEach((material) => {
      material.clippingPlanes = this.activeSectionPlanes.length
        ? this.activeSectionPlanes.map((plane) => plane.clone())
        : null;
      material.needsUpdate = true;
    });
  }

  buildSegmentGroup(group, segments = [], colorHex = 0x0284c7, opacity = 1) {
    const materials = new Map();
    for (const segment of segments || []) {
      if (!isFinitePoint(segment.start) || !isFinitePoint(segment.end)) continue;
      const radius = positive(segment.radiusMm);
      if (radius === null) continue;
      const color = Number.isInteger(segment.colorInt) ? segment.colorInt : colorHex;
      const geometry = segmentGeometry(segment, radius, this.navigationConfiguration.meshRadialSegments);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry.geometry, cachedMaterial(materials, color, opacity));
      if (geometry.position) mesh.position.copy(geometry.position);
      if (geometry.quaternion) mesh.quaternion.copy(geometry.quaternion);
      mesh.userData = pickUserData(segment);
      group.add(mesh);
    }
  }

  buildMeshGroup(group, elements = [], colorHex = 0x0284c7, opacity = 1, markerSize = 10) {
    const valid = (elements || []).filter((element) => finiteElement(element));
    if (!valid.length) return;
    const material = createMaterial(colorHex, opacity);
    const radialSegments = Math.max(this.navigationConfiguration.meshRadialSegments, 8);
    const geometry = new THREE.SphereGeometry(markerSize, radialSegments, Math.max(6, Math.floor(radialSegments * 0.75)));
    if (valid.length >= 500 && valid.every((element) => positive(element.sizeMm) === null)) {
      this.buildInstancedMarkers(group, valid, geometry, material);
      return;
    }
    for (const element of valid) {
      const size = positive(element.sizeMm);
      const elementGeometry = size === null
        ? geometry
        : new THREE.SphereGeometry(size, radialSegments, Math.max(6, Math.floor(radialSegments * 0.75)));
      const mesh = new THREE.Mesh(elementGeometry, material);
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

  clearGroup(group) {
    const geometries = new Set();
    const materials = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const rows = Array.isArray(object.material) ? object.material : [object.material];
      rows.filter(Boolean).forEach((material) => materials.add(material));
    });
    while (group.children.length) group.remove(group.children[0]);
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }

  setStandardView(viewName) {
    if (!this.controls) return;
    this.rememberView();
    this.camera = this.activeCamera;
    this.sceneBoundsCache = this.lastBounds && !this.lastBounds.isEmpty()
      ? this.lastBounds.clone()
      : null;
    setThreeStandardView(this, viewName);
    this.invalidate('standard-view');
  }

  fitAll(options = {}) {
    if (!this.controls) return;
    const bounds = this.lastBounds && !this.lastBounds.isEmpty()
      ? this.lastBounds.clone()
      : new THREE.Box3().setFromObject(this.engineeringRoot);
    if (bounds.isEmpty()) {
      this.activeCamera.position.set(25, 25, 25);
      this.controls.target.set(0, 0, 0);
      this.activeCamera.lookAt(this.controls.target);
      this.controls.update();
      this.invalidate('fit-empty');
      return;
    }
    if (options.remember !== false) this.rememberView();
    this.camera = this.activeCamera;
    fitThreeView(this, bounds);
    this.invalidate('fit-all');
  }

  fitSelection() {
    if (!this.controls || !this.lastSelectionPick) return;
    const bounds = this.boundsForPick(this.lastSelectionPick);
    if (!bounds || bounds.isEmpty()) return;
    this.rememberView();
    this.camera = this.activeCamera;
    fitThreeView(this, bounds);
    this.invalidate('fit-selection');
  }

  pivotSelection() {
    if (!this.controls || !this.lastSelectionPick) return;
    const bounds = this.boundsForPick(this.lastSelectionPick);
    if (!bounds || bounds.isEmpty()) return;
    this.rememberView();
    bounds.getCenter(this.controls.target);
    this.controls.update();
    this.invalidate('pivot-selection');
  }

  home() {
    if (!this.initialCameraState) return;
    this.rememberView();
    this.restoreCameraState(this.initialCameraState);
    this.markViewCommand('home');
  }

  previousView() {
    const state = this.viewHistory.pop();
    if (!state) return;
    this.restoreCameraState(state);
    this.markViewCommand('previous');
  }

  toggleProjection() {
    if (!this.controls) return this.activeCamera.isPerspectiveCamera ? 'Perspective' : 'Orthographic';
    this.rememberView();
    const target = this.controls.target.clone();
    const direction = this.activeCamera.position.clone().sub(target);
    if (!(direction.length() > Number.EPSILON)) direction.set(1, 1, 1);
    direction.normalize();
    const aspect = this.viewportAspect();
    let replacement;
    if (this.activeCamera.isPerspectiveCamera) {
      const distance = this.activeCamera.position.distanceTo(target);
      const effectiveFov = 2 * Math.atan(
        Math.tan(THREE.MathUtils.degToRad(this.activeCamera.fov) / 2) / this.activeCamera.zoom,
      );
      const visibleHeight = 2 * distance * Math.tan(effectiveFov / 2);
      const halfHeight = Math.max(visibleHeight / 2, Number.EPSILON);
      replacement = new THREE.OrthographicCamera(
        -halfHeight * aspect,
        halfHeight * aspect,
        halfHeight,
        -halfHeight,
        this.activeCamera.near,
        this.activeCamera.far,
      );
      replacement.position.copy(this.activeCamera.position);
      replacement.quaternion.copy(this.activeCamera.quaternion);
      replacement.up.copy(this.activeCamera.up);
      replacement.zoom = 1;
    } else {
      const visibleHeight = (this.activeCamera.top - this.activeCamera.bottom) / this.activeCamera.zoom;
      const fov = this.navigationConfiguration.perspectiveFovDeg;
      const distance = visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
      replacement = new THREE.PerspectiveCamera(
        fov,
        aspect,
        this.activeCamera.near,
        this.activeCamera.far,
      );
      replacement.position.copy(target).addScaledVector(direction, distance);
      replacement.quaternion.copy(this.activeCamera.quaternion);
      replacement.up.copy(this.activeCamera.up);
      replacement.zoom = 1;
    }
    replacement.updateProjectionMatrix();
    this.replaceActiveCamera(replacement, target);
    this.markViewCommand(replacement.isPerspectiveCamera ? 'perspective' : 'orthographic');
    return replacement.isPerspectiveCamera ? 'Perspective' : 'Orthographic';
  }

  replaceActiveCamera(camera, target) {
    this.activeCamera = camera;
    this.camera = camera;
    if (camera.isPerspectiveCamera) this.perspectiveCamera = camera;
    if (camera.isOrthographicCamera) this.orthoCamera = camera;
    if (this.renderer) this.createNavigation(target);
    this.invalidate('camera-replacement');
  }

  captureCameraState() {
    if (!this.controls || !this.activeCamera) return null;
    const camera = this.activeCamera;
    return deepFreeze({
      schema: CAMERA_STATE_SCHEMA,
      projection: camera.isPerspectiveCamera ? 'PERSPECTIVE' : 'ORTHOGRAPHIC',
      position: vectorRecord(camera.position),
      quaternion: quaternionRecord(camera.quaternion),
      up: vectorRecord(camera.up),
      target: vectorRecord(this.controls.target),
      pivot: vectorRecord(this.controls.target),
      zoom: camera.zoom,
      perspective: camera.isPerspectiveCamera ? {
        fovDeg: camera.fov,
        aspect: camera.aspect,
        near: camera.near,
        far: camera.far,
      } : null,
      orthographic: camera.isOrthographicCamera ? {
        left: camera.left,
        right: camera.right,
        top: camera.top,
        bottom: camera.bottom,
        near: camera.near,
        far: camera.far,
      } : null,
      boundsRevision: this.boundsRevision,
    });
  }

  restoreCameraState(state) {
    if (state?.schema !== CAMERA_STATE_SCHEMA) {
      throw new TypeError(`Topology edit camera state must use ${CAMERA_STATE_SCHEMA}.`);
    }
    let camera;
    if (state.projection === 'PERSPECTIVE' && state.perspective) {
      camera = new THREE.PerspectiveCamera(
        state.perspective.fovDeg,
        state.perspective.aspect,
        state.perspective.near,
        state.perspective.far,
      );
    } else if (state.projection === 'ORTHOGRAPHIC' && state.orthographic) {
      camera = new THREE.OrthographicCamera(
        state.orthographic.left,
        state.orthographic.right,
        state.orthographic.top,
        state.orthographic.bottom,
        state.orthographic.near,
        state.orthographic.far,
      );
    } else {
      throw new Error('TOPOLOGY_EDIT_CAMERA_STATE_INVALID: Projection-specific camera data is required.');
    }
    camera.position.set(state.position.x, state.position.y, state.position.z);
    camera.quaternion.set(
      state.quaternion.x,
      state.quaternion.y,
      state.quaternion.z,
      state.quaternion.w,
    );
    camera.up.set(state.up.x, state.up.y, state.up.z);
    camera.zoom = state.zoom;
    camera.updateProjectionMatrix();
    this.replaceActiveCamera(camera, new THREE.Vector3(state.target.x, state.target.y, state.target.z));
  }

  rememberView() {
    const state = this.captureCameraState();
    this.viewHistory = state ? [state] : [];
  }

  boundsForPick(pick) {
    const bounds = new THREE.Box3();
    let matched = false;
    for (const group of this.pickableGroups()) {
      group.updateMatrixWorld(true);
      group.traverse((object) => {
        if (hasNonPickableAncestor(object)) return;
        if (Array.isArray(object.userData?.pickTable) && object.isInstancedMesh) {
          const index = object.userData.pickTable.findIndex((target) => samePickIdentity(target, pick));
          if (index < 0) return;
          const instanceBounds = instancedObjectBounds(object, index);
          if (!instanceBounds.isEmpty()) {
            bounds.union(instanceBounds);
            matched = true;
          }
          return;
        }
        if (!samePickIdentity(object.userData?.pickTarget, pick)) return;
        const objectBounds = new THREE.Box3().setFromObject(object);
        if (!objectBounds.isEmpty()) {
          bounds.union(objectBounds);
          matched = true;
        }
      });
    }
    return matched ? bounds : null;
  }

  pickAt(clientX, clientY) {
    if (this.contextLost || this.configurationError) return null;
    const context = this.pickContext(clientX, clientY);
    if (!context) return null;
    const gpuHit = this.gpuPicker?.pick({
      clientX,
      clientY,
      rect: context.rect,
      camera: this.activeCamera,
    });
    if (gpuHit) {
      const point = this.resolveGpuPickPoint(gpuHit, context.pointer);
      if (!point) return null;
      return this.pickReceipt(gpuHit.target, point);
    }
    return this.pickWithRaycaster(context.pointer);
  }

  pickContext(clientX, clientY) {
    if (!this.renderer) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    return { rect, pointer };
  }

  pickWithRaycaster(pointer) {
    this.pickRaycaster.params.Line.threshold = this.navigationConfiguration.pickingRadius;
    this.pickRaycaster.setFromCamera(pointer, this.activeCamera);
    const hit = this.pickRaycaster.intersectObjects(this.pickableGroups(), true).find((candidate) => (
      isEffectivelyVisible(candidate.object)
      && !hasNonPickableAncestor(candidate.object)
      && this.isSectionHitAllowed(candidate.object, candidate.point)
      && Boolean(resolveHitTarget(candidate)?.objectId)
    ));
    if (!hit) return null;
    return this.pickReceipt(resolveHitTarget(hit), hit.point);
  }

  resolveGpuPickPoint(gpuHit, pointer) {
    this.pickRaycaster.setFromCamera(pointer, this.activeCamera);
    const hit = this.pickRaycaster.intersectObject(gpuHit.object, true).find((candidate) => (
      (gpuHit.instanceId === null || candidate.instanceId === gpuHit.instanceId)
      && this.isSectionHitAllowed(candidate.object, candidate.point)
    ));
    return hit?.point || null;
  }

  isSectionHitAllowed(object, renderPoint) {
    return !hasAncestorInGroups(object, this.sectionedGroups())
      || pointInsidePlanes(renderPoint, this.activeRenderSectionPlaneEquations);
  }

  pickReceipt(target, renderPoint) {
    if (!target?.objectId || !isFinitePoint(renderPoint)) return null;
    const engineeringPoint = renderPointToEngineering(renderPoint);
    return createTopologyEditPick({ ...target, point: engineeringPoint });
  }

  markViewCommand(command) {
    if (this.hostElement) this.hostElement.dataset.viewCommand = command;
  }

  resize() {
    if (!this.renderer || !this.hostElement) return;
    const width = Math.max(this.hostElement.clientWidth, 1);
    const height = Math.max(this.hostElement.clientHeight, 1);
    this.renderer.setSize(width, height, false);
    if (this.activeCamera.isPerspectiveCamera) {
      this.activeCamera.aspect = width / height;
    } else if (this.activeCamera.isOrthographicCamera) {
      const halfHeight = Math.max(
        (this.activeCamera.top - this.activeCamera.bottom) / 2,
        Number.EPSILON,
      );
      const halfWidth = halfHeight * (width / height);
      this.activeCamera.left = -halfWidth;
      this.activeCamera.right = halfWidth;
    }
    this.activeCamera.updateProjectionMatrix();
    this.invalidate('resize');
  }

  viewportAspect() {
    if (this.hostElement) {
      return Math.max(this.hostElement.clientWidth, 1) / Math.max(this.hostElement.clientHeight, 1);
    }
    if (this.activeCamera.isPerspectiveCamera && Number.isFinite(this.activeCamera.aspect)) {
      return this.activeCamera.aspect;
    }
    if (this.activeCamera.isOrthographicCamera) {
      const height = this.activeCamera.top - this.activeCamera.bottom;
      if (height > 0) return (this.activeCamera.right - this.activeCamera.left) / height;
    }
    throw new Error('TOPOLOGY_EDIT_CAMERA_ASPECT_INVALID: A positive viewport aspect ratio is required.');
  }

  invalidate() {
    this.renderDirty = true;
    if (this.animationFrameId || !this.isMounted || !this.renderer || this.contextLost) return;
    this.animationFrameId = requestAnimationFrame(this.renderFrameHandler);
  }

  renderFrame() {
    this.animationFrameId = 0;
    if (!this.renderDirty || !this.isMounted || !this.renderer || this.contextLost) return;
    this.renderDirty = false;
    this.renderer.render(this.scene, this.activeCamera);
  }

  renderOnce() {
    this.invalidate('render-request');
  }

  handleContextLost(event) {
    event.preventDefault();
    this.contextLost = true;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = 0;
    if (this.hostElement) this.hostElement.dataset.contextStatus = 'LOST';
  }

  handleContextRestored() {
    if (!this.renderer || !this.isMounted) return;
    this.contextLost = false;
    this.gpuPicker?.dispose();
    this.gpuPicker = new TopologyEditGpuPicker({
      renderer: this.renderer,
      scene: this.scene,
    });
    this.sectionedGroups().forEach((group) => this.applySectionPlanesToGroup(group));
    this.engineeringRoot.updateMatrixWorld(true);
    this.controls?.update();
    if (this.hostElement) this.hostElement.dataset.contextStatus = 'RESTORED';
    this.invalidate('context-restored');
  }

  destroy() {
    this.isMounted = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = 0;
    this.renderDirty = false;
    this.contextLost = false;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.projectDataUnsubscribe?.();
    this.projectDataUnsubscribe = null;
    this.disposeNavigation();
    this.gpuPicker?.dispose();
    this.gpuPicker = null;
    this.inspectionRenderer?.destroy();
    this.inspectionRenderer = null;
    this.issueRenderer?.destroy();
    this.issueRenderer = null;
    Object.values(this.groups).forEach((group) => this.clearGroup(group));
    if (this.renderer) {
      if (this.contextLostHandler) {
        this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLostHandler, false);
      }
      if (this.contextRestoredHandler) {
        this.renderer.domElement.removeEventListener('webglcontextrestored', this.contextRestoredHandler, false);
      }
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
      this.renderer.domElement.parentElement?.removeChild(this.renderer.domElement);
    }
    if (this.hostElement) {
      delete this.hostElement.dataset.viewportBackend;
      delete this.hostElement.dataset.contextStatus;
      delete this.hostElement.dataset.interactionMode;
    }
    this.renderer = null;
    this.hostElement = null;
    this.contextLostHandler = null;
    this.contextRestoredHandler = null;
    this.activeSectionPlaneEquations = deepFreeze([]);
    this.activeRenderSectionPlaneEquations = deepFreeze([]);
    this.activeSectionPlanes = [];
    this.engineeringBounds = null;
    this.lastBounds = null;
    this.sceneBoundsCache = null;
    this.hasFitOnce = false;
    this.initialCameraState = null;
    this.viewHistory = [];
    this.lastSelectionPick = null;
    this.lastPickIdentity = '';
    this.doubleClickEligible = false;
    this.boundsRevision = 0;
  }
}

function interactionConfiguration(configuration) {
  return {
    clickTravelTolerancePx: configuration.clickTravelTolerancePx,
    clickTimingMs: configuration.clickTimingMs,
    doubleClickTimingMs: configuration.doubleClickTimingMs,
  };
}

function createEngineeringRoot() {
  const root = new THREE.Group();
  root.name = 'topology-edit-engineering-root';
  root.matrixAutoUpdate = false;
  root.matrix.fromArray(ENGINEERING_TO_RENDER_MATRIX4_ELEMENTS);
  root.updateMatrixWorld(true);
  return root;
}

function segmentGeometry(segment, radius, radialSegments) {
  if (Array.isArray(segment.points) && segment.points.length >= 2) {
    const points = segment.points
      .filter(isFinitePoint)
      .map((point) => new THREE.Vector3(point.x, point.y, point.z));
    if (points.length < 2) return null;
    return {
      geometry: new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points, false, 'centripetal'),
        Math.max(points.length - 1, 1),
        radius,
        radialSegments,
        false,
      ),
    };
  }
  const start = new THREE.Vector3(segment.start.x, segment.start.y, segment.start.z);
  const end = new THREE.Vector3(segment.end.x, segment.end.y, segment.end.z);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  if (length < MIN_GEOMETRY_LENGTH) return null;
  const endRadius = positive(segment.endRadiusMm);
  const geometry = new THREE.CylinderGeometry(
    endRadius === null ? radius : endRadius,
    radius,
    length,
    radialSegments,
  );
  return {
    geometry,
    position: new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    ),
  };
}

function computeBounds(elements, segments) {
  const bounds = new THREE.Box3();
  elements.forEach((element) => {
    if (finiteElement(element)) bounds.expandByPoint(new THREE.Vector3(element.x, element.y, element.z));
  });
  segments.forEach((segment) => {
    const points = Array.isArray(segment.points) ? segment.points : [segment.start, segment.end];
    points.filter(isFinitePoint).forEach((point) => {
      bounds.expandByPoint(new THREE.Vector3(point.x, point.y, point.z));
    });
  });
  return bounds;
}

function transformEngineeringBox(bounds) {
  if (!bounds || bounds.isEmpty()) return new THREE.Box3();
  const transformed = engineeringBoundsToRender({ min: bounds.min, max: bounds.max });
  return new THREE.Box3(
    new THREE.Vector3(transformed.min.x, transformed.min.y, transformed.min.z),
    new THREE.Vector3(transformed.max.x, transformed.max.y, transformed.max.z),
  );
}

function markerSizeForBounds(bounds) {
  return !bounds || bounds.isEmpty()
    ? 10
    : Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.008, 5);
}

function isFinitePoint(point) {
  return point && [point.x, point.y, point.z].every(Number.isFinite);
}

function finiteElement(element) {
  return element && [element.x, element.y, element.z].every(Number.isFinite);
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function createMaterial(color, opacity) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.2,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
}

function cachedMaterial(cache, color, opacity) {
  const key = `${color}:${opacity}`;
  if (!cache.has(key)) cache.set(key, createMaterial(color, opacity));
  return cache.get(key);
}

function fallbackPick(value) {
  const objectId = value.entityId || value.id;
  return {
    objectKind: value.type === 'node' ? 'node' : 'component',
    objectId,
    nodeId: value.type === 'node' ? objectId : '',
  };
}

function pickUserData(value) {
  return {
    canonicalId: value.entityId || value.id,
    type: value.type,
    pickTarget: value.pickTarget || fallbackPick(value),
  };
}

function resolveHitTarget(hit) {
  return hit.instanceId !== undefined
    ? hit.object.userData?.pickTable?.[hit.instanceId]
    : hit.object.userData?.pickTarget;
}

function hasNonPickableAncestor(object) {
  let current = object;
  while (current) {
    if (current.userData?.nonPickable) return true;
    current = current.parent;
  }
  return false;
}

function hasAncestorInGroups(object, groups) {
  let current = object;
  while (current) {
    if (groups.includes(current)) return true;
    current = current.parent;
  }
  return false;
}

function isEffectivelyVisible(object) {
  let current = object;
  while (current) {
    if (current.visible === false) return false;
    current = current.parent;
  }
  return true;
}

function pointInsidePlanes(point, planes, tolerance = 1e-7) {
  return planes.every(({ normal, constant }) => (
    (normal.x * point.x) + (normal.y * point.y) + (normal.z * point.z) + constant
  ) >= -tolerance);
}

function pickIdentityKey(pick) {
  return topologyEditPickTargetKey(identityRecord(pick));
}

function samePickIdentity(target, pick) {
  if (!target || !pick) return false;
  return topologyEditPickTargetKey(identityRecord(target)) === pickIdentityKey(pick);
}

function identityRecord(value) {
  return {
    modelRole: String(value.modelRole || ''),
    objectKind: String(value.objectKind || ''),
    objectId: String(value.objectId || ''),
    nodeId: String(value.nodeId || ''),
    partRole: String(value.partRole || ''),
    supportId: String(value.supportId || ''),
    restraintId: String(value.restraintId || ''),
    restraintFamily: String(value.restraintFamily || ''),
  };
}

function instancedObjectBounds(object, instanceId) {
  object.geometry.computeBoundingBox?.();
  if (!object.geometry.boundingBox) return new THREE.Box3();
  const instanceMatrix = new THREE.Matrix4();
  object.getMatrixAt(instanceId, instanceMatrix);
  const worldMatrix = new THREE.Matrix4().multiplyMatrices(object.matrixWorld, instanceMatrix);
  return object.geometry.boundingBox.clone().applyMatrix4(worldMatrix);
}

function vectorRecord(vector) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function quaternionRecord(quaternion) {
  return {
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z,
    w: quaternion.w,
  };
}
