import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TopologyEditSjsonEditDraftViewportBackend,
} from '../src/workspace/topology-edit/topology-edit-sjson-edit-draft-viewport-backend.js';
import {
  TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
} from '../src/workspace/topology-edit/topology-edit-sjson-edit-draft-projection.js';
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

test('SJSON Edit Draft backend renders compact route curves without rich fitting bodies', () => {
  const backend = new TopologyEditSjsonEditDraftViewportBackend({
    navigationConfiguration: CONFIGURATION,
  });
  const projection = {
    renderStyle: TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
    renderAuthority: 'fixture',
    compactElements: [],
    compactSegments: [{
      id: 'elbow:curve',
      entityId: 'edge:elbow',
      type: 'ELBOW_ARC',
      kind: 'ELBOW',
      start: { x: 0, y: 0, z: 0 },
      controlPoint1: { x: 50, y: 0, z: 0 },
      controlPoint2: { x: 100, y: 50, z: 0 },
      end: { x: 100, y: 100, z: 0 },
      curveKind: 'CUBIC_BEZIER',
      curveSegments: 12,
      radiusMm: 10,
      colorInt: 0x8b5cf6,
      pickTarget: { objectKind: 'component', objectId: 'edge:elbow' },
    }],
  };
  backend.renderProjection(
    backend.groups.draftGroup,
    projection,
    0x0284c7,
    1,
    10,
  );
  const names = [];
  backend.groups.draftGroup.traverse((object) => {
    if (object.name) names.push(object.name);
  });
  assert.ok(names.includes('topology-edit-edit-draft-segment:elbow:curve'));
  assert.equal(names.some((name) => name.includes('typed-primitive')), false);
  assert.equal(backend.groups.draftGroup.children.length, 1);
  backend.destroy();
});

test('SJSON compact supports render one small marker and one directional arrow', () => {
  const backend = new TopologyEditSjsonEditDraftViewportBackend({
    navigationConfiguration: CONFIGURATION,
  });
  const projection = {
    renderStyle: TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES.TOPO_VALIDATOR_COMPACT,
    compactMarkerRadiusMm: 12.6,
    elements: [{
      id: 'support:1',
      entityId: 'support:1',
      type: 'SUPPORT',
      x: 0,
      y: 0,
      z: 0,
      sizeMm: 70,
      pickTarget: { objectKind: 'support', objectId: 'support:1' },
    }],
    segments: [{
      id: 'restraint:1:direction',
      entityId: 'restraint:1',
      type: 'RESTRAINT_DIRECTION',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 80, y: 0, z: 0 },
      radiusMm: 5,
      colorInt: 0xef4444,
      pickTarget: {
        objectKind: 'restraint',
        objectId: 'restraint:1',
        supportId: 'support:1',
      },
    }],
  };
  backend.renderProjection(
    backend.groups.supportGroup,
    projection,
    0x22d3ee,
    1,
    70,
  );
  const names = [];
  const picks = [];
  backend.groups.supportGroup.traverse((object) => {
    if (object.name) names.push(object.name);
    if (object.userData?.pickTarget) picks.push(object.userData.pickTarget);
  });
  assert.ok(names.includes('topology-edit-compact-support-marker:support:1'));
  assert.ok(names.includes('topology-edit-compact-restraint-arrow:restraint:1:direction'));
  assert.equal(names.some((name) => name.startsWith('topology-edit-support:')), false);
  const marker = backend.groups.supportGroup.children.find(
    (object) => object.name === 'topology-edit-compact-support-marker:support:1',
  );
  assert.equal(marker.geometry.parameters.radius, 12.6);
  assert.ok(picks.some((row) => row.objectKind === 'support'));
  assert.ok(picks.some((row) => row.objectKind === 'restraint'));
  backend.destroy();
});
