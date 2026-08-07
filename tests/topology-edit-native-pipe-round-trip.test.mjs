import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { buildSharedPipingModelFromWorkspaceDataset } from '../src/core/shared-piping-model/adapters/workspace-dataset-to-shared.js';
import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/topology-graph.js';
import { createTopologyEditSpecificationCatalogue } from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import {
  applyCanonicalTopologyToWorkspaceEntities,
  buildCanonicalTopologyFromWorkspaceDataset,
} from '../src/workspace/topology-edit/topology-edit-source-adapter-dispatch.js';
import {
  applyResolvedPipeSegment,
  createPipeSegmentCatalogueBinding,
  createPipeSegmentRequest,
  recoverNativePipeCanonicalRecords,
  resolvePipeSegment,
} from '../src/workspace/topology-edit/topology-edit-pipe-segment-command.js';

const SOURCE_HASH = `sha256:${'a'.repeat(64)}`;
const GRAPH_HASH = `sha256:${'b'.repeat(64)}`;

function catalogue() {
  return createTopologyEditSpecificationCatalogue({
    catalogueId: 'ROUND-TRIP-PIPE',
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
    datasetId: 'native-dataset:round-trip',
    datasetVersion: 0,
    sourceHash: SOURCE_HASH,
    topologyGraphHash: GRAPH_HASH,
    nodes,
    edges: [],
    junctions: [],
    supports: [],
    boundaries: [],
    rigids: [],
  });
}
function revision(topology, id) {
  return semanticHash({
    kind: 'NODE',
    record: topology.nodes.find((node) => node.id === id),
  });
}
function editedTopology() {
  const base = baseTopology();
  const spec = catalogue();
  const binding = createPipeSegmentCatalogueBinding({
    catalogue: spec,
    recordId: 'PIPE-DN50',
  });
  const request = createPipeSegmentRequest({
    fromNodeId: 'node:start',
    toNodeId: 'node:end',
    catalogueBinding: binding,
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
    expectedTargetRevisions: {
      'node:start': revision(base, 'node:start'),
      'node:end': revision(base, 'node:end'),
    },
  });
  const resolved = resolvePipeSegment({
    commandId: 'command:round-trip-pipe',
    request,
    canonicalTopology: base,
    catalogue: spec,
  });
  return { base, edited: applyResolvedPipeSegment(base, resolved), resolved };
}
function emptyDataset() {
  return {
    schema: 'analysis-workspace-dataset/v1',
    datasetId: 'native-dataset:round-trip',
    version: 0,
    sourceSchema: 'Native3DAuthoringSource.v1',
    sourceName: 'ROUND-TRIP@A',
    sourceSnapshot: {
      schema: 'source-package-snapshot/v1',
      datasetId: 'native-dataset:round-trip',
      sourceSchema: 'Native3DAuthoringSource.v1',
      sourceSemanticHash: SOURCE_HASH,
      sourceByteHash: null,
      sourcePackage: {
        schema: 'Native3DAuthoringSource.v1',
        units: { length: 'MM', force: 'unknown', mass: 'unknown' },
      },
      diagnostics: [],
    },
    sourceModel: { nodes: [], diagnostics: [] },
    entities: [],
    nativeAuthoring: {
      canonicalDatasetVersion: 0,
      topologyGraphAuthorityHash: GRAPH_HASH,
    },
  };
}
function datasetWithEntities(entities) {
  const dataset = { ...emptyDataset(), version: 1, entities };
  return {
    ...dataset,
    sharedModel: buildSharedPipingModelFromWorkspaceDataset(dataset),
  };
}

test('native pipe writeback is session-independent and reopens identically', () => {
  const { base, edited, resolved } = editedTopology();
  const dataset = emptyDataset();
  const leftEntities = applyCanonicalTopologyToWorkspaceEntities(
    dataset,
    base,
    edited,
    'session-left',
  );
  const rightEntities = applyCanonicalTopologyToWorkspaceEntities(
    dataset,
    base,
    edited,
    'session-right',
  );
  assert.equal(semanticHash(leftEntities), semanticHash(rightEntities));
  assert.equal(leftEntities.length, 1);
  assert.equal(leftEntities[0].entityId, resolved.generated.componentKey);
  assert.ok(!leftEntities[0].entityId.startsWith('edit:'));

  const recovered = recoverNativePipeCanonicalRecords(leftEntities[0]);
  assert.deepEqual(recovered.nodes, edited.nodes);
  assert.deepEqual(recovered.edge, edited.edges[0]);

  const committed = datasetWithEntities(leftEntities);
  const graph = buildPipingPortTopologyGraph(committed.sharedModel);
  const reopened = buildCanonicalTopologyFromWorkspaceDataset(committed, graph);

  assert.deepEqual(reopened.nodes, edited.nodes);
  assert.deepEqual(reopened.edges, edited.edges);
  assert.deepEqual(reopened.crosswalk, edited.crosswalk);
  assert.equal(reopened.canonicalTopologyHash, edited.canonicalTopologyHash);
});

test('native reopen rejects changed explicit node position', () => {
  const { base, edited } = editedTopology();
  const entities = applyCanonicalTopologyToWorkspaceEntities(
    emptyDataset(),
    base,
    edited,
    'session',
  );
  const tampered = JSON.parse(JSON.stringify(entities));
  tampered[0].properties.nativeParams.endpointNodes[0].position.x = 25;
  assert.throws(
    () => datasetWithEntities(tampered),
    /writeback|differs|incomplete/u,
  );
});
