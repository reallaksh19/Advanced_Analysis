import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAutofixPolicy } from '../src/workspace/topology-edit-3d-view-controller.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relativePath) => readFile(path.join(ROOT, relativePath), 'utf8');

function canonical() {
  return {
    edges: [
      { id: 'edge:a', componentKey: 'A' },
      { id: 'edge:b', componentKey: 'B' },
      { id: 'edge:c', componentKey: 'C' },
    ],
  };
}

function entity(entityId, attributes) {
  return { entityId, properties: { sourceAttributes: attributes } };
}

test('autofix policy accepts only unique explicit engineering evidence', () => {
  const issues = [
    { id: 'issue:bend', kind: 'RIGHT_ANGLE_WITHOUT_BEND', nodeIds: ['node:turn'], edgeIds: ['edge:a', 'edge:b'] },
    { id: 'issue:junction', kind: 'MULTIWAY_WITHOUT_JUNCTION', nodeIds: ['node:j'], edgeIds: ['edge:a', 'edge:b', 'edge:c'] },
    { id: 'issue:trim', kind: 'OVERLAPPING_ELEMENTS', nodeIds: [], edgeIds: ['edge:a', 'edge:b'] },
  ];
  const dataset = {
    entities: [
      entity('A', { BEND_RADIUS: 150, JUNCTION_TYPE: 'TEE', TOPOLOGY_TRIM_ENDPOINT: 'FROM', TOPOLOGY_TRIM_FRACTION: 0.2 }),
      entity('B', { CENTERLINE_RADIUS: 150, FITTING_TYPE: 'TEE' }),
      entity('C', { JUNCTION_TYPE: 'TEE' }),
    ],
  };
  const policy = buildAutofixPolicy(dataset, canonical(), issues);
  assert.equal(policy.bendRadiusByNodeId['node:turn'], 150);
  assert.equal(policy.junctionTypeByNodeId['node:j'], 'TEE');
  assert.deepEqual(policy.trimPlanByIssueId['issue:trim'], {
    edgeId: 'edge:a', endpoint: 'FROM', fraction: 0.2,
  });

  dataset.entities[1].properties.sourceAttributes.CENTERLINE_RADIUS = 200;
  dataset.entities[2].properties.sourceAttributes.JUNCTION_TYPE = 'OLET';
  const conflicting = buildAutofixPolicy(dataset, canonical(), issues);
  assert.equal(conflicting.bendRadiusByNodeId['node:turn'], undefined);
  assert.equal(conflicting.junctionTypeByNodeId['node:j'], undefined);
});

test('production controller exposes preview, accept, and cancel without workspace mutation', async () => {
  const text = await source('src/workspace/topology-edit-3d-view-controller.js');
  for (const token of [
    'data-autofix-suggestion',
    'previewAutofix(',
    'acceptAutofix(',
    'cancelAutofix(',
    'buildAutofixPolicy(',
    'source-backed fix suggestion',
  ]) assert.ok(text.includes(token), `missing ${token}`);
  for (const prohibited of [
    'applyCanonicalTopologyToWorkspaceEntities',
    'commitDraftToWorkspace',
    'WorkspaceState.update',
    'WorkspaceState.replace',
  ]) assert.equal(text.includes(prohibited), false, `controller must not use ${prohibited}`);
  assert.ok(text.match(/cancelAutofix\(true\)[\s\S]*session\.undo/));
  assert.ok(text.match(/cancelAutofix\(true\)[\s\S]*session\.redo/));
});

test('certified session is the only production autofix acceptance bridge', async () => {
  const controller = await source('src/workspace/topology-edit-3d-view-controller.js');
  const session = await source('src/workspace/topology-edit/topology-edit-certified-session.js');
  assert.equal(controller.includes('TopologyEditAutofixController'), false);
  assert.ok(session.includes('TopologyEditAutofixController'));
  assert.ok(session.includes('previewAutofix(suggestion)'));
  assert.ok(session.includes('acceptAutofix(preview)'));
});

test('ghost rendering is disposable, non-pickable, and inside the retained size boundary', async () => {
  const text = await source('src/workspace/topology-edit/topology-edit-viewport-backend.js');
  const lines = text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
  assert.ok(lines <= 300, `viewport has ${lines} physical lines`);
  for (const token of [
    'ghostGroup.userData.nonPickable = true',
    'renderGhost(ghost',
    'clearGhost()',
    'hasNonPickableAncestor',
    'depthWrite: opacity >= 1',
  ]) assert.ok(text.includes(token), `missing ${token}`);
  assert.ok(text.match(/renderSession\(model\)[\s\S]*clearGhost\(\)[\s\S]*renderGhost\(model\.ghost/));
});
