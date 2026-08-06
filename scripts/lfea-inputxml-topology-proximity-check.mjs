#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  diagnoseInputXmlTopologyProximity,
  requireTopologyProximityDiagnostics,
} from '../src/core/geometry/model-health/index.js';
import {
  diagnoseInputXmlModelHealthProximity,
} from '../src/core/linear-piping-analysis-consumer/inputxml-model-health.js';

console.log('\n--- InputXML topology proximity diagnostics ---');

const tolerances = Object.freeze({
  nodeAbsoluteTolerance: 1e-6,
  nodeRelativeTolerance: 1e-9,
  nodeNearTolerance: 1e-3,
  segmentAbsoluteTolerance: 1e-6,
  segmentRelativeTolerance: 1e-9,
  segmentNearTolerance: 1e-3,
  angularTolerance: 1e-10,
});

const clean = bundle(
  [node('A', 0, 0), node('B', 10, 0), node('C', 10, 10)],
  [segment('S1', 'A', 'B'), segment('S2', 'B', 'C')],
);
const cleanReport = diagnoseInputXmlModelHealthProximity(clean, tolerances);
assert.equal(cleanReport.status, 'PASS');
assert.equal(cleanReport.summary.segmentClassCounts.SHARED_ENDPOINT, 1);
assert.equal(cleanReport.findings.length, 0);
assert.equal(requireTopologyProximityDiagnostics(cleanReport, clean), cleanReport);
console.log('✅ Ordinary shared-endpoint connectivity passes without inferred findings.');

const exactDuplicate = bundle(
  [node('A', 0, 0), node('B', 10, 0), node('C', 0, 0), node('D', 10, 0)],
  [segment('S1', 'A', 'B'), segment('S2', 'C', 'D')],
);
const exactReport = diagnoseInputXmlTopologyProximity(exactDuplicate, tolerances);
assert.equal(exactReport.status, 'BLOCKED');
assert.equal(exactReport.summary.nodeClassCounts.EXACT_COINCIDENT, 2);
assert.equal(exactReport.summary.segmentClassCounts.EXACT_DUPLICATE, 1);
assert.ok(exactReport.findings.some((row) => row.code === 'TOPOLOGY_EXACT_DUPLICATE_SEGMENTS'));
console.log('✅ Exact node coincidence and exact duplicate spans remain separate blocking evidence.');

const numericDuplicate = bundle(
  [
    node('A', 0, 0), node('B', 10, 0),
    node('C', 0, 5e-7), node('D', 10, 5e-7),
  ],
  [segment('S1', 'A', 'B'), segment('S2', 'C', 'D')],
);
const numericReport = diagnoseInputXmlTopologyProximity(numericDuplicate, tolerances);
assert.equal(numericReport.summary.nodeClassCounts.NUMERIC_COINCIDENT, 2);
assert.equal(numericReport.summary.segmentClassCounts.NUMERIC_DUPLICATE, 1);
assert.equal(numericReport.summary.segmentClassCounts.EXACT_DUPLICATE ?? 0, 0);
assert.ok(numericReport.findings.some((row) => row.code === 'TOPOLOGY_NUMERIC_DUPLICATE_SEGMENTS'));
console.log('✅ Tolerance-equivalent geometry is not mislabeled as exact.');

const nearNodes = bundle(
  [node('A', 0, 0), node('B', 5e-4, 0)],
  [],
);
const nearNodeReport = diagnoseInputXmlTopologyProximity(nearNodes, tolerances);
assert.equal(nearNodeReport.status, 'CONDITIONAL');
assert.equal(nearNodeReport.summary.nodeClassCounts.NEAR_COINCIDENT, 1);
assert.deepEqual(nearNodeReport.findings[0].capabilityEffects, [{
  capabilityId: STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  effect: 'ADVISORY',
}]);
assert.deepEqual(nearNodeReport.findings[0].blocks, []);
console.log('✅ Near-coincident nodes are explicit advisories, not severity-derived blocks.');

const overlap = bundle(
  [node('A', 0, 0), node('B', 10, 0), node('C', 5, 0), node('D', 15, 0)],
  [segment('S1', 'A', 'B'), segment('S2', 'C', 'D')],
);
const overlapReport = diagnoseInputXmlTopologyProximity(overlap, tolerances);
assert.equal(overlapReport.summary.segmentClassCounts.COLLINEAR_OVERLAP, 1);
assert.ok(overlapReport.findings.some((row) => row.code === 'TOPOLOGY_COLLINEAR_SEGMENT_OVERLAP'));
console.log('✅ Partial collinear overlap blocks independently of endpoint identity.');

