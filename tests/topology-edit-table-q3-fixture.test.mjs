import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { buildCanonicalTopologyFromWorkspaceDataset } from '../src/workspace/topology-edit/topology-edit-source-adapter.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { buildTopologyEditTableProjection } from '../src/workspace/topology-edit/table/topology-edit-table-projection.js';

const FIXTURE = new URL('../public/fixtures/topology-edit-table-q3-exact.staged.json', import.meta.url);

function edgeByComponent(topology, componentKey) {
  const rows = topology.edges.filter((row) => row.componentKey === componentKey);
  assert.equal(rows.length, 1, `Expected one canonical edge for ${componentKey}.`);
  return rows[0];
}

function rowByComponent(projection, componentKey) {
  const rows = projection.rows.filter((row) => row.identity.componentKey === componentKey);
  assert.equal(rows.length, 1, `Expected one Table row for ${componentKey}.`);
  return rows[0];
}

function junctionByComponent(topology, componentKey) {
  const rows = topology.junctions.filter((row) => row.componentKey === componentKey);
  assert.equal(rows.length, 1, `Expected one canonical junction for ${componentKey}.`);
  return rows[0];
}

test('Q3 source fixture imports through production adapters with exact reducer custody', async () => {
  const bytes = new Uint8Array(await readFile(FIXTURE));
  const raw = JSON.parse(new TextDecoder().decode(bytes));
  const dataset = normalizeWorkspaceDataset(raw, 'topology-edit-table-q3-exact.staged.json', {
    sourceBytes: bytes,
  });
  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  const topology = finalizeCanonicalTopology(
    buildCanonicalTopologyFromWorkspaceDataset(dataset, graph),
  );
  const projection = buildTopologyEditTableProjection({
    canonicalTopology: topology,
    dataset,
    topologyGraph: graph,
  });

  assert.equal(dataset.entities.length, 8);
  assert.equal(topology.edges.length, 7);
  const tee = junctionByComponent(topology, 'T-001');
  assert.equal(tee.entityType, 'TEE');
  assert.equal(tee.nodeIds.length, 3);

  const reducer = edgeByComponent(topology, 'R-001');
  const m04 = edgeByComponent(topology, 'P-M04');
  const valve = edgeByComponent(topology, 'V-M06');
  const tail = edgeByComponent(topology, 'P-TAIL');
  const disjoint = edgeByComponent(topology, 'P-R42');
  assert.equal(reducer.entityType, 'REDUCER');
  assert.equal(valve.entityType, 'VALVE');
  assert.equal(new Set([m04.fromNodeId, m04.toNodeId]).has(reducer.toNodeId), true);
  assert.equal(new Set([m04.fromNodeId, m04.toNodeId]).has(valve.fromNodeId), true);
  assert.equal(new Set([tail.fromNodeId, tail.toNodeId]).has(valve.toNodeId), true);
  assert.equal(tee.nodeIds.includes(reducer.fromNodeId), true);
  assert.equal(tee.nodeIds.some((id) => id === disjoint.fromNodeId || id === disjoint.toNodeId), false);

  const reducerRow = rowByComponent(projection, 'R-001');
  assert.equal(reducerRow.custody.catalogueAuthority, 'EXACT');
  assert.equal(reducerRow.custody.catalogue.recordId, 'RED-100-80');
  assert.equal(reducerRow.custody.catalogue.recordHash, 'sha256:q3-red-100-80');
  assert.equal(reducerRow.fields.dnInMm, 100);
  assert.equal(reducerRow.fields.dnOutMm, 80);

  const valveRow = rowByComponent(projection, 'V-M06');
  assert.equal(valveRow.fields.valveType, 'GATE');
  assert.equal(valveRow.fields.lengthMm, 200);
  assert.equal(valveRow.fields.dnInMm, 80);

  const teeRow = rowByComponent(projection, 'T-001');
  assert.equal(teeRow.fields.runDnMm, 150);
  assert.equal(teeRow.fields.branchDnMm, 100);
  assert.equal(teeRow.identity.portBindings.length, 3);
  const branch = teeRow.identity.portBindings.find((row) => row.nodeId === reducer.fromNodeId);
  assert.ok(branch?.portKey);
  assert.equal(branch.portKey, 'T-001:port:branch-1');
});
