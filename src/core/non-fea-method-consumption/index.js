import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { requireCommonEnrichedPipingInput } from '../non-fea-common-checker/index.js';
import {
  assessNonFeaAuthorityRevisionStaleness,
  createNonFeaAuthorityRevisionVector,
  requireNonFeaImplementationBinding,
} from '../non-fea-analysis-plan/index.js';
import {
  requireNonFeaEngineeringFoundationHandoff,
} from '../non-fea-engineering-foundation/index.js';

export const NON_FEA_METHOD_CONSUMPTION_SCHEMAS = Object.freeze({
  AUTHORIZATION: 'non-fea-method-authorization-receipt/v3',
  EXECUTION: 'non-fea-method-execution-receipt/v3',
  STALENESS: 'non-fea-method-consumption-staleness/v3',
});

const IMPLEMENTATION_BINDINGS = Object.freeze({
  CHAINAGE_TRIBUTARY_SPAN_V2: Object.freeze(['WEIGHT_AND_GRAVITY', 'SUSTAINED_REACTIONS']),
  CHAINAGE_TRIBUTARY_SPAN_V3_COG: Object.freeze(['WEIGHT_AND_GRAVITY', 'SUSTAINED_REACTIONS']),
  EMPIRICAL_BEAM_CONTACT_V1: Object.freeze([
    'WEIGHT_AND_GRAVITY',
    'SUSTAINED_REACTIONS',
    'SUSTAINED_MEMBER_ACTIONS',
    'VERTICAL_CONTACT',
  ]),
  EMPIRICAL_RESTRAINT_NETWORK_V1: Object.freeze([
    'THERMAL_FREE_DISPLACEMENT',
    'RESTRAINT_REACTIONS',
  ]),
  EMPIRICAL_RESTRAINT_NETWORK_V2: Object.freeze([
    'THERMAL_FREE_DISPLACEMENT',
    'RESTRAINT_REACTIONS',
  ]),
  EMPIRICAL_OPERATING_REACTION_SUPERPOSITION_V1: Object.freeze([
    'COMBINED_OPERATING_REACTION',
  ]),
  AUTHORIZED_EMPIRICAL_SUPPORT_LOADS_V1: Object.freeze([
    'WEIGHT_AND_GRAVITY',
    'SUSTAINED_REACTIONS',
  ]),
  COMMON_INPUT_EXPORT_V1: Object.freeze([
    'ENRICHED_STAGED_JSON_EXPORT',
  ]),
});

export function commonMethodsForImplementation(implementationId) {
  const id = requiredText(implementationId, 'implementationId');
  const methods = IMPLEMENTATION_BINDINGS[id];
  if (!methods) {
    const error = new Error(`No common-input method binding exists for ${id}.`);
    error.code = 'COMMON_INPUT_IMPLEMENTATION_BINDING_REQUIRED';
    throw error;
  }
  return methods;
}

export function commonMethodsForEmpiricalMethod(empiricalMethodId) {
  return commonMethodsForImplementation(empiricalMethodId);
}

export function createCommonInputBoundMethodAuthorization(input) {
  if (!isRecord(input)) throw new TypeError('Method authorization input must be an object.');
  const commonInput = requireCommonEnrichedPipingInput(input.commonInput);
  const implementationId = requiredText(
    input.implementationId || input.empiricalMethodId,
    'implementationId',
  );
  const requiredCommonMethodIds = commonMethodsForImplementation(implementationId);
  assertMethodsSealed(commonInput, requiredCommonMethodIds);
  const implementationBindings = normalizeImplementationBindings(
    input.implementationBindings,
    implementationId,
    requiredCommonMethodIds,
  );
  const engineeringFoundationHandoff = requireFoundationHandoff(
    input.engineeringFoundationHandoff,
    implementationId,
    commonInput,
  );
  const implementationBindingSemanticHash = semanticHash({ implementationId, implementationBindings });
  const authorityRevisionVector = createNonFeaAuthorityRevisionVector(commonInput);
  const base = {
    schema: NON_FEA_METHOD_CONSUMPTION_SCHEMAS.AUTHORIZATION,
    authorizationId: requiredText(input.authorizationId, 'authorizationId'),
    authorizedAt: canonicalTimestamp(input.authorizedAt, 'authorizedAt'),
    implementationId,
    empiricalMethodId: implementationId,
    implementationBindings,
    implementationBindingSemanticHash,
    analysisPlanSemanticHash: nullableSemanticHash(input.analysisPlanSemanticHash, 'analysisPlanSemanticHash'),
    scenarioId: requiredText(input.scenarioId, 'scenarioId'),
    methodRequestSemanticHash: requiredSemanticHash(input.methodRequestSemanticHash, 'methodRequestSemanticHash'),
    commonInputSemanticHash: commonInput.semanticHash,
    commonInputPackageState: commonInput.packageState,
    commonInputSealSemanticHash: commonInput.seal.semanticHash,
    requiredCommonMethodIds,
    qualificationProfileSemanticHash: commonInput.qualificationProfileSemanticHash,
    authorityRevisionVector,
    authorityRevisionVectorSemanticHash: authorityRevisionVector.semanticHash,
    engineeringFoundationHandoff,
    engineeringFoundationHandoffSemanticHash: engineeringFoundationHandoff.semanticHash,
    engineeringFoundationSemanticHash: engineeringFoundationHandoff.engineeringFoundationSemanticHash,
    engineeringFoundationCapabilityBindingSemanticHash:
      engineeringFoundationHandoff.capabilityBindingSemanticHash,
    requiredEngineeringFoundationCapabilityIds:
      engineeringFoundationHandoff.requiredCapabilityIds,
    policy: {
      explicitAuthorization: true,
      commonInputRequired: true,
      engineeringFoundationRequired: true,
      qualifiedImplementationRequired: true,
      geometryMutationPermitted: false,
      autoExecution: false,
    },
  };
  return requireCommonInputBoundMethodAuthorization({ ...base, semanticHash: semanticHash(base) });
}

