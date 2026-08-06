#!/usr/bin/env node
import assert from 'node:assert/strict';
import { parseInputXmlSourceBundle } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import {
  diagnoseInputXmlTopology,
  requireModelTopologyDiagnostics,
} from '../src/core/geometry/model-health/index.js';
import { diagnoseInputXmlModelHealthSource } from '../src/core/linear-piping-analysis-consumer/inputxml-model-health.js';

console.log('\n--- LFEA InputXML topology diagnostics check ---');

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function inputXml(elements) {
  return [
    '<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input">',
    `<PIPINGMODEL xmlns="" JOBNAME="TOPOLOGY" NUMELT="${elements.length}" NUMBEND="0" NUMRIGID="0" NUMREST="0">`,
    ...elements,
    '</PIPINGMODEL></CAESARII>',
  ].join('');
}

function element({ from, to, dx = 0, dy = 0, dz = 0 }) {
  return `<PIPINGELEMENT FROM_NODE="${from}" TO_NODE="${to}" DELTA_X="${dx}" DELTA_Y="${dy}" DELTA_Z="${dz}" DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A106"/>`;
}

function diagnose(xml, options = {}) {
  const { topology = {}, ...ingestion } = options;
  const sourceBundle = parseInputXmlSourceBundle(xml, { unit: 'mm', ...ingestion });
  return { sourceBundle, report: diagnoseInputXmlTopology(sourceBundle, topology) };
}

const tolerances = Object.freeze({
  absoluteTolerance: 1e-6,
  relativeTolerance: 1e-9,
  nearTolerance: 0.1,
  angularTolerance: 1e-10,
});

const cleanXml = inputXml([
  element({ from: 10, to: 20, dx: 100 }),
  element({ from: 20, to: 30, dy: 100 }),
]);

test('MH-TOP-01', 'clean connected route passes without inferred repairs', () => {
  const { report } = diagnose(cleanXml, { topology: tolerances });
  assert.equal(report.schema, 'fea-model-topology-diagnostics/v1');
  assert.equal(report.status, 'PASS');
  assert.equal(report.summary.connectedComponentCount, 1);
  assert.equal(report.summary.coordinateClosureMismatchCount, 0);
  assert.equal(report.summary.blockingFindingCount, 0);
  assert.equal(report.summary.segmentPairClassCounts.SHARED_ENDPOINT, 1);
});

test('MH-TOP-02', 'a conflicting closed route reports its exact source-delta closure residual', () => {
  const xml = inputXml([
    element({ from: 10, to: 20, dx: 100 }),
    element({ from: 20, to: 30, dy: 100 }),
    element({ from: 30, to: 10, dx: -90, dy: -100 }),
  ]);
  const { report } = diagnose(xml, { topology: tolerances });
  const mismatch = report.coordinateClosure.find((row) => row.status === 'MISMATCH');
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.summary.coordinateClosureMismatchCount, 1);
  assert.equal(mismatch.sourceElementIndex, 2);
  assert.equal(mismatch.residual.x, -10);
  assert.ok(report.findings.some((row) => row.code === 'TOPOLOGY_ELEMENT_DELTA_CLOSURE_MISMATCH'));
});

test('MH-TOP-03', 'distinct exact-coincident nodes and exact duplicate spans are separate blocking findings', () => {
  const xml = inputXml([
    element({ from: 10, to: 20, dx: 100 }),
    element({ from: 10, to: 30, dx: 100 }),
  ]);
  const { report } = diagnose(xml, { topology: tolerances });
  assert.equal(report.summary.exactCoincidentNodePairCount, 1);
  assert.equal(report.summary.segmentPairClassCounts.EXACT_DUPLICATE, 1);
  assert.ok(report.findings.some((row) => row.code === 'TOPOLOGY_DISTINCT_NODES_EXACTLY_COINCIDENT'));
  assert.ok(report.findings.some((row) => row.code === 'TOPOLOGY_EXACT_DUPLICATE_SEGMENTS'));
});

test('MH-TOP-04', 'near and tolerance-coincident node classes are not collapsed together', () => {
  const toleranceXml = inputXml([
    element({ from: 10, to: 20, dx: 100 }),
    element({ from: 10, to: 30, dx: 100.0000005 }),
  ]);
  const nearXml = inputXml([
    element({ from: 10, to: 20, dx: 100 }),
    element({ from: 10, to: 30, dx: 100.05 }),
  ]);
  const within = diagnose(toleranceXml, { topology: tolerances }).report;
  const near = diagnose(nearXml, { topology: tolerances }).report;
  assert.equal(within.summary.toleranceCoincidentNodePairCount, 1);
  assert.equal(near.summary.nearCoincidentNodePairCount, 1);
  assert.ok(within.findings.some((row) => row.code === 'TOPOLOGY_DISTINCT_NODES_COINCIDENT_WITHIN_TOLERANCE'));
  assert.ok(near.findings.some((row) => row.code === 'TOPOLOGY_DISTINCT_NODES_NEAR_COINCIDENT'));
});

