import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { requireCommonEnrichedSourceBinding } from './candidate.js';
import {
  COMMON_ENRICHED_CONSUMERS,
  COMMON_ENRICHED_CONSUMER_READINESS_SCHEMA,
  createCommonEnrichedConsumerReadiness,
  requireCommonEnrichedConsumerReadiness,
} from './consumer-readiness.js';
import { failCommonEnrichment } from './errors.js';
import { requireCommonEnrichedPropertiesBaseline } from './publication.js';
import {
  compareAscii,
  requireBoolean,
  requireExactKeys,
  requireIdentity,
  requireMember,
  requireSemanticHash,
  requireSourceDigest,
  requireUniqueSorted,
} from './validation.js';

export const COMMON_ENRICHED_CONSUMER_READINESS_EVALUATION_SCHEMA =
  'common-enriched-consumer-readiness-evaluation/v1';
export const COMMON_ENRICHED_CONSUMER_POLICY_SCHEMA =
  'common-enriched-consumer-policy/v1';
export const COMMON_ENRICHED_CONSUMER_REQUIREMENT_SCHEMA =
  'common-enriched-consumer-requirement/v1';

const EVALUATION_INPUT_KEYS = Object.freeze([
  'schema', 'evaluationId', 'baseline', 'currentSourceModelHash',
  'currentSourceSnapshots', 'policies',
]);
const EVALUATION_KEYS = Object.freeze([
  'schema', 'evaluationId', 'baselineSemanticHash', 'currentSourceModelHash',
  'currentSourceSnapshotsSemanticHash', 'policiesSemanticHash', 'readiness', 'semanticHash',
]);
const POLICY_KEYS = Object.freeze([
  'schema', 'consumer', 'configured', 'adapterVersion', 'configurationHash', 'requirements',
]);
const REQUIREMENT_KEYS = Object.freeze([
  'schema', 'requirementId', 'targetKind', 'field', 'allowNotApplicable',
]);
const CONSUMER_TARGET_KINDS = Object.freeze(['LINE', 'COMPONENT']);
const UNRESOLVED_STATUSES = Object.freeze([
  'BLOCKED_MISSING', 'BLOCKED_AMBIGUOUS', 'BLOCKED_CONFLICT',
]);

