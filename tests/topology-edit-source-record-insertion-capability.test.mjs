import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { buildCanonicalTopologyFromWorkspaceDataset } from '../src/workspace/topology-edit/topology-edit-source-adapter.js';
import { prepareTopologyEditInputXmlWriteback } from '../src/workspace/topology-edit/export/topology-edit-inputxml-writeback.js';
import {
  buildTopologyEditSourceRepresentability,
  createTopologyEditSourceCapabilityProfile,
  SOURCE_CAPABILITY,
  SOURCE_REPRESENTABILITY,
} from '../src/workspace/topology-edit/export/topology-edit-source-representability.js';
import {
  assessTopologyEditSourceRecordInsertion,
  assertTopologyEditSourceRecordInsertionCapability,
  SOURCE_RECORD_INSERTION_BLOCKER,
  SOURCE_RECORD_INSERTION_FAMILY,
} from '../src/workspace/topology-edit/export/topology-edit-source-record-insertion-capability.js';
import { prepareTopologyEditStagedJsonWriteback } from '../src/workspace/topology-edit/export/topology-edit-stagedjson-writeback.js';

const Q3 = new URL('../public/fixtures/topology-edit-table-q3-exact.staged.json', import.meta.url);
const XML = `<?xml version="1.0"?>
<ROOT><UNITS><LENGTH LABEL="MM" FACTOR="25.4"/></UNITS><PIPINGMODEL JOBNAME="INSERT">
<PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="80"/>
</PIPINGMODEL></ROOT>`;

async function stagedFixture() {
  const bytes = new Uint8Array(await readFile(Q3));
  const raw = JSON.parse(new TextDecoder().decode(bytes));
  const dataset = normalizeWorkspaceDataset(raw, 'topology-edit-table-q3-exact.staged.json', { sourceBytes: bytes });
  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  const base = finalizeCanonicalTopology(buildCanonicalTopologyFromWorkspaceDataset(dataset, graph));
  const from = base.edges.find((row) => row.componentKey === 'P-R42')?.toNodeId;
  const to = base.edges.find((row) => row.componentKey === 'P-TAIL')?.toNodeId;
  assert.ok(from && to);
  const newEdge = nativePipe('edge:native-new', 'native:pipe:new', from, to);
  const rawEdited = structuredClone(base); delete rawEdited.canonicalTopologyHash;
  rawEdited.edges.push(newEdge);
  const edited = finalizeCanonicalTopology(rawEdited);
  return { dataset, base, edited, newEdge };
}

function inputXmlFixture() {
  const sourceHash = semanticHash(XML);
  const base = finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1', datasetId: 'inputxml-insertion', datasetVersion: 1,
    sourceHash, topologyGraphHash: 'explicit-bindings',
    nodes: [node('node:10', 0), node('node:20', 1000), node('node:30', 2000)],
    edges: [{
      id: 'edge:existing', componentKey: 'PIPINGELEMENT[0]', fromNodeId: 'node:10', toNodeId: 'node:20',
      entityType: 'PIPE', diameterMm: 80,
    }],
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
  const raw = structuredClone(base); delete raw.canonicalTopologyHash;
  const newEdge = nativePipe('edge:native-inputxml', 'native:pipe:inputxml', 'node:20', 'node:30');
  raw.edges.push(newEdge);
  const edited = finalizeCanonicalTopology(raw);
  return { sourceHash, base, edited, newEdge };
}

function nativePipe(id, componentKey, fromNodeId, toNodeId) {
  return {
    id, componentKey, fromNodeId, toNodeId, entityType: 'PIPE',
    diameterMm: 80, outsideDiameterMm: 88.9, diameterAuthority: 'OUTSIDE_DIAMETER',
    identityKind: 'NATIVE_COMMAND', topologyOperation: 'INSERT_PIPE_SEGMENT',
    lastModifiedByCommandId: 'command:native-insertion',
    catalogueBinding: {
      catalogueId: 'PIPE', catalogueVersion: 'A', catalogueHash: 'sha256:pipe-cat',
      sourceHash: 'sha256:pipe-source', recordId: 'PIPE-DN80', recordHash: 'sha256:pipe-80',
      sourceReference: { documentId: 'PIPE-SPEC', revision: 'A', path: '/80' },
    },
  };
}
function node(id, x) { return { id, position: { x, y: 0, z: 0 }, portKeys: [] }; }

