import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import {
  requireCommonEnrichedConsumerHandoff,
  requireCommonEnrichedConsumerProjectionPayload,
} from '../../core/common-enriched-properties/index.js';

export const AUTHORIZED_STAGED_JSON_SIDECAR_REQUEST_SCHEMA =
  'authorized-staged-json-sidecar-request/v1';
export const AUTHORIZED_STAGED_JSON_SIDECAR_SCHEMA =
  'authorized-staged-json-sidecar/v1';
export const AUTHORIZED_STAGED_JSON_PROJECTION_SCHEMA =
  'advanced-analysis-enriched-staged-json-sidecar/v1';
export const AUTHORIZED_STAGED_JSON_ENTRY_SCHEMA =
  'authorized-staged-json-sidecar-entry/v1';

const REQUEST_KEYS = Object.freeze([
  'schema', 'sidecarId', 'handoff', 'projectionPayload',
]);
const SIDECAR_KEYS = Object.freeze([
  'schema', 'sidecarId', 'projectId', 'baselineId', 'baselineRevision',
  'baselineSemanticHash', 'readinessEvaluationSemanticHash',
  'readinessSemanticHash', 'handoffSemanticHash',
  'projectionPayloadSemanticHash', 'adapterVersion', 'configurationHash',
  'createdAt', 'entries', 'summary', 'semanticHash',
]);
const ENTRY_KEYS = Object.freeze([
  'schema', 'targetId', 'targetKind', 'sourceRecordId', 'lineKey',
  'attributes', 'projectionRecordSemanticHash', 'semanticHash',
]);
const SUMMARY_KEYS = Object.freeze([
  'entryCount', 'lineEntryCount', 'componentEntryCount', 'attributeCount',
]);
const TARGET_KINDS = Object.freeze(['LINE', 'COMPONENT']);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const PROTECTED_TOKENS = Object.freeze([
  'apos', 'lpos', 'pos', 'center', 'position', 'coordinate', 'coordinates',
  'geometry', 'ports', 'nodes', 'edges', 'connectivity', 'topology',
  'entityid', 'sourceentityid', 'targetid', 'sourcerecordid', 'linekey',
  'jsonpointer', 'componentreference', 'hierarchypath',
]);

