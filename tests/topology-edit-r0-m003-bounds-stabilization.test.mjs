import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  deriveAllSupportRestraintGeometry,
  projectSupportGeometryToViewport,
} from '../src/workspace/topology-edit/support-restraint-family.js';
import {
  supportEngineeringBoundsProjection,
  TopologyEditSupportViewportBackend,
} from '../src/workspace/topology-edit/topology-edit-support-viewport-backend.js';

function configuration(supportMarkerSize) {
  return {
    supportMarkerSize,
    pickingRadius: 28,
    cameraFitMargin: 1.25,
    clickTimingMs: 300,
    doubleClickTimingMs: 300,
    clickTravelTolerancePx: 5,
    zoomRate: 1,
    navigationSensitivity: 1,
    perspectiveFovDeg: 45,
    meshRadialSegments: 16,
    cameraNearMm: 0.1,
    cameraFarMm: 1_000_000,
  };
}

function canonicalSupports() {
  return {
    canonicalTopologyHash: 'canonical:r0-m003',
    nodes: [
      { id: 'node:0', position: { x: 100, y: 200, z: 300 } },
      { id: 'node:1', position: { x: 1100, y: 200, z: 300 } },
    ],
    edges: [{
      id: 'edge:pipe',
      componentKey: 'pipe:1',
      fromNodeId: 'node:0',
      toNodeId: 'node:1',
      outsideDiameterMm: 100,
    }],
    junctions: [],
    supports: [
      {
        id: 'support:a',
        nodeId: 'node:0',
        hostEntityId: 'pipe:1',
        restraints: [{
          id: 'restraint:a-guide',
          kind: 'GUIDE',
          positiveGapMm: 4,
          negativeGapMm: 7,
          sourcePaths: ['/supports/a/guide'],
        }],
      },
      {
        id: 'support:b',
        nodeId: 'node:0',
        hostEntityId: 'pipe:1',
        restraints: [{
          id: 'restraint:b-guide',
          kind: 'GUIDE',
          gapMm: 5,
          sourcePaths: ['/supports/b/guide'],
        }],
      },
    ],
  };
}

function supportProjection(markerSizeMm) {
  const overlays = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonicalSupports(),
    verticalAxis: 'Z',
  });
  return projectSupportGeometryToViewport(overlays, {
    markerSizeMm,
    arrowLengthMm: 20_000,
  });
}

function renderAtScale(markerSizeMm) {
  const backend = new TopologyEditSupportViewportBackend({
    navigationConfiguration: configuration(markerSizeMm),
  });
  backend.renderSession({
    source: { elements: [], segments: [], primitives: [] },
    draft: { elements: [], segments: [], primitives: [] },
    supports: supportProjection(markerSizeMm),
  });
  return backend;
}

function boxRecord(box) {
  return {
    min: box.min.toArray(),
    max: box.max.toArray(),
    size: box.getSize(new THREE.Vector3()).toArray(),
  };
}

test('R0 M003 excludes support arrows and glyph extents from engineering bounds', () => {
  const projection = supportProjection(24);
  const bounded = supportEngineeringBoundsProjection(projection);
  assert.equal(bounded.elements, projection.elements);
  assert.deepEqual(bounded.segments, []);
  assert.ok(Object.isFrozen(bounded));
  assert.equal(projection.segments.length, 2);

  const backend = renderAtScale(24);
  assert.deepEqual(boxRecord(backend.engineeringBounds), {
    min: [100, 200, 300],
    max: [100, 200, 300],
    size: [0, 0, 0],
  });
  const physical = new THREE.Box3().setFromObject(backend.groups.supportGroup);
  assert.ok(physical.getSize(new THREE.Vector3()).length() > 0);
  backend.destroy();
});

test('R0 M003 support display scale cannot change Fit All engineering bounds', () => {
  const small = renderAtScale(24);
  const large = renderAtScale(48);
  assert.deepEqual(boxRecord(small.engineeringBounds), boxRecord(large.engineeringBounds));

  const smallPresentation = new THREE.Box3().setFromObject(small.groups.supportGroup)
    .getSize(new THREE.Vector3()).length();
  const largePresentation = new THREE.Box3().setFromObject(large.groups.supportGroup)
    .getSize(new THREE.Vector3()).length();
  assert.ok(largePresentation > smallPresentation);
  small.destroy();
  large.destroy();
});

test('R0 M003 retains coincident support and restraint identities without collapse', () => {
  const backend = renderAtScale(24);
  assert.equal(backend.groups.supportGroup.children.length, 2);
  const supportIds = new Set();
  const restraintIds = new Set();
  backend.groups.supportGroup.traverse((object) => {
    const target = object.userData?.pickTarget;
    if (target?.objectKind === 'support') supportIds.add(target.supportId);
    if (target?.objectKind === 'restraint') restraintIds.add(target.restraintId);
  });
  assert.deepEqual([...supportIds].sort(), ['support:a', 'support:b']);
  assert.deepEqual([...restraintIds].sort(), ['restraint:a-guide', 'restraint:b-guide']);

  for (const pick of [
    { objectKind: 'support', objectId: 'support:a', supportId: 'support:a' },
    {
      objectKind: 'restraint',
      objectId: 'restraint:b-guide',
      supportId: 'support:b',
      restraintId: 'restraint:b-guide',
      restraintFamily: 'GUIDE',
    },
  ]) {
    const bounds = backend.boundsForPick(pick);
    assert.ok(bounds && !bounds.isEmpty());
  }
  backend.destroy();
});

test('R0 M003 preserves asymmetric gap contacts in exact child evidence', () => {
  const backend = renderAtScale(24);
  const contacts = new Map();
  backend.groups.supportGroup.traverse((object) => {
    if (object.userData?.restraintId !== 'restraint:a-guide') return;
    if (!['positive-contact', 'negative-contact'].includes(object.userData.partRole)) return;
    contacts.set(object.userData.partRole, {
      position: object.position.toArray(),
      evidence: object.userData.modelEvidence,
    });
  });
  assert.deepEqual(contacts.get('positive-contact').position, [100, 254, 300]);
  assert.deepEqual(contacts.get('negative-contact').position, [100, 143, 300]);
  assert.deepEqual(
    contacts.get('positive-contact').evidence.positiveContactPoint,
    { x: 100, y: 254, z: 300 },
  );
  assert.deepEqual(
    contacts.get('negative-contact').evidence.negativeContactPoint,
    { x: 100, y: 143, z: 300 },
  );
  backend.destroy();
});
