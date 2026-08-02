import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { STORAGE_KEY_EDIT_DRAFT } from '../src/workspace/topology-edit/topology-edit-persistence.js';
import { TopologyEditLifecycleController } from '../src/workspace/topology-edit/topology-edit-lifecycle-controller.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MemoryStorage {
  constructor() { this.rows = new Map(); }
  getItem(key) { return this.rows.has(key) ? this.rows.get(key) : null; }
  setItem(key, value) { this.rows.set(key, String(value)); }
  removeItem(key) { this.rows.delete(key); }
}

function baseTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'DS-W4C', datasetVersion: 1,
    sourceHash: 'source:w4c', topologyGraphHash: 'graph:w4c',
    nodes: [
      { id: 'node:n1', position: { x: 0, y: 0, z: 0 }, portKeys: ['P1:port:start'] },
      { id: 'node:n2', position: { x: 100, y: 0, z: 0 }, portKeys: ['P1:port:end'] },
    ],
    edges: [{
      id: 'edge:e1', componentKey: 'P1', fromNodeId: 'node:n1', toNodeId: 'node:n2',
      diameterMm: 100, entityType: 'PIPE', sourcePath: '$[0]',
    }],
    junctions: [], supports: [], boundaries: [], rigids: [],
  });
}

function movedSession(base) {
  const session = new TopologyEditCertifiedSession(base);
  const transition = session.execute('MOVE_NODE', {
    nodeId: 'node:n1', position: { x: 10, y: 0, z: 0 },
  });
  assert.equal(transition.disposition, 'ACCEPTED');
  return session;
}

test('production lifecycle saves, reloads, and exports the certified draft', () => {
  const base = baseTopology();
  let session = movedSession(base);
  const storage = new MemoryStorage();
  const downloads = [];
  const lifecycle = new TopologyEditLifecycleController({
    getSession: () => session,
    getViewState: () => ({ camera: 'ISO' }),
    storage,
    downloadText: (text, fileName) => downloads.push({ text, fileName }),
    commitPrepared: () => { throw new Error('commit not expected'); },
  });

  const saved = lifecycle.saveDraft();
  assert.equal(saved.disposition, 'SAVED');
  assert.equal(lifecycle.hasPersistedDraft(), true);
  assert.ok(storage.getItem(STORAGE_KEY_EDIT_DRAFT).includes(saved.packageHash));

  session = new TopologyEditCertifiedSession(base);
  const restored = lifecycle.reloadDraft();
  assert.equal(restored.disposition, 'RESTORED');
  assert.deepEqual(
    session.currentTopology().nodes.find((node) => node.id === 'node:n1').position,
    { x: 10, y: 0, z: 0 },
  );

  const exported = lifecycle.exportDraft();
  assert.equal(exported.disposition, 'EXPORTED');
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].fileName, 'DS-W4C-topology-edit-audit.json');
  const audit = JSON.parse(downloads[0].text);
  assert.equal(audit.preparedExport.preparedOutputHash, exported.preparedOutputHash);
  assert.equal(audit.sealedHash, exported.sealedHash);
});

test('persisted draft clears only after a COMMITTED receipt', () => {
  const base = baseTopology();
  const committedStorage = new MemoryStorage();
  const committedSession = movedSession(base);
  let receivedPrepared = null;
  const committedLifecycle = new TopologyEditLifecycleController({
    getSession: () => committedSession,
    storage: committedStorage,
    downloadText: () => {},
    commitPrepared: ({ preparedExport }) => {
      receivedPrepared = preparedExport;
      return Object.freeze({ disposition: 'COMMITTED', datasetVersion: 2, rollback: null });
    },
  });
  const committed = committedLifecycle.commitDraft();
  assert.equal(committed.disposition, 'COMMITTED');
  assert.equal(receivedPrepared.schema, 'TopologyEditPreparedExport.v1');
  assert.equal(committedStorage.getItem(STORAGE_KEY_EDIT_DRAFT), null);

  const rollbackStorage = new MemoryStorage();
  const rollbackSession = movedSession(base);
  const rollbackLifecycle = new TopologyEditLifecycleController({
    getSession: () => rollbackSession,
    storage: rollbackStorage,
    downloadText: () => {},
    commitPrepared: () => Object.freeze({
      disposition: 'ROLLED_BACK', datasetVersion: 1,
      rollback: { reason: 'READ_BACK_FAILED' },
    }),
  });
  const rolledBack = rollbackLifecycle.commitDraft();
  assert.equal(rolledBack.disposition, 'ROLLED_BACK');
  assert.notEqual(rollbackStorage.getItem(STORAGE_KEY_EDIT_DRAFT), null);
});

test('Wave 4C production wrapper consumes core and lifecycle authorities', async () => {
  const wrapper = await readFile(
    path.join(ROOT, 'src/workspace/topology-edit-3d-view-controller.js'), 'utf8',
  );
  const core = await readFile(
    path.join(ROOT, 'src/workspace/topology-edit-3d-view-controller-core.js'), 'utf8',
  );
  const lifecycle = await readFile(
    path.join(ROOT, 'src/workspace/topology-edit/topology-edit-lifecycle-controller.js'), 'utf8',
  );
  assert.match(wrapper, /extends TopologyEdit3DViewControllerCore/);
  assert.match(wrapper, /data-action="save-draft"/);
  assert.match(wrapper, /data-action="reload-draft"/);
  assert.match(wrapper, /data-action="export-draft"/);
  assert.match(wrapper, /data-action="commit-draft"/);
  assert.match(wrapper, /autosaveAfterTransition/);
  assert.match(core, /TopologyEditCertifiedSession/);
  assert.match(core, /buildAutofixPolicy/);
  assert.match(lifecycle, /prepareTopologyEditExport/);
  assert.match(lifecycle, /commitPreparedTopologyEditExport/);
  assert.match(lifecycle, /receipt\.disposition === 'COMMITTED'/);
  assert.doesNotMatch(wrapper, /WorkspaceState\.loadDataset/);
  assert.doesNotMatch(wrapper, /applyCanonicalTopologyToWorkspaceEntities/);
  assert.doesNotMatch(lifecycle, /Date\.now/);
  assert.ok(wrapper.split(/\r?\n/).length <= 300);
  assert.ok(lifecycle.split(/\r?\n/).length <= 300);
});
