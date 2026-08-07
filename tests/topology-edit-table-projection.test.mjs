import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import {
  buildTopologyEditTableProjection,
} from '../src/workspace/topology-edit/table/topology-edit-table-projection.js';
import {
  buildTopologyEditTableIdentityIndex,
  resolveExactTopologyEditTableRow,
  resolveTopologyEditTableRows,
} from '../src/workspace/topology-edit/table/topology-edit-table-identity-index.js';

function fixture() {
  const nodes = [
    node('n1', 0, ['pipe-1:start']),
    node('n2', 1000, ['pipe-1:end', 'elbow-1:start']),
    node('n3', 1200, ['elbow-1:end', 'flange-1:start']),
    node('n4', 1300, ['flange-1:end', 'valve-1:start']),
    node('n5', 1650, ['valve-1:end', 'reducer-1:start']),
    node('n6', 1850, ['reducer-1:end', 'tee-1:run-a']),
    node('n7', 2050, ['tee-1:run-b']),
    { id: 'n8', position: { x: 1850, y: 250, z: 0 }, portKeys: ['tee-1:branch'] },
  ];
  const edges = [
    edge('edge:pipe-1', 'pipe-1', 'n1', 'n2', 'PIPE', 100),
    { ...edge('edge:elbow-1', 'elbow-1', 'n2', 'n3', 'ELBOW', 100), angleDeg: 90, radiusMm: 150 },
    { ...edge('edge:flange-1', 'flange-1', 'n3', 'n4', 'FLANGE', 100), flangeType: 'WN', flangeFacing: 'RF', flangeClass: '150' },
    { ...edge('edge:valve-1', 'valve-1', 'n4', 'n5', 'VALVE', 100), valveType: 'GATE', pressureClass: '150', componentLengthMm: 350 },
    {
      ...edge('edge:reducer-1', 'reducer-1', 'n5', 'n6', 'REDUCER', 100),
      secondaryNominalSizeMm: 80,
      reducerType: 'ECCENTRIC',
      reducerOrientation: 'FLAT_TOP',
      catalogueBinding: {
        catalogueHash: 'sha256:cat', recordId: 'RED-100-80', recordHash: 'sha256:rec',
        sourceHash: 'sha256:cat-source', sourceReference: { documentId: 'spec', revision: 'A', path: '/reducers/1' },
      },
    },
  ];
  const topology = finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1', datasetId: 'dataset-a', datasetVersion: 7,
    sourceHash: 'sha256:source-a', topologyGraphHash: 'sha256:graph-a', nodes, edges,
    junctions: [{ id: 'junction:tee-1', componentKey: 'tee-1', nodeIds: ['n6', 'n7', 'n8'], entityType: 'TEE' }],
    supports: [{ id: 'support:s1', entityId: 'support-1', nodeId: 'n6', hostEntityId: null, resolved: false, attachmentEvidenceType: 'AMBIGUOUS', restraint: { type: 'GUIDE', gapMm: 3 } }],
    boundaries: [], rigids: [],
  });
  const entities = [
    entity('pipe-1', 'PIPE', { SCHEDULE: 'STD', MATERIAL: 'A106-B' }),
    entity('elbow-1', 'ELBOW', { TURN_INTENT: 'LEFT' }),
    entity('flange-1', 'FLANGE', { RATING: '150' }),
    entity('valve-1', 'VALVE', { VALVE_TYPE: 'GATE', OPERATOR: 'HANDWHEEL' }),
    entity('reducer-1', 'REDUCER', { REDUCER_TYPE: 'ECCENTRIC', VENDOR_CUSTOM_X: 'KEEP-ME' }),
    entity('tee-1', 'TEE', { RUN_DN: 80, BRANCH_DN: 50, BRANCH_ANGLE: 90 }),
    entity('support-1', 'SUPPORT', { SUPPORT_TYPE: 'GUIDE', GAP_MM: 3 }, 'support'),
  ];
  const dataset = {
    datasetId: 'dataset-a', version: 7, sourceSchema: 'inputxml', sourceName: 'route.xml',
    sourceSnapshot: { sourceSemanticHash: 'sha256:source-a', sourceByteHash: 'sha256:bytes-a' },
    entities,
  };
  const ports = [
    port('pipe-1:start', 'pipe-1', 'start'), port('pipe-1:end', 'pipe-1', 'end'),
    port('elbow-1:start', 'elbow-1', 'start'), port('elbow-1:end', 'elbow-1', 'end'),
    port('flange-1:start', 'flange-1', 'start'), port('flange-1:end', 'flange-1', 'end'),
    port('valve-1:start', 'valve-1', 'start'), port('valve-1:end', 'valve-1', 'end'),
    port('reducer-1:start', 'reducer-1', 'start'), port('reducer-1:end', 'reducer-1', 'end'),
    port('tee-1:run-a', 'tee-1', 'run-a'), port('tee-1:run-b', 'tee-1', 'run-b'),
    port('tee-1:branch', 'tee-1', 'branch'),
  ];
  return { topology, dataset, graph: { semanticHash: 'sha256:graph-a', ports } };
}

