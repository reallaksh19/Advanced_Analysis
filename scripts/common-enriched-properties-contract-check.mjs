import assert from 'node:assert/strict';
import {
  COMMON_ENRICHED_CANDIDATE_SCHEMA,
  COMMON_ENRICHED_CANDIDATE_STATUS,
  COMMON_ENRICHED_FIELD_SCHEMA,
  COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA,
  COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
  COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
  ENGINEERING_MASTER_RECORD_SCHEMA,
  ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  createCommonEnrichedConsumerReadiness,
  createCommonEnrichedPropertiesCandidate,
  createCommonEnrichedTargetRecord,
  createEngineeringMasterSnapshot,
  publishCommonEnrichedPropertiesBaseline,
  requireCommonEnrichedField,
  requireCommonEnrichedPropertiesBaseline,
  requireCommonEnrichedPropertiesCandidate,
  requireEngineeringMasterSnapshot,
} from '../src/core/common-enriched-properties/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';

const SHA_MODEL = 'a'.repeat(64);
const SHA_LINE_LIST = 'b'.repeat(64);
const SHA_CLASS = 'c'.repeat(64);
const NOW = '2026-08-02T15:00:00.000Z';

const exactPressure = requireCommonEnrichedField({
  schema: COMMON_ENRICHED_FIELD_SCHEMA,
  field: 'process.designPressureKpaG',
  value: 1200,
  unit: 'kPa(g)',
  status: 'RESOLVED_EXACT',
  sourceKind: 'LINE_LIST',
  sourceKey: 'lineList',
  sourceHash: SHA_LINE_LIST,
  locator: 'LineList!316:Pressure Max kPa(g)',
  matchMethod: 'EXACT_LINE_KEY',
  confidence: 1,
  policyId: null,
  policyHash: null,
  reviewEventId: null,
  approved: true,
  diagnostics: [],
});

const derivedWall = requireCommonEnrichedField({
  schema: COMMON_ENRICHED_FIELD_SCHEMA,
  field: 'spec.wallThicknessMm',
  value: 10.97,
  unit: 'mm',
  status: 'RESOLVED_DERIVED',
  sourceKind: 'PIPING_CLASS',
  sourceKey: 'pipingClass',
  sourceHash: SHA_CLASS,
  locator: 'Class 91261/NPS 6/SCH 80',
  matchMethod: 'EXACT_CLASS_BORE_SCHEDULE',
  confidence: 1,
  policyId: 'DTXR-SCHEDULE-TABLE/v1',
  policyHash: semanticHash({ id: 'DTXR-SCHEDULE-TABLE/v1' }),
  reviewEventId: null,
  approved: true,
  diagnostics: [],
});


const proposedDensity = requireCommonEnrichedField({
  schema: COMMON_ENRICHED_FIELD_SCHEMA,
  field: 'contents.proposedOperatingDensityKgM3',
  value: 67,
  unit: 'kg/m3',
  status: 'PROPOSED_REVIEW',
  sourceKind: 'LINE_LIST',
  sourceKey: 'lineList',
  sourceHash: SHA_LINE_LIST,
  locator: 'LineList!316:Mixed density',
  matchMethod: 'SERVICE_CONSENSUS_PROPOSAL',
  confidence: 0.8,
  policyId: 'SERVICE-CONSENSUS/v1',
  policyHash: semanticHash({ minimumRows: 2, threshold: 0.7 }),
  reviewEventId: null,
  approved: false,
  diagnostics: ['REVIEW_REQUIRED'],
});

const blockedDensity = requireCommonEnrichedField({
  schema: COMMON_ENRICHED_FIELD_SCHEMA,
  field: 'contents.operatingDensityKgM3',
  value: null,
  unit: 'kg/m3',
  status: 'BLOCKED_MISSING',
  sourceKind: 'NONE',
  sourceKey: null,
  sourceHash: null,
  locator: null,
  matchMethod: 'NONE',
  confidence: 0,
  policyId: null,
  policyHash: null,
  reviewEventId: null,
  approved: false,
  diagnostics: ['NO_APPROVED_FLUID_DENSITY_EVIDENCE'],
});

const lineListSnapshot = createEngineeringMasterSnapshot({
  schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  snapshotId: 'SNAP-LINE-LIST-001',
  sourceKind: 'LINE_LIST',
  sourceKey: 'lineList',
  sourceHash: SHA_LINE_LIST,
  capturedAt: NOW,
  mappingSemanticHash: semanticHash({ line: 'Line Number', pressure: 'Pressure Max kPa(g)' }),
  records: [{
    schema: ENGINEERING_MASTER_RECORD_SCHEMA,
    recordId: 'LINE:S8811951',
    locator: 'LineList!316',
    values: { lineKey: 'S8811951', designPressureKpaG: 1200 },
  }],
  metadata: { fileName: 'line-list.xlsx', sheet: 'LineList' },
});
assert.deepEqual(requireEngineeringMasterSnapshot(lineListSnapshot), lineListSnapshot);
assert.ok(Object.isFrozen(lineListSnapshot.records[0].values));

const target = createCommonEnrichedTargetRecord({
  schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
  targetId: 'LINE:/ASIM-1885-S8811951/B2',
  targetKind: 'LINE',
  sourceModelHash: SHA_MODEL,
  sourceRecordId: '/ASIM-1885-S8811951/B2',
  lineKey: 'S8811951',
  fields: [blockedDensity, proposedDensity, exactPressure, derivedWall],
});
assert.ok(Object.isFrozen(target));
assert.ok(Object.isFrozen(target.fields));

