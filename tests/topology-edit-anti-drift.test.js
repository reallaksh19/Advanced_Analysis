/**
 * Topology Edit — bounded retained smoke contracts.
 *
 * These checks preserve retained phase-one visual/export scaffolding while
 * exercising the Wave 1 certified session for command history and replay.
 * They do not certify later-wave geometry, autofix, persistence, commit,
 * rollback, browser qualification, or large-model performance.
 */

import assert from 'node:assert';
import { TOPOLOGY_EDIT_BASELINE_MANIFEST } from '../src/workspace/topology-edit/topology-edit-baseline-manifest.js';
import { createTopologyEditRenderModel } from '../src/workspace/topology-edit/topology-edit-render-model.js';
import { createTopologyEditPick } from '../src/workspace/topology-edit/topology-edit-picking-contract.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
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
  objectId: 'node:101',
  point: { x: 5, y: 10, z: 15 },
});
assert.strictEqual(pick.objectId, 'node:101');
assert.strictEqual(pick.point.x, 5);

const baseTopology = finalizeCanonicalTopology({
  schema: 'topology-edit-canonical-topology/v1',
  datasetId: 'smoke-dataset',
  datasetVersion: 0,
  sourceHash: 'source:smoke',
  topologyGraphHash: 'graph:smoke',
  nodes: [
    { id: 'node:100', position: { x: 0, y: 0, z: 0 }, portKeys: ['P1:port:start'] },
    { id: 'node:101', position: { x: 100, y: 0, z: 0 }, portKeys: ['P1:port:end'] },
  ],
  edges: [
    {
      id: 'edge:100',
      componentKey: 'P1',
      fromNodeId: 'node:100',
      toNodeId: 'node:101',
      diameterMm: 100,
      entityType: 'PIPE',
      sourcePath: '$[0]',
    },
  ],
  junctions: [],
  supports: [],
  boundaries: [],
  rigids: [],
});
const session = new TopologyEditCertifiedSession(baseTopology);
const accepted = session.execute('MOVE_NODE', {
  nodeId: 'node:101',
  position: { x: 110, y: 0, z: 0 },
});
assert.strictEqual(accepted.disposition, 'ACCEPTED');
assert.strictEqual(session.journal.activeCommandIds.length, 1);
assert.strictEqual(session.canUndo(), true);
session.undo();
assert.strictEqual(session.journal.activeCommandIds.length, 0);
session.redo();
assert.strictEqual(session.journal.activeCommandIds.length, 1);

const retainedIssues = [
  {
    id: '1',
    kind: 'SNAP_GAP',
    distanceMm: 2.4,
    nodeIds: ['node:101', 'node:100'],
    suggestedAutofix: 'MERGE_NODES',
  },
  {
    id: '2',
    kind: 'SNAP_GAP',
    distanceMm: 14.5,
    nodeIds: ['node:210', 'node:208'],
    suggestedAutofix: 'MERGE_NODES',
  },
  {
    id: '3',
    kind: 'ZERO_LENGTH_ELEMENT',
    distanceMm: 0,
    elementId: 'edge:109',
    suggestedAutofix: null,
  },
];

const grouped = TopologyEditAutofixGrouper.groupIssues(retainedIssues, 6, 25);
assert.strictEqual(grouped.buckets.exactMerges.length, 1);
assert.strictEqual(grouped.buckets.exactMerges[0].checked, true);
assert.strictEqual(grouped.buckets.nearMatches.length, 1);
assert.strictEqual(grouped.buckets.nearMatches[0].checked, false);
assert.strictEqual(grouped.buckets.structuralIssues.length, 1);
assert.strictEqual(grouped.buckets.structuralIssues[0].checked, false);

const journalPackage = {
  schema: 'TopologyEditCertifiedJournalPackage.v1',
  entriesCount: session.journal.history.length,
  journalHash: session.journal.journalHash,
  serializedJournal: session.serializeJournal(),
};
const auditPackage = buildSealedAuditPackage(
  journalPackage,
  [{ id: 'node:101', x: 110, y: 0, z: 0 }],
);
assert.strictEqual(auditPackage.schema, 'advanced-topology-edit-audit-package/v1');
assert.strictEqual(auditPackage.summary.totalCommands, 1);

console.log('TOPOLOGY EDIT PHASE-ONE SMOKE CONTRACTS PASSED');
