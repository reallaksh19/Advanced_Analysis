import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { failCommonEnrichment } from './errors.js';
import {
  requireExactKeys,
  requireIdentity,
  requireMember,
  requireSemanticHash,
  requireStringArray,
} from './validation.js';

export const COMMON_ENRICHED_CONSUMER_READINESS_SCHEMA = 'common-enriched-consumer-readiness/v1';
export const COMMON_ENRICHED_CONSUMERS = Object.freeze([
  'EMPIRICAL_LOADS',
  'LFEA_HANDOFF',
  'ENRICHED_STAGED_JSON_EXPORT',
]);
export const CONSUMER_READINESS_STATUSES = Object.freeze([
  'READY',
  'BLOCKED_UNAPPROVED_FIELDS',
  'BLOCKED_MISSING_FIELDS',
  'BLOCKED_STALE_SOURCE',
  'BLOCKED_NOT_CONFIGURED',
]);

export const CONSUMER_READINESS_KEYS = Object.freeze([
  'schema',
  'baselineSemanticHash',
  'consumer',
  'status',
  'requiredFields',
  'blockers',
  'adapterVersion',
  'configurationHash',
  'semanticHash',
]);

export function consumerReadinessSemanticProjection(value) {
  return {
    schema: value.schema,
    baselineSemanticHash: value.baselineSemanticHash,
    consumer: value.consumer,
    status: value.status,
    requiredFields: value.requiredFields,
    blockers: value.blockers,
    adapterVersion: value.adapterVersion,
    configurationHash: value.configurationHash,
  };
}

export function computeConsumerReadinessSemanticHash(value) {
  return semanticHash(consumerReadinessSemanticProjection(value));
}

export function createCommonEnrichedConsumerReadiness(input) {
  const draftKeys = CONSUMER_READINESS_KEYS.filter((key) => key !== 'semanticHash');
  requireExactKeys(input, draftKeys, 'consumerReadinessDraft');
  const draft = normalizeReadiness({ ...input, semanticHash: 'fnv1a64:0000000000000000' }, false);
  return deepFreeze({ ...draft, semanticHash: computeConsumerReadinessSemanticHash(draft) });
}

export function requireCommonEnrichedConsumerReadiness(value) {
  const readiness = normalizeReadiness(value, true);
  const expectedHash = computeConsumerReadinessSemanticHash(readiness);
  if (readiness.semanticHash !== expectedHash) {
    failCommonEnrichment('consumerReadiness.semanticHash is stale.', 'COMMON_ENRICHED_HASH_MISMATCH');
  }
  return deepFreeze(readiness);
}

function normalizeReadiness(value, validateHash) {
  requireExactKeys(value, CONSUMER_READINESS_KEYS, 'consumerReadiness');
  if (value.schema !== COMMON_ENRICHED_CONSUMER_READINESS_SCHEMA) {
    failCommonEnrichment('consumerReadiness.schema is unsupported.', 'COMMON_ENRICHED_SCHEMA_INVALID');
  }
  const readiness = {
    schema: value.schema,
    baselineSemanticHash: requireSemanticHash(value.baselineSemanticHash, 'consumerReadiness.baselineSemanticHash'),
    consumer: requireMember(value.consumer, COMMON_ENRICHED_CONSUMERS, 'consumerReadiness.consumer'),
    status: requireMember(value.status, CONSUMER_READINESS_STATUSES, 'consumerReadiness.status'),
    requiredFields: requireStringArray(value.requiredFields, 'consumerReadiness.requiredFields'),
    blockers: requireStringArray(value.blockers, 'consumerReadiness.blockers'),
    adapterVersion: requireIdentity(value.adapterVersion, 'consumerReadiness.adapterVersion'),
    configurationHash: requireSemanticHash(value.configurationHash, 'consumerReadiness.configurationHash'),
    semanticHash: value.semanticHash,
  };
  if (readiness.status === 'READY' && readiness.blockers.length > 0) {
    failCommonEnrichment('READY consumer readiness cannot carry blockers.', 'COMMON_ENRICHED_READINESS_INVALID');
  }
  if (readiness.status !== 'READY' && readiness.blockers.length === 0) {
    failCommonEnrichment('Blocked consumer readiness requires blockers.', 'COMMON_ENRICHED_READINESS_INVALID');
  }
  if (validateHash) requireSemanticHash(readiness.semanticHash, 'consumerReadiness.semanticHash');
  return readiness;
}
