#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  BM2_BEND_EXPANSION_PROFILE,
  buildBm2BendExpandedAuthorities,
} from './lfea-b3.29-bm2-bend-geometry-authority.mjs';

console.log('\n--- LFEA B-3.29 M027 BM2 bend geometry on B31J surface topology ---');

const result = buildBm2BendExpandedAuthorities();
assert.equal(result.expansionProfile, BM2_BEND_EXPANSION_PROFILE);
assert.equal(result.geometry.valid, true);
assert.equal(result.bendRecords.length, 11);
assert.equal(result.bendAuthorities.length, 11);
assert.equal(result.geometry.summary.physicalBendCount, 11);
assert.equal(result.geometry.summary.bendDeclaredStationCount, 21);
assert.equal(result.geometry.summary.caesarReportPairCount, 61);
assert.equal(result.pairGroups.size, 61);
assert.equal(result.conditioned.spans.length, result.geometry.segments.length);

const expectedStations = [
  '31', '38', '39', '48', '49', '58', '59', '63', '64', '71',
  '101', '129', '141', '151', '158', '159', '168', '169', '198', '199',
  '208', '209', '218', '219', '248', '249',
].sort();
for (const nodeId of expectedStations) {
  assert.ok(result.geometry.nodes.some((node) => node.id === nodeId), `report node ${nodeId}`);
}

const declaredBendStations = result.bendAuthorities.flatMap((bend) => [bend.node1, bend.node2])
  .filter(Boolean)
  .sort();
assert.deepEqual(declaredBendStations, [
  '38', '39', '48', '49', '58', '59', '63', '64', '129',
  '158', '159', '168', '169', '198', '199', '208', '209',
  '218', '219', '248', '249',
].sort());

const expectedBendPairs = [
  '30-38', '38-39', '39-40',
  '40-48', '48-49', '49-50',
  '50-58', '58-59', '59-60',
  '60-63', '63-64', '64-65',
  '120-129', '129-130',
  '150-158', '158-159', '159-160',
  '160-168', '168-169', '169-170',
  '31-198', '198-199', '199-200',
  '200-208', '208-209', '209-210',
  '210-218', '218-219', '219-220',
  '71-248', '248-249', '249-250',
];
for (const pair of expectedBendPairs) {
  const group = result.pairGroups.get(pair);
  assert.ok(group, `CAESAR bend pair ${pair}`);
  assert.ok(group.elementIds.length > 0, `${pair} element chain`);
}

for (const pair of ['30-31', '70-71', '100-101', '140-141', '151-150']) {
  const group = result.pairGroups.get(pair);
  assert.ok(group, `B31J fictitious pair ${pair}`);
  assert.equal(group.role, 'B31J_FICTITIOUS_RIGID');
}

for (const bend of result.bendAuthorities) {
  assert.ok(bend.radius > 0);
  assert.ok(bend.sweepAngle > 0);
  assert.ok(bend.tangentDistance > 0);
  assert.ok(bend.subdivisionElementCount >= 4);
  assert.ok(bend.stationIndex > 0);
  assert.ok(bend.stationIndex < bend.subdivisionElementCount);
  assert.ok(bend.flexibilityFactor > 0);
  assert.equal(bend.doubleCountGuard.accepted, true);
  assert.equal(bend.convergence.accepted, true);
}

const reportNodeIds = new Set([
  ...result.normalized.geometry.nodes.map((node) => node.id),
  ...expectedStations,
]);
assert.equal(reportNodeIds.size, 61);
for (const nodeId of reportNodeIds) {
  assert.ok(result.geometry.nodes.some((node) => node.id === nodeId), `all report nodes include ${nodeId}`);
}

const repeated = buildBm2BendExpandedAuthorities();
assert.equal(
  JSON.stringify(repeated.bendAuthorities),
  JSON.stringify(result.bendAuthorities),
  'Bend authorities must be deterministic.',
);
assert.equal(
  JSON.stringify([...repeated.pairGroups]),
  JSON.stringify([...result.pairGroups]),
  'Bend pair groups must be deterministic.',
);
assert.equal(
  JSON.stringify(repeated.geometry),
  JSON.stringify(result.geometry),
  'Expanded bend geometry must be deterministic.',
);

console.log(JSON.stringify({
  status: 'PASS',
  profile: result.expansionProfile,
  sourceNodes: result.normalized.geometry.nodes.length,
  surfaceNodes: result.junctions.length,
  declaredBendStations: declaredBendStations.length,
  caesarReportNodes: reportNodeIds.size,
  caesarReportPairs: result.pairGroups.size,
  expandedAnalysisNodes: result.geometry.nodes.length,
  expandedAnalysisSegments: result.geometry.segments.length,
  bends: result.bendAuthorities.map((bend) => ({
    sourceSegmentId: bend.sourceSegmentId,
    fromNode: bend.sourceFromNode,
    farNode: bend.sourceConstructionToNode,
    node1: bend.node1,
    node2: bend.node2,
    subdivisionElementCount: bend.subdivisionElementCount,
    flexibilityFactor: bend.flexibilityFactor,
  })),
}, null, 2));
console.log('LFEA B-3.29 M027 bend geometry qualification complete.');
