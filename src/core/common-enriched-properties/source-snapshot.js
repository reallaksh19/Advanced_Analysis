import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  requireCanonicalJson,
  requireExactKeys,
  requireIdentity,
  requireIsoDateTime,
  requireMember,
  requireRecord,
  requireSemanticHash,
  requireSourceDigest,
  requireUniqueSorted,
} from './validation.js';
import { failCommonEnrichment } from './errors.js';

export const ENGINEERING_MASTER_SNAPSHOT_SCHEMA = 'engineering-master-snapshot/v1';
export const ENGINEERING_MASTER_RECORD_SCHEMA = 'engineering-master-record/v1';

export const MASTER_SOURCE_KINDS = Object.freeze([
  'MODEL',
  'LINE_LIST',
  'PIPING_CLASS',
  'MATERIAL_REGISTER',
  'FLUID_REGISTER',
  'INSULATION_REGISTER',
  'COMPONENT_WEIGHT_MASTER',
  'DERIVATION_POLICY_REGISTER',
]);

export const MASTER_RECORD_KEYS = Object.freeze([
  'schema',
  'recordId',
  'locator',
  'values',
]);

export const MASTER_SNAPSHOT_KEYS = Object.freeze([
  'schema',
  'snapshotId',
  'sourceKind',
  'sourceKey',
  'sourceHash',
  'capturedAt',
  'mappingSemanticHash',
  'records',
  'metadata',
  'semanticHash',
]);

export function createEngineeringMasterRecord(input) {
  requireExactKeys(input, MASTER_RECORD_KEYS, 'masterRecord');
  if (input.schema !== ENGINEERING_MASTER_RECORD_SCHEMA) {
    failCommonEnrichment('masterRecord.schema is unsupported.', 'COMMON_ENRICHED_SCHEMA_INVALID');
  }
  const record = {
    schema: input.schema,
    recordId: requireIdentity(input.recordId, 'masterRecord.recordId'),
    locator: requireIdentity(input.locator, 'masterRecord.locator'),
    values: requireCanonicalJson(requireRecord(input.values, 'masterRecord.values'), 'masterRecord.values'),
  };
  return deepFreeze(record);
}

export function engineeringMasterSnapshotSemanticProjection(value) {
  return {
    schema: value.schema,
    snapshotId: value.snapshotId,
    sourceKind: value.sourceKind,
    sourceKey: value.sourceKey,
    sourceHash: value.sourceHash,
    capturedAt: value.capturedAt,
    mappingSemanticHash: value.mappingSemanticHash,
    records: value.records,
    metadata: value.metadata,
  };
}

export function computeEngineeringMasterSnapshotSemanticHash(value) {
  return semanticHash(engineeringMasterSnapshotSemanticProjection(value));
}

export function createEngineeringMasterSnapshot(input) {
  const draftKeys = MASTER_SNAPSHOT_KEYS.filter((key) => key !== 'semanticHash');
  requireExactKeys(input, draftKeys, 'masterSnapshotDraft');
  const draft = normalizeSnapshot({ ...input, semanticHash: 'fnv1a64:0000000000000000' }, false);
  return deepFreeze({
    ...draft,
    semanticHash: computeEngineeringMasterSnapshotSemanticHash(draft),
  });
}

export function requireEngineeringMasterSnapshot(value) {
  const snapshot = normalizeSnapshot(value, true);
  const expectedHash = computeEngineeringMasterSnapshotSemanticHash(snapshot);
  if (snapshot.semanticHash !== expectedHash) {
    failCommonEnrichment('masterSnapshot.semanticHash is stale.', 'COMMON_ENRICHED_HASH_MISMATCH', {
      expected: expectedHash,
      actual: snapshot.semanticHash,
    });
  }
  return deepFreeze(snapshot);
}

function normalizeSnapshot(value, validateHash) {
  requireExactKeys(value, MASTER_SNAPSHOT_KEYS, 'masterSnapshot');
  if (value.schema !== ENGINEERING_MASTER_SNAPSHOT_SCHEMA) {
    failCommonEnrichment('masterSnapshot.schema is unsupported.', 'COMMON_ENRICHED_SCHEMA_INVALID');
  }
  const records = requireUniqueSorted(value.records, 'recordId', 'masterSnapshot.records')
    .map(createEngineeringMasterRecord);
  const snapshot = {
    schema: value.schema,
    snapshotId: requireIdentity(value.snapshotId, 'masterSnapshot.snapshotId'),
    sourceKind: requireMember(value.sourceKind, MASTER_SOURCE_KINDS, 'masterSnapshot.sourceKind'),
    sourceKey: requireIdentity(value.sourceKey, 'masterSnapshot.sourceKey'),
    sourceHash: requireSourceDigest(value.sourceHash, 'masterSnapshot.sourceHash'),
    capturedAt: requireIsoDateTime(value.capturedAt, 'masterSnapshot.capturedAt'),
    mappingSemanticHash: requireSemanticHash(value.mappingSemanticHash, 'masterSnapshot.mappingSemanticHash'),
    records,
    metadata: requireCanonicalJson(requireRecord(value.metadata, 'masterSnapshot.metadata'), 'masterSnapshot.metadata'),
    semanticHash: value.semanticHash,
  };
  if (validateHash) requireSemanticHash(snapshot.semanticHash, 'masterSnapshot.semanticHash');
  return snapshot;
}
