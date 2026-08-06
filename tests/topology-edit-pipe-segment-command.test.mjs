import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { createTopologyEditSpecificationCatalogue } from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import {
  applyResolvedPipeSegment,
  assertPipeSegmentEffect,
  createNativePipeWorkspaceEntity,
  createPipeSegmentCatalogueBinding,
  createPipeSegmentRequest,
  recoverNativePipeCanonicalRecords,
  resolvePipeSegment,
} from '../src/workspace/topology-edit/topology-edit-pipe-segment-command.js';

const SOURCE_HASH = `sha256:${'a'.repeat(64)}`;

function catalogue(overrides = {}) {
  return createTopologyEditSpecificationCatalogue({
    catalogueId: 'NATIVE-PIPE-CATALOGUE',
    catalogueVersion: '2026.08',
    authority: {
      sourceId: 'PIPE-SPEC-SOURCE', sourceVersion: 'A', sourceHash: SOURCE_HASH,
    },
    records: [{
      recordId: 'PIPE-DN50-S40', componentType: 'PIPE', nominalSizeMm: 50,
      outsideDiameterMm: 60.3, schedule: 'S40', wallThicknessMm: 3.91,
      pressureClass: 'CL150', materialSpecification: 'ASTM-A106-B',
      endConnectionFrom: 'BUTT_WELD', endConnectionTo: 'BUTT_WELD',
      pipingClass: 'CS150',
      sourceReference: {
        documentId: 'PIPE-SPEC', revision: 'A', path: '/records/pipe-dn50-s40',
      },
      ...overrides,
    }],
  });
}
function node(id, x, y = 0, z = 0) {
  return { id, position: { x, y, z }, portKeys: [] };
}
function topology({ nodes = [node('node:start', 0), node('node:end', 1000)], edges = [] } = {}) {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'native-dataset:test', datasetVersion: 0, sourceHash: SOURCE_HASH,
    topologyGraphHash: semanticHash({ nodes, edges }),
    nodes, edges, junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}
function revision(base, id) {
  return semanticHash({ kind: 'NODE', record: base.nodes.find((row) => row.id === id) });
}
function revisions(base) {
  return { 'node:start': revision(base, 'node:start'), 'node:end': revision(base, 'node:end') };
}
function requestFor(base, spec = catalogue(), overrides = {}) {
  return createPipeSegmentRequest({
    fromNodeId: 'node:start', toNodeId: 'node:end',
    catalogueBinding: createPipeSegmentCatalogueBinding({
      catalogue: spec, recordId: 'PIPE-DN50-S40',
    }),
    segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
    expectedTargetRevisions: revisions(base),
    ...overrides,
  });
}
function resolveAndApply(commandId = 'command:start-route:pipe') {
  const base = topology();
  const spec = catalogue();
  const request = requestFor(base, spec);
  const resolved = resolvePipeSegment({ commandId, request, canonicalTopology: base, catalogue: spec });
  const result = applyResolvedPipeSegment(base, resolved);
  return { base, spec, request, resolved, result };
}

test('catalogue-bound pipe creation is deterministic and exact', () => {
  const left = resolveAndApply();
  const right = resolveAndApply();
  assert.equal(left.request.requestHash, right.request.requestHash);
  assert.equal(left.resolved.resolutionHash, right.resolved.resolutionHash);
  assert.deepEqual(left.resolved.generated, right.resolved.generated);
  assert.equal(left.result.canonicalTopologyHash, right.result.canonicalTopologyHash);
  assert.equal(left.result.nodes.length, 2);
  assert.equal(left.result.edges.length, 1);
  assert.deepEqual(left.result.nodes[0].portKeys, [left.resolved.generated.fromPortKey]);
  assert.deepEqual(left.result.nodes[1].portKeys, [left.resolved.generated.toPortKey]);
  assert.equal(
    left.result.crosswalk.edgeIdToComponentKey[left.resolved.generated.edgeId],
    left.resolved.generated.componentKey,
  );
  assert.equal(assertPipeSegmentEffect(left.base, left.result, left.resolved), left.result);
});

test('governed catalogue field tamper and stale catalogue fail closed', () => {
  const base = topology();
  const original = catalogue();
  const binding = createPipeSegmentCatalogueBinding({
    catalogue: original, recordId: 'PIPE-DN50-S40',
  });
  assert.throws(
    () => createPipeSegmentRequest({
      fromNodeId: 'node:start', toNodeId: 'node:end',
      catalogueBinding: { ...binding, schedule: 'S80' },
      segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
      expectedTargetRevisions: revisions(base),
    }),
    /immutable authority/u,
  );
  const request = requestFor(base, original);
  const changed = catalogue({ wallThicknessMm: 5.54, schedule: 'S80' });
  assert.throws(
    () => resolvePipeSegment({
      commandId: 'command:changed-catalogue', request,
      canonicalTopology: base, catalogue: changed,
    }),
    /stale or changed/u,
  );
});

