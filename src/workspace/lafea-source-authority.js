/**
 * Cryptographic source authority for one exact normalized LAFEA stage document.
 *
 * The editor FNV digest remains an optimistic-concurrency revision token only.
 * Engineering source identities are canonical SHA-256 values issued here.
 */
import { lafeaDocumentDigest } from './lafea-edit-command.js';
import { createLafeaLifecycleEvent } from './lafea-lifecycle.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';
import {
  LAFEA_CANONICAL_SHA256_PROFILE,
  canonicalLafeaSha256,
} from './lafea-canonical-sha256.js';

export const LAFEA_SOURCE_AUTHORITY_SCHEMA = 'lafea-source-authority/v1';
export const LAFEA_SOURCE_AUTHORITY_EVENT_SCHEMA = 'lafea-source-authority-event/v1';
export const LAFEA_SOURCE_AUTHORITY_ROLE = 'NORMALIZED_STAGE_ENGINEERING_SOURCE';

const AUTHORITY_KEYS = Object.freeze([
  'schema', 'stageId', 'role', 'sourceHash', 'canonicalizationProfile',
  'documentRevisionDigest', 'originRef',
]);
const EVENT_KEYS = Object.freeze([
  'schema', 'eventId', 'stageId', 'changeClass', 'previousSourceHash',
  'currentSourceHash', 'previousDocumentRevisionDigest',
  'currentDocumentRevisionDigest', 'originRef', 'lifecycleEvent',
]);

export function issueLafeaSourceAuthority(stageId, documentValue, originRef) {
  requireLafeaStageRegistryEntry(stageId);
  requireText(originRef, 'originRef');
  const source = sourceAuthorityDocument(documentValue);
  const authority = {
    schema: LAFEA_SOURCE_AUTHORITY_SCHEMA,
    stageId,
    role: LAFEA_SOURCE_AUTHORITY_ROLE,
    sourceHash: canonicalLafeaSha256({
      schema: 'lafea-source-authority-payload/v1',
      stageId,
      source,
    }),
    canonicalizationProfile: LAFEA_CANONICAL_SHA256_PROFILE,
    documentRevisionDigest: lafeaDocumentDigest(documentValue),
    originRef,
  };
  return validateLafeaSourceAuthority(authority);
}

export function createLafeaSourceAuthorityEvent(
  previousAuthorityValue,
  currentAuthorityValue,
  changeClass,
  originRef,
) {
  const previous = validateLafeaSourceAuthority(previousAuthorityValue);
  const current = validateLafeaSourceAuthority(currentAuthorityValue);
  requireText(changeClass, 'changeClass');
  requireText(originRef, 'originRef');
  if (previous.stageId !== current.stageId) {
    throw authorityError('LAFEA_SOURCE_AUTHORITY_STAGE_MISMATCH',
      'Source-authority transition stages do not match.');
  }
  if (previous.sourceHash === current.sourceHash) {
    throw authorityError('LAFEA_SOURCE_AUTHORITY_HASH_UNCHANGED',
      'Typed engineering source events require a changed source hash.');
  }
  const eventId = `LAFEA-SOURCE-${canonicalLafeaSha256({
    stageId: current.stageId,
    changeClass,
    previousSourceHash: previous.sourceHash,
    currentSourceHash: current.sourceHash,
    originRef,
  }).slice('sha256:'.length, 'sha256:'.length + 24).toUpperCase()}`;
  const lifecycleEvent = createLafeaLifecycleEvent({
    eventId,
    stageId: current.stageId,
    changeClass,
    previousSourceHash: previous.sourceHash,
    currentSourceHash: current.sourceHash,
    profileHash: null,
    originRef,
  });
  return deepFreeze({
    schema: LAFEA_SOURCE_AUTHORITY_EVENT_SCHEMA,
    eventId,
    stageId: current.stageId,
    changeClass,
    previousSourceHash: previous.sourceHash,
    currentSourceHash: current.sourceHash,
    previousDocumentRevisionDigest: previous.documentRevisionDigest,
    currentDocumentRevisionDigest: current.documentRevisionDigest,
    originRef,
    lifecycleEvent,
  });
}

export function validateLafeaSourceAuthority(value) {
  exactKeys(value, AUTHORITY_KEYS, 'LAFEA source authority');
  if (value.schema !== LAFEA_SOURCE_AUTHORITY_SCHEMA
    || value.role !== LAFEA_SOURCE_AUTHORITY_ROLE
    || value.canonicalizationProfile !== LAFEA_CANONICAL_SHA256_PROFILE) {
    throw authorityError('LAFEA_SOURCE_AUTHORITY_CONTRACT_INVALID',
      'Source-authority schema, role or canonicalization profile is invalid.');
  }
  requireLafeaStageRegistryEntry(value.stageId);
  requireSha256(value.sourceHash, 'sourceHash');
  requireFNVRevision(value.documentRevisionDigest);
  requireText(value.originRef, 'originRef');
  return deepFreeze(structuredClone(value));
}

export function validateLafeaSourceAuthorityEvent(value) {
  exactKeys(value, EVENT_KEYS, 'LAFEA source authority event');
  if (value.schema !== LAFEA_SOURCE_AUTHORITY_EVENT_SCHEMA) {
    throw authorityError('LAFEA_SOURCE_AUTHORITY_EVENT_SCHEMA_INVALID',
      'Source-authority event schema is invalid.');
  }
  requireText(value.eventId, 'eventId');
  requireLafeaStageRegistryEntry(value.stageId);
  requireText(value.changeClass, 'changeClass');
  requireSha256(value.previousSourceHash, 'previousSourceHash');
  requireSha256(value.currentSourceHash, 'currentSourceHash');
  requireFNVRevision(value.previousDocumentRevisionDigest);
  requireFNVRevision(value.currentDocumentRevisionDigest);
  requireText(value.originRef, 'originRef');
  if (value.lifecycleEvent?.eventId !== value.eventId
    || value.lifecycleEvent?.previousSourceHash !== value.previousSourceHash
    || value.lifecycleEvent?.currentSourceHash !== value.currentSourceHash) {
    throw authorityError('LAFEA_SOURCE_AUTHORITY_EVENT_BINDING_INVALID',
      'Typed source event is not bound to its lifecycle event.');
  }
  return deepFreeze(structuredClone(value));
}

export function sourceAuthorityDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('LAFEA source authority requires a normalized document object.');
  }
  const source = structuredClone(value);
  delete source.meshConfig;
  return source;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}

function requireSha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw authorityError('LAFEA_ENGINEERING_SHA256_REQUIRED', `${label} must be canonical SHA-256.`);
  }
}

function requireFNVRevision(value) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    throw authorityError('LAFEA_DOCUMENT_REVISION_DIGEST_INVALID',
      'documentRevisionDigest must remain the editor FNV revision token.');
  }
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required.`);
}

function authorityError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
