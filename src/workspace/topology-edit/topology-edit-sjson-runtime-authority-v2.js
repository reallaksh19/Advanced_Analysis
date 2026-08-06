import * as THREE from 'three';
import {
  engineeringDirectionToRender,
  renderDirectionToEngineering,
} from './topology-edit-coordinate-transform.js';
import { supportTopologyForExactOrigins } from './topology-edit-sjson-visual-authority.js';
import {
  applySjsonParentBranchDiametersToSupportTopology,
} from './topology-edit-sjson-support-parent-branch-diameter.js';
import {
  deriveSjsonTopoValidatorSupportProjection,
} from './topology-edit-sjson-restraint-projection.js';
import {
  projectGovernedSjsonSupportGlyphs,
} from './topology-edit-sjson-support-glyph-projection-v3.js';
import {
  fitPerspectiveCameraToRenderBounds,
  projectRenderBoundsToNdc,
} from './topology-edit-sjson-benchmark-camera.js';
import {
  TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES,
} from './topology-edit-support-viewport-backend.js';

export const SJSON_BENCHMARK_SOURCE_HASH = 'fnv1a64:0fa77fc2c202d8ae';
export const TOPOLOGY_EDIT_20_ELEMENT_DEMO_SOURCE_HASH = 'fnv1a64:78394ad6facc83be';
export const GOVERNED_SJSON_EDIT_DRAFT_SOURCE_HASHES = Object.freeze([
  SJSON_BENCHMARK_SOURCE_HASH,
  TOPOLOGY_EDIT_20_ELEMENT_DEMO_SOURCE_HASH,
]);
export const SJSON_SUPPORT_RENDER_AUTHORITY =
  'TOPO_VALIDATOR_SUPPORT_MARKER_AND_DIRECTION_GEOMETRY';
export const SJSON_SUPPORT_DISPLAY_SCALE = 3;
export const SJSON_ACTIVE_ORTHOGRAPHIC_CAMERA_AUTHORITY =
  'TOPOLOGY_EDIT_ACTIVE_ORTHOGRAPHIC_PROJECTION_PRESERVED';
export const SJSON_ACTIVE_ORTHOGRAPHIC_CAMERA_FIT_ALGORITHM =
  'GOVERNED_THREE_VIEW_ORTHOGRAPHIC_FIT_V1';
const GOVERNED_SOURCE_HASH_SET = new Set(GOVERNED_SJSON_EDIT_DRAFT_SOURCE_HASHES);
const CAMERA_DIRECTION = Object.freeze({ x: 1, y: 1, z: 0.8 });
const MARKER_RADIUS_RATIO = 0.18;

/** Fail closed: only exact, qualified source hashes may use the governed compact packet. */
export function isGovernedSjsonEditDraftSourceHash(value) {
  return typeof value === 'string' && GOVERNED_SOURCE_HASH_SET.has(value);
}

export function deriveGovernedSjsonSupportBundle({ canonical, dataset, draftVisual, backend }) {
  const exactSupportTopology = supportTopologyForExactOrigins(canonical);
  const supportTopology = applySjsonParentBranchDiametersToSupportTopology(
    exactSupportTopology,
    dataset,
    draftVisual?.parentBranchDiameterIndex,
  );
  const markerSizeMm = Number(backend?.navigationConfiguration?.supportMarkerSize);
  if (!Number.isFinite(markerSizeMm) || markerSizeMm <= 0) {
    throw new Error(
      'TOPOLOGY_EDIT_SUPPORT_MARKER_POLICY_MISSING: Approved supportMarkerSize is required.',
    );
  }
  const supportAuthority = deriveSjsonTopoValidatorSupportProjection({
    canonicalTopology: supportTopology,
    dataset,
    verticalAxis: 'Z',
    markerSizeMm,
  });
  const governedGlyphProjection = projectGovernedSjsonSupportGlyphs({
    overlays: supportAuthority.overlays,
    supportTopology,
    markerSizeMm,
  });
  const supportProjection = Object.freeze({
    ...governedGlyphProjection,
    renderStyle: TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES.TOPO_VALIDATOR_COMPACT,
    renderAuthority: SJSON_SUPPORT_RENDER_AUTHORITY,
    compactMarkerRadiusMm: Math.max(markerSizeMm * MARKER_RADIUS_RATIO, 1),
    compactMarkerDisplayScale: SJSON_SUPPORT_DISPLAY_SCALE,
  });
  return Object.freeze({
    supportTopology,
    supportAuthority,
    supportProjection,
    overlays: supportAuthority.overlays,
  });
}

