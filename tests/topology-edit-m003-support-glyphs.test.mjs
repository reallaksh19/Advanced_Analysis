import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  deriveAllSupportRestraintGeometry,
  projectSupportGeometryToViewport,
} from '../src/workspace/topology-edit/support-restraint-family.js';
import {
  materializeTopologyEditSupportOverlay,
  TOPOLOGY_EDIT_SUPPORT_GLYPH_ERROR,
} from '../src/workspace/topology-edit/topology-edit-support-glyph-geometry.js';
import { TopologyEditSupportViewportBackend } from '../src/workspace/topology-edit/topology-edit-support-viewport-backend.js';

const CONFIGURATION = {
  supportMarkerSize: 24,
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
const FAMILY_FIXTURES = [
  ['rest', 'REST', { gapMm: 0 }],
  ['shoe', 'SHOE', { gapMm: 0 }],
  ['trunnion', 'TRUNNION', { gapMm: 0 }],
  ['hanger', 'HANGER', { gapMm: 0 }],
  ['guide', 'GUIDE', { gapMm: 4 }],
  ['stop', 'LINE_STOP', { gapMm: 3 }],
  ['limit', 'LIMIT', { positiveGapMm: 2, negativeGapMm: 5 }],
  ['holdown', 'HOLDOWN', { gapMm: 2 }],
  ['u-bolt', 'U_BOLT', { gapMm: 1 }],
  ['spring-hanger', 'SPRING_HANGER', { gapMm: 0 }],
  ['can', 'CAN', { direction: '+Z' }],
  ['spring-warning', 'SPRING', { direction: '+Z' }],
  ['anchor', 'ANCHOR', {}],
];

function canonicalWithSupport(restraints = FAMILY_FIXTURES.map(restraintRow)) {
  return {
    canonicalTopologyHash: 'canonical:m003',
    nodes: [
      { id: 'node:0', position: { x: 0, y: 0, z: 0 } },
      { id: 'node:1', position: { x: 1000, y: 0, z: 0 } },
    ],
    edges: [{
      id: 'edge:pipe', componentKey: 'pipe:1', fromNodeId: 'node:0', toNodeId: 'node:1',
      outsideDiameterMm: 100,
    }],
    junctions: [],
    supports: [{
      id: 'support:all', nodeId: 'node:0', hostEntityId: 'pipe:1', restraints,
    }],
  };
}
function restraintRow([id, kind, extra]) {
  return { id: `restraint:${id}`, kind, sourcePaths: [`/supports/${id}`], ...extra };
}

function capabilityGuide(gaps = [4]) {
  return {
    restraintId: 'restraint:capability-guide',
    supportKey: 'support-source-1',
    supportType: 'GUIDE',
    supportTypeEvidence: [{ value: 'GUIDE', sourcePath: '/support/type' }],
    vertical: { state: 'FREE', basis: 'EXPLICIT', evidence: [] },
    lateral: {
      state: 'GAP', basis: 'EXPLICIT',
      evidence: [{ value: 'GAP', sourcePath: '/support/lateral-capability' }],
    },
    longitudinal: { state: 'FREE', basis: 'EXPLICIT', evidence: [] },
    rotational: { state: 'FREE', basis: 'EXPLICIT', evidence: [] },
    gapEvidence: {
      vertical: [],
      lateral: gaps.map((value, index) => ({
        value, unit: 'mm', sourcePath: `/support/lateral-gap/${index}`,
      })),
      longitudinal: [],
    },
    qualification: 'EXPLICIT',
  };
}

test('M003 carries immutable support evidence into a detached viewport projection', () => {
  const canonical = canonicalWithSupport();
  const before = structuredClone(canonical);
  const overlays = deriveAllSupportRestraintGeometry({ canonicalTopology: canonical, verticalAxis: 'Z' });
  const projection = projectSupportGeometryToViewport(overlays, { markerSizeMm: 24 });
  assert.notEqual(projection.glyphOverlays, overlays);
  assert.deepEqual(projection.glyphOverlays, overlays);
  assert.equal(projection.glyphOverlays[0].restraints.length, FAMILY_FIXTURES.length);
  assert.equal(projection.elements[0].sizeMm, 24);
  assert.deepEqual(canonical, before);
});

test('M003 consumes the real restraint-capability record without reclassifying it', () => {
  const canonical = canonicalWithSupport([]);
  canonical.supports[0].restraint = capabilityGuide();
  delete canonical.supports[0].restraints;
  const [overlay] = deriveAllSupportRestraintGeometry({ canonicalTopology: canonical, verticalAxis: 'Z' });
  const restraint = overlay.restraints[0];
  assert.equal(restraint.restraintId, 'restraint:capability-guide');
  assert.equal(restraint.family, 'GUIDE');
  assert.equal(restraint.status, 'RESOLVED');
  assert.deepEqual(restraint.direction, { x: 0, y: 1, z: 0 });
  assert.deepEqual(restraint.positiveContactPoint, { x: 0, y: 54, z: 0 });
  assert.deepEqual(restraint.negativeContactPoint, { x: 0, y: -54, z: 0 });
  assert.ok(restraint.sourcePaths.includes('/support/type'));
  assert.ok(restraint.sourcePaths.includes('/support/lateral-gap/0'));
});

test('M003 materializes every governed family with exact support and restraint picks', () => {
  const [overlay] = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonicalWithSupport(), verticalAxis: 'Z',
  });
  const result = materializeTopologyEditSupportOverlay(overlay, {
    markerSize: 24, radialSegments: 16,
  });
  const pickTargets = [];
  const roles = new Set();
  result.object.traverse((object) => {
    if (object.userData?.pickTarget) pickTargets.push(object.userData.pickTarget);
    if (object.userData?.partRole) roles.add(object.userData.partRole);
  });
  assert.ok(pickTargets.some((target) => (
    target.objectKind === 'support' && target.supportId === 'support:all'
  )));
  for (const [id] of FAMILY_FIXTURES) {
    const restraintId = `restraint:${id}`;
    assert.ok(pickTargets.some((target) => (
      target.objectKind === 'restraint'
      && target.objectId === restraintId
      && target.supportId === 'support:all'
    )), `missing exact pick identity for ${restraintId}`);
  }
  for (const role of [
    'rest-base', 'shoe-base', 'trunnion-post', 'hanger-eye',
    'guide-rail-positive', 'line-stop-positive', 'limit-negative',
    'holdown-cap', 'u-bolt-loop', 'spring-hanger-rod',
    'spring-can-base', 'anchor-axis-2',
  ]) assert.ok(roles.has(role), `missing family-specific role ${role}`);
  assert.equal(result.bounds.isEmpty(), false);
});

