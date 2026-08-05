#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BM2_JUNCTION_SURFACE_NODE_PROFILE,
  buildBm2JunctionSurfaceNodeAuthorities,
} from './lfea-b3.28-bm2-junction-surface-node-runtime.mjs';

console.log('\n--- LFEA B-3.28 M027 B31J junction surface-node topology ---');

const result = buildBm2JunctionSurfaceNodeAuthorities();
assert.equal(result.profile, BM2_JUNCTION_SURFACE_NODE_PROFILE);
assert.equal(result.geometry.valid, true);
assert.equal(result.junctions.length, 5);
assert.equal(result.fictitiousRigids.length, 5);
assert.equal(result.geometry.summary.b31jJunctionCount, 5);
assert.equal(result.geometry.summary.b31jSurfaceNodeCount, 5);
assert.equal(result.geometry.summary.b31jFictitiousRigidCount, 5);
assert.equal(result.geometry.nodes.length, 40);
assert.equal(result.geometry.segments.length, 40);

const expected = Object.freeze([
  Object.freeze({ center: '30', surface: '31', rigidPair: '30-31', branchPair: '31-200', branch: 'IX-S20', sif: 3 }),
  Object.freeze({ center: '70', surface: '71', rigidPair: '70-71', branchPair: '71-250', branch: 'IX-S25', sif: 3 }),
  Object.freeze({ center: '100', surface: '101', rigidPair: '100-101', branchPair: '101-280', branch: 'IX-S29', sif: 5 }),
  Object.freeze({ center: '140', surface: '141', rigidPair: '140-141', branchPair: '141-320', branch: 'IX-S33', sif: 5 }),
  Object.freeze({ center: '150', surface: '151', rigidPair: '151-150', branchPair: '270-151', branch: 'IX-S28', sif: 3 }),
]);

assert.deepEqual(
  result.junctions.map((row) => row.centerNodeId),
  expected.map((row) => row.center),
);
assert.deepEqual(
  result.junctions.map((row) => row.surfaceNodeId),
  expected.map((row) => row.surface),
);

for (const authority of expected) {
  const junction = result.junctions.find((row) => row.centerNodeId === authority.center);
  assert.ok(junction, `junction ${authority.center}`);
  assert.equal(junction.surfaceNodeId, authority.surface);
  assert.equal(junction.centerSurfacePair, authority.rigidPair);
  assert.equal(junction.branchSegmentId, authority.branch);
  assert.equal(junction.sifTypeCode, authority.sif);
  assert.ok(Math.abs(junction.surfaceOffset - 0.0571499975) <= 1e-12);
  assert.ok(junction.remainingBranchLength > 0);
  assert.ok(
    Math.abs(
      junction.remainingBranchLength + junction.surfaceOffset - junction.sourceBranchLength,
    ) <= 1e-12,
    `length decomposition at ${authority.center}`,
  );

  const surfaceNode = result.geometry.nodes.find((node) => node.id === authority.surface);
  assert.ok(surfaceNode, `surface node ${authority.surface}`);
  assert.equal(surfaceNode.meta.generatedBy, 'M027_B31J_SURFACE_NODE');
  assert.equal(surfaceNode.meta.junctionCenterNodeId, authority.center);
  assert.equal(surfaceNode.restraint, 'FREE');

  const rigidGroup = result.pairGroups.get(authority.rigidPair);
  assert.ok(rigidGroup, `rigid pair ${authority.rigidPair}`);
  assert.equal(rigidGroup.role, 'B31J_FICTITIOUS_RIGID');
  assert.equal(rigidGroup.elementIds.length, 1);

  const branchGroup = result.pairGroups.get(authority.branchPair);
  assert.ok(branchGroup, `branch remainder pair ${authority.branchPair}`);
  assert.equal(branchGroup.role, 'B31J_BRANCH_REMAINDER');
  assert.deepEqual(branchGroup.elementIds, [authority.branch]);

  const branch = result.geometry.segments.find((segment) => segment.id === authority.branch);
  assert.ok(branch, `branch ${authority.branch}`);
  assert.equal(branch.meta.b31jBranchRemainder, true);
  assert.equal(branch.meta.junctionCenterNodeId, authority.center);
  assert.equal(branch.meta.junctionSurfaceNodeId, authority.surface);
  assert.ok(Math.abs(branch.length - junction.remainingBranchLength) <= 1e-12);

  const rigid = result.geometry.segments.find(
    (segment) => segment.id === rigidGroup.elementIds[0],
  );
  assert.ok(rigid, `fictitious rigid ${authority.rigidPair}`);
  assert.equal(rigid.meta.b31jFictitiousRigid, true);
  assert.equal(rigid.meta.participatesInGlobalStiffness, true);
  assert.equal(rigid.meta.participatesInThermalExpansion, false);
  assert.equal(rigid.meta.participatesInGravity, false);
  assert.equal(rigid.meta.recoverForcesAndMoments, true);
  assert.equal(rigid.meta.calculatePipingCodeStress, false);
  assert.equal(rigid.meta.massAuthority, 'ZERO_MASS_INTERNAL_AUTHORITY');
  assert.equal(
    rigid.meta.stiffnessAuthority,
    'DEFER_TO_STRUCTURAL_CONSUMER_B31J_FICTITIOUS_RIGID',
  );
  assert.ok(Math.abs(rigid.length - junction.surfaceOffset) <= 1e-12);
}

