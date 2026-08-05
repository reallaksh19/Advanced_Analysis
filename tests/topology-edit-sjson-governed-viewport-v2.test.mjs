import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TOPOLOGY_EDIT_ISSUE_OVERLAY_SCHEMA,
} from '../src/workspace/topology-edit/topology-edit-issue-overlay.js';
import {
  TopologyEditSjsonGovernedViewportBackend,
} from '../src/workspace/topology-edit/topology-edit-sjson-governed-viewport-backend-v2.js';
import {
  TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
  TOPOLOGY_EDIT_SJSON_GOVERNED_PROJECTION_SCHEMA,
} from '../src/workspace/topology-edit/topology-edit-sjson-governed-projection-v2.js';
import {
  TOPOLOGY_EDIT_SJSON_EQUIPMENT_GEOMETRY_AUTHORITY,
} from '../src/workspace/topology-edit/topology-edit-sjson-governed-equipment-geometry-v1.js';
import {
  TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES,
} from '../src/workspace/topology-edit/topology-edit-support-viewport-backend.js';

const CONFIGURATION = {
  supportMarkerSize: 70,
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

test('governed route renders visible envelopes with direct picks, physical radius lineage, and larger proxies', () => {
  const backend = new TopologyEditSjsonGovernedViewportBackend({ navigationConfiguration: CONFIGURATION });
  backend.renderProjection(backend.groups.draftGroup, {
    schema: TOPOLOGY_EDIT_SJSON_GOVERNED_PROJECTION_SCHEMA,
    renderStyle: TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
    compactSegments: [{
      id: 'pipe:1', entityId: 'edge:1', kind: 'PIPE', radiusMm: 50,
      start: { x: 0, y: 0, z: 0 }, end: { x: 100_000, y: 0, z: 0 },
      pickTarget: { modelRole: 'draft', objectKind: 'component', objectId: 'edge:1' },
    }],
    compactElements: [{
      id: 'node:1', entityId: 'node:1', type: 'node', x: 0, y: 0, z: 0,
      pickTarget: { modelRole: 'draft', objectKind: 'node', objectId: 'node:1', nodeId: 'node:1' },
    }],
    editDraftMetrics: { exactTeeCount: 0, exactTeeSegmentCount: 0 },
  }, 0x0284c7, 1, 10);

  const objects = namedObjects(backend.groups.draftGroup);
  assert.equal(objects.get('topology-edit-edit-draft-centerline:pipe:1')?.isLine, true);
  const solid = objects.get('topology-edit-visible-route-solid:pipe:1');
  assert.equal(solid?.isMesh, true);
  assert.equal(solid.geometry.type, 'CylinderGeometry');
  assert.equal(solid.geometry.parameters.radiusTop, 250);
  assert.equal(solid.geometry.parameters.radiusBottom, 250);
  assert.equal(solid.material.isMeshBasicMaterial, true);
  assert.equal(solid.material.depthWrite, false);
  assert.equal(solid.userData.pickTarget.objectId, 'edge:1');
  assert.equal(solid.userData.directPickMesh, true);
  assert.equal(solid.userData.routePhysicalRadiusMm, 50);
  assert.equal(solid.userData.routeDisplayRadiusMm, 250);
  assert.equal(solid.userData.displayEnvelopeApplied, true);
  assert.equal(
    solid.userData.radiusAuthority,
    'CANONICAL_PROJECTED_RADIUS_WITH_BOUNDED_DISPLAY_ENVELOPE_V2',
  );
  assert.equal(solid.userData.renderAuthority, 'GOVERNED_DRAFT_OD_SOLID_PICK_TARGET_V5');

  const routeProxy = objects.get('topology-edit-route-pick-proxy:pipe:1');
  assert.equal(routeProxy?.isMesh, true);
  assert.ok(Math.abs(routeProxy.geometry.parameters.radiusTop - 256.3) < 1e-9);
  assert.ok(routeProxy.geometry.parameters.radiusTop > solid.geometry.parameters.radiusTop);
  assert.equal(routeProxy.material.opacity, 0);
  assert.equal(routeProxy.userData.pickTarget.objectId, 'edge:1');
  assert.equal(routeProxy.userData.renderAuthority, 'GOVERNED_ROUTE_PICK_PROXY_V5');

  const marker = objects.get('topology-edit-visible-node-marker:node:1');
  const nodeProxy = objects.get('topology-edit-node-pick-proxy:node:1');
  assert.equal(marker?.isMesh, true);
  assert.equal(marker.geometry.type, 'SphereGeometry');
  assert.equal(marker.userData.visualRadiusMm, 4.2);
  assert.equal(marker.userData.nonPickable, true);
  assert.equal(marker.userData.renderAuthority, 'CANONICAL_NODE_TRANSLUCENT_SPHERE_V3');
  assert.equal(marker.material.opacity, 0.18);
  assert.equal(marker.material.depthTest, false);
  assert.equal(nodeProxy.geometry.parameters.radius, 25.2);
  assert.equal(nodeProxy.material.opacity, 0);
  assert.equal(nodeProxy.userData.pickTarget.objectKind, 'node');
  assert.equal(nodeProxy.userData.renderAuthority, 'CANONICAL_NODE_PICK_PROXY_V3');
  backend.destroy();
});

test('governed inline equipment retains distinct flange, gasket, valve, and instrument silhouettes', () => {
  const backend = new TopologyEditSjsonGovernedViewportBackend({ navigationConfiguration: CONFIGURATION });
  const kinds = ['FLANGE', 'GASKET', 'VALVE', 'INSTRUMENT'];
  backend.renderProjection(backend.groups.draftGroup, {
    schema: TOPOLOGY_EDIT_SJSON_GOVERNED_PROJECTION_SCHEMA,
    renderStyle: TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
    compactSegments: kinds.map((kind, index) => ({
      id: `${kind.toLowerCase()}:1`,
      entityId: `edge:${kind.toLowerCase()}`,
      kind,
      radiusMm: 20,
      start: { x: index * 100, y: 0, z: 0 },
      end: { x: index * 100 + 60, y: 0, z: 0 },
      presentationOnlyExtent: kind === 'INSTRUMENT',
      sourceCoincidentPorts: kind === 'INSTRUMENT',
      axisInference: kind === 'INSTRUMENT' ? 'NEAREST_GOVERNED_ROUTE_SEGMENT' : null,
      pickTarget: {
        modelRole: 'draft', objectKind: 'component', objectId: `edge:${kind.toLowerCase()}`,
      },
    })),
    compactElements: [],
    editDraftMetrics: { coincidentPortEquipmentCount: 1 },
  }, 0x0284c7, 1, 10);

  const objects = namedObjects(backend.groups.draftGroup);
  const expectedGeometry = {
    FLANGE: 'LatheGeometry',
    GASKET: 'CylinderGeometry',
    VALVE: 'LatheGeometry',
    INSTRUMENT: 'SphereGeometry',
  };
  for (const kind of kinds) {
    const id = `${kind.toLowerCase()}:1`;
    const solid = objects.get(`topology-edit-visible-equipment-solid:${kind}:${id}`);
    assert.equal(solid?.isMesh, true, `${kind} solid missing`);
    assert.equal(solid.geometry.type, expectedGeometry[kind]);
    assert.equal(solid.userData.typedEquipmentSolid, true);
    assert.equal(solid.userData.equipmentKind, kind);
    assert.equal(
      solid.userData.equipmentGeometryAuthority,
      TOPOLOGY_EDIT_SJSON_EQUIPMENT_GEOMETRY_AUTHORITY,
    );
    assert.equal(solid.userData.pickTarget.objectId, `edge:${kind.toLowerCase()}`);
    assert.equal(solid.userData.directPickMesh, true);
    assert.equal(
      objects.get(`topology-edit-route-pick-proxy:${id}`)?.userData.pickTarget.objectId,
      `edge:${kind.toLowerCase()}`,
    );
  }
  const instrument = objects.get(
    'topology-edit-visible-equipment-solid:INSTRUMENT:instrument:1',
  );
  assert.equal(instrument.userData.presentationOnlyExtent, true);
  assert.equal(instrument.userData.sourceCoincidentPorts, true);
  backend.destroy();
});

test('governed supports render stable restraint identity with bidirectional arrows at threefold presentation scale', () => {
  const backend = new TopologyEditSjsonGovernedViewportBackend({ navigationConfiguration: CONFIGURATION });
  backend.renderProjection(backend.groups.supportGroup, {
    renderStyle: TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES.TOPO_VALIDATOR_COMPACT,
    compactMarkerRadiusMm: 37.8,
    glyphMetrics: { placementAuthority: 'HOST_OD_HALF_CONTACT_PLUS_TWO_OD_GLYPH_V2' },
    elements: [{
      id: 'support:1', entityId: 'support:1', type: 'SUPPORT', x: 0, y: 0, z: 0,
      pickTarget: { objectKind: 'support', objectId: 'support:1' },
    }],
    segments: [{
      id: 'restraint:1', entityId: 'restraint:1', type: 'RESTRAINT_DIRECTION',
      start: { x: 50, y: 0, z: 0 }, end: { x: 250, y: 0, z: 0 }, colorInt: 0xef4444,
      directionalArrows: [
        { polarity: 'POSITIVE', start: { x: 50, y: 0, z: 0 }, end: { x: 250, y: 0, z: 0 } },
        { polarity: 'NEGATIVE', start: { x: -50, y: 0, z: 0 }, end: { x: -250, y: 0, z: 0 } },
      ],
      pickTarget: { objectKind: 'restraint', objectId: 'restraint:1', supportId: 'support:1' },
    }],
  }, 0x22d3ee, 1, 70);
  const objects = namedObjects(backend.groups.supportGroup);
  const marker = objects.get('topology-edit-compact-support-marker:support:1');
  const markerProxy = objects.get('topology-edit-compact-support-pick-proxy:support:1');
  const shaft = objects.get('topology-edit-compact-restraint-shaft:restraint:1');
  const negativeShaft = objects.get('topology-edit-compact-restraint-shaft:restraint:1:negative');
  const head = objects.get('topology-edit-compact-restraint-head:restraint:1');
  const arrowProxy = objects.get('topology-edit-compact-restraint-pick-proxy:restraint:1');
  assert.equal(marker?.isLineSegments, true);
  assert.equal(marker.material.depthTest, false);
  assert.equal(marker.material.opacity, 0.15);
  assert.equal(markerProxy.userData.pickTarget.objectKind, 'support');
  assert.equal(shaft?.isLine, true);
  assert.equal(negativeShaft?.isLine, true);
  assert.equal(shaft.material.depthTest, false);
  assert.equal(head?.isLineSegments, true);
  assert.equal(head.material.opacity, 0.5);
  assert.equal(head.material.depthTest, false);
  assert.equal(arrowProxy.userData.pickTarget.objectKind, 'restraint');
  backend.destroy();
});

test('governed SJSON checker issues use compact wireframe HUD markers', () => {
  const backend = new TopologyEditSjsonGovernedViewportBackend({ navigationConfiguration: CONFIGURATION });
  backend.setGovernedSupportProjection({ renderStyle: 'TOPO_VALIDATOR_COMPACT' });
  const count = backend.renderIssues({
    schema: TOPOLOGY_EDIT_ISSUE_OVERLAY_SCHEMA,
    overlayHash: 'fnv1a64:test',
    entries: [{
      issueId: 'issue:1',
      severity: 'HIGH',
      position: { x: 10, y: 20, z: 30 },
      canonicalIds: ['edge:1'],
    }],
  });
  assert.equal(count, 1);
  const marker = namedObjects(backend.groups.issueGroup)
    .get('topology-edit-sjson-issue-marker:issue:1');
  assert.equal(marker?.isLineSegments, true);
  assert.equal(marker.material.opacity, 0.5);
  assert.equal(marker.material.depthTest, false);
  assert.equal(marker.userData.visualRadiusMm, 4.2);
  assert.equal(marker.userData.pickTarget.objectKind, 'issue');
  assert.equal(marker.userData.renderAuthority, 'SJSON_COMPACT_WIREFRAME_ISSUE_OVERLAY_V2');
  assert.equal(backend.groups.issueGroup.userData.issueOverlayHash, 'fnv1a64:test');
  backend.destroy();
});

function namedObjects(group) {
  const result = new Map();
  group.traverse((object) => { if (object.name) result.set(object.name, object); });
  return result;
}
