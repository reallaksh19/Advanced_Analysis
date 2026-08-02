import assert from 'node:assert/strict';
import {
  COMMON_ENRICHED_CANDIDATE_SCHEMA,
  COMMON_ENRICHED_CANDIDATE_STATUS,
  COMMON_ENRICHED_CONSUMER_POLICY_SCHEMA,
  COMMON_ENRICHED_CONSUMER_READINESS_EVALUATION_SCHEMA,
  COMMON_ENRICHED_CONSUMER_REQUIREMENT_SCHEMA,
  COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA,
  COMMON_ENRICHED_PUBLICATION_ORCHESTRATION_SCHEMA,
  COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
  COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
  createCommonEnrichedPropertiesCandidate,
  createCommonEnrichedTargetRecord,
  evaluateCommonEnrichedConsumerReadiness,
  orchestrateCommonEnrichedPublication,
  requireCommonEnrichedConsumerReadinessEvaluation,
} from '../src/core/common-enriched-properties/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';

const COMMON_ENRICHED_FIELD_SCHEMA = 'common-enriched-properties-field/v1';
const MODEL_HASH = semanticHash({ model: 'PHASE-11' });
const REVIEW_HASH = semanticHash({ review: 'PHASE-11' });
const SOURCE_HASH = 'b'.repeat(64);
const SNAPSHOT_HASH = semanticHash({ snapshot: 'PHASE-11' });
const SOURCE_BINDING = Object.freeze({
  schema: COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
  sourceKey: 'LINE_LIST:lineList',
  sourceHash: SOURCE_HASH,
  snapshotSemanticHash: SNAPSHOT_HASH,
});

const candidate = createCommonEnrichedPropertiesCandidate({
  schema: COMMON_ENRICHED_CANDIDATE_SCHEMA,
  candidateId: 'CAND-P11-R1',
  projectId: 'PROJECT-P11',
  revision: 1,
  createdAt: '2026-08-02T19:10:00.000Z',
  status: COMMON_ENRICHED_CANDIDATE_STATUS,
  sourceModelHash: MODEL_HASH,
  sourceSnapshots: [SOURCE_BINDING],
  targetRecords: [
    componentRecord('COMPONENT:C1', 'C1', 'S100', 15),
    componentRecord('COMPONENT:C2', 'C2', 'S200', 20),
    lineRecord('LINE:S100', 'S100'),
    lineRecord('LINE:S200', 'S200'),
  ],
  reviewLedgerHash: REVIEW_HASH,
});
const decision = {
  schema: COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA,
  decisionId: 'DEC-P11-R1',
  candidateSemanticHash: candidate.semanticHash,
  decision: 'APPROVE',
  authorityId: 'AUTHORITY:LEAD-ENGINEER',
  decidedAt: '2026-08-02T19:11:00.000Z',
  evidenceHash: REVIEW_HASH,
};
const baseline = orchestrateCommonEnrichedPublication({
  schema: COMMON_ENRICHED_PUBLICATION_ORCHESTRATION_SCHEMA,
  transactionId: 'PUB-P11-R1',
  candidate,
  decision,
  previousBaseline: null,
  publicationIdentity: {
    baselineId: 'BASE-P11-R1',
    publishedAt: '2026-08-02T19:12:00.000Z',
  },
}).baseline;

const policies = Object.freeze([
  policy('EMPIRICAL_LOADS', true, [
    requirement('COMPONENT', 'component.weightKg'),
    requirement('LINE', 'fluid.densityKgM3'),
  ]),
  policy('ENRICHED_STAGED_JSON_EXPORT', true, [
    requirement('LINE', 'metadata.exportLabel'),
  ]),
  policy('LFEA_HANDOFF', false, []),
]);

const input = {
  schema: COMMON_ENRICHED_CONSUMER_READINESS_EVALUATION_SCHEMA,
  evaluationId: 'READY-EVAL-P11',
  baseline,
  currentSourceModelHash: MODEL_HASH,
  currentSourceSnapshots: [SOURCE_BINDING],
  policies,
};
const first = evaluateCommonEnrichedConsumerReadiness(input);
const second = evaluateCommonEnrichedConsumerReadiness(input);
assert.deepEqual(first, second, 'readiness evaluation must be deterministic');
assert.deepEqual(requireCommonEnrichedConsumerReadinessEvaluation(first), first);
assert.ok(Object.isFrozen(first));
assert.deepEqual(statusMap(first), {
  EMPIRICAL_LOADS: 'READY',
  ENRICHED_STAGED_JSON_EXPORT: 'BLOCKED_UNAPPROVED_FIELDS',
  LFEA_HANDOFF: 'BLOCKED_NOT_CONFIGURED',
});
assert.deepEqual(
  readiness(first, 'ENRICHED_STAGED_JSON_EXPORT').blockers,
  ['FIELD_UNAPPROVED:LINE:metadata.exportLabel'],
);
assert.deepEqual(
  readiness(first, 'LFEA_HANDOFF').blockers,
  ['CONSUMER_NOT_CONFIGURED'],
);

