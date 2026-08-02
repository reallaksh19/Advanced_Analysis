import assert from 'node:assert/strict';
import {
  COMMON_ENRICHED_CANDIDATE_SCHEMA,
  COMMON_ENRICHED_CANDIDATE_STATUS,
  COMMON_ENRICHED_CONSUMER_HANDOFF_DECISION_SCHEMA,
  COMMON_ENRICHED_CONSUMER_HANDOFF_SCHEMA,
  COMMON_ENRICHED_CONSUMER_PAYLOAD_SCHEMA,
  COMMON_ENRICHED_CONSUMER_POLICY_SCHEMA,
  COMMON_ENRICHED_CONSUMER_READINESS_EVALUATION_SCHEMA,
  COMMON_ENRICHED_CONSUMER_REQUIREMENT_SCHEMA,
  COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA,
  COMMON_ENRICHED_PUBLICATION_ORCHESTRATION_SCHEMA,
  COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
  COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
  createCommonEnrichedConsumerHandoff,
  createCommonEnrichedPropertiesCandidate,
  createCommonEnrichedTargetRecord,
  evaluateCommonEnrichedConsumerReadiness,
  orchestrateCommonEnrichedPublication,
  requireCommonEnrichedConsumerHandoff,
} from '../src/core/common-enriched-properties/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';

const FIELD_SCHEMA = 'common-enriched-properties-field/v1';
const MODEL_HASH = semanticHash({ model: 'PHASE-12' });
const REVIEW_HASH = semanticHash({ review: 'PHASE-12' });
const SOURCE_HASH = 'c'.repeat(64);
const SNAPSHOT_HASH = semanticHash({ snapshot: 'PHASE-12' });
const SOURCE_BINDING = Object.freeze({
  schema: COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
  sourceKey: 'LINE_LIST:lineList',
  sourceHash: SOURCE_HASH,
  snapshotSemanticHash: SNAPSHOT_HASH,
});

const candidate = createCommonEnrichedPropertiesCandidate({
  schema: COMMON_ENRICHED_CANDIDATE_SCHEMA,
  candidateId: 'CAND-P12-R1',
  projectId: 'PROJECT-P12',
  revision: 1,
  createdAt: '2026-08-02T19:20:00.000Z',
  status: COMMON_ENRICHED_CANDIDATE_STATUS,
  sourceModelHash: MODEL_HASH,
  sourceSnapshots: [SOURCE_BINDING],
  targetRecords: [
    createCommonEnrichedTargetRecord({
      schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
      targetId: 'COMPONENT:C1',
      targetKind: 'COMPONENT',
      sourceModelHash: MODEL_HASH,
      sourceRecordId: 'C1',
      lineKey: 'S100',
      fields: [exactField('component.weightKg', 15, 'kg', 'COMPONENT_WEIGHT_MASTER')],
    }),
    createCommonEnrichedTargetRecord({
      schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
      targetId: 'LINE:S100',
      targetKind: 'LINE',
      sourceModelHash: MODEL_HASH,
      sourceRecordId: 'S100',
      lineKey: 'S100',
      fields: [
        exactField('fluid.densityKgM3', 998, 'kg/m3', 'FLUID_REGISTER'),
        proposedField('metadata.exportLabel', 'EXPORT-S100'),
      ],
    }),
  ],
  reviewLedgerHash: REVIEW_HASH,
});
const publicationDecision = {
  schema: COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA,
  decisionId: 'DEC-P12-PUBLISH',
  candidateSemanticHash: candidate.semanticHash,
  decision: 'APPROVE',
  authorityId: 'AUTHORITY:LEAD-ENGINEER',
  decidedAt: '2026-08-02T19:21:00.000Z',
  evidenceHash: REVIEW_HASH,
};
const baseline = orchestrateCommonEnrichedPublication({
  schema: COMMON_ENRICHED_PUBLICATION_ORCHESTRATION_SCHEMA,
  transactionId: 'PUB-P12-R1',
  candidate,
  decision: publicationDecision,
  previousBaseline: null,
  publicationIdentity: {
    baselineId: 'BASE-P12-R1',
    publishedAt: '2026-08-02T19:22:00.000Z',
  },
}).baseline;

