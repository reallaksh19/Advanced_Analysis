import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  materializeTopologyEditPrimitive,
} from '../src/workspace/topology-edit/topology-edit-primitive-geometry.js';
import {
  TopologyEditTypedViewportBackend,
} from '../src/workspace/topology-edit/topology-edit-typed-viewport-backend.js';
import {
  TopologyEditSupportViewportBackend,
} from '../src/workspace/topology-edit/topology-edit-support-viewport-backend.js';
import {
  deriveAllSupportRestraintGeometry,
  projectSupportGeometryToViewport,
} from '../src/workspace/topology-edit/support-restraint-family.js';

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

const PICK = Object.freeze({
  canonicalId: 'edge:component',
  type: 'component',
  pickTarget: Object.freeze({
    modelRole: 'draft',
    objectKind: 'component',
    objectId: 'edge:component',
    sourcePaths: Object.freeze([]),
    workspaceEntityIds: Object.freeze([]),
    partRole: 'body',
  }),
});

test('typed production rendering keeps canonical nodes pickable without drawing topology spheres', () => {
  const backend = new TopologyEditTypedViewportBackend({
    navigationConfiguration: CONFIGURATION,
  });
  backend.renderSession({
    draft: {
      elements: [
        nodeElement('node:a', 0, 0, 0),
        nodeElement('node:b', 1000, 0, 0),
      ],
      segments: [],
      primitives: [primitive('PIPE_CYLINDER', {
        start: { x: 0, y: 0, z: 0 },
        end: { x: 1000, y: 0, z: 0 },
        outsideDiameterMm: 100,
      })],
    },
  });

  const proxies = [];
  const physical = [];
  backend.groups.draftGroup.traverse((object) => {
    if (!object.isMesh) return;
    if (object.userData?.pickProxy) proxies.push(object);
    if (object.userData?.primitiveKind) physical.push(object);
  });

  assert.equal(proxies.length, 2);
  assert.equal(physical.length, 1);
  proxies.forEach((proxy) => {
    assert.equal(proxy.visible, true);
    assert.equal(proxy.material.opacity, 0);
    assert.equal(proxy.material.colorWrite, false);
    assert.equal(proxy.userData.pickTarget.objectKind, 'node');
  });
  assert.ok(backend.engineeringBounds.min.y <= -49.999);
  assert.ok(backend.engineeringBounds.max.y >= 49.999);
  backend.destroy();
});

test('elbow materialization follows the governed circular centerline exactly', () => {
  const material = new THREE.MeshStandardMaterial();
  const result = materializeTopologyEditPrimitive(
    primitive('ELBOW_ARC', {
      start: { x: 100, y: 0, z: 0 },
      end: { x: 0, y: 100, z: 0 },
      center: { x: 0, y: 0, z: 0 },
      centerlineRadiusMm: 100,
      outsideDiameterMm: 20,
      angleRad: Math.PI / 2,
      segmentCount: 16,
      bendPlaneNormal: { x: 0, y: 0, z: 1 },
      arcPoints: [
        { x: 100, y: 0, z: 0 },
        { x: 0, y: 100, z: 0 },
      ],
    }),
    { material, radialSegments: 16, markerSize: 10, pickUserData: PICK },
  );
  const mesh = result.object.children[0];
  const path = mesh.geometry.parameters.path;
  const midpoint = path.getPoint(0.5);
  approx(midpoint.x, Math.SQRT1_2 * 100);
  approx(midpoint.y, Math.SQRT1_2 * 100);
  approx(midpoint.z, 0);
  approx(midpoint.length(), 100);
  assert.equal(mesh.geometry.userData.centerlineKind, 'EXACT_CIRCULAR_ARC');
  disposeResult(result, material);
});

