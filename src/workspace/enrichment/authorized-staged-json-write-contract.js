import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';

export const AUTHORIZED_STAGED_JSON_WRITE_REQUEST_SCHEMA =
  'authorized-staged-json-write-request/v1';
export const AUTHORIZED_STAGED_JSON_WRITE_RECEIPT_SCHEMA =
  'authorized-staged-json-write-receipt/v1';
export const AUTHORIZED_STAGED_JSON_WRITE_ARTIFACT_SCHEMA =
  'authorized-staged-json-write-artifact/v1';

export const REQUEST_KEYS = Object.freeze([
  'schema', 'writeId', 'writtenAt', 'source', 'sidecar', 'mapping',
  'formatting', 'outputFileName',
]);
const SOURCE_KEYS = Object.freeze([
  'sourceId', 'fileName', 'sha256', 'byteLength', 'text',
]);
const MAPPING_KEYS = Object.freeze([
  'sourceRecordIdField', 'targetIdField', 'lineKeyField',
  'attributesField', 'childrenField',
]);
const FORMATTING_KEYS = Object.freeze(['indent', 'newline', 'terminalNewline']);
const RECEIPT_KEYS = Object.freeze([
  'schema', 'writeId', 'writtenAt', 'projectId', 'sidecarId',
  'sidecarSemanticHash', 'sourceArtifact', 'mapping', 'formatting',
  'outputArtifact', 'summary', 'semanticHash',
]);
const ARTIFACT_KEYS = Object.freeze(['schema', 'receipt', 'outputText', 'semanticHash']);
const SOURCE_ARTIFACT_KEYS = Object.freeze([
  'sourceId', 'fileName', 'sha256', 'byteLength', 'semanticHash',
]);
const OUTPUT_ARTIFACT_KEYS = Object.freeze([
  'fileName', 'sha256', 'byteLength', 'semanticHash',
]);
const SUMMARY_KEYS = Object.freeze([
  'visitedNodeCount', 'identifiedNodeCount', 'matchedEntryCount',
  'addedAttributeCount', 'retainedExactAttributeCount',
]);
export const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function authorizedStagedJsonWriteReceiptSemanticProjection(value) {
  return project(RECEIPT_KEYS, value);
}
export function computeAuthorizedStagedJsonWriteReceiptSemanticHash(value) {
  return semanticHash(authorizedStagedJsonWriteReceiptSemanticProjection(value));
}
export function authorizedStagedJsonWriteArtifactSemanticProjection(value) {
  return project(ARTIFACT_KEYS, value);
}
export function computeAuthorizedStagedJsonWriteArtifactSemanticHash(value) {
  return semanticHash(authorizedStagedJsonWriteArtifactSemanticProjection(value));
}

