import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  COMMON_ENRICHED_CONSUMER_PAYLOAD_SCHEMA,
  requireCommonEnrichedConsumerPayload,
} from './consumer-handoff.js';
import { requireCommonEnrichedConsumerReadinessEvaluation } from './consumer-readiness-evaluation.js';
import { failCommonEnrichment } from './errors.js';
import { requireCommonEnrichedPropertiesBaseline } from './publication.js';
import {
  compareAscii,
  requireBoolean,
  requireCanonicalJson,
  requireExactKeys,
  requireIdentity,
  requireIsoDateTime,
  requireMember,
  requireSemanticHash,
  requireUniqueSorted,
} from './validation.js';

export const COMMON_ENRICHED_CONSUMER_PROJECTION_BUILD_SCHEMA =
  'common-enriched-consumer-projection-build/v1';
export const COMMON_ENRICHED_CONSUMER_PROJECTION_POLICY_SCHEMA =
  'common-enriched-consumer-projection-policy/v1';
export const COMMON_ENRICHED_CONSUMER_PROJECTION_FIELD_SCHEMA =
  'common-enriched-consumer-projection-field/v1';
export const COMMON_ENRICHED_CONSUMER_PROJECTION_RECORD_SCHEMA =
  'common-enriched-consumer-projection-record/v1';
export const COMMON_ENRICHED_CONSUMER_PROJECTION_PAYLOAD_SCHEMA =
  'common-enriched-consumer-projection-payload/v1';

const BUILD_KEYS = Object.freeze([
  'schema', 'payloadId', 'baseline', 'readinessEvaluation', 'policy', 'createdAt',
]);
const POLICY_KEYS = Object.freeze([
  'schema', 'consumer', 'payloadSchema', 'adapterVersion', 'configurationHash', 'fields',
]);
const FIELD_KEYS = Object.freeze([
  'schema', 'outputField', 'targetKind', 'sourceField', 'allowNotApplicable',
]);
const RECORD_KEYS = Object.freeze([
  'schema', 'targetId', 'targetKind', 'sourceRecordId', 'lineKey', 'values', 'semanticHash',
]);
const PAYLOAD_KEYS = Object.freeze([
  'schema', 'payloadId', 'consumer', 'payloadSchema', 'baselineSemanticHash',
  'readinessEvaluationSemanticHash', 'readinessSemanticHash', 'adapterVersion',
  'configurationHash', 'createdAt', 'records', 'semanticHash',
]);
const TARGET_KINDS = Object.freeze(['LINE', 'COMPONENT']);
const ALLOWED_VALUE_STATUSES = Object.freeze([
  'RESOLVED_EXACT', 'RESOLVED_DERIVED', 'PROPOSED_REVIEW', 'NOT_APPLICABLE',
]);

