import assert from 'node:assert/strict';
import {
  AUTHORIZED_STAGED_JSON_PROJECTION_SCHEMA,
  AUTHORIZED_STAGED_JSON_SIDECAR_REQUEST_SCHEMA,
  compileAuthorizedStagedJsonSidecar,
  computeAuthorizedStagedJsonSidecarSemanticHash,
  requireAuthorizedStagedJsonSidecar,
} from '../src/workspace/enrichment/authorized-staged-json-sidecar.js';
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
} from '../src/core/common-enriched-properties/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';

const FIELD_SCHEMA = 'common-enriched-properties-field/v1';
const SOURCE_HASH = 'f'.repeat(64);
const SOURCE_BINDING = {
  schema: COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
  sourceKey: 'LINE_LIST:lineList',
  sourceHash: SOURCE_HASH,
  snapshotSemanticHash: semanticHash({ snapshot: 'STAGED-JSON-P15' }),
};
const BASE_RECORDS = [
  record('COMPONENT:C1', 'COMPONENT', 'C1', 'S100', {
    catalogKey: 'ELBOW-100-CS',
    componentExportLabel: 'ELBOW-01',
  }),
  record('LINE:S100', 'LINE', 'S100', 'S100', {
    lineExportLabel: 'LINE-S100',
    materialCode: 'A106-B',
    operatingPressureBar: 12.5,
  }),
];

const chain = buildChain(BASE_RECORDS);
const request = {
  schema: AUTHORIZED_STAGED_JSON_SIDECAR_REQUEST_SCHEMA,
  sidecarId: 'SIDECAR-P15',
  handoff: chain.handoff,
  projectionPayload: chain.payload,
};
const first = compileAuthorizedStagedJsonSidecar(request);
const second = compileAuthorizedStagedJsonSidecar(request);
assert.deepEqual(first, second, 'sidecar compilation must be deterministic');
assert.deepEqual(requireAuthorizedStagedJsonSidecar(first), first);
assert.ok(Object.isFrozen(first));
assert.ok(Object.isFrozen(first.entries[0]));
assert.deepEqual(first.summary, {
  entryCount: 2,
  lineEntryCount: 1,
  componentEntryCount: 1,
  attributeCount: 5,
});
assert.deepEqual(first.entries.map((entry) => entry.sourceRecordId), ['C1', 'S100']);
assert.deepEqual(first.entries[0].attributes, {
  catalogKey: 'ELBOW-100-CS',
  componentExportLabel: 'ELBOW-01',
});

const denied = buildChain(BASE_RECORDS, 'DENY');
expectCode(
  () => compileAuthorizedStagedJsonSidecar({
    ...request,
    handoff: denied.handoff,
    projectionPayload: denied.payload,
  }),
  'STAGED_JSON_SIDECAR_HANDOFF_NOT_AUTHORIZED',
);

const duplicate = buildChain([
  ...BASE_RECORDS,
  record('COMPONENT:C2', 'COMPONENT', 'C1', 'S200', {
    catalogKey: 'TEE-100-CS',
    componentExportLabel: 'DUPLICATE',
  }),
]);
expectCode(
  () => compileAuthorizedStagedJsonSidecar({
    ...request,
    handoff: duplicate.handoff,
    projectionPayload: duplicate.payload,
  }),
  'STAGED_JSON_SIDECAR_DUPLICATE_SOURCE_RECORD',
);

const protectedField = buildChain([
  record('LINE:S100', 'LINE', 'S100', 'S100', { position: '0,0,0' }),
]);
expectCode(
  () => compileAuthorizedStagedJsonSidecar({
    ...request,
    handoff: protectedField.handoff,
    projectionPayload: protectedField.payload,
  }),
  'STAGED_JSON_SIDECAR_PROTECTED_FIELD',
);

const other = buildChain([
  record('LINE:S100', 'LINE', 'S100', 'S100', { lineExportLabel: 'OTHER' }),
]);
expectCode(
  () => compileAuthorizedStagedJsonSidecar({
    ...request,
    projectionPayload: other.payload,
  }),
  'STAGED_JSON_SIDECAR_PAYLOAD_BINDING_MISMATCH',
);

