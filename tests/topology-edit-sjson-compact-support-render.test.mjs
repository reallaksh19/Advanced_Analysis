import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveAllSupportRestraintGeometry,
  projectSupportGeometryToViewport,
} from '../src/workspace/topology-edit/support-restraint-family.js';
import {
  TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES,
  TopologyEditSupportViewportBackend,
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

function canonical() {
  return {
    canonicalTopologyHash: 'canonical:compact-support',
    nodes: [
      { id: 'node:0', position: { x: 0, y: 0, z: 0 } },
      { id: 'node:1', position: { x: 1000, y: 0, z: 0 } },
    ],
    edges: [{
      id: 'edge:pipe',
      componentKey: 'pipe:1',
      fromNodeId: 'node:0',
      toNodeId: 'node:1',
      outsideDiameterMm: 100,
    }],
    junctions: [],
    supports: [{
      id: 'support:1',
      nodeId: 'node:0',
      hostEntityId: 'pipe:1',
      sourcePaths: ['/supports/1'],
      restraints: [{
        id: 'restraint:guide',
        kind: 'GUIDE',
        gapMm: 4,
        sourcePaths: ['/supports/1/guide'],
      }],
    }],
  };
}

test('SJSON compact support style bypasses rich support bodies and preserves exact picks', () => {
  const overlays = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonical(),
    verticalAxis: 'Z',
  });
  const baseProjection = projectSupportGeometryToViewport(overlays, { markerSizeMm: 70 });
  const projection = Object.freeze({
    ...baseProjection,
    renderStyle: TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES.TOPO_VALIDATOR_COMPACT,
    compactMarkerRadiusMm: 37.8,
  });
  const backend = new TopologyEditSupportViewportBackend({ navigationConfiguration: CONFIGURATION });

  backend.renderProjection(
    backend.groups.supportGroup,
    projection,
    0x22d3ee,
    1,
    CONFIGURATION.supportMarkerSize,
  );

  const picks = [];
  const names = [];
  backend.groups.supportGroup.traverse((object) => {
    if (object.name) names.push(object.name);
    if (object.userData?.pickTarget) picks.push(object.userData.pickTarget);
  });
  assert.ok(backend.groups.supportGroup.children.length >= 2);
  assert.equal(names.some((name) => name.startsWith('topology-edit-support:')), false);
  assert.ok(picks.some((target) => (
    target.objectKind === 'support'
    && target.objectId === 'support:1'
  )));
  assert.ok(picks.some((target) => (
    target.objectKind === 'restraint'
    && target.objectId === 'restraint:guide'
    && target.supportId === 'support:1'
  )));
  assert.equal(projection.glyphOverlays.length, 1);
  assert.equal(projection.segments.length, 1);
  backend.destroy();
});

test('SJSON compact support style fails closed without a governed marker radius', () => {
  const overlays = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonical(),
    verticalAxis: 'Z',
  });
  const baseProjection = projectSupportGeometryToViewport(overlays, { markerSizeMm: 70 });
  const backend = new TopologyEditSupportViewportBackend({ navigationConfiguration: CONFIGURATION });
  assert.throws(() => backend.renderProjection(
    backend.groups.supportGroup,
    {
      ...baseProjection,
      renderStyle: TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES.TOPO_VALIDATOR_COMPACT,
      compactMarkerRadiusMm: 0,
    },
    0x22d3ee,
    1,
    0,
  ), /TOPOLOGY_EDIT_COMPACT_SUPPORT_MARKER_POLICY_MISSING/u);
  backend.destroy();
});
