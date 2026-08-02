import assert from 'node:assert/strict';
import {
  COMMON_ENRICHED_CANDIDATE_SCHEMA,
  COMMON_ENRICHED_CANDIDATE_STATUS,
  COMMON_ENRICHED_CONSUMER_HANDOFF_DECISION_SCHEMA,
  COMMON_ENRICHED_CONSUMER_HANDOFF_SCHEMA,
  COMMON_ENRICHED_CONSUMER_POLICY_SCHEMA,
  COMMON_ENRICHED_CONSUMER_PROJECTION_BUILD_SCHEMA,
  COMMON_ENRICHED_CONSUMER_PROJECTION_FIELD_SCHEMA,
  COMMON_ENRICHED_CONSUMER_PROJECTION_POLICY_SCHEMA,
  COMMON_ENRICHED_CONSUMER_READINESS_EVALUATION_SCHEMA,
  COMMON_ENRICHED_CONSUMER_REQUIREMENT_SCHEMA,
  COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA,
  COMMON_ENRICHED_PUBLICATION_ORCHESTRATION_SCHEMA,
  COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
  COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
  createCommonEnrichedConsumerHandoff,
  createCommonEnrichedConsumerProjectionDescriptor,
  createCommonEnrichedConsumerProjectionPayload,
  createCommonEnrichedPropertiesCandidate,
  createCommonEnrichedTargetRecord,
  evaluateCommonEnrichedConsumerReadiness,
  orchestrateCommonEnrichedPublication,
  requireCommonEnrichedConsumerProjectionPayload,
} from '../src/core/common-enriched-properties/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';

const FIELD_SCHEMA = 'common-enriched-properties-field/v1';
const MODEL_HASH = semanticHash({ model: 'PHASE-13' });
const REVIEW_HASH = semanticHash({ review: 'PHASE-13' });
const SOURCE_HASH = 'd'.repeat(64);
const SNAPSHOT_HASH = semanticHash({ snapshot: 'PHASE-13' });
const SOURCE_BINDING = {
  schema: COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
  sourceKey: 'LINE_LIST:lineList',
  sourceHash: SOURCE_HASH,
  snapshotSemanticHash: SNAPSHOT_HASH,
};

const candidate = createCommonEnrichedPropertiesCandidate({
  schema: COMMON_ENRICHED_CANDIDATE_SCHEMA,
  candidateId: 'CAND-P13-R1',
  projectId: 'PROJECT-P13',
  revision: 1,
  createdAt: '2026-08-02T19:30:00.000Z',
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
        notApplicableField('optional.tag'),
      ],
    }),
  ],
  reviewLedgerHash: REVIEW_HASH,
});
const baseline = orchestrateCommonEnrichedPublication({
  schema: COMMON_ENRICHED_PUBLICATION_ORCHESTRATION_SCHEMA,
  transactionId: 'PUB-P13-R1',
  candidate,
  decision: {
    schema: COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA,
    decisionId: 'DEC-P13-PUBLISH',
    candidateSemanticHash: candidate.semanticHash,
    decision: 'APPROVE',
    authorityId: 'AUTHORITY:LEAD-ENGINEER',
    decidedAt: '2026-08-02T19:31:00.000Z',
    evidenceHash: REVIEW_HASH,
  },
  previousBaseline: null,
  publicationIdentity: {
    baselineId: 'BASE-P13-R1',
    publishedAt: '2026-08-02T19:32:00.000Z',
  },
}).baseline;

const empiricalRequirements = [
  requirement('COMPONENT', 'component.weightKg'),
  requirement('LINE', 'fluid.densityKgM3'),
  requirement('LINE', 'optional.tag', true),
];
const empiricalConfigHash = semanticHash({
  consumer: 'EMPIRICAL_LOADS',
  configured: true,
  requirements: empiricalRequirements,
});
const evaluation = evaluateCommonEnrichedConsumerReadiness({
  schema: COMMON_ENRICHED_CONSUMER_READINESS_EVALUATION_SCHEMA,
  evaluationId: 'READY-EVAL-P13',
  baseline,
  currentSourceModelHash: MODEL_HASH,
  currentSourceSnapshots: [SOURCE_BINDING],
  policies: [
    policy('EMPIRICAL_LOADS', true, empiricalRequirements, empiricalConfigHash),
    policy('ENRICHED_STAGED_JSON_EXPORT', true, [
      requirement('LINE', 'metadata.exportLabel'),
    ]),
    policy('LFEA_HANDOFF', false, []),
  ],
});
const empiricalReadiness = evaluation.readiness.find(
  (entry) => entry.consumer === 'EMPIRICAL_LOADS',
);
assert.equal(empiricalReadiness.status, 'READY');

