import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { buildTopologyEditTableProjection } from '../src/workspace/topology-edit/table/topology-edit-table-projection.js';
import {
  buildTopologyEditTableHumanExport,
  topologyEditTableHumanCsv,
} from '../src/workspace/topology-edit/table/topology-edit-table-human-export.js';

function fixture() {
  const topology = finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1', datasetId: 'dataset-export', datasetVersion: 3,
    sourceHash: 'sha256:source-export', topologyGraphHash: 'sha256:graph-export',
    nodes: [
      { id: 'node:n1', position: { x: 0, y: 0, z: 0 }, portKeys: ['pipe-1:start'] },
      { id: 'node:n2', position: { x: 1000, y: 0, z: 0 }, portKeys: ['pipe-1:end', 'valve-1:start'] },
      { id: 'node:n3', position: { x: 1350, y: 0, z: 0 }, portKeys: ['valve-1:end'] },
    ],
    edges: [
      {
        id: 'edge:pipe-1', componentKey: 'pipe-1', fromNodeId: 'node:n1', toNodeId: 'node:n2',
        entityType: 'PIPE', diameterMm: 100, outsideDiameterMm: 114,
        diameterAuthority: 'OUTSIDE_DIAMETER', sourcePath: '/objects/pipe-1',
      },
      {
        id: 'edge:valve-1', componentKey: 'valve-1', fromNodeId: 'node:n2', toNodeId: 'node:n3',
        entityType: 'VALVE', diameterMm: 100, outsideDiameterMm: 114,
        diameterAuthority: 'OUTSIDE_DIAMETER', valveType: 'GATE', componentLengthMm: 350,
        sourcePath: '/objects/valve-1',
        catalogueBinding: {
          catalogueId: 'ASME-VALVES', catalogueVersion: '2026-A', catalogueHash: 'sha256:cat',
          sourceHash: 'sha256:cat-source', recordId: 'GATE-100-150', recordHash: 'sha256:rec',
          sourceReference: { documentId: 'valves', revision: 'A', path: '/gate/100/150' },
        },
      },
    ],
    junctions: [], supports: [], boundaries: [], rigids: [],
  });
  const dataset = {
    datasetId: 'dataset-export', version: 3, sourceSchema: 'inputxml', sourceName: 'route.xml',
    sourceSnapshot: { sourceSemanticHash: 'sha256:source-export', sourceByteHash: 'sha256:bytes-export' },
    entities: [
      entity('pipe-1', 'PIPE', { SCHEDULE: 'STD', MATERIAL: 'A106-B', VENDOR_NOTE: 'keep,quoted' }),
      entity('valve-1', 'VALVE', { VALVE_TYPE: 'GATE', PRESSURE_CLASS: '150' }),
    ],
  };
  const topologyGraph = {
    semanticHash: 'sha256:graph-export',
    ports: [
      port('pipe-1:start', 'pipe-1', 'start'), port('pipe-1:end', 'pipe-1', 'end'),
      port('valve-1:start', 'valve-1', 'start'), port('valve-1:end', 'valve-1', 'end'),
    ],
  };
  const projection = buildTopologyEditTableProjection({ canonicalTopology: topology, dataset, topologyGraph });
  const session = new TopologyEditCertifiedSession(topology);
  return { topology, dataset, projection, session };
}
function entity(entityId, entityType, attributes) {
  return {
    entityId, sourceEntityId: `source:${entityId}`, name: entityId.toUpperCase(), entityType,
    category: 'component', sourcePath: `/objects/${entityId}`, sourceNodeKey: `node:${entityId}`,
    jsonPointer: `/objects/${entityId}`, lineNumber: '10-A', pipingClass: '150', nominalDiameterMm: 100,
    properties: { sourceAttributes: attributes, attributes, enrichedAttributes: {}, nativeParams: {}, identity: {} },
  };
}
function port(portKey, componentKey, role) { return { portKey, componentKey, role }; }

test('human export is deterministic and tied to certified canonical projection', () => {
  const { projection, session } = fixture();
  const first = buildTopologyEditTableHumanExport({ projection, sessionSnapshot: session.snapshot() });
  const second = buildTopologyEditTableHumanExport({ projection, sessionSnapshot: session.snapshot() });
  assert.deepEqual(second, first);
  assert.equal(first.authority.canonicalHash, session.currentTopology().canonicalTopologyHash);
  assert.equal(first.authority.projectionHash, projection.projectionHash);
  assert.deepEqual(first.sheetNames, [
    'Elements', 'Connections', 'Source Mapping', 'Catalogue Evidence', 'Export Metadata',
  ]);
  assert.equal(first.sheets.Elements.rows.length, 2);
  assert.equal(first.sheets.Connections.rows.length, 4);
  assert.equal(first.sheets['Source Mapping'].rows[0][8], 'sha256:source-export');
  const valveCatalogue = first.sheets['Catalogue Evidence'].rows.find((row) => row[0] === 'edge:valve-1');
  assert.deepEqual(valveCatalogue.slice(1, 8), [
    'EXACT', 'ASME-VALVES', '2026-A', 'sha256:cat', 'sha256:cat-source', 'GATE-100-150', 'sha256:rec',
  ]);
});

test('CSV is deterministic flattened Elements output with canonical IDs', () => {
  const { projection, session } = fixture();
  const exportModel = buildTopologyEditTableHumanExport({ projection, sessionSnapshot: session.snapshot() });
  const csv = topologyEditTableHumanCsv(exportModel);
  assert.ok(csv.startsWith('Tag,Type,Line,Connect From,Connect To'));
  assert.ok(csv.includes('edge:pipe-1'));
  assert.ok(csv.includes('edge:valve-1'));
  assert.ok(csv.endsWith('\r\n'));
  assert.equal(topologyEditTableHumanCsv(exportModel), csv);
});

test('human export fails closed for staged, stale projection, source mismatch, or stale session', () => {
  const { projection, session } = fixture();
  assert.throws(() => buildTopologyEditTableHumanExport({
    projection, sessionSnapshot: session.snapshot(), hasUnappliedChanges: true,
  }), /unapplied Table changes/);

  assert.throws(() => buildTopologyEditTableHumanExport({
    projection,
    sessionSnapshot: { ...session.snapshot(), activeCanonicalTopologyHash: 'sha256:other' },
  }), /projection is stale/);

  assert.throws(() => buildTopologyEditTableHumanExport({
    projection,
    sessionSnapshot: { ...session.snapshot(), baseAuthority: { ...session.snapshot().baseAuthority, sourceHash: 'sha256:wrong' } },
  }), /source authority differs/);

  assert.throws(() => buildTopologyEditTableHumanExport({
    projection,
    sessionSnapshot: { ...session.snapshot(), staleReason: 'workspace changed' },
  }), /session is stale/);
});
