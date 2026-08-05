#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  BM2_BEND_EXPANSION_PROFILE,
  buildBm2BendExpandedAuthorities,
} from './lfea-b3.29-bm2-bend-geometry-authority-v2.mjs';

console.log('\n--- LFEA B-3.29 M027 BM2 bend geometry on B31J surface topology ---');

const result = buildBm2BendExpandedAuthorities();
assert.equal(result.expansionProfile, BM2_BEND_EXPANSION_PROFILE);
assert.equal(result.expansionProfile.schema, 'lfea-bm2-bend-expansion-profile/v5');
assert.equal(result.geometry.valid, true);
assert.equal(result.bendRecords.length, 11);
assert.equal(result.bendAuthorities.length, 11);
assert.equal(result.geometry.summary.physicalBendCount, 11);
assert.equal(result.geometry.summary.bendDeclaredStationCount, 21);
assert.equal(result.geometry.summary.collapsedTangentSpanCount, 1);
assert.equal(result.geometry.summary.reportNodeAliasCount, 1);
assert.equal(result.geometry.summary.caesarReportPairCount, 61);
assert.equal(result.pairGroups.size, 61);
assert.equal(result.conditioned.geometry.segments.length, result.geometry.segments.length);

assert.deepEqual(result.reportNodeAliases, { 180: '170' });
assert.equal(result.collapsedTangentSpans.length, 1);
const collapsed = result.collapsedTangentSpans[0];
assert.equal(collapsed.sourceSegmentId, 'IX-S18');
assert.equal(collapsed.fromNode, '170');
assert.equal(collapsed.toNode, '180');
assert.equal(collapsed.reportPair, '170-180');
assert.ok(collapsed.physicalLength <= 1e-6);
assert.deepEqual(collapsed.participation, {
  stiffness: false,
  gravity: false,
  thermal: false,
  mass: false,
  recoverReportActions: true,
});
assert.equal(result.geometry.nodes.some((node) => node.id === '180'), false);
assert.equal(result.geometry.segments.some((segment) => segment.id === 'IX-S18'), false);
assert.equal(result.geometry.segments.some((segment) => segment.id === 'IX-S13.STRAIGHT'), false);

const transferPair = result.pairGroups.get('170-180');
assert.ok(transferPair);
assert.equal(transferPair.role, 'TANGENT_CONSUMED_REPORT_TRANSFER');
assert.deepEqual(transferPair.elementIds, []);
assert.deepEqual(transferPair.reportNodeAlias, {
  sourceNodeId: '180',
  physicalNodeId: '170',
});
assert.equal(transferPair.transferAction.sourceSegmentId, 'IX-S17');
assert.equal(transferPair.transferAction.end, 'J');
assert.ok(String(transferPair.transferAction.elementId).startsWith('IX-S17.ARC.E'));
assert.equal(transferPair.participation.stiffness, false);
assert.equal(transferPair.participation.recoverReportActions, true);

const downstreamPair = result.pairGroups.get('180-190');
assert.ok(downstreamPair);
assert.deepEqual(downstreamPair.elementIds, ['IX-S19']);
assert.equal(downstreamPair.physicalFromNodeId, '170');
const downstreamElement = result.geometry.segments.find((segment) => segment.id === 'IX-S19');
assert.ok(downstreamElement);
assert.equal(downstreamElement.startNodeId, '170');
assert.equal(downstreamElement.endNodeId, '190');
assert.equal(downstreamElement.meta.reportFromNodeId, '180');
assert.equal(downstreamElement.meta.reportToNodeId, '190');

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
  const physicalNodeId = result.reportNodeAliases[nodeId] ?? nodeId;
  assert.ok(
    result.geometry.nodes.some((node) => node.id === physicalNodeId),
    `report node ${nodeId} resolves to physical node ${physicalNodeId}`,
  );
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
assert.equal(
  JSON.stringify(repeated.collapsedTangentSpans),
  JSON.stringify(result.collapsedTangentSpans),
  'Collapsed tangent-span authority must be deterministic.',
);
assert.equal(
  JSON.stringify(repeated.reportNodeAliases),
  JSON.stringify(result.reportNodeAliases),
  'Report-node aliases must be deterministic.',
);

console.log(JSON.stringify({
  status: 'PASS',
  profile: result.expansionProfile,
  sourceNodes: result.normalized.geometry.nodes.length,
  surfaceNodes: result.junctions.length,
  declaredBendStations: declaredBendStations.length,
  collapsedTangentSpans: result.collapsedTangentSpans,
  reportNodeAliases: result.reportNodeAliases,
  caesarReportNodes: reportNodeIds.size,
  caesarReportPairs: result.pairGroups.size,
  expandedAnalysisNodes: result.geometry.nodes.length,
  expandedAnalysisSegments: result.geometry.segments.length,
  bends: result.bendAuthorities.map((bend) => ({
    sourceSegmentId: bend.sourceSegmentId,
    fromNode: bend.sourceFromNode,
    physicalFromNode: bend.physicalFromNode,
    farNode: bend.sourceConstructionToNode,
    physicalFarNode: bend.physicalFarNode,
    node1: bend.node1,
    node2: bend.node2,
    subdivisionElementCount: bend.subdivisionElementCount,
    flexibilityFactor: bend.flexibilityFactor,
  })),
}, null, 2));
console.log('LFEA B-3.29 M027 bend geometry qualification complete.');
