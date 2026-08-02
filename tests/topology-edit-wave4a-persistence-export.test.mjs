import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import {
  TOPOLOGY_EDIT_COMMAND_VOCABULARY_HASH,
  TOPOLOGY_EDIT_REGENERATION_POLICY_HASH,
  TopologyEditPersistence,
  createTopologyEditDraftPackage,
  restoreTopologyEditDraftPackage,
  serializeTopologyEditDraftPackage,
} from '../src/workspace/topology-edit/topology-edit-persistence.js';
import {
  buildSealedAuditPackage,
  parsePreparedTopologyEditExport,
  prepareTopologyEditExport,
  serializePreparedTopologyEditExport,
  serializeSealedAuditPackage,
} from '../src/workspace/topology-edit/topology-edit-export.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_MANIFEST_HASH = 'sha256:source-manifest-w4a';

function baseTopology(overrides = {}) {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'DS-W4A',
    datasetVersion: 3,
    sourceHash: 'source:w4a',
    topologyGraphHash: 'graph:w4a',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: ['P:start'] },
      { id: 'node:b', position: { x: 100, y: 0, z: 0 }, portKeys: ['P:end'] },
    ],
    edges: [{
      id: 'edge:p', componentKey: 'P', fromNodeId: 'node:a', toNodeId: 'node:b',
      entityType: 'PIPE', diameterMm: 100, sourcePath: '$[0]',
    }],
    junctions: [], supports: [], boundaries: [], rigids: [],
    ...overrides,
  });
}

function editedSession() {
  const base = baseTopology();
  const session = new TopologyEditCertifiedSession(base);
  const transition = session.execute('MOVE_NODE', {
    nodeId: 'node:b', position: { x: 125, y: 10, z: 0 },
  });
  assert.equal(transition.disposition, 'ACCEPTED');
  return { base, session };
}

function draftPackage() {
  const { base, session } = editedSession();
  const packageValue = createTopologyEditDraftPackage({
    sourceManifestHash: SOURCE_MANIFEST_HASH,
    journal: session.journal,
    activeCanonicalTopologyHash: session.currentTopology().canonicalTopologyHash,
    checkerPolicyHash: session.checkerPolicy?.policyHash ?? null,
    viewState: { standardView: 'ISO', supportScale: 2.5 },
  });
  return { base, session, packageValue };
}

function memoryStorage() {
  const rows = new Map();
  return {
    getItem: (key) => rows.has(key) ? rows.get(key) : null,
    setItem: (key, value) => rows.set(key, String(value)),
    removeItem: (key) => rows.delete(key),
  };
}

test('draft package is deterministic and restores by exact replay', () => {
  const { base, packageValue } = draftPackage();
  const left = serializeTopologyEditDraftPackage(packageValue);
  const right = serializeTopologyEditDraftPackage(packageValue);
  assert.equal(left, right);
  const restored = restoreTopologyEditDraftPackage({
    serializedPackage: left,
    baseCanonicalTopology: base,
    expected: { sourceManifestHash: SOURCE_MANIFEST_HASH },
  });
  assert.equal(restored.activeCanonicalTopologyHash, packageValue.authority.activeCanonicalTopologyHash);
  assert.deepEqual(restored.viewState, { standardView: 'ISO', supportScale: 2.5 });
});

test('storage adapter requires explicit compatible authority and round-trips verified draft', () => {
  const { base, packageValue } = draftPackage();
  const storage = memoryStorage();
  const receipt = TopologyEditPersistence.saveDraft(packageValue, storage);
  assert.equal(receipt.packageHash, packageValue.packageHash);
  const restored = TopologyEditPersistence.loadDraft({
    storage,
    baseCanonicalTopology: base,
    expected: { sourceManifestHash: SOURCE_MANIFEST_HASH },
  });
  assert.equal(restored.packageHash, packageValue.packageHash);
  assert.equal(TopologyEditPersistence.clearDraft(storage).action, 'CLEAR');
  assert.equal(TopologyEditPersistence.loadDraft({ storage, baseCanonicalTopology: base }), null);
  assert.throws(() => TopologyEditPersistence.saveDraft(packageValue, {}), /Storage-compatible/);
});

