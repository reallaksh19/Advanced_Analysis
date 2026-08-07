import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { requireCommonInputBoundMethodExecution } from './index.js';

export const NON_FEA_RESULT_PACKAGE_ENVELOPE_SCHEMA = 'non-fea-result-package-envelope/v1';

/**
 * Wraps one immutable method result without translating its method-specific
 * schema. The execution receipt remains authority for authorization/lineage;
 * the envelope is historical custody and indexing only.
 */
export function createNonFeaResultPackageEnvelope(input = {}) {
  const executionReceipt = requireCommonInputBoundMethodExecution(input.executionReceipt);
  if (!executionReceipt.resultSemanticHash) {
    throw codedError(
      'A result package requires an execution receipt with a result hash.',
      'NON_FEA_RESULT_PACKAGE_RESULT_HASH_REQUIRED',
    );
  }
  const engineExecution = requireArtifact(input.engineExecution, 'engineExecution');
  const resultPayload = requireArtifact(input.resultPayload, 'resultPayload');
  assertArtifactBinding(engineExecution, executionReceipt, 'engine execution');
  assertArtifactBinding(resultPayload, executionReceipt, 'result payload');
  if (engineExecution.semanticHash !== executionReceipt.engineExecutionSemanticHash) {
    throw codedError(
      'Engine execution hash differs from the execution receipt.',
      'NON_FEA_RESULT_PACKAGE_ENGINE_HASH_MISMATCH',
    );
  }
  if (resultPayload.semanticHash !== executionReceipt.resultSemanticHash) {
    throw codedError(
      'Result payload hash differs from the execution receipt.',
      'NON_FEA_RESULT_PACKAGE_RESULT_HASH_MISMATCH',
    );
  }
  if (typeof resultPayload.status === 'string' && resultPayload.status !== executionReceipt.status) {
    throw codedError(
      'Result payload status differs from the execution receipt.',
      'NON_FEA_RESULT_PACKAGE_STATUS_MISMATCH',
    );
  }

  const resultClassIds = uniqueText(input.resultClassIds, 'resultClassIds', true);
  const loadCaseIds = uniqueText(input.loadCaseIds || [], 'loadCaseIds', false);
  const limitations = uniqueText(input.limitations || [], 'limitations', false);
  const preparationBindings = normalizePreparationBindings(input.preparationBindings || []);
  const resultDescriptor = deepFreeze({
    schema: resultPayload.schema,
    semanticHash: resultPayload.semanticHash,
    status: executionReceipt.status,
    resultClassIds,
    loadCaseIds,
  });
  const base = {
    schema: NON_FEA_RESULT_PACKAGE_ENVELOPE_SCHEMA,
    packageId: requiredText(input.packageId, 'packageId'),
    packagedAt: canonicalTimestamp(input.packagedAt, 'packagedAt'),
    packageState: 'RESULT_RECORDED',
    implementationId: executionReceipt.implementationId,
    scenarioId: executionReceipt.scenarioId,
    executionId: executionReceipt.executionId,
    executedAt: executionReceipt.executedAt,
    executionReceipt,
    executionReceiptSemanticHash: executionReceipt.semanticHash,
    authorizationSemanticHash: executionReceipt.authorizationSemanticHash,
    commonInputSemanticHash: executionReceipt.commonInputSemanticHash,
    authorityRevisionVectorSemanticHash: executionReceipt.authorityRevisionVectorSemanticHash,
    engineeringFoundationHandoffSemanticHash:
      executionReceipt.engineeringFoundationHandoffSemanticHash,
    engineeringFoundationCapabilityBindingSemanticHash:
      executionReceipt.engineeringFoundationCapabilityBindingSemanticHash,
    engineExecution,
    resultPayload,
    resultDescriptor,
    preparationBindings,
    limitations,
    policy: {
      historicalEnvelope: true,
      executionReceiptAuthoritative: true,
      currentnessAssessmentRequiredBeforeReuse: true,
      enginePayloadPreservedVerbatim: true,
      resultPayloadPreservedVerbatim: true,
      resultSchemaTranslationPermitted: false,
      envelopeCalculationAuthority: false,
      envelopeAuthorizationAuthority: false,
      envelopeExecutionAuthority: false,
      geometryMutationPermitted: false,
    },
  };
  return requireNonFeaResultPackageEnvelope({ ...base, semanticHash: semanticHash(base) });
}