const evaluation = evaluateCommonEnrichedConsumerReadiness({
  schema: COMMON_ENRICHED_CONSUMER_READINESS_EVALUATION_SCHEMA,
  evaluationId: 'READY-EVAL-P12',
  baseline,
  currentSourceModelHash: MODEL_HASH,
  currentSourceSnapshots: [SOURCE_BINDING],
  policies: [
    policy('EMPIRICAL_LOADS', true, [
      requirement('COMPONENT', 'component.weightKg'),
      requirement('LINE', 'fluid.densityKgM3'),
    ]),
    policy('ENRICHED_STAGED_JSON_EXPORT', true, [
      requirement('LINE', 'metadata.exportLabel'),
    ]),
    policy('LFEA_HANDOFF', false, []),
  ],
});

const empiricalReadiness = readiness('EMPIRICAL_LOADS');
const empiricalPayload = payload({
  payloadId: 'PAYLOAD-P12-EMPIRICAL',
  payloadSchema: 'empirical-load-input/v1',
  payloadSemanticHash: semanticHash({ components: 1, lines: 1 }),
  readiness: empiricalReadiness,
  createdAt: '2026-08-02T19:23:00.000Z',
});
const empiricalDecision = handoffDecision({
  decisionId: 'DEC-P12-EMPIRICAL-AUTH',
  consumer: 'EMPIRICAL_LOADS',
  readiness: empiricalReadiness,
  payload: empiricalPayload,
  decision: 'AUTHORIZE',
  decidedAt: '2026-08-02T19:24:00.000Z',
});
const input = {
  schema: COMMON_ENRICHED_CONSUMER_HANDOFF_SCHEMA,
  handoffId: 'HANDOFF-P12-EMPIRICAL',
  consumer: 'EMPIRICAL_LOADS',
  baseline,
  readinessEvaluation: evaluation,
  payload: empiricalPayload,
  decision: empiricalDecision,
};
const authorized = createCommonEnrichedConsumerHandoff(input);
const repeated = createCommonEnrichedConsumerHandoff(input);
assert.deepEqual(authorized, repeated, 'handoff creation must be deterministic');
assert.deepEqual(requireCommonEnrichedConsumerHandoff(authorized), authorized);
assert.equal(authorized.status, 'AUTHORIZED');
assert.equal(authorized.readiness.status, 'READY');
assert.ok(Object.isFrozen(authorized));
assert.ok(Object.isFrozen(authorized.baseline));
assert.ok(Object.isFrozen(authorized.readinessEvaluation));
assert.ok(Object.isFrozen(authorized.payload));
assert.ok(Object.isFrozen(authorized.decision));

const exportReadiness = readiness('ENRICHED_STAGED_JSON_EXPORT');
const exportPayload = payload({
  payloadId: 'PAYLOAD-P12-EXPORT',
  payloadSchema: 'enriched-staged-json-input/v1',
  payloadSemanticHash: semanticHash({ export: 'blocked' }),
  readiness: exportReadiness,
  createdAt: '2026-08-02T19:23:30.000Z',
});
const exportDenyDecision = handoffDecision({
  decisionId: 'DEC-P12-EXPORT-DENY',
  consumer: 'ENRICHED_STAGED_JSON_EXPORT',
  readiness: exportReadiness,
  payload: exportPayload,
  decision: 'DENY',
  decidedAt: '2026-08-02T19:24:30.000Z',
});
const denied = createCommonEnrichedConsumerHandoff({
  schema: COMMON_ENRICHED_CONSUMER_HANDOFF_SCHEMA,
  handoffId: 'HANDOFF-P12-EXPORT-DENIED',
  consumer: 'ENRICHED_STAGED_JSON_EXPORT',
  baseline,
  readinessEvaluation: evaluation,
  payload: exportPayload,
  decision: exportDenyDecision,
});
assert.equal(denied.status, 'DENIED');
assert.equal(denied.readiness.status, 'BLOCKED_UNAPPROVED_FIELDS');

