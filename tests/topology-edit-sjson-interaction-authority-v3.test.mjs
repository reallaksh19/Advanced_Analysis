import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  SJSON_SUPPORT_GLYPH_PLACEMENT_AUTHORITY,
  projectGovernedSjsonSupportGlyphs,
} from '../src/workspace/topology-edit/topology-edit-sjson-support-glyph-projection-v3.js';
import {
  SJSON_CAMERA_CLIPPING_AUTHORITY,
  applyGovernedCameraClipping,
  createGovernedCameraClippingPolicy,
} from '../src/workspace/topology-edit/topology-edit-sjson-camera-clipping-v3.js';
import {
  resolveTopologyEditPickViewport,
} from '../src/workspace/topology-edit/topology-edit-gpu-pick-helpers.js';

test('support glyphs begin at OD/2 contacts and extend by two thirds OD', () => {
  const projection = projectGovernedSjsonSupportGlyphs({
    markerSizeMm: 70,
    supportTopology: {
      edges: [{ id: 'edge:1', componentKey: 'P-001', outsideDiameterMm: 120 }],
    },
    overlays: [{
      supportId: 'support:1',
      hostEntityId: 'P-001',
      origin: { x: 0, y: 0, z: 0 },
      restraints: [
        {
          restraintId: 'restraint:guide',
          family: 'GUIDE',
          direction: { x: 0, y: 1, z: 0 },
          positiveContactPoint: { x: 0, y: 62, z: 0 },
          negativeContactPoint: { x: 0, y: -63, z: 0 },
        },
        {
          restraintId: 'restraint:rest',
          family: 'REST',
          direction: { x: 0, y: 0, z: 1 },
          positiveContactPoint: null,
          negativeContactPoint: { x: 0, y: 0, z: -60 },
        },
      ],
    }],
  });

  assert.equal(projection.segments.length, 2);
  assert.equal(projection.glyphMetrics.directionalArrowCount, 3);
  assert.equal(projection.glyphMetrics.bidirectionalRestraintCount, 1);
  assert.equal(projection.glyphMetrics.placementAuthority, SJSON_SUPPORT_GLYPH_PLACEMENT_AUTHORITY);

  const guide = projection.segments.find((row) => row.entityId === 'restraint:guide');
  assert.equal(guide.contactOffsetMm, 60);
  assert.equal(guide.glyphLengthMm, 80);
  assert.deepEqual(guide.directionalArrows.map((row) => row.polarity), ['POSITIVE', 'NEGATIVE']);
  assert.deepEqual(guide.directionalArrows[0].start, { x: 0, y: 62, z: 0 });
  assert.deepEqual(guide.directionalArrows[0].end, { x: 0, y: 142, z: 0 });
  assert.deepEqual(guide.directionalArrows[1].start, { x: 0, y: -63, z: 0 });
  assert.deepEqual(guide.directionalArrows[1].end, { x: 0, y: -143, z: 0 });

  const rest = projection.segments.find((row) => row.entityId === 'restraint:rest');
  assert.equal(rest.directionalArrows.length, 1);
  assert.equal(rest.directionalArrows[0].polarity, 'NEGATIVE');
  assert.deepEqual(rest.directionalArrows[0].start, { x: 0, y: 0, z: -60 });
  assert.deepEqual(rest.directionalArrows[0].end, { x: 0, y: 0, z: -140 });
});

test('GPU pick radius is expressed in CSS pixels and scales with DPR', () => {
  const viewport = resolveTopologyEditPickViewport(
    { getPixelRatio: () => 3 },
    50,
    50,
    { left: 0, top: 0, width: 100, height: 100 },
    8,
  );
  assert.equal(viewport.cssRadius, 8);
  assert.equal(viewport.physicalRadius, 24);
  assert.equal(viewport.pixelRatio, 3);
  assert.equal(viewport.width, 49);
  assert.equal(viewport.height, 49);
});

test('automatic clipping remains conservative outside and inside scene bounds', () => {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1_000_000);
  const backend = {
    activeCamera: camera,
    navigationConfiguration: { cameraNearMm: 0.1, cameraFarMm: 1_000_000 },
    sceneBoundsCache: new THREE.Box3(
      new THREE.Vector3(-100, -100, -100),
      new THREE.Vector3(100, 100, 100),
    ),
  };
  backend.governedCameraClippingPolicy = createGovernedCameraClippingPolicy(
    backend.navigationConfiguration,
    { mode: 'AUTO' },
  );

  positionCamera(camera, 1000);
  const fitted = applyGovernedCameraClipping(backend);
  assert.equal(fitted.authority, SJSON_CAMERA_CLIPPING_AUTHORITY);
  assert.equal(fitted.cameraInsideBounds, false);
  assert.ok(fitted.appliedNearMm < fitted.nearestDepthMm);
  assert.ok(fitted.appliedFarMm > fitted.farthestDepthMm);

  positionCamera(camera, 500);
  const zoomed = applyGovernedCameraClipping(backend);
  assert.equal(zoomed.cameraInsideBounds, false);
  assert.ok(zoomed.appliedNearMm < fitted.appliedNearMm);
  assert.ok(zoomed.appliedNearMm < zoomed.nearestDepthMm);

  positionCamera(camera, 150);
  const inside = applyGovernedCameraClipping(backend);
  assert.equal(inside.cameraInsideBounds, true);
  assert.equal(inside.nearestDepthMm, 0);
  assert.equal(inside.appliedNearMm, 0.1);
  assert.ok(inside.appliedFarMm > inside.farthestDepthMm);

  backend.governedCameraClippingPolicy = createGovernedCameraClippingPolicy(
    backend.navigationConfiguration,
    { mode: 'MANUAL', nearMm: 2, farMm: 5000 },
  );
  const manual = applyGovernedCameraClipping(backend);
  assert.equal(manual.appliedNearMm, 2);
  assert.equal(manual.appliedFarMm, 5000);
  assert.equal(camera.near, 2);
  assert.equal(camera.far, 5000);
});

function positionCamera(camera, z) {
  camera.position.set(0, 0, z);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
}
