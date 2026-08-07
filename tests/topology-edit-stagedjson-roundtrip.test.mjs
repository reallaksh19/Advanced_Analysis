import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/topology-graph.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { buildCanonicalTopologyFromWorkspaceDataset } from '../src/workspace/topology-edit/topology-edit-source-adapter.js';
import {
  prepareTopologyEditStagedJsonWriteback,
} from '../src/workspace/topology-edit/export/topology-edit-stagedjson-writeback.js';
import {
  assertTopologyEditStagedJsonRoundTrip,
  qualifyTopologyEditStagedJsonRoundTrip,
} from '../src/workspace/topology-edit/export/topology-edit-stagedjson-roundtrip.js';

function sourcePackage() {
  return {
    schema: 'rvm-converter-stage/v1',
    datasetId: 'dataset-sjson',
    source: { datasetId: 'dataset-sjson', units: 'mm', vendorHeader: 'KEEP-TOP' },
    selected: [{
      item: {
        id: 'BRANCH-1',
        type: 'BRANCH',
        attributes: { OWNER: '/SITE/LINE/B1', VENDOR_BRANCH_TOKEN: 'KEEP-BRANCH' },
        children: [
          pipe('P-001', [0, 0, 0], [1000, 0, 0], 'KEEP-ONE'),
          pipe('P-002', [1000, 0, 0], [2000, 0, 0], 'KEEP-TWO'),
        ],
      },
    }],
    vendorTopLevel: { retained: true, nested: { token: 'OPAQUE' } },
  };
}

function pipe(id, startPoint, endPoint, vendorToken) {
  return {
    id,
    type: 'PIPE',
    sourcePath: `/SITE/LINE/B1/${id}`,
    attributes: {
      TYPE: 'PIPE',
      OWNER: '/SITE/LINE/B1',
      OUTSIDE_DIAMETER_MM: 114.3,
      VENDOR_CUSTOM_FIELD: vendorToken,
    },
    nativeParams: {
      role: 'segment',
      startPoint,
      endPoint,
      center: [
        (startPoint[0] + endPoint[0]) / 2,
        (startPoint[1] + endPoint[1]) / 2,
        (startPoint[2] + endPoint[2]) / 2,
      ],
      vendorOpaqueNested: { code: `OPAQUE-${id}` },
    },
  };
}

function imported() {
  const dataset = normalizeWorkspaceDataset(sourcePackage(), 'dataset-sjson.json');
  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  const canonical = buildCanonicalTopologyFromWorkspaceDataset(dataset, graph);
  return { dataset, graph, canonical };
}

function moveSharedNode(canonical, x = 900) {
  const shared = canonical.nodes.find((node) => {
    const incident = canonical.edges.filter((edge) => edge.fromNodeId === node.id || edge.toNodeId === node.id);
    return incident.length === 2;
  });
  assert.ok(shared, 'fixture must contain one shared route node');
  return finalizeCanonicalTopology({
    ...canonical,
    nodes: canonical.nodes.map((node) => node.id === shared.id
      ? { ...node, position: { ...node.position, x } }
      : node),
  });
}

test('StagedJSON surgical writeback patches exact endpoints/centers and preserves opaque source fields', () => {
  const { dataset, canonical } = imported();
  const edited = moveSharedNode(canonical, 900);
  const beforeOpaque = {
    top: dataset.sourceSnapshot.sourcePackage.vendorTopLevel,
    branch: dataset.sourceSnapshot.sourcePackage.selected[0].item.attributes.VENDOR_BRANCH_TOKEN,
    p1: dataset.sourceSnapshot.sourcePackage.selected[0].item.children[0].attributes.VENDOR_CUSTOM_FIELD,
    p2: dataset.sourceSnapshot.sourcePackage.selected[0].item.children[1].nativeParams.vendorOpaqueNested,
  };
  const result = prepareTopologyEditStagedJsonWriteback({
    dataset,
    baseCanonicalTopology: canonical,
    canonicalTopology: edited,
  });
  assert.equal(result.changedNodeIds.length, 1);
  assert.equal(result.patches.length, 4);
  const output = result.surgical.sourcePackage;
  assert.deepEqual(output.selected[0].item.children[0].nativeParams.endPoint, [900, 0, 0]);
  assert.deepEqual(output.selected[0].item.children[0].nativeParams.center, [450, 0, 0]);
  assert.deepEqual(output.selected[0].item.children[1].nativeParams.startPoint, [900, 0, 0]);
  assert.deepEqual(output.selected[0].item.children[1].nativeParams.center, [1450, 0, 0]);
  assert.deepEqual(output.vendorTopLevel, beforeOpaque.top);
  assert.equal(output.selected[0].item.attributes.VENDOR_BRANCH_TOKEN, beforeOpaque.branch);
  assert.equal(output.selected[0].item.children[0].attributes.VENDOR_CUSTOM_FIELD, beforeOpaque.p1);
  assert.deepEqual(output.selected[0].item.children[1].nativeParams.vendorOpaqueNested, beforeOpaque.p2);
  assert.equal(semanticHash(dataset.sourceSnapshot.sourcePackage), dataset.sourceSnapshot.sourceSemanticHash);
});

