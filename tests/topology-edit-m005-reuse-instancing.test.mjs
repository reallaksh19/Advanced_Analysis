import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { optimizeTopologyEditRenderGroups } from '../src/workspace/topology-edit/topology-edit-render-optimizer.js';
import {
  createTopologyEditRenderReusePolicy,
  DEFAULT_TOPOLOGY_EDIT_RENDER_REUSE_POLICY,
  TOPOLOGY_EDIT_RENDER_REUSE_POLICY_ERROR,
} from '../src/workspace/topology-edit/topology-edit-render-reuse-policy.js';
import { topologyEditGroupPickIdentityManifest } from '../src/workspace/topology-edit/topology-edit-render-instancing.js';

function groups() {
  return {
    sourceGroup: new THREE.Group(),
    draftGroup: new THREE.Group(),
    supportGroup: new THREE.Group(),
  };
}

function addRepeatedMeshes(group, count, options = {}) {
  const disposed = { geometries: 0, materials: 0 };
  const idOffset = Number(options.idOffset || 0);
  for (let index = 0; index < count; index += 1) {
    const identityIndex = idOffset + (options.duplicateIdentity ? index % (count / 2) : index);
    const geometry = new THREE.BoxGeometry(
      options.width || 10,
      options.height || 20,
      options.depth || 30,
      1,
      1,
      1,
    );
    const material = new THREE.MeshStandardMaterial({
      color: options.color || 0x38bdf8,
      roughness: 0.3,
      metalness: 0.2,
    });
    geometry.addEventListener('dispose', () => { disposed.geometries += 1; });
    material.addEventListener('dispose', () => { disposed.materials += 1; });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((idOffset + index) * 50, options.offsetY || 0, 0);
    mesh.userData = {
      canonicalId: `edge:${identityIndex}`,
      partRole: options.partRole || 'body',
      pickTarget: {
        modelRole: 'draft',
        objectKind: 'component',
        objectId: `edge:${identityIndex}`,
        workspaceEntityIds: [`entity:${identityIndex}`],
        sourcePaths: [`/entities/${identityIndex}`],
        partRole: options.partRole || 'body',
      },
    };
    group.add(mesh);
  }
  return disposed;
}

test('M005 pools equivalent resources and instances exact unique picks', () => {
  const sceneGroups = groups();
  const disposed = addRepeatedMeshes(sceneGroups.draftGroup, 8);
  const before = topologyEditGroupPickIdentityManifest(sceneGroups.draftGroup);
  const evidence = optimizeTopologyEditRenderGroups(sceneGroups);
  const after = topologyEditGroupPickIdentityManifest(sceneGroups.draftGroup);

  assert.deepEqual(after, before);
  assert.equal(evidence.layers.find((row) => row.role === 'draft').pooling.geometryReuseCount, 7);
  assert.equal(evidence.layers.find((row) => row.role === 'draft').pooling.materialReuseCount, 7);
  assert.equal(disposed.geometries, 7);
  assert.equal(disposed.materials, 7);
  assert.equal(sceneGroups.draftGroup.children.length, 1);
  const instanced = sceneGroups.draftGroup.children[0];
  assert.equal(instanced.isInstancedMesh, true);
  assert.equal(instanced.count, 8);
  assert.equal(instanced.userData.pickTable.length, 8);
  assert.equal(new Set(instanced.userData.pickTable.map((row) => row.objectId)).size, 8);
  assert.equal(evidence.totals.instanceCountAfter, 8);
  assert.equal(evidence.totals.exactPickIdentityCount, 8);
  assert.ok(evidence.totals.geometryCountAfter < evidence.totals.geometryCountBefore);
  assert.ok(evidence.totals.materialCountAfter < evidence.totals.materialCountBefore);
});

test('M005 partitions duplicate identities so fit-selection can visit every part', () => {
  const sceneGroups = groups();
  addRepeatedMeshes(sceneGroups.draftGroup, 8, { duplicateIdentity: true });
  const evidence = optimizeTopologyEditRenderGroups(sceneGroups);
  const instances = sceneGroups.draftGroup.children.filter((row) => row.isInstancedMesh);

  assert.equal(instances.length, 2);
  assert.deepEqual(instances.map((row) => row.count), [4, 4]);
  for (const instance of instances) {
    const ids = instance.userData.pickTable.map((row) => row.objectId);
    assert.equal(new Set(ids).size, ids.length);
  }
  assert.equal(evidence.totals.exactPickIdentityCount, 8);
});

