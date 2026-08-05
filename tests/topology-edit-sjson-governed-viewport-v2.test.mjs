import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TopologyEditSjsonGovernedViewportBackend,
} from '../src/workspace/topology-edit/topology-edit-sjson-governed-viewport-backend-v2.js';
import {
  TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
  TOPOLOGY_EDIT_SJSON_GOVERNED_PROJECTION_SCHEMA,
} from '../src/workspace/topology-edit/topology-edit-sjson-governed-projection-v2.js';
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

test('governed route renders lines, separate translucent nodes, and invisible picks', () => {
  const backend = new TopologyEditSjsonGovernedViewportBackend({ navigationConfiguration: CONFIGURATION });
  backend.renderProjection(backend.groups.draftGroup, {
    schema: TOPOLOGY_EDIT_SJSON_GOVERNED_PROJECTION_SCHEMA,
    renderStyle: TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
    compactSegments: [{
      id: 'pipe:1', entityId: 'edge:1', kind: 'PIPE',
      start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 },
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
  const routeProxy = objects.get('topology-edit-route-pick-proxy:pipe:1');
  assert.equal(routeProxy?.isMesh, true);
  assert.equal(routeProxy.material.opacity, 0);
  const marker = objects.get('topology-edit-visible-node-marker:node:1');
  const nodeProxy = objects.get('topology-edit-node-pick-proxy:node:1');
  assert.equal(marker?.isMesh, true);
  assert.equal(marker.geometry.parameters.radius, 7);
  assert.equal(marker.material.opacity, 0.24);
  assert.equal(marker.material.depthTest, false);
  assert.equal(nodeProxy.geometry.parameters.radius, 16.8);
  assert.equal(nodeProxy.material.opacity, 0);
  assert.equal(nodeProxy.userData.pickTarget.objectKind, 'node');
  backend.destroy();
});

test('governed supports are depth-independent overlays with pick proxies', () => {
  const backend = new TopologyEditSjsonGovernedViewportBackend({ navigationConfiguration: CONFIGURATION });
  backend.renderProjection(backend.groups.supportGroup, {
    renderStyle: TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES.TOPO_VALIDATOR_COMPACT,
    compactMarkerRadiusMm: 12.6,
    elements: [{
      id: 'support:1', entityId: 'support:1', type: 'SUPPORT', x: 0, y: 0, z: 0,
      pickTarget: { objectKind: 'support', objectId: 'support:1' },
    }],
    segments: [{
      id: 'restraint:1', entityId: 'restraint:1', type: 'RESTRAINT_DIRECTION',
      start: { x: 0, y: 0, z: 0 }, end: { x: 80, y: 0, z: 0 }, colorInt: 0xef4444,
      pickTarget: { objectKind: 'restraint', objectId: 'restraint:1', supportId: 'support:1' },
    }],
  }, 0x22d3ee, 1, 70);
  const objects = namedObjects(backend.groups.supportGroup);
  const marker = objects.get('topology-edit-compact-support-marker:support:1');
  const markerProxy = objects.get('topology-edit-compact-support-pick-proxy:support:1');
  const shaft = objects.get('topology-edit-compact-restraint-shaft:restraint:1');
  const head = objects.get('topology-edit-compact-restraint-head:restraint:1');
  const arrowProxy = objects.get('topology-edit-compact-restraint-pick-proxy:restraint:1');
  assert.equal(marker?.isLineSegments, true);
  assert.equal(marker.material.depthTest, false);
  assert.equal(marker.material.opacity, 0.15);
  assert.equal(markerProxy.userData.pickTarget.objectKind, 'support');
  assert.equal(shaft?.isLine, true);
  assert.equal(shaft.material.depthTest, false);
  assert.equal(head.material.opacity, 0.5);
  assert.equal(head.material.depthTest, false);
  assert.equal(arrowProxy.userData.pickTarget.objectKind, 'restraint');
  backend.destroy();
});

function namedObjects(group) {
  const result = new Map();
  group.traverse((object) => { if (object.name) result.set(object.name, object); });
  return result;
}