test('M003 preserves contact points and exact model evidence on every restraint child', () => {
  const [overlay] = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonicalWithSupport([
      restraintRow(['guide', 'GUIDE', { positiveGapMm: 4, negativeGapMm: 7 }]),
    ]),
    verticalAxis: 'Z',
  });
  const result = materializeTopologyEditSupportOverlay(overlay, {
    markerSize: 24, radialSegments: 16,
  });
  const contacts = [];
  result.object.traverse((object) => {
    if (!object.userData?.restraintId) return;
    assert.equal(object.userData.modelEvidence.restraintId, 'restraint:guide');
    assert.equal(object.userData.modelEvidence.restraintStatus, 'RESOLVED');
    if (['positive-contact', 'negative-contact'].includes(object.userData.partRole)) {
      contacts.push({ role: object.userData.partRole, position: object.position.toArray() });
    }
  });
  assert.deepEqual(contacts, [
    { role: 'positive-contact', position: [0, 54, 0] },
    { role: 'negative-contact', position: [0, -57, 0] },
  ]);
});

test('M003 renders unknown, unresolved, and conflicted evidence as diagnostic glyphs', () => {
  const unknownCanonical = canonicalWithSupport([{ id: 'restraint:unknown', kind: 'OTHER' }]);
  const [unknown] = deriveAllSupportRestraintGeometry({ canonicalTopology: unknownCanonical });
  const conflictCanonical = canonicalWithSupport([]);
  conflictCanonical.supports[0].restraint = capabilityGuide([4, 7]);
  delete conflictCanonical.supports[0].restraints;
  const [conflict] = deriveAllSupportRestraintGeometry({ canonicalTopology: conflictCanonical });
  assert.equal(unknown.restraints[0].status, 'UNRESOLVED');
  assert.equal(conflict.restraints[0].status, 'PARTIAL');
  for (const overlay of [unknown, conflict]) {
    const result = materializeTopologyEditSupportOverlay(overlay, {
      markerSize: 24, radialSegments: 16,
    });
    const roles = [];
    result.object.traverse((object) => {
      if (object.userData?.partRole) roles.push(object.userData.partRole);
    });
    assert.ok(roles.includes('diagnostic-restraint'));
  }
});

