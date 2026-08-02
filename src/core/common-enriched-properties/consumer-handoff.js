import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { requireCommonEnrichedConsumerReadiness } from './consumer-readiness.js';
import { requireCommonEnrichedConsumerReadinessEvaluation } from './consumer-readiness-evaluation.js';
import { failCommonEnrichment } from './errors.js';
import { requireCommonEnrichedPropertiesBaseline } from './publication.js';
import {
  requireExactKeys,
  requireIdentity,
  requireIsoDateTime,
  requireMember,
  requireSemanticHash,
  requireSourceDigest,
} from './validation.js';

export const COMMON_ENRICHED_CONSUMER_PAYLOAD_SCHEMA =
  'common-enriched-consumer-payload/v1';
export const COMMON_ENRICHED_CONSUMER_HANDOFF_DECISION_SCHEMA =
  'common-enriched-consumer-handoff-decision/v1';
export const COMMON_ENRICHED_CONSUMER_HANDOFF_SCHEMA =
  'common-enriched-consumer-handoff/v1';
export const COMMON_ENRICHED_CONSUMER_HANDOFF_DECISIONS = Object.freeze([
  'AUTHORIZE',
  'DENY',
]);
export const COMMON_ENRICHED_CONSUMER_HANDOFF_STATUSES = Object.freeze([
  'AUTHORIZED',
  'DENIED',
]);

const INPUT_KEYS = Object.freeze([
  'schema', 'handoffId', 'consumer', 'baseline', 'readinessEvaluation', 'payload', 'decision',
]);
const PAYLOAD_KEYS = Object.freeze([
  'schema', 'payloadId', 'payloadSchema', 'payloadSemanticHash',
  'adapterVersion', 'configurationHash', 'createdAt',
]);
const DECISION_KEYS = Object.freeze([
  'schema', 'decisionId', 'consumer', 'baselineSemanticHash', 'readinessSemanticHash',
  'payloadSemanticHash', 'decision', 'authorityId', 'decidedAt', 'evidenceHash',
]);
const HANDOFF_KEYS = Object.freeze([
  'schema', 'handoffId', 'consumer', 'baseline', 'readinessEvaluation', 'readiness',
  'payload', 'decision', 'decisionSemanticHash', 'status', 'semanticHash',
]);

