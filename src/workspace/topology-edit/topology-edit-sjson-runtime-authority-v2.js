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
import { fitPerspectiveCameraToRenderBounds } from './topology-edit-sjson-benchmark-camera.js';
import {
  TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES,
} from './topology-edit-support-viewport-backend.js';

export const SJSON_BENCHMARK_SOURCE_HASH = 'fnv1a64:0fa77fc2c202d8ae';
export const SJSON_SUPPORT_RENDER_AUTHORITY =
  'TOPO_VALIDATOR_SUPPORT_MARKER_AND_DIRECTION_GEOMETRY';
export const SJSON_SUPPORT_DISPLAY_SCALE = 3;
const CAMERA_DIRECTION = Object.freeze({ x: 1, y: 1, z: 0.8 });
const MARKER_RADIUS_RATIO = 0.18;

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
  const cameraFit = fitPerspectiveCameraToRenderBounds({
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
