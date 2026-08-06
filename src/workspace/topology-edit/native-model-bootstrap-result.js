import { semanticHash } from '../../core/shared-piping-model/index.js';
import {
  NATIVE_MODEL_BOOTSTRAP_RESULT_SCHEMA,
  createNativeModelBootstrap,
} from './native-model-bootstrap.js';

const AXES = new Set(['X', 'Y', 'Z']);

function fail(message, Constructor = TypeError) {
  throw new Constructor(`NativeModelBootstrapResult: ${message}`);
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}

export function assertNativeModelBootstrapResult(value) {
  if (value?.schema !== NATIVE_MODEL_BOOTSTRAP_RESULT_SCHEMA) {
    fail(`result must use ${NATIVE_MODEL_BOOTSTRAP_RESULT_SCHEMA}.`);
  }
  const rebuilt = createNativeModelBootstrap({ request: value.request });
  for (const key of [
    'requestHash', 'datasetId', 'nativeModelId', 'sourceHash', 'datasetHash',
    'canonicalTopologyHash', 'catalogueHash', 'authoringPolicyHash', 'bootstrapHash',
  ]) {
    if (value[key] !== rebuilt[key]) {
      fail(`result ${key} differs from deterministic authority.`, RangeError);
    }
  }
  if (semanticHash(value.dataset) !== value.datasetHash) {
    fail('result dataset hash mismatch.', RangeError);
  }
  if (value.canonicalTopology?.canonicalTopologyHash !== value.canonicalTopologyHash) {
    fail('result canonical topology hash mismatch.', RangeError);
  }
  return value;
}

export function assertNativeBootstrapIdentityAvailable(result, existingDatasetIds = []) {
  const normalized = assertNativeModelBootstrapResult(result);
  const collisions = new Set((existingDatasetIds ?? []).map(String));
  if (collisions.has(normalized.datasetId)) {
    fail(`dataset identity collision ${normalized.datasetId}.`, RangeError);
  }
  return normalized;
}

export function nativeCoordinateAxis(value) {
  const axis = requiredText(value, 'axis').toUpperCase();
  if (!AXES.has(axis)) fail(`unsupported axis ${axis}.`, RangeError);
  return axis;
}