const crossing = bundle(
  [node('A', -5, 0), node('B', 5, 0), node('C', 0, -5), node('D', 0, 5)],
  [segment('S1', 'A', 'B'), segment('S2', 'C', 'D')],
);
const crossingReport = diagnoseInputXmlTopologyProximity(crossing, tolerances);
assert.equal(crossingReport.summary.segmentClassCounts.INTERIOR_INTERSECTION, 1);
assert.ok(crossingReport.findings.some((row) => row.code === 'TOPOLOGY_UNNODED_INTERIOR_INTERSECTION'));
console.log('✅ Interior crossings require explicit topology.');

const endpointOnInterior = bundle(
  [node('A', 0, 0), node('B', 10, 0), node('C', 5, 0), node('D', 5, 5)],
  [segment('S1', 'A', 'B'), segment('S2', 'C', 'D')],
);
const endpointReport = diagnoseInputXmlTopologyProximity(endpointOnInterior, tolerances);
assert.equal(endpointReport.summary.segmentClassCounts.ENDPOINT_ON_INTERIOR, 1);
assert.ok(endpointReport.findings.some((row) => row.code === 'TOPOLOGY_ENDPOINT_ON_SEGMENT_INTERIOR'));
console.log('✅ Endpoint-on-interior contact is not accepted as connectivity.');

const unsharedEndpoint = bundle(
  [node('A', 0, 0), node('B', 10, 0), node('C', 10, 0), node('D', 10, 10)],
  [segment('S1', 'A', 'B'), segment('S2', 'C', 'D')],
);
const endpointContactReport = diagnoseInputXmlTopologyProximity(unsharedEndpoint, tolerances);
assert.equal(endpointContactReport.summary.segmentClassCounts.COINCIDENT_ENDPOINT_CONTACT, 1);
assert.ok(endpointContactReport.findings.some((row) => row.code === 'TOPOLOGY_UNSHARED_COINCIDENT_ENDPOINTS'));
console.log('✅ Coincident endpoints with different identities block rather than auto-connect.');

const nearMiss = bundle(
  [node('A', -5, 0, 0), node('B', 5, 0, 0), node('C', 0, -5, 5e-4), node('D', 0, 5, 5e-4)],
  [segment('S1', 'A', 'B'), segment('S2', 'C', 'D')],
);
const nearMissReport = diagnoseInputXmlTopologyProximity(nearMiss, tolerances);
assert.equal(nearMissReport.status, 'CONDITIONAL');
assert.equal(nearMissReport.summary.segmentClassCounts.NEAR_MISS, 1);
const nearMissFinding = nearMissReport.findings.find((row) => row.code === 'TOPOLOGY_SEGMENT_NEAR_MISS');
assert.ok(Math.abs(nearMissFinding.evidence.evidence.distance - 5e-4) < 1e-12);
console.log('✅ Small three-dimensional clearance is advisory and never inferred as a connection.');

const skew = bundle(
  [node('A', -5, 0, 0), node('B', 5, 0, 0), node('C', 0, -5, 1), node('D', 0, 5, 1)],
  [segment('S1', 'A', 'B'), segment('S2', 'C', 'D')],
);
const skewReport = diagnoseInputXmlTopologyProximity(skew, tolerances);
assert.equal(skewReport.status, 'PASS');
assert.equal(skewReport.segmentInteractions.length, 0);
console.log('✅ Clearly separated skew spans remain disjoint.');

const translatedReport = diagnoseInputXmlTopologyProximity(translateBundle(nearMiss, 1e8, -2e8, 3e8), tolerances);
assert.deepEqual(
  translatedReport.nodeProximities.map((row) => row.classification),
  nearMissReport.nodeProximities.map((row) => row.classification),
);
assert.deepEqual(
  translatedReport.segmentInteractions.map((row) => row.classification),
  nearMissReport.segmentInteractions.map((row) => row.classification),
);
console.log('✅ Node and segment proximity classifications are translation invariant.');

const degenerate = bundle(
  [node('A', 0, 0), node('B', 0, 0)],
  [segment('S1', 'A', 'B')],
);
const degenerateReport = diagnoseInputXmlTopologyProximity(degenerate, tolerances);
assert.equal(degenerateReport.status, 'BLOCKED');
assert.equal(degenerateReport.summary.degenerateSegmentCount, 1);
assert.ok(degenerateReport.findings.some((row) => row.code === 'TOPOLOGY_PROXIMITY_SEGMENT_DEGENERATE'));

