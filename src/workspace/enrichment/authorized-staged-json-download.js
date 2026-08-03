import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import {
  requireAuthorizedStagedJsonWriteArtifact,
  sha256Utf8,
} from './authorized-staged-json-writer.js';

export const AUTHORIZED_STAGED_JSON_DOWNLOAD_ARTIFACT_SCHEMA =
  'authorized-staged-json-download-artifact/v1';
export const AUTHORIZED_STAGED_JSON_DOWNLOAD_REQUEST_SCHEMA =
  'authorized-staged-json-download-request/v1';
export const AUTHORIZED_STAGED_JSON_DOWNLOAD_RECEIPT_SCHEMA =
  'authorized-staged-json-download-receipt/v1';

const ARTIFACT_KEYS = Object.freeze([
  'schema', 'projectId', 'sidecarId', 'fileName', 'mimeType', 'content',
  'byteLength', 'sha256', 'writeArtifactSemanticHash',
  'writeReceiptSemanticHash', 'semanticHash',
]);
const REQUEST_KEYS = Object.freeze([
  'schema', 'downloadId', 'triggeredAt', 'artifact',
]);
const RECEIPT_KEYS = Object.freeze([
  'schema', 'downloadId', 'triggeredAt', 'projectId', 'sidecarId',
  'fileName', 'byteLength', 'sha256', 'downloadArtifactSemanticHash',
  'writeArtifactSemanticHash', 'writeReceiptSemanticHash', 'status', 'semanticHash',
]);
const MIME_TYPE = 'application/json;charset=utf-8';
const STATUS = 'TRIGGERED';

export function authorizedStagedJsonDownloadArtifactSemanticProjection(value) {
  return project(ARTIFACT_KEYS, value);
}
export function computeAuthorizedStagedJsonDownloadArtifactSemanticHash(value) {
  return semanticHash(authorizedStagedJsonDownloadArtifactSemanticProjection(value));
}
export function authorizedStagedJsonDownloadReceiptSemanticProjection(value) {
  return project(RECEIPT_KEYS, value);
}
export function computeAuthorizedStagedJsonDownloadReceiptSemanticHash(value) {
  return semanticHash(authorizedStagedJsonDownloadReceiptSemanticProjection(value));
}