export async function sha256Utf8(text) {
  if (typeof text !== 'string') {
    fail('SHA-256 input must be text.', 'STAGED_JSON_WRITE_SOURCE_TEXT_INVALID');
  }
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') {
    fail('Web Crypto SHA-256 is unavailable.', 'STAGED_JSON_WRITE_SHA256_UNAVAILABLE');
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function requireSource(value) {
  requireExactKeys(value, SOURCE_KEYS, 'source');
  const source = {
    sourceId: requireIdentity(value.sourceId, 'source.sourceId'),
    fileName: requireFileName(value.fileName, 'source.fileName'),
    sha256: requireSha256(value.sha256, 'source.sha256'),
    byteLength: requireNonnegativeInteger(value.byteLength, 'source.byteLength'),
    text: typeof value.text === 'string'
      ? value.text
      : fail('Source stagedJson must be text.', 'STAGED_JSON_WRITE_SOURCE_TEXT_INVALID'),
  };
  if (utf8ByteLength(source.text) !== source.byteLength
      || await sha256Utf8(source.text) !== source.sha256) {
    fail('Source stagedJson hash or byte length does not match.', 'STAGED_JSON_WRITE_SOURCE_HASH_MISMATCH');
  }
  return source;
}

export function requireMapping(value) {
  requireExactKeys(value, MAPPING_KEYS, 'mapping');
  const mapping = {
    sourceRecordIdField: requireFieldName(value.sourceRecordIdField, 'mapping.sourceRecordIdField'),
    targetIdField: requireNullableFieldName(value.targetIdField, 'mapping.targetIdField'),
    lineKeyField: requireNullableFieldName(value.lineKeyField, 'mapping.lineKeyField'),
    attributesField: requireFieldName(value.attributesField, 'mapping.attributesField'),
    childrenField: requireFieldName(value.childrenField, 'mapping.childrenField'),
  };
  const names = Object.values(mapping).filter((item) => item !== null);
  if (new Set(names).size !== names.length) {
    fail('StagedJson mapping fields must be distinct.', 'STAGED_JSON_WRITE_MAPPING_INVALID');
  }
  return mapping;
}

export function requireFormatting(value) {
  requireExactKeys(value, FORMATTING_KEYS, 'formatting');
  if (!Number.isInteger(value.indent) || value.indent < 0 || value.indent > 8
      || !['\n', '\r\n'].includes(value.newline)
      || typeof value.terminalNewline !== 'boolean') {
    fail('StagedJson formatting policy is invalid.', 'STAGED_JSON_WRITE_FORMATTING_INVALID');
  }
  return {
    indent: value.indent,
    newline: value.newline,
    terminalNewline: value.terminalNewline,
  };
}

export function requireAuthorizedStagedJsonWriteReceipt(value) {
  requireExactKeys(value, RECEIPT_KEYS, 'authorizedStagedJsonWriteReceipt');
  if (value.schema !== AUTHORIZED_STAGED_JSON_WRITE_RECEIPT_SCHEMA) {
    fail('Unsupported stagedJson write receipt.', 'STAGED_JSON_WRITE_SCHEMA_INVALID');
  }
  const receipt = {
    schema: value.schema,
    writeId: requireIdentity(value.writeId, 'receipt.writeId'),
    writtenAt: requireIsoTimestamp(value.writtenAt, 'receipt.writtenAt'),
    projectId: requireIdentity(value.projectId, 'receipt.projectId'),
    sidecarId: requireIdentity(value.sidecarId, 'receipt.sidecarId'),
    sidecarSemanticHash: requireSemanticHash(value.sidecarSemanticHash, 'receipt.sidecarSemanticHash'),
    sourceArtifact: requireSourceArtifact(value.sourceArtifact),
    mapping: requireMapping(value.mapping),
    formatting: requireFormatting(value.formatting),
    outputArtifact: requireOutputArtifact(value.outputArtifact),
    summary: requireSummary(value.summary),
    semanticHash: requireSemanticHash(value.semanticHash, 'receipt.semanticHash'),
  };
  if (receipt.semanticHash !== computeAuthorizedStagedJsonWriteReceiptSemanticHash(receipt)) {
    fail('StagedJson write receipt hash is stale.', 'STAGED_JSON_WRITE_HASH_MISMATCH');
  }
  return deepFreeze(receipt);
}

export async function requireAuthorizedStagedJsonWriteArtifact(value) {
  requireExactKeys(value, ARTIFACT_KEYS, 'authorizedStagedJsonWriteArtifact');
  if (value.schema !== AUTHORIZED_STAGED_JSON_WRITE_ARTIFACT_SCHEMA) {
    fail('Unsupported stagedJson write artifact.', 'STAGED_JSON_WRITE_SCHEMA_INVALID');
  }
  const receipt = requireAuthorizedStagedJsonWriteReceipt(value.receipt);
  if (typeof value.outputText !== 'string') {
    fail('StagedJson output must be text.', 'STAGED_JSON_WRITE_OUTPUT_TEXT_INVALID');
  }
  if (utf8ByteLength(value.outputText) !== receipt.outputArtifact.byteLength
      || await sha256Utf8(value.outputText) !== receipt.outputArtifact.sha256) {
    fail('StagedJson output bytes differ from the receipt.', 'STAGED_JSON_WRITE_OUTPUT_MISMATCH');
  }
  let outputValue;
  try {
    outputValue = JSON.parse(value.outputText);
  } catch (error) {
    fail('StagedJson output is not valid JSON.', 'STAGED_JSON_WRITE_OUTPUT_JSON_INVALID', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  if (semanticHash(outputValue) !== receipt.outputArtifact.semanticHash
      || serialize(outputValue, receipt.formatting) !== value.outputText) {
    fail('StagedJson output semantics or formatting differ from the receipt.', 'STAGED_JSON_WRITE_OUTPUT_MISMATCH');
  }
  const artifact = {
    schema: value.schema,
    receipt,
    outputText: value.outputText,
    semanticHash: requireSemanticHash(value.semanticHash, 'artifact.semanticHash'),
  };
  if (artifact.semanticHash !== computeAuthorizedStagedJsonWriteArtifactSemanticHash(artifact)) {
    fail('StagedJson write artifact hash is stale.', 'STAGED_JSON_WRITE_HASH_MISMATCH');
  }
  return deepFreeze(artifact);
}

export function serialize(value, formatting) {
  let text = JSON.stringify(value, null, formatting.indent);
  if (formatting.newline === '\r\n') text = text.replace(/\n/gu, '\r\n');
  if (formatting.terminalNewline) text += formatting.newline;
  return text;
}

export function requireExactKeys(value, expectedKeys, label) {
  if (!isRecord(value)) fail(`${label} must be an object.`, 'STAGED_JSON_WRITE_TYPE_INVALID');
  const actual = Object.keys(value).sort(compareAscii);
  const expected = [...expectedKeys].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} has unexpected keys.`, 'STAGED_JSON_WRITE_KEYS_INVALID', { actual, expected });
  }
}
export function requireIdentity(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail(`${label} must be a non-empty trimmed string.`, 'STAGED_JSON_WRITE_IDENTITY_INVALID');
  }
  return value;
}
export function requireIsoTimestamp(value, label) {
  const result = requireIdentity(value, label);
  if (new Date(result).toISOString() !== result) {
    fail(`${label} must be a canonical ISO-8601 timestamp.`, 'STAGED_JSON_WRITE_TIMESTAMP_INVALID');
  }
  return result;
}
export function requireFileName(value, label) {
  const result = requireIdentity(value, label);
  if (/[\\/]/u.test(result) || result === '.' || result === '..') {
    fail(`${label} must be a file name, not a path.`, 'STAGED_JSON_WRITE_FILE_NAME_INVALID');
  }
  return result;
}
export function requireSourceIdentity(value, label) {
  const result = requireIdentity(value, label);
  if (UNSAFE_KEYS.has(result)) fail(`${label} is unsafe.`, 'STAGED_JSON_WRITE_UNSAFE_KEY');
  return result;
}
export function utf8ByteLength(text) {
  return new TextEncoder().encode(text).byteLength;
}
export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
export function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
export function fail(message, code, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details === null ? null : deepFreeze(details);
  throw error;
}

function project(keys, value) {
  return Object.fromEntries(keys
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}
function requireSourceArtifact(value) {
  requireExactKeys(value, SOURCE_ARTIFACT_KEYS, 'receipt.sourceArtifact');
  return {
    sourceId: requireIdentity(value.sourceId, 'receipt.sourceArtifact.sourceId'),
    fileName: requireFileName(value.fileName, 'receipt.sourceArtifact.fileName'),
    sha256: requireSha256(value.sha256, 'receipt.sourceArtifact.sha256'),
    byteLength: requireNonnegativeInteger(value.byteLength, 'receipt.sourceArtifact.byteLength'),
    semanticHash: requireSemanticHash(value.semanticHash, 'receipt.sourceArtifact.semanticHash'),
  };
}
function requireOutputArtifact(value) {
  requireExactKeys(value, OUTPUT_ARTIFACT_KEYS, 'receipt.outputArtifact');
  return {
    fileName: requireFileName(value.fileName, 'receipt.outputArtifact.fileName'),
    sha256: requireSha256(value.sha256, 'receipt.outputArtifact.sha256'),
    byteLength: requireNonnegativeInteger(value.byteLength, 'receipt.outputArtifact.byteLength'),
    semanticHash: requireSemanticHash(value.semanticHash, 'receipt.outputArtifact.semanticHash'),
  };
}
function requireSummary(value) {
  requireExactKeys(value, SUMMARY_KEYS, 'receipt.summary');
  return Object.fromEntries(SUMMARY_KEYS.map((key) => [
    key,
    requireNonnegativeInteger(value[key], `receipt.summary.${key}`),
  ]));
}
function requireFieldName(value, label) {
  const result = requireIdentity(value, label);
  if (UNSAFE_KEYS.has(result) || /[.\\/\[\]]/u.test(result)) {
    fail(`${label} must be a safe direct field name.`, 'STAGED_JSON_WRITE_MAPPING_INVALID');
  }
  return result;
}
function requireNullableFieldName(value, label) {
  return value === null ? null : requireFieldName(value, label);
}
function requireSemanticHash(value, label) {
  const result = requireIdentity(value, label);
  if (!/^fnv1a64:[0-9a-f]{16}$/u.test(result)) {
    fail(`${label} must be a semantic hash.`, 'STAGED_JSON_WRITE_HASH_INVALID');
  }
  return result;
}
function requireSha256(value, label) {
  const result = requireIdentity(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    fail(`${label} must be a SHA-256 hex digest.`, 'STAGED_JSON_WRITE_HASH_INVALID');
  }
  return result;
}
function requireNonnegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer.`, 'STAGED_JSON_WRITE_NUMBER_INVALID');
  }
  return value;
}
