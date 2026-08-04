import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import {
  requireAuthorizedEmpiricalRuntimePackage,
} from '../engineering-loads/authorized-empirical-runtime-package.js';
import {
  requireAuthorizedStagedJsonSidecar,
} from './authorized-staged-json-sidecar.js';
import {
  AUTHORIZED_STAGED_JSON_WRITE_REQUEST_SCHEMA,
  writeAuthorizedStagedJson,
} from './authorized-staged-json-writer.js';
import {
  AUTHORIZED_STAGED_JSON_DOWNLOAD_REQUEST_SCHEMA,
  createAuthorizedStagedJsonDownloadArtifact,
  triggerAuthorizedStagedJsonDownload,
} from './authorized-staged-json-download.js';

export const AUTHORIZED_EMPIRICAL_CONSUMER_REQUEST_SCHEMA =
  'authorized-empirical-consumer-request/v2';
export const AUTHORIZED_STAGED_JSON_CONSUMER_REQUEST_SCHEMA =
  'authorized-staged-json-consumer-request/v1';
export const AUTHORIZED_STAGED_JSON_CONSUMER_RESULT_SCHEMA =
  'authorized-staged-json-consumer-result/v1';

const EMPIRICAL_KEYS = Object.freeze(['schema', 'runtimePackage']);
const STAGED_JSON_KEYS = Object.freeze([
  'schema', 'operationId', 'sidecar', 'source', 'mapping', 'formatting',
  'outputFileName', 'writeId', 'writtenAt', 'downloadId', 'triggeredAt',
]);
const RESULT_KEYS = Object.freeze([
  'schema', 'operationId', 'projectId', 'sidecarSemanticHash',
  'writeArtifactSemanticHash', 'writeReceiptSemanticHash',
  'downloadArtifactSemanticHash', 'downloadReceiptSemanticHash',
  'fileName', 'sha256', 'byteLength', 'status', 'semanticHash',
]);

