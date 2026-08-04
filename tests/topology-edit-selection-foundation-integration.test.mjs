import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('production controller owns one Zustand selection bridge', async () => {
  const controller = await source('src/workspace/topology-edit-3d-professional-controller.js');
  assert.match(controller, /createTopologyEditEditorStore/);
  assert.match(controller, /TopologyEditSelectionCoordinator/);
  assert.match(controller, /Object\.defineProperty\(this, 'selection'/);
  assert.match(controller, /handleViewportSelection\(pick, event\)/);
  assert.match(controller, /dataset\.topologyEditSelectionRevision/);
  assert.match(controller, /WorkspaceState\.getSnapshot\(\)/);
  assert.match(controller, /topologyEditDatasetSessionVersion/);
});

test('search dispatches through the canonical selection coordinator', async () => {
  const search = await source('src/workspace/topology-edit-3d-search-controller.js');
  assert.match(search, /this\.selectionCoordinator\.requestCanonical/);
  assert.match(search, /additive \? 'ADD' : 'REPLACE'/);
});

test('tree keeps virtualization and publishes governed selection requests', async () => {
  const events = await source('src/workspace/tree-panel-events.js');
  const panel = await source('src/workspace/tree-panel.js');
  const tree = await source('src/workspace/tree-panel-tree.js');
  assert.match(events, /TOPOLOGY_EDIT_SELECTION_EVENTS\.REQUESTED/);
  assert.match(events, /createTopologyEditSelectionRequest/);
  assert.match(events, /visibleEntityRange/);
  assert.match(panel, /applyTopologyEditSelection\(payload\)/);
  assert.doesNotMatch(
    panel,
    /applyTopologyEditSelection\(payload\)\s*\{\s*if \(!this\.topologyEditSelectionActive\) return;/,
  );
  assert.match(tree, /const OVERSCAN = 10/);
  assert.match(tree, /replaceChildren\(fragment\)/);
  assert.match(tree, /aria-selected/);
});

test('editor store contains UI slices but no canonical topology or journal authority', async () => {
  const store = await source(
    'src/workspace/topology-edit/editor-state/topology-edit-editor-store.js',
  );
  assert.match(store, /interaction:/);
  assert.match(store, /snapping:/);
  assert.match(store, /componentHud:/);
  assert.match(store, /preferences:/);
  assert.doesNotMatch(store, /canonicalTopology\s*:/);
  assert.doesNotMatch(store, /commandJournal\s*:/);
  assert.doesNotMatch(store, /undoStack\s*:/);
  assert.doesNotMatch(store, /THREE\./);
});

test('vendored Zustand core is local and framework-contained', async () => {
  const vendor = await source('src/vendor/zustand-vanilla.js');
  assert.match(vendor, /compatible with Zustand 5\.0\.14/);
  assert.match(vendor, /export const createStore/);
  assert.doesNotMatch(vendor, /from ['"]react|useState\(|useEffect\(/);
});
