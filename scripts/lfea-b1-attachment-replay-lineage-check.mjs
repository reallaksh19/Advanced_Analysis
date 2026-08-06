#!/usr/bin/env node

import assert from 'node:assert/strict';
import { conditionGeometry } from '../src/core/centerline-beam-fea/index.js';
import { SharedAnalysisContractError } from '../src/core/shared-analysis-contract/index.js';

console.log('\n--- LFEA B-1 attachment replay lineage check ---');

const PROFILE = Object.freeze({
  spanSeedingLimit: Object.freeze({ value: 10000, source: 'B1-REPLAY-LINEAGE-FIXTURE' }),
  bendSeedingSegments: Object.freeze({ value: 4, source: 'B1-REPLAY-LINEAGE-FIXTURE' }),
  bendLengthErrorLimit: Object.freeze({ value: 0.05, source: 'B1-REPLAY-LINEAGE-FIXTURE' }),
});

const SOURCE_POINT = Object.freeze({
  attachmentPointId: 'GUIDE-REPLAY-1',
  segmentId: 'S1',
  fraction: 0.4,
  kind: 'GUIDE',
});

const sourceGeometry = geometry([
  node('N1', 0),
  node('N2', 1000),
], [
  segment('S1', 'N1', 'N2'),
]);

const first = conditionGeometry(sourceGeometry, [SOURCE_POINT], PROFILE);
const retainedNode = first.geometry.nodes.find((row) => (
  row.meta?.attachmentPointId === SOURCE_POINT.attachmentPointId
));
assert.ok(retainedNode, 'first conditioning must retain the attachment identity');
assert.deepEqual(retainedNode.meta.attachmentPoints, [
  {
    attachmentPointId: SOURCE_POINT.attachmentPointId,
    kind: SOURCE_POINT.kind,
    sourceSegmentId: SOURCE_POINT.segmentId,
    sourceFraction: SOURCE_POINT.fraction,
  },
]);
assert.equal(first.geometry.segments.some((row) => row.id === SOURCE_POINT.segmentId), false);
console.log('✅ First conditioning retains exact source segment and fraction custody.');

const replay = conditionGeometry(first.geometry, [SOURCE_POINT], PROFILE);
assert.equal(replay.semanticHash, first.semanticHash);
assert.equal(replay.report.attachmentPointsInserted.length, 0);
assert.equal(
  replay.geometry.diagnostics.filter((row) => row.code === 'ATTACHMENT_POINT_ALREADY_SEEDED').length,
  1,
);
console.log('✅ Exact replay remains idempotent without re-resolving the split source segment.');

expectCode(
  () => conditionGeometry(first.geometry, [{ ...SOURCE_POINT, fraction: 0.6 }], PROFILE),
  'ATTACHMENT_POINT_REPLAY_MISMATCH',
);
expectCode(
  () => conditionGeometry(first.geometry, [{ ...SOURCE_POINT, segmentId: 'S2' }], PROFILE),
  'ATTACHMENT_POINT_REPLAY_MISMATCH',
);
expectCode(
  () => conditionGeometry(first.geometry, [{ ...SOURCE_POINT, kind: 'ANCHOR' }], PROFILE),
  'ATTACHMENT_POINT_REPLAY_MISMATCH',
);
console.log('✅ Changed replay fraction, segment or kind is rejected before idempotence filtering.');

expectCode(
  () => conditionGeometry(first.geometry, [SOURCE_POINT, { ...SOURCE_POINT }], PROFILE),
  'ATTACHMENT_POINT_ID_DUPLICATE',
);
console.log('✅ Duplicate incoming identities are rejected even when the identity is already seeded.');

const legacyWithoutLineage = structuredClone(first.geometry);
delete legacyWithoutLineage.nodes
  .find((row) => row.meta?.attachmentPointId === SOURCE_POINT.attachmentPointId)
  .meta.attachmentPoints[0].sourceSegmentId;
delete legacyWithoutLineage.nodes
  .find((row) => row.meta?.attachmentPointId === SOURCE_POINT.attachmentPointId)
  .meta.attachmentPoints[0].sourceFraction;
expectCode(
  () => conditionGeometry(legacyWithoutLineage, [SOURCE_POINT], PROFILE),
  'ATTACHMENT_POINT_REPLAY_LINEAGE_UNAVAILABLE',
);
console.log('✅ A retained identity without complete lineage fails closed.');

const duplicateCustody = geometry([
  node('N1', 0, [{
    attachmentPointId: 'DUPLICATE-CUSTODY',
    kind: 'GUIDE',
    sourceSegmentId: 'S1',
    sourceFraction: 0,
  }]),
  node('N2', 1000, [{
    attachmentPointId: 'DUPLICATE-CUSTODY',
    kind: 'GUIDE',
    sourceSegmentId: 'S1',
    sourceFraction: 1,
  }]),
], [
  segment('S1', 'N1', 'N2'),
]);
expectCode(
  () => conditionGeometry(duplicateCustody, [], PROFILE),
  'ATTACHMENT_POINT_CUSTODY_DUPLICATE',
);
console.log('✅ Duplicate retained custody across nodes is rejected.');

console.log('\n✅ LFEA B-1 attachment replay lineage check passed.\n');

function geometry(nodes, segments) {
  return {
    schemaVersion: 'canonical-geometry-v1',
    nodes,
    segments,
    source: 'B1-REPLAY-LINEAGE-FIXTURE',
    unit: 'mm',
    diagnostics: [],
    summary: {},
  };
}

function node(id, x, attachmentPoints = []) {
  const primary = attachmentPoints[0] ?? null;
  return {
    id,
    x,
    y: 0,
    z: 0,
    restraint: 'FREE',
    meta: primary === null ? {} : {
      attachmentPointId: primary.attachmentPointId,
      attachmentPointKind: primary.kind,
      attachmentPoints,
    },
  };
}

function segment(id, startNodeId, endNodeId) {
  return {
    id,
    startNodeId,
    endNodeId,
    type: 'PIPE',
    length: 1000,
  };
}

function expectCode(operation, code) {
  assert.throws(
    operation,
    (error) => error instanceof SharedAnalysisContractError && error.code === code,
  );
}
