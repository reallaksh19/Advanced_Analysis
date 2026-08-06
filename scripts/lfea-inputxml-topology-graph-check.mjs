#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  computeInputXmlModelHealthSourceEvidenceHash,
  computeInputXmlModelHealthSourceSemanticHash,
  diagnoseInputXmlTopologyGraph,
  requireTopologyGraphDiagnostics,
} from '../src/core/geometry/model-health/index.js';
import { diagnoseInputXmlModelHealthTopology } from '../src/core/linear-piping-analysis-consumer/inputxml-model-health.js';

console.log('\n--- InputXML topology graph diagnostics ---');

const clean = bundle({ fileName: 'clean.xml' });
const report = diagnoseInputXmlModelHealthTopology(clean);
assert.equal(report.status, 'PASS');
assert.equal(report.summary.connectedComponentCount, 1);
assert.equal(report.summary.coordinateClosurePassCount, 2);
assert.equal(report.summary.blockingFindingCount, 0);
assert.equal(report.sourceBundleSemanticHash, computeInputXmlModelHealthSourceSemanticHash(clean));
assert.equal(report.sourceBundleEvidenceHash, computeInputXmlModelHealthSourceEvidenceHash(clean));
assert.equal(requireTopologyGraphDiagnostics(report, clean), report);
assert.deepEqual(report.nodeDegrees, { 10: 1, 20: 2, 30: 1 });
console.log('✅ Clean connected source closes exactly and passes.');

const translated = bundle({ translation: { x: 1e12, y: -2e12, z: 3e12 } });
const translatedReport = diagnoseInputXmlTopologyGraph(translated);
assert.deepEqual(
  translatedReport.coordinateClosure.map(({ status, residualNorm }) => ({ status, residualNorm })),
  report.coordinateClosure.map(({ status, residualNorm }) => ({ status, residualNorm })),
);
console.log('✅ Coordinate closure is translation invariant.');

const disconnected = bundle({ disconnected: true });
const disconnectedReport = diagnoseInputXmlTopologyGraph(disconnected);
assert.equal(disconnectedReport.status, 'CONDITIONAL');
const componentFinding = disconnectedReport.findings.find((row) => row.code === 'TOPOLOGY_MULTIPLE_CONNECTED_COMPONENTS');
assert.ok(componentFinding);
assert.deepEqual(componentFinding.capabilityEffects, [{
  capabilityId: STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  effect: 'ADVISORY',
}]);
assert.deepEqual(componentFinding.blocks, []);
console.log('✅ Disconnected components are explicit advisory effects, not severity-derived blocks.');

const loop = bundle({ loopMismatch: true });
const loopReport = diagnoseInputXmlTopologyGraph(loop);
assert.equal(loopReport.status, 'BLOCKED');
assert.equal(loopReport.summary.coordinateClosureMismatchCount, 1);
const mismatch = loopReport.findings.find((row) => row.code === 'TOPOLOGY_ELEMENT_DELTA_CLOSURE_MISMATCH');
assert.ok(mismatch.findingId.includes('PIPINGELEMENT[2]'));
assert.deepEqual(mismatch.blocks, [STRICT_INPUTXML_LINEAR_STATIC_PROFILE]);
console.log('✅ Inconsistent loop closure blocks with stable source identity.');

const unresolved = bundle({ unresolved: true });
const unresolvedReport = diagnoseInputXmlTopologyGraph(unresolved);
assert.equal(unresolvedReport.status, 'BLOCKED');
assert.equal(unresolvedReport.summary.coordinateClosureUnresolvedCount, 1);
assert.ok(unresolvedReport.findings.some((row) => row.code === 'TOPOLOGY_ELEMENT_DELTA_CLOSURE_UNRESOLVED'));
console.log('✅ Unreconciled source rows cannot claim closure.');

const duplicate = bundle({ duplicateIdentities: true });
const duplicateReport = diagnoseInputXmlTopologyGraph(duplicate);
assert.equal(duplicateReport.status, 'BLOCKED');
assert.ok(duplicateReport.findings.some((row) => row.code === 'TOPOLOGY_NODE_ID_DUPLICATE'));
assert.ok(duplicateReport.findings.some((row) => row.code === 'TOPOLOGY_SEGMENT_ID_DUPLICATE'));
assert.equal(new Set(duplicateReport.findings.map((row) => row.findingId)).size, duplicateReport.findings.length);
console.log('✅ Duplicate canonical identities fail closed with unique stable finding IDs.');

const invalid = bundle({ invalidIdentities: true });
const invalidReport = diagnoseInputXmlTopologyGraph(invalid);
assert.equal(invalidReport.status, 'BLOCKED');
assert.ok(invalidReport.findings.some((row) => row.code === 'TOPOLOGY_NODE_ID_INVALID'));
assert.ok(invalidReport.findings.some((row) => row.code === 'TOPOLOGY_SEGMENT_ID_INVALID'));
console.log('✅ Missing canonical identities fail closed by source ordinal.');

const tampered = structuredClone(report);
tampered.summary.nodeCount += 1;
assert.throws(() => requireTopologyGraphDiagnostics(tampered), /semantic hash mismatch/u);
const renamed = structuredClone(clean);
renamed.fileName = 'renamed.xml';
assert.equal(
  computeInputXmlModelHealthSourceSemanticHash(renamed),
  computeInputXmlModelHealthSourceSemanticHash(clean),
);
assert.notEqual(
  computeInputXmlModelHealthSourceEvidenceHash(renamed),
  computeInputXmlModelHealthSourceEvidenceHash(clean),
);
assert.throws(() => requireTopologyGraphDiagnostics(report, renamed), /stale/u);
console.log('✅ Report tamper and stale source evidence are rejected.');

