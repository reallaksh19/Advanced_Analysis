#!/usr/bin/env node

/**
 * LFEA B-1 geometry conditioning and node seeding check.
 *
 * Covers `src/core/centerline-beam-fea/{geometry-conditioning,node-seeding,
 * bend-geometry}.js`: mandatory node insertion, exact-coincident station
 * custody, span/curvature seeding, rejection of an undeclared limit, branch
 * connectivity (via the existing `piping-topology` connected-components
 * algorithm, not a new graph walker), bend discretisation convergence, and
 * idempotence.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conditionGeometry, discretiseBend } from '../src/core/centerline-beam-fea/index.js';
import { buildConnectedComponents } from '../src/core/piping-topology/connected-components.js';
import { SharedAnalysisContractError } from '../src/core/shared-analysis-contract/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL_GEOMETRY_SCHEMA = 'canonical-geometry-v1';

console.log('\n--- LFEA B-1 geometry conditioning check ---');
checkGuideMidSpan();
checkElbowTangentAndInteriorNodes();
checkWallThicknessChangeNode();
checkMissingSpanSeedingLimitRejected();
checkTeeBranchConnectivity();
checkBendConvergence();
checkIdempotence();
checkCoincidentAttachmentCustody();
checkConflictingCoincidentRestraintsRejected();
checkSourceGuard();
console.log('\n✅ LFEA B-1 geometry conditioning check passed.\n');

function baseGeometry(nodes, segments, overrides = {}) {
  return {
    schemaVersion: CANONICAL_GEOMETRY_SCHEMA,
    nodes,
    segments,
    source: 'fixture',
    unit: 'mm',
    diagnostics: [],
    summary: {},
    ...overrides,
  };
}

function node(id, x, y, z, restraint = 'FREE', meta = {}) {
  return { id, x, y, z, restraint, meta };
}

function segment(id, startNodeId, endNodeId, type, extra = {}) {
  return { id, startNodeId, endNodeId, type, ...extra };
}

function profile(overrides = {}) {
  return {
    spanSeedingLimit: { value: 10000, source: 'FIXTURE-PROFILE' },
    bendSeedingSegments: { value: 4, source: 'FIXTURE-PROFILE' },
    bendLengthErrorLimit: { value: 0.05, source: 'FIXTURE-PROFILE' },
    ...overrides,
  };
}

function checkGuideMidSpan() {
  // Test 1.
  const geometry = baseGeometry(
    [node('N1', 0, 0, 0, 'ANCHOR'), node('N2', 1000, 0, 0, 'ANCHOR')],
    [segment('S1', 'N1', 'N2', 'PIPE', { length: 1000, diameter: 168.3, thickness: 7.11 })],
  );
  const requiredAttachmentPoints = [{ attachmentPointId: 'GUIDE-1', segmentId: 'S1', fraction: 0.5, kind: 'GUIDE' }];
  const result = conditionGeometry(geometry, requiredAttachmentPoints, profile());

  const guideNode = result.geometry.nodes.find((row) => row.meta?.attachmentPointId === 'GUIDE-1');
  assert.ok(guideNode, 'guide node was not inserted');
  assert.equal(guideNode.x, 500);
  assert.equal(guideNode.restraint, 'GUIDE');
  assert.equal(result.geometry.segments.length, 2, 'segment was not split at the guide');
  assert.deepEqual(result.report.attachmentPointsInserted.map((row) => row.attachmentPointId), ['GUIDE-1']);
  console.log('✅ A straight run with one guide mid-span produces a node at the guide.');
}

function checkElbowTangentAndInteriorNodes() {
  // Test 2.
  const radius = 150;
  const start = { x: radius, y: 0, z: 0 };
  const end = { x: 0, y: radius, z: 0 };
  const centre = { x: 0, y: 0, z: 0 };
  const geometry = baseGeometry(
    [node('T1', start.x, start.y, start.z, 'FREE'), node('T2', end.x, end.y, end.z, 'FREE')],
    [segment('E1', 'T1', 'T2', 'ELBOW', { meta: { bendArcCentre: centre } })],
  );
  const bendSeedingSegments = 4;
  const result = conditionGeometry(geometry, [], profile({ bendSeedingSegments: { value: bendSeedingSegments, source: 'FIXTURE-PROFILE' } }));

  assert.equal(result.geometry.segments.length, bendSeedingSegments, 'expected bendSeedingSegments chords');
  const interiorNodes = result.geometry.nodes.filter((row) => row.meta?.bendChordOf === 'E1');
  assert.equal(interiorNodes.length, bendSeedingSegments - 1, 'expected bendSeedingSegments - 1 interior nodes');
  const tangentNodeIds = new Set(result.geometry.nodes.map((row) => row.id));
  assert.ok(tangentNodeIds.has('T1') && tangentNodeIds.has('T2'), 'tangent-point nodes must be preserved');

  // Tangent points are the ORIGINAL nodes verbatim (T1/T2 exactly), not a
  // recomputed point that could carry floating-point rotation noise; compare
  // only the interior chord points against discretiseBend's own output.
  const reference = discretiseBend(start, end, centre, bendSeedingSegments);
  const orderedInteriorIds = interiorNodes.map((row) => row.id).sort((a, b) => Number(a.split('/N')[1]) - Number(b.split('/N')[1]));
  const nodesById = new Map(result.geometry.nodes.map((row) => [row.id, row]));
  orderedInteriorIds.forEach((id, index) => {
    const referencePoint = reference.points[index + 1];
    assert.equal(nodesById.get(id).x, referencePoint.x);
    assert.equal(nodesById.get(id).y, referencePoint.y);
    assert.equal(nodesById.get(id).z, referencePoint.z);
  });
  assert.equal(nodesById.get('T1').x, start.x);
  assert.equal(nodesById.get('T2').y, end.y);
  console.log('✅ A 90-degree elbow produces both tangent-point nodes plus bendSeedingSegments-1 interior nodes, matching discretiseBend exactly.');
}

function checkWallThicknessChangeNode() {
  // Test 3.
  const geometry = baseGeometry(
    [node('N1', 0, 0, 0), node('N2', 2000, 0, 0), node('N3', 4000, 0, 0)],
    [
      segment('S1', 'N1', 'N2', 'PIPE', { length: 2000, thickness: 7.11 }),
      segment('S2', 'N2', 'N3', 'PIPE', { length: 2000, thickness: 12.7 }),
    ],
  );
  const result = conditionGeometry(geometry, [], profile());
  const boundaryNode = result.geometry.nodes.find((row) => row.id === 'N2');
  assert.ok(boundaryNode, 'node at the wall-thickness change must be preserved');
  const touching = result.geometry.segments.filter((row) => row.startNodeId === 'N2' || row.endNodeId === 'N2');
  assert.equal(touching.length, 2);
  assert.notEqual(touching[0].thickness, touching[1].thickness);
  console.log('✅ A wall-thickness change already has a node at the change, and conditioning preserves it.');
}

function checkMissingSpanSeedingLimitRejected() {
  // Test 4.
  const geometry = baseGeometry(
    [node('N1', 0, 0, 0), node('N2', 1000, 0, 0)],
    [segment('S1', 'N1', 'N2', 'PIPE', { length: 1000 })],
  );
  const incompleteProfile = profile();
  delete incompleteProfile.spanSeedingLimit;
  assert.throws(
    () => conditionGeometry(geometry, [], incompleteProfile),
    (error) => error instanceof SharedAnalysisContractError && error.code === 'SPAN_SEEDING_LIMIT_NOT_DECLARED',
  );
  console.log('✅ Omitting spanSeedingLimit is rejected with SPAN_SEEDING_LIMIT_NOT_DECLARED.');
}

function checkTeeBranchConnectivity() {
  // Test 5. A run split into two legs at a branch node, plus a branch leg,
  // all three referencing the SAME node id — the way canonical geometry
  // already represents a tee (see inputXmlToCanonicalGeometry.js, which
  // replaced the PCF importer: independently-listed elements sharing a node
  // id is exactly how InputXML expresses a branch too).
  const geometry = baseGeometry(
    [
      node('N1', 0, 0, 0, 'ANCHOR'),
      node('NB', 1000, 0, 0, 'FREE'),
      node('N2', 2000, 0, 0, 'ANCHOR'),
      node('N3', 1000, 1000, 0, 'FREE'),
    ],
    [
      segment('S1', 'N1', 'NB', 'PIPE', { length: 1000 }),
      segment('S2', 'NB', 'N2', 'PIPE', { length: 1000 }),
      segment('S3', 'NB', 'N3', 'PIPE', { length: 1000 }),
    ],
  );
  const result = conditionGeometry(geometry, [], profile());

  const touchingBranch = result.geometry.segments.filter((row) => row.startNodeId === 'NB' || row.endNodeId === 'NB');
  assert.equal(touchingBranch.length, 3, 'branch node must still be shared by all three legs after conditioning');

  const { components, connections } = portsAndConnectionsFromGeometry(result.geometry);
  const connectedComponents = buildConnectedComponents({ components, ports: connections.ports }, connections.connections);
  assert.equal(connectedComponents.length, 1, 'the whole model must form one connected component');
  assert.equal(connectedComponents[0].componentKeys.length, 3, 'all three legs must belong to the one connected component');
  console.log('✅ A tee produces a node shared by all three legs; piping-topology/connected-components.js confirms one connected branch.');
}

/**
 * Build a `piping-topology/connected-components.js`-compatible projection and
 * connection list directly from conditioned canonical geometry. This calls
 * `buildConnectedComponents` — it does not implement its own traversal. Ports
 * sharing a physical node id are connected pairwise, which is sufficient for
 * `buildConnectedComponents`'s union-find to merge them into one component
 * regardless of how many legs meet there.
 */