export function consumerHandoffSemanticProjection(value) {
  return Object.fromEntries(HANDOFF_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeConsumerHandoffSemanticHash(value) {
  return semanticHash(consumerHandoffSemanticProjection(value));
}

export function createCommonEnrichedConsumerHandoff(input) {
  requireExactKeys(input, INPUT_KEYS, 'consumerHandoffDraft');
  if (input.schema !== COMMON_ENRICHED_CONSUMER_HANDOFF_SCHEMA) schemaError('consumerHandoffDraft');

  const handoffId = requireIdentity(input.handoffId, 'consumerHandoff.handoffId');
  const consumer = requireIdentity(input.consumer, 'consumerHandoff.consumer');
  const baseline = requireCommonEnrichedPropertiesBaseline(input.baseline);
  const readinessEvaluation = requireCommonEnrichedConsumerReadinessEvaluation(
    input.readinessEvaluation,
  );
  if (readinessEvaluation.baselineSemanticHash !== baseline.semanticHash) {
    failCommonEnrichment(
      'Readiness evaluation is bound to a different baseline.',
      'COMMON_ENRICHED_HANDOFF_READINESS_BASELINE_MISMATCH',
    );
  }
  const readiness = readinessEvaluation.readiness.find((entry) => entry.consumer === consumer);
  if (!readiness) {
    failCommonEnrichment(
      'Readiness evaluation does not contain the requested consumer.',
      'COMMON_ENRICHED_HANDOFF_READINESS_MISSING',
      { consumer },
    );
  }
  const payload = requireCommonEnrichedConsumerPayload(input.payload);
  const decision = requireCommonEnrichedConsumerHandoffDecision(input.decision);
  requireHandoffBindings({ consumer, baseline, readiness, payload, decision });
  requireHandoffChronology({ baseline, payload, decision });

  const status = decision.decision === 'AUTHORIZE' ? 'AUTHORIZED' : 'DENIED';
  if (status === 'AUTHORIZED' && readiness.status !== 'READY') {
    failCommonEnrichment(
      'A consumer handoff cannot be authorized unless readiness is READY.',
      'COMMON_ENRICHED_HANDOFF_NOT_READY',
      { consumer, readinessStatus: readiness.status },
    );
  }

  const draft = {
    schema: COMMON_ENRICHED_CONSUMER_HANDOFF_SCHEMA,
    handoffId,
    consumer,
    baseline,
    readinessEvaluation,
    readiness,
    payload,
    decision,
    decisionSemanticHash: semanticHash(decision),
    status,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireCommonEnrichedConsumerHandoff({
    ...draft,
    semanticHash: computeConsumerHandoffSemanticHash(draft),
  });
}

export function requireCommonEnrichedConsumerHandoff(value) {
  requireExactKeys(value, HANDOFF_KEYS, 'consumerHandoff');
  if (value.schema !== COMMON_ENRICHED_CONSUMER_HANDOFF_SCHEMA) schemaError('consumerHandoff');
  const handoff = {
    schema: value.schema,
    handoffId: requireIdentity(value.handoffId, 'consumerHandoff.handoffId'),
    consumer: requireIdentity(value.consumer, 'consumerHandoff.consumer'),
    baseline: requireCommonEnrichedPropertiesBaseline(value.baseline),
    readinessEvaluation: requireCommonEnrichedConsumerReadinessEvaluation(
      value.readinessEvaluation,
    ),
    readiness: requireCommonEnrichedConsumerReadiness(value.readiness),
    payload: requireCommonEnrichedConsumerPayload(value.payload),
    decision: requireCommonEnrichedConsumerHandoffDecision(value.decision),
    decisionSemanticHash: requireSemanticHash(
      value.decisionSemanticHash,
      'consumerHandoff.decisionSemanticHash',
    ),
    status: requireMember(
      value.status,
      COMMON_ENRICHED_CONSUMER_HANDOFF_STATUSES,
      'consumerHandoff.status',
    ),
    semanticHash: requireSemanticHash(value.semanticHash, 'consumerHandoff.semanticHash'),
  };
  requireEnvelopeBindings(handoff);
  const expectedHash = computeConsumerHandoffSemanticHash(handoff);
  if (handoff.semanticHash !== expectedHash) {
    failCommonEnrichment(
      'consumerHandoff.semanticHash is stale.',
      'COMMON_ENRICHED_HASH_MISMATCH',
      { expected: expectedHash, actual: handoff.semanticHash },
    );
  }
  return deepFreeze(handoff);
}

export function requireCommonEnrichedConsumerPayload(value) {
  requireExactKeys(value, PAYLOAD_KEYS, 'consumerPayload');
  if (value.schema !== COMMON_ENRICHED_CONSUMER_PAYLOAD_SCHEMA) schemaError('consumerPayload');
  return deepFreeze({
    schema: value.schema,
    payloadId: requireIdentity(value.payloadId, 'consumerPayload.payloadId'),
    payloadSchema: requireIdentity(value.payloadSchema, 'consumerPayload.payloadSchema'),
    payloadSemanticHash: requireSemanticHash(
      value.payloadSemanticHash,
      'consumerPayload.payloadSemanticHash',
    ),
    adapterVersion: requireIdentity(value.adapterVersion, 'consumerPayload.adapterVersion'),
    configurationHash: requireSemanticHash(
      value.configurationHash,
      'consumerPayload.configurationHash',
    ),
    createdAt: requireIsoDateTime(value.createdAt, 'consumerPayload.createdAt'),
  });
}

export function requireCommonEnrichedConsumerHandoffDecision(value) {
  requireExactKeys(value, DECISION_KEYS, 'consumerHandoffDecision');
  if (value.schema !== COMMON_ENRICHED_CONSUMER_HANDOFF_DECISION_SCHEMA) {
    schemaError('consumerHandoffDecision');
  }
  return deepFreeze({
    schema: value.schema,
    decisionId: requireIdentity(value.decisionId, 'consumerHandoffDecision.decisionId'),
    consumer: requireIdentity(value.consumer, 'consumerHandoffDecision.consumer'),
    baselineSemanticHash: requireSemanticHash(
      value.baselineSemanticHash,
      'consumerHandoffDecision.baselineSemanticHash',
    ),
    readinessSemanticHash: requireSemanticHash(
      value.readinessSemanticHash,
      'consumerHandoffDecision.readinessSemanticHash',
    ),
    payloadSemanticHash: requireSemanticHash(
      value.payloadSemanticHash,
      'consumerHandoffDecision.payloadSemanticHash',
    ),
    decision: requireMember(
      value.decision,
      COMMON_ENRICHED_CONSUMER_HANDOFF_DECISIONS,
      'consumerHandoffDecision.decision',
    ),
    authorityId: requireIdentity(value.authorityId, 'consumerHandoffDecision.authorityId'),
    decidedAt: requireIsoDateTime(value.decidedAt, 'consumerHandoffDecision.decidedAt'),
    evidenceHash: requireSourceDigest(value.evidenceHash, 'consumerHandoffDecision.evidenceHash'),
  });
}

function requireEnvelopeBindings(handoff) {
  if (handoff.readinessEvaluation.baselineSemanticHash !== handoff.baseline.semanticHash
    || handoff.readiness.baselineSemanticHash !== handoff.baseline.semanticHash) {
    failCommonEnrichment(
      'Handoff readiness evidence is bound to a different baseline.',
      'COMMON_ENRICHED_HANDOFF_READINESS_BASELINE_MISMATCH',
    );
  }
  const evaluationReadiness = handoff.readinessEvaluation.readiness
    .find((entry) => entry.consumer === handoff.consumer);
  if (!evaluationReadiness || evaluationReadiness.semanticHash !== handoff.readiness.semanticHash) {
    failCommonEnrichment(
      'Handoff readiness record is not the selected evaluation record.',
      'COMMON_ENRICHED_HANDOFF_READINESS_MISMATCH',
    );
  }
  if (handoff.decisionSemanticHash !== semanticHash(handoff.decision)) {
    failCommonEnrichment(
      'consumerHandoff.decisionSemanticHash is stale.',
      'COMMON_ENRICHED_HASH_MISMATCH',
    );
  }
  requireHandoffBindings(handoff);
  requireHandoffChronology(handoff);
  const expectedStatus = handoff.decision.decision === 'AUTHORIZE' ? 'AUTHORIZED' : 'DENIED';
  if (handoff.status !== expectedStatus) {
    failCommonEnrichment(
      'Consumer handoff status does not match its decision.',
      'COMMON_ENRICHED_HANDOFF_OUTCOME_INVALID',
    );
  }
  if (handoff.status === 'AUTHORIZED' && handoff.readiness.status !== 'READY') {
    failCommonEnrichment(
      'Authorized handoff does not have READY readiness.',
      'COMMON_ENRICHED_HANDOFF_NOT_READY',
    );
  }
}

function requireHandoffBindings({ consumer, baseline, readiness, payload, decision }) {
  if (readiness.consumer !== consumer || decision.consumer !== consumer) {
    failCommonEnrichment(
      'Consumer handoff records reference different consumers.',
      'COMMON_ENRICHED_HANDOFF_BINDING_MISMATCH',
    );
  }
  if (decision.baselineSemanticHash !== baseline.semanticHash
    || decision.readinessSemanticHash !== readiness.semanticHash
    || decision.payloadSemanticHash !== payload.payloadSemanticHash) {
    failCommonEnrichment(
      'Consumer handoff decision is bound to different evidence.',
      'COMMON_ENRICHED_HANDOFF_BINDING_MISMATCH',
    );
  }
  if (payload.adapterVersion !== readiness.adapterVersion) {
    failCommonEnrichment(
      'Consumer payload adapter version differs from readiness.',
      'COMMON_ENRICHED_HANDOFF_ADAPTER_MISMATCH',
    );
  }
  if (payload.configurationHash !== readiness.configurationHash) {
    failCommonEnrichment(
      'Consumer payload configuration differs from readiness.',
      'COMMON_ENRICHED_HANDOFF_CONFIGURATION_MISMATCH',
    );
  }
}

function requireHandoffChronology({ baseline, payload, decision }) {
  if (Date.parse(payload.createdAt) < Date.parse(baseline.publishedAt)
    || Date.parse(decision.decidedAt) < Date.parse(payload.createdAt)) {
    failCommonEnrichment(
      'Consumer handoff chronology is invalid.',
      'COMMON_ENRICHED_HANDOFF_CHRONOLOGY_INVALID',
      {
        baselinePublishedAt: baseline.publishedAt,
        payloadCreatedAt: payload.createdAt,
        decisionDecidedAt: decision.decidedAt,
      },
    );
  }
}

function schemaError(label) {
  failCommonEnrichment(`${label}.schema is unsupported.`, 'COMMON_ENRICHED_SCHEMA_INVALID');
}
