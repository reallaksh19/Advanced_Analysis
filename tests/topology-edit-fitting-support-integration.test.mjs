import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTopologyEditPick } from '../src/workspace/topology-edit/topology-edit-picking-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relativePath) => readFile(path.join(ROOT, relativePath), 'utf8');

test('certified controller retains Wave 1 authority and hands off render evidence', async () => {
  const text = await source('src/workspace/topology-edit-3d-view-controller.js');
  assert.match(text, /TopologyEditCertifiedSession/);
  assert.match(text, /TOPOLOGY_EDIT_COMMAND_ACTIONS/);
  assert.match(text, /createDimensionAuthority/);
  assert.match(text, /workspaceDataset: this\.workspaceDataset/);
  assert.match(text, /dimensionAuthority: this\.dimensionAuthority/);
  assert.match(text, /visualModelHash: this\.visualModelHash/);
  for (const prohibited of [
    'commitDraftToWorkspace',
    'applyCanonicalTopologyToWorkspaceEntities',
    'TopologyEditAutofixController',
    'Date.now',
    'TopologyEditCommandJournal',
  ]) assert.equal(text.includes(prohibited), false);
});

test('render packet production-consumes geometry and support authority', async () => {
  const text = await source('src/workspace/topology-edit/topology-edit-render-packet.js');
  assert.match(text, /deriveTopologyVisualGeometry/);
  assert.match(text, /deriveAllSupportRestraintGeometry/);
  assert.match(text, /buildTopologyEditComponentEvidence/);
  assert.match(text, /requires explicit dimension authority/);
});

test('viewport renders support projection and rejects hidden radius fallback', async () => {
  const text = await source('src/workspace/topology-edit/topology-edit-viewport-backend.js');
  assert.match(text, /model\.supports/);
  assert.match(text, /segment\.points/);
  assert.match(text, /endRadiusMm/);
  assert.doesNotMatch(text, /fallbackMarkerSize\s*\*\s*0\.6/);
  assert.doesNotMatch(text, /primitive-hit/);
});

test('restraint pick returns complete canonical crosswalk', () => {
  const pick = createTopologyEditPick({
    objectKind: 'restraint', objectId: 'restraint:1', supportId: 'support:1',
    restraintId: 'restraint:1', restraintFamily: 'GUIDE', sourcePaths: ['source/1'],
    workspaceEntityIds: ['entity:1'], point: { x: 1, y: 2, z: 3 },
  });
  assert.equal(pick.supportId, 'support:1');
  assert.equal(pick.restraintId, 'restraint:1');
  assert.equal(pick.restraintFamily, 'GUIDE');
  assert.deepEqual(pick.workspaceEntityIds, ['entity:1']);
});

test('bounded renderer/support modules remain below 300 physical lines', async () => {
  const files = [
    'src/workspace/topology-edit/topology-edit-render-packet.js',
    'src/workspace/topology-edit/support-restraint-family.js',
    'src/workspace/topology-edit/topology-edit-viewport-backend.js',
    'src/workspace/topology-edit/topology-edit-picking-contract.js',
  ];
  for (const file of files) {
    const text = await source(file);
    assert.ok(text.split(/\r?\n/).length <= 300, `${file} exceeds 300 physical lines`);
  }
});
