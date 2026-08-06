#!/usr/bin/env node

import assert from 'node:assert/strict';
import { conditionGeometry } from '../src/core/centerline-beam-fea/index.js';
import { SharedAnalysisContractError } from '../src/core/shared-analysis-contract/index.js';

console.log('\n--- LFEA B-1 attachment replay custody check ---');

const PROFILE = Object.freeze({
  spanSeedingLimit: Object.freeze({ value: 10000, source: 'B1-REPLAY-CUSTODY-FIXTURE' }),
  bendSeedingSegments: Object.freeze({ value: 4, source: 'B1-REPLAY-CUSTODY-FIXTURE' }),
  bendLengthErrorLimit: Object.freeze({ value: 0.05, source: 'B1-REPLAY-CUSTODY-FIXTURE' }),
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
  },
]);
assert.deepEqual(retainedNode.meta.attachmentPointCustody, [
  custody(SOURCE_POINT),
]);
assert.equal(first.geometry.segments.some((row) => row.id === SOURCE_POINT.segmentId), false);
console.log('✅ First conditioning retains exact lineage without changing lightweight identity rows.');

const replay = conditionGeometry(first.geometry, [SOURCE_POINT], PROFILE);
assert.equal(replay.semanticHash, first.semanticHash);
assert.equal(replay.report.attachmentPointsInserted.length, 0);
assert.equal(
  replay.geometry.diagnostics.filter((row) => row.code === 'ATTACHMENT_POINT_ALREADY_SEEDED').length,
  1,
);
console.log('✅ Exact replay remains idempotent after the source segment is split.');

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
console.log('✅ Changed fraction, segment, or kind is rejected before topology idempotence.');

expectCode(
  () => conditionGeometry(first.geometry, [SOURCE_POINT, { ...SOURCE_POINT }], PROFILE),
  'ATTACHMENT_POINT_ID_DUPLICATE',
);

const legacyWithoutLineage = structuredClone(first.geometry);
delete legacyWithoutLineage.nodes
  .find((row) => row.meta?.attachmentPointId === SOURCE_POINT.attachmentPointId)
  .meta.attachmentPointCustody;
expectCode(
  () => conditionGeometry(legacyWithoutLineage, [SOURCE_POINT], PROFILE),
  'ATTACHMENT_POINT_REPLAY_LINEAGE_UNAVAILABLE',
);
console.log('✅ Duplicate declarations and retained identities without lineage fail closed.');

const mixedPartialCustody = geometry([
  node('N1', 0, attachmentMeta(
    [
      lightweight('A', 'GUIDE'),
      lightweight('B', 'SUPPORT'),
    ],
    [
      custody({ attachmentPointId: 'A', segmentId: 'S1', fraction: 0, kind: 'GUIDE' }),
    ],
  )),
  node('N2', 1000),
]);
expectCode(
  () => conditionGeometry(mixedPartialCustody, [{
    attachmentPointId: 'B',
    segmentId: 'S1',
    fraction: 0,
    kind: 'SUPPORT',
  }], PROFILE),
  'ATTACHMENT_POINT_REPLAY_LINEAGE_UNAVAILABLE',
);

const emptyCustody = geometry([
  node('N1', 0, attachmentMeta([lightweight('A', 'GUIDE')], [])),
  node('N2', 1000),
]);
expectCode(
  () => conditionGeometry(emptyCustody, [{
    attachmentPointId: 'A',
    segmentId: 'S1',
    fraction: 0,
    kind: 'GUIDE',
  }], PROFILE),
  'ATTACHMENT_POINT_REPLAY_LINEAGE_UNAVAILABLE',
);
console.log('✅ Partial or empty custody arrays cannot bypass legacy identity replay validation.');

const duplicateExactRows = geometry([
  node('N1', 0, attachmentMeta(
    [lightweight('A', 'GUIDE')],
    [
      custody({ attachmentPointId: 'A', segmentId: 'S1', fraction: 0, kind: 'GUIDE' }),
      custody({ attachmentPointId: 'A', segmentId: 'S1', fraction: 0, kind: 'GUIDE' }),
    ],
  )),
  node('N2', 1000),
]);
expectCode(
  () => conditionGeometry(duplicateExactRows, [], PROFILE),
  'ATTACHMENT_POINT_CUSTODY_DUPLICATE',
);

const duplicateAcrossNodes = geometry([
  node('N1', 0, attachmentMeta(
    [lightweight('A', 'GUIDE')],
    [custody({ attachmentPointId: 'A', segmentId: 'S1', fraction: 0, kind: 'GUIDE' })],
  )),
  node('N2', 1000, attachmentMeta(
    [lightweight('A', 'GUIDE')],
    [custody({ attachmentPointId: 'A', segmentId: 'S1', fraction: 0, kind: 'GUIDE' })],
  )),
]);
expectCode(
  () => conditionGeometry(duplicateAcrossNodes, [], PROFILE),
  'ATTACHMENT_POINT_CUSTODY_DUPLICATE',
);
console.log('✅ Exact duplicate custody rows and cross-node duplicate identity are rejected.');

const orphanCustody = geometry([
  node('N1', 0, {
    attachmentPointCustody: [
      custody({ attachmentPointId: 'A', segmentId: 'S1', fraction: 0, kind: 'GUIDE' }),
    ],
  }),
  node('N2', 1000),
]);
expectCode(
  () => conditionGeometry(orphanCustody, [], PROFILE),
  'ATTACHMENT_POINT_CUSTODY_ORPHANED',
);

const kindMismatch = geometry([
  node('N1', 0, attachmentMeta(
    [lightweight('A', 'GUIDE')],
    [custody({ attachmentPointId: 'A', segmentId: 'S1', fraction: 0, kind: 'SUPPORT' })],
  )),
  node('N2', 1000),
]);
expectCode(
  () => conditionGeometry(kindMismatch, [], PROFILE),
  'ATTACHMENT_POINT_CUSTODY_KIND_MISMATCH',
);
console.log('✅ Orphan source custody and identity/custody kind drift are rejected.');

console.log('\n✅ LFEA B-1 attachment replay custody check passed.\n');

function geometry(nodes) {
  return {
    schemaVersion: 'canonical-geometry-v1',
    nodes,
    segments: [segment('S1', 'N1', 'N2')],
    source: 'B1-REPLAY-CUSTODY-FIXTURE',
    unit: 'mm',
    diagnostics: [],
    summary: {},
  };
}

function node(id, x, meta = {}) {
  return {
    id,
    x,
    y: 0,
    z: 0,
    restraint: 'FREE',
    meta,
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

function lightweight(attachmentPointId, kind) {
  return { attachmentPointId, kind };
}

function custody(point) {
  return {
    attachmentPointId: point.attachmentPointId,
    kind: point.kind,
    sourceSegmentId: point.segmentId,
    sourceFraction: point.fraction,
  };
}

function attachmentMeta(attachmentPoints, attachmentPointCustody) {
  const primary = attachmentPoints[0] ?? null;
  return {
    attachmentPointId: primary?.attachmentPointId,
    attachmentPointKind: primary?.kind,
    attachmentPoints,
    attachmentPointCustody,
  };
}

function expectCode(operation, code) {
  assert.throws(
    operation,
    (error) => error instanceof SharedAnalysisContractError && error.code === code,
  );
}