const originalSegmentIds = new Set(result.normalized.geometry.segments.map((row) => row.id));
const transformedOriginals = result.geometry.segments.filter((row) => originalSegmentIds.has(row.id));
assert.equal(transformedOriginals.length, 35);
for (const segment of transformedOriginals) {
  const source = result.normalized.geometry.segments.find((row) => row.id === segment.id);
  const junction = result.junctions.find((row) => row.branchSegmentId === segment.id);
  if (!junction) {
    assert.equal(segment.startNodeId, source.startNodeId);
    assert.equal(segment.endNodeId, source.endNodeId);
    assert.ok(Math.abs(segment.length - source.length) <= 1e-12);
  }
}

const repeated = buildBm2JunctionSurfaceNodeAuthorities();
assert.equal(
  JSON.stringify(repeated.junctions),
  JSON.stringify(result.junctions),
  'Junction authority must be deterministic.',
);
assert.equal(
  JSON.stringify(repeated.geometry),
  JSON.stringify(result.geometry),
  'Transformed geometry must be deterministic.',
);
assert.equal(
  JSON.stringify([...repeated.pairGroups]),
  JSON.stringify([...result.pairGroups]),
  'Pair grouping must be deterministic.',
);

const report = Object.freeze({
  schema: 'lfea-bm2-junction-surface-node-qualification/v1',
  status: 'PASS',
  sourceSemanticHash: result.source.semanticHash,
  profile: result.profile,
  counts: Object.freeze({
    sourceNodes: result.normalized.geometry.nodes.length,
    transformedNodes: result.geometry.nodes.length,
    sourceSegments: result.normalized.geometry.segments.length,
    transformedSegments: result.geometry.segments.length,
    junctions: result.junctions.length,
    surfaceNodes: result.junctions.length,
    fictitiousRigids: result.fictitiousRigids.length,
  }),
  junctions: result.junctions,
  pairGroups: Object.freeze([...result.pairGroups.values()]),
  fictitiousRigids: result.fictitiousRigids.map((row) => Object.freeze({
    id: row.id,
    startNodeId: row.startNodeId,
    endNodeId: row.endNodeId,
    length: row.length,
    participation: Object.freeze({
      globalStiffness: row.meta.participatesInGlobalStiffness,
      thermalExpansion: row.meta.participatesInThermalExpansion,
      gravity: row.meta.participatesInGravity,
      recoverForcesAndMoments: row.meta.recoverForcesAndMoments,
      codeStress: row.meta.calculatePipingCodeStress,
    }),
  })),
});

const reportDirectory = fileURLToPath(new URL('../reports', import.meta.url));
mkdirSync(reportDirectory, { recursive: true });
writeFileSync(
  fileURLToPath(new URL('../reports/lfea-bm2-junction-surface-nodes.json', import.meta.url)),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(JSON.stringify(report, null, 2));
console.log('LFEA B-3.28 M027 B31J junction surface-node qualification complete.');
