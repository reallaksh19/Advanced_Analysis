import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  assertTopologyEditSearchIndex,
  buildTopologyEditSearchIndex,
  queryTopologyEditSearch,
} from '../src/workspace/viewport-productivity/topology-edit-search-index.js';
import {
  focusTopologyEditCanonicalIds,
} from '../src/workspace/viewport-productivity/topology-edit-scene-focus.js';

function canonical() {
  return {
    schema: 'topology-edit-canonical-topology/v1',
    canonicalTopologyHash: 'canonical:search',
    nodes: [
      { id: 'node:n1', position: { x: 0, y: 0, z: 0 }, portKeys: ['PIPE-100:start'] },
      { id: 'node:n2', position: { x: 100, y: 0, z: 0 }, portKeys: ['PIPE-100:end'] },
      { id: 'node:n3', position: { x: 0, y: 100, z: 0 }, portKeys: ['PIPE-200:end'] },
    ],
    edges: [
      {
        id: 'edge:e1', componentKey: 'PIPE-100', entityType: 'PIPE',
        fromNodeId: 'node:n1', toNodeId: 'node:n2',
        sourcePath: '$.branches[0].children[1]', branchIds: ['BR-01'],
        lineId: '10-P-1001', meshName: 'forbidden-nearby-name',
      },
      {
        id: 'edge:e2', componentKey: 'PIPE-200', entityType: 'PIPE',
        fromNodeId: 'node:n1', toNodeId: 'node:n3',
        sourcePath: '$.branches[0].children[2]', branchIds: ['BR-01'],
        lineId: '10-P-1002',
      },
    ],
    junctions: [{
      id: 'junction:j1', kind: 'TEE', nodeId: 'node:n1',
      participatingEdgeIds: ['edge:e1', 'edge:e2'],
    }],
    supports: [{
      id: 'support:s1', entityId: 'SUP-100', nodeId: 'node:n2',
      family: 'GUIDE', sourcePaths: ['$.supports[0]'],
      restraints: [{ id: 'restraint:r1', family: 'LINE_STOP', directionToken: '+X' }],
    }],
    boundaries: [],
    rigids: [],
    bends: [],
  };
}

function index(topology = canonical()) {
  return buildTopologyEditSearchIndex({
    canonicalTopology: topology,
    diagnostics: [{
      code: 'DIMENSION_CONFLICT',
      canonicalId: 'edge:e1',
      message: 'Explicit diameter evidence conflicts.',
    }],
  });
}

test('exact canonical identity outranks every other searchable field', () => {
  const results = queryTopologyEditSearch(index(), 'edge:e1');
  assert.equal(results[0].canonicalId, 'edge:e1');
  assert.equal(results[0].score, 0);
  assert.equal(results[0].exactField, 'CANONICAL_ID');
});

test('workspace entity and source-path searches resolve exact canonical objects', () => {
  const byEntity = queryTopologyEditSearch(index(), 'PIPE-100');
  assert.equal(byEntity[0].canonicalId, 'edge:e1');
  assert.equal(byEntity[0].exactField, 'WORKSPACE_ENTITY_ID');
  const byPath = queryTopologyEditSearch(index(), '$.branches[0].children[2]');
  assert.equal(byPath[0].canonicalId, 'edge:e2');
  assert.equal(byPath[0].exactField, 'SOURCE_PATH');
});

test('family, line, branch, support, and diagnostic metadata are searchable', () => {
  assert.equal(queryTopologyEditSearch(index(), 'guide')[0].canonicalId, 'support:s1');
  assert.equal(queryTopologyEditSearch(index(), 'restraint:r1')[0].canonicalId, 'support:s1');
  assert.equal(queryTopologyEditSearch(index(), 'line_stop')[0].canonicalId, 'support:s1');
  assert.equal(queryTopologyEditSearch(index(), '10-p-1002')[0].canonicalId, 'edge:e2');
  assert.equal(queryTopologyEditSearch(index(), 'br-01').length, 2);
  assert.equal(queryTopologyEditSearch(index(), 'dimension_conflict')[0].canonicalId, 'edge:e1');
});