function portsAndConnectionsFromGeometry(geometry) {
  const components = geometry.segments.map((row) => ({ componentKey: row.id }));
  const ports = geometry.segments.flatMap((row) => [
    { portKey: `${row.id}:start`, componentKey: row.id, nodeId: row.startNodeId },
    { portKey: `${row.id}:end`, componentKey: row.id, nodeId: row.endNodeId },
  ]);
  const portsByNode = new Map();
  ports.forEach((port) => {
    if (!portsByNode.has(port.nodeId)) portsByNode.set(port.nodeId, []);
    portsByNode.get(port.nodeId).push(port.portKey);
  });
  let connectionIndex = 0;
  const connectionRows = [];
  for (const [, portKeys] of portsByNode) {
    for (let i = 0; i < portKeys.length; i += 1) {
      for (let j = i + 1; j < portKeys.length; j += 1) {
        connectionIndex += 1;
        connectionRows.push({ connectionId: `C${connectionIndex}`, portAKey: portKeys[i], portBKey: portKeys[j] });
      }
    }
  }
  return { components, connections: { ports, connections: connectionRows } };
}

function checkBendConvergence() {
  // Test 6.
  const centre = { x: 0, y: 0, z: 100 };
  const start = { x: 200, y: 0, z: 100 };
  const end = { x: 0, y: 200, z: 100 };
  const passes = [2, 4, 8, 16].map((segments) => discretiseBend(start, end, centre, segments));
  for (let index = 1; index < passes.length; index += 1) {
    assert.ok(passes[index].lengthErrorFraction < passes[index - 1].lengthErrorFraction, 'length error must decrease as segments increase');
  }
  // Independent arc-length computation: radius * sweep angle, from first principles.
  const radiusVectorA = subtract(start, centre);
  const radiusVectorB = subtract(end, centre);
  const radius = norm(radiusVectorA);
  assertClose(radius, norm(radiusVectorB), 1e-9);
  const sweepAngle = Math.acos(dot(radiusVectorA, radiusVectorB) / (norm(radiusVectorA) * norm(radiusVectorB)));
  const independentArcLength = radius * sweepAngle;
  passes.forEach((pass) => assertClose(pass.arcLength, independentArcLength, 1e-9));
  console.log('✅ discretiseBend length error decreases with refinement and matches an independent arc-length computation.');
}