const tampered = {
  ...first,
  entries: first.entries.map((entry, index) => index === 0
    ? { ...entry, attributes: { ...entry.attributes, componentExportLabel: 'TAMPERED' } }
    : entry),
};
expectCode(
  () => requireAuthorizedStagedJsonSidecar({
    ...tampered,
    semanticHash: computeAuthorizedStagedJsonSidecarSemanticHash(tampered),
  }),
  'STAGED_JSON_SIDECAR_HASH_MISMATCH',
);

console.log('PASS authorized stagedJson sidecar checks');
console.log(JSON.stringify({
  baselineSemanticHash: first.baselineSemanticHash,
  projectionPayloadSemanticHash: first.projectionPayloadSemanticHash,
  handoffSemanticHash: first.handoffSemanticHash,
  sidecarSemanticHash: first.semanticHash,
  summary: first.summary,
}, null, 2));

function buildChain(records, handoffDecision = 'AUTHORIZE') {
  const sourceModelHash = semanticHash({ records, handoffDecision });
  const targetRecords = records
    .map((item) => createCommonEnrichedTargetRecord({
      schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
      targetId: item.targetId,
      targetKind: item.targetKind,
      sourceModelHash,
      sourceRecordId: item.sourceRecordId,
      lineKey: item.lineKey,
      fields: Object.entries(item.values)
        .sort(([left], [right]) => compareAscii(left, right))
        .map(([fieldName, value]) => exactField(fieldName, value)),
    }))
    .sort((left, right) => compareAscii(left.targetId, right.targetId));
  const candidate = createCommonEnrichedPropertiesCandidate({
    schema: COMMON_ENRICHED_CANDIDATE_SCHEMA,
    candidateId: `CAND-${semanticHash(records).slice(-8)}`,
    projectId: 'PROJECT-STAGED-JSON-P15',
    revision: 1,
    createdAt: '2026-08-03T00:40:00.000Z',
    status: COMMON_ENRICHED_CANDIDATE_STATUS,
    sourceModelHash,
    sourceSnapshots: [SOURCE_BINDING],
    targetRecords,
    reviewLedgerHash: semanticHash({ review: records }),
  });
  const baseline = orchestrateCommonEnrichedPublication({
    schema: COMMON_ENRICHED_PUBLICATION_ORCHESTRATION_SCHEMA,
    transactionId: `PUB-${candidate.candidateId}`,
    candidate,
    decision: {
      schema: COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA,
      decisionId: `DEC-PUB-${candidate.candidateId}`,
      candidateSemanticHash: candidate.semanticHash,
      decision: 'APPROVE',
      authorityId: 'AUTHORITY:ENGINEERING',
      decidedAt: '2026-08-03T00:41:00.000Z',
      evidenceHash: candidate.reviewLedgerHash,
    },
    previousBaseline: null,
    publicationIdentity: {
      baselineId: `BASE-${candidate.candidateId}`,
      publishedAt: '2026-08-03T00:42:00.000Z',
    },
  }).baseline;
  const requirements = uniqueRequirements(records);
  const configurationHash = semanticHash({
    consumer: 'ENRICHED_STAGED_JSON_EXPORT',
    requirements,
  });
  const evaluation = evaluateCommonEnrichedConsumerReadiness({
    schema: COMMON_ENRICHED_CONSUMER_READINESS_EVALUATION_SCHEMA,
    evaluationId: `READY-${candidate.candidateId}`,
    baseline,
    currentSourceModelHash: sourceModelHash,
    currentSourceSnapshots: [SOURCE_BINDING],
    policies: [
      policy('EMPIRICAL_LOADS', false, []),
      policy('ENRICHED_STAGED_JSON_EXPORT', true, requirements, configurationHash),
      policy('LFEA_HANDOFF', false, []),
    ],
  });
  const readiness = evaluation.readiness.find(
    (entry) => entry.consumer === 'ENRICHED_STAGED_JSON_EXPORT',
  );
  const projectionFields = uniqueProjectionFields(records);
  const payload = createCommonEnrichedConsumerProjectionPayload({
    schema: COMMON_ENRICHED_CONSUMER_PROJECTION_BUILD_SCHEMA,
    payloadId: `PAYLOAD-${candidate.candidateId}`,
    baseline,
    readinessEvaluation: evaluation,
    policy: {
      schema: COMMON_ENRICHED_CONSUMER_PROJECTION_POLICY_SCHEMA,
      consumer: 'ENRICHED_STAGED_JSON_EXPORT',
      payloadSchema: AUTHORIZED_STAGED_JSON_PROJECTION_SCHEMA,
      adapterVersion: readiness.adapterVersion,
      configurationHash: readiness.configurationHash,
      fields: projectionFields,
    },
    createdAt: '2026-08-03T00:43:00.000Z',
  });
  const handoff = createCommonEnrichedConsumerHandoff({
    schema: COMMON_ENRICHED_CONSUMER_HANDOFF_SCHEMA,
    handoffId: `HANDOFF-${candidate.candidateId}`,
    consumer: 'ENRICHED_STAGED_JSON_EXPORT',
    baseline,
    readinessEvaluation: evaluation,
    payload: createCommonEnrichedConsumerProjectionDescriptor(payload),
    decision: {
      schema: COMMON_ENRICHED_CONSUMER_HANDOFF_DECISION_SCHEMA,
      decisionId: `DEC-HANDOFF-${candidate.candidateId}`,
      consumer: 'ENRICHED_STAGED_JSON_EXPORT',
      baselineSemanticHash: baseline.semanticHash,
      readinessSemanticHash: readiness.semanticHash,
      payloadSemanticHash: payload.semanticHash,
      decision: handoffDecision,
      authorityId: 'AUTHORITY:STAGED-JSON-GATEKEEPER',
      decidedAt: '2026-08-03T00:44:00.000Z',
      evidenceHash: semanticHash({ handoffDecision, payload: payload.semanticHash }),
    },
  });
  return { payload, handoff };
}

