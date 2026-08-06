import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { createTopologyEditSpecificationCatalogue } from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { createPipeSegmentCatalogueBinding } from '../src/workspace/topology-edit/topology-edit-pipe-segment-command.js';

const SOURCE_HASH = `sha256:${'a'.repeat(64)}`;

function catalogue() {
  return createTopologyEditSpecificationCatalogue({
    catalogueId: 'JOURNAL-PIPE',
    catalogueVersion: '1',
    authority: { sourceId: 'SPEC', sourceVersion: 'A', sourceHash: SOURCE_HASH },
    records: [{
      recordId: 'PIPE-DN50',
      componentType: 'PIPE',
      nominalSizeMm: 50,
      outsideDiameterMm: 60.3,
      schedule: 'S40',
      wallThicknessMm: 3.91,
      pressureClass: 'CL150',
      materialSpecification: 'ASTM-A106-B',
      endConnectionFrom: 'BUTT_WELD',
      endConnectionTo: 'BUTT_WELD',
      pipingClass: 'CS150',
      sourceReference: { documentId: 'SPEC', revision: 'A', path: '/pipe/dn50' },
    }],
  });
}
function baseTopology() {
  const nodes = [
    { id: 'node:start', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
    { id: 'node:end', position: { x: 1000, y: 0, z: 0 }, portKeys: [] },
  ];
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'native-dataset:journal',
    datasetVersion: 0,
    sourceHash: SOURCE_HASH,
    topologyGraphHash: semanticHash({ nodes }),
    nodes,
    edges: [],
    junctions: [],
    supports: [],
    boundaries: [],
    rigids: [],
    bends: [],
  });
}
function revision(topology, id) {
  return semanticHash({
    kind: 'NODE',
    record: topology.nodes.find((node) => node.id === id),
  });
}

test('certified session accepts, journals, replays, undoes and redoes governed pipe', () => {
  const base = baseTopology();
  const spec = catalogue();
  const binding = createPipeSegmentCatalogueBinding({
    catalogue: spec,
    recordId: 'PIPE-DN50',
  });
  const session = new TopologyEditCertifiedSession(base);
  const transition = session.execute('INSERT_PIPE_SEGMENT', {
    fromNodeId: 'node:start',
    toNodeId: 'node:end',
    catalogueBinding: binding,
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
  }, {
    expectedTargetRevisions: {
      'node:start': revision(base, 'node:start'),
      'node:end': revision(base, 'node:end'),
    },
  });

  assert.equal(transition.disposition, 'ACCEPTED');
  assert.equal(session.currentTopology().nodes.length, 2);
  assert.equal(session.currentTopology().edges.length, 1);
  assert.equal(session.journal.activeCommandIds.length, 1);
  assert.equal(session.currentTopology().edges[0].catalogueRecordHash, binding.recordHash);

  const resultHash = session.currentTopology().canonicalTopologyHash;
  const journalHash = session.journal.journalHash;
  const serialized = session.serializeJournal();
  const restored = new TopologyEditCertifiedSession(base);
  restored.reloadJournal(serialized);
  assert.equal(restored.journal.journalHash, journalHash);
  assert.equal(restored.currentTopology().canonicalTopologyHash, resultHash);

  session.undo();
  assert.equal(session.currentTopology().canonicalTopologyHash, base.canonicalTopologyHash);
  session.redo();
  assert.equal(session.currentTopology().canonicalTopologyHash, resultHash);
});

test('certified session rejects missing endpoint revision evidence', () => {
  const base = baseTopology();
  const binding = createPipeSegmentCatalogueBinding({
    catalogue: catalogue(),
    recordId: 'PIPE-DN50',
  });
  const session = new TopologyEditCertifiedSession(base);
  const transition = session.execute('INSERT_PIPE_SEGMENT', {
    fromNodeId: 'node:start',
    toNodeId: 'node:end',
    catalogueBinding: binding,
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
  }, {
    expectedTargetRevisions: {
      'node:start': revision(base, 'node:start'),
    },
  });
  assert.equal(transition.disposition, 'REJECTED');
  assert.match(transition.reason, /CERTIFICATION_RESOLUTION_REJECTED/u);
  assert.equal(session.journal.activeCommandIds.length, 0);
  assert.equal(session.currentTopology().canonicalTopologyHash, base.canonicalTopologyHash);
});