export function authorizedStagedJsonConsumerResultSemanticProjection(value) {
  return Object.fromEntries(RESULT_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeAuthorizedStagedJsonConsumerResultSemanticHash(value) {
  return semanticHash(authorizedStagedJsonConsumerResultSemanticProjection(value));
}

export class AuthorizedEnrichmentConsumerController {
  constructor({ engineeringModelStore, masterDataController }) {
    if (!engineeringModelStore
        || typeof engineeringModelStore.configureAuthorizedEmpiricalPackage !== 'function'
        || typeof engineeringModelStore.executeConfiguredAuthorized !== 'function'
        || typeof engineeringModelStore.refreshAuthorizedEmpiricalPackage !== 'function'
        || typeof engineeringModelStore.markEmpiricalStale !== 'function'
        || typeof engineeringModelStore.getEmpiricalAuthorizationState !== 'function') {
      fail('An authorized engineering-model store is required.',
        'AUTHORIZED_ENRICHMENT_EMPIRICAL_STORE_INVALID');
    }
    if (!masterDataController
        || typeof masterDataController.getMasterData !== 'function') {
      fail('A master-data controller is required.',
        'AUTHORIZED_ENRICHMENT_MASTER_DATA_INVALID');
    }
    this.engineeringModelStore = engineeringModelStore;
    this.masterDataController = masterDataController;
  }

  configureEmpirical(input) {
    exact(input, EMPIRICAL_KEYS, 'authorizedEmpiricalConsumerRequest');
    if (input.schema !== AUTHORIZED_EMPIRICAL_CONSUMER_REQUEST_SCHEMA) {
      fail('Unsupported authorized empirical consumer request.',
        'AUTHORIZED_ENRICHMENT_SCHEMA_INVALID');
    }
    const runtimePackage = requireAuthorizedEmpiricalRuntimePackage(input.runtimePackage);
    return this.engineeringModelStore.configureAuthorizedEmpiricalPackage(
      runtimePackage,
      this.masterDataController.getMasterData(),
    );
  }

  executeEmpirical(input = undefined) {
    if (input !== undefined) this.configureEmpirical(input);
    return this.engineeringModelStore.executeConfiguredAuthorized(
      this.masterDataController.getMasterData(),
    );
  }

  refreshEmpirical() {
    return this.engineeringModelStore.refreshAuthorizedEmpiricalPackage(
      this.masterDataController.getMasterData(),
    );
  }

  markEmpiricalStale(reason, datasetVersion = null) {
    return this.engineeringModelStore.markEmpiricalStale(reason, datasetVersion);
  }

  getEmpiricalAuthorizationState() {
    return this.engineeringModelStore.getEmpiricalAuthorizationState();
  }

  async downloadStagedJson(input, documentRef, runtime) {
    exact(input, STAGED_JSON_KEYS, 'authorizedStagedJsonConsumerRequest');
    if (input.schema !== AUTHORIZED_STAGED_JSON_CONSUMER_REQUEST_SCHEMA) {
      fail('Unsupported authorized stagedJson consumer request.',
        'AUTHORIZED_ENRICHMENT_SCHEMA_INVALID');
    }
    const operationId = identity(input.operationId, 'operationId');
    const sidecar = requireAuthorizedStagedJsonSidecar(input.sidecar);
    const writeArtifact = await writeAuthorizedStagedJson({
      schema: AUTHORIZED_STAGED_JSON_WRITE_REQUEST_SCHEMA,
      writeId: identity(input.writeId, 'writeId'),
      writtenAt: timestamp(input.writtenAt, 'writtenAt'),
      source: input.source,
      sidecar,
      mapping: input.mapping,
      formatting: input.formatting,
      outputFileName: input.outputFileName,
    });
    const downloadArtifact = await createAuthorizedStagedJsonDownloadArtifact(writeArtifact);
    const downloadReceipt = await triggerAuthorizedStagedJsonDownload({
      schema: AUTHORIZED_STAGED_JSON_DOWNLOAD_REQUEST_SCHEMA,
      downloadId: identity(input.downloadId, 'downloadId'),
      triggeredAt: timestamp(input.triggeredAt, 'triggeredAt'),
      artifact: downloadArtifact,
    }, documentRef, runtime);

    const draft = {
      schema: AUTHORIZED_STAGED_JSON_CONSUMER_RESULT_SCHEMA,
      operationId,
      projectId: sidecar.projectId,
      sidecarSemanticHash: sidecar.semanticHash,
      writeArtifactSemanticHash: writeArtifact.semanticHash,
      writeReceiptSemanticHash: writeArtifact.receipt.semanticHash,
      downloadArtifactSemanticHash: downloadArtifact.semanticHash,
      downloadReceiptSemanticHash: downloadReceipt.semanticHash,
      fileName: downloadReceipt.fileName,
      sha256: downloadReceipt.sha256,
      byteLength: downloadReceipt.byteLength,
      status: downloadReceipt.status,
      semanticHash: 'fnv1a64:0000000000000000',
    };
    return requireAuthorizedStagedJsonConsumerResult({
      ...draft,
      semanticHash: computeAuthorizedStagedJsonConsumerResultSemanticHash(draft),
    });
  }
}

export function requireAuthorizedStagedJsonConsumerResult(value) {
  exact(value, RESULT_KEYS, 'authorizedStagedJsonConsumerResult');
  if (value.schema !== AUTHORIZED_STAGED_JSON_CONSUMER_RESULT_SCHEMA) {
    fail('Unsupported authorized stagedJson consumer result.',
      'AUTHORIZED_ENRICHMENT_SCHEMA_INVALID');
  }
  const result = {
    schema: value.schema,
    operationId: identity(value.operationId, 'result.operationId'),
    projectId: identity(value.projectId, 'result.projectId'),
    sidecarSemanticHash: hash(value.sidecarSemanticHash, 'result.sidecarSemanticHash'),
    writeArtifactSemanticHash: hash(value.writeArtifactSemanticHash, 'result.writeArtifactSemanticHash'),
    writeReceiptSemanticHash: hash(value.writeReceiptSemanticHash, 'result.writeReceiptSemanticHash'),
    downloadArtifactSemanticHash: hash(value.downloadArtifactSemanticHash, 'result.downloadArtifactSemanticHash'),
    downloadReceiptSemanticHash: hash(value.downloadReceiptSemanticHash, 'result.downloadReceiptSemanticHash'),
    fileName: fileName(value.fileName, 'result.fileName'),
    sha256: sha256(value.sha256, 'result.sha256'),
    byteLength: nonnegativeInteger(value.byteLength, 'result.byteLength'),
    status: value.status,
    semanticHash: hash(value.semanticHash, 'result.semanticHash'),
  };
  if (result.status !== 'TRIGGERED') {
    fail('StagedJson consumer result status is invalid.',
      'AUTHORIZED_ENRICHMENT_STATUS_INVALID');
  }
  if (result.semanticHash !== computeAuthorizedStagedJsonConsumerResultSemanticHash(result)) {
    fail('StagedJson consumer result hash is stale.',
      'AUTHORIZED_ENRICHMENT_HASH_MISMATCH');
  }
  return deepFreeze(result);
}

function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`, 'AUTHORIZED_ENRICHMENT_TYPE_INVALID');
  }
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} has unexpected keys.`, 'AUTHORIZED_ENRICHMENT_KEYS_INVALID',
      { actual, expected });
  }
}
function identity(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail(`${label} must be a non-empty trimmed string.`,
      'AUTHORIZED_ENRICHMENT_IDENTITY_INVALID');
  }
  return value;
}
function timestamp(value, label) {
  const result = identity(value, label);
  if (new Date(result).toISOString() !== result) {
    fail(`${label} must be a canonical ISO-8601 timestamp.`,
      'AUTHORIZED_ENRICHMENT_TIMESTAMP_INVALID');
  }
  return result;
}
function fileName(value, label) {
  const result = identity(value, label);
  if (/[\\/]/u.test(result) || result === '.' || result === '..') {
    fail(`${label} must be a file name, not a path.`,
      'AUTHORIZED_ENRICHMENT_FILE_NAME_INVALID');
  }
  return result;
}
function hash(value, label) {
  const result = identity(value, label);
  if (!/^fnv1a64:[0-9a-f]{16}$/u.test(result)) {
    fail(`${label} must be a semantic hash.`, 'AUTHORIZED_ENRICHMENT_HASH_INVALID');
  }
  return result;
}
function sha256(value, label) {
  const result = identity(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    fail(`${label} must be a SHA-256 hex digest.`, 'AUTHORIZED_ENRICHMENT_HASH_INVALID');
  }
  return result;
}
function nonnegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer.`,
      'AUTHORIZED_ENRICHMENT_NUMBER_INVALID');
  }
  return value;
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
