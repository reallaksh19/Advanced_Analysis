import assert from 'node:assert/strict';
import test from 'node:test';
import { createDimensionAuthority } from '../src/workspace/topology-edit/dimension-authority.js';
import {
  deriveTopologyVisualGeometry,
  projectVisualGeometryToViewport,
} from '../src/workspace/topology-edit/topology-edit-render-model.js';
import {
  TopologyEditTypedViewportBackend,
  retainTypedTopologyEditPrimitives,
} from '../src/workspace/topology-edit/topology-edit-typed-viewport-backend.js';

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
  meshRadialSegments: 12,
  cameraNearMm: 0.1,
  cameraFarMm: 1_000_000,
};

test('M002 eccentric reducer consumes the governed offset direction', () => {
  const canonical = {
    canonicalTopologyHash: 'canonical:m002-reducers',
    nodes: [
      node('c0', -200, 0, 0),
      node('c1', 0, 0, 0),
      node('e0', 100, 0, 0),
      node('e1', 300, 0, 0),
    ],
    edges: [
      edge('concentric', 'C', 'c0', 'c1'),
      edge('eccentric', 'E', 'e0', 'e1'),
    ],
    junctions: [],
    supports: [],
  };
  const model = deriveTopologyVisualGeometry({
    canonicalTopology: canonical,
    componentEvidence: {
      C: { startOutsideDiameterMm: 120, endOutsideDiameterMm: 80 },
      E: {
        reducerType: 'ECCENTRIC',
        startOutsideDiameterMm: 120,
        endOutsideDiameterMm: 80,
        eccentricOffsetDirection: { x: 0, y: 0, z: 1 },
      },
    },
    dimensionAuthority: createDimensionAuthority(),
  });
  const projection = retainTypedTopologyEditPrimitives(
    model,
    projectVisualGeometryToViewport(model, canonical),
  );
  const eccentricPrimitive = projection.primitives.find((row) => row.kind === 'ECCENTRIC_REDUCER');
  assert.deepEqual(eccentricPrimitive.parameters.sourceEnd, { x: 300, y: 0, z: 0 });
  assert.deepEqual(eccentricPrimitive.parameters.end, { x: 300, y: 0, z: 20 });

  const backend = new TopologyEditTypedViewportBackend({ navigationConfiguration: CONFIGURATION });
  backend.renderSession({ draft: projection });
  const reducerMeshes = new Map();
  backend.groups.draftGroup.traverse((object) => {
    if (object.isMesh && object.userData?.primitiveKind?.endsWith('REDUCER')) {
      reducerMeshes.set(object.userData.primitiveKind, object);
    }
  });
  const concentric = reducerMeshes.get('CONICAL_REDUCER');
  const eccentric = reducerMeshes.get('ECCENTRIC_REDUCER');
  assert.equal(concentric.geometry.type, 'CylinderGeometry');
  assert.equal(eccentric.geometry.type, 'CylinderGeometry');
  assert.ok(Math.abs(concentric.position.z) <= 1e-12);
  assert.ok(Math.abs(eccentric.position.z - 10) <= 1e-12);
  backend.destroy();
});

function node(id, x, y, z) {
  return { id, position: { x, y, z } };
}

function edge(id, componentKey, fromNodeId, toNodeId) {
  return { id, componentKey, fromNodeId, toNodeId, entityType: 'REDUCER' };
}

test('M002 source typed picks preserve the source model role', () => {
  const backend = new TopologyEditTypedViewportBackend({ navigationConfiguration: CONFIGURATION });
  backend.renderSession({
    source: {
      elements: [],
      segments: [],
      primitives: [{
        primitiveId: 'visual:source-pipe',
        canonicalEntityId: 'edge:source-pipe',
        canonicalType: 'PIPE',
        modelRole: 'SOURCE',
        partRole: 'body',
        kind: 'PIPE_CYLINDER',
        sourcePaths: ['/source/pipe'],
        workspaceEntityIds: ['workspace:pipe'],
        parameters: {
          start: { x: 0, y: 0, z: 0 },
          end: { x: 100, y: 0, z: 0 },
          outsideDiameterMm: 20,
        },
      }],
    },
  });
  let sourceMesh = null;
  backend.groups.sourceGroup.traverse((object) => {
    if (object.isMesh && object.userData?.primitiveId === 'visual:source-pipe') sourceMesh = object;
  });
  assert.equal(sourceMesh.userData.pickTarget.modelRole, 'source');
  assert.equal(sourceMesh.userData.pickTarget.objectId, 'edge:source-pipe');
  backend.destroy();
});