function checkIdempotence() {
  // Test 7.
  const geometry = baseGeometry(
    [node('N1', 0, 0, 0, 'ANCHOR'), node('N2', 3000, 0, 0, 'ANCHOR')],
    [segment('S1', 'N1', 'N2', 'PIPE', { length: 3000 })],
  );
  const requiredAttachmentPoints = [{ attachmentPointId: 'GUIDE-1', segmentId: 'S1', fraction: 0.4, kind: 'GUIDE' }];
  const useProfile = profile({ spanSeedingLimit: { value: 800, source: 'FIXTURE-PROFILE' } });

  const first = conditionGeometry(geometry, requiredAttachmentPoints, useProfile);
  const second = conditionGeometry(first.geometry, requiredAttachmentPoints, useProfile);
  assert.equal(second.semanticHash, first.semanticHash, 'conditioning an already-conditioned model must not change it');
  assert.equal(second.geometry.nodes.length, first.geometry.nodes.length);
  assert.equal(second.geometry.segments.length, first.geometry.segments.length);

  // Re-run with no attachment points supplied at all: still idempotent,
  // because the guide is recognised by its tag, not re-resolved by segment id.
  const third = conditionGeometry(first.geometry, [], useProfile);
  assert.equal(third.semanticHash, first.semanticHash);
  console.log('✅ Conditioning an already-conditioned model is idempotent, with or without re-supplying satisfied attachment points.');
}

