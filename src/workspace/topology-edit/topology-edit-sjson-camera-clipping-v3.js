import * as THREE from 'three';

export const SJSON_CAMERA_CLIPPING_AUTHORITY =
  'SJSON_CAMERA_SPACE_DYNAMIC_CLIPPING_V2';

const MIN_DEPTH_MM = 1e-6;
const AUTO_NEAR_FRACTION = 0.25;
const AUTO_FAR_MARGIN_FRACTION = 0.1;

export function createGovernedCameraClippingPolicy(configuration, input = {}) {
  const configuredNear = positive(configuration?.cameraNearMm) || 0.1;
  const configuredFar = positive(configuration?.cameraFarMm) || 1_000_000;
  const mode = String(input.mode || 'AUTO').toUpperCase();
  if (!['AUTO', 'MANUAL'].includes(mode)) {
    throw new TypeError('Camera clipping mode must be AUTO or MANUAL.');
  }
  const nearMm = positive(input.nearMm) || configuredNear;
  const farMm = positive(input.farMm) || configuredFar;
  if (!(farMm > nearMm)) throw new RangeError('Camera clipping farMm must exceed nearMm.');
  return Object.freeze({
    authority: SJSON_CAMERA_CLIPPING_AUTHORITY,
    mode,
    nearMm,
    farMm,
  });
}

export function applyGovernedCameraClipping(backend) {
  const camera = backend?.activeCamera || backend?.camera;
  if (!camera) return null;
  const policy = createGovernedCameraClippingPolicy(
    backend.navigationConfiguration,
    backend.governedCameraClippingPolicy,
  );
  const result = policy.mode === 'MANUAL'
    ? {
      nearMm: policy.nearMm,
      farMm: policy.farMm,
      nearestDepthMm: null,
      farthestDepthMm: null,
      cameraInsideBounds: null,
    }
    : automaticClipping(camera, clippingBounds(backend), policy);

  camera.near = result.nearMm;
  camera.far = result.farMm;
  camera.updateProjectionMatrix();
  backend.governedCameraClippingEvidence = Object.freeze({
    authority: SJSON_CAMERA_CLIPPING_AUTHORITY,
    mode: policy.mode,
    configuredNearMm: policy.nearMm,
    configuredFarMm: policy.farMm,
    appliedNearMm: result.nearMm,
    appliedFarMm: result.farMm,
    nearestDepthMm: result.nearestDepthMm,
    farthestDepthMm: result.farthestDepthMm,
    cameraInsideBounds: result.cameraInsideBounds,
  });
  publish(backend.hostElement, backend.governedCameraClippingEvidence);
  return backend.governedCameraClippingEvidence;
}

/**
 * Uses a bounding sphere rather than AABB corner depths. A camera fitted to a
 * selected node can sit inside the full-model AABB; corner-only depths then
 * produce an unsafe large near plane and remove the route while selection HUDs
 * remain visible. The sphere interval is conservative for every point in the
 * governed scene bounds, including panel resize and fit-selection transitions.
 */
function automaticClipping(camera, bounds, policy) {
  if (!(bounds instanceof THREE.Box3) || bounds.isEmpty()) {
    return fallbackClipping(policy);
  }
  camera.updateMatrixWorld(true);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) {
    return fallbackClipping(policy);
  }
  const centerCamera = sphere.center.clone().applyMatrix4(camera.matrixWorldInverse);
  const centerDepthMm = -centerCamera.z;
  const nearestDepthMm = Math.max(0, centerDepthMm - sphere.radius);
  const farthestDepthMm = centerDepthMm + sphere.radius;
  if (!Number.isFinite(farthestDepthMm) || farthestDepthMm <= MIN_DEPTH_MM) {
    return fallbackClipping(policy);
  }

  const cameraInsideBounds = nearestDepthMm <= MIN_DEPTH_MM;
  const nearMm = cameraInsideBounds
    ? policy.nearMm
    : Math.max(policy.nearMm, nearestDepthMm * AUTO_NEAR_FRACTION);
  const farMarginMm = Math.max(1, sphere.radius * AUTO_FAR_MARGIN_FRACTION);
  const farMm = Math.max(
    policy.farMm,
    farthestDepthMm + farMarginMm,
    nearMm + 1,
  );
  return {
    nearMm,
    farMm,
    nearestDepthMm,
    farthestDepthMm,
    cameraInsideBounds,
  };
}

function fallbackClipping(policy) {
  return {
    nearMm: policy.nearMm,
    farMm: policy.farMm,
    nearestDepthMm: null,
    farthestDepthMm: null,
    cameraInsideBounds: null,
  };
}

function clippingBounds(backend) {
  if (backend.sceneBoundsCache instanceof THREE.Box3) return backend.sceneBoundsCache.clone();
  if (backend.lastBounds instanceof THREE.Box3) return backend.lastBounds.clone();
  if (backend.engineeringRoot) {
    const box = new THREE.Box3().setFromObject(backend.engineeringRoot);
    if (!box.isEmpty()) return box;
  }
  return null;
}

function publish(host, evidence) {
  if (!host || !evidence) return;
  host.dataset.topologyEditCameraClippingAuthority = evidence.authority;
  host.dataset.topologyEditCameraClippingMode = evidence.mode;
  host.dataset.topologyEditCameraNearMm = String(evidence.appliedNearMm);
  host.dataset.topologyEditCameraFarMm = String(evidence.appliedFarMm);
  host.dataset.topologyEditCameraInsideBounds = String(evidence.cameraInsideBounds === true);
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