test('MH-TOP-05', 'partial collinear span overlap is detected independently of shared endpoint identity', () => {
  const xml = inputXml([
    element({ from: 10, to: 20, dx: 100 }),
    element({ from: 10, to: 30, dx: 50 }),
  ]);
  const { report } = diagnose(xml, { topology: tolerances });
  assert.equal(report.summary.segmentPairClassCounts.COLLINEAR_OVERLAP, 1);
  assert.ok(report.findings.some((row) => row.code === 'TOPOLOGY_COLLINEAR_SEGMENT_OVERLAP'));
});

test('MH-TOP-06', 'two disconnected spans crossing in their interiors require an explicit shared node', () => {
  const xml = inputXml([
    element({ from: 10, to: 20, dx: 100 }),
    element({ from: 30, to: 40, dy: 100 }),
  ]);
  const { report } = diagnose(xml, {
    componentOrigins: { 30: { x: 50, y: -50, z: 0 } },
    topology: tolerances,
  });
  assert.equal(report.summary.connectedComponentCount, 2);
  assert.equal(report.summary.segmentPairClassCounts.INTERIOR_INTERSECTION, 1);
  assert.ok(report.findings.some((row) => row.code === 'TOPOLOGY_MULTIPLE_CONNECTED_COMPONENTS'));
  assert.ok(report.findings.some((row) => row.code === 'TOPOLOGY_UNNODED_INTERIOR_INTERSECTION'));
});

test('MH-TOP-07', 'an endpoint on another span interior is not accepted as connectivity', () => {
  const xml = inputXml([
    element({ from: 10, to: 20, dx: 100 }),
    element({ from: 30, to: 40, dy: 50 }),
  ]);
  const { report } = diagnose(xml, {
    componentOrigins: { 30: { x: 50, y: 0, z: 0 } },
    topology: tolerances,
  });
  assert.equal(report.summary.segmentPairClassCounts.ENDPOINT_ON_INTERIOR, 1);
  assert.ok(report.findings.some((row) => row.code === 'TOPOLOGY_ENDPOINT_ON_SEGMENT_INTERIOR'));
});

test('MH-TOP-08', 'a small 3D clearance is reported as a nonblocking near miss', () => {
  const xml = inputXml([
    element({ from: 10, to: 20, dx: 100 }),
    element({ from: 30, to: 40, dy: 100 }),
  ]);
  const { report } = diagnose(xml, {
    componentOrigins: { 30: { x: 50, y: -50, z: 0.05 } },
    topology: tolerances,
  });
  assert.equal(report.status, 'CONDITIONAL');
  assert.equal(report.summary.segmentPairClassCounts.NEAR_MISS, 1);
  const near = report.segmentInteractions.find((row) => row.classification === 'NEAR_MISS');
  assert.ok(Math.abs(near.evidence.distance - 0.05) < 1e-12);
  assert.ok(report.findings.some((row) => row.code === 'TOPOLOGY_SEGMENT_NEAR_MISS'));
});

test('MH-TOP-09', 'report identity is deterministic, tamper-evident and stale-source bound', () => {
  const first = diagnose(cleanXml, { topology: tolerances });
  const second = diagnose(cleanXml, { topology: tolerances });
  assert.equal(JSON.stringify(first.report), JSON.stringify(second.report));
  assert.equal(requireModelTopologyDiagnostics(first.report, first.sourceBundle), first.report);
  const tampered = structuredClone(first.report);
  tampered.summary.nodeCount += 1;
  assert.throws(() => requireModelTopologyDiagnostics(tampered), /semantic hash mismatch/u);
  const changed = diagnose(inputXml([element({ from: 10, to: 20, dx: 101 })]), { topology: tolerances });
  assert.throws(() => requireModelTopologyDiagnostics(first.report, changed.sourceBundle), /stale/u);
});

test('MH-TOP-10', 'the consumer gateway returns the same source bundle and topology authority', () => {
  const modelHealth = diagnoseInputXmlModelHealthSource(cleanXml, {
    unit: 'mm',
    topology: tolerances,
  });
  assert.equal(modelHealth.schema, 'fea-inputxml-model-health-source/v1');
  assert.equal(modelHealth.status, 'PASS');
  assert.equal(modelHealth.sourceBundleSemanticHash, modelHealth.sourceBundle.semanticHash);
  assert.equal(modelHealth.topology.sourceBundleSemanticHash, modelHealth.sourceBundle.semanticHash);
});

test('MH-TOP-11', 'invalid tolerance policy fails closed', () => {
  const sourceBundle = parseInputXmlSourceBundle(cleanXml, { unit: 'mm' });
  assert.throws(
    () => diagnoseInputXmlTopology(sourceBundle, { absoluteTolerance: 1, nearTolerance: 0.5 }),
    /nearTolerance/u,
  );
});

console.log('LFEA InputXML topology diagnostics check PASS.');
