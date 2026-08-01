import test from 'node:test';
import assert from 'node:assert/strict';
import { createTopologyEditCommandRequest } from '../src/workspace/topology-edit/topology-edit-command-contract.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import {
  assertTopologyEditCertifiedJournal,
  parseTopologyEditCertifiedJournal,
  serializeTopologyEditCertifiedJournal,
} from '../src/workspace/topology-edit/topology-edit-certified-journal.js';
import {
  acceptTopologyEditCommand,
  cancelTopologyEditCommandPreparation,
  createTopologyEditJournalSession,
  redoTopologyEditCommandByReplay,
  reloadTopologyEditJournal,
  undoTopologyEditCommandByReplay,
} from '../src/workspace/topology-edit/topology-edit-journal-service.js';
import { replayTopologyEditCertifiedJournal } from '../src/workspace/topology-edit/topology-edit-replay-service.js';

function baseTopology(overrides = {}) {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'DS-1',
    datasetVersion: 0,
    sourceHash: 'source:abc',
    topologyGraphHash: 'graph:abc',
    nodes: [
      { id: 'node:n1', position: { x: 0, y: 0, z: 0 }, portKeys: ['P1:port:start'] },
      { id: 'node:n2', position: { x: 100, y: 0, z: 0 }, portKeys: ['P1:port:end'] },
      { id: 'node:n3', position: { x: 200, y: 0, z: 0 }, portKeys: ['P2:port:start'] },
      { id: 'node:n4', position: { x: 300, y: 0, z: 0 }, portKeys: ['P2:port:end'] },
    ],
    edges: [
      { id: 'edge:e1', componentKey: 'P1', fromNodeId: 'node:n1', toNodeId: 'node:n2', diameterMm: 100, entityType: 'PIPE', sourcePath: '$[0]' },
      { id: 'edge:e2', componentKey: 'P2', fromNodeId: 'node:n3', toNodeId: 'node:n4', diameterMm: 80, entityType: 'PIPE', sourcePath: '$[1]' },
    ],
    junctions: [],
    supports: [{ id: 'support:s1', entityId: 'S1', nodeId: 'node:n3', resolved: true }],
    boundaries: [],
    rigids: [],
    ...overrides,
  });
}

function requestFor({ base, journal, current, commandId, commandType, payload, sessionVersion = journal.sessionVersion }) {
  return createTopologyEditCommandRequest({
    commandId,
    commandType,
    payload,
    basis: {
      sourceHash: base.sourceHash,
      baseCanonicalHash: base.canonicalTopologyHash,
      priorDraftHash: current.canonicalTopologyHash,
      sessionVersion,
    },
  });
}

function accept({ base, journal, commandId, commandType, payload, sessionVersion }) {
  const current = replayTopologyEditCertifiedJournal({ journal, baseCanonicalTopology: base }).activeCanonicalTopology;
  const request = requestFor({ base, journal, current, commandId, commandType, payload, sessionVersion });
  return acceptTopologyEditCommand({ journal, baseCanonicalTopology: base, request });
}

function fourCommandJournal() {
  const base = baseTopology();
  let transition = createTopologyEditJournalSession(base);
  transition = accept({ base, journal: transition.journal, commandId: 'CMD-1', commandType: 'MOVE_NODE', payload: { nodeId: 'node:n1', position: { x: 10, y: 0, z: 0 } } });
  transition = accept({ base, journal: transition.journal, commandId: 'CMD-2', commandType: 'MOVE_NODE', payload: { nodeId: 'node:n4', position: { x: 310, y: 0, z: 0 } } });
  transition = accept({ base, journal: transition.journal, commandId: 'CMD-3', commandType: 'BRIDGE_GAP', payload: { fromNodeId: 'node:n2', toNodeId: 'node:n3', diameterMm: 90 } });
  transition = accept({ base, journal: transition.journal, commandId: 'CMD-4', commandType: 'SPLIT_EDGE', payload: { edgeId: 'edge:e1', fraction: 0.5 } });
  return { base, transition };
}

test('empty journal replays exactly to its immutable base', () => {
  const base = baseTopology();
  const created = createTopologyEditJournalSession(base);
  assert.equal(created.disposition, 'ACCEPTED');
  assert.equal(created.journal.history.length, 0);
  assert.equal(created.replay.activeCanonicalTopologyHash, base.canonicalTopologyHash);
  assert.ok(Object.isFrozen(created.journal));
});

test('accepted commands append immutable entries and replay deterministically', () => {
  const { base, transition } = fourCommandJournal();
  assert.equal(transition.disposition, 'ACCEPTED');
  assert.equal(transition.journal.history.length, 4);
  assert.deepEqual(transition.journal.activeCommandIds, ['CMD-1', 'CMD-2', 'CMD-3', 'CMD-4']);
  const left = replayTopologyEditCertifiedJournal({ journal: transition.journal, baseCanonicalTopology: base });
  const right = replayTopologyEditCertifiedJournal({ journal: transition.journal, baseCanonicalTopology: base });
  assert.deepEqual(left, right);
  assert.equal(left.entryEvidence.length, 4);
  assert.equal(left.activeCanonicalTopology.edges.some((edge) => edge.id === 'edge:e1'), false);
});

test('unknown target rejection changes no journal state', () => {
  const base = baseTopology();
  const created = createTopologyEditJournalSession(base);
  const current = created.replay.activeCanonicalTopology;
  const request = requestFor({
    base,
    journal: created.journal,
    current,
    commandId: 'CMD-MISSING',
    commandType: 'MOVE_NODE',
    payload: { nodeId: 'node:missing', position: { x: 1, y: 2, z: 3 } },
  });
  const result = acceptTopologyEditCommand({ journal: created.journal, baseCanonicalTopology: base, request });
  assert.equal(result.disposition, 'REJECTED');
  assert.strictEqual(result.journal, created.journal);
  assert.equal(result.journal.history.length, 0);
});

