import assert from 'node:assert/strict';
import {
  COMMON_ENRICHED_CANDIDATE_SCHEMA,
  COMMON_ENRICHED_CANDIDATE_STATUS,
  COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA,
  COMMON_ENRICHED_PUBLICATION_ORCHESTRATION_SCHEMA,
  COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
  COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
  createCommonEnrichedPropertiesCandidate,
  createCommonEnrichedTargetRecord,
  orchestrateCommonEnrichedPublication,
  requireCommonEnrichedPublicationOutcome,
} from '../src/core/common-enriched-properties/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';

const MODEL_HASH = semanticHash({ model: 'PHASE-10' });
const SOURCE_HASH = 'a'.repeat(64);
const SNAPSHOT_HASH = semanticHash({ snapshot: 'LINE-LIST-P10' });
const REVIEW_1 = semanticHash({ reviewLedger: 'REV-1' });
const REVIEW_2 = semanticHash({ reviewLedger: 'REV-2' });

const candidate1 = candidate({
  candidateId: 'CAND-P10-R1',
  revision: 1,
  createdAt: '2026-08-02T18:40:00.000Z',
  reviewLedgerHash: REVIEW_1,
});
const approve1 = decision({
  decisionId: 'DEC-P10-R1-APPROVE',
  candidateSemanticHash: candidate1.semanticHash,
  decision: 'APPROVE',
  decidedAt: '2026-08-02T18:41:00.000Z',
  evidenceHash: REVIEW_1,
});
const input1 = {
  schema: COMMON_ENRICHED_PUBLICATION_ORCHESTRATION_SCHEMA,
  transactionId: 'PUB-TXN-P10-R1',
  candidate: candidate1,
  decision: approve1,
  previousBaseline: null,
  publicationIdentity: {
    baselineId: 'BASE-P10-R1',
    publishedAt: '2026-08-02T18:42:00.000Z',
  },
};
const first = orchestrateCommonEnrichedPublication(input1);
const second = orchestrateCommonEnrichedPublication(input1);
assert.deepEqual(first, second, 'publication orchestration must be deterministic');
assert.deepEqual(requireCommonEnrichedPublicationOutcome(first), first);
assert.ok(Object.isFrozen(first));
assert.ok(Object.isFrozen(first.baseline));
assert.equal(first.status, 'PUBLISHED');
assert.equal(first.baseline.revision, 1);
assert.equal(first.baseline.candidateSemanticHash, candidate1.semanticHash);
assert.equal(first.candidateReviewLedgerHash, REVIEW_1);
assert.equal(first.decision.evidenceHash, REVIEW_1);
assert.equal(first.previousBaselineSemanticHash, null);

const reject = decision({
  decisionId: 'DEC-P10-R1-REJECT',
  candidateSemanticHash: candidate1.semanticHash,
  decision: 'REJECT',
  decidedAt: '2026-08-02T18:41:30.000Z',
  evidenceHash: REVIEW_1,
});
const rejected = orchestrateCommonEnrichedPublication({
  ...input1,
  transactionId: 'PUB-TXN-P10-R1-REJECT',
  decision: reject,
  publicationIdentity: null,
});
assert.equal(rejected.status, 'REJECTED');
assert.equal(rejected.baseline, null);
assert.equal(rejected.publishedAt, null);

const candidate2 = candidate({
  candidateId: 'CAND-P10-R2',
  revision: 2,
  createdAt: '2026-08-02T18:43:00.000Z',
  reviewLedgerHash: REVIEW_2,
});
const approve2 = decision({
  decisionId: 'DEC-P10-R2-APPROVE',
  candidateSemanticHash: candidate2.semanticHash,
  decision: 'APPROVE',
  decidedAt: '2026-08-02T18:44:00.000Z',
  evidenceHash: REVIEW_2,
});
const published2 = orchestrateCommonEnrichedPublication({
  schema: COMMON_ENRICHED_PUBLICATION_ORCHESTRATION_SCHEMA,
  transactionId: 'PUB-TXN-P10-R2',
  candidate: candidate2,
  decision: approve2,
  previousBaseline: first.baseline,
  publicationIdentity: {
    baselineId: 'BASE-P10-R2',
    publishedAt: '2026-08-02T18:45:00.000Z',
  },
});
assert.equal(published2.status, 'PUBLISHED');
assert.equal(published2.baseline.revision, 2);
assert.equal(published2.previousBaselineId, 'BASE-P10-R1');
assert.equal(published2.previousBaselineRevision, 1);
assert.equal(published2.previousBaselineSemanticHash, first.baseline.semanticHash);

