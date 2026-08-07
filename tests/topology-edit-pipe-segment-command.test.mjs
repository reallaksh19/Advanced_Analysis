import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTopologyEditSpecificationCatalogue,
} from '../src/workspace/topology-edit/professional/topology-edit-spec-catalog.js';
import {
  createPipeSegmentCatalogueBinding,
  createPipeSegmentRequest,
  resolvePipeSegment,
  applyResolvedPipeSegment,
  assertPipeSegmentEffect,
  createNativePipeWorkspaceEntity,
  recoverNativePipeCanonicalRecords,
} from '../src/workspace/topology-edit/topology-edit-pipe-segment-command.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { semanticHash } from '../src/core/shared-piping-model/index.js';

const SOURCE_HASH = `sha256:${'a'.repeat(64)}`;
const SEGMENT_POLICY = Object.freeze({ minimumLengthMm: 6, overlapToleranceMm: 0.001 });

function catalogue() {
  return createTopologyEditSpecificationCatalogue({
    catalogueId: 'PIPE-CATALOGUE',
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
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'pipe-segment-dataset',
    datasetVersion: 0,
    sourceHash: SOURCE_HASH,
    topologyGraphHash: `sha256:${'b'.repeat(64)}`,
    nodes: [
      { id: 'node:start', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:end', position: { x: 1000, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [], junctions: [], supports: [], boundaries: [], rigids: [],
  });
}
function revision(topology, id) {
  return semanticHash({ kind: 'NODE', record: topology.nodes.find((node) => node.id === id) });
}
function resolveAndApply() {
  const topology = baseTopology();
  const spec = catalogue();
  const binding = createPipeSegmentCatalogueBinding({ catalogue: spec, recordId: 'PIPE-DN50' });
  const request = createPipeSegmentRequest({
    fromNodeId: 'node:start',
    toNodeId: 'node:end',
    catalogueBinding: binding,
    segmentPolicy: SEGMENT_POLICY,
    expectedTargetRevisions: {
      'node:start': revision(topology, 'node:start'),
      'node:end': revision(topology, 'node:end'),
    },
  });
  const resolved = resolvePipeSegment({
    commandId: 'command:pipe-segment', request, canonicalTopology: topology, catalogue: spec,
  });
  const result = applyResolvedPipeSegment(topology, resolved);
  return { topology, result, resolved, binding };
}

test('pipe segment resolution uses exact catalogue evidence and generated stable identity', () => {
  const { topology, result, resolved, binding } = resolveAndApply();
  assert.equal(resolved.catalogueBinding.bindingHash, binding.bindingHash);
  assert.equal(resolved.priorCanonicalHash, topology.canonicalTopologyHash);
  assert.ok(resolved.generated.edgeId.startsWith('edge:native:'));
  assert.ok(resolved.generated.componentKey.startsWith('native-component:'));
  assert.ok(resolved.generated.fromPortKey.endsWith(':port:from'));
  assert.ok(resolved.generated.toPortKey.endsWith(':port:to'));
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].id, resolved.generated.edgeId);
  assert.equal(result.edges[0].componentKey, resolved.generated.componentKey);
  assert.equal(result.edges[0].catalogueRecordHash, binding.recordHash);
  assert.equal(result.edges[0].geometryHash, resolved.geometry.geometryHash);
  assert.equal(result.crosswalk.edgeIdToComponentKey[result.edges[0].id], result.edges[0].componentKey);
  assertPipeSegmentEffect(topology, result, resolved);
});

test('pipe segment identity is deterministic across command ids', () => {
  const topology = baseTopology();
  const spec = catalogue();
  const binding = createPipeSegmentCatalogueBinding({ catalogue: spec, recordId: 'PIPE-DN50' });
  const request = createPipeSegmentRequest({
    fromNodeId: 'node:start', toNodeId: 'node:end', catalogueBinding: binding,
    segmentPolicy: SEGMENT_POLICY,
    expectedTargetRevisions: {
      'node:start': revision(topology, 'node:start'),
      'node:end': revision(topology, 'node:end'),
    },
  });
  const left = resolvePipeSegment({ commandId: 'command:left', request, canonicalTopology: topology, catalogue: spec });
  const right = resolvePipeSegment({ commandId: 'command:right', request, canonicalTopology: topology, catalogue: spec });
  assert.equal(left.generated.edgeId, right.generated.edgeId);
  assert.equal(left.generated.componentKey, right.generated.componentKey);
  assert.equal(left.generated.fromPortKey, right.generated.fromPortKey);
  assert.equal(left.generated.toPortKey, right.generated.toPortKey);
});

test('pipe segment rejects stale node revisions and unsupported endpoint assumptions', () => {
  const topology = baseTopology();
  const spec = catalogue();
  const binding = createPipeSegmentCatalogueBinding({ catalogue: spec, recordId: 'PIPE-DN50' });
  const request = createPipeSegmentRequest({
    fromNodeId: 'node:start', toNodeId: 'node:end', catalogueBinding: binding,
    segmentPolicy: SEGMENT_POLICY,
    expectedTargetRevisions: { 'node:start': 'stale', 'node:end': revision(topology, 'node:end') },
  });
  assert.throws(
    () => resolvePipeSegment({ commandId: 'command:stale', request, canonicalTopology: topology, catalogue: spec }),
    /stale/u,
  );
});

test('pipe segment rejects duplicate or overlapping authored segment', () => {
  const { result, resolved } = resolveAndApply();
  const spec = catalogue();
  const request = createPipeSegmentRequest({
    fromNodeId: 'node:start', toNodeId: 'node:end', catalogueBinding: resolved.catalogueBinding,
    segmentPolicy: SEGMENT_POLICY,
    expectedTargetRevisions: {
      'node:start': revision(result, 'node:start'),
      'node:end': revision(result, 'node:end'),
    },
  });
  assert.throws(
    () => resolvePipeSegment({ commandId: 'command:duplicate', request, canonicalTopology: result, catalogue: spec }),
    /duplicate|overlap/u,
  );
});

test('native writeback and recovery preserve exact identities', () => {
  const { result, resolved } = resolveAndApply();
  const entity = createNativePipeWorkspaceEntity(result, resolved.generated.edgeId);
  const recovered = recoverNativePipeCanonicalRecords(entity);
  assert.equal(entity.entityId, resolved.generated.componentKey);
  assert.equal(recovered.edge.id, resolved.generated.edgeId);
  assert.equal(recovered.edge.componentKey, resolved.generated.componentKey);
  assert.equal(recovered.edge.fromNodeId, 'node:start');
  assert.equal(recovered.edge.toNodeId, 'node:end');
  assert.deepEqual(recovered.edge.nativePortKeys, [
    resolved.generated.fromPortKey, resolved.generated.toPortKey,
  ]);
  assert.deepEqual(recovered.nodes.map((row) => row.id), ['node:end', 'node:start']);
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