test('M005 leaves unsupported path geometry as ordinary exact-pick meshes', () => {
  const sceneGroups = groups();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(10, 10, 0),
  ]);
  for (let index = 0; index < 4; index += 1) {
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 4, 2, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x0284c7 }),
    );
    mesh.position.x = index * 20;
    mesh.userData.pickTarget = {
      objectKind: 'component', objectId: `elbow:${index}`, modelRole: 'draft',
    };
    sceneGroups.draftGroup.add(mesh);
  }
  const evidence = optimizeTopologyEditRenderGroups(sceneGroups);
  assert.equal(sceneGroups.draftGroup.children.every((row) => !row.isInstancedMesh), true);
  assert.equal(evidence.layers.find((row) => row.role === 'draft').pooling.candidateMeshCount, 0);
  assert.equal(evidence.totals.exactPickIdentityCount, 4);
});

test('M005 rolls back all scene rewrites when a later instance batch fails', () => {
  const sceneGroups = groups();
  addRepeatedMeshes(sceneGroups.draftGroup, 4, { idOffset: 0, color: 0x38bdf8 });
  addRepeatedMeshes(sceneGroups.draftGroup, 4, { idOffset: 100, color: 0x22d3ee });
  const group = sceneGroups.draftGroup;
  const beforeManifest = topologyEditGroupPickIdentityManifest(group);
  const beforeObjects = [...group.children];
  const originalAdd = group.add;
  let instancedAddCount = 0;
  group.add = function addWithFailure(...objects) {
    if (objects.some((object) => object.isInstancedMesh)) {
      instancedAddCount += 1;
      if (instancedAddCount === 2) throw new Error('OWNER_TEST_SECOND_BATCH_FAILURE');
    }
    return originalAdd.apply(this, objects);
  };

  assert.throws(
    () => optimizeTopologyEditRenderGroups(sceneGroups),
    /OWNER_TEST_SECOND_BATCH_FAILURE/u,
  );
  group.add = originalAdd;
  assert.deepEqual(topologyEditGroupPickIdentityManifest(group), beforeManifest);
  assert.equal(group.children.some((object) => object.isInstancedMesh), false);
  assert.equal(group.children.length, beforeObjects.length);
  assert.deepEqual(group.children, beforeObjects);
  assert.ok(beforeObjects.every((object) => object.parent === group));
});

test('M005 fails closed for invalid policy and eligible meshes without exact identity', () => {
  assert.throws(() => createTopologyEditRenderReusePolicy({
    ...DEFAULT_TOPOLOGY_EDIT_RENDER_REUSE_POLICY,
    minimumInstanceCount: 1,
  }), (error) => (
    error.code === TOPOLOGY_EDIT_RENDER_REUSE_POLICY_ERROR
    && error.detailCode === 'MINIMUM_INSTANCE_COUNT_INVALID'
  ));

  const sceneGroups = groups();
  sceneGroups.draftGroup.add(new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  ));
  assert.throws(() => optimizeTopologyEditRenderGroups(sceneGroups), (error) => (
    error.code === 'TOPOLOGY_EDIT_RENDER_RESOURCE_INVALID'
    && error.detailCode === 'PICK_TARGET_MISSING'
  ));
});

test('M005 backend and browser harness expose genuine optimization evidence', async () => {
  const backend = await readFile(
    new URL('../src/workspace/topology-edit/topology-edit-navigation-hud-viewport-backend.js', import.meta.url),
    'utf8',
  );
  const harness = await readFile(
    new URL('./topology-edit-wave5-browser-harness.js', import.meta.url),
    'utf8',
  );
  assert.match(backend, /renderOptimizationEvidence = null;\s*super\.renderSession/u);
  assert.match(backend, /optimizeTopologyEditRenderGroups\(this\.groups\)/u);
  assert.match(backend, /basisQuaternion: engineeringBasisQuaternion\(\)/u);
  assert.match(harness, /optimizerProbeCount/u);
  assert.match(harness, /M005_INSTANCE_CONVERSION_MISSING/u);
  assert.match(harness, /M005_GEOMETRY_POOLING_MISSING/u);
});
