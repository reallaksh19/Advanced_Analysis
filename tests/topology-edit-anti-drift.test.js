/**
 * Topology Edit Draft — bounded phase-one smoke contracts.
 *
 * These checks preserve the currently delivered shell. They do not certify
 * full source parity, command authority, support semantics, persistence,
 * commit/rollback, browser qualification, or large-model performance.
 */

import assert from 'node:assert';
import { TOPOLOGY_EDIT_BASELINE_MANIFEST } from '../src/workspace/topology-edit/topology-edit-baseline-manifest.js';
import { createTopologyEditRenderModel } from '../src/workspace/topology-edit/topology-edit-render-model.js';
import { createTopologyEditPick } from '../src/workspace/topology-edit/topology-edit-picking-contract.js';
import { TopologyEditCommandJournal } from '../src/workspace/topology-edit/topology-edit-command-journal.js';
import { TopologyEditAutofixGrouper } from '../src/workspace/topology-edit/topology-edit-autofix-grouper.js';
import { buildSealedAuditPackage } from '../src/workspace/topology-edit/topology-edit-export.js';

console.log('Running bounded Topology Edit phase-one smoke contracts...');

assert.strictEqual(
  TOPOLOGY_EDIT_BASELINE_MANIFEST.sourceCommit,
  'c20bb037566d52ba5b789712594b754a5fb94651',
);
assert.strictEqual(
  TOPOLOGY_EDIT_BASELINE_MANIFEST.targetCommit,
  '5b0dad3d1e5566a73d8e2f37420269476eaf15e9',
);

const renderModel = createTopologyEditRenderModel({ documentId: 'doc-123' });
assert.strictEqual(renderModel.documentId, 'doc-123');
assert.strictEqual(renderModel.units, 'MM');
assert.strictEqual(renderModel.visibility.source, true);

const pick = createTopologyEditPick({
  objectId: 'node-101',
  point: { x: 5, y: 10, z: 15 },
});
assert.strictEqual(pick.objectId, 'node-101');
assert.strictEqual(pick.point.x, 5);

const journal = new TopologyEditCommandJournal();
journal.applyCommand({
  type: 'MOVE_NODE',
  payload: { nodeId: 'N101', delta: { x: 1, y: 0, z: 0 } },
});
assert.strictEqual(journal.getActiveJournal().length, 1);
assert.strictEqual(journal.canUndo(), true);
journal.undo();
assert.strictEqual(journal.getActiveJournal().length, 0);
journal.redo();
assert.strictEqual(journal.getActiveJournal().length, 1);

const mockIssues = [
  {
    id: '1',
    kind: 'OVERLAPPING_NODES',
    distance: 2.4,
    node1: 'N101',
    node2: 'N100',
  },
  {
    id: '2',
    kind: 'OVERLAPPING_NODES',
    distance: 14.5,
    node1: 'N210',
    node2: 'N208',
  },
  {
    id: '3',
    kind: 'ZERO_LENGTH_ELEMENT',
    distance: 0,
    elementId: 'P109',
  },
];

const grouped = TopologyEditAutofixGrouper.groupIssues(
  mockIssues,
  6,
  25,
);
assert.strictEqual(grouped.buckets.exactMerges.length, 1);
assert.strictEqual(grouped.buckets.exactMerges[0].checked, true);
assert.strictEqual(grouped.buckets.nearMatches.length, 1);
assert.strictEqual(grouped.buckets.nearMatches[0].checked, false);

const auditPackage = buildSealedAuditPackage(
  journal.exportJournalPackage(),
  [{ id: 'N101', x: 1, y: 0, z: 0 }],
);
assert.strictEqual(
  auditPackage.schema,
  'advanced-topology-edit-audit-package/v1',
);
assert.strictEqual(auditPackage.summary.totalCommands, 1);

console.log('TOPOLOGY EDIT PHASE-ONE SMOKE CONTRACTS PASSED');
