import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveAllSupportRestraintGeometry,
  projectSupportGeometryToViewport,
} from '../src/workspace/topology-edit/support-restraint-family.js';
import {
  materializeTopologyEditSupportOverlay,
  TOPOLOGY_EDIT_SUPPORT_GLYPH_ERROR,
} from '../src/workspace/topology-edit/topology-edit-support-glyph-geometry.js';

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

test('M003 carries complete support evidence into the viewport projection', () => {
  const canonical = canonicalWithSupport();
  const before = structuredClone(canonical);
  const overlays = deriveAllSupportRestraintGeometry({ canonicalTopology: canonical, verticalAxis: 'Z' });
  const projection = projectSupportGeometryToViewport(overlays, { markerSizeMm: 24 });

  assert.equal(projection.glyphOverlays, overlays);
  assert.equal(projection.glyphOverlays[0].restraints.length, FAMILY_FIXTURES.length);
  assert.equal(projection.elements[0].sizeMm, 24);
  assert.deepEqual(canonical, before);
});

test('M003 materializes every governed family with exact support and restraint picks', () => {
  const [overlay] = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonicalWithSupport(),
    verticalAxis: 'Z',
  });
  const result = materializeTopologyEditSupportOverlay(overlay, {
    markerSize: 24,
    radialSegments: 16,
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

test('M003 preserves derived contact points as restraint-level glyph evidence', () => {
  const [overlay] = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonicalWithSupport([
      restraintRow(['guide', 'GUIDE', { positiveGapMm: 4, negativeGapMm: 7 }]),
    ]),
    verticalAxis: 'Z',
  });
  const restraint = overlay.restraints[0];
  assert.deepEqual(restraint.positiveContactPoint, { x: 0, y: 54, z: 0 });
  assert.deepEqual(restraint.negativeContactPoint, { x: 0, y: -57, z: 0 });

  const result = materializeTopologyEditSupportOverlay(overlay, {
    markerSize: 24,
    radialSegments: 16,
  });
  const contacts = [];
  result.object.traverse((object) => {
    if (['positive-contact', 'negative-contact'].includes(object.userData?.partRole)) {
      contacts.push({ role: object.userData.partRole, position: object.position.toArray() });
    }
  });
  assert.deepEqual(contacts, [
    { role: 'positive-contact', position: [0, 54, 0] },
    { role: 'negative-contact', position: [0, -57, 0] },
  ]);
});

test('M003 renders unresolved families as explicit diagnostic glyphs', () => {
  const [overlay] = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonicalWithSupport([{ id: 'restraint:unknown', kind: 'OTHER' }]),
  });
  assert.equal(overlay.restraints[0].status, 'UNRESOLVED');
  const result = materializeTopologyEditSupportOverlay(overlay, {
    markerSize: 24,
    radialSegments: 16,
  });
  const roles = [];
  result.object.traverse((object) => {
    if (object.userData?.partRole) roles.push(object.userData.partRole);
  });
  assert.ok(roles.includes('diagnostic-restraint'));
  assert.ok(result.object.children.some((object) => (
    object.userData?.pickTarget?.objectId === 'restraint:unknown'
  )));
});

test('M003 fails closed for missing identity, non-finite geometry, and policy', () => {
  assert.throws(() => materializeTopologyEditSupportOverlay({
    supportId: '', origin: { x: 0, y: 0, z: 0 }, restraints: [], status: 'RESOLVED',
  }, { markerSize: 24, radialSegments: 16 }), (error) => (
    error.code === TOPOLOGY_EDIT_SUPPORT_GLYPH_ERROR
    && error.detailCode === 'SUPPORT_ID_MISSING'
  ));
  assert.throws(() => materializeTopologyEditSupportOverlay({
    supportId: 'support:1', origin: { x: Number.NaN, y: 0, z: 0 }, restraints: [], status: 'RESOLVED',
  }, { markerSize: 24, radialSegments: 16 }), (error) => (
    error.code === TOPOLOGY_EDIT_SUPPORT_GLYPH_ERROR
    && error.detailCode === 'SUPPORT_ORIGIN_INVALID'
  ));
  assert.throws(() => materializeTopologyEditSupportOverlay({
    supportId: 'support:1', origin: { x: 0, y: 0, z: 0 }, restraints: [], status: 'RESOLVED',
  }, { markerSize: 0, radialSegments: 16 }), (error) => (
    error.code === TOPOLOGY_EDIT_SUPPORT_GLYPH_ERROR
    && error.detailCode === 'MARKER_SIZE_INVALID'
  ));
});