function record(targetId, targetKind, sourceRecordId, lineKey, values) {
  return { targetId, targetKind, sourceRecordId, lineKey, values };
}

function uniqueRequirements(records) {
  const rows = new Map();
  for (const item of records) {
    for (const fieldName of Object.keys(item.values)) {
      const requirement = {
        schema: COMMON_ENRICHED_CONSUMER_REQUIREMENT_SCHEMA,
        requirementId: `${item.targetKind}:${fieldName}`,
        targetKind: item.targetKind,
        field: fieldName,
        allowNotApplicable: false,
      };
      rows.set(requirement.requirementId, requirement);
    }
  }
  return [...rows.values()].sort((left, right) =>
    compareAscii(left.requirementId, right.requirementId));
}

function uniqueProjectionFields(records) {
  const rows = new Map();
  for (const item of records) {
    for (const fieldName of Object.keys(item.values)) {
      const key = `${item.targetKind}:${fieldName}`;
      rows.set(key, {
        schema: COMMON_ENRICHED_CONSUMER_PROJECTION_FIELD_SCHEMA,
        outputField: fieldName,
        targetKind: item.targetKind,
        sourceField: fieldName,
        allowNotApplicable: false,
      });
    }
  }
  return [...rows.values()].sort((left, right) =>
    compareAscii(left.outputField, right.outputField)
      || compareAscii(left.targetKind, right.targetKind));
}

function exactField(fieldName, value) {
  return {
    schema: FIELD_SCHEMA,
    field: fieldName,
    value,
    unit: null,
    status: 'RESOLVED_EXACT',
    sourceKind: 'LINE_LIST',
    sourceKey: 'LINE_LIST:SOURCE',
    sourceHash: SOURCE_HASH,
    locator: `FIELD:${fieldName}`,
    matchMethod: 'EXACT_KEY',
    confidence: 1,
    policyId: null,
    policyHash: null,
    reviewEventId: null,
    approved: true,
    diagnostics: [],
  };
}

function policy(
  consumer,
  configured,
  requirements,
  configurationHash = semanticHash({ consumer, configured, requirements }),
) {
  return {
    schema: COMMON_ENRICHED_CONSUMER_POLICY_SCHEMA,
    consumer,
    configured,
    adapterVersion: '1.0.0',
    configurationHash,
    requirements,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
