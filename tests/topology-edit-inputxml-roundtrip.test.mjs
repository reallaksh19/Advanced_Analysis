import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { inputXmlToCanonicalGeometry } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import {
  assertTopologyEditInputXmlRoundTrip,
  qualifyTopologyEditInputXmlRoundTrip,
} from '../src/workspace/topology-edit/export/topology-edit-inputxml-roundtrip.js';
import {
  prepareTopologyEditInputXmlWriteback,
} from '../src/workspace/topology-edit/export/topology-edit-inputxml-writeback.js';

const INPUT_XML = `<?xml version="1.0"?>
<ROOT VENDOR_ROOT="KEEP-ROOT">
  <UNITS><LENGTH LABEL="MM" FACTOR="25.4"/></UNITS>
  <PIPINGMODEL JOBNAME="ROUNDTRIP" VENDOR_MODEL="KEEP-MODEL">
    <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="100" VENDOR_CUSTOM="KEEP-A">
      <VENDOR PAYLOAD="KEEP-NESTED-A"/>
    </PIPINGELEMENT>
    <PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="100" VENDOR_CUSTOM="KEEP-B">
      <VENDOR PAYLOAD="KEEP-NESTED-B"/>
    </PIPINGELEMENT>
  </PIPINGMODEL>
</ROOT>`;

function fixture() {
  const parsed = inputXmlToCanonicalGeometry(INPUT_XML, { unit: 'mm', source: 'inputxml-test' });
  assert.equal(parsed.valid, true);
  const nodes = parsed.nodes.map((node) => ({
    id: `node:${node.id}`,
    position: { x: node.x, y: node.y, z: node.z },
  }));
  const edges = parsed.segments.map((segment) => ({
    id: `edge:${segment.meta.sourceIndex}`,
    fromNodeId: `node:${segment.startNodeId}`,
    toNodeId: `node:${segment.endNodeId}`,
    entityType: segment.type,
  }));
  const base = finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'inputxml-roundtrip-test',
    datasetVersion: 1,
    sourceHash: semanticHash(INPUT_XML),
    topologyGraphHash: 'inputxml-explicit-binding-test',
    nodes,
    edges,
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
  const bindings = {
    nodes: Object.fromEntries(parsed.nodes.map((node) => [`node:${node.id}`, String(node.id)])),
    edges: Object.fromEntries(parsed.segments.map((segment) => [
      `edge:${segment.meta.sourceIndex}`,
      {
        sourceIndex: segment.meta.sourceIndex,
        fromNodeId: String(segment.startNodeId),
        toNodeId: String(segment.endNodeId),
      },
    ])),
  };
  return { base, bindings };
}

function moveMiddleNode(base, x = 1200) {
  return finalizeCanonicalTopology({
    ...structuredClone(base),
    nodes: base.nodes.map((node) => node.id === 'node:20'
      ? { ...node, position: { ...node.position, x } }
      : node),
  });
}

function request(overrides = {}) {
  const { base, bindings } = fixture();
  return {
    inputXmlText: INPUT_XML,
    expectedSourceHash: semanticHash(INPUT_XML),
    baseCanonicalTopology: base,
    canonicalTopology: moveMiddleNode(base),
    bindings,
    canonicalLengthUnit: 'mm',
    fallbackInputXmlLengthUnit: 'mm',
    ...overrides,
  };
}

test('InputXML surgical writeback preserves opaque XML and updates every incident delta', () => {
  const result = qualifyTopologyEditInputXmlRoundTrip(request());
  assertTopologyEditInputXmlRoundTrip(result);
  assert.equal(result.status, 'QUALIFIED');
  assert.equal(result.comparison.status, 'EQUIVALENT');
  assert.equal(result.writeback.patchCount, 2);
  assert.match(result.writeback.resultingInputXml, /FROM_NODE="10" TO_NODE="20" DELTA_X="1200"/u);
  assert.match(result.writeback.resultingInputXml, /FROM_NODE="20" TO_NODE="30" DELTA_X="800"/u);
  for (const opaque of ['KEEP-ROOT', 'KEEP-MODEL', 'KEEP-A', 'KEEP-B', 'KEEP-NESTED-A', 'KEEP-NESTED-B']) {
    assert.equal(result.writeback.resultingInputXml.includes(opaque), true, opaque);
  }
  const middle = result.reimportedGeometry.nodes.find((node) => String(node.id) === '20');
  assert.deepEqual({ x: middle.x, y: middle.y, z: middle.z }, { x: 1200, y: 0, z: 0 });
});

test('InputXML writeback rejects stale source custody and stale node binding', () => {
  assert.throws(
    () => prepareTopologyEditInputXmlWriteback(request({ expectedSourceHash: semanticHash(`${INPUT_XML} `) })),
    /source hash is stale/u,
  );
  const stale = request();
  stale.bindings = structuredClone(stale.bindings);
  stale.bindings.edges['edge:0'].toNodeId = '999';
  assert.throws(() => prepareTopologyEditInputXmlWriteback(stale), /node binding is stale/u);
});

test('InputXML writeback fails closed on topology and non-coordinate engineering edits', () => {
  const topologyEdit = request();
  topologyEdit.canonicalTopology = finalizeCanonicalTopology({
    ...structuredClone(topologyEdit.canonicalTopology),
    edges: topologyEdit.canonicalTopology.edges.slice(0, 1),
  });
  assert.throws(() => prepareTopologyEditInputXmlWriteback(topologyEdit), /edges changes are not supported/u);

  const nodeEdit = request();
  nodeEdit.canonicalTopology = finalizeCanonicalTopology({
    ...structuredClone(nodeEdit.canonicalTopology),
    nodes: nodeEdit.canonicalTopology.nodes.map((node) => node.id === 'node:20'
      ? { ...node, vendorEngineeringFlag: 'NEW' }
      : node),
  });
  assert.throws(() => prepareTopologyEditInputXmlWriteback(nodeEdit), /non-coordinate node edit/u);
});

test('InputXML writeback requires exact explicit binding coverage', () => {
  const missing = request();
  missing.bindings = structuredClone(missing.bindings);
  Reflect.deleteProperty(missing.bindings.edges, 'edge:1');
  assert.throws(() => prepareTopologyEditInputXmlWriteback(missing), /missing edge binding edge:1/u);
});