export async function createAuthorizedStagedJsonDownloadArtifact(writeArtifactValue) {
  const writeArtifact = await requireAuthorizedStagedJsonWriteArtifact(writeArtifactValue);
  const draft = {
    schema: AUTHORIZED_STAGED_JSON_DOWNLOAD_ARTIFACT_SCHEMA,
    projectId: writeArtifact.receipt.projectId,
    sidecarId: writeArtifact.receipt.sidecarId,
    fileName: writeArtifact.receipt.outputArtifact.fileName,
    mimeType: MIME_TYPE,
    content: writeArtifact.outputText,
    byteLength: writeArtifact.receipt.outputArtifact.byteLength,
    sha256: writeArtifact.receipt.outputArtifact.sha256,
    writeArtifactSemanticHash: writeArtifact.semanticHash,
    writeReceiptSemanticHash: writeArtifact.receipt.semanticHash,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireAuthorizedStagedJsonDownloadArtifact({
    ...draft,
    semanticHash: computeAuthorizedStagedJsonDownloadArtifactSemanticHash(draft),
  });
}

export async function requireAuthorizedStagedJsonDownloadArtifact(value) {
  exact(value, ARTIFACT_KEYS, 'authorizedStagedJsonDownloadArtifact');
  if (value.schema !== AUTHORIZED_STAGED_JSON_DOWNLOAD_ARTIFACT_SCHEMA) {
    fail('Unsupported stagedJson download artifact.', 'STAGED_JSON_DOWNLOAD_SCHEMA_INVALID');
  }
  const artifact = {
    schema: value.schema,
    projectId: identity(value.projectId, 'artifact.projectId'),
    sidecarId: identity(value.sidecarId, 'artifact.sidecarId'),
    fileName: fileName(value.fileName, 'artifact.fileName'),
    mimeType: value.mimeType,
    content: typeof value.content === 'string'
      ? value.content
      : fail('Download content must be text.', 'STAGED_JSON_DOWNLOAD_CONTENT_INVALID'),
    byteLength: nonnegativeInteger(value.byteLength, 'artifact.byteLength'),
    sha256: sha256(value.sha256, 'artifact.sha256'),
    writeArtifactSemanticHash: hash(value.writeArtifactSemanticHash, 'artifact.writeArtifactSemanticHash'),
    writeReceiptSemanticHash: hash(value.writeReceiptSemanticHash, 'artifact.writeReceiptSemanticHash'),
    semanticHash: hash(value.semanticHash, 'artifact.semanticHash'),
  };
  if (artifact.mimeType !== MIME_TYPE) {
    fail('Download MIME type is invalid.', 'STAGED_JSON_DOWNLOAD_MIME_INVALID');
  }
  const bytes = new TextEncoder().encode(artifact.content).byteLength;
  if (bytes !== artifact.byteLength || await sha256Utf8(artifact.content) !== artifact.sha256) {
    fail('Download content differs from its byte evidence.', 'STAGED_JSON_DOWNLOAD_CONTENT_MISMATCH');
  }
  if (artifact.semanticHash !== computeAuthorizedStagedJsonDownloadArtifactSemanticHash(artifact)) {
    fail('Download artifact hash is stale.', 'STAGED_JSON_DOWNLOAD_HASH_MISMATCH');
  }
  return deepFreeze(artifact);
}

export async function triggerAuthorizedStagedJsonDownload(
  input,
  documentRef,
  runtime = defaultBrowserDownloadRuntime(),
) {
  exact(input, REQUEST_KEYS, 'authorizedStagedJsonDownloadRequest');
  if (input.schema !== AUTHORIZED_STAGED_JSON_DOWNLOAD_REQUEST_SCHEMA) {
    fail('Unsupported stagedJson download request.', 'STAGED_JSON_DOWNLOAD_SCHEMA_INVALID');
  }
  const downloadId = identity(input.downloadId, 'downloadId');
  const triggeredAt = timestamp(input.triggeredAt, 'triggeredAt');
  const artifact = await requireAuthorizedStagedJsonDownloadArtifact(input.artifact);
  requireDocument(documentRef);
  requireRuntime(runtime);

  const blob = new runtime.BlobCtor([artifact.content], { type: artifact.mimeType });
  const url = runtime.createObjectURL(blob);
  let clicked = false;
  try {
    const anchor = documentRef.createElement('a');
    if (!anchor || typeof anchor.click !== 'function') {
      fail('Document did not create a clickable anchor.', 'STAGED_JSON_DOWNLOAD_DOCUMENT_INVALID');
    }
    anchor.href = url;
    anchor.download = artifact.fileName;
    anchor.click();
    clicked = true;
  } finally {
    runtime.revokeObjectURL(url);
  }
  if (!clicked) {
    fail('StagedJson download was not triggered.', 'STAGED_JSON_DOWNLOAD_TRIGGER_FAILED');
  }

  const draft = {
    schema: AUTHORIZED_STAGED_JSON_DOWNLOAD_RECEIPT_SCHEMA,
    downloadId,
    triggeredAt,
    projectId: artifact.projectId,
    sidecarId: artifact.sidecarId,
    fileName: artifact.fileName,
    byteLength: artifact.byteLength,
    sha256: artifact.sha256,
    downloadArtifactSemanticHash: artifact.semanticHash,
    writeArtifactSemanticHash: artifact.writeArtifactSemanticHash,
    writeReceiptSemanticHash: artifact.writeReceiptSemanticHash,
    status: STATUS,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireAuthorizedStagedJsonDownloadReceipt({
    ...draft,
    semanticHash: computeAuthorizedStagedJsonDownloadReceiptSemanticHash(draft),
  });
}

export function requireAuthorizedStagedJsonDownloadReceipt(value) {
  exact(value, RECEIPT_KEYS, 'authorizedStagedJsonDownloadReceipt');
  if (value.schema !== AUTHORIZED_STAGED_JSON_DOWNLOAD_RECEIPT_SCHEMA) {
    fail('Unsupported stagedJson download receipt.', 'STAGED_JSON_DOWNLOAD_SCHEMA_INVALID');
  }
  const receipt = {
    schema: value.schema,
    downloadId: identity(value.downloadId, 'receipt.downloadId'),
    triggeredAt: timestamp(value.triggeredAt, 'receipt.triggeredAt'),
    projectId: identity(value.projectId, 'receipt.projectId'),
    sidecarId: identity(value.sidecarId, 'receipt.sidecarId'),
    fileName: fileName(value.fileName, 'receipt.fileName'),
    byteLength: nonnegativeInteger(value.byteLength, 'receipt.byteLength'),
    sha256: sha256(value.sha256, 'receipt.sha256'),
    downloadArtifactSemanticHash: hash(value.downloadArtifactSemanticHash, 'receipt.downloadArtifactSemanticHash'),
    writeArtifactSemanticHash: hash(value.writeArtifactSemanticHash, 'receipt.writeArtifactSemanticHash'),
    writeReceiptSemanticHash: hash(value.writeReceiptSemanticHash, 'receipt.writeReceiptSemanticHash'),
    status: value.status,
    semanticHash: hash(value.semanticHash, 'receipt.semanticHash'),
  };
  if (receipt.status !== STATUS) {
    fail('Download receipt status is invalid.', 'STAGED_JSON_DOWNLOAD_STATUS_INVALID');
  }
  if (receipt.semanticHash !== computeAuthorizedStagedJsonDownloadReceiptSemanticHash(receipt)) {
    fail('Download receipt hash is stale.', 'STAGED_JSON_DOWNLOAD_HASH_MISMATCH');
  }
  return deepFreeze(receipt);
}

export function defaultBrowserDownloadRuntime() {
  const urlApi = globalThis.URL;
  return {
    BlobCtor: globalThis.Blob,
    createObjectURL: (blob) => {
      if (!urlApi || typeof urlApi.createObjectURL !== 'function') {
        fail('Browser object-URL creation is unavailable.', 'STAGED_JSON_DOWNLOAD_RUNTIME_INVALID');
      }
      return urlApi.createObjectURL(blob);
    },
    revokeObjectURL: (url) => {
      if (!urlApi || typeof urlApi.revokeObjectURL !== 'function') {
        fail('Browser object-URL revocation is unavailable.', 'STAGED_JSON_DOWNLOAD_RUNTIME_INVALID');
      }
      urlApi.revokeObjectURL(url);
    },
  };
}

function requireDocument(value) {
  if (!value || typeof value.createElement !== 'function') {
    fail('A document is required for stagedJson download.', 'STAGED_JSON_DOWNLOAD_DOCUMENT_INVALID');
  }
}
function requireRuntime(value) {
  if (!value || typeof value.BlobCtor !== 'function'
      || typeof value.createObjectURL !== 'function'
      || typeof value.revokeObjectURL !== 'function') {
    fail('Download runtime is invalid.', 'STAGED_JSON_DOWNLOAD_RUNTIME_INVALID');
  }
}
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`, 'STAGED_JSON_DOWNLOAD_TYPE_INVALID');
  }
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} has unexpected keys.`, 'STAGED_JSON_DOWNLOAD_KEYS_INVALID', { actual, expected });
  }
}
function identity(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail(`${label} must be a non-empty trimmed string.`, 'STAGED_JSON_DOWNLOAD_IDENTITY_INVALID');
  }
  return value;
}
function timestamp(value, label) {
  const result = identity(value, label);
  if (new Date(result).toISOString() !== result) {
    fail(`${label} must be a canonical ISO-8601 timestamp.`, 'STAGED_JSON_DOWNLOAD_TIMESTAMP_INVALID');
  }
  return result;
}
function fileName(value, label) {
  const result = identity(value, label);
  if (/[\/]/u.test(result) || result === '.' || result === '..') {
    fail(`${label} must be a file name, not a path.`, 'STAGED_JSON_DOWNLOAD_FILE_NAME_INVALID');
  }
  return result;
}
function hash(value, label) {
  const result = identity(value, label);
  if (!/^fnv1a64:[0-9a-f]{16}$/u.test(result)) {
    fail(`${label} must be a semantic hash.`, 'STAGED_JSON_DOWNLOAD_HASH_INVALID');
  }
  return result;
}
function sha256(value, label) {
  const result = identity(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    fail(`${label} must be a SHA-256 hex digest.`, 'STAGED_JSON_DOWNLOAD_HASH_INVALID');
  }
  return result;
}
function nonnegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer.`, 'STAGED_JSON_DOWNLOAD_NUMBER_INVALID');
  }
  return value;
}
function project(keys, value) {
  return Object.fromEntries(keys
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}
function ascii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function fail(message, code, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details === null ? null : deepFreeze(details);
  throw error;
}