const staleModel = evaluateCommonEnrichedConsumerReadiness({
  ...input,
  evaluationId: 'READY-EVAL-P11-STALE-MODEL',
  currentSourceModelHash: semanticHash({ model: 'PHASE-11-NEW' }),
});
assert.equal(readiness(staleModel, 'EMPIRICAL_LOADS').status, 'BLOCKED_STALE_SOURCE');
assert.equal(readiness(staleModel, 'ENRICHED_STAGED_JSON_EXPORT').status, 'BLOCKED_STALE_SOURCE');
assert.equal(readiness(staleModel, 'LFEA_HANDOFF').status, 'BLOCKED_NOT_CONFIGURED');
assert.deepEqual(readiness(staleModel, 'EMPIRICAL_LOADS').blockers, ['SOURCE_MODEL_STALE']);

const staleSnapshot = evaluateCommonEnrichedConsumerReadiness({
  ...input,
  evaluationId: 'READY-EVAL-P11-STALE-SNAPSHOT',
  currentSourceSnapshots: [{
    ...SOURCE_BINDING,
    snapshotSemanticHash: semanticHash({ snapshot: 'PHASE-11-NEW' }),
  }],
});
assert.deepEqual(
  readiness(staleSnapshot, 'EMPIRICAL_LOADS').blockers,
  ['SOURCE_SNAPSHOT_STALE:LINE_LIST:lineList'],
);

const missing = evaluateCommonEnrichedConsumerReadiness({
  ...input,
  evaluationId: 'READY-EVAL-P11-MISSING',
  policies: Object.freeze([
    policies[0],
    policy('ENRICHED_STAGED_JSON_EXPORT', true, [requirement('LINE', 'missing.field')]),
    policies[2],
  ]),
});
assert.equal(readiness(missing, 'ENRICHED_STAGED_JSON_EXPORT').status, 'BLOCKED_MISSING_FIELDS');
assert.deepEqual(
  readiness(missing, 'ENRICHED_STAGED_JSON_EXPORT').blockers,
  ['FIELD_MISSING:LINE:missing.field'],
);

const staleFieldEvaluation = evaluateCommonEnrichedConsumerReadiness({
  ...input,
  evaluationId: 'READY-EVAL-P11-STALE-FIELD',
  policies: Object.freeze([
    policies[0],
    policy('ENRICHED_STAGED_JSON_EXPORT', true, [requirement('LINE', 'line.staleField')]),
    policies[2],
  ]),
});
assert.equal(readiness(staleFieldEvaluation, 'ENRICHED_STAGED_JSON_EXPORT').status, 'BLOCKED_STALE_SOURCE');
assert.deepEqual(
  readiness(staleFieldEvaluation, 'ENRICHED_STAGED_JSON_EXPORT').blockers,
  ['FIELD_STALE:LINE:line.staleField'],
);

expectCode(
  () => evaluateCommonEnrichedConsumerReadiness({
    ...input,
    policies: policies.slice(0, 2),
  }),
  'COMMON_ENRICHED_READINESS_CONSUMER_SET_INVALID',
);
expectCode(
  () => evaluateCommonEnrichedConsumerReadiness({
    ...input,
    policies: Object.freeze([
      policy('EMPIRICAL_LOADS', true, []),
      policies[1],
      policies[2],
    ]),
  }),
  'COMMON_ENRICHED_READINESS_REQUIREMENTS_REQUIRED',
);
expectCode(
  () => evaluateCommonEnrichedConsumerReadiness({
    ...input,
    policies: Object.freeze([
      policies[0],
      policies[1],
      policy('LFEA_HANDOFF', false, [requirement('LINE', 'pipe.odMm')]),
    ]),
  }),
  'COMMON_ENRICHED_READINESS_POLICY_INVALID',
);
expectCode(
  () => requireCommonEnrichedConsumerReadinessEvaluation({
    ...first,
    semanticHash: semanticHash({ tampered: true }),
  }),
  'COMMON_ENRICHED_HASH_MISMATCH',
);