expectCode(
  () => orchestrateCommonEnrichedPublication({
    ...input1,
    decision: { ...approve1, candidateSemanticHash: semanticHash({ wrong: 'candidate' }) },
  }),
  'COMMON_ENRICHED_PUBLICATION_BINDING_MISMATCH',
);
expectCode(
  () => orchestrateCommonEnrichedPublication({
    ...input1,
    decision: { ...approve1, evidenceHash: semanticHash({ wrong: 'review-ledger' }) },
  }),
  'COMMON_ENRICHED_PUBLICATION_REVIEW_LEDGER_MISMATCH',
);
expectCode(
  () => orchestrateCommonEnrichedPublication({
    ...input1,
    decision: { ...approve1, decidedAt: '2026-08-02T18:39:59.000Z' },
  }),
  'COMMON_ENRICHED_PUBLICATION_CHRONOLOGY_INVALID',
);
expectCode(
  () => orchestrateCommonEnrichedPublication({
    ...input1,
    publicationIdentity: {
      baselineId: 'BASE-P10-R1-LATE-DECISION',
      publishedAt: '2026-08-02T18:40:30.000Z',
    },
  }),
  'COMMON_ENRICHED_PUBLICATION_CHRONOLOGY_INVALID',
);
expectCode(
  () => orchestrateCommonEnrichedPublication({
    ...input1,
    transactionId: 'PUB-TXN-P10-R2-NO-PREDECESSOR',
    candidate: candidate2,
    decision: approve2,
    previousBaseline: null,
    publicationIdentity: {
      baselineId: 'BASE-P10-R2-NO-PREDECESSOR',
      publishedAt: '2026-08-02T18:45:00.000Z',
    },
  }),
  'COMMON_ENRICHED_PUBLICATION_REVISION_CHAIN_INVALID',
);
expectCode(
  () => orchestrateCommonEnrichedPublication({
    ...input1,
    transactionId: 'PUB-TXN-P10-R2-REUSED-ID',
    candidate: candidate2,
    decision: approve2,
    previousBaseline: first.baseline,
    publicationIdentity: {
      baselineId: first.baseline.baselineId,
      publishedAt: '2026-08-02T18:45:00.000Z',
    },
  }),
  'COMMON_ENRICHED_PUBLICATION_BASELINE_ID_REUSED',
);
expectCode(
  () => orchestrateCommonEnrichedPublication({
    ...input1,
    publicationIdentity: null,
  }),
  'COMMON_ENRICHED_PUBLICATION_IDENTITY_REQUIRED',
);
expectCode(
  () => orchestrateCommonEnrichedPublication({
    ...input1,
    decision: reject,
    publicationIdentity: {
      baselineId: 'BASE-ILLEGAL-REJECT',
      publishedAt: '2026-08-02T18:42:00.000Z',
    },
  }),
  'COMMON_ENRICHED_PUBLICATION_REJECTED_IDENTITY_INVALID',
);
expectCode(
  () => requireCommonEnrichedPublicationOutcome({
    ...rejected,
    status: 'PUBLISHED',
    semanticHash: semanticHash({ tampered: 'status' }),
  }),
  'COMMON_ENRICHED_PUBLICATION_OUTCOME_INVALID',
);
expectCode(
  () => requireCommonEnrichedPublicationOutcome({
    ...first,
    semanticHash: semanticHash({ tampered: true }),
  }),
  'COMMON_ENRICHED_HASH_MISMATCH',
);

console.log('PASS common enriched publication orchestration checks');
console.log(JSON.stringify({
  firstOutcomeHash: first.semanticHash,
  firstBaselineHash: first.baseline.semanticHash,
  secondOutcomeHash: published2.semanticHash,
  secondBaselineHash: published2.baseline.semanticHash,
  rejectionOutcomeHash: rejected.semanticHash,
}, null, 2));

function candidate({ candidateId, revision, createdAt, reviewLedgerHash }) {
  return createCommonEnrichedPropertiesCandidate({
    schema: COMMON_ENRICHED_CANDIDATE_SCHEMA,
    candidateId,
    projectId: 'PROJECT-P10',
    revision,
    createdAt,
    status: COMMON_ENRICHED_CANDIDATE_STATUS,
    sourceModelHash: MODEL_HASH,
    sourceSnapshots: [{
      schema: COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
      sourceKey: 'LINE_LIST:lineList',
      sourceHash: SOURCE_HASH,
      snapshotSemanticHash: SNAPSHOT_HASH,
    }],
    targetRecords: [createCommonEnrichedTargetRecord({
      schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
      targetId: 'LINE:S100',
      targetKind: 'LINE',
      sourceModelHash: MODEL_HASH,
      sourceRecordId: 'S100',
      lineKey: 'S100',
      fields: [],
    })],
    reviewLedgerHash,
  });
}

function decision({ decisionId, candidateSemanticHash, decision: value, decidedAt, evidenceHash }) {
  return {
    schema: COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA,
    decisionId,
    candidateSemanticHash,
    decision: value,
    authorityId: 'AUTHORITY:LEAD-ENGINEER',
    decidedAt,
    evidenceHash,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}
