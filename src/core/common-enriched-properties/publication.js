import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { requireCommonEnrichedPropertiesCandidate } from './candidate.js';
import { failCommonEnrichment } from './errors.js';
import {
  requireExactKeys,
  requireIdentity,
  requireIsoDateTime,
  requireMember,
  requirePositiveInteger,
  requireSemanticHash,
  requireSourceDigest,
  requireUniqueSorted,
} from './validation.js';
import { requireCommonEnrichedSourceBinding } from './candidate.js';
import { requireCommonEnrichedTargetRecord } from './target-record.js';

export const COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA = 'common-enriched-publication-decision/v1';
export const COMMON_ENRICHED_BASELINE_SCHEMA = 'common-enriched-properties-baseline/v1';
export const PUBLICATION_DECISIONS = Object.freeze(['APPROVE', 'REJECT']);

export const PUBLICATION_DECISION_KEYS = Object.freeze([
  'schema',
  'decisionId',
  'candidateSemanticHash',
  'decision',
  'authorityId',
  'decidedAt',
  'evidenceHash',
]);

export const COMMON_ENRICHED_BASELINE_KEYS = Object.freeze([
  'schema',
  'baselineId',
  'projectId',
  'revision',
  'publishedAt',
  'candidateSemanticHash',
  'publicationDecision',
  'sourceModelHash',
  'sourceSnapshots',
  'targetRecords',
  'semanticHash',
]);

export function requireCommonEnrichedPublicationDecision(value) {
  requireExactKeys(value, PUBLICATION_DECISION_KEYS, 'publicationDecision');
  if (value.schema !== COMMON_ENRICHED_PUBLICATION_DECISION_SCHEMA) {
    failCommonEnrichment('publicationDecision.schema is unsupported.', 'COMMON_ENRICHED_SCHEMA_INVALID');
  }
  return deepFreeze({
    schema: value.schema,
    decisionId: requireIdentity(value.decisionId, 'publicationDecision.decisionId'),
    candidateSemanticHash: requireSemanticHash(value.candidateSemanticHash, 'publicationDecision.candidateSemanticHash'),
    decision: requireMember(value.decision, PUBLICATION_DECISIONS, 'publicationDecision.decision'),
    authorityId: requireIdentity(value.authorityId, 'publicationDecision.authorityId'),
    decidedAt: requireIsoDateTime(value.decidedAt, 'publicationDecision.decidedAt'),
    evidenceHash: requireSourceDigest(value.evidenceHash, 'publicationDecision.evidenceHash'),
  });
}

export function baselineSemanticProjection(value) {
  return {
    schema: value.schema,
    baselineId: value.baselineId,
    projectId: value.projectId,
    revision: value.revision,
    publishedAt: value.publishedAt,
    candidateSemanticHash: value.candidateSemanticHash,
    publicationDecision: value.publicationDecision,
    sourceModelHash: value.sourceModelHash,
    sourceSnapshots: value.sourceSnapshots,
    targetRecords: value.targetRecords,
  };
}

export function computeBaselineSemanticHash(value) {
  return semanticHash(baselineSemanticProjection(value));
}

export function publishCommonEnrichedPropertiesBaseline(candidateValue, decisionValue, publicationIdentity) {
  const candidate = requireCommonEnrichedPropertiesCandidate(candidateValue);
  const decision = requireCommonEnrichedPublicationDecision(decisionValue);
  requireExactKeys(publicationIdentity, ['baselineId', 'revision', 'publishedAt'], 'publicationIdentity');
  if (decision.decision !== 'APPROVE') {
    failCommonEnrichment('A rejected candidate cannot be published.', 'COMMON_ENRICHED_PUBLICATION_REJECTED');
  }
  if (decision.candidateSemanticHash !== candidate.semanticHash) {
    failCommonEnrichment('Publication decision is bound to a different candidate.', 'COMMON_ENRICHED_PUBLICATION_BINDING_MISMATCH');
  }
  const baseline = {
    schema: COMMON_ENRICHED_BASELINE_SCHEMA,
    baselineId: requireIdentity(publicationIdentity.baselineId, 'publicationIdentity.baselineId'),
    projectId: candidate.projectId,
    revision: requirePositiveInteger(publicationIdentity.revision, 'publicationIdentity.revision'),
    publishedAt: requireIsoDateTime(publicationIdentity.publishedAt, 'publicationIdentity.publishedAt'),
    candidateSemanticHash: candidate.semanticHash,
    publicationDecision: decision,
    sourceModelHash: candidate.sourceModelHash,
    sourceSnapshots: candidate.sourceSnapshots,
    targetRecords: candidate.targetRecords,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  baseline.semanticHash = computeBaselineSemanticHash(baseline);
  return requireCommonEnrichedPropertiesBaseline(baseline);
}

export function requireCommonEnrichedPropertiesBaseline(value) {
  requireExactKeys(value, COMMON_ENRICHED_BASELINE_KEYS, 'baseline');
  if (value.schema !== COMMON_ENRICHED_BASELINE_SCHEMA) {
    failCommonEnrichment('baseline.schema is unsupported.', 'COMMON_ENRICHED_SCHEMA_INVALID');
  }
  const decision = requireCommonEnrichedPublicationDecision(value.publicationDecision);
  if (decision.decision !== 'APPROVE' || decision.candidateSemanticHash !== value.candidateSemanticHash) {
    failCommonEnrichment('Baseline publication decision is invalid.', 'COMMON_ENRICHED_PUBLICATION_BINDING_MISMATCH');
  }
  const sourceSnapshots = requireUniqueSorted(value.sourceSnapshots, 'sourceKey', 'baseline.sourceSnapshots')
    .map(requireCommonEnrichedSourceBinding);
  const targetRecords = requireUniqueSorted(value.targetRecords, 'targetId', 'baseline.targetRecords')
    .map(requireCommonEnrichedTargetRecord);
  const sourceModelHash = requireSourceDigest(value.sourceModelHash, 'baseline.sourceModelHash');
  targetRecords.forEach((record) => {
    if (record.sourceModelHash !== sourceModelHash) {
      failCommonEnrichment('Baseline target source model is inconsistent.', 'COMMON_ENRICHED_MODEL_HASH_MISMATCH', {
        targetId: record.targetId,
      });
    }
  });
  const baseline = {
    schema: value.schema,
    baselineId: requireIdentity(value.baselineId, 'baseline.baselineId'),
    projectId: requireIdentity(value.projectId, 'baseline.projectId'),
    revision: requirePositiveInteger(value.revision, 'baseline.revision'),
    publishedAt: requireIsoDateTime(value.publishedAt, 'baseline.publishedAt'),
    candidateSemanticHash: requireSemanticHash(value.candidateSemanticHash, 'baseline.candidateSemanticHash'),
    publicationDecision: decision,
    sourceModelHash,
    sourceSnapshots,
    targetRecords,
    semanticHash: requireSemanticHash(value.semanticHash, 'baseline.semanticHash'),
  };
  const expectedHash = computeBaselineSemanticHash(baseline);
  if (baseline.semanticHash !== expectedHash) {
    failCommonEnrichment('baseline.semanticHash is stale.', 'COMMON_ENRICHED_HASH_MISMATCH', {
      expected: expectedHash,
      actual: baseline.semanticHash,
    });
  }
  return deepFreeze(baseline);
}