expectCode(
  () => createCommonEnrichedConsumerHandoff({
    ...input,
    handoffId: 'HANDOFF-P12-EXPORT-ILLEGAL-AUTH',
    consumer: 'ENRICHED_STAGED_JSON_EXPORT',
    payload: exportPayload,
    decision: {
      ...exportDenyDecision,
      decisionId: 'DEC-P12-EXPORT-ILLEGAL-AUTH',
      decision: 'AUTHORIZE',
    },
  }),
  'COMMON_ENRICHED_HANDOFF_NOT_READY',
);
expectCode(
  () => createCommonEnrichedConsumerHandoff({
    ...input,
    payload: { ...empiricalPayload, adapterVersion: '9.9.9' },
  }),
  'COMMON_ENRICHED_HANDOFF_ADAPTER_MISMATCH',
);
expectCode(
  () => createCommonEnrichedConsumerHandoff({
    ...input,
    payload: {
      ...empiricalPayload,
      configurationHash: semanticHash({ wrong: 'configuration' }),
    },
  }),
  'COMMON_ENRICHED_HANDOFF_CONFIGURATION_MISMATCH',
);
expectCode(
  () => createCommonEnrichedConsumerHandoff({
    ...input,
    decision: { ...empiricalDecision, consumer: 'LFEA_HANDOFF' },
  }),
  'COMMON_ENRICHED_HANDOFF_BINDING_MISMATCH',
);
expectCode(
  () => createCommonEnrichedConsumerHandoff({
    ...input,
    decision: {
      ...empiricalDecision,
      readinessSemanticHash: semanticHash({ wrong: 'readiness' }),
    },
  }),
  'COMMON_ENRICHED_HANDOFF_BINDING_MISMATCH',
);
expectCode(
  () => createCommonEnrichedConsumerHandoff({
    ...input,
    payload: { ...empiricalPayload, createdAt: '2026-08-02T19:21:59.000Z' },
  }),
  'COMMON_ENRICHED_HANDOFF_CHRONOLOGY_INVALID',
);
expectCode(
  () => createCommonEnrichedConsumerHandoff({
    ...input,
    decision: { ...empiricalDecision, decidedAt: '2026-08-02T19:22:59.000Z' },
  }),
  'COMMON_ENRICHED_HANDOFF_CHRONOLOGY_INVALID',
);
expectCode(
  () => requireCommonEnrichedConsumerHandoff({
    ...authorized,
    semanticHash: semanticHash({ tampered: true }),
  }),
  'COMMON_ENRICHED_HASH_MISMATCH',
);
expectCode(
  () => requireCommonEnrichedConsumerHandoff({
    ...denied,
    status: 'AUTHORIZED',
    semanticHash: semanticHash({ tampered: 'outcome' }),
  }),
  'COMMON_ENRICHED_HANDOFF_OUTCOME_INVALID',
);

console.log('PASS common enriched consumer handoff checks');
console.log(JSON.stringify({
  baselineSemanticHash: baseline.semanticHash,
  readinessEvaluationSemanticHash: evaluation.semanticHash,
  authorizedHandoffSemanticHash: authorized.semanticHash,
  deniedHandoffSemanticHash: denied.semanticHash,
}, null, 2));

function readiness(consumer) {
  return evaluation.readiness.find((entry) => entry.consumer === consumer);
}

function payload({ payloadId, payloadSchema, payloadSemanticHash, readiness: record, createdAt }) {
  return {
    schema: COMMON_ENRICHED_CONSUMER_PAYLOAD_SCHEMA,
    payloadId,
    payloadSchema,
    payloadSemanticHash,
    adapterVersion: record.adapterVersion,
    configurationHash: record.configurationHash,
    createdAt,
  };
}

function handoffDecision({ decisionId, consumer, readiness: record, payload: descriptor, decision, decidedAt }) {
  return {
    schema: COMMON_ENRICHED_CONSUMER_HANDOFF_DECISION_SCHEMA,
    decisionId,
    consumer,
    baselineSemanticHash: baseline.semanticHash,
    readinessSemanticHash: record.semanticHash,
    payloadSemanticHash: descriptor.payloadSemanticHash,
    decision,
    authorityId: 'AUTHORITY:CONSUMER-GATEKEEPER',
    decidedAt,
    evidenceHash: semanticHash({ decisionId, consumer, decision }),
  };
}

function policy(consumer, configured, requirements) {
  return {
    schema: COMMON_ENRICHED_CONSUMER_POLICY_SCHEMA,
    consumer,
    configured,
    adapterVersion: '1.0.0',
    configurationHash: semanticHash({ consumer, configured, requirements }),
    requirements: [...requirements].sort((a, b) => a.requirementId.localeCompare(b.requirementId)),
  };
}

function requirement(targetKind, field) {
  return {
    schema: COMMON_ENRICHED_CONSUMER_REQUIREMENT_SCHEMA,
    requirementId: `${targetKind}:${field}`,
    targetKind,
    field,
    allowNotApplicable: false,
  };
}

function exactField(field, value, unit, sourceKind) {
  return {
    schema: FIELD_SCHEMA,
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
    approved: true,
    diagnostics: [],
  };
}

function proposedField(field, value) {
  return {
    schema: FIELD_SCHEMA,
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
    policyId: 'POLICY:EXPORT',
    policyHash: semanticHash({ policy: 'EXPORT' }),
    reviewEventId: null,
    approved: false,
    diagnostics: [],
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}
