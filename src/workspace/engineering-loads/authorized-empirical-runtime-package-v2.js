import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { clonePlain } from '../dataset-utils.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_REQUEST_SCHEMA,
  AUTHORIZED_EMPIRICAL_EXECUTION_METHODS,
} from './authorized-empirical-load-execution-v2.js';
import {
  AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA,
  computeAuthorizedEmpiricalRuntimePackageSemanticHash,
  requireAuthorizedEmpiricalRuntimePackage,
  sealAuthorizedEmpiricalRuntimePackage,
} from './authorized-empirical-runtime-package.js';

export const AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_V2_SCHEMA =
  'authorized-empirical-runtime-package/v2';

const INPUT_KEYS = [
  'schema', 'packageId', 'configuredAt', 'executionId', 'executedAt',
  'method', 'authorizedInput', 'bindings',
];
const OUTPUT_KEYS = [...INPUT_KEYS, 'semanticHash'];
const REQUEST_CONTEXT_KEYS = [
  'runtimePackage', 'dataset', 'profile', 'supportSiteModel',
  'routePartitionModel', 'masterData',
];

export function authorizedEmpiricalRuntimePackageV2SemanticProjection(value) {
  return Object.fromEntries(OUTPUT_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeAuthorizedEmpiricalRuntimePackageV2SemanticHash(value) {
  return semanticHash(authorizedEmpiricalRuntimePackageV2SemanticProjection(value));
}

/**
 * Seals a method-bound package while reusing every V1 input, binding, source
 * hash, timestamp and identifier validation rule. No method is inferred.
 */
export function sealAuthorizedEmpiricalRuntimePackageV2(value) {
  exact(value, INPUT_KEYS, 'authorizedEmpiricalRuntimePackageV2Input');
  if (value.schema !== AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_V2_SCHEMA) {
    fail(
      'Unsupported authorized empirical runtime package V2 input.',
      'EMPIRICAL_RUNTIME_PACKAGE_V2_SCHEMA_INVALID',
    );
  }
  const method = requireMethod(value.method);
  const v1 = sealAuthorizedEmpiricalRuntimePackage({
    schema: AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA,
    packageId: value.packageId,
    configuredAt: value.configuredAt,
    executionId: value.executionId,
    executedAt: value.executedAt,
    authorizedInput: value.authorizedInput,
    bindings: value.bindings,
  });
  const draft = {
    schema: AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_V2_SCHEMA,
    packageId: v1.packageId,
    configuredAt: v1.configuredAt,
    executionId: v1.executionId,
    executedAt: v1.executedAt,
    method,
    authorizedInput: v1.authorizedInput,
    bindings: v1.bindings,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireAuthorizedEmpiricalRuntimePackageV2({
    ...draft,
    semanticHash: computeAuthorizedEmpiricalRuntimePackageV2SemanticHash(draft),
  });
}

export function requireAuthorizedEmpiricalRuntimePackageV2(value) {
  exact(value, OUTPUT_KEYS, 'authorizedEmpiricalRuntimePackageV2');
  if (value.schema !== AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_V2_SCHEMA) {
    fail(
      'Unsupported authorized empirical runtime package V2.',
      'EMPIRICAL_RUNTIME_PACKAGE_V2_SCHEMA_INVALID',
    );
  }
  const method = requireMethod(value.method);
  const normalizedV1 = requireAuthorizedEmpiricalRuntimePackage({
    schema: AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA,
    packageId: value.packageId,
    configuredAt: value.configuredAt,
    executionId: value.executionId,
    executedAt: value.executedAt,
    authorizedInput: value.authorizedInput,
    bindings: value.bindings,
    semanticHash: computeAuthorizedEmpiricalRuntimePackageSemanticHash({
      schema: AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA,
      packageId: value.packageId,
      configuredAt: value.configuredAt,
      executionId: value.executionId,
      executedAt: value.executedAt,
      authorizedInput: value.authorizedInput,
      bindings: value.bindings,
    }),
  });
  const result = {
    schema: AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_V2_SCHEMA,
    packageId: normalizedV1.packageId,
    configuredAt: normalizedV1.configuredAt,
    executionId: normalizedV1.executionId,
    executedAt: normalizedV1.executedAt,
    method,
    authorizedInput: normalizedV1.authorizedInput,
    bindings: normalizedV1.bindings,
    semanticHash: value.semanticHash,
  };
  if (result.semanticHash !== computeAuthorizedEmpiricalRuntimePackageV2SemanticHash(result)) {
    fail(
      'Authorized empirical runtime package V2 semantic hash is stale.',
      'EMPIRICAL_RUNTIME_PACKAGE_V2_HASH_MISMATCH',
    );
  }
  return deepFreeze(result);
}

/**
 * Projects a validated package and explicit current runtime products into the
 * exact V2 execution-request contract. It performs no calculation.
 */
export function projectAuthorizedEmpiricalExecutionV2Request(value) {
  exact(value, REQUEST_CONTEXT_KEYS, 'authorizedEmpiricalExecutionV2Context');
  const runtimePackage = requireAuthorizedEmpiricalRuntimePackageV2(
    value.runtimePackage,
  );
  requireObject(value.dataset, 'dataset');
  requireObject(value.profile, 'profile');
  requireObject(value.supportSiteModel, 'supportSiteModel');
  requireObject(value.routePartitionModel, 'routePartitionModel');
  requireObject(value.masterData, 'masterData');
  return deepFreeze({
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_REQUEST_SCHEMA,
    executionId: runtimePackage.executionId,
    executedAt: runtimePackage.executedAt,
    method: runtimePackage.method,
    authorizedInput: runtimePackage.authorizedInput,
    dataset: clonePlain(value.dataset),
    profile: clonePlain(value.profile),
    supportSiteModel: clonePlain(value.supportSiteModel),
    routePartitionModel: clonePlain(value.routePartitionModel),
    masterData: clonePlain(value.masterData),
  });
}

function requireMethod(value) {
  if (!AUTHORIZED_EMPIRICAL_EXECUTION_METHODS.includes(value)) {
    fail(
      'Authorized empirical runtime package method is unsupported.',
      'EMPIRICAL_RUNTIME_PACKAGE_V2_METHOD_INVALID',
      { value, allowed: AUTHORIZED_EMPIRICAL_EXECUTION_METHODS },
    );
  }
  return value;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(
      `${label} must be an object.`,
      'EMPIRICAL_RUNTIME_PACKAGE_V2_CONTEXT_INVALID',
    );
  }
}

function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(
      `${label} must be an object.`,
      'EMPIRICAL_RUNTIME_PACKAGE_V2_TYPE_INVALID',
    );
  }
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      `${label} contains unexpected or missing keys.`,
      'EMPIRICAL_RUNTIME_PACKAGE_V2_KEYS_INVALID',
      { actual, expected },
    );
  }
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
