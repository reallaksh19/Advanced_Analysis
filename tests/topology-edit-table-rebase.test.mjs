import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { buildTopologyEditTableProjection } from '../src/workspace/topology-edit/table/topology-edit-table-projection.js';
import { createTopologyEditTableIntent } from '../src/workspace/topology-edit/table/topology-edit-table-intent.js';
import { createTopologyEditTableBatch } from '../src/workspace/topology-edit/table/topology-edit-table-batch.js';
import { planTopologyEditTableBatch } from '../src/workspace/topology-edit/table/topology-edit-table-batch-planner.js';
import { rebaseTopologyEditTableBatchPlan } from '../src/workspace/topology-edit/table/topology-edit-table-rebase.js';

function baseTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'dataset-rebase', datasetVersion: 11, sourceHash: 'sha256:source-rebase',
    topologyGraphHash: 'sha256:graph-rebase',
    nodes: [
      node('node:a1', 0, 0), node('node:a2', 1000, 0), node('node:a3', 2000, 0),
      node('node:b1', 0, 5000), node('node:b2', 1000, 5000), node('node:b3', 2000, 5000),
    ],
    edges: [
      pipe('edge:a1', 'node:a1', 'node:a2'), pipe('edge:a2', 'node:a2', 'node:a3'),
      pipe('edge:b1', 'node:b1', 'node:b2'), pipe('edge:b2', 'node:b2', 'node:b3'),
    ],
    junctions: [], supports: [], boundaries: [], rigids: [],
  });
}
function node(id, x, y) { return { id, position: { x, y, z: 0 }, portKeys: [] }; }
function pipe(id, fromNodeId, toNodeId) {
  return {
    id, componentKey: id.replace('edge:', 'pipe:'), fromNodeId, toNodeId,
    entityType: 'PIPE', diameterMm: 100, outsideDiameterMm: 114,
    diameterAuthority: 'OUTSIDE_DIAMETER',
  };
}
function projection(topology) { return buildTopologyEditTableProjection({ canonicalTopology: topology }); }
function currentSnapshot(topology, baseCanonicalHash, version = 1) {
  return {
    schema: 'TopologyEditCertifiedSession.v1',
    baseAuthority: {
      datasetId: topology.datasetId,
      datasetVersion: topology.datasetVersion,
      sourceHash: topology.sourceHash,
      baseCanonicalHash,
    },
    journalHash: `sha256:journal-${version}`,
    sessionVersion: version,
    activeLedgerHash: `sha256:ledger-${version}`,
    redoLedgerHash: `sha256:redo-${version}`,
    activeCanonicalTopologyHash: topology.canonicalTopologyHash,
    activeCommandIds: [], redoCommandIds: [], staleReason: null,
  };
}
function staged() {
  const topology = baseTopology();
  const session = new TopologyEditCertifiedSession(topology);
  const tableProjection = projection(topology);
  const intent = createTopologyEditTableIntent({
    projection: tableProjection,
    sessionSnapshot: session.snapshot(),
    canonicalId: 'edge:a1',
    intentKind: 'PIPE_LENGTH',
    requestedValue: 1500,
    geometryPolicy: { anchor: 'FROM', propagation: 'DOWNSTREAM' },
  });
  const batch = createTopologyEditTableBatch({ intents: [intent] });
  const plan = planTopologyEditTableBatch({
    batch, projection: tableProjection, canonicalTopology: topology,
  });
  return { topology, batch, plan };
}
function mutate(topology, operation) {
  const raw = structuredClone(topology); delete raw.canonicalTopologyHash;
  operation(raw);
  return finalizeCanonicalTopology(raw);
}

test('R42 table batch rebases when R43 changed only a disjoint branch', () => {
  const { topology: r42, batch, plan } = staged();
  const r43 = mutate(r42, (raw) => {
    raw.nodes.find((row) => row.id === 'node:b3').position.x = 2250;
  });
  const result = rebaseTopologyEditTableBatchPlan({
    batch,
    plan,
    projection: projection(r43),
    canonicalTopology: r43,
    sessionSnapshot: currentSnapshot(r43, r42.canonicalTopologyHash),
  });
  assert.equal(result.disposition, 'REBASED');
  assert.equal(result.reasonCount, 0);
  assert.equal(result.rebasedBatch.authority.priorDraftHash, r43.canonicalTopologyHash);
  assert.notEqual(result.rebasedBatch.batchHash, batch.batchHash);
  assert.deepEqual(
    result.rebasedPlan.operationPlan.commandIntents.map((row) => row.payload),
    plan.operationPlan.commandIntents.map((row) => row.payload),
  );
});

test('rebase rejects a changed propagation dependency even when the pipe edge record is unchanged', () => {
  const { topology: r42, batch, plan } = staged();
  const r43 = mutate(r42, (raw) => {
    raw.nodes.find((row) => row.id === 'node:a3').position.x = 2250;
  });
  const result = rebaseTopologyEditTableBatchPlan({
    batch,
    plan,
    projection: projection(r43),
    canonicalTopology: r43,
    sessionSnapshot: currentSnapshot(r43, r42.canonicalTopologyHash),
  });
  assert.equal(result.disposition, 'STALE_CONFLICT');
  assert.ok(result.reasons.some((row) => (
    row.code === 'DEPENDENCY_REVISION_CHANGED' && row.canonicalIds.includes('node:a3')
  )));
});

test('rebase rejects a new connection that changes semantic propagation targets', () => {
  const { topology: r42, batch, plan } = staged();
  const r43 = mutate(r42, (raw) => {
    raw.nodes.push(node('node:a4', 3000, 0));
    raw.edges.push(pipe('edge:a3', 'node:a3', 'node:a4'));
  });
  const result = rebaseTopologyEditTableBatchPlan({
    batch,
    plan,
    projection: projection(r43),
    canonicalTopology: r43,
    sessionSnapshot: currentSnapshot(r43, r42.canonicalTopologyHash),
  });
  assert.equal(result.disposition, 'STALE_CONFLICT');
  assert.ok(result.reasons.some((row) => row.code === 'SEMANTIC_PLAN_CHANGED'));
});

test('source/base authority changes are never rebased by event order', () => {
  const { topology: r42, batch, plan } = staged();
  const raw = structuredClone(r42); delete raw.canonicalTopologyHash;
  raw.sourceHash = 'sha256:new-source';
  const r43 = finalizeCanonicalTopology(raw);
  const result = rebaseTopologyEditTableBatchPlan({
    batch,
    plan,
    projection: projection(r43),
    canonicalTopology: r43,
    sessionSnapshot: currentSnapshot(r43, r42.canonicalTopologyHash),
  });
  assert.equal(result.disposition, 'STALE_CONFLICT');
  assert.ok(result.reasons.some((row) => row.code === 'SOURCE_HASH_CHANGED'));
});