function checkCoincidentAttachmentCustody() {
  // Test 8. Exact-coincident retained stations share one physical node but
  // retain every station identity; opposite boundaries must both be tagged.
  const geometry = baseGeometry(
    [node('N1', 0, 0, 0), node('N2', 1000, 0, 0)],
    [segment('S1', 'N1', 'N2', 'PIPE', { length: 1000 })],
  );
  const requiredAttachmentPoints = [
    { attachmentPointId: 'REPORT-B', segmentId: 'S1', fraction: 0.5, kind: 'ATTACHMENT_LOAD_EXTRACTION' },
    { attachmentPointId: 'GUIDE-A', segmentId: 'S1', fraction: 0.5, kind: 'GUIDE' },
    { attachmentPointId: 'END-I', segmentId: 'S1', fraction: 0, kind: 'EQUIPMENT_NOZZLE' },
    { attachmentPointId: 'END-J', segmentId: 'S1', fraction: 1, kind: 'EQUIPMENT_NOZZLE' },
  ];
  const first = conditionGeometry(geometry, requiredAttachmentPoints, profile());
  const coincidentRows = first.report.attachmentPointsInserted
    .filter((row) => row.attachmentPointId === 'GUIDE-A' || row.attachmentPointId === 'REPORT-B');
  assert.equal(new Set(coincidentRows.map((row) => row.nodeId)).size, 1, 'coincident stations must map to one node');
  const stationNode = first.geometry.nodes.find((row) => row.id === coincidentRows[0].nodeId);
  assert.deepEqual(stationNode.meta.attachmentPoints, [
    { attachmentPointId: 'GUIDE-A', kind: 'GUIDE' },
    { attachmentPointId: 'REPORT-B', kind: 'ATTACHMENT_LOAD_EXTRACTION' },
  ]);
  assert.equal(stationNode.meta.attachmentPointId, 'GUIDE-A', 'legacy primary custody must be deterministic');
  assert.equal(stationNode.restraint, 'GUIDE');
  assert.deepEqual(first.geometry.nodes.find((row) => row.id === 'N1').meta.attachmentPoints, [
    { attachmentPointId: 'END-I', kind: 'EQUIPMENT_NOZZLE' },
  ]);
  assert.deepEqual(first.geometry.nodes.find((row) => row.id === 'N2').meta.attachmentPoints, [
    { attachmentPointId: 'END-J', kind: 'EQUIPMENT_NOZZLE' },
  ]);
  assert.equal(first.geometry.segments.length, 2, 'one exact-coincident fraction creates one split');
  assert.equal(first.geometry.segments.filter((row) => row.length === 0).length, 0, 'coincident custody must not create a zero-length span');
  assert.equal(
    first.geometry.diagnostics.filter((row) => row.code === 'ATTACHMENT_POINT_COINCIDENT_CUSTODY').length,
    1,
  );

  const replay = conditionGeometry(first.geometry, requiredAttachmentPoints, profile());
  assert.equal(replay.semanticHash, first.semanticHash, 'coincident station custody must be idempotent');
  assert.equal(replay.report.attachmentPointsInserted.length, 0);
  console.log('✅ Exact-coincident stations retain all identities on one node, preserve both boundaries, create no zero-length span and replay exactly.');
}