const candidate = createCommonEnrichedPropertiesCandidate({
  schema: COMMON_ENRICHED_CANDIDATE_SCHEMA,
  candidateId: 'ENR-CAND-1885S-0001',
  projectId: '1885S',
  revision: 1,
  createdAt: NOW,
  status: COMMON_ENRICHED_CANDIDATE_STATUS,
  sourceModelHash: SHA_MODEL,
  sourceSnapshots: [
    {
      schema: COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
      sourceKey: 'lineList',
      sourceHash: SHA_LINE_LIST,
      snapshotSemanticHash: lineListSnapshot.semanticHash,
    },
    {
      schema: COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
      sourceKey: 'pipingClass',
      sourceHash: SHA_CLASS,
      snapshotSemanticHash: semanticHash({ source: 'pipingClass' }),
    },
  ],
  targetRecords: [target],
  reviewLedgerHash: semanticHash({ events: [] }),
});
assert.deepEqual(requireCommonEnrichedPropertiesCandidate(candidate), candidate);

const publicationDecision = {
  schema: COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA,
  decisionId: 'PUB-DEC-1885S-0001',
  candidateSemanticHash: candidate.semanticHash,
  decision: 'APPROVE',
  authorityId: 'PROJECT-DATA-AUTHORITY',
  decidedAt: NOW,
  evidenceHash: 'sha256:' + 'd'.repeat(64),
};

const baseline = publishCommonEnrichedPropertiesBaseline(candidate, publicationDecision, {
  baselineId: 'ENR-BASE-1885S-0001',
  revision: 1,
  publishedAt: NOW,
});
assert.deepEqual(requireCommonEnrichedPropertiesBaseline(baseline), baseline);
assert.ok(Object.isFrozen(baseline));
assert.ok(Object.isFrozen(baseline.targetRecords[0].fields));

const readiness = createCommonEnrichedConsumerReadiness({
  schema: 'common-enriched-consumer-readiness/v1',
  baselineSemanticHash: baseline.semanticHash,
  consumer: 'LFEA_HANDOFF',
  status: 'BLOCKED_NOT_CONFIGURED',
  requiredFields: ['material.densityKgM3', 'spec.outsideDiameterMm', 'spec.wallThicknessMm'],
  blockers: ['LFEA_TRANSPORT_NOT_CONFIGURED'],
  adapterVersion: 'placeholder/v1',
  configurationHash: semanticHash({ transport: 'UNSELECTED' }),
});
assert.equal(readiness.status, 'BLOCKED_NOT_CONFIGURED');


expectCode(
  () => requireCommonEnrichedField({ ...proposedDensity, policyId: null, policyHash: null }),
  'COMMON_ENRICHED_POLICY_REQUIRED',
);
expectCode(
  () => requireCommonEnrichedPropertiesCandidate({ ...candidate, status: 'APPROVED' }),
  'COMMON_ENRICHED_CANDIDATE_AUTHORITY_INVALID',
);

expectCode(
  () => requireCommonEnrichedField({ ...blockedDensity, value: 0 }),
  'COMMON_ENRICHED_STATUS_INVALID',
);
expectCode(
  () => requireCommonEnrichedField({ ...exactPressure, confidence: 0.95 }),
  'COMMON_ENRICHED_CONFIDENCE_INVALID',
);
expectCode(
  () => requireCommonEnrichedField({ ...derivedWall, policyHash: null }),
  'COMMON_ENRICHED_POLICY_REQUIRED',
);
expectCode(
  () => createCommonEnrichedTargetRecord({
    schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
    targetId: 'DUPLICATE-FIELD',
    targetKind: 'LINE',
    sourceModelHash: SHA_MODEL,
    sourceRecordId: 'DUPLICATE-FIELD',
    lineKey: 'DUPLICATE-FIELD',
    fields: [exactPressure, exactPressure],
  }),
  'COMMON_ENRICHED_DUPLICATE_IDENTITY',
);
expectCode(
  () => requireCommonEnrichedPropertiesBaseline({ ...baseline, baselineId: 'TAMPERED' }),
  'COMMON_ENRICHED_HASH_MISMATCH',
);
expectCode(
  () => publishCommonEnrichedPropertiesBaseline(candidate, { ...publicationDecision, decision: 'REJECT' }, {
    baselineId: 'REJECTED', revision: 1, publishedAt: NOW,
  }),
  'COMMON_ENRICHED_PUBLICATION_REJECTED',
);
expectCode(
  () => publishCommonEnrichedPropertiesBaseline(candidate, {
    ...publicationDecision,
    candidateSemanticHash: semanticHash({ other: true }),
  }, { baselineId: 'WRONG-CANDIDATE', revision: 1, publishedAt: NOW }),
  'COMMON_ENRICHED_PUBLICATION_BINDING_MISMATCH',
);

console.log('PASS common enriched properties contract checks');
console.log(JSON.stringify({
  snapshotSemanticHash: lineListSnapshot.semanticHash,
  targetSemanticHash: target.semanticHash,
  candidateSemanticHash: candidate.semanticHash,
  baselineSemanticHash: baseline.semanticHash,
  readinessSemanticHash: readiness.semanticHash,
}, null, 2));

function expectCode(action, code) {
  assert.throws(action, (error) => error?.code === code, `expected ${code}`);
}