const unresolved = bundle(
  [node('A', 0, 0), { id: 'B', x: null, y: 0, z: 0, restraint: 'FREE', meta: {} }],
  [segment('S1', 'A', 'B')],
);
const unresolvedReport = diagnoseInputXmlTopologyProximity(unresolved, tolerances);
assert.equal(unresolvedReport.status, 'BLOCKED');
assert.ok(unresolvedReport.findings.some((row) => row.code === 'TOPOLOGY_PROXIMITY_NODE_GEOMETRY_UNRESOLVED'));
assert.ok(unresolvedReport.findings.some((row) => row.code === 'TOPOLOGY_PROXIMITY_SEGMENT_GEOMETRY_UNRESOLVED'));

const invalidSegment = bundle(
  [node('A', 0, 0), node('B', 10, 0)],
  [segment('', 'A', 'B')],
);
const invalidSegmentReport = diagnoseInputXmlTopologyProximity(invalidSegment, tolerances);
assert.equal(invalidSegmentReport.status, 'BLOCKED');
assert.ok(invalidSegmentReport.findings.some((row) => (
  row.code === 'TOPOLOGY_PROXIMITY_SEGMENT_GEOMETRY_UNRESOLVED'
  && row.evidence.reasons.includes('SEGMENT_ID_INVALID')
)));
console.log('✅ Degenerate, unresolved, and unidentified geometry fail closed once per governed entity.');

const tampered = structuredClone(cleanReport);
tampered.summary.nodeCount += 1;
assert.throws(() => requireTopologyProximityDiagnostics(tampered), /semantic hash mismatch/u);
const changed = translateBundle(clean, 1, 0, 0);
assert.throws(() => requireTopologyProximityDiagnostics(cleanReport, changed), /stale/u);
assert.throws(
  () => diagnoseInputXmlTopologyProximity(clean, { ...tolerances, nodeNearTolerance: 1e-7 }),
  /nodeNearTolerance/u,
);
assert.throws(
  () => diagnoseInputXmlTopologyProximity(clean, { ...tolerances, angularTolerance: 2 }),
  /angularTolerance/u,
);
console.log('✅ Tampered, stale, and invalid tolerance authorities are rejected.');

const repeated = diagnoseInputXmlTopologyProximity(clean, tolerances);
assert.equal(JSON.stringify(repeated), JSON.stringify(cleanReport));
assert.equal(new Set(exactReport.findings.map((row) => row.findingId)).size, exactReport.findings.length);
console.log('✅ Report replay and finding identities are deterministic.');
console.log('\n✅ InputXML topology proximity diagnostics check passed.\n');

function node(id, x, y, z = 0) {
  return { id, x, y, z, restraint: 'FREE', meta: {} };
}

function segment(id, startNodeId, endNodeId) {
  return { id, startNodeId, endNodeId, type: 'PIPE', length: null, meta: {} };
}

function bundle(nodes, segments) {
  const elementRecords = segments.map((row, sourceIndex) => ({
    sourceFeatureId: `PIPINGELEMENT[${sourceIndex}]`,
    sourceIndex,
    fromNodeId: row.startNodeId,
    toNodeId: row.endNodeId,
    rawDelta: { x: 0, y: 0, z: 0 },
    rawAttributes: {},
    childFeatures: [],
    fieldEvidence: {},
    canonicalSegmentId: row.id,
    canonicalSegmentType: 'PIPE',
    canonicalStatus: 'RECONCILED',
  }));
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    nodes,
    segments,
    source: 'PROXIMITY_FIXTURE',
    unit: 'mm',
    diagnostics: [],
    summary: {},
    valid: true,
  };
  return {
    schema: 'fea-inputxml-model-health-source/v1',
    source: 'PROXIMITY_FIXTURE',
    fileName: 'proximity.xml',
    jobName: 'PROXIMITY',
    modelFeatureId: 'PIPINGMODEL[0]',
    modelAttributes: {},
    unitSystem: { lengthUnit: 'mm', declared: false },
    elementRecords,
    sourceRecordCount: elementRecords.length,
    canonicalSegmentCount: segments.length,
    geometry,
    diagnostics: [],
  };
}

function translateBundle(source, x, y, z) {
  const translated = structuredClone(source);
  translated.geometry.nodes = translated.geometry.nodes.map((row) => ({
    ...row,
    x: row.x + x,
    y: row.y + y,
    z: row.z + z,
  }));
  return translated;
}
