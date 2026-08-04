import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  materializeTopologyEditPrimitive,
} from '../src/workspace/topology-edit/topology-edit-primitive-geometry.js';
import {
  topologyEditGeometryReuseKey,
} from '../src/workspace/topology-edit/topology-edit-render-resource-signatures.js';

const POLICY = Object.freeze({
  eligibleGeometryTypes: Object.freeze(['CylinderGeometry']),
});

const PICK = Object.freeze({
  canonicalId: 'edge:reducer',
  type: 'ECCENTRIC_REDUCER',
  pickTarget: Object.freeze({
    modelRole: 'draft',
    objectKind: 'component',
    objectId: 'edge:reducer',
    sourcePaths: Object.freeze([]),
    workspaceEntityIds: Object.freeze([]),
    partRole: 'body',
  }),
});

test('custom eccentric reducer vertex buffers are excluded from geometry pooling', () => {
  const material = new THREE.MeshStandardMaterial();
  const result = materializeTopologyEditPrimitive({
    primitiveId: 'primitive:eccentric',
    canonicalEntityId: 'edge:reducer',
    modelRole: 'DRAFT',
    partRole: 'body',
    kind: 'ECCENTRIC_REDUCER',
    sourcePaths: [],
    workspaceEntityIds: [],
    parameters: {
      start: { x: 0, y: 0, z: 0 },
      sourceEnd: { x: 100, y: 0, z: 0 },
      end: { x: 100, y: 20, z: 0 },
      startOutsideDiameterMm: 120,
      endOutsideDiameterMm: 60,
    },
  }, {
    material,
    radialSegments: 16,
    markerSize: 10,
    pickUserData: PICK,
  });

  const geometry = result.object.children[0].geometry;
  assert.equal(geometry.type, 'CylinderGeometry');
  assert.equal(geometry.userData.reducerProfile, 'ECCENTRIC_OFFSET_FRUSTUM');
  assert.equal(topologyEditGeometryReuseKey(geometry, POLICY), null);

  geometry.dispose();
  material.dispose();
});

test('ordinary governed cylinders remain eligible for deterministic pooling', () => {
  const geometry = new THREE.CylinderGeometry(10, 20, 100, 16);
  assert.match(
    topologyEditGeometryReuseKey(geometry, POLICY),
    /^CylinderGeometry:/u,
  );
  geometry.dispose();
});
