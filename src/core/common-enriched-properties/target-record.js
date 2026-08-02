import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { failCommonEnrichment } from './errors.js';
import { requireCommonEnrichedField } from './field.js';
import {
  requireExactKeys,
  requireIdentity,
  requireMember,
  requireOptionalIdentity,
  requireSemanticHash,
  requireSourceDigest,
  requireUniqueSorted,
} from './validation.js';

export const COMMON_ENRICHED_TARGET_RECORD_SCHEMA = 'common-enriched-target-record/v1';
export const ENRICHED_TARGET_KINDS = Object.freeze(['LINE', 'COMPONENT']);

export const COMMON_ENRICHED_TARGET_RECORD_KEYS = Object.freeze([
  'schema',
  'targetId',
  'targetKind',
  'sourceModelHash',
  'sourceRecordId',
  'lineKey',
  'fields',
  'semanticHash',
]);

export function targetRecordSemanticProjection(value) {
  return {
    schema: value.schema,
    targetId: value.targetId,
    targetKind: value.targetKind,
    sourceModelHash: value.sourceModelHash,
    sourceRecordId: value.sourceRecordId,
    lineKey: value.lineKey,
    fields: value.fields,
  };
}

export function computeTargetRecordSemanticHash(value) {
  return semanticHash(targetRecordSemanticProjection(value));
}

export function createCommonEnrichedTargetRecord(input) {
  const draftKeys = COMMON_ENRICHED_TARGET_RECORD_KEYS.filter((key) => key !== 'semanticHash');
  requireExactKeys(input, draftKeys, 'targetRecordDraft');
  const draft = normalizeTargetRecord({ ...input, semanticHash: 'fnv1a64:0000000000000000' }, false);
  return deepFreeze({ ...draft, semanticHash: computeTargetRecordSemanticHash(draft) });
}

export function requireCommonEnrichedTargetRecord(value) {
  const record = normalizeTargetRecord(value, true);
  const expectedHash = computeTargetRecordSemanticHash(record);
  if (record.semanticHash !== expectedHash) {
    failCommonEnrichment('targetRecord.semanticHash is stale.', 'COMMON_ENRICHED_HASH_MISMATCH', {
      targetId: record.targetId,
      expected: expectedHash,
      actual: record.semanticHash,
    });
  }
  return deepFreeze(record);
}

function normalizeTargetRecord(value, validateHash) {
  requireExactKeys(value, COMMON_ENRICHED_TARGET_RECORD_KEYS, 'targetRecord');
  if (value.schema !== COMMON_ENRICHED_TARGET_RECORD_SCHEMA) {
    failCommonEnrichment('targetRecord.schema is unsupported.', 'COMMON_ENRICHED_SCHEMA_INVALID');
  }
  const fields = requireUniqueSorted(value.fields, 'field', 'targetRecord.fields')
    .map(requireCommonEnrichedField);
  const record = {
    schema: value.schema,
    targetId: requireIdentity(value.targetId, 'targetRecord.targetId'),
    targetKind: requireMember(value.targetKind, ENRICHED_TARGET_KINDS, 'targetRecord.targetKind'),
    sourceModelHash: requireSourceDigest(value.sourceModelHash, 'targetRecord.sourceModelHash'),
    sourceRecordId: requireIdentity(value.sourceRecordId, 'targetRecord.sourceRecordId'),
    lineKey: requireOptionalIdentity(value.lineKey, 'targetRecord.lineKey'),
    fields,
    semanticHash: value.semanticHash,
  };
  if (record.targetKind === 'LINE' && record.lineKey === null) {
    failCommonEnrichment('LINE targets require lineKey.', 'COMMON_ENRICHED_LINE_KEY_REQUIRED');
  }
  if (validateHash) requireSemanticHash(record.semanticHash, 'targetRecord.semanticHash');
  return record;
}