test('tamper, stale source/base, vocabulary drift, and regeneration drift fail closed', () => {
  const { base, packageValue } = draftPackage();
  const parsed = JSON.parse(serializeTopologyEditDraftPackage(packageValue));
  parsed.authority.activeCanonicalTopologyHash = 'tampered';
  assert.throws(() => restoreTopologyEditDraftPackage({
    serializedPackage: JSON.stringify(parsed), baseCanonicalTopology: base,
  }), /authority hash mismatch/);

  assert.throws(() => restoreTopologyEditDraftPackage({
    package: packageValue,
    baseCanonicalTopology: baseTopology({ sourceHash: 'source:changed' }),
  }), /stale base sourceHash/);
  assert.throws(() => restoreTopologyEditDraftPackage({
    package: packageValue,
    baseCanonicalTopology: base,
    expected: { commandVocabularyHash: `${TOPOLOGY_EDIT_COMMAND_VOCABULARY_HASH}:changed` },
  }), /stale commandVocabularyHash/);
  assert.throws(() => restoreTopologyEditDraftPackage({
    package: packageValue,
    baseCanonicalTopology: base,
    expected: { regenerationPolicyHash: `${TOPOLOGY_EDIT_REGENERATION_POLICY_HASH}:changed` },
  }), /stale regenerationPolicyHash/);
});

test('prepared StagedJSON is full-model, deterministic, and journal-bound', () => {
  const { base, packageValue } = draftPackage();
  const first = prepareTopologyEditExport({
    draftPackage: packageValue,
    baseCanonicalTopology: base,
    expected: { sourceManifestHash: SOURCE_MANIFEST_HASH },
  });
  const second = prepareTopologyEditExport({
    draftPackage: packageValue,
    baseCanonicalTopology: base,
    expected: { sourceManifestHash: SOURCE_MANIFEST_HASH },
  });
  assert.deepEqual(first, second);
  assert.equal(first.stagedJson.exportPolicy.fullModelRequired, true);
  assert.equal(first.stagedJson.canonicalTopology.nodes.length, 2);
  assert.equal(first.stagedJson.canonicalTopology.edges.length, 1);
  assert.equal(first.stagedJson.journalProjection.activeCommandIds.length, 1);
  assert.equal(first.draftCanonicalTopologyHash, packageValue.authority.activeCanonicalTopologyHash);
  const serialized = serializePreparedTopologyEditExport(first);
  assert.equal(parsePreparedTopologyEditExport(serialized).preparedExportHash, first.preparedExportHash);
});

test('sealed audit is deterministic and accepts only a prepared export', () => {
  const { base, packageValue } = draftPackage();
  const prepared = prepareTopologyEditExport({ draftPackage: packageValue, baseCanonicalTopology: base });
  const first = buildSealedAuditPackage(prepared);
  const second = buildSealedAuditPackage(prepared);
  assert.deepEqual(first, second);
  assert.equal(serializeSealedAuditPackage(first), serializeSealedAuditPackage(second));
  assert.equal('exportedAt' in first, false);
  assert.throws(() => buildSealedAuditPackage({ entities: [] }), /Prepared export/);
});

test('Wave 4A modules contain no wall-clock or arbitrary entity snapshot authority', async () => {
  const persistence = await readFile(path.join(ROOT, 'src/workspace/topology-edit/topology-edit-persistence.js'), 'utf8');
  const exportSource = await readFile(path.join(ROOT, 'src/workspace/topology-edit/topology-edit-export.js'), 'utf8');
  for (const token of ['Date.now', 'new Date', 'updatedEntities', 'currentEntities']) {
    assert.equal(`${persistence}\n${exportSource}`.includes(token), false, `prohibited ${token}`);
  }
  assert.ok(exportSource.includes('fullModelRequired: true'));
  assert.ok(exportSource.includes('restoreTopologyEditDraftPackage'));
});