test('identical visual geometry retains distinct deterministic canonical results', () => {
  const results = queryTopologyEditSearch(index(), 'pipe');
  assert.deepEqual(
    results.filter((row) => row.objectKind === 'edge').map((row) => row.canonicalId),
    ['edge:e1', 'edge:e2'],
  );
});

test('canonical collection reordering does not change index or result order', () => {
  const left = index();
  const reordered = canonical();
  reordered.nodes.reverse();
  reordered.edges.reverse();
  const right = index(reordered);
  assert.equal(left.searchIndexHash, right.searchIndexHash);
  assert.deepEqual(
    queryTopologyEditSearch(left, 'pipe').map((row) => row.canonicalId),
    queryTopologyEditSearch(right, 'pipe').map((row) => row.canonicalId),
  );
});

test('mesh labels and proximity-like fields are not accepted as identity evidence', () => {
  assert.deepEqual(queryTopologyEditSearch(index(), 'forbidden-nearby-name'), []);
  assert.deepEqual(queryTopologyEditSearch(index(), '0.0001'), []);
});

test('tampered search indexes fail closed', () => {
  const current = index();
  assert.throws(
    () => assertTopologyEditSearchIndex({ ...current, documentCount: 999 }),
    /hash mismatch/,
  );
});

test('renderer focus uses exact canonical pick identities', () => {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(1);
  const material = new THREE.MeshBasicMaterial();
  const left = new THREE.Mesh(geometry, material);
  left.position.set(-100, 0, 0);
  left.userData.pickTarget = { objectId: 'node:left' };
  const right = new THREE.Mesh(geometry.clone(), material.clone());
  right.position.set(100, 0, 0);
  right.userData.pickTarget = { objectId: 'node:right' };
  group.add(left, right);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
  camera.position.set(0, 0, 1000);
  const result = focusTopologyEditCanonicalIds({
    groups: { draftGroup: group },
    camera,
    canonicalIds: ['node:right'],
  });
  assert.deepEqual(result.foundIds, ['node:right']);
  assert.equal(result.status, 'FOCUSED');
  assert.ok(camera.position.x > 0);
});

test('search panel exposes exact identities and forwards Shift activation', async () => {
  const source = await readFile(
    new URL('../src/workspace/viewport-productivity/topology-edit-search-panel.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /data\.searchCanonicalId = result\.canonicalId/);
  assert.match(source, /data\.searchObjectKind = result\.objectKind/);
  assert.match(source, /additive: event\.shiftKey/);
  assert.match(source, /Shift-activate a node to add it to the current selection/);
});

test('production search activation remains read-only and supports additive selection', async () => {
  const source = await readFile(
    new URL('../src/workspace/topology-edit-3d-search-controller.js', import.meta.url),
    'utf8',
  );
  const method = source.match(
    /activateSearchResult\(result, options = \{\}\) \{([\s\S]*?)\n  \}\n\n  updateReviewEvidence/,
  );
  assert.ok(method);
  assert.match(method[1], /focusTopologyEditCanonicalIds/);
  assert.match(method[1], /Boolean\(options\.additive\)/);
  assert.match(method[1], /topologyEditSelectionDescription/);
  assert.doesNotMatch(method[1], /\.execute\(|commitDraft|acceptAutofix|WorkspaceState/);
});

test('search controller publishes read-only exact-head review metadata', async () => {
  const source = await readFile(
    new URL('../src/workspace/topology-edit-3d-search-controller.js', import.meta.url),
    'utf8',
  );
  for (const key of [
    'topologyEditCanonicalHash',
    'topologyEditSourceHash',
    'topologyEditJournalHash',
    'topologyEditSessionVersion',
    'topologyEditActiveCommandCount',
    'topologyEditPreviewHash',
    'topologyEditPreviewCertificationHash',
  ]) assert.match(source, new RegExp(key));
  assert.doesNotMatch(source, /WorkspaceState\.|localStorage\.|sessionStorage\./);
});

test('load-calc 3D tab consumes a controller chain that retains search', async () => {
  const source = await readFile(
    new URL('../src/workspace/load-calc-consumer-controller.js', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /import\('\.\/topology-edit-3d-(?:dossier-intake|review-response)-controller\.js'\)/,
  );
});