export function requireNonFeaResultPackageEnvelope(value) {
  if (!isRecord(value) || value.schema !== NON_FEA_RESULT_PACKAGE_ENVELOPE_SCHEMA) {
    throw new TypeError(`Expected ${NON_FEA_RESULT_PACKAGE_ENVELOPE_SCHEMA}.`);
  }
  const executionReceipt = requireCommonInputBoundMethodExecution(value.executionReceipt);
  const engineExecution = requireArtifact(value.engineExecution, 'engineExecution');
  const resultPayload = requireArtifact(value.resultPayload, 'resultPayload');
  const errors = [];
  if (value.packageState !== 'RESULT_RECORDED') {
    errors.push('Result package state must be RESULT_RECORDED.');
  }
  if (value.implementationId !== executionReceipt.implementationId
      || value.scenarioId !== executionReceipt.scenarioId
      || value.executionId !== executionReceipt.executionId
      || value.executedAt !== executionReceipt.executedAt) {
    errors.push('Result package identity differs from its execution receipt.');
  }
  if (value.executionReceiptSemanticHash !== executionReceipt.semanticHash
      || value.authorizationSemanticHash !== executionReceipt.authorizationSemanticHash
      || value.commonInputSemanticHash !== executionReceipt.commonInputSemanticHash
      || value.authorityRevisionVectorSemanticHash
        !== executionReceipt.authorityRevisionVectorSemanticHash
      || value.engineeringFoundationHandoffSemanticHash
        !== executionReceipt.engineeringFoundationHandoffSemanticHash
      || value.engineeringFoundationCapabilityBindingSemanticHash
        !== executionReceipt.engineeringFoundationCapabilityBindingSemanticHash) {
    errors.push('Result package authority lineage differs from its execution receipt.');
  }
  if (engineExecution.semanticHash !== executionReceipt.engineExecutionSemanticHash) {
    errors.push('Result package engine execution hash differs from its receipt.');
  }
  if (!executionReceipt.resultSemanticHash
      || resultPayload.semanticHash !== executionReceipt.resultSemanticHash) {
    errors.push('Result package payload hash differs from its receipt.');
  }
  try {
    assertArtifactBinding(engineExecution, executionReceipt, 'engine execution');
    assertArtifactBinding(resultPayload, executionReceipt, 'result payload');
  } catch (error) {
    errors.push(error.message);
  }
  if (typeof resultPayload.status === 'string' && resultPayload.status !== executionReceipt.status) {
    errors.push('Result package payload status differs from its receipt.');
  }
  validateResultDescriptor(value.resultDescriptor, resultPayload, executionReceipt, errors);
  validateCanonicalPreparationBindings(value.preparationBindings, errors);
  validateCanonicalTextArray(value.limitations, 'limitations', false, errors);
  const policy = value.policy || {};
  if (policy.historicalEnvelope !== true
      || policy.currentnessAssessmentRequiredBeforeReuse !== true
      || policy.resultSchemaTranslationPermitted !== false
      || policy.envelopeCalculationAuthority !== false
      || policy.envelopeAuthorizationAuthority !== false
      || policy.envelopeExecutionAuthority !== false
      || policy.geometryMutationPermitted !== false) {
    errors.push('Result package policy exceeds immutable historical custody.');
  }
  if (value.semanticHash !== semanticHash(withoutHash(value))) {
    errors.push('Result package semantic hash is invalid.');
  }
  if (errors.length) {
    const error = codedError(errors.join(' '), 'NON_FEA_RESULT_PACKAGE_INVALID');
    error.details = deepFreeze(errors);
    throw error;
  }
  return deepFreeze(value);
}

export function validateNonFeaResultPackageEnvelope(value) {
  try {
    requireNonFeaResultPackageEnvelope(value);
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({ ok: false, errors: [error.message] });
  }
}