export function consumerProjectionPayloadSemanticProjection(value) {
  return Object.fromEntries(PAYLOAD_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeConsumerProjectionPayloadSemanticHash(value) {
  return semanticHash(consumerProjectionPayloadSemanticProjection(value));
}

export function consumerProjectionRecordSemanticProjection(value) {
  return Object.fromEntries(RECORD_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeConsumerProjectionRecordSemanticHash(value) {
  return semanticHash(consumerProjectionRecordSemanticProjection(value));
}

export function createCommonEnrichedConsumerProjectionPayload(input) {
  requireExactKeys(input, BUILD_KEYS, 'consumerProjectionBuild');
  if (input.schema !== COMMON_ENRICHED_CONSUMER_PROJECTION_BUILD_SCHEMA) schemaError('consumerProjectionBuild');
  const baseline = requireCommonEnrichedPropertiesBaseline(input.baseline);
  const readinessEvaluation = requireCommonEnrichedConsumerReadinessEvaluation(
    input.readinessEvaluation,
  );
  if (readinessEvaluation.baselineSemanticHash !== baseline.semanticHash) {
    failCommonEnrichment(
      'Projection readiness evaluation is bound to a different baseline.',
      'COMMON_ENRICHED_PROJECTION_READINESS_BASELINE_MISMATCH',
    );
  }
  const policy = requireCommonEnrichedConsumerProjectionPolicy(input.policy);
  const readiness = readinessEvaluation.readiness.find(
    (entry) => entry.consumer === policy.consumer,
  );
  if (!readiness || readiness.status !== 'READY') {
    failCommonEnrichment(
      'Consumer projection requires READY readiness.',
      'COMMON_ENRICHED_PROJECTION_NOT_READY',
      { consumer: policy.consumer, readinessStatus: readiness?.status ?? null },
    );
  }
  if (policy.adapterVersion !== readiness.adapterVersion) {
    failCommonEnrichment(
      'Projection adapter version differs from readiness.',
      'COMMON_ENRICHED_PROJECTION_ADAPTER_MISMATCH',
    );
  }
  if (policy.configurationHash !== readiness.configurationHash) {
    failCommonEnrichment(
      'Projection configuration differs from readiness.',
      'COMMON_ENRICHED_PROJECTION_CONFIGURATION_MISMATCH',
    );
  }
  const qualifiedFields = new Set(readiness.requiredFields);
  for (const field of policy.fields) {
    if (!qualifiedFields.has(field.sourceField)) {
      failCommonEnrichment(
        'Projection field was not qualified by readiness.',
        'COMMON_ENRICHED_PROJECTION_FIELD_NOT_QUALIFIED',
        { sourceField: field.sourceField, consumer: policy.consumer },
      );
    }
  }

  const fieldsByKind = groupFieldsByTargetKind(policy.fields);
  const records = baseline.targetRecords
    .filter((target) => fieldsByKind.has(target.targetKind))
    .map((target) => projectTarget(target, fieldsByKind.get(target.targetKind)))
    .sort(by('targetId'));
  if (records.length === 0) {
    failCommonEnrichment(
      'Projection policy selected no baseline targets.',
      'COMMON_ENRICHED_PROJECTION_TARGETS_EMPTY',
    );
  }

  const draft = {
    schema: COMMON_ENRICHED_CONSUMER_PROJECTION_PAYLOAD_SCHEMA,
    payloadId: requireIdentity(input.payloadId, 'consumerProjectionPayload.payloadId'),
    consumer: policy.consumer,
    payloadSchema: policy.payloadSchema,
    baselineSemanticHash: baseline.semanticHash,
    readinessEvaluationSemanticHash: readinessEvaluation.semanticHash,
    readinessSemanticHash: readiness.semanticHash,
    adapterVersion: policy.adapterVersion,
    configurationHash: policy.configurationHash,
    createdAt: requireIsoDateTime(input.createdAt, 'consumerProjectionPayload.createdAt'),
    records,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  if (Date.parse(draft.createdAt) < Date.parse(baseline.publishedAt)) {
    failCommonEnrichment(
      'Projection payload predates baseline publication.',
      'COMMON_ENRICHED_PROJECTION_CHRONOLOGY_INVALID',
    );
  }
  return requireCommonEnrichedConsumerProjectionPayload({
    ...draft,
    semanticHash: computeConsumerProjectionPayloadSemanticHash(draft),
  });
}

export function createCommonEnrichedConsumerProjectionDescriptor(payloadValue) {
  const payload = requireCommonEnrichedConsumerProjectionPayload(payloadValue);
  return requireCommonEnrichedConsumerPayload({
    schema: COMMON_ENRICHED_CONSUMER_PAYLOAD_SCHEMA,
    payloadId: payload.payloadId,
    payloadSchema: payload.payloadSchema,
    payloadSemanticHash: payload.semanticHash,
    adapterVersion: payload.adapterVersion,
    configurationHash: payload.configurationHash,
    createdAt: payload.createdAt,
  });
}

export function requireCommonEnrichedConsumerProjectionPayload(value) {
  requireExactKeys(value, PAYLOAD_KEYS, 'consumerProjectionPayload');
  if (value.schema !== COMMON_ENRICHED_CONSUMER_PROJECTION_PAYLOAD_SCHEMA) schemaError('consumerProjectionPayload');
  const payload = {
    schema: value.schema,
    payloadId: requireIdentity(value.payloadId, 'consumerProjectionPayload.payloadId'),
    consumer: requireIdentity(value.consumer, 'consumerProjectionPayload.consumer'),
    payloadSchema: requireIdentity(value.payloadSchema, 'consumerProjectionPayload.payloadSchema'),
    baselineSemanticHash: requireSemanticHash(
      value.baselineSemanticHash,
      'consumerProjectionPayload.baselineSemanticHash',
    ),
    readinessEvaluationSemanticHash: requireSemanticHash(
      value.readinessEvaluationSemanticHash,
      'consumerProjectionPayload.readinessEvaluationSemanticHash',
    ),
    readinessSemanticHash: requireSemanticHash(
      value.readinessSemanticHash,
      'consumerProjectionPayload.readinessSemanticHash',
    ),
    adapterVersion: requireIdentity(
      value.adapterVersion,
      'consumerProjectionPayload.adapterVersion',
    ),
    configurationHash: requireSemanticHash(
      value.configurationHash,
      'consumerProjectionPayload.configurationHash',
    ),
    createdAt: requireIsoDateTime(value.createdAt, 'consumerProjectionPayload.createdAt'),
    records: requireUniqueSorted(
      value.records,
      'targetId',
      'consumerProjectionPayload.records',
    ).map(requireCommonEnrichedConsumerProjectionRecord),
    semanticHash: requireSemanticHash(value.semanticHash, 'consumerProjectionPayload.semanticHash'),
  };
  if (payload.records.length === 0) {
    failCommonEnrichment(
      'Consumer projection payload requires records.',
      'COMMON_ENRICHED_PROJECTION_TARGETS_EMPTY',
    );
  }
  const expectedHash = computeConsumerProjectionPayloadSemanticHash(payload);
  if (payload.semanticHash !== expectedHash) {
    failCommonEnrichment(
      'consumerProjectionPayload.semanticHash is stale.',
      'COMMON_ENRICHED_HASH_MISMATCH',
      { expected: expectedHash, actual: payload.semanticHash },
    );
  }
  return deepFreeze(payload);
}

export function requireCommonEnrichedConsumerProjectionPolicy(value) {
  requireExactKeys(value, POLICY_KEYS, 'consumerProjectionPolicy');
  if (value.schema !== COMMON_ENRICHED_CONSUMER_PROJECTION_POLICY_SCHEMA) schemaError('consumerProjectionPolicy');
  const fields = requireUniqueSorted(
    value.fields,
    'outputField',
    'consumerProjectionPolicy.fields',
  ).map(requireCommonEnrichedConsumerProjectionField);
  if (fields.length === 0) {
    failCommonEnrichment(
      'Consumer projection policy requires fields.',
      'COMMON_ENRICHED_PROJECTION_FIELDS_REQUIRED',
    );
  }
  return deepFreeze({
    schema: value.schema,
    consumer: requireIdentity(value.consumer, 'consumerProjectionPolicy.consumer'),
    payloadSchema: requireIdentity(value.payloadSchema, 'consumerProjectionPolicy.payloadSchema'),
    adapterVersion: requireIdentity(value.adapterVersion, 'consumerProjectionPolicy.adapterVersion'),
    configurationHash: requireSemanticHash(
      value.configurationHash,
      'consumerProjectionPolicy.configurationHash',
    ),
    fields,
  });
}

export function requireCommonEnrichedConsumerProjectionField(value) {
  requireExactKeys(value, FIELD_KEYS, 'consumerProjectionField');
  if (value.schema !== COMMON_ENRICHED_CONSUMER_PROJECTION_FIELD_SCHEMA) schemaError('consumerProjectionField');
  return deepFreeze({
    schema: value.schema,
    outputField: requireIdentity(value.outputField, 'consumerProjectionField.outputField'),
    targetKind: requireMember(
      value.targetKind,
      TARGET_KINDS,
      'consumerProjectionField.targetKind',
    ),
    sourceField: requireIdentity(value.sourceField, 'consumerProjectionField.sourceField'),
    allowNotApplicable: requireBoolean(
      value.allowNotApplicable,
      'consumerProjectionField.allowNotApplicable',
    ),
  });
}

export function requireCommonEnrichedConsumerProjectionRecord(value) {
  requireExactKeys(value, RECORD_KEYS, 'consumerProjectionRecord');
  if (value.schema !== COMMON_ENRICHED_CONSUMER_PROJECTION_RECORD_SCHEMA) schemaError('consumerProjectionRecord');
  const record = {
    schema: value.schema,
    targetId: requireIdentity(value.targetId, 'consumerProjectionRecord.targetId'),
    targetKind: requireMember(value.targetKind, TARGET_KINDS, 'consumerProjectionRecord.targetKind'),
    sourceRecordId: requireIdentity(
      value.sourceRecordId,
      'consumerProjectionRecord.sourceRecordId',
    ),
    lineKey: value.lineKey === null
      ? null
      : requireIdentity(value.lineKey, 'consumerProjectionRecord.lineKey'),
    values: requireCanonicalJson(value.values, 'consumerProjectionRecord.values'),
    semanticHash: requireSemanticHash(value.semanticHash, 'consumerProjectionRecord.semanticHash'),
  };
  if (!record.values || Array.isArray(record.values) || typeof record.values !== 'object'
    || Object.keys(record.values).length === 0) {
    failCommonEnrichment(
      'Consumer projection record requires a non-empty values object.',
      'COMMON_ENRICHED_PROJECTION_VALUES_INVALID',
    );
  }
  const expectedHash = computeConsumerProjectionRecordSemanticHash(record);
  if (record.semanticHash !== expectedHash) {
    failCommonEnrichment(
      'consumerProjectionRecord.semanticHash is stale.',
      'COMMON_ENRICHED_HASH_MISMATCH',
      { expected: expectedHash, actual: record.semanticHash },
    );
  }
  return deepFreeze(record);
}

function groupFieldsByTargetKind(fields) {
  const result = new Map();
  for (const field of fields) {
    const bucket = result.get(field.targetKind) || [];
    bucket.push(field);
    result.set(field.targetKind, bucket);
  }
  return result;
}

function projectTarget(target, projectionFields) {
  const sourceByField = new Map(target.fields.map((field) => [field.field, field]));
  const values = {};
  for (const projection of projectionFields) {
    const source = sourceByField.get(projection.sourceField);
    if (!source) {
      failProjectionField(target, projection, 'MISSING');
    }
    if (!ALLOWED_VALUE_STATUSES.includes(source.status) || !source.approved) {
      failProjectionField(target, projection, source.status);
    }
    if (source.status === 'NOT_APPLICABLE') {
      if (!projection.allowNotApplicable) {
        failProjectionField(target, projection, source.status);
      }
      values[projection.outputField] = null;
    } else {
      values[projection.outputField] = source.value;
    }
  }
  const draft = {
    schema: COMMON_ENRICHED_CONSUMER_PROJECTION_RECORD_SCHEMA,
    targetId: target.targetId,
    targetKind: target.targetKind,
    sourceRecordId: target.sourceRecordId,
    lineKey: target.lineKey,
    values,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireCommonEnrichedConsumerProjectionRecord({
    ...draft,
    semanticHash: computeConsumerProjectionRecordSemanticHash(draft),
  });
}

function failProjectionField(target, projection, status) {
  failCommonEnrichment(
    'Baseline field cannot be projected into a consumer payload.',
    'COMMON_ENRICHED_PROJECTION_FIELD_INVALID',
    {
      targetId: target.targetId,
      sourceField: projection.sourceField,
      outputField: projection.outputField,
      status,
    },
  );
}

function by(field) {
  return (left, right) => compareAscii(left[field], right[field]);
}

function schemaError(label) {
  failCommonEnrichment(`${label}.schema is unsupported.`, 'COMMON_ENRICHED_SCHEMA_INVALID');
}
