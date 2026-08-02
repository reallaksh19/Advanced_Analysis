import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTopologyEditPick } from '../src/workspace/topology-edit/topology-edit-picking-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relativePath) => readFile(path.join(ROOT, relativePath), 'utf8');

test('certified controller production-consumes Wave 2 visual authority', async () => {
  const text = await source('src/workspace/topology-edit-3d-view-controller.js');
  assert.match(text, /TopologyEditCertifiedSession/);
  assert.match(text, /buildTopologyEditVisualSession/);
  assert.match(text, /createDimensionAuthority/);
  assert.match(text, /visualModelHash: this\.visualModelHash/);
  assert.match(text, /statusElement\.title = draftVisual\.policySummary/);
  assert.doesNotMatch(text, /commitDraftToWorkspace/);
  assert.doesNotMatch(text, /TopologyEditAutofixController/);
  assert.doesNotMatch(text, /Date\.now/);
});

test('visual session requires explicit dimension authority', async () => {
  const text = await source('src/workspace/topology-edit/topology-edit-visual-session.js');
  assert.match(text, /requires explicit dimension authority/);
  assert.doesNotMatch(text, /dimensionAuthority\s*=\s*createDimensionAuthority/);
});

test('viewport renders support and fitting projections without radius fallback', async () => {
  const text = await source('src/workspace/topology-edit/topology-edit-viewport-backend.js');
  assert.match(text, /model\.supports/);
  assert.match(text, /segment\.points/);
  assert.match(text, /endRadiusMm/);
  assert.doesNotMatch(text, /fallbackMarkerSize\s*\*\s*0\.6/);
  assert.doesNotMatch(text, /primitive-hit/);
});

test('restraint pick returns complete canonical crosswalk', () => {
  const pick = createTopologyEditPick({
    objectKind: 'restraint',
    objectId: 'restraint:1',
    supportId: 'support:1',
    restraintId: 'restraint:1',
    restraintFamily: 'GUIDE',
    sourcePaths: ['source/1'],
    workspaceEntityIds: ['entity:1'],
    point: { x: 1, y: 2, z: 3 },
  });
  assert.equal(pick.supportId, 'support:1');
  assert.equal(pick.restraintId, 'restraint:1');
  assert.equal(pick.restraintFamily, 'GUIDE');
  assert.deepEqual(pick.sourcePaths, ['source/1']);
  assert.deepEqual(pick.workspaceEntityIds, ['entity:1']);
});

test('render orchestrator delegates rather than owning geometry algorithms', async () => {
  const text = await source('src/workspace/topology-edit/topology-edit-render-model.js');
  assert.match(text, /deriveVisualComponents/);
  assert.match(text, /projectVisualGeometryToViewport/);
  assert.doesNotMatch(text, /Math\.acos/);
  assert.doesNotMatch(text, /crossProduct/);
});