function requireArtifact(value, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object.`);
  requiredText(value.schema, `${label}.schema`);
  const hash = requiredHash(value.semanticHash, `${label}.semanticHash`);
  if (semanticHash(withoutHash(value)) !== hash) {
    throw codedError(
      `${label} semantic hash is stale.`,
      'NON_FEA_RESULT_PACKAGE_ARTIFACT_HASH_MISMATCH',
    );
  }
  return deepFreeze(structuredClone(value));
}

function assertArtifactBinding(artifact, receipt, label) {
  if (artifact.implementationId && artifact.implementationId !== receipt.implementationId) {
    throw codedError(
      `${label} implementation differs from the execution receipt.`,
      'NON_FEA_RESULT_PACKAGE_IMPLEMENTATION_MISMATCH',
    );
  }
  if (artifact.method && artifact.method !== receipt.implementationId) {
    throw codedError(
      `${label} method differs from the execution receipt.`,
      'NON_FEA_RESULT_PACKAGE_IMPLEMENTATION_MISMATCH',
    );
  }
  if (artifact.executionId && artifact.executionId !== receipt.executionId) {
    throw codedError(
      `${label} executionId differs from the execution receipt.`,
      'NON_FEA_RESULT_PACKAGE_EXECUTION_MISMATCH',
    );
  }
  if (artifact.executedAt && artifact.executedAt !== receipt.executedAt) {
    throw codedError(
      `${label} executedAt differs from the execution receipt.`,
      'NON_FEA_RESULT_PACKAGE_EXECUTION_MISMATCH',
    );
  }
}

function validateResultDescriptor(value, payload, receipt, errors) {
  if (!isRecord(value)) return errors.push('Result package descriptor must be an object.');
  if (value.schema !== payload.schema
      || value.semanticHash !== payload.semanticHash
      || value.status !== receipt.status) {
    errors.push('Result package descriptor differs from the retained result payload.');
  }
  validateCanonicalTextArray(value.resultClassIds, 'resultClassIds', true, errors);
  validateCanonicalTextArray(value.loadCaseIds, 'loadCaseIds', false, errors);
  const payloadLoadCaseIds = payloadCaseIds(payload);
  if (payloadLoadCaseIds
      && JSON.stringify(payloadLoadCaseIds) !== JSON.stringify(value.loadCaseIds)) {
    errors.push('Result package loadCaseIds differ from the retained result payload.');
  }
}

function payloadCaseIds(payload) {
  if (!Array.isArray(payload?.loadCases)) return null;
  const ids = payload.loadCases.map((row) => (
    typeof row === 'string' ? row : row?.loadCaseId
  ));
  if (ids.some((value) => typeof value !== 'string' || !value.trim())) return null;
  return [...new Set(ids.map((value) => value.trim()))].sort(ascii);
}

function normalizePreparationBindings(rows) {
  if (!Array.isArray(rows)) throw new TypeError('preparationBindings must be an array.');
  const normalized = rows.map((row) => {
    if (!isRecord(row)) throw new TypeError('Each preparation binding must be an object.');
    return deepFreeze({
      kind: requiredText(row.kind, 'preparationBindings.kind'),
      semanticHash: requiredHash(row.semanticHash, 'preparationBindings.semanticHash'),
    });
  }).sort((left, right) => (
    ascii(`${left.kind}|${left.semanticHash}`, `${right.kind}|${right.semanticHash}`)
  ));
  const kinds = normalized.map((row) => row.kind);
  if (new Set(kinds).size !== kinds.length) {
    throw new TypeError('Preparation binding kinds must be unique.');
  }
  return deepFreeze(normalized);
}

function validateCanonicalPreparationBindings(rows, errors) {
  try {
    const normalized = normalizePreparationBindings(rows);
    if (JSON.stringify(normalized) !== JSON.stringify(rows)) {
      errors.push('Result package preparation bindings are not canonical.');
    }
  } catch (error) {
    errors.push(error.message);
  }
}

function uniqueText(values, label, requireNonEmpty) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array.`);
  const rows = [...new Set(values.map((value) => requiredText(value, label)))].sort(ascii);
  if (requireNonEmpty && rows.length === 0) {
    throw new TypeError(`${label} must contain at least one value.`);
  }
  return deepFreeze(rows);
}

function validateCanonicalTextArray(values, label, requireNonEmpty, errors) {
  try {
    const normalized = uniqueText(values, label, requireNonEmpty);
    if (JSON.stringify(normalized) !== JSON.stringify(values)) {
      errors.push(`Result package ${label} is not canonical.`);
    }
  } catch (error) {
    errors.push(error.message);
  }
}

function canonicalTimestamp(value, label) {
  const text = requiredText(value, label);
  if (new Date(text).toISOString() !== text) {
    throw new TypeError(`${label} must be a canonical ISO-8601 timestamp.`);
  }
  return text;
}
function requiredHash(value, label) {
  const text = requiredText(value, label);
  if (!/^fnv1a64:[0-9a-f]{16}$/u.test(text)) {
    throw new TypeError(`${label} must be an FNV-1a semantic hash.`);
  }
  return text;
}
function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || !value) {
    throw new TypeError(`${label} must be a non-empty trimmed string.`);
  }
  return value;
}
function withoutHash(value) {
  const copy = structuredClone(value);
  delete copy.semanticHash;
  return copy;
}
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function ascii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
