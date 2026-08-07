import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTopologyEditEditorStore,
} from '../src/workspace/topology-edit/editor-state/topology-edit-editor-store.js';
import {
  TOPOLOGY_EDIT_SELECTION_SOURCES,
  normalizeTopologyEditSelectionSource,
} from '../src/workspace/topology-edit/editor-state/topology-edit-selection-contract.js';

function store() {
  return createTopologyEditEditorStore({
    dataset: {
      sourceHash: 'source-a',
      canonicalHash: 'canonical-a',
      sessionVersion: 7,
    },
  });
}

test('shared canonical selection contract authorizes Table origin explicitly', () => {
  assert.ok(TOPOLOGY_EDIT_SELECTION_SOURCES.includes('table'));
  assert.equal(normalizeTopologyEditSelectionSource('TABLE'), 'table');
});

test('production editor store accepts exact Table canonical selection and retains origin', () => {
  const editorStore = store();
  const first = editorStore.getState().actions.replaceSelection(
    ['edge:E-001'],
    'table',
    { primaryId: 'edge:E-001', anchorId: 'edge:E-001' },
  );
  assert.equal(first.disposition, 'CHANGED');
  assert.deepEqual(first.selection.canonicalIds, ['edge:E-001']);
  assert.equal(first.selection.primaryId, 'edge:E-001');
  assert.equal(first.selection.anchorId, 'edge:E-001');
  assert.equal(first.selection.source, 'table');
  assert.equal(first.selection.revision, 1);

  const echo = editorStore.getState().actions.replaceSelection(
    ['edge:E-001'],
    'table',
    { primaryId: 'edge:E-001', anchorId: 'edge:E-001' },
  );
  assert.equal(echo.disposition, 'UNCHANGED');
  assert.equal(echo.selection.revision, 1);
  assert.equal(editorStore.getState().selection.selectionHash, echo.selection.selectionHash);
});

test('Table source remains compatible with stale request custody', () => {
  const editorStore = store();
  const result = editorStore.getState().actions.applySelectionRequest({
    action: 'REPLACE',
    canonicalIds: ['edge:E-002'],
    primaryId: 'edge:E-002',
    anchorId: 'edge:E-002',
    source: 'table',
    expectedDatasetSessionVersion: 7,
    expectedCanonicalHash: 'canonical-a',
    expectedSelectionRevision: 0,
  });
  assert.equal(result.disposition, 'CHANGED');
  assert.equal(result.selection.source, 'table');

  const stale = editorStore.getState().actions.applySelectionRequest({
    action: 'REPLACE',
    canonicalIds: ['edge:E-003'],
    source: 'table',
    expectedDatasetSessionVersion: 7,
    expectedCanonicalHash: 'canonical-a',
    expectedSelectionRevision: 0,
  });
  assert.equal(stale.disposition, 'STALE');
  assert.deepEqual(stale.staleFields, ['selectionRevision']);
  assert.deepEqual(editorStore.getState().selection.canonicalIds, ['edge:E-002']);
});
