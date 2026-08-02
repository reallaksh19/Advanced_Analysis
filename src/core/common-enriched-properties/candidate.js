import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { failCommonEnrichment } from './errors.js';
import { requireCommonEnrichedTargetRecord } from './target-record.js';
import {
  requireExactKeys,
  requireIdentity,
  requireIsoDateTime,
  requirePositiveInteger,
  requireSemanticHash,
  requireSourceDigest,
  requireUniqueSorted,
} from './validation.js';

export const COMMON_ENRICHED_CANDIDATE_SCHEMA = 'common-enriched-properties-candidate/v1';
export const COMMON_ENRICHED_CANDIDATE_STATUS = 'UNAPPROVED_CANDIDATE';
export const COMMON_ENRICHED_SOURCE_BINDING_SCHEMA = 'common-enriched-source-binding/v1';

export const SOURCE_BINDING_KEYS = Object.freeze([
  'schema',
  'sourceKey',
  'sourceHash',
  'snapshotSemanticHash',
]);

export const COMMON_ENRICHED_CANDIDATE_KEYS = Object.freeze([
  'schema',
  'candidateId',
  'projectId',
  'revision',
  'createdAt',
  'status',
  'sourceModelHash',
  'sourceSnapshots',
  'targetRecords',
  'reviewLedgerHash',
  'semanticHash',
]);

export function requireCommonEnrichedSourceBinding(value) {
  requireExactKeys(value, SOURCE_BINDING_KEYS, 'sourceBinding');
  if (value.schema !== COMMON_ENRICHED_SOURCE_BINDING_SCHEMA) {
    failCommonEnrichment('sourceBinding.schema is unsupported.', 'COMMON_ENRICHED_SCHEMA_INVALID');
  }
  return deepFreeze({
    schema: value.schema,
    sourceKey: requireIdentity(value.sourceKey, 'sourceBinding.sourceKey'),
    sourceHash: requireSourceDigest(value.sourceHash, 'sourceBinding.sourceHash'),
    snapshotSemanticHash: requireSemanticHash(value.snapshotSemanticHash, 'sourceBinding.snapshotSemanticHash'),
  });
}

export function candidateSemanticProjection(value) {
  return {
    schema: value.schema,
    candidateId: value.candidateId,
    projectId: value.projectId,
    revision: value.revision,
    createdAt: value.createdAt,
    status: value.status,
    sourceModelHash: value.sourceModelHash,
    sourceSnapshots: value.sourceSnapshots,
    targetRecords: value.targetRecords,
    reviewLedgerHash: value.reviewLedgerHash,
  };
}

export function computeCandidateSemanticHash(value) {
  return semanticHash(candidateSemanticProjection(value));
}

export function createCommonEnrichedPropertiesCandidate(input) {
  const draftKeys = COMMON_ENRICHED_CANDIDATE_KEYS.filter((key) => key !== 'semanticHash');
  requireExactKeys(input, draftKeys, 'candidateDraft');
  const draft = normalizeCandidate({ ...input, semanticHash: 'fnv1a64:0000000000000000' }, false);
  return deepFreeze({ ...draft, semanticHash: computeCandidateSemanticHash(draft) });
}

export function requireCommonEnrichedPropertiesCandidate(value) {
  const candidate = normalizeCandidate(value, true);
  const expectedHash = computeCandidateSemanticHash(candidate);
  if (candidate.semanticHash !== expectedHash) {
    failCommonEnrichment('candidate.semanticHash is stale.', 'COMMON_ENRICHED_HASH_MISMATCH', {
      expected: expectedHash,
      actual: candidate.semanticHash,
    });
  }
  return deepFreeze(candidate);
}

function normalizeCandidate(value, validateHash) {
  requireExactKeys(value, COMMON_ENRICHED_CANDIDATE_KEYS, 'candidate');
  if (value.schema !== COMMON_ENRICHED_CANDIDATE_SCHEMA) {
    failCommonEnrichment('candidate.schema is unsupported.', 'COMMON_ENRICHED_SCHEMA_INVALID');
  }
  if (value.status !== COMMON_ENRICHED_CANDIDATE_STATUS) {
    failCommonEnrichment('candidate.status must remain UNAPPROVED_CANDIDATE.', 'COMMON_ENRICHED_CANDIDATE_AUTHORITY_INVALID');
  }
  const sourceSnapshots = requireUniqueSorted(value.sourceSnapshots, 'sourceKey', 'candidate.sourceSnapshots')
    .map(requireCommonEnrichedSourceBinding);
  const targetRecords = requireUniqueSorted(value.targetRecords, 'targetId', 'candidate.targetRecords')
    .map(requireCommonEnrichedTargetRecord);
  const sourceModelHash = requireSourceDigest(value.sourceModelHash, 'candidate.sourceModelHash');
  targetRecords.forEach((record) => {
    if (record.sourceModelHash !== sourceModelHash) {
      failCommonEnrichment('Target record source model does not match candidate.', 'COMMON_ENRICHED_MODEL_HASH_MISMATCH', {
        targetId: record.targetId,
      });
    }
  });
  const candidate = {
    schema: value.schema,
    candidateId: requireIdentity(value.candidateId, 'candidate.candidateId'),
    projectId: requireIdentity(value.projectId, 'candidate.projectId'),
    revision: requirePositiveInteger(value.revision, 'candidate.revision'),
    createdAt: requireIsoDateTime(value.createdAt, 'candidate.createdAt'),
    status: value.status,
    sourceModelHash,
    sourceSnapshots,
    targetRecords,
    reviewLedgerHash: requireSemanticHash(value.reviewLedgerHash, 'candidate.reviewLedgerHash'),
    semanticHash: value.semanticHash,
  };
  if (validateHash) requireSemanticHash(candidate.semanticHash, 'candidate.semanticHash');
  return candidate;
}