export function requireCommonInputBoundMethodAuthorization(value) {
  if (!isRecord(value) || value.schema !== NON_FEA_METHOD_CONSUMPTION_SCHEMAS.AUTHORIZATION) {
    throw new TypeError(`Expected ${NON_FEA_METHOD_CONSUMPTION_SCHEMAS.AUTHORIZATION}.`);
  }
  assertReceiptHash(value, 'Method authorization receipt hash is stale.', 'METHOD_AUTHORIZATION_HASH_MISMATCH');
  if (value.implementationId !== value.empiricalMethodId) {
    throw codedError('Compatibility method identity differs from implementation identity.', 'METHOD_IMPLEMENTATION_IDENTITY_MISMATCH');
  }
  commonMethodsForImplementation(value.implementationId);
  requireReceiptFoundationFields(value);
  return deepFreeze(value);
}

export function createCommonInputBoundMethodExecution(input) {
  if (!isRecord(input)) throw new TypeError('Method execution input must be an object.');
  const authorization = requireCommonInputBoundMethodAuthorization(input.authorization);
  const commonInput = requireCommonEnrichedPipingInput(input.commonInput);
  const engineeringFoundationHandoff = requireFoundationHandoff(
    input.engineeringFoundationHandoff,
    authorization.implementationId,
    commonInput,
  );
  const freshness = assessMethodConsumptionStaleness(
    authorization,
    commonInput,
    engineeringFoundationHandoff,
  );
  if (freshness.stale) {
    const error = codedError(
      'Method authorization is stale against the current engineering authority.',
      'METHOD_EXECUTION_AUTHORIZATION_STALE',
    );
    error.details = freshness;
    throw error;
  }
  assertMethodsSealed(commonInput, authorization.requiredCommonMethodIds);
  const authorityRevisionVector = createNonFeaAuthorityRevisionVector(commonInput);
  const base = {
    schema: NON_FEA_METHOD_CONSUMPTION_SCHEMAS.EXECUTION,
    executionId: requiredText(input.executionId, 'executionId'),
    executedAt: canonicalTimestamp(input.executedAt, 'executedAt'),
    authorizationId: authorization.authorizationId,
    authorizationSemanticHash: authorization.semanticHash,
    implementationId: authorization.implementationId,
    empiricalMethodId: authorization.implementationId,
    implementationBindings: authorization.implementationBindings,
    implementationBindingSemanticHash: authorization.implementationBindingSemanticHash,
    analysisPlanSemanticHash: authorization.analysisPlanSemanticHash,
    scenarioId: authorization.scenarioId,
    commonInputSemanticHash: commonInput.semanticHash,
    requiredCommonMethodIds: authorization.requiredCommonMethodIds,
    authorityRevisionVector,
    authorityRevisionVectorSemanticHash: authorityRevisionVector.semanticHash,
    engineeringFoundationHandoff,
    engineeringFoundationHandoffSemanticHash: engineeringFoundationHandoff.semanticHash,
    engineeringFoundationSemanticHash: engineeringFoundationHandoff.engineeringFoundationSemanticHash,
    engineeringFoundationCapabilityBindingSemanticHash:
      engineeringFoundationHandoff.capabilityBindingSemanticHash,
    requiredEngineeringFoundationCapabilityIds:
      engineeringFoundationHandoff.requiredCapabilityIds,
    engineExecutionSemanticHash: requiredSemanticHash(input.engineExecutionSemanticHash, 'engineExecutionSemanticHash'),
    resultSemanticHash: nullableSemanticHash(input.resultSemanticHash, 'resultSemanticHash'),
    status: requiredText(input.status, 'status'),
  };
  return requireCommonInputBoundMethodExecution({ ...base, semanticHash: semanticHash(base) });
}