const projectionPolicy = {
  schema: COMMON_ENRICHED_CONSUMER_PROJECTION_POLICY_SCHEMA,
  consumer: 'EMPIRICAL_LOADS',
  payloadSchema: 'empirical-load-input/v1',
  adapterVersion: empiricalReadiness.adapterVersion,
  configurationHash: empiricalReadiness.configurationHash,
  fields: [
    projectionField('densityKgM3', 'LINE', 'fluid.densityKgM3'),
    projectionField('optionalTag', 'LINE', 'optional.tag', true),
    projectionField('weightKg', 'COMPONENT', 'component.weightKg'),
  ],
};
const buildInput = {
  schema: COMMON_ENRICHED_CONSUMER_PROJECTION_BUILD_SCHEMA,
  payloadId: 'PAYLOAD-P13-EMPIRICAL',
  baseline,
  readinessEvaluation: evaluation,
  policy: projectionPolicy,
  createdAt: '2026-08-02T19:33:00.000Z',
};
const payload = createCommonEnrichedConsumerProjectionPayload(buildInput);
const repeated = createCommonEnrichedConsumerProjectionPayload(buildInput);
assert.deepEqual(payload, repeated, 'projection payload must be deterministic');
assert.deepEqual(requireCommonEnrichedConsumerProjectionPayload(payload), payload);
assert.equal(payload.records.length, 2);
assert.deepEqual(payload.records[0].values, { weightKg: 15 });
assert.deepEqual(payload.records[1].values, { densityKgM3: 998, optionalTag: null });
assert.ok(Object.isFrozen(payload));
assert.ok(Object.isFrozen(payload.records[0]));

const descriptor = createCommonEnrichedConsumerProjectionDescriptor(payload);
assert.equal(descriptor.payloadId, payload.payloadId);
assert.equal(descriptor.payloadSchema, payload.payloadSchema);
assert.equal(descriptor.payloadSemanticHash, payload.semanticHash);
assert.equal(descriptor.adapterVersion, payload.adapterVersion);
assert.equal(descriptor.configurationHash, payload.configurationHash);

const handoff = createCommonEnrichedConsumerHandoff({
  schema: COMMON_ENRICHED_CONSUMER_HANDOFF_SCHEMA,
  handoffId: 'HANDOFF-P13-EMPIRICAL',
  consumer: 'EMPIRICAL_LOADS',
  baseline,
  readinessEvaluation: evaluation,
  payload: descriptor,
  decision: {
    schema: COMMON_ENRICHED_CONSUMER_HANDOFF_DECISION_SCHEMA,
    decisionId: 'DEC-P13-HANDOFF',
    consumer: 'EMPIRICAL_LOADS',
    baselineSemanticHash: baseline.semanticHash,
    readinessSemanticHash: empiricalReadiness.semanticHash,
    payloadSemanticHash: payload.semanticHash,
    decision: 'AUTHORIZE',
    authorityId: 'AUTHORITY:CONSUMER-GATEKEEPER',
    decidedAt: '2026-08-02T19:34:00.000Z',
    evidenceHash: semanticHash({ handoff: 'PHASE-13' }),
  },
});
assert.equal(handoff.status, 'AUTHORIZED');
assert.equal(handoff.payload.payloadSemanticHash, payload.semanticHash);

