import * as THREE from 'three';

export const SJSON_CAMERA_CLIPPING_AUTHORITY =
  'SJSON_CAMERA_SPACE_DYNAMIC_CLIPPING_V1';

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
  let result;
  if (policy.mode === 'MANUAL') {
    result = {
      nearMm: policy.nearMm,
      farMm: policy.farMm,
      nearestDepthMm: null,
      farthestDepthMm: null,
    };
  } else {
    result = automaticClipping(camera, clippingBounds(backend), policy);
  }
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
  });
  publish(backend.hostElement, backend.governedCameraClippingEvidence);
  return backend.governedCameraClippingEvidence;
}

function automaticClipping(camera, bounds, policy) {
  if (!(bounds instanceof THREE.Box3) || bounds.isEmpty()) {
    return {
      nearMm: policy.nearMm,
      farMm: policy.farMm,
      nearestDepthMm: null,
      farthestDepthMm: null,
    };
  }
  camera.updateMatrixWorld(true);
  const depths = corners(bounds)
    .map((point) => -point.applyMatrix4(camera.matrixWorldInverse).z)
    .filter(Number.isFinite);
  const positiveDepths = depths.filter((value) => value > 1e-6);
  if (!positiveDepths.length) {
    return {
      nearMm: policy.nearMm,
      farMm: policy.farMm,
      nearestDepthMm: null,
      farthestDepthMm: null,
    };
  }
  const nearestDepthMm = Math.min(...positiveDepths);
  const farthestDepthMm = Math.max(...positiveDepths);
  // Keep the near plane safely in front of the closest scene corner. Recomputing
  // this after every OrbitControls change prevents wheel zoom from slicing geometry.
  const nearMm = Math.max(policy.nearMm, nearestDepthMm * 0.05);
  const sceneSpan = Math.max(farthestDepthMm - nearestDepthMm, 1);
  const farMm = Math.max(
    nearMm + 1,
    farthestDepthMm + Math.max(sceneSpan * 0.25, nearMm * 4),
  );
  return { nearMm, farMm, nearestDepthMm, farthestDepthMm };
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

function corners(box) {
  const { min, max } = box;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
}

function publish(host, evidence) {
  if (!host || !evidence) return;
  host.dataset.topologyEditCameraClippingAuthority = evidence.authority;
  host.dataset.topologyEditCameraClippingMode = evidence.mode;
  host.dataset.topologyEditCameraNearMm = String(evidence.appliedNearMm);
  host.dataset.topologyEditCameraFarMm = String(evidence.appliedFarMm);
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
