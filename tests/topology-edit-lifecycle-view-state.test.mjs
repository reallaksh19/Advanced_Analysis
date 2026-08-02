import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  restoreTopologyEditViewSelection,
} from '../src/workspace/topology-edit-3d-view-controller.js';

test('persisted node, edge, and empty selections rehydrate deterministically', () => {
  const nodes = restoreTopologyEditViewSelection({
    nodeIds: ['node:a', 'node:b'],
    edgeId: null,
  });
  assert.deepEqual(nodes, { nodeIds: ['node:a', 'node:b'], edgeId: null });
  assert.equal(Object.isFrozen(nodes), true);
  assert.equal(Object.isFrozen(nodes.nodeIds), true);

  assert.deepEqual(
    restoreTopologyEditViewSelection({ nodeIds: [], edgeId: 'edge:e1' }),
    { nodeIds: [], edgeId: 'edge:e1' },
  );
  assert.deepEqual(
    restoreTopologyEditViewSelection({ nodeIds: [], edgeId: null }),
    { nodeIds: [], edgeId: null },
  );
});

test('malformed, ambiguous, duplicate, and over-wide selections fail closed', () => {
  for (const value of [
    null,
    [],
    {},
    { nodeIds: 'node:a', edgeId: null },
    { nodeIds: ['node:a', 'node:b', 'node:c'], edgeId: null },
    { nodeIds: ['node:a', 'node:a'], edgeId: null },
    { nodeIds: ['edge:e1'], edgeId: null },
    { nodeIds: ['node:a'], edgeId: 'edge:e1' },
    { nodeIds: [], edgeId: 'node:a' },
    { nodeIds: ['node:'], edgeId: null },
    { nodeIds: ['node:a b'], edgeId: null },
    { nodeIds: [' node:a'], edgeId: null },
    { nodeIds: [{ toString: () => 'node:a' }], edgeId: null },
    { nodeIds: [], edgeId: 'edge:' },
    { nodeIds: [], edgeId: 'edge:e 1' },
    { nodeIds: [], edgeId: { toString: () => 'edge:e1' } },
  ]) assert.equal(restoreTopologyEditViewSelection(value), null);
});

test('production lifecycle restores the plain selection contract and publishes read-only evidence', async () => {
  const source = await readFile(
    new URL('../src/workspace/topology-edit-3d-view-controller.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /restoreTopologyEditViewSelection\(viewState\.selection\)/);
  assert.doesNotMatch(source, /viewState\.selection\?\.schema/);
  assert.match(source, /CANONICAL_NODE_ID_PATTERN/);
  assert.match(source, /CANONICAL_EDGE_ID_PATTERN/);
  for (const key of [
    'topologyEditDraftPackageHash',
    'topologyEditExportSealedHash',
    'topologyEditCommitReceiptHash',
    'topologyEditCommitDisposition',
  ]) assert.match(source, new RegExp(key));
  assert.doesNotMatch(
    source.match(/updateLifecycleEvidence\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '',
    /setItem|removeItem|execute|commitPrepared|WorkspaceState/,
  );
});
