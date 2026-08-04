import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createThreePrimitive } from '../src/workspace/three-primitive-factory.js';
import { finiteKey } from '../src/workspace/three-pipe-primitives.js';
import { ThreeSceneResourcePool } from '../src/workspace/three-scene-resource-pool.js';
import { compileThreeModel } from '../src/workspace/three-viewport-scene.js';
import { VIEWPORT_RENDER_MODEL_SCHEMA } from '../src/workspace/viewport-render-model.js';

function pipeItem(objectId, startX = 0) {
  return {
    primitiveId: `visual:${objectId}:pipe_tube`,
    objectId,
    componentKind: 'PIPE',
    resolutionStatus: 'RESOLVED',
    layer: 'PHYSICAL',
    renderSettings: { meshRadialSegments: 16 },
    primitive: {
      kind: 'PIPE_TUBE',
      start: { x: startX, y: 0, z: 0 },
      end: { x: startX + 100, y: 0, z: 0 },
      visualDiameterMm: 20,
    },
  };
}

test('P1 shares canonical geometry and materials without sharing object identity', () => {
  const pool = new ThreeSceneResourcePool();
  const first = createThreePrimitive(pipeItem('pipe:1', 0), pool);
  const second = createThreePrimitive(pipeItem('pipe:2', 200), pool);

  assert.notEqual(first, second);
  assert.equal(first.geometry, second.geometry);
  assert.equal(first.material, second.material);
  assert.equal(first.userData.objectId, 'pipe:1');
  assert.equal(second.userData.objectId, 'pipe:2');
  assert.deepEqual(first.scale.toArray(), [20, 100, 20]);
  assert.deepEqual(second.scale.toArray(), [20, 100, 20]);

  const evidence = pool.evidence();
  assert.equal(evidence.geometryCount, 1);
  assert.equal(evidence.materialCount, 1);
  assert.equal(evidence.geometryReuseCount, 1);
  assert.equal(evidence.materialReuseCount, 1);

  let geometryDisposals = 0;
  let materialDisposals = 0;
  first.geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
  first.material.addEventListener('dispose', () => { materialDisposals += 1; });
  pool.dispose();
  pool.dispose();
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
});

test('P1 geometry keys preserve adjacent finite values exactly', () => {
  const left = 1;
  const right = 1 + Number.EPSILON;
  assert.notEqual(left, right);
  assert.notEqual(finiteKey(left), finiteKey(right));
  assert.equal(finiteKey(-0), '0');
});

test('P1 scaled canonical cylinder preserves legacy world bounds', () => {
  const pool = new ThreeSceneResourcePool();
  const pooled = createThreePrimitive(pipeItem('pipe:bounds', 25), pool);
  pooled.updateMatrixWorld(true);

  const legacy = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 10, 100, 16, 1, false),
    new THREE.MeshStandardMaterial(),
  );
  legacy.position.set(75, 0, 0);
  legacy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  legacy.updateMatrixWorld(true);

  const pooledBounds = new THREE.Box3().setFromObject(pooled);
  const legacyBounds = new THREE.Box3().setFromObject(legacy);
  assert.ok(pooledBounds.min.distanceTo(legacyBounds.min) < 1e-9);
  assert.ok(pooledBounds.max.distanceTo(legacyBounds.max) < 1e-9);

  legacy.geometry.dispose();
  legacy.material.dispose();
  pool.dispose();
});

test('P1 compilation retains one exact object-map entry per canonical pick target', () => {
  const model = {
    schema: VIEWPORT_RENDER_MODEL_SCHEMA,
    datasetId: 'dataset:p1',
    physicalPrimitives: [pipeItem('pipe:1', 0), pipeItem('pipe:2', 200)],
    supportOverlayPrimitives: [],
    diagnosticPrimitives: [],
  };
  const compiled = compileThreeModel(model);
  assert.deepEqual([...compiled.objects.keys()], ['pipe:1', 'pipe:2']);
  assert.equal(compiled.objects.get('pipe:1').length, 1);
  assert.equal(compiled.objects.get('pipe:2').length, 1);
  assert.equal(compiled.objects.get('pipe:1')[0].userData.entityId, 'pipe:1');
  assert.equal(compiled.objects.get('pipe:2')[0].userData.entityId, 'pipe:2');
  assert.equal(compiled.resourceEvidence.geometryCount, 1);
  assert.equal(compiled.resourceEvidence.materialCount, 1);
  compiled.resourcePool.dispose();
});