export function requireCommonInputBoundMethodExecution(value) {
  if (!isRecord(value) || value.schema !== NON_FEA_METHOD_CONSUMPTION_SCHEMAS.EXECUTION) {
    throw new TypeError(`Expected ${NON_FEA_METHOD_CONSUMPTION_SCHEMAS.EXECUTION}.`);
  }
  assertReceiptHash(value, 'Method execution receipt hash is stale.', 'METHOD_EXECUTION_HASH_MISMATCH');
  if (value.implementationId !== value.empiricalMethodId) {
    throw codedError('Compatibility method identity differs from implementation identity.', 'METHOD_IMPLEMENTATION_IDENTITY_MISMATCH');
  }
  requireReceiptFoundationFields(value);
  return deepFreeze(value);
}

export function assessMethodConsumptionStaleness(
  value,
  currentCommonInput,
  currentEngineeringFoundationHandoff = null,
) {
  const receipt = value.schema === NON_FEA_METHOD_CONSUMPTION_SCHEMAS.AUTHORIZATION
    ? requireCommonInputBoundMethodAuthorization(value)
    : requireCommonInputBoundMethodExecution(value);
  const commonInput = requireCommonEnrichedPipingInput(currentCommonInput);
  const currentRevisionVector = createNonFeaAuthorityRevisionVector(commonInput);
  const revision = assessNonFeaAuthorityRevisionStaleness(
    receipt.authorityRevisionVector,
    currentRevisionVector,
  );
  const changes = [...revision.changes];
  if (receipt.commonInputSemanticHash !== commonInput.semanticHash) {
    changes.push(change(
      'METHOD_COMMON_INPUT_RESEALED',
      'commonInputSemanticHash',
      receipt.commonInputSemanticHash,
      commonInput.semanticHash,
    ));
  }
  const missing = receipt.requiredCommonMethodIds
    .filter((methodId) => !commonInput.sealedMethodIds.includes(methodId));
  missing.forEach((methodId) => changes.push(change(
    'METHOD_NO_LONGER_SEALED',
    `sealedMethodIds.${methodId}`,
    'SEALED',
    'BLOCKED',
  )));

  let currentHandoff = null;
  if (currentEngineeringFoundationHandoff) {
    currentHandoff = requireFoundationHandoff(
      currentEngineeringFoundationHandoff,
      receipt.implementationId,
      commonInput,
    );
  } else {
    changes.push(change(
      'METHOD_ENGINEERING_FOUNDATION_UNAVAILABLE',
      'engineeringFoundationHandoff',
      receipt.engineeringFoundationCapabilityBindingSemanticHash,
      null,
    ));
  }
  if (currentHandoff
      && currentHandoff.capabilityBindingSemanticHash
        !== receipt.engineeringFoundationCapabilityBindingSemanticHash) {
    changes.push(change(
      'METHOD_ENGINEERING_FOUNDATION_CHANGED',
      'engineeringFoundationCapabilityBindingSemanticHash',
      receipt.engineeringFoundationCapabilityBindingSemanticHash,
      currentHandoff.capabilityBindingSemanticHash,
    ));
  }

  const unique = uniqueChanges(changes);
  const base = {
    schema: NON_FEA_METHOD_CONSUMPTION_SCHEMAS.STALENESS,
    receiptSemanticHash: receipt.semanticHash,
    expectedAuthorityRevisionVectorSemanticHash: receipt.authorityRevisionVectorSemanticHash,
    currentAuthorityRevisionVectorSemanticHash: currentRevisionVector.semanticHash,
    currentCommonInputSemanticHash: commonInput.semanticHash,
    expectedEngineeringFoundationCapabilityBindingSemanticHash:
      receipt.engineeringFoundationCapabilityBindingSemanticHash,
    currentEngineeringFoundationCapabilityBindingSemanticHash:
      currentHandoff?.capabilityBindingSemanticHash || null,
    stale: unique.length > 0,
    changes: unique,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function requireFoundationHandoff(value, implementationId, commonInput) {
  const handoff = requireNonFeaEngineeringFoundationHandoff(value);
  if (handoff.implementationId !== implementationId) {
    throw codedError(
      'Engineering Foundation handoff belongs to a different implementation.',
      'METHOD_ENGINEERING_FOUNDATION_IMPLEMENTATION_MISMATCH',
    );
  }
  if (handoff.commonInputSemanticHash !== commonInput.semanticHash) {
    throw codedError(
      'Engineering Foundation handoff belongs to a different common input.',
      'METHOD_ENGINEERING_FOUNDATION_COMMON_INPUT_MISMATCH',
    );
  }
  return handoff;
}

function requireReceiptFoundationFields(value) {
  const handoff = requireNonFeaEngineeringFoundationHandoff(value.engineeringFoundationHandoff);
  if (handoff.implementationId !== value.implementationId
      || handoff.semanticHash !== value.engineeringFoundationHandoffSemanticHash
      || handoff.engineeringFoundationSemanticHash !== value.engineeringFoundationSemanticHash
      || handoff.capabilityBindingSemanticHash
        !== value.engineeringFoundationCapabilityBindingSemanticHash
      || JSON.stringify(handoff.requiredCapabilityIds)
        !== JSON.stringify(value.requiredEngineeringFoundationCapabilityIds)) {
    throw codedError(
      'Method receipt Engineering Foundation binding is inconsistent.',
      'METHOD_ENGINEERING_FOUNDATION_RECEIPT_BINDING_MISMATCH',
    );
  }
  return handoff;
}

function normalizeImplementationBindings(values, implementationId, requiredCommonMethodIds) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError('implementationBindings must be a non-empty array.');
  }
  const bindings = values.map(requireNonFeaImplementationBinding)
    .sort((left, right) => ascii(left.commonMethodId, right.commonMethodId));
  const wrongImplementation = bindings.find((row) => row.implementationId !== implementationId);
  if (wrongImplementation) {
    throw codedError('Implementation binding belongs to a different implementation.', 'METHOD_IMPLEMENTATION_BINDING_MISMATCH');
  }
  const boundMethods = bindings.map((row) => row.commonMethodId);
  const expected = [...requiredCommonMethodIds].sort(ascii);
  if (JSON.stringify(boundMethods) !== JSON.stringify(expected)) {
    throw codedError('Implementation bindings do not cover the exact required common methods.', 'METHOD_IMPLEMENTATION_BINDING_COVERAGE_MISMATCH');
  }
  return deepFreeze(bindings);
}