const driftedSource = structuredClone(clean);
driftedSource.elementRecords[1].sourceIndex = 7;
assert.throws(() => diagnoseInputXmlTopologyGraph(driftedSource), /source element identity is invalid/u);
assert.throws(() => diagnoseInputXmlModelHealthTopology('<PIPINGMODEL/>'), /schema is invalid/u);
assert.throws(
  () => diagnoseInputXmlTopologyGraph(clean, { coordinateAbsoluteTolerance: 0 }),
  /finite positive/u,
);
assert.throws(
  () => diagnoseInputXmlTopologyGraph(clean, { coordinateRelativeTolerance: -1 }),
  /finite nonnegative/u,
);
console.log('✅ Diagnostics require a retained bundle and independent valid tolerances.');

const repeated = diagnoseInputXmlTopologyGraph(clean);
assert.equal(JSON.stringify(repeated), JSON.stringify(report));
console.log('✅ Report replay is deterministic.');
console.log('\n✅ InputXML topology graph diagnostics check passed.\n');

function bundle({
  fileName = 'fixture.xml',
  translation = { x: 0, y: 0, z: 0 },
  disconnected = false,
  loopMismatch = false,
  unresolved = false,
  duplicateIdentities = false,
  invalidIdentities = false,
} = {}) {
  const node = (id, x, y = 0, z = 0) => ({
    id: String(id),
    x: x + translation.x,
    y: y + translation.y,
    z: z + translation.z,
    restraint: 'FREE',
    meta: {},
  });
  let nodes;
  let segments;
  let elementRecords;
  if (disconnected) {
    nodes = [node(10, 0), node(20, 100), node(30, 1000), node(40, 1100)];
    segments = [segment('IX-S1', 10, 20, 100), segment('IX-S2', 30, 40, 100)];
    elementRecords = [record(0, 10, 20, 100, 'IX-S1'), record(1, 30, 40, 100, 'IX-S2')];
  } else if (loopMismatch) {
    nodes = [node(10, 0), node(20, 100), node(30, 200)];
    segments = [
      segment('IX-S1', 10, 20, 100),
      segment('IX-S2', 20, 30, 100),
      segment('IX-S3', 30, 10, 150),
    ];
    elementRecords = [
      record(0, 10, 20, 100, 'IX-S1'),
      record(1, 20, 30, 100, 'IX-S2'),
      record(2, 30, 10, -150, 'IX-S3'),
    ];
  } else {
    nodes = [node(10, 0), node(20, 100), node(30, 200)];
    segments = [segment('IX-S1', 10, 20, 100), segment('IX-S2', 20, 30, 100)];
    elementRecords = [record(0, 10, 20, 100, 'IX-S1'), record(1, 20, 30, 100, 'IX-S2')];
  }
  if (unresolved) {
    elementRecords.push({
      ...record(2, null, 40, 10, null),
      fromNodeId: null,
      canonicalSegmentId: null,
      canonicalStatus: 'UNRESOLVED',
    });
  }
  if (duplicateIdentities) {
    nodes.push({ ...nodes[0] });
    segments.push({ ...segments[0] });
  }
  if (invalidIdentities) {
    nodes.push({ ...nodes[0], id: '' });
    segments.push({ ...segments[0], id: null });
  }
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    nodes,
    segments,
    source: 'FIXTURE',
    unit: 'mm',
    diagnostics: [],
    summary: {},
    valid: !unresolved,
  };
  return {
    schema: 'fea-inputxml-model-health-source/v1',
    source: 'FIXTURE',
    fileName,
    jobName: 'FIXTURE',
    modelFeatureId: 'PIPINGMODEL[0]',
    modelAttributes: {},
    unitSystem: { lengthUnit: 'mm', declared: false },
    elementRecords,
    sourceRecordCount: elementRecords.length,
    canonicalSegmentCount: geometry.segments.length,
    geometry,
    diagnostics: [],
  };
}

function segment(id, startNodeId, endNodeId, length) {
  return {
    id,
    startNodeId: String(startNodeId),
    endNodeId: String(endNodeId),
    sourceComponentUid: id.replace('IX-S', 'PIPINGELEMENT[').concat(']'),
    type: 'PIPE',
    length,
    meta: {},
  };
}

function record(sourceIndex, fromNodeId, toNodeId, dx, canonicalSegmentId) {
  return {
    sourceFeatureId: `PIPINGELEMENT[${sourceIndex}]`,
    sourceIndex,
    fromNodeId: fromNodeId === null ? null : String(fromNodeId),
    toNodeId: toNodeId === null ? null : String(toNodeId),
    rawDelta: { x: dx, y: 0, z: 0 },
    rawAttributes: { DELTA_X: String(dx), DELTA_Y: '0', DELTA_Z: '0' },
    childFeatures: [],
    fieldEvidence: {},
    canonicalSegmentId,
    canonicalSegmentType: canonicalSegmentId ? 'PIPE' : null,
    canonicalStatus: canonicalSegmentId ? 'RECONCILED' : 'UNRESOLVED',
  };
}
