import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { createTopologyEditDraftPackage } from '../src/workspace/topology-edit/topology-edit-persistence.js';
import { prepareTopologyEditExport } from '../src/workspace/topology-edit/topology-edit-export.js';
import {
  commitTopologyEditWorkspace,
  prepareTopologyEditWorkspaceCommit,
} from '../src/workspace/topology-edit/topology-edit-commit-service.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_MANIFEST_HASH = 'sha256:w4b-source-manifest';

function workspaceDataset() {
  const normalized = normalizeWorkspaceDataset({
    schema: 'inputxml-managed-stage/v1',
    packageHash: 'W4B-DATASET',
    unit: 'mm',
    project: { name: 'Wave 4B commit fixture' },
    objects: [{
      id: 'PIPE-1',
      name: 'Wave 4B Pipe',
      type: 'PIPE',
      sourcePath: '/PIPE-1',
      nativeParams: {
        startPoint: [0, 0, 0],
        endPoint: [100, 0, 0],
        center: [50, 0, 0],
      },
      attributes: { TYPE: 'PIPE', OUTSIDE_DIAMETER: 100 },
    }],
  }, '[SIMULATED] Wave 4B commit');
  return Object.freeze({ ...normalized, version: 1 });
}

function baseCanonical(dataset) {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: dataset.datasetId,
    datasetVersion: dataset.version,
    sourceHash: dataset.sourceSnapshot.sourceSemanticHash,
    topologyGraphHash: 'graph:w4b',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: ['PIPE-1:start'] },
      { id: 'node:b', position: { x: 100, y: 0, z: 0 }, portKeys: ['PIPE-1:end'] },
    ],
    edges: [{
      id: 'edge:PIPE-1',
      componentKey: 'PIPE-1',
      fromNodeId: 'node:a',
      toNodeId: 'node:b',
      entityType: 'PIPE',
      diameterMm: 100,
      sourcePath: '/PIPE-1',
    }],
    junctions: [], supports: [], boundaries: [], rigids: [],
  });
}

function fixture() {
  const dataset = workspaceDataset();
  const base = baseCanonical(dataset);
  const session = new TopologyEditCertifiedSession(base);
  assert.equal(session.execute('MOVE_NODE', {
    nodeId: 'node:b', position: { x: 140, y: 20, z: 0 },
  }).disposition, 'ACCEPTED');
  const draftPackage = createTopologyEditDraftPackage({
    sourceManifestHash: SOURCE_MANIFEST_HASH,
    journal: session.journal,
    activeCanonicalTopologyHash: session.currentTopology().canonicalTopologyHash,
  });
  const preparedExport = prepareTopologyEditExport({
    draftPackage,
    baseCanonicalTopology: base,
    expected: { sourceManifestHash: SOURCE_MANIFEST_HASH },
  });
  const snapshot = Object.freeze({ status: 'ready', dataset, selectedEntityId: '', version: 7 });
  const plan = prepareTopologyEditWorkspaceCommit({
    preparedExport,
    baseCanonicalTopology: base,
    workspaceSnapshot: snapshot,
    editSessionId: 'EDIT-W4B',
  });
  return { dataset, base, preparedExport, snapshot, plan };
}

function adapterFor(initialSnapshot, behavior = {}) {
  let current = initialSnapshot;
  let swaps = 0;
  const events = [];
  const adapter = {
    readSnapshot: () => current,
    swapDataset(dataset) {
      swaps += 1;
      if (behavior.onSwap) return behavior.onSwap({ dataset, swaps, current, setCurrent: (value) => { current = value; }, adapter });
      current = Object.freeze({ status: 'ready', dataset, selectedEntityId: '', version: current.version + 1 });
      return current;
    },
    publishSnapshotChanged(snapshot, receipt) {
      events.push({ snapshot, receipt });
      if (behavior.publishError) throw new Error(behavior.publishError);
    },
  };
  return { adapter, events, getSnapshot: () => current, getSwapCount: () => swaps };
}