console.log('PASS common enriched consumer readiness evaluation checks');
console.log(JSON.stringify({
  baselineSemanticHash: baseline.semanticHash,
  evaluationSemanticHash: first.semanticHash,
  statuses: statusMap(first),
}, null, 2));

function policy(consumer, configured, requirements) {
  return Object.freeze({
    schema: COMMON_ENRICHED_CONSUMER_POLICY_SCHEMA,
    consumer,
    configured,
    adapterVersion: '1.0.0',
    configurationHash: semanticHash({ consumer, configured, requirements }),
    requirements: Object.freeze([...requirements].sort((a, b) => a.requirementId.localeCompare(b.requirementId))),
  });
}

function requirement(targetKind, field, allowNotApplicable = false) {
  return Object.freeze({
    schema: COMMON_ENRICHED_CONSUMER_REQUIREMENT_SCHEMA,
    requirementId: `${targetKind}:${field}`,
    targetKind,
    field,
    allowNotApplicable,
  });
}

function lineRecord(targetId, lineKey) {
  return createCommonEnrichedTargetRecord({
    schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
    targetId,
    targetKind: 'LINE',
    sourceModelHash: MODEL_HASH,
    sourceRecordId: lineKey,
    lineKey,
    fields: [
      exactField('fluid.densityKgM3', 998, 'kg/m3', true),
      staleField('line.staleField'),
      proposedField('metadata.exportLabel', `EXPORT-${lineKey}`),
      exactField('pipe.odMm', 114.3, 'mm', true),
    ],
  });
}

function componentRecord(targetId, sourceRecordId, lineKey, weight) {
  return createCommonEnrichedTargetRecord({
    schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
    targetId,
    targetKind: 'COMPONENT',
    sourceModelHash: MODEL_HASH,
    sourceRecordId,
    lineKey,
    fields: [exactField('component.weightKg', weight, 'kg', true, 'COMPONENT_WEIGHT_MASTER')],
  });
}

function exactField(field, value, unit, approved, sourceKind = 'LINE_LIST') {
  return Object.freeze({
    schema: COMMON_ENRICHED_FIELD_SCHEMA,
    field,
    value,
    unit,
    status: 'RESOLVED_EXACT',
    sourceKind,
    sourceKey: `${sourceKind}:SOURCE`,
    sourceHash: SOURCE_HASH,
    locator: 'ROW:1',
    matchMethod: 'EXACT_KEY',
    confidence: 1,
    policyId: null,
    policyHash: null,
    reviewEventId: null,
    approved,
    diagnostics: Object.freeze([]),
  });
}

function proposedField(field, value) {
  return Object.freeze({
    schema: COMMON_ENRICHED_FIELD_SCHEMA,
    field,
    value,
    unit: null,
    status: 'PROPOSED_REVIEW',
    sourceKind: 'LINE_LIST',
    sourceKey: 'LINE_LIST:SOURCE',
    sourceHash: SOURCE_HASH,
    locator: 'ROW:1',
    matchMethod: 'POLICY_PROPOSAL',
    confidence: 0.75,
    policyId: 'POLICY:EXPORT-LABEL',
    policyHash: semanticHash({ policy: 'EXPORT-LABEL' }),
    reviewEventId: null,
    approved: false,
    diagnostics: Object.freeze([]),
  });
}

function staleField(field) {
  return Object.freeze({
    schema: COMMON_ENRICHED_FIELD_SCHEMA,
    field,
    value: null,
    unit: null,
    status: 'BLOCKED_STALE_SOURCE',
    sourceKind: 'LINE_LIST',
    sourceKey: 'LINE_LIST:SOURCE',
    sourceHash: SOURCE_HASH,
    locator: 'ROW:1',
    matchMethod: 'EXACT_KEY',
    confidence: 0,
    policyId: null,
    policyHash: null,
    reviewEventId: null,
    approved: false,
    diagnostics: Object.freeze(['SOURCE_STALE']),
  });
}

function readiness(evaluation, consumer) {
  return evaluation.readiness.find((entry) => entry.consumer === consumer);
}

function statusMap(evaluation) {
  return Object.fromEntries(evaluation.readiness.map((entry) => [entry.consumer, entry.status]));
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}