export function stagedJsonSidecarEntrySemanticProjection(value) {
  return Object.fromEntries(ENTRY_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeStagedJsonSidecarEntrySemanticHash(value) {
  return semanticHash(stagedJsonSidecarEntrySemanticProjection(value));
}

export function authorizedStagedJsonSidecarSemanticProjection(value) {
  return Object.fromEntries(SIDECAR_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeAuthorizedStagedJsonSidecarSemanticHash(value) {
  return semanticHash(authorizedStagedJsonSidecarSemanticProjection(value));
}

export function compileAuthorizedStagedJsonSidecar(input) {
  requireExactKeys(input, REQUEST_KEYS, 'authorizedStagedJsonSidecarRequest');
  if (input.schema !== AUTHORIZED_STAGED_JSON_SIDECAR_REQUEST_SCHEMA) {
    fail('Unsupported stagedJson sidecar request.', 'STAGED_JSON_SIDECAR_SCHEMA_INVALID');
  }
  const handoff = requireCommonEnrichedConsumerHandoff(input.handoff);
  const payload = requireCommonEnrichedConsumerProjectionPayload(input.projectionPayload);
  requireAuthorityBinding(handoff, payload);

  const sourceRecordIds = new Set();
  const entries = payload.records.map((record) => {
    const sourceRecordId = requireSafeIdentity(
      record.sourceRecordId,
      `${record.targetId}.sourceRecordId`,
    );
    if (sourceRecordIds.has(sourceRecordId)) {
      fail(
        'Duplicate stagedJson source-record identity.',
        'STAGED_JSON_SIDECAR_DUPLICATE_SOURCE_RECORD',
        { sourceRecordId },
      );
    }
    sourceRecordIds.add(sourceRecordId);
    const draft = {
      schema: AUTHORIZED_STAGED_JSON_ENTRY_SCHEMA,
      targetId: requireIdentity(record.targetId, 'entry.targetId'),
      targetKind: requireMember(record.targetKind, TARGET_KINDS, 'entry.targetKind'),
      sourceRecordId,
      lineKey: record.lineKey === null
        ? null
        : requireSafeIdentity(record.lineKey, 'entry.lineKey'),
      attributes: requireSafeAttributes(record.values, record.targetId),
      projectionRecordSemanticHash: requireSemanticHash(
        record.semanticHash,
        'entry.projectionRecordSemanticHash',
      ),
      semanticHash: 'fnv1a64:0000000000000000',
    };
    return requireAuthorizedStagedJsonSidecarEntry({
      ...draft,
      semanticHash: computeStagedJsonSidecarEntrySemanticHash(draft),
    });
  }).sort(compareEntry);

  const summary = summarize(entries);
  const draft = {
    schema: AUTHORIZED_STAGED_JSON_SIDECAR_SCHEMA,
    sidecarId: requireIdentity(input.sidecarId, 'sidecarId'),
    projectId: handoff.baseline.projectId,
    baselineId: handoff.baseline.baselineId,
    baselineRevision: handoff.baseline.revision,
    baselineSemanticHash: handoff.baseline.semanticHash,
    readinessEvaluationSemanticHash: payload.readinessEvaluationSemanticHash,
    readinessSemanticHash: payload.readinessSemanticHash,
    handoffSemanticHash: handoff.semanticHash,
    projectionPayloadSemanticHash: payload.semanticHash,
    adapterVersion: payload.adapterVersion,
    configurationHash: payload.configurationHash,
    createdAt: payload.createdAt,
    entries,
    summary,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireAuthorizedStagedJsonSidecar({
    ...draft,
    semanticHash: computeAuthorizedStagedJsonSidecarSemanticHash(draft),
  });
}

export function requireAuthorizedStagedJsonSidecar(value) {
  requireExactKeys(value, SIDECAR_KEYS, 'authorizedStagedJsonSidecar');
  if (value.schema !== AUTHORIZED_STAGED_JSON_SIDECAR_SCHEMA) {
    fail('Unsupported stagedJson sidecar.', 'STAGED_JSON_SIDECAR_SCHEMA_INVALID');
  }
  const sidecar = {
    schema: value.schema,
    sidecarId: requireIdentity(value.sidecarId, 'sidecar.sidecarId'),
    projectId: requireIdentity(value.projectId, 'sidecar.projectId'),
    baselineId: requireIdentity(value.baselineId, 'sidecar.baselineId'),
    baselineRevision: requirePositiveInteger(
      value.baselineRevision,
      'sidecar.baselineRevision',
    ),
    baselineSemanticHash: requireSemanticHash(
      value.baselineSemanticHash,
      'sidecar.baselineSemanticHash',
    ),
    readinessEvaluationSemanticHash: requireSemanticHash(
      value.readinessEvaluationSemanticHash,
      'sidecar.readinessEvaluationSemanticHash',
    ),
    readinessSemanticHash: requireSemanticHash(
      value.readinessSemanticHash,
      'sidecar.readinessSemanticHash',
    ),
    handoffSemanticHash: requireSemanticHash(
      value.handoffSemanticHash,
      'sidecar.handoffSemanticHash',
    ),
    projectionPayloadSemanticHash: requireSemanticHash(
      value.projectionPayloadSemanticHash,
      'sidecar.projectionPayloadSemanticHash',
    ),
    adapterVersion: requireIdentity(value.adapterVersion, 'sidecar.adapterVersion'),
    configurationHash: requireSemanticHash(
      value.configurationHash,
      'sidecar.configurationHash',
    ),
    createdAt: requireIsoTimestamp(value.createdAt, 'sidecar.createdAt'),
    entries: requireUniqueSortedEntries(value.entries),
    summary: requireSummary(value.summary),
    semanticHash: requireSemanticHash(value.semanticHash, 'sidecar.semanticHash'),
  };
  const expectedSummary = summarize(sidecar.entries);
  if (semanticHash(sidecar.summary) !== semanticHash(expectedSummary)) {
    fail('StagedJson sidecar summary is inconsistent.', 'STAGED_JSON_SIDECAR_SUMMARY_INVALID');
  }
  const expectedHash = computeAuthorizedStagedJsonSidecarSemanticHash(sidecar);
  if (sidecar.semanticHash !== expectedHash) {
    fail('StagedJson sidecar semantic hash is stale.', 'STAGED_JSON_SIDECAR_HASH_MISMATCH');
  }
  return deepFreeze(sidecar);
}

export function requireAuthorizedStagedJsonSidecarEntry(value) {
  requireExactKeys(value, ENTRY_KEYS, 'authorizedStagedJsonSidecarEntry');
  if (value.schema !== AUTHORIZED_STAGED_JSON_ENTRY_SCHEMA) {
    fail('Unsupported stagedJson sidecar entry.', 'STAGED_JSON_SIDECAR_SCHEMA_INVALID');
  }
  const entry = {
    schema: value.schema,
    targetId: requireIdentity(value.targetId, 'entry.targetId'),
    targetKind: requireMember(value.targetKind, TARGET_KINDS, 'entry.targetKind'),
    sourceRecordId: requireSafeIdentity(value.sourceRecordId, 'entry.sourceRecordId'),
    lineKey: value.lineKey === null
      ? null
      : requireSafeIdentity(value.lineKey, 'entry.lineKey'),
    attributes: requireSafeAttributes(value.attributes, value.targetId),
    projectionRecordSemanticHash: requireSemanticHash(
      value.projectionRecordSemanticHash,
      'entry.projectionRecordSemanticHash',
    ),
    semanticHash: requireSemanticHash(value.semanticHash, 'entry.semanticHash'),
  };
  const expectedHash = computeStagedJsonSidecarEntrySemanticHash(entry);
  if (entry.semanticHash !== expectedHash) {
    fail('StagedJson sidecar entry hash is stale.', 'STAGED_JSON_SIDECAR_HASH_MISMATCH');
  }
  return deepFreeze(entry);
}

function requireAuthorityBinding(handoff, payload) {
  if (handoff.status !== 'AUTHORIZED') {
    fail('Authorized stagedJson handoff required.', 'STAGED_JSON_SIDECAR_HANDOFF_NOT_AUTHORIZED');
  }
  if (handoff.consumer !== 'ENRICHED_STAGED_JSON_EXPORT'
    || payload.consumer !== 'ENRICHED_STAGED_JSON_EXPORT') {
    fail('Wrong stagedJson consumer.', 'STAGED_JSON_SIDECAR_CONSUMER_MISMATCH');
  }
  if (handoff.readiness.status !== 'READY') {
    fail('READY stagedJson evidence required.', 'STAGED_JSON_SIDECAR_NOT_READY');
  }
  if (handoff.payload.payloadSchema !== AUTHORIZED_STAGED_JSON_PROJECTION_SCHEMA
    || payload.payloadSchema !== AUTHORIZED_STAGED_JSON_PROJECTION_SCHEMA) {
    fail('Unsupported stagedJson projection schema.', 'STAGED_JSON_SIDECAR_PAYLOAD_SCHEMA_INVALID');
  }
  if (handoff.payload.payloadId !== payload.payloadId
    || handoff.payload.payloadSemanticHash !== payload.semanticHash
    || handoff.payload.adapterVersion !== payload.adapterVersion
    || handoff.payload.configurationHash !== payload.configurationHash
    || handoff.payload.createdAt !== payload.createdAt) {
    fail('StagedJson payload descriptor mismatch.', 'STAGED_JSON_SIDECAR_PAYLOAD_BINDING_MISMATCH');
  }
  if (handoff.baseline.semanticHash !== payload.baselineSemanticHash
    || handoff.readinessEvaluation.semanticHash !== payload.readinessEvaluationSemanticHash
    || handoff.readiness.semanticHash !== payload.readinessSemanticHash) {
    fail('StagedJson authority evidence mismatch.', 'STAGED_JSON_SIDECAR_EVIDENCE_BINDING_MISMATCH');
  }
}

function requireSafeAttributes(value, targetId) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    fail('StagedJson sidecar attributes must be an object.', 'STAGED_JSON_SIDECAR_ATTRIBUTES_INVALID');
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    fail('StagedJson sidecar attributes cannot be empty.', 'STAGED_JSON_SIDECAR_ATTRIBUTES_INVALID');
  }
  const sorted = [...keys].sort(compareAscii);
  if (JSON.stringify(keys) !== JSON.stringify(sorted)) {
    fail('StagedJson sidecar attributes must be canonically sorted.', 'STAGED_JSON_SIDECAR_ORDER_INVALID');
  }
  const result = {};
  for (const key of keys) {
    requireSafeAttributeName(key, targetId);
    const item = value[key];
    if (item !== null && !['string', 'number', 'boolean'].includes(typeof item)) {
      fail(
        'StagedJson sidecar attributes must be JSON scalars.',
        'STAGED_JSON_SIDECAR_ATTRIBUTES_INVALID',
        { targetId, attribute: key },
      );
    }
    if (typeof item === 'number' && !Number.isFinite(item)) {
      fail('StagedJson sidecar number must be finite.', 'STAGED_JSON_SIDECAR_ATTRIBUTES_INVALID');
    }
    result[key] = item;
  }
  return result;
}

function requireSafeAttributeName(value, targetId) {
  const name = requireSafeIdentity(value, 'attributeName');
  if (/[\/\[\]]/u.test(name)) {
    fail('StagedJson sidecar attribute is path-like.', 'STAGED_JSON_SIDECAR_PROTECTED_FIELD', {
      targetId,
      attribute: name,
    });
  }
  const normalized = name.replace(/[^a-z0-9]+/giu, '').toLowerCase();
  if (PROTECTED_TOKENS.some((token) => normalized === token || normalized.startsWith(token))) {
    fail('StagedJson sidecar cannot modify protected identity or geometry.', 'STAGED_JSON_SIDECAR_PROTECTED_FIELD', {
      targetId,
      attribute: name,
    });
  }
  return name;
}

function requireUniqueSortedEntries(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('StagedJson sidecar requires entries.', 'STAGED_JSON_SIDECAR_ENTRIES_REQUIRED');
  }
  const entries = value.map(requireAuthorizedStagedJsonSidecarEntry);
  const sourceIds = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    if (sourceIds.has(entries[index].sourceRecordId)) {
      fail('Duplicate stagedJson source-record identity.', 'STAGED_JSON_SIDECAR_DUPLICATE_SOURCE_RECORD');
    }
    sourceIds.add(entries[index].sourceRecordId);
    if (index > 0 && compareEntry(entries[index - 1], entries[index]) >= 0) {
      fail('StagedJson sidecar entries must be uniquely sorted.', 'STAGED_JSON_SIDECAR_ORDER_INVALID');
    }
  }
  return entries;
}

function summarize(entries) {
  return {
    entryCount: entries.length,
    lineEntryCount: entries.filter((entry) => entry.targetKind === 'LINE').length,
    componentEntryCount: entries.filter((entry) => entry.targetKind === 'COMPONENT').length,
    attributeCount: entries.reduce(
      (total, entry) => total + Object.keys(entry.attributes).length,
      0,
    ),
  };
}

function requireSummary(value) {
  requireExactKeys(value, SUMMARY_KEYS, 'sidecar.summary');
  return Object.fromEntries(SUMMARY_KEYS.map((key) => [
    key,
    requireNonnegativeInteger(value[key], `sidecar.summary.${key}`),
  ]));
}

function requireExactKeys(value, expectedKeys, label) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    fail(`${label} must be an object.`, 'STAGED_JSON_SIDECAR_TYPE_INVALID');
  }
  const actual = Object.keys(value).sort(compareAscii);
  const expected = [...expectedKeys].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} has unexpected keys.`, 'STAGED_JSON_SIDECAR_KEYS_INVALID', {
      actual,
      expected,
    });
  }
}

function requireIdentity(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} must be non-empty.`, 'STAGED_JSON_SIDECAR_IDENTITY_INVALID');
  }
  return value;
}