test('stale session version is rejected before journal append', () => {
  const base = baseTopology();
  const created = createTopologyEditJournalSession(base);
  const result = accept({
    base,
    journal: created.journal,
    commandId: 'CMD-STALE',
    commandType: 'MOVE_NODE',
    payload: { nodeId: 'node:n1', position: { x: 10, y: 0, z: 0 } },
    sessionVersion: 4,
  });
  assert.equal(result.disposition, 'REJECTED');
  assert.equal(result.journal.journalHash, created.journal.journalHash);
  assert.match(result.reason, /stale request session version/);
});

test('command cancellation changes no journal or replay state', () => {
  const { base, transition } = fourCommandJournal();
  const cancelled = cancelTopologyEditCommandPreparation({
    journal: transition.journal,
    baseCanonicalTopology: base,
    expectedSessionVersion: transition.journal.sessionVersion,
  });
  assert.equal(cancelled.disposition, 'CANCELLED');
  assert.strictEqual(cancelled.journal, transition.journal);
  assert.equal(cancelled.journalHash, transition.journal.journalHash);
  assert.equal(cancelled.replay.activeCanonicalTopologyHash, transition.replay.activeCanonicalTopologyHash);
});

test('undo twice and redo once derive active state through replay', () => {
  const { base, transition } = fourCommandJournal();
  const firstUndo = undoTopologyEditCommandByReplay({
    journal: transition.journal,
    baseCanonicalTopology: base,
    expectedSessionVersion: 4,
  });
  const secondUndo = undoTopologyEditCommandByReplay({
    journal: firstUndo.journal,
    baseCanonicalTopology: base,
    expectedSessionVersion: 5,
  });
  const redo = redoTopologyEditCommandByReplay({
    journal: secondUndo.journal,
    baseCanonicalTopology: base,
    expectedSessionVersion: 6,
  });
  assert.deepEqual(redo.journal.activeCommandIds, ['CMD-1', 'CMD-2', 'CMD-3']);
  assert.deepEqual(redo.journal.redoCommandIds, ['CMD-4']);
  assert.equal(redo.journal.history.length, 4);
  assert.equal(redo.journal.sessionVersion, 7);
  assert.ok(redo.replay.activeCanonicalTopology.edges.some((edge) => edge.createdByCommandId === 'CMD-3'));
  assert.ok(redo.replay.activeCanonicalTopology.edges.some((edge) => edge.id === 'edge:e1'));
});

test('new command is rejected while redo projection is pending', () => {
  const { base, transition } = fourCommandJournal();
  const undone = undoTopologyEditCommandByReplay({
    journal: transition.journal,
    baseCanonicalTopology: base,
    expectedSessionVersion: 4,
  });
  const result = accept({
    base,
    journal: undone.journal,
    commandId: 'CMD-BRANCH',
    commandType: 'MOVE_NODE',
    payload: { nodeId: 'node:n2', position: { x: 110, y: 0, z: 0 } },
  });
  assert.equal(result.disposition, 'REJECTED');
  assert.equal(result.reason, 'REDO_PENDING');
  assert.equal(result.journal.journalHash, undone.journal.journalHash);
});

test('journal serialization and reload are byte-stable and hash-stable', () => {
  const { base, transition } = fourCommandJournal();
  const serialized = serializeTopologyEditCertifiedJournal(transition.journal);
  const loaded = reloadTopologyEditJournal({ serializedJournal: serialized, baseCanonicalTopology: base });
  assert.equal(loaded.serializedJournal, serialized);
  assert.equal(loaded.journal.journalHash, transition.journal.journalHash);
  assert.equal(loaded.replay.activeCanonicalTopologyHash, transition.replay.activeCanonicalTopologyHash);
  assert.deepEqual(parseTopologyEditCertifiedJournal(serialized), transition.journal);
});

test('tampered history order and receipt evidence fail closed', () => {
  const { transition } = fourCommandJournal();
  const payload = JSON.parse(serializeTopologyEditCertifiedJournal(transition.journal));
  [payload.history[0], payload.history[1]] = [payload.history[1], payload.history[0]];
  assert.throws(() => assertTopologyEditCertifiedJournal(payload), /sequence/);

  const receiptTamper = JSON.parse(serializeTopologyEditCertifiedJournal(transition.journal));
  receiptTamper.history[0].receipt.result.canonicalTopologyHash = 'tampered';
  assert.throws(() => assertTopologyEditCertifiedJournal(receiptTamper), /receipt hash mismatch|entry hash mismatch/);
});

test('changed source or dataset basis prevents replay', () => {
  const { transition } = fourCommandJournal();
  const changedSource = baseTopology({ sourceHash: 'source:changed' });
  assert.throws(
    () => replayTopologyEditCertifiedJournal({ journal: transition.journal, baseCanonicalTopology: changedSource }),
    /sourceHash differs/,
  );
});

test('editing and replay never mutate the base canonical topology', () => {
  const base = baseTopology();
  const before = JSON.stringify(base);
  let transition = createTopologyEditJournalSession(base);
  transition = accept({ base, journal: transition.journal, commandId: 'CMD-IMMUTABLE', commandType: 'MOVE_NODE', payload: { nodeId: 'node:n1', position: { x: 10, y: 0, z: 0 } } });
  replayTopologyEditCertifiedJournal({ journal: transition.journal, baseCanonicalTopology: base });
  assert.equal(JSON.stringify(base), before);
});