const exportReadiness = evaluation.readiness.find(
  (entry) => entry.consumer === 'ENRICHED_STAGED_JSON_EXPORT',
);
expectCode(
  () => createCommonEnrichedConsumerProjectionPayload({
    ...buildInput,
    payloadId: 'PAYLOAD-P13-BLOCKED-EXPORT',
    policy: {
      schema: COMMON_ENRICHED_CONSUMER_PROJECTION_POLICY_SCHEMA,
      consumer: 'ENRICHED_STAGED_JSON_EXPORT',
      payloadSchema: 'enriched-staged-json-input/v1',
      adapterVersion: exportReadiness.adapterVersion,
      configurationHash: exportReadiness.configurationHash,
      fields: [projectionField('exportLabel', 'LINE', 'metadata.exportLabel')],
    },
  }),
  'COMMON_ENRICHED_PROJECTION_NOT_READY',
);
expectCode(
  () => createCommonEnrichedConsumerProjectionPayload({
    ...buildInput,
    policy: { ...projectionPolicy, adapterVersion: '9.9.9' },
  }),
  'COMMON_ENRICHED_PROJECTION_ADAPTER_MISMATCH',
);
expectCode(
  () => createCommonEnrichedConsumerProjectionPayload({
    ...buildInput,
    policy: {
      ...projectionPolicy,
      configurationHash: semanticHash({ wrong: 'configuration' }),
    },
  }),
  'COMMON_ENRICHED_PROJECTION_CONFIGURATION_MISMATCH',
);
expectCode(
  () => createCommonEnrichedConsumerProjectionPayload({
    ...buildInput,
    policy: {
      ...projectionPolicy,
      fields: [
        ...projectionPolicy.fields,
        projectionField('unqualified', 'LINE', 'metadata.exportLabel'),
      ].sort((a, b) => a.outputField.localeCompare(b.outputField)),
    },
  }),
  'COMMON_ENRICHED_PROJECTION_FIELD_NOT_QUALIFIED',
);
expectCode(
  () => createCommonEnrichedConsumerProjectionPayload({
    ...buildInput,
    policy: {
      ...projectionPolicy,
      fields: projectionPolicy.fields.map((field) => field.outputField === 'optionalTag'
        ? { ...field, allowNotApplicable: false }
        : field),
    },
  }),
  'COMMON_ENRICHED_PROJECTION_FIELD_INVALID',
);
expectCode(
  () => createCommonEnrichedConsumerProjectionPayload({
    ...buildInput,
    createdAt: '2026-08-02T19:31:59.000Z',
  }),
  'COMMON_ENRICHED_PROJECTION_CHRONOLOGY_INVALID',
);
expectCode(
  () => createCommonEnrichedConsumerProjectionPayload({
    ...buildInput,
    policy: {
      ...projectionPolicy,
      fields: [
        projectionField('same', 'LINE', 'fluid.densityKgM3'),
        projectionField('same', 'COMPONENT', 'component.weightKg'),
      ],
    },
  }),
  'COMMON_ENRICHED_DUPLICATE_IDENTITY',
);
expectCode(
  () => requireCommonEnrichedConsumerProjectionPayload({
    ...payload,
    semanticHash: semanticHash({ tampered: true }),
  }),
  'COMMON_ENRICHED_HASH_MISMATCH',
);

console.log('PASS common enriched consumer projection checks');
console.log(JSON.stringify({
  baselineSemanticHash: baseline.semanticHash,
  readinessSemanticHash: empiricalReadiness.semanticHash,
  payloadSemanticHash: payload.semanticHash,
  descriptorPayloadSemanticHash: descriptor.payloadSemanticHash,
  handoffSemanticHash: handoff.semanticHash,
  recordCount: payload.records.length,
}, null, 2));

function policy(consumer, configured, requirements, configurationHash = null) {
  return {
    schema: COMMON_ENRICHED_CONSUMER_POLICY_SCHEMA,
    consumer,
    configured,
    adapterVersion: '1.0.0',
    configurationHash: configurationHash || semanticHash({ consumer, configured, requirements }),
    requirements: [...requirements].sort((a, b) => a.requirementId.localeCompare(b.requirementId)),
  };
}

function requirement(targetKind, field, allowNotApplicable = false) {
  return {
    schema: COMMON_ENRICHED_CONSUMER_REQUIREMENT_SCHEMA,
    requirementId: `${targetKind}:${field}`,
    targetKind,
    field,
    allowNotApplicable,
  };
}

function projectionField(outputField, targetKind, sourceField, allowNotApplicable = false) {
  return {
    schema: COMMON_ENRICHED_CONSUMER_PROJECTION_FIELD_SCHEMA,
    outputField,
    targetKind,
    sourceField,
    allowNotApplicable,
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

function notApplicableField(field) {
  return {
    schema: FIELD_SCHEMA,
    field,
    value: null,
    unit: null,
    status: 'NOT_APPLICABLE',
    sourceKind: 'NONE',
    sourceKey: null,
    sourceHash: null,
    locator: null,
    matchMethod: 'NONE',
    confidence: 1,
    policyId: null,
    policyHash: null,
    reviewEventId: null,
    approved: true,
    diagnostics: [],
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}
