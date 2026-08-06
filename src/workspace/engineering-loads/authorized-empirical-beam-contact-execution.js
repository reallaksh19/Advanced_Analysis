import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
} from '../../core/shared-piping-model/index.js';
import {
  adaptModelLoadPrimitivesForBeamContact,
} from './empirical-beam-contact-load-adapter.js';
import {
  EMPIRICAL_BEAM_CONTACT_EXECUTION_REQUEST_SCHEMA,
  executeEmpiricalBeamContactRuntime,
  requireEmpiricalBeamContactExecutionResult,
} from './empirical-beam-contact-runtime.js';

export const AUTHORIZED_EMPIRICAL_BEAM_CONTACT_EXECUTION_REQUEST_SCHEMA =
  'authorized-empirical-beam-contact-execution-request/v1';
export const AUTHORIZED_EMPIRICAL_BEAM_CONTACT_EXECUTION_SCHEMA =
  'authorized-empirical-beam-contact-execution/v1';

const REQUEST_KEYS = Object.freeze([
  'schema',
  'executionId',
  'executedAt',
  'adaptedRequest',
  'sharedModel',
  'topologyGraph',
  'supportAttachmentModel',
  'restraintCapabilityModel',
  'sourceLoadPrimitiveSet',
  'runtimeProfile',
  'caseConfigurations',
]);
const RESULT_KEYS = Object.freeze([
  'schema',
  'method',
  'executionId',
  'executedAt',
  'sourceLoadPrimitiveSetSemanticHash',
  'adaptedLoadPrimitiveSetSemanticHash',
  'coreResult',
  'semanticHash',
]);

export function calculateAuthorizedEmpiricalBeamContactExecution(value) {
  exactKeys(value, REQUEST_KEYS, 'authorized beam/contact execution request');
  if (value.schema !== AUTHORIZED_EMPIRICAL_BEAM_CONTACT_EXECUTION_REQUEST_SCHEMA) {
    throw new TypeError('Unsupported authorized beam/contact execution request schema.');
  }
  const adaptedLoadPrimitiveSet = adaptModelLoadPrimitivesForBeamContact(
    value.sourceLoadPrimitiveSet,
  );
  const coreResult = executeEmpiricalBeamContactRuntime({
    schema: EMPIRICAL_BEAM_CONTACT_EXECUTION_REQUEST_SCHEMA,
    executionId: value.executionId,
    executedAt: value.executedAt,
    adaptedRequest: value.adaptedRequest,
    sharedModel: value.sharedModel,
    topologyGraph: value.topologyGraph,
    supportAttachmentModel: value.supportAttachmentModel,
    restraintCapabilityModel: value.restraintCapabilityModel,
    loadPrimitiveSet: adaptedLoadPrimitiveSet,
    runtimeProfile: value.runtimeProfile,
    caseConfigurations: value.caseConfigurations,
  });
  const draft = {
    schema: AUTHORIZED_EMPIRICAL_BEAM_CONTACT_EXECUTION_SCHEMA,
    method: coreResult.method,
    executionId: coreResult.executionId,
    executedAt: coreResult.executedAt,
    sourceLoadPrimitiveSetSemanticHash: value.sourceLoadPrimitiveSet.semanticHash,
    adaptedLoadPrimitiveSetSemanticHash: adaptedLoadPrimitiveSet.semanticHash,
    coreResult,
  };
  return requireAuthorizedEmpiricalBeamContactExecution({
    ...draft,
    semanticHash: semanticHash(draft),
  });
}

export function requireAuthorizedEmpiricalBeamContactExecution(value) {
  exactKeys(value, RESULT_KEYS, 'authorized beam/contact execution');
  if (value.schema !== AUTHORIZED_EMPIRICAL_BEAM_CONTACT_EXECUTION_SCHEMA) {
    throw new TypeError('Unsupported authorized beam/contact execution schema.');
  }
  const coreResult = requireEmpiricalBeamContactExecutionResult(value.coreResult);
  if (value.method !== coreResult.method
    || value.executionId !== coreResult.executionId
    || value.executedAt !== coreResult.executedAt) {
    throw new TypeError('Authorized beam/contact execution identity mismatch.');
  }
  const { semanticHash: actual, ...payload } = value;
  if (actual !== semanticHash(payload)) {
    throw new TypeError('Authorized beam/contact execution semantic hash mismatch.');
  }
  return deepFreeze(structuredClone(value));
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}
