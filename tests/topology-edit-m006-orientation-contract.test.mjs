import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyTopologyEditOrientation,
  createTopologyEditOrientationSnapshot,
  quaternionToCssMatrix,
  topologyEditOrientationFaceManifest,
  TOPOLOGY_EDIT_ORIENTATION_ERROR,
} from '../src/workspace/topology-edit/topology-edit-orientation-contract.js';
import { resolveTopologyEditNavigationAction } from '../src/workspace/topology-edit/topology-edit-navigation-routing.js';

test('M006 face manifest maps exactly to the existing M004 standard-view registry', () => {
  const manifest = topologyEditOrientationFaceManifest();
  assert.deepEqual(manifest.map((row) => row.id), [
    'top', 'bottom', 'front', 'back', 'left', 'right',
  ]);
  assert.equal(new Set(manifest.map((row) => row.id)).size, manifest.length);
  for (const face of manifest) {
    assert.deepEqual(resolveTopologyEditNavigationAction(`view-${face.action}`), {
      kind: 'STANDARD_VIEW', value: face.action,
    });
  }
  assert.deepEqual(resolveTopologyEditNavigationAction('view-iso'), {
    kind: 'STANDARD_VIEW', value: 'iso',
  });
});

test('M006 classifies actual camera directions without last-command state', () => {
  const cases = {
    top: { x: 0, y: 1, z: 0 },
    bottom: { x: 0, y: -1, z: 0 },
    front: { x: 0, y: 0, z: 1 },
    back: { x: 0, y: 0, z: -1 },
    left: { x: -1, y: 0, z: 0 },
    right: { x: 1, y: 0, z: 0 },
  };
  for (const [id, direction] of Object.entries(cases)) {
    const result = classifyTopologyEditOrientation(direction);
    assert.equal(result.nearestFace, id);
    assert.equal(result.activeFace, id);
    assert.equal(result.isoActive, false);
  }
  const iso = classifyTopologyEditOrientation({ x: 1, y: 1, z: 1 });
  assert.equal(iso.isoActive, true);
  assert.equal(iso.activeFace, null);
});

test('M006 quaternion normalization produces deterministic finite CSS matrices', () => {
  const identity = quaternionToCssMatrix({ x: 0, y: 0, z: 0, w: 1 });
  const scaled = quaternionToCssMatrix({ x: 0, y: 0, z: 0, w: 50 });
  assert.equal(identity, scaled);
  assert.equal(identity, 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
  assert.doesNotMatch(identity, /NaN|Infinity/u);
});

test('M006 snapshot preserves basis and projection evidence', () => {
  const snapshot = createTopologyEditOrientationSnapshot({
    projection: 'orthographic',
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    cameraDirection: { x: 0, y: 0, z: 5 },
  });
  assert.equal(snapshot.projection, 'ORTHOGRAPHIC');
  assert.equal(snapshot.engineeringBasis, 'RIGHT_HANDED_Z_UP');
  assert.equal(snapshot.renderBasis, 'RIGHT_HANDED_Y_UP');
  assert.equal(snapshot.activeFace, 'front');
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.quaternion));
});

test('M006 fails closed on malformed camera evidence', () => {
  assert.throws(() => createTopologyEditOrientationSnapshot({
    projection: 'PERSPECTIVE',
    quaternion: { x: 0, y: 0, z: 0, w: 0 },
    cameraDirection: { x: 0, y: 0, z: 1 },
  }), (error) => error.code === TOPOLOGY_EDIT_ORIENTATION_ERROR
    && error.detailCode === 'CAMERA_QUATERNION_DEGENERATE');
  assert.throws(() => createTopologyEditOrientationSnapshot({
    projection: 'UNKNOWN',
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    cameraDirection: { x: 0, y: 0, z: 1 },
  }), (error) => error.code === TOPOLOGY_EDIT_ORIENTATION_ERROR
    && error.detailCode === 'PROJECTION_INVALID');
});