function requireSafeIdentity(value, label) {
  const result = requireIdentity(value, label);
  if (UNSAFE_KEYS.has(result)) {
    fail(`${label} is unsafe.`, 'STAGED_JSON_SIDECAR_UNSAFE_KEY');
  }
  return result;
}

function requireSemanticHash(value, label) {
  const result = requireIdentity(value, label);
  if (!/^fnv1a64:[0-9a-f]{16}$/u.test(result)) {
    fail(`${label} must be a semantic hash.`, 'STAGED_JSON_SIDECAR_HASH_INVALID');
  }
  return result;
}

function requireMember(value, members, label) {
  if (!members.includes(value)) {
    fail(`${label} is unsupported.`, 'STAGED_JSON_SIDECAR_MEMBER_INVALID');
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    fail(`${label} must be a positive integer.`, 'STAGED_JSON_SIDECAR_NUMBER_INVALID');
  }
  return value;
}

function requireNonnegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${label} must be non-negative.`, 'STAGED_JSON_SIDECAR_NUMBER_INVALID');
  }
  return value;
}

function requireIsoTimestamp(value, label) {
  const result = requireIdentity(value, label);
  if (!Number.isFinite(Date.parse(result))) {
    fail(`${label} must be an ISO timestamp.`, 'STAGED_JSON_SIDECAR_TIMESTAMP_INVALID');
  }
  return result;
}

function compareEntry(left, right) {
  return compareAscii(left.sourceRecordId, right.sourceRecordId)
    || compareAscii(left.targetId, right.targetId);
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message, code, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details === null ? null : deepFreeze(details);
  throw error;
}