function exactExceptInsertionProfile() {
  const capabilities = Object.fromEntries(
    Object.values(SOURCE_CAPABILITY).map((key) => [key, SOURCE_REPRESENTABILITY.EXACT]),
  );
  capabilities[SOURCE_CAPABILITY.SOURCE_RECORD_INSERTION] = SOURCE_REPRESENTABILITY.BLOCKING;
  capabilities[SOURCE_CAPABILITY.OPAQUE_SOURCE_FIELDS] = SOURCE_REPRESENTABILITY.PRESERVED_OPAQUE;
  return createTopologyEditSourceCapabilityProfile({
    family: 'SOURCE_INSERTION_TEST', version: '1', capabilities,
  });
}

test('new native pipe produces one explicit source-record-insertion engineering fact', async () => {
  const { dataset, edited, newEdge } = await stagedFixture();
  const report = buildTopologyEditSourceRepresentability({
    canonicalTopology: edited,
    dataset,
    profile: exactExceptInsertionProfile(),
  });
  const insertion = report.rows.filter((row) => row.property === 'sourceRecordInsertion');
  assert.equal(insertion.length, 1);
  assert.equal(insertion[0].canonicalId, newEdge.id);
  assert.equal(insertion[0].capability, SOURCE_CAPABILITY.SOURCE_RECORD_INSERTION);
  assert.equal(insertion[0].classification, SOURCE_REPRESENTABILITY.BLOCKING);
  assert.equal(report.blockers.some((row) => row.canonicalId === newEdge.id), true);
});

test('StagedJSON surgical writer blocks new native source record before existing-pointer patching', async () => {
  const { dataset, base, edited, newEdge } = await stagedFixture();
  const capability = assessTopologyEditSourceRecordInsertion({
    family: SOURCE_RECORD_INSERTION_FAMILY.STAGED_JSON,
    baseCanonicalTopology: base,
    canonicalTopology: edited,
  });
  assertTopologyEditSourceRecordInsertionCapability(capability);
  assert.equal(capability.status, 'BLOCKED');
  assert.equal(capability.blockers.length, 1);
  assert.equal(capability.blockers[0].canonicalId, newEdge.id);
  assert.equal(capability.blockers[0].nativeGovernedPipe, true);
  assert.equal(capability.blockers[0].code, SOURCE_RECORD_INSERTION_BLOCKER.STAGED_JSON);
  assert.throws(() => prepareTopologyEditStagedJsonWriteback({
    dataset,
    baseCanonicalTopology: base,
    canonicalTopology: edited,
  }), /STAGEDJSON_SOURCE_RECORD_INSERTION_UNSUPPORTED/u);
  assert.equal(dataset.sourceSnapshot.sourceSemanticHash, base.sourceHash);
});

test('InputXML writer blocks new native PIPINGELEMENT insertion before binding or text mutation', () => {
  const { sourceHash, base, edited, newEdge } = inputXmlFixture();
  const capability = assessTopologyEditSourceRecordInsertion({
    family: SOURCE_RECORD_INSERTION_FAMILY.INPUT_XML,
    baseCanonicalTopology: base,
    canonicalTopology: edited,
  });
  assert.equal(capability.status, 'BLOCKED');
  assert.equal(capability.blockers[0].canonicalId, newEdge.id);
  assert.equal(capability.blockers[0].nativeGovernedPipe, true);
  assert.equal(capability.blockers[0].code, SOURCE_RECORD_INSERTION_BLOCKER.INPUT_XML);
  assert.throws(() => prepareTopologyEditInputXmlWriteback({
    inputXmlText: XML,
    expectedSourceHash: sourceHash,
    baseCanonicalTopology: base,
    canonicalTopology: edited,
    bindings: {
      nodes: { 'node:10': '10', 'node:20': '20', 'node:30': '30' },
      edges: { 'edge:existing': { sourceIndex: 0, fromNodeId: '10', toNodeId: '20' } },
    },
    canonicalLengthUnit: 'mm',
    fallbackInputXmlLengthUnit: 'mm',
  }), /INPUTXML_SOURCE_RECORD_INSERTION_UNSUPPORTED/u);
  assert.equal(semanticHash(XML), sourceHash);
});