function checkConflictingCoincidentRestraintsRejected() {
  // Test 9. Do not choose a stronger restraint silently when exact-coincident
  // authorities disagree mechanically.
  const geometry = baseGeometry(
    [node('N1', 0, 0, 0), node('N2', 1000, 0, 0)],
    [segment('S1', 'N1', 'N2', 'PIPE', { length: 1000 })],
  );
  assert.throws(
    () => conditionGeometry(geometry, [
      { attachmentPointId: 'ANCHOR-A', segmentId: 'S1', fraction: 0.5, kind: 'ANCHOR' },
      { attachmentPointId: 'GUIDE-B', segmentId: 'S1', fraction: 0.5, kind: 'GUIDE' },
    ], profile()),
    (error) => error instanceof SharedAnalysisContractError
      && error.code === 'ATTACHMENT_POINT_RESTRAINT_CONFLICT',
  );
  console.log('✅ Exact-coincident ANCHOR and GUIDE/SUPPORT declarations are rejected instead of silently merged.');
}

function checkSourceGuard() {
  // AD-B1.1: reuse piping-topology for all connectivity; the B-1 source files
  // must not contain a graph traversal. AD-B1.2: no numeric literal decides a
  // seeding limit.
  const files = ['geometry-conditioning.js', 'node-seeding.js', 'bend-geometry.js'].map((name) => ({
    name,
    source: fs.readFileSync(path.join(ROOT, 'src/core/centerline-beam-fea', name), 'utf8'),
  }));
  const traversalPattern = /\bfunction\s+\w*(bfs|dfs|traverse|walk)\w*\b/iu;
  for (const file of files) {
    assert.equal(traversalPattern.test(file.source), false, `${file.name} must not implement a graph traversal (AD-B1.1)`);
  }
  const seedingLimitLiteral = /(?:Limit|Segments|Length)\s*[:=]\s*-?\d/u;
  for (const file of files) {
    assert.equal(seedingLimitLiteral.test(file.source), false, `${file.name} must not hard-code a seeding limit (AD-B1.2)`);
  }
  console.log('✅ Source guard: no graph traversal in the B-1 modules; no hard-coded seeding limit.');
}

function assertClose(actual, expected, tolerance) {
  const scale = Math.max(Math.abs(expected), Math.abs(actual), Number.MIN_VALUE);
  assert.ok(Math.abs(actual - expected) / scale <= tolerance, `${actual} != ${expected}`);
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function norm(v) {
  return Math.hypot(v.x, v.y, v.z);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