function node(id, x, portKeys) { return { id, position: { x, y: 0, z: 0 }, portKeys }; }
function edge(id, componentKey, fromNodeId, toNodeId, entityType, diameterMm) {
  return { id, componentKey, fromNodeId, toNodeId, entityType, diameterMm, outsideDiameterMm: diameterMm + 14, diameterAuthority: 'OUTSIDE_DIAMETER', sourcePath: `/objects/${componentKey}` };
}
function entity(entityId, entityType, attributes = {}, category = 'component') {
  return {
    entityId, sourceEntityId: `source:${entityId}`, name: entityId.toUpperCase(), entityType,
    category, sourcePath: `/objects/${entityId}`, sourceNodeKey: `node:${entityId}`,
    jsonPointer: `/objects/${entityId}`, lineNumber: '10-A', pipingClass: '150', nominalDiameterMm: 100,
    properties: { sourceAttributes: { ...attributes }, attributes: { ...attributes }, enrichedAttributes: {}, nativeParams: {}, identity: {} },
  };
}
function port(portKey, componentKey, role) { return { portKey, componentKey, role }; }

test('projection is deterministic across source and port ordering and does not mutate authority', () => {
  const { topology, dataset, graph } = fixture();
  const before = semanticHash({ topology, dataset, graph });
  const projection = buildTopologyEditTableProjection({ canonicalTopology: topology, dataset, topologyGraph: graph });
  const permuted = buildTopologyEditTableProjection({
    canonicalTopology: topology,
    dataset: { ...dataset, entities: [...dataset.entities].reverse() },
    topologyGraph: { ...graph, ports: [...graph.ports].reverse() },
  });
  assert.deepEqual(permuted, projection);
  assert.equal(semanticHash({ topology, dataset, graph }), before);
  assert.equal(projection.authority.canonicalTopologyHash, topology.canonicalTopologyHash);
  assert.equal(projection.rows.length, 7);
});

test('projection preserves exact multi-port identity and unresolved catalogue/support custody', () => {
  const { topology, dataset, graph } = fixture();
  const projection = buildTopologyEditTableProjection({ canonicalTopology: topology, dataset, topologyGraph: graph });
  const tee = projection.rows.find((row) => row.identity.canonicalId === 'junction:tee-1');
  assert.deepEqual(tee.identity.portBindings.map((row) => row.portRole).sort(), ['branch', 'run-a', 'run-b']);
  assert.equal(tee.fields.branchDnMm, 50);

  const valve = projection.rows.find((row) => row.identity.canonicalId === 'edge:valve-1');
  assert.equal(valve.fields.valveType, 'GATE');
  assert.equal(valve.fields.catalogueAuthority, 'UNRESOLVED');
  assert.equal(valve.custody.catalogue, null);

  const reducer = projection.rows.find((row) => row.identity.canonicalId === 'edge:reducer-1');
  assert.equal(reducer.fields.dnInMm, 100);
  assert.equal(reducer.fields.dnOutMm, 80);
  assert.equal(reducer.fields.catalogueAuthority, 'EXACT');
  assert.equal(reducer.custody.catalogue.recordId, 'RED-100-80');

  const support = projection.rows.find((row) => row.identity.canonicalId === 'support:s1');
  assert.equal(support.fields.hostEntityId, null);
  assert.equal(support.fields.gapMm, 3);
});

