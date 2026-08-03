import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { optimizeTopologyEditRenderGroups } from '../src/workspace/topology-edit/topology-edit-render-optimizer.js';
import { topologyEditGroupPickIdentityManifest } from '../src/workspace/topology-edit/topology-edit-render-instancing.js';

test('M005 preserves support pick targets byte-for-byte and retains part roles separately', () => {
  const groups = {
    sourceGroup: new THREE.Group(),
    draftGroup: new THREE.Group(),
    supportGroup: new THREE.Group(),
  };
  for (let index = 0; index < 4; index += 1) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(12, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x22d3ee }),
    );
    mesh.position.x = index * 20;
    mesh.userData = {
      partRole: 'guide-rail-positive',
      pickTarget: {
        objectKind: 'restraint',
        objectId: `restraint:${index}`,
        supportId: `support:${index}`,
        restraintId: `restraint:${index}`,
        restraintFamily: 'GUIDE',
        sourcePaths: [`/supports/${index}`],
      },
    };
    groups.supportGroup.add(mesh);
  }

  const before = topologyEditGroupPickIdentityManifest(groups.supportGroup);
  optimizeTopologyEditRenderGroups(groups);
  const after = topologyEditGroupPickIdentityManifest(groups.supportGroup);
  assert.deepEqual(after, before);

  const instanced = groups.supportGroup.children.find((row) => row.isInstancedMesh);
  assert.ok(instanced);
  assert.equal(instanced.userData.pickTable.every((target) => !('partRole' in target)), true);
  assert.deepEqual(
    instanced.userData.partRoleTable,
    ['guide-rail-positive', 'guide-rail-positive', 'guide-rail-positive', 'guide-rail-positive'],
  );
});