test('prepared commit translates canonical edits, rebuilds derivatives, and publishes once', () => {
  const { plan, snapshot } = fixture();
  const state = adapterFor(snapshot);
  const receipt = commitTopologyEditWorkspace({ plan, adapter: state.adapter });
  assert.equal(receipt.disposition, 'COMMITTED');
  assert.equal(state.events.length, 1);
  assert.equal(state.getSwapCount(), 1);
  assert.equal(receipt.snapshot.dataset.version, 2);
  assert.equal(receipt.snapshot.dataset.calculationFreshness, 'STALE');
  assert.equal(receipt.snapshot.dataset.editAudit.preparedOutputHash, plan.preparedOutputHash);
  assert.equal(receipt.snapshot.dataset.editAudit.invalidationHash, plan.invalidation.invalidationHash);
  const geometry = receipt.snapshot.dataset.entities[0].properties.geometry;
  assert.deepEqual(geometry.end, { x: 140, y: 20, z: 0 });
  assert.deepEqual(geometry.center, { x: 70, y: 10, z: 0 });
});

test('workspace drift is rejected before swap or publication', () => {
  const { plan, snapshot } = fixture();
  const state = adapterFor({ ...snapshot, version: snapshot.version + 1 });
  assert.throws(() => commitTopologyEditWorkspace({ plan, adapter: state.adapter }), /workspace changed before commit/);
  assert.equal(state.getSwapCount(), 0);
  assert.equal(state.events.length, 0);
});

test('read-back mismatch rolls back exact prior dataset and publishes only rollback state', () => {
  const { plan, snapshot } = fixture();
  const state = adapterFor(snapshot, {
    onSwap({ dataset, swaps, current, setCurrent }) {
      if (swaps === 1) {
        const corrupted = Object.freeze({ ...dataset, version: dataset.version + 99 });
        const changed = Object.freeze({ status: 'ready', dataset: corrupted, selectedEntityId: '', version: current.version + 1 });
        setCurrent(changed);
        return changed;
      }
      const restored = Object.freeze({ status: 'ready', dataset, selectedEntityId: '', version: current.version + 1 });
      setCurrent(restored);
      return restored;
    },
  });
  const receipt = commitTopologyEditWorkspace({ plan, adapter: state.adapter });
  assert.equal(receipt.disposition, 'ROLLED_BACK');
  assert.equal(receipt.rollback.performed, true);
  assert.equal(state.getSwapCount(), 2);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].receipt.disposition, 'ROLLED_BACK');
  assert.deepEqual(state.getSnapshot().dataset, snapshot.dataset);
});

test('reentrant commit is locked and forces rollback without a commit event', () => {
  const { plan, snapshot } = fixture();
  const state = adapterFor(snapshot, {
    onSwap({ dataset, swaps, current, setCurrent, adapter }) {
      const changed = Object.freeze({ status: 'ready', dataset, selectedEntityId: '', version: current.version + 1 });
      setCurrent(changed);
      if (swaps === 1) commitTopologyEditWorkspace({ plan, adapter });
      return changed;
    },
  });
  const receipt = commitTopologyEditWorkspace({ plan, adapter: state.adapter });
  assert.equal(receipt.disposition, 'ROLLED_BACK');
  assert.match(receipt.rollback.reason, /another topology edit commit is active/);
  assert.equal(state.getSwapCount(), 2);
  assert.equal(state.events.length, 1);
  assert.deepEqual(state.getSnapshot().dataset, snapshot.dataset);
});

test('publication failure invokes publish once and does not emit contradictory rollback', () => {
  const { plan, snapshot } = fixture();
  const state = adapterFor(snapshot, { publishError: 'listener failed' });
  assert.throws(() => commitTopologyEditWorkspace({ plan, adapter: state.adapter }), /listener failed/);
  assert.equal(state.events.length, 1);
  assert.equal(state.getSnapshot().dataset.calculationFreshness, 'STALE');
});

test('service is prepared-export-only and contains no wall-clock receipt authority', async () => {
  const text = await readFile(path.join(ROOT, 'src/workspace/topology-edit/topology-edit-commit-service.js'), 'utf8');
  assert.ok(text.includes('assertPreparedTopologyEditExport'));
  assert.ok(text.includes('applyCanonicalTopologyToWorkspaceEntities'));
  assert.ok(text.includes('rebuildWorkspaceDataset'));
  assert.ok(text.includes('publishSnapshotChanged(finalReceipt.snapshot'));
  for (const prohibited of ['Date.now', 'updatedEntities = []', 'journalPackage, updatedEntities']) {
    assert.equal(text.includes(prohibited), false, `prohibited ${prohibited}`);
  }
});