test('reducer projection does not fabricate a missing secondary size', () => {
  const { topology, dataset, graph } = fixture();
  const raw = structuredClone(topology);
  delete raw.canonicalTopologyHash;
  const reducer = raw.edges.find((row) => row.id === 'edge:reducer-1');
  delete reducer.secondaryNominalSizeMm;
  delete reducer.catalogueBinding;
  const reducerEntity = dataset.entities.find((row) => row.entityId === 'reducer-1');
  const nextDataset = {
    ...dataset,
    entities: dataset.entities.map((row) => row === reducerEntity
      ? { ...row, properties: { ...row.properties, sourceAttributes: { REDUCER_TYPE: 'ECCENTRIC' }, attributes: { REDUCER_TYPE: 'ECCENTRIC' } } }
      : row),
  };
  const nextTopology = finalizeCanonicalTopology(raw);
  const projection = buildTopologyEditTableProjection({ canonicalTopology: nextTopology, dataset: nextDataset, topologyGraph: graph });
  const row = projection.rows.find((candidate) => candidate.identity.canonicalId === 'edge:reducer-1');
  assert.equal(row.fields.dnInMm, 100);
  assert.equal(row.fields.dnOutMm, null);
  assert.equal(row.fieldAuthority.dnOutMm, 'UNRESOLVED');
  assert.equal(row.fields.catalogueAuthority, 'UNRESOLVED');
});

test('partial catalogue provenance remains unresolved', () => {
  const { topology, dataset, graph } = fixture();
  const raw = structuredClone(topology);
  delete raw.canonicalTopologyHash;
  const reducer = raw.edges.find((row) => row.id === 'edge:reducer-1');
  delete reducer.catalogueBinding.sourceHash;
  const nextTopology = finalizeCanonicalTopology(raw);
  const projection = buildTopologyEditTableProjection({ canonicalTopology: nextTopology, dataset, topologyGraph: graph });
  const row = projection.rows.find((candidate) => candidate.identity.canonicalId === 'edge:reducer-1');
  assert.equal(row.fields.catalogueAuthority, 'UNRESOLVED');
  assert.equal(row.custody.catalogue, null);
});

test('identity index resolves only exact canonical/source/port identities', () => {
  const { topology, dataset, graph } = fixture();
  const projection = buildTopologyEditTableProjection({ canonicalTopology: topology, dataset, topologyGraph: graph });
  const index = buildTopologyEditTableIdentityIndex(projection);
  assert.equal(resolveExactTopologyEditTableRow(index, { canonicalId: 'edge:pipe-1' }).fields.tag, 'PIPE-1');
  assert.equal(resolveExactTopologyEditTableRow(index, { portKey: 'valve-1:start' }).identity.canonicalId, 'edge:valve-1');
  assert.equal(resolveExactTopologyEditTableRow(index, { sourceEntityId: 'source:reducer-1' }).elementType, 'REDUCER');
  assert.equal(resolveTopologyEditTableRows(index, { nodeId: 'n6' }).length, 3);
  assert.throws(() => resolveTopologyEditTableRows(index, { nodeId: 'n6', canonicalId: 'edge:reducer-1' }), /exactly one exact identity key/);
});

test('projection fails closed when graph or source authority does not match canonical', () => {
  const { topology, dataset, graph } = fixture();
  assert.throws(() => buildTopologyEditTableProjection({
    canonicalTopology: topology, dataset, topologyGraph: { ...graph, semanticHash: 'sha256:wrong' },
  }), /topology graph hash differs/);
  assert.throws(() => buildTopologyEditTableProjection({
    canonicalTopology: topology,
    dataset: { ...dataset, sourceSnapshot: { ...dataset.sourceSnapshot, sourceSemanticHash: 'sha256:wrong' } },
    topologyGraph: graph,
  }), /source hash differs/);
});