test('StagedJSON production re-import is engineering-semantically equivalent', () => {
  const { dataset, canonical } = imported();
  const edited = moveSharedNode(canonical, 900);
  const receipt = qualifyTopologyEditStagedJsonRoundTrip({
    dataset,
    baseCanonicalTopology: canonical,
    canonicalTopology: edited,
  });
  assert.equal(receipt.status, 'QUALIFIED');
  assert.equal(receipt.comparison.status, 'EQUIVALENT');
  assert.equal(receipt.comparison.mismatchCount, 0);
  assert.equal(receipt.reimportedDataset.datasetId, dataset.datasetId);
  assert.notEqual(receipt.resultingSourceSemanticHash, dataset.sourceSnapshot.sourceSemanticHash);
  assertTopologyEditStagedJsonRoundTrip(receipt);
});

test('writeback is deterministic across canonical collection ordering', () => {
  const { dataset, canonical } = imported();
  const edited = moveSharedNode(canonical, 875);
  const permuted = finalizeCanonicalTopology({
    ...edited,
    nodes: [...edited.nodes].reverse(),
    edges: [...edited.edges].reverse(),
  });
  const left = prepareTopologyEditStagedJsonWriteback({ dataset, baseCanonicalTopology: canonical, canonicalTopology: edited });
  const right = prepareTopologyEditStagedJsonWriteback({ dataset, baseCanonicalTopology: canonical, canonicalTopology: permuted });
  assert.equal(left.writebackHash, right.writebackHash);
  assert.equal(left.surgicalPatchHash, right.surgicalPatchHash);
});

test('topology and unsupported engineering changes fail closed before source mutation', () => {
  const { dataset, canonical } = imported();
  const removedEdge = finalizeCanonicalTopology({ ...canonical, edges: canonical.edges.slice(1) });
  assert.throws(() => prepareTopologyEditStagedJsonWriteback({
    dataset, baseCanonicalTopology: canonical, canonicalTopology: removedEdge,
  }), /outside the qualified geometry vocabulary/u);

  const changedType = finalizeCanonicalTopology({
    ...canonical,
    edges: canonical.edges.map((edge, index) => index ? edge : { ...edge, entityType: 'VALVE' }),
  });
  assert.throws(() => prepareTopologyEditStagedJsonWriteback({
    dataset, baseCanonicalTopology: canonical, canonicalTopology: changedType,
  }), /outside the qualified geometry vocabulary/u);
});

test('stale source custody and unqualified point provenance fail closed', () => {
  const { dataset, canonical } = imported();
  const edited = moveSharedNode(canonical, 950);
  const stale = { ...dataset, sourceSnapshot: { ...dataset.sourceSnapshot, sourceSemanticHash: 'stale' } };
  assert.throws(() => prepareTopologyEditStagedJsonWriteback({
    dataset: stale, baseCanonicalTopology: canonical, canonicalTopology: edited,
  }), /stale/u);

  const entity = dataset.entities.find((row) => row.entityId === canonical.edges[0].componentKey);
  const badEntity = {
    ...entity,
    properties: {
      ...entity.properties,
      geometry: {
        ...entity.properties.geometry,
        sources: { ...entity.properties.geometry.sources, end: 'derived.unknown' },
      },
    },
  };
  const badDataset = { ...dataset, entities: dataset.entities.map((row) => row.entityId === badEntity.entityId ? badEntity : row) };
  assert.throws(() => prepareTopologyEditStagedJsonWriteback({
    dataset: badDataset, baseCanonicalTopology: canonical, canonicalTopology: edited,
  }), /not writable/u);
});