test('M003 fails closed for missing identities, malformed evidence, geometry, and policy', () => {
  const noIdentity = canonicalWithSupport([{ kind: 'GUIDE', gapMm: 4 }]);
  assert.throws(
    () => deriveAllSupportRestraintGeometry({ canonicalTopology: noIdentity }),
    (error) => error.code === 'TOPOLOGY_EDIT_RESTRAINT_IDENTITY_MISSING',
  );
  assert.throws(() => materializeTopologyEditSupportOverlay({
    supportId: '', origin: { x: 0, y: 0, z: 0 }, restraints: [], status: 'RESOLVED', sourcePaths: [],
  }, { markerSize: 24, radialSegments: 16 }), namedFailure('SUPPORT_ID_MISSING'));
  assert.throws(() => materializeTopologyEditSupportOverlay({
    supportId: 'support:1', origin: { x: Number.NaN, y: 0, z: 0 }, restraints: [],
    status: 'RESOLVED', sourcePaths: [],
  }, { markerSize: 24, radialSegments: 16 }), namedFailure('SUPPORT_ORIGIN_INVALID'));
  assert.throws(() => materializeTopologyEditSupportOverlay({
    supportId: 'support:1', origin: { x: 0, y: 0, z: 0 }, restraints: [],
    status: 'RESOLVED', sourcePaths: [],
  }, { markerSize: 0, radialSegments: 16 }), namedFailure('MARKER_SIZE_INVALID'));
  const [overlay] = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonicalWithSupport([restraintRow(['guide', 'GUIDE', { gapMm: 4 }])]),
  });
  const malformed = { ...overlay, restraints: [{ ...overlay.restraints[0], sourcePaths: 'not-an-array' }] };
  assert.throws(
    () => materializeTopologyEditSupportOverlay(malformed, { markerSize: 24, radialSegments: 16 }),
    namedFailure('RESTRAINT_SOURCE_PATHS_INVALID'),
  );
});

test('M003 production backend uses Project Data marker authority, bounds, and sectioning', () => {
  const overlays = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonicalWithSupport([restraintRow(['guide', 'GUIDE', { gapMm: 4 }])]),
  });
  const projection = projectSupportGeometryToViewport(overlays, { markerSizeMm: 24 });
  const backend = new TopologyEditSupportViewportBackend({ navigationConfiguration: CONFIGURATION });
  backend.renderSession({
    source: { elements: [], segments: [], primitives: [] },
    draft: { elements: [], segments: [], primitives: [] },
    supports: projection,
  });
  assert.equal(backend.groups.supportGroup.children.length, 1);
  assert.equal(backend.engineeringBounds.isEmpty(), false);
  backend.setPresentationSectionPlanes(sectionBox());
  backend.groups.supportGroup.traverse((object) => {
    if (object.isMesh) assert.equal(object.material.clippingPlanes.length, 6);
  });
  const conflicting = projectSupportGeometryToViewport(overlays, { markerSizeMm: 30 });
  assert.throws(
    () => backend.renderSession({ supports: conflicting }),
    /TOPOLOGY_EDIT_SUPPORT_MARKER_POLICY_CONFLICT/u,
  );
  backend.destroy();
});

test('M003 disposes partially materialized support resources on a later restraint failure', { concurrency: false }, () => {
  const geometryDispose = THREE.BufferGeometry.prototype.dispose;
  const materialDispose = THREE.Material.prototype.dispose;
  let geometryCount = 0;
  let materialCount = 0;
  THREE.BufferGeometry.prototype.dispose = function disposeGeometry() {
    geometryCount += 1;
    return geometryDispose.call(this);
  };
  THREE.Material.prototype.dispose = function disposeMaterial() {
    materialCount += 1;
    return materialDispose.call(this);
  };
  try {
    const [overlay] = deriveAllSupportRestraintGeometry({
      canonicalTopology: canonicalWithSupport([
        restraintRow(['a', 'GUIDE', { gapMm: 4 }]),
        restraintRow(['z', 'GUIDE', { gapMm: 4 }]),
      ]),
    });
    const malformed = {
      ...overlay,
      restraints: [overlay.restraints[0], { ...overlay.restraints[1], sourcePaths: 'invalid' }],
    };
    assert.throws(
      () => materializeTopologyEditSupportOverlay(malformed, { markerSize: 24, radialSegments: 16 }),
      namedFailure('RESTRAINT_SOURCE_PATHS_INVALID'),
    );
    assert.ok(geometryCount > 0);
    assert.ok(materialCount > 0);
  } finally {
    THREE.BufferGeometry.prototype.dispose = geometryDispose;
    THREE.Material.prototype.dispose = materialDispose;
  }
});

function namedFailure(detailCode) {
  return (error) => error.code === TOPOLOGY_EDIT_SUPPORT_GLYPH_ERROR
    && error.detailCode === detailCode;
}
function sectionBox() {
  return [
    plane(1, 0, 0, 1000), plane(-1, 0, 0, 1000),
    plane(0, 1, 0, 1000), plane(0, -1, 0, 1000),
    plane(0, 0, 1, 1000), plane(0, 0, -1, 1000),
  ];
}
function plane(x, y, z, constant) { return { normal: { x, y, z }, constant }; }