test('eccentric reducer preserves connection-face planes perpendicular to the source centerline', () => {
  const material = new THREE.MeshStandardMaterial();
  const result = materializeTopologyEditPrimitive(
    primitive('ECCENTRIC_REDUCER', {
      start: { x: 0, y: 0, z: 0 },
      sourceEnd: { x: 100, y: 0, z: 0 },
      end: { x: 100, y: 20, z: 0 },
      startOutsideDiameterMm: 120,
      endOutsideDiameterMm: 60,
    }),
    { material, radialSegments: 16, markerSize: 10, pickUserData: PICK },
  );
  const geometry = result.object.children[0].geometry;
  const count = geometry.userData.sectionVertexCount;
  const positions = geometry.getAttribute('position');
  const startXs = values(positions, 0, count, 'x');
  const endXs = values(positions, count, count * 2, 'x');
  startXs.forEach((value) => approx(value, 0));
  endXs.forEach((value) => approx(value, 100));
  approx(average(values(positions, 0, count, 'y')), 0);
  approx(average(values(positions, count, count * 2, 'y')), 20);
  disposeResult(result, material);
});

test('flange materialization uses one governed hub-and-disc profile rather than a plain cylinder', () => {
  const material = new THREE.MeshStandardMaterial();
  const result = materializeTopologyEditPrimitive(
    primitive('FLANGE_DISC', {
      start: { x: 0, y: 0, z: 0 },
      end: { x: 80, y: 0, z: 0 },
      outsideDiameterMm: 200,
    }),
    { material, radialSegments: 16, markerSize: 10, pickUserData: PICK },
  );
  assert.equal(result.object.children.length, 1);
  const geometry = result.object.children[0].geometry;
  assert.equal(geometry.type, 'LatheGeometry');
  assert.equal(geometry.userData.flangeProfile, 'HUB_AND_DISC');
  disposeResult(result, material);
});

test('support glyph bounds participate in production fit bounds instead of collapsing to support origins', () => {
  const canonical = {
    canonicalTopologyHash: 'canonical:render-fidelity-support',
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
      id: 'support:guide',
      nodeId: 'node:0',
      hostEntityId: 'pipe:1',
      restraints: [{
        id: 'restraint:guide',
        kind: 'GUIDE',
        gapMm: 4,
        sourcePaths: ['/supports/guide'],
      }],
    }],
  };
  const overlays = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonical,
    verticalAxis: 'Z',
  });
  const projection = projectSupportGeometryToViewport(overlays, { markerSizeMm: 24 });
  const backend = new TopologyEditSupportViewportBackend({
    navigationConfiguration: CONFIGURATION,
  });
  backend.renderSession({
    source: { elements: [], segments: [], primitives: [] },
    draft: { elements: [], segments: [], primitives: [] },
    supports: projection,
  });
  assert.ok(backend.engineeringBounds.max.y > 24);
  assert.ok(backend.engineeringBounds.min.y < -24);
  assert.ok(backend.engineeringBounds.max.z > 0 || backend.engineeringBounds.min.z < 0);
  backend.destroy();
});

function primitive(kind, parameters) {
  return {
    primitiveId: `primitive:${kind.toLowerCase()}`,
    canonicalEntityId: 'edge:component',
    modelRole: 'DRAFT',
    partRole: 'body',
    kind,
    sourcePaths: [],
    workspaceEntityIds: [],
    parameters,
  };
}

function nodeElement(id, x, y, z) {
  return {
    id,
    entityId: id,
    type: 'node',
    x,
    y,
    z,
    pickTarget: { objectKind: 'node', objectId: id, nodeId: id },
  };
}

function values(attribute, start, end, component) {
  const getter = component === 'x'
    ? (index) => attribute.getX(index)
    : component === 'y'
      ? (index) => attribute.getY(index)
      : (index) => attribute.getZ(index);
  const result = [];
  for (let index = start; index < end; index += 1) result.push(getter(index));
  return result;
}

function average(rows) {
  return rows.reduce((sum, value) => sum + value, 0) / rows.length;
}

function approx(actual, expected, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function disposeResult(result, material) {
  const geometries = new Set();
  result.object.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
  });
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
}
