import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { inputXmlToCanonicalGeometry } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import {
  assessTopologyEditInputXmlEngineeringDelta,
  assertTopologyEditInputXmlEngineeringCapability,
  createTopologyEditQualifiedInputXmlProfile,
  INPUTXML_ENGINEERING_BLOCKER,
} from '../src/workspace/topology-edit/export/topology-edit-inputxml-engineering-capability.js';
import {
  buildTopologyEditSourceRepresentability,
  SOURCE_CAPABILITY,
} from '../src/workspace/topology-edit/export/topology-edit-source-representability.js';
import { prepareTopologyEditInputXmlWriteback } from '../src/workspace/topology-edit/export/topology-edit-inputxml-writeback.js';

const BM3 = new URL('../benchmarks/LFEA/BM3/BM3_InputXML.xml', import.meta.url);
const BM2 = new URL('../benchmarks/LFEA/BM2/Input_BM2.xml', import.meta.url);
const XML = `<?xml version="1.0"?>
<ROOT><UNITS><LENGTH LABEL="MM" FACTOR="25.4"/></UNITS><PIPINGMODEL JOBNAME="CAP">
<PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="200" DELTA_Y="0" DELTA_Z="0" DIAMETER="80">
<RIGID WEIGHT="100" TYPE="Valve"/>
</PIPINGELEMENT></PIPINGMODEL></ROOT>`;

function node(id, x, y = 0) { return { id, position: { x, y, z: 0 } }; }
function catalogue(recordId, valveType) {
  return {
    catalogueHash: 'sha256:valves', sourceHash: 'sha256:valves-source',
    recordId, recordHash: `sha256:${recordId}`, componentType: 'VALVE',
    nominalSizeMm: 80, outsideDiameterMm: 88.9, pipingClass: 'PCL-80',
    pressureClass: '150', materialSpecification: 'A216-WCB', componentMassKg: 20,
    endConnectionFrom: 'FLANGED', endConnectionTo: 'FLANGED', valveType,
    valveFaceToFaceMm: valveType === 'BALL' ? 300 : 200,
    sourceReference: { documentId: 'VALVES', revision: 'A', path: `/${valveType}/80` },
  };
}
function baseValveTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1', datasetId: 'inputxml-capability', datasetVersion: 1,
    sourceHash: semanticHash(XML), topologyGraphHash: 'explicit-inputxml-bindings',
    nodes: [node('node:10', 0), node('node:20', 200)],
    edges: [{
      id: 'edge:valve', componentKey: 'PIPINGELEMENT[0]', fromNodeId: 'node:10', toNodeId: 'node:20',
      entityType: 'VALVE', diameterMm: 80, outsideDiameterMm: 88.9,
      componentLengthMm: 200, valveFaceToFaceMm: 200, valveType: 'GATE',
      catalogueBinding: catalogue('GATE-DN80-C150', 'GATE'),
    }],
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}
function ballValveTopology(base) {
  const raw = structuredClone(base); delete raw.canonicalTopologyHash;
  raw.edges[0] = {
    ...raw.edges[0],
    componentLengthMm: 300, valveFaceToFaceMm: 300, valveType: 'BALL',
    catalogueBinding: catalogue('BALL-DN80-C150', 'BALL'),
    topologyOperation: 'REPLACE_INLINE_COMPONENT', lastModifiedByCommandId: 'cmd:m06',
  };
  raw.nodes[1].position.x = 300;
  return finalizeCanonicalTopology(raw);
}
function teeRelationTopology(withRelation = false) {
  const branchRelation = withRelation ? {
    schema: 'TopologyEditJunctionBranchRelation.v1', relationPolicy: 'EXPLICIT_REDUCER',
    branchNodeId: 'node:b', branchPortKey: 'TEE:port:branch-1', runNodeIds: ['node:r1', 'node:r2'],
    reducerEdgeId: 'edge:red', reducerRecordId: 'RED-100-80', reducerRecordHash: 'sha256:red',
    reducerCatalogueHash: 'sha256:red-cat', reducerSourceHash: 'sha256:red-source',
    runNominalSizeMm: 150, teeBranchNominalSizeMm: 100, downstreamNominalSizeMm: 80,
    relationHash: 'sha256:relation',
  } : undefined;
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1', datasetId: 'inputxml-tee-capability', datasetVersion: 1,
    sourceHash: semanticHash(XML), topologyGraphHash: 'explicit-inputxml-bindings',
    nodes: [node('node:r1', 0), node('node:r2', 200), node('node:b', 100, 100)],
    edges: [{ id: 'edge:run', fromNodeId: 'node:r1', toNodeId: 'node:r2', entityType: 'PIPE' }],
    junctions: [{
      id: 'junction:tee', nodeIds: ['node:r1', 'node:r2', 'node:b'], entityType: 'TEE',
      ...(branchRelation ? { branchRelation, topologyOperation: 'UPDATE_JUNCTION_BRANCH_RELATION' } : {}),
    }],
    supports: [], boundaries: [], rigids: [], bends: [],
  });
}

