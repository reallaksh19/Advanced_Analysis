import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { materializeTopologyEditPrimitive } from '../src/workspace/topology-edit/topology-edit-primitive-geometry.js';
import { materializeTopologyEditSupportOverlay } from '../src/workspace/topology-edit/topology-edit-support-glyph-geometry.js';
import { optimizeTopologyEditRenderGroups } from '../src/workspace/topology-edit/topology-edit-render-optimizer.js';
import { topologyEditGroupPickIdentityManifest } from '../src/workspace/topology-edit/topology-edit-render-instancing.js';

function groups() {
  return {
    sourceGroup: new THREE.Group(),
    draftGroup: new THREE.Group(),
    supportGroup: new THREE.Group(),
  };
}

test('M005 instances repeated geometry from the actual M002 materializer', () => {
  const sceneGroups = groups();
  for (let index = 0; index < 4; index += 1) {
    const objectId = `edge:pipe-${index}`;
    const result = materializeTopologyEditPrimitive({
      primitiveId: `primitive:${index}`,
      canonicalEntityId: objectId,
      partRole: 'body',
      kind: 'PIPE_CYLINDER',
      parameters: {
        start: { x: index * 200, y: 0, z: 0 },
        end: { x: (index * 200) + 100, y: 0, z: 0 },
        outsideDiameterMm: 20,
      },
    }, {
      material: new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3, metalness: 0.2 }),
      radialSegments: 16,
      markerSize: 10,
      pickUserData: {
        canonicalId: objectId,
        type: 'PIPE_CYLINDER',
        pickTarget: {
          modelRole: 'draft',
          objectKind: 'component',
          objectId,
          sourcePaths: [`/pipes/${index}`],
          workspaceEntityIds: [`entity:pipe-${index}`],
          partRole: 'body',
        },
      },
    });
    sceneGroups.draftGroup.add(result.object);
  }

  const before = topologyEditGroupPickIdentityManifest(sceneGroups.draftGroup);
  const evidence = optimizeTopologyEditRenderGroups(sceneGroups);
  const after = topologyEditGroupPickIdentityManifest(sceneGroups.draftGroup);
  assert.deepEqual(after, before);
  assert.equal(evidence.layers.find((row) => row.role === 'draft').instancing.newInstanceCount, 4);
  assert.equal(sceneGroups.draftGroup.children.some((row) => row.isInstancedMesh), true);
});

test('M005 instances repeated parts from the actual M003 support glyph materializer', () => {
  const sceneGroups = groups();
  for (let index = 0; index < 4; index += 1) {
    const supportId = `support:${index}`;
    const restraintId = `restraint:${index}`;
    const origin = { x: index * 200, y: 0, z: 0 };
    const result = materializeTopologyEditSupportOverlay({
      supportId,
      hostEntityId: `edge:${index}`,
      origin,
      status: 'RESOLVED',
      diagnostics: [],
      restraints: [{
        restraintId,
        family: 'GUIDE',
        direction: { x: 0, y: 1, z: 0 },
        positiveGapMm: 4,
        negativeGapMm: 4,
        positiveContactPoint: { x: origin.x, y: 54, z: 0 },
        negativeContactPoint: { x: origin.x, y: -54, z: 0 },
        status: 'RESOLVED',
        sourcePaths: [`/supports/${index}`],
        diagnostics: [],
      }],
    }, { markerSize: 24, radialSegments: 16 });
    sceneGroups.supportGroup.add(result.object);
  }

  const before = topologyEditGroupPickIdentityManifest(sceneGroups.supportGroup);
  const evidence = optimizeTopologyEditRenderGroups(sceneGroups);
  const after = topologyEditGroupPickIdentityManifest(sceneGroups.supportGroup);
  assert.deepEqual(after, before);
  const supportEvidence = evidence.layers.find((row) => row.role === 'supports');
  assert.ok(supportEvidence.pooling.geometryReuseCount > 0);
  assert.ok(supportEvidence.instancing.newInstanceCount >= 4);
  assert.ok(sceneGroups.supportGroup.children.some((row) => row.isInstancedMesh));
});