test('missing endpoint revision and stale revision are rejected', () => {
  const base = topology();
  const binding = createPipeSegmentCatalogueBinding({
    catalogue: catalogue(), recordId: 'PIPE-DN50-S40',
  });
  assert.throws(
    () => createPipeSegmentRequest({
      fromNodeId: 'node:start', toNodeId: 'node:end', catalogueBinding: binding,
      segmentPolicy: { minimumLengthMm: 6, overlapToleranceMm: 0.001 },
      expectedTargetRevisions: { 'node:start': revision(base, 'node:start') },
    }),
    /exactly both endpoint IDs/u,
  );
  const request = requestFor(base, catalogue(), {
    expectedTargetRevisions: {
      'node:start': SOURCE_HASH, 'node:end': revision(base, 'node:end'),
    },
  });
  assert.throws(
    () => resolvePipeSegment({
      commandId: 'command:stale-target', request,
      canonicalTopology: base, catalogue: catalogue(),
    }),
    /stale target revision/u,
  );
});

test('zero length and micro-spool requests are rejected', () => {
  const zero = topology({ nodes: [node('node:start', 0), node('node:end', 0)] });
  assert.throws(
    () => resolvePipeSegment({
      commandId: 'command:zero', request: requestFor(zero),
      canonicalTopology: zero, catalogue: catalogue(),
    }),
    /length must be positive/u,
  );
  const short = topology({ nodes: [node('node:start', 0), node('node:end', 5)] });
  assert.throws(
    () => resolvePipeSegment({
      commandId: 'command:short', request: requestFor(short),
      canonicalTopology: short, catalogue: catalogue(),
    }),
    /below minimum/u,
  );
});

test('duplicate and overlapping segment requests are rejected', () => {
  const duplicate = topology({ edges: [{
    id: 'edge:existing', componentKey: 'P-1',
    fromNodeId: 'node:start', toNodeId: 'node:end', entityType: 'PIPE',
  }] });
  assert.throws(
    () => resolvePipeSegment({
      commandId: 'command:duplicate', request: requestFor(duplicate),
      canonicalTopology: duplicate, catalogue: catalogue(),
    }),
    /duplicates existing edge/u,
  );
  const overlap = topology({
    nodes: [
      node('existing:start', 0), node('existing:end', 100),
      node('node:start', 50), node('node:end', 150),
    ],
    edges: [{
      id: 'edge:existing', componentKey: 'P-1',
      fromNodeId: 'existing:start', toNodeId: 'existing:end', entityType: 'PIPE',
    }],
  });
  assert.throws(
    () => resolvePipeSegment({
      commandId: 'command:overlap', request: requestFor(overlap),
      canonicalTopology: overlap, catalogue: catalogue(),
    }),
    /overlaps existing edge/u,
  );
});

test('native writeback and recovery preserve exact identities', () => {
  const { result, resolved } = resolveAndApply();
  const entity = createNativePipeWorkspaceEntity(result, resolved.generated.edgeId);
  const recovered = recoverNativePipeCanonicalRecords(entity);
  assert.equal(entity.entityId, resolved.generated.componentKey);
  assert.equal(recovered.edge.id, resolved.generated.edgeId);
  assert.equal(recovered.edge.componentKey, resolved.generated.componentKey);
  assert.deepEqual(recovered.edge.nativePortKeys, [
    resolved.generated.fromPortKey, resolved.generated.toPortKey,
  ]);
  assert.deepEqual(recovered.nodes.map((row) => row.id), ['node:start', 'node:end']);
});

test('native recovery rejects geometry-only or tampered identity', () => {
  const { result, resolved } = resolveAndApply();
  const entity = createNativePipeWorkspaceEntity(result, resolved.generated.edgeId);
  assert.throws(
    () => recoverNativePipeCanonicalRecords({
      ...entity, properties: { ...entity.properties, nativeParams: null },
    }),
    /nativeParams must use/u,
  );
  const tampered = JSON.parse(JSON.stringify(entity));
  tampered.properties.nativeParams.ports[0].portKey = 'nearest-mesh-port';
  assert.throws(
    () => recoverNativePipeCanonicalRecords(tampered),
    /writeback hash mismatch/u,
  );
});