function assertMethodsSealed(commonInput, requiredMethods) {
  const missing = requiredMethods.filter((methodId) => !commonInput.sealedMethodIds.includes(methodId));
  if (missing.length) {
    const error = codedError(`Common input is not sealed for ${missing.join(', ')}.`, 'COMMON_INPUT_METHOD_NOT_READY');
    error.details = deepFreeze({ requiredMethods, sealedMethods: commonInput.sealedMethodIds, missing });
    throw error;
  }
}
function assertReceiptHash(value, message, code) {
  const base = { ...value };
  delete base.semanticHash;
  if (semanticHash(base) !== value.semanticHash) throw codedError(message, code);
}
function uniqueChanges(rows) {
  const byKey = new Map();
  rows.forEach((row) => {
    const key = `${row.code}|${row.path}|${JSON.stringify(row.expected)}|${JSON.stringify(row.actual)}`;
    if (!byKey.has(key)) byKey.set(key, structuredClone(row));
  });
  return [...byKey.values()]
    .sort((left, right) => ascii(`${left.code}|${left.path}`, `${right.code}|${right.path}`));
}
function change(code, path, expected, actual) { return { code, path, expected, actual }; }
function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || !value) throw new TypeError(`${label} must be a non-empty trimmed string.`);
  return value;
}
function canonicalTimestamp(value, label) {
  const text = requiredText(value, label);
  if (new Date(text).toISOString() !== text) throw new TypeError(`${label} must be a canonical ISO-8601 timestamp.`);
  return text;
}
function requiredSemanticHash(value, label) {
  const text = requiredText(value, label);
  if (!/^fnv1a64:[0-9a-f]{16}$/u.test(text)) throw new TypeError(`${label} must be an FNV-1a semantic hash.`);
  return text;
}
function nullableSemanticHash(value, label) {
  if (value === null || value === undefined || value === '') return null;
  return requiredSemanticHash(value, label);
}
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function codedError(message, code) { const error = new Error(message); error.code = code; return error; }