export function applySjsonBenchmarkCameraFit(backend) {
  backend.engineeringRoot?.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(backend.engineeringRoot);
  if (!backend.camera || !backend.controls || bounds.isEmpty()) return null;
  const fitMargin = Number(backend.navigationConfiguration?.cameraFitMargin);
  if (!Number.isFinite(fitMargin) || fitMargin < 1) {
    throw new Error(
      'TOPOLOGY_EDIT_CAMERA_FIT_MARGIN_INVALID: Approved cameraFitMargin is required.',
    );
  }
  const cameraFit = backend.camera.isOrthographicCamera
    ? fitActiveOrthographicCamera({ backend, bounds, fitMargin })
    : fitPerspectiveCameraToRenderBounds({
      camera: backend.camera,
      controls: backend.controls,
      bounds,
      direction: engineeringDirectionToRender(CAMERA_DIRECTION),
      fitMargin,
    });
  backend.lastBounds = bounds.clone();
  backend.sceneBoundsCache = bounds.clone();
  backend.updateGovernedCameraClipping?.();
  backend.initialCameraState = backend.captureCameraState?.() || backend.initialCameraState;
  return Object.freeze({
    ...cameraFit,
    clipping: backend.governedCameraClippingSnapshot?.() || null,
    sourceHash: SJSON_BENCHMARK_SOURCE_HASH,
    engineeringDirection: renderDirectionToEngineering(cameraFit.renderDirection),
  });
}

function fitActiveOrthographicCamera({ backend, bounds, fitMargin }) {
  if (!backend.camera?.isOrthographicCamera) {
    throw new TypeError('Governed orthographic fit requires an active orthographic camera.');
  }
  if (typeof backend.fitAll !== 'function') {
    throw new TypeError('Governed orthographic fit requires the shared viewport fit operation.');
  }
  backend.lastBounds = bounds.clone();
  backend.sceneBoundsCache = bounds.clone();
  backend.fitAll({ remember: false });
  const camera = backend.camera;
  const target = backend.controls.target;
  const renderDirectionVector = camera.position.clone().sub(target);
  if (!(renderDirectionVector.lengthSq() > 1e-24)) {
    throw new Error('TOPOLOGY_EDIT_ORTHOGRAPHIC_CAMERA_DIRECTION_INVALID');
  }
  renderDirectionVector.normalize();
  const size = bounds.getSize(new THREE.Vector3());
  const renderDirection = freezePoint(renderDirectionVector);
  return Object.freeze({
    authority: SJSON_ACTIVE_ORTHOGRAPHIC_CAMERA_AUTHORITY,
    fitAlgorithm: SJSON_ACTIVE_ORTHOGRAPHIC_CAMERA_FIT_ALGORITHM,
    projection: 'ORTHOGRAPHIC',
    cameraDistanceMm: camera.position.distanceTo(target),
    fitMargin,
    renderDirection,
    renderBounds: Object.freeze({
      min: freezePoint(bounds.min),
      max: freezePoint(bounds.max),
      size: freezePoint(size),
      diagonalMm: size.length(),
    }),
    screenBoundsNdc: projectRenderBoundsToNdc(bounds, camera, fitMargin),
    cameraPosition: freezePoint(camera.position),
    target: freezePoint(target),
    aspect: (camera.right - camera.left) / (camera.top - camera.bottom),
    near: camera.near,
    far: camera.far,
  });
}

function freezePoint(point) {
  return Object.freeze({ x: point.x, y: point.y, z: point.z });
}