export function consumerReadinessEvaluationSemanticProjection(value) {
  return Object.fromEntries(EVALUATION_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeConsumerReadinessEvaluationSemanticHash(value) {
  return semanticHash(consumerReadinessEvaluationSemanticProjection(value));
}

export function evaluateCommonEnrichedConsumerReadiness(input) {
  requireExactKeys(input, EVALUATION_INPUT_KEYS, 'consumerReadinessEvaluationDraft');
  if (input.schema !== COMMON_ENRICHED_CONSUMER_READINESS_EVALUATION_SCHEMA) schemaError('consumerReadinessEvaluationDraft');

  const baseline = requireCommonEnrichedPropertiesBaseline(input.baseline);
  const currentSourceModelHash = requireSourceDigest(
    input.currentSourceModelHash,
    'consumerReadinessEvaluation.currentSourceModelHash',
  );
  const currentSourceSnapshots = normalizeSourceBindings(input.currentSourceSnapshots);
  const policies = normalizePolicies(input.policies);
  const sourceBlockers = detectSourceStaleness(
    baseline,
    currentSourceModelHash,
    currentSourceSnapshots,
  );
  const fieldIndex = buildFieldIndex(baseline.targetRecords);

  const readiness = policies.map((policy) => evaluatePolicy(
    baseline,
    policy,
    sourceBlockers,
    fieldIndex,
  )).sort(by('consumer'));

  const draft = {
    schema: COMMON_ENRICHED_CONSUMER_READINESS_EVALUATION_SCHEMA,
    evaluationId: requireIdentity(input.evaluationId, 'consumerReadinessEvaluation.evaluationId'),
    baselineSemanticHash: baseline.semanticHash,
    currentSourceModelHash,
    currentSourceSnapshotsSemanticHash: semanticHash(currentSourceSnapshots),
    policiesSemanticHash: semanticHash(policies),
    readiness,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireCommonEnrichedConsumerReadinessEvaluation({
    ...draft,
    semanticHash: computeConsumerReadinessEvaluationSemanticHash(draft),
  });
}

export function requireCommonEnrichedConsumerReadinessEvaluation(value) {
  requireExactKeys(value, EVALUATION_KEYS, 'consumerReadinessEvaluation');
  if (value.schema !== COMMON_ENRICHED_CONSUMER_READINESS_EVALUATION_SCHEMA) schemaError('consumerReadinessEvaluation');
  const result = {
    schema: value.schema,
    evaluationId: requireIdentity(value.evaluationId, 'consumerReadinessEvaluation.evaluationId'),
    baselineSemanticHash: requireSemanticHash(
      value.baselineSemanticHash,
      'consumerReadinessEvaluation.baselineSemanticHash',
    ),
    currentSourceModelHash: requireSourceDigest(
      value.currentSourceModelHash,
      'consumerReadinessEvaluation.currentSourceModelHash',
    ),
    currentSourceSnapshotsSemanticHash: requireSemanticHash(
      value.currentSourceSnapshotsSemanticHash,
      'consumerReadinessEvaluation.currentSourceSnapshotsSemanticHash',
    ),
    policiesSemanticHash: requireSemanticHash(
      value.policiesSemanticHash,
      'consumerReadinessEvaluation.policiesSemanticHash',
    ),
    readiness: requireUniqueSorted(
      value.readiness,
      'consumer',
      'consumerReadinessEvaluation.readiness',
    ).map(requireCommonEnrichedConsumerReadiness),
    semanticHash: requireSemanticHash(value.semanticHash, 'consumerReadinessEvaluation.semanticHash'),
  };
  requireAllConsumers(result.readiness.map((entry) => entry.consumer));
  result.readiness.forEach((entry) => {
    if (entry.baselineSemanticHash !== result.baselineSemanticHash) {
      failCommonEnrichment(
        'Consumer readiness is bound to a different baseline.',
        'COMMON_ENRICHED_READINESS_BASELINE_MISMATCH',
        { consumer: entry.consumer },
      );
    }
  });
  const expectedHash = computeConsumerReadinessEvaluationSemanticHash(result);
  if (result.semanticHash !== expectedHash) {
    failCommonEnrichment(
      'consumerReadinessEvaluation.semanticHash is stale.',
      'COMMON_ENRICHED_HASH_MISMATCH',
      { expected: expectedHash, actual: result.semanticHash },
    );
  }
  return deepFreeze(result);
}

export function requireCommonEnrichedConsumerPolicy(value) {
  requireExactKeys(value, POLICY_KEYS, 'consumerPolicy');
  if (value.schema !== COMMON_ENRICHED_CONSUMER_POLICY_SCHEMA) schemaError('consumerPolicy');
  const configured = requireBoolean(value.configured, 'consumerPolicy.configured');
  const requirements = requireUniqueSorted(
    value.requirements,
    'requirementId',
    'consumerPolicy.requirements',
  ).map(requireCommonEnrichedConsumerRequirement);
  if (configured && requirements.length === 0) {
    failCommonEnrichment(
      'Configured consumer policy requires at least one field requirement.',
      'COMMON_ENRICHED_READINESS_REQUIREMENTS_REQUIRED',
    );
  }
  if (!configured && requirements.length !== 0) {
    failCommonEnrichment(
      'Unconfigured consumer policy must not carry requirements.',
      'COMMON_ENRICHED_READINESS_POLICY_INVALID',
    );
  }
  return deepFreeze({
    schema: value.schema,
    consumer: requireMember(value.consumer, COMMON_ENRICHED_CONSUMERS, 'consumerPolicy.consumer'),
    configured,
    adapterVersion: requireIdentity(value.adapterVersion, 'consumerPolicy.adapterVersion'),
    configurationHash: requireSemanticHash(value.configurationHash, 'consumerPolicy.configurationHash'),
    requirements,
  });
}

export function requireCommonEnrichedConsumerRequirement(value) {
  requireExactKeys(value, REQUIREMENT_KEYS, 'consumerRequirement');
  if (value.schema !== COMMON_ENRICHED_CONSUMER_REQUIREMENT_SCHEMA) schemaError('consumerRequirement');
  const targetKind = requireMember(value.targetKind, CONSUMER_TARGET_KINDS, 'consumerRequirement.targetKind');
  const field = requireIdentity(value.field, 'consumerRequirement.field');
  const requirementId = requireIdentity(value.requirementId, 'consumerRequirement.requirementId');
  const expectedId = `${targetKind}:${field}`;
  if (requirementId !== expectedId) {
    failCommonEnrichment(
      'consumerRequirement.requirementId is inconsistent.',
      'COMMON_ENRICHED_READINESS_REQUIREMENT_ID_INVALID',
      { expected: expectedId, actual: requirementId },
    );
  }
  return deepFreeze({
    schema: value.schema,
    requirementId,
    targetKind,
    field,
    allowNotApplicable: requireBoolean(
      value.allowNotApplicable,
      'consumerRequirement.allowNotApplicable',
    ),
  });
}

function normalizePolicies(value) {
  const policies = requireUniqueSorted(value, 'consumer', 'consumerReadinessEvaluation.policies')
    .map(requireCommonEnrichedConsumerPolicy);
  requireAllConsumers(policies.map((entry) => entry.consumer));
  return Object.freeze(policies);
}

function normalizeSourceBindings(value) {
  return Object.freeze(requireUniqueSorted(
    value,
    'sourceKey',
    'consumerReadinessEvaluation.currentSourceSnapshots',
  ).map(requireCommonEnrichedSourceBinding));
}

function requireAllConsumers(consumers) {
  const actual = [...consumers].sort(compareAscii);
  const expected = [...COMMON_ENRICHED_CONSUMERS].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failCommonEnrichment(
      'Consumer readiness requires exactly one entry for every supported consumer.',
      'COMMON_ENRICHED_READINESS_CONSUMER_SET_INVALID',
      { expected, actual },
    );
  }
}

function detectSourceStaleness(baseline, currentSourceModelHash, currentSourceSnapshots) {
  const blockers = new Set();
  if (baseline.sourceModelHash !== currentSourceModelHash) blockers.add('SOURCE_MODEL_STALE');
  const baselineByKey = new Map(baseline.sourceSnapshots.map((entry) => [entry.sourceKey, entry]));
  const currentByKey = new Map(currentSourceSnapshots.map((entry) => [entry.sourceKey, entry]));
  for (const [sourceKey, binding] of baselineByKey) {
    const current = currentByKey.get(sourceKey);
    if (!current) {
      blockers.add(`SOURCE_SNAPSHOT_MISSING:${sourceKey}`);
    } else if (current.sourceHash !== binding.sourceHash
      || current.snapshotSemanticHash !== binding.snapshotSemanticHash) {
      blockers.add(`SOURCE_SNAPSHOT_STALE:${sourceKey}`);
    }
  }
  for (const sourceKey of currentByKey.keys()) {
    if (!baselineByKey.has(sourceKey)) blockers.add(`SOURCE_SNAPSHOT_ADDED:${sourceKey}`);
  }
  return [...blockers].sort(compareAscii);
}

function buildFieldIndex(targetRecords) {
  const index = new Map(CONSUMER_TARGET_KINDS.map((kind) => [kind, {
    targetCount: 0,
    fields: new Map(),
  }]));
  for (const target of targetRecords) {
    const kindIndex = index.get(target.targetKind);
    kindIndex.targetCount += 1;
    for (const field of target.fields) {
      const stats = kindIndex.fields.get(field.field) || {
        presentCount: 0,
        staleCount: 0,
        unresolvedStatuses: new Set(),
        notApplicableCount: 0,
        unapprovedCount: 0,
      };
      stats.presentCount += 1;
      if (field.status === 'BLOCKED_STALE_SOURCE') stats.staleCount += 1;
      if (UNRESOLVED_STATUSES.includes(field.status)) stats.unresolvedStatuses.add(field.status);
      if (field.status === 'NOT_APPLICABLE') stats.notApplicableCount += 1;
      if (!field.approved
        && field.status !== 'BLOCKED_STALE_SOURCE'
        && !UNRESOLVED_STATUSES.includes(field.status)) stats.unapprovedCount += 1;
      kindIndex.fields.set(field.field, stats);
    }
  }
  return index;
}

function evaluatePolicy(baseline, policy, sourceBlockers, fieldIndex) {
  const requiredFields = [...new Set(policy.requirements.map((entry) => entry.field))]
    .sort(compareAscii);
  if (!policy.configured) {
    return createReadiness(baseline, policy, requiredFields, 'BLOCKED_NOT_CONFIGURED', [
      'CONSUMER_NOT_CONFIGURED',
    ]);
  }
  if (sourceBlockers.length > 0) {
    return createReadiness(
      baseline,
      policy,
      requiredFields,
      'BLOCKED_STALE_SOURCE',
      sourceBlockers,
    );
  }

  const blockers = new Set();
  let hasStale = false;
  let hasMissing = false;
  let hasUnapproved = false;
  for (const requirement of policy.requirements) {
    const kindIndex = fieldIndex.get(requirement.targetKind);
    if (kindIndex.targetCount === 0) {
      hasMissing = true;
      blockers.add(`TARGET_KIND_EMPTY:${requirement.targetKind}`);
      continue;
    }
    const stats = kindIndex.fields.get(requirement.field);
    if (!stats || stats.presentCount < kindIndex.targetCount) {
      hasMissing = true;
      blockers.add(`FIELD_MISSING:${requirement.requirementId}`);
    }
    if (!stats) continue;
    if (stats.staleCount > 0) {
      hasStale = true;
      blockers.add(`FIELD_STALE:${requirement.requirementId}`);
    }
    for (const status of [...stats.unresolvedStatuses].sort(compareAscii)) {
      hasMissing = true;
      blockers.add(`FIELD_UNRESOLVED:${requirement.requirementId}:${status}`);
    }
    if (stats.notApplicableCount > 0 && !requirement.allowNotApplicable) {
      hasMissing = true;
      blockers.add(`FIELD_NOT_APPLICABLE:${requirement.requirementId}`);
    }
    if (stats.unapprovedCount > 0) {
      hasUnapproved = true;
      blockers.add(`FIELD_UNAPPROVED:${requirement.requirementId}`);
    }
  }

  const orderedBlockers = [...blockers].sort(compareAscii);
  if (hasStale) return createReadiness(baseline, policy, requiredFields, 'BLOCKED_STALE_SOURCE', orderedBlockers);
  if (hasMissing) return createReadiness(baseline, policy, requiredFields, 'BLOCKED_MISSING_FIELDS', orderedBlockers);
  if (hasUnapproved) return createReadiness(baseline, policy, requiredFields, 'BLOCKED_UNAPPROVED_FIELDS', orderedBlockers);
  return createReadiness(baseline, policy, requiredFields, 'READY', []);
}

function createReadiness(baseline, policy, requiredFields, status, blockers) {
  return createCommonEnrichedConsumerReadiness({
    schema: COMMON_ENRICHED_CONSUMER_READINESS_SCHEMA,
    baselineSemanticHash: baseline.semanticHash,
    consumer: policy.consumer,
    status,
    requiredFields,
    blockers,
    adapterVersion: policy.adapterVersion,
    configurationHash: policy.configurationHash,
  });
}

function by(field) {
  return (left, right) => compareAscii(left[field], right[field]);
}

function schemaError(label) {
  failCommonEnrichment(`${label}.schema is unsupported.`, 'COMMON_ENRICHED_SCHEMA_INVALID');
}