test('real CAESAR InputXML exposes generic valves and two-node SIF tee segments only', async () => {
  const bm3 = await readFile(BM3, 'utf8');
  const valveTags = [...bm3.matchAll(/<RIGID\b[^>]*\bTYPE="Valve"[^>]*\/>/giu)];
  assert.ok(valveTags.length > 0, 'BM3 must contain real generic Valve RIGID records.');
  assert.equal(valveTags.every((match) => !/\b(?:GATE|BALL)\b/iu.test(match[0])), true);
  const parsedBm3 = inputXmlToCanonicalGeometry(bm3, { source: 'BM3-inputxml-capability' });
  assert.ok(parsedBm3.segments.some((row) => row.type === 'VALVE'));

  const bm2 = await readFile(BM2, 'utf8');
  assert.match(bm2, /<SIF\b[^>]*\bTYPE="3\.000000"/iu);
  const parsedBm2 = inputXmlToCanonicalGeometry(bm2, { source: 'BM2-inputxml-capability' });
  const tees = parsedBm2.segments.filter((row) => row.type === 'TEE');
  assert.ok(tees.length > 0, 'BM2 must contain production-parser TEE evidence.');
  assert.equal(tees.every((row) => row.startNodeId && row.endNodeId && !row.branchNodeId && !row.branchPortKey), true);
});

test('InputXML capability gate blocks exact M06 subtype/catalogue and M10 branch relation', () => {
  const baseValve = baseValveTopology();
  const ballValve = ballValveTopology(baseValve);
  const baseTee = teeRelationTopology(false);
  const editedTee = teeRelationTopology(true);
  const valveGate = assessTopologyEditInputXmlEngineeringDelta({
    baseCanonicalTopology: baseValve, canonicalTopology: ballValve,
  });
  assertTopologyEditInputXmlEngineeringCapability(valveGate);
  assert.equal(valveGate.status, 'BLOCKED');
  assert.deepEqual(new Set(valveGate.blockers.map((row) => row.code)), new Set([
    INPUTXML_ENGINEERING_BLOCKER.VALVE_SUBTYPE,
    INPUTXML_ENGINEERING_BLOCKER.CATALOGUE_BINDING,
  ]));
  const teeGate = assessTopologyEditInputXmlEngineeringDelta({
    baseCanonicalTopology: baseTee, canonicalTopology: editedTee,
  });
  assert.equal(teeGate.status, 'BLOCKED');
  assert.equal(teeGate.blockers[0].code, INPUTXML_ENGINEERING_BLOCKER.JUNCTION_BRANCH_RELATION);
});

test('qualified InputXML profile exposes the same engineering losses as BLOCKING facts', () => {
  const edited = ballValveTopology(baseValveTopology());
  const tee = teeRelationTopology(true);
  const combined = finalizeCanonicalTopology({
    ...structuredClone(edited),
    junctions: tee.junctions,
    nodes: [...edited.nodes, tee.nodes[2]],
  });
  const report = buildTopologyEditSourceRepresentability({
    canonicalTopology: combined,
    profile: createTopologyEditQualifiedInputXmlProfile(),
  });
  assert.equal(report.status, 'BLOCKED');
  assert.ok(report.blockers.some((row) => row.capability === SOURCE_CAPABILITY.VALVE_SUBTYPE));
  assert.ok(report.blockers.some((row) => row.capability === SOURCE_CAPABILITY.CATALOGUE_BINDING));
  assert.ok(report.blockers.some((row) => row.capability === SOURCE_CAPABILITY.JUNCTION_BRANCH_RELATION));
});

test('InputXML writer rejects M06 before patching while geometry-only authority remains separate', () => {
  const base = baseValveTopology();
  const edited = ballValveTopology(base);
  const bindings = {
    nodes: { 'node:10': '10', 'node:20': '20' },
    edges: { 'edge:valve': { sourceIndex: 0, fromNodeId: '10', toNodeId: '20' } },
  };
  assert.throws(() => prepareTopologyEditInputXmlWriteback({
    inputXmlText: XML,
    expectedSourceHash: semanticHash(XML),
    baseCanonicalTopology: base,
    canonicalTopology: edited,
    bindings,
    canonicalLengthUnit: 'mm',
    fallbackInputXmlLengthUnit: 'mm',
  }), /INPUTXML_GENERIC_RIGID_VALVE_HAS_NO_SUBTYPE.*INPUTXML_CATALOGUE_BINDING_NOT_ROUNDTRIPPABLE/u);
  assert.equal(semanticHash(XML), base.sourceHash);
});
