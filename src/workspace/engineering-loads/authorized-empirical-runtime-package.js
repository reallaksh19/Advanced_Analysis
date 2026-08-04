import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import { requireAuthorizedEmpiricalLoadInput } from './authorized-empirical-load-input.js';

export const AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA = 'authorized-empirical-runtime-package/v1';

const PACKAGE_KEYS = [
  'schema', 'packageId', 'configuredAt', 'executionId', 'executedAt',
  'authorizedInput', 'bindings', 'semanticHash',
];
const BINDING_KEYS = [
  'projectId', 'datasetId', 'datasetVersion', 'sourceDatasetHash',
  'sharedModelSemanticHash', 'supportSiteModelSemanticHash',
  'routePartitionModelSemanticHash', 'projectDataProfileSemanticHash',
  'masterSourceHashes',
];
const MASTER_HASH_KEYS = ['dataset', 'lineList', 'pipingClass', 'componentWeight'];

export function authorizedEmpiricalRuntimePackageSemanticProjection(value) {
  return Object.fromEntries(PACKAGE_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeAuthorizedEmpiricalRuntimePackageSemanticHash(value) {
  return semanticHash(authorizedEmpiricalRuntimePackageSemanticProjection(value));
}

/**
 * Seals caller-supplied authorization, identities, timestamps and freshness
 * bindings. This function validates evidence; it creates no authorization or
 * readiness decision and supplies no default identity, time or hash.
 */
export function sealAuthorizedEmpiricalRuntimePackage(value) {
  exact(value, PACKAGE_KEYS.filter((key) => key !== 'semanticHash'), 'authorizedEmpiricalRuntimePackageDraft');
  const draft = validatePackage({ ...value, semanticHash: 'fnv1a64:0000000000000000' }, false);
  return requireAuthorizedEmpiricalRuntimePackage({
    ...draft,
    semanticHash: computeAuthorizedEmpiricalRuntimePackageSemanticHash(draft),
  });
}

export function requireAuthorizedEmpiricalRuntimePackage(value) {
  const result = validatePackage(value, true);
  if (result.semanticHash !== computeAuthorizedEmpiricalRuntimePackageSemanticHash(result)) {
    fail('Authorized empirical runtime package hash is stale.', 'EMPIRICAL_RUNTIME_PACKAGE_HASH_MISMATCH');
  }
  return deepFreeze(result);
}

export function compareAuthorizedEmpiricalRuntimeBindings(expected, actual) {
  const expectedBindings = validateBindings(expected);
  const actualBindings = validateBindings(actual);
  const mismatches = [];
  for (const key of BINDING_KEYS.filter((item) => item !== 'masterSourceHashes')) {
    if (!same(expectedBindings[key], actualBindings[key])) {
      mismatches.push({
        code: 'EMPIRICAL_RUNTIME_BINDING_MISMATCH',
        field: key,
        expected: expectedBindings[key],
        actual: actualBindings[key],
      });
    }
  }
  for (const key of MASTER_HASH_KEYS) {
    if (expectedBindings.masterSourceHashes[key] !== actualBindings.masterSourceHashes[key]) {
      mismatches.push({
        code: 'EMPIRICAL_RUNTIME_MASTER_HASH_MISMATCH',
        field: `masterSourceHashes.${key}`,
        expected: expectedBindings.masterSourceHashes[key],
        actual: actualBindings.masterSourceHashes[key],
      });
    }
  }
  return deepFreeze(mismatches);
}

function validatePackage(value, requireHash) {
  exact(value, PACKAGE_KEYS, 'authorizedEmpiricalRuntimePackage');
  if (value.schema !== AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA) {
    fail('Unsupported authorized empirical runtime package.', 'EMPIRICAL_RUNTIME_PACKAGE_SCHEMA_INVALID');
  }
  const authorizedInput = requireAuthorizedEmpiricalLoadInput(value.authorizedInput);
  const bindings = validateBindings(value.bindings);
  if (bindings.projectId !== authorizedInput.projectId) {
    fail('Runtime package project differs from the authorized input.', 'EMPIRICAL_RUNTIME_PACKAGE_PROJECT_MISMATCH');
  }
  if (bindings.sourceDatasetHash !== bindings.masterSourceHashes.dataset) {
    fail('Dataset source hashes disagree inside the runtime package.', 'EMPIRICAL_RUNTIME_PACKAGE_DATASET_HASH_MISMATCH');
  }
  return {
    schema: value.schema,
    packageId: identity(value.packageId, 'packageId'),
    configuredAt: timestamp(value.configuredAt, 'configuredAt'),
    executionId: identity(value.executionId, 'executionId'),
    executedAt: timestamp(value.executedAt, 'executedAt'),
    authorizedInput,
    bindings,
    semanticHash: requireHash ? hash(value.semanticHash, 'semanticHash') : value.semanticHash,
  };
}

function validateBindings(value) {
  exact(value, BINDING_KEYS, 'authorizedEmpiricalRuntimePackage.bindings');
  exact(value.masterSourceHashes, MASTER_HASH_KEYS, 'authorizedEmpiricalRuntimePackage.bindings.masterSourceHashes');
  return {
    projectId: identity(value.projectId, 'bindings.projectId'),
    datasetId: identity(value.datasetId, 'bindings.datasetId'),
    datasetVersion: nullableVersion(value.datasetVersion),
    sourceDatasetHash: sha256(value.sourceDatasetHash, 'bindings.sourceDatasetHash'),
    sharedModelSemanticHash: hash(value.sharedModelSemanticHash, 'bindings.sharedModelSemanticHash'),
    supportSiteModelSemanticHash: hash(value.supportSiteModelSemanticHash, 'bindings.supportSiteModelSemanticHash'),
    routePartitionModelSemanticHash: hash(value.routePartitionModelSemanticHash, 'bindings.routePartitionModelSemanticHash'),
    projectDataProfileSemanticHash: hash(value.projectDataProfileSemanticHash, 'bindings.projectDataProfileSemanticHash'),
    masterSourceHashes: Object.fromEntries(MASTER_HASH_KEYS.map((key) => [
      key,
      sha256(value.masterSourceHashes[key], `bindings.masterSourceHashes.${key}`),
    ])),
  };
}

function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`, 'EMPIRICAL_RUNTIME_PACKAGE_TYPE_INVALID');
  }
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} contains unexpected or missing keys.`, 'EMPIRICAL_RUNTIME_PACKAGE_KEYS_INVALID', { actual, expected });
  }
}

function identity(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail(`${label} must be a non-empty trimmed string.`, 'EMPIRICAL_RUNTIME_PACKAGE_IDENTITY_INVALID');
  }
  return value;
}

function timestamp(value, label) {
  const result = identity(value, label);
  if (new Date(result).toISOString() !== result) {
    fail(`${label} must be a canonical ISO-8601 timestamp.`, 'EMPIRICAL_RUNTIME_PACKAGE_TIMESTAMP_INVALID');
  }
  return result;
}

function hash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    fail(`${label} must be an FNV-1a semantic hash.`, 'EMPIRICAL_RUNTIME_PACKAGE_HASH_INVALID');
  }
  return value;
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest.`, 'EMPIRICAL_RUNTIME_PACKAGE_SHA256_INVALID');
  }
  return value;
}

function nullableVersion(value) {
  if (value === null) return null;
  if (Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.length > 0 && value.trim() === value) return value;
  fail('datasetVersion must be null, an integer, or a non-empty trimmed string.', 'EMPIRICAL_RUNTIME_PACKAGE_VERSION_INVALID');
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
