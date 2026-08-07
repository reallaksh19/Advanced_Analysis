import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import {
  compareTopologyEditRoundTripSemantics,
} from '../src/workspace/topology-edit/export/topology-edit-roundtrip-semantics.js';

function topology(ids = {}) {
  const node1 = ids.n1 ?? 'node:n1';
  const node2 = ids.n2 ?? 'node:n2';
  const edge = ids.edge ?? 'edge:p1';
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: ids.datasetId ?? 'dataset-a', datasetVersion: ids.version ?? 1,
    sourceHash: ids.sourceHash ?? 'sha256:source-a', topologyGraphHash: ids.graphHash ?? 'sha256:graph-a',
    nodes: [
      { id: node1, position: { x: ids.x1 ?? 0, y: 0, z: 0 }, portKeys: ['source-port-a'] },
      { id: node2, position: { x: ids.x2 ?? 1000, y: 0, z: 0 }, portKeys: ['source-port-b'] },
    ],
    edges: [{
      id: edge, componentKey: ids.componentKey ?? 'source-pipe',
      fromNodeId: node1, toNodeId: node2, entityType: 'PIPE',
      diameterMm: 100, outsideDiameterMm: 114, material: 'A106-B', schedule: 'STD',
      sourcePath: ids.sourcePath ?? '/objects/P-1',
      ...(ids.lineage ? {
        topologyOperation: ids.lineage.topologyOperation,
        lastModifiedByCommandId: ids.lineage.lastModifiedByCommandId,
        editAncestry: ids.lineage.editAncestry,
      } : {}),
      catalogueBinding: {
        catalogueId: 'PIPE', catalogueVersion: 'A', catalogueHash: 'sha256:cat',
        sourceHash: 'sha256:cat-source', recordId: 'PIPE-100', recordHash: 'sha256:record',
        sourceReference: { documentId: 'pipe', revision: 'A', path: '/100' },
      },
    }],
    junctions: [], supports: [], boundaries: [], rigids: [],
  });
}

test('lineage/source serialization changes do not create engineering mismatches', () => {
  const expected = topology();
  const actual = topology({
    datasetId: 'dataset-reimport', version: 9, sourceHash: 'sha256:new-source', graphHash: 'sha256:new-graph',
    componentKey: 'reimported-pipe-key', sourcePath: '/normalized/pipe/1',
  });
  const result = compareTopologyEditRoundTripSemantics({ expectedTopology: expected, actualTopology: actual });
  assert.equal(result.status, 'EQUIVALENT');
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.expectedEngineeringHash, result.actualEngineeringHash);
});

test('command journal markers are lineage while engineering fields remain comparable', () => {
  const expected = topology({
    lineage: {
      topologyOperation: 'REPLACE_INLINE_COMPONENT',
      lastModifiedByCommandId: 'cmd:123',
      editAncestry: ['edge:p1', 'cmd:123'],
    },
  });
  const reimported = topology();
  const lineageOnly = compareTopologyEditRoundTripSemantics({
    expectedTopology: expected,
    actualTopology: reimported,
  });
  assert.equal(lineageOnly.status, 'EQUIVALENT');
  assert.equal(lineageOnly.mismatchCount, 0);

  const raw = structuredClone(reimported);
  delete raw.canonicalTopologyHash;
  raw.edges[0].diameterMm = 80;
  const engineeringChanged = finalizeCanonicalTopology(raw);
  const strict = compareTopologyEditRoundTripSemantics({
    expectedTopology: expected,
    actualTopology: engineeringChanged,
  });
  assert.equal(strict.status, 'MISMATCH');
  assert.ok(strict.mismatches[0].paths.some((path) => path.includes('diameterMm')));
});

test('engineering coordinate change fails exactly unless an explicit conversion tolerance permits it', () => {
  const expected = topology();
  const actual = topology({ x2: 1000.0004 });
  const exact = compareTopologyEditRoundTripSemantics({ expectedTopology: expected, actualTopology: actual });
  assert.equal(exact.status, 'MISMATCH');
  assert.equal(exact.mismatchCount, 1);
  assert.equal(exact.mismatches[0].canonicalId, 'node:n2');
  assert.ok(exact.mismatches[0].paths.some((path) => path.includes('position.x')));

  const normalized = compareTopologyEditRoundTripSemantics({
    expectedTopology: expected, actualTopology: actual, coordinateToleranceMm: 0.001,
  });
  assert.equal(normalized.status, 'EQUIVALENT');
});

test('identity changes require explicit exporter/reimport mapping and are never inferred from geometry', () => {
  const expected = topology();
  const actual = topology({ n1: 'node:A', n2: 'node:B', edge: 'edge:X', componentKey: 'new-source-key' });
  const withoutMap = compareTopologyEditRoundTripSemantics({ expectedTopology: expected, actualTopology: actual });
  assert.equal(withoutMap.status, 'MISMATCH');
  assert.ok(withoutMap.mismatchCount >= 3);

  const mapped = compareTopologyEditRoundTripSemantics({
    expectedTopology: expected,
    actualTopology: actual,
    identityMap: {
      'node:n1': 'node:A',
      'node:n2': 'node:B',
      'edge:p1': 'edge:X',
    },
  });
  assert.equal(mapped.status, 'EQUIVALENT');
  assert.equal(mapped.mismatchCount, 0);
});

test('catalogue evidence is engineering-comparable when claimed by target capability', () => {
  const expected = topology();
  const raw = structuredClone(expected);
  delete raw.canonicalTopologyHash;
  raw.edges[0].catalogueBinding.recordHash = 'sha256:different-record';
  const actual = finalizeCanonicalTopology(raw);
  const strict = compareTopologyEditRoundTripSemantics({ expectedTopology: expected, actualTopology: actual });
  assert.equal(strict.status, 'MISMATCH');
  assert.ok(strict.mismatches[0].paths.some((path) => path.includes('catalogueBinding.recordHash')));

  const sourceDoesNotClaimCatalogue = compareTopologyEditRoundTripSemantics({
    expectedTopology: expected, actualTopology: actual, compareCatalogueEvidence: false,
  });
  assert.equal(sourceDoesNotClaimCatalogue.status, 'EQUIVALENT');
});
