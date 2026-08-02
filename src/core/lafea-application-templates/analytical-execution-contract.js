import {
  LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  templateReleaseSha256,
} from './release-record-v2-hash.js';

export const LAFEA_TEMPLATE_EXECUTION_REQUEST_SCHEMA =
  'lafea-template-execution-request/v1';
export const LAFEA_TEMPLATE_EXECUTION_RECEIPT_SCHEMA =
  'lafea-template-execution-receipt/v1';
export const LAFEA_TEMPLATE_EXECUTION_MODE = 'CONTROLLED_TEMPLATE_PILOT';
export const LAFEA_TEMPLATE_EXECUTION_STATUSES = Object.freeze([
  'ACCEPTED', 'BLOCKED', 'FAILED',
]);
export const LAFEA_TEMPLATE_ASSESSMENT_APPLICABILITY = Object.freeze([
  'APPLICABLE', 'NOT_APPLICABLE',
]);

export const LAFEA_ANALYTICAL_EXECUTION_PILOTS = deepFreeze({
  'ALG-LOAD-REFERENCE-TRANSFER': {
    stageId: 'LAFEA.1',
    compositionRootId: 'LAFEA.COMPOSITION.ATTACHMENT_FOUNDATION/V1',
    lifecycleProfileId: 'ANALYTICAL_FOUNDATION_V1',
    productAdapterId: 'LAFEA.COMPONENT.PRODUCT.ATTACHMENT_FOUNDATION/V1',
    assessmentApplicability: 'NOT_APPLICABLE',
  },
  'ALG-PIPE-SECTION-COMBINED': {
    stageId: 'LAFEA.2',
    compositionRootId: 'LAFEA.COMPOSITION.PIPE_SECTION_SCREENING/V1',
    lifecycleProfileId: 'ANALYTICAL_SCREENING_V1',
    productAdapterId: 'LAFEA.COMPONENT.PRODUCT.PIPE_SECTION_SCREENING/V1',
    assessmentApplicability: 'APPLICABLE',
  },
});

export const LAFEA_ANALYTICAL_EXECUTION_CONTROLLER_BOUNDARY = deepFreeze({
  schema: 'lafea-template-execution-controller-boundary/v1',
  authority: 'B3_CONTRACT_ONLY_IMPLEMENTATION_WITHHELD',
  allowedTemplates: Object.keys(LAFEA_ANALYTICAL_EXECUTION_PILOTS).sort(),
  uiMay: ['SUBMIT_EXACT_REQUEST', 'DISPLAY_RECEIPT_AND_DIAGNOSTICS'],
  uiMustNot: [
    'CALL_EXECUTE_LAFEA_STAGE',
    'CALL_NUMERICAL_CORE',
    'ISSUE_SOURCE_AUTHORITY',
    'REGISTER_LIFECYCLE_EVIDENCE',
    'CREATE_PRODUCT_EVIDENCE',
    'PROMOTE_RELEASE_STATE',
  ],
  requiredControllerServices: [
    'RELEASE_RECORD_VALIDATOR',
    'TARGET_COMPATIBILITY_VALIDATOR',
    'SOURCE_AUTHORITY_SERVICE',
    'PUBLIC_STAGE_COMPOSITION_FACADE',
    'LIFECYCLE_PRODUCER_SERVICE',
    'PRODUCT_EVIDENCE_SERVICE',
  ],
  requiredSequence: [
    'VALIDATE_REQUEST',
    'REQUIRE_ENGINE_EXECUTABLE_RECORD',
    'REVALIDATE_CURRENT_TARGET_COMPATIBILITY',
    'VERIFY_IMPORTED_DOCUMENT_REVISION',
    'ISSUE_SOURCE_AUTHORITY',
    'INVOKE_CURRENT_STAGE_COMPOSITION',
    'CREATE_AND_REGISTER_LIFECYCLE_BATCH',
    'CREATE_AND_REGISTER_PRODUCT_EVIDENCE',
    'CREATE_IMMUTABLE_RECEIPT',
  ],
});

const HASH = /^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/u;
const FNV = /^fnv1a64:[0-9a-f]{16}$/u;
const REQUEST_KEYS = Object.freeze([
  'schema', 'requestId', 'executionMode', 'templateId', 'releaseRecordHash',
  'parameterSetHash', 'compilationHash', 'handoffHash',
  'compatibilityReceiptHash', 'targetStageId', 'targetCompositionRootId',
  'targetLifecycleProfileId', 'expectedProductAdapterId',
  'expectedBenchmarkManifestIds', 'importedDocumentRevisionDigest',
  'sourceAuthorityRequest', 'hashProfile', 'semanticHash',
]);
const REQUEST_CREATE_KEYS = Object.freeze(REQUEST_KEYS.filter((key) =>
  !['schema', 'hashProfile', 'semanticHash'].includes(key)));
const SOURCE_REQUEST_KEYS = Object.freeze([
  'originRef', 'expectedStageId', 'expectedDocumentRevisionDigest',
]);
const RECEIPT_KEYS = Object.freeze([
  'schema', 'receiptId', 'requestHash', 'templateId', 'targetStageId',
  'targetCompositionRootHash', 'targetLifecycleProfileHash',
  'compatibilityReceiptHash', 'sourceAuthorityHash', 'exactSourceHash',
  'importedDocumentRevisionDigest', 'stageExecutionEvidenceHash',
  'lifecycleProducerBatchHash', 'lifecycleStateHash', 'resultEvidenceHash',
  'productEvidenceHash', 'benchmarkManifestIds', 'calculationAccepted',
  'resultReady', 'assessmentApplicability', 'assessmentReady', 'codeReady',
  'status', 'releaseQualified', 'diagnostics', 'hashProfile', 'semanticHash',
  'evidenceHash',
]);
const RECEIPT_CREATE_KEYS = Object.freeze(RECEIPT_KEYS.filter((key) =>
  !['schema', 'hashProfile', 'semanticHash', 'evidenceHash'].includes(key)));

export function createTemplateExecutionRequest(input) {
  exactKeys(input, REQUEST_CREATE_KEYS, 'Execution request input');
  const request = normalizeRequest({
    schema: LAFEA_TEMPLATE_EXECUTION_REQUEST_SCHEMA,
    ...input,
    hashProfile: LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
    semanticHash: null,
  });
  const semanticHash = templateReleaseSha256(requestBasis(request));
  return deepFreeze({ ...request, semanticHash });
}

export function validateTemplateExecutionRequest(value) {
  return validate(value, () => {
    const request = normalizeRequest(value);
    if (value.semanticHash !== templateReleaseSha256(requestBasis(request))) {
      throw new TypeError('Execution request semantic hash is invalid.');
    }
  });
}

export function createTemplateExecutionReceipt(input) {
  exactKeys(input, RECEIPT_CREATE_KEYS, 'Execution receipt input');
  const receipt = normalizeReceipt({
    schema: LAFEA_TEMPLATE_EXECUTION_RECEIPT_SCHEMA,
    ...input,
    hashProfile: LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
    semanticHash: null,
    evidenceHash: null,
  });
  enforceReceiptState(receipt);
  const semanticHash = templateReleaseSha256(receiptSemanticBasis(receipt));
  const evidenceHash = templateReleaseSha256({
    schema: 'lafea-template-execution-receipt-evidence/v1',
    semanticHash,
    diagnostics: receipt.diagnostics,
  });
  return deepFreeze({ ...receipt, semanticHash, evidenceHash });
}

export function validateTemplateExecutionReceipt(value) {
  return validate(value, () => {
    const receipt = normalizeReceipt(value);
    enforceReceiptState(receipt);
    const semanticHash = templateReleaseSha256(receiptSemanticBasis(receipt));
    if (value.semanticHash !== semanticHash) {
      throw new TypeError('Execution receipt semantic hash is invalid.');
    }
    const evidenceHash = templateReleaseSha256({
      schema: 'lafea-template-execution-receipt-evidence/v1',
      semanticHash,
      diagnostics: receipt.diagnostics,
    });
    if (value.evidenceHash !== evidenceHash) {
      throw new TypeError('Execution receipt evidence hash is invalid.');
    }
  });
}

function normalizeRequest(value) {
  exactKeys(value, REQUEST_KEYS, 'Execution request');
  if (value.schema !== LAFEA_TEMPLATE_EXECUTION_REQUEST_SCHEMA
    || value.executionMode !== LAFEA_TEMPLATE_EXECUTION_MODE
    || value.hashProfile !== LAFEA_TEMPLATE_RELEASE_HASH_PROFILE) {
    throw new TypeError('Execution request schema, mode or hash profile is invalid.');
  }
  const pilot = requirePilot(value.templateId);
  text(value.requestId, 'requestId');
  for (const field of [
    'releaseRecordHash', 'parameterSetHash', 'compilationHash', 'handoffHash',
    'compatibilityReceiptHash',
  ]) hash(value[field], field);
  text(value.targetCompositionRootId, 'targetCompositionRootId');
  text(value.targetLifecycleProfileId, 'targetLifecycleProfileId');
  text(value.expectedProductAdapterId, 'expectedProductAdapterId');
  if (value.targetStageId !== pilot.stageId
    || value.targetCompositionRootId !== pilot.compositionRootId
    || value.targetLifecycleProfileId !== pilot.lifecycleProfileId
    || value.expectedProductAdapterId !== pilot.productAdapterId) {
    throw new TypeError('Execution request does not match the governed pilot binding.');
  }
  const manifests = strings(value.expectedBenchmarkManifestIds,
    'expectedBenchmarkManifestIds');
  if (!manifests.length) {
    throw new TypeError('Execution request requires benchmark bindings.');
  }
  revision(value.importedDocumentRevisionDigest,
    'importedDocumentRevisionDigest');
  exactKeys(value.sourceAuthorityRequest, SOURCE_REQUEST_KEYS,
    'sourceAuthorityRequest');
  text(value.sourceAuthorityRequest.originRef, 'sourceAuthorityRequest.originRef');
  if (value.sourceAuthorityRequest.expectedStageId !== pilot.stageId) {
    throw new TypeError('Source-authority request stage does not match the pilot.');
  }
  revision(value.sourceAuthorityRequest.expectedDocumentRevisionDigest,
    'sourceAuthorityRequest.expectedDocumentRevisionDigest');
  if (value.sourceAuthorityRequest.expectedDocumentRevisionDigest
    !== value.importedDocumentRevisionDigest) {
    throw new TypeError('Source-authority request revision is stale.');
  }
  nullableOwnHash(value.semanticHash, 'semanticHash');
  return {
    ...structuredClone(value),
    expectedBenchmarkManifestIds: manifests,
  };
}

function normalizeReceipt(value) {
  exactKeys(value, RECEIPT_KEYS, 'Execution receipt');
  if (value.schema !== LAFEA_TEMPLATE_EXECUTION_RECEIPT_SCHEMA
    || value.hashProfile !== LAFEA_TEMPLATE_RELEASE_HASH_PROFILE) {
    throw new TypeError('Execution receipt schema or hash profile is invalid.');
  }
  const pilot = requirePilot(value.templateId);
  text(value.receiptId, 'receiptId');
  hash(value.requestHash, 'requestHash');
  if (value.targetStageId !== pilot.stageId) {
    throw new TypeError('Execution receipt target stage does not match the pilot.');
  }
  for (const field of [
    'targetCompositionRootHash', 'targetLifecycleProfileHash',
    'compatibilityReceiptHash',
  ]) hash(value[field], field);
  for (const field of [
    'sourceAuthorityHash', 'exactSourceHash', 'stageExecutionEvidenceHash',
    'lifecycleProducerBatchHash', 'lifecycleStateHash', 'resultEvidenceHash',
    'productEvidenceHash',
  ]) nullableHash(value[field], field);
  revision(value.importedDocumentRevisionDigest,
    'importedDocumentRevisionDigest');
  const manifests = strings(value.benchmarkManifestIds, 'benchmarkManifestIds');
  if (!manifests.length) throw new TypeError('Execution receipt requires benchmark bindings.');
  for (const field of [
    'calculationAccepted', 'resultReady', 'assessmentReady', 'codeReady',
    'releaseQualified',
  ]) boolean(value[field], field);
  oneOf(value.assessmentApplicability,
    LAFEA_TEMPLATE_ASSESSMENT_APPLICABILITY, 'assessmentApplicability');
  oneOf(value.status, LAFEA_TEMPLATE_EXECUTION_STATUSES, 'status');
  strings(value.diagnostics, 'diagnostics');
  nullableOwnHash(value.semanticHash, 'semanticHash');
  nullableOwnHash(value.evidenceHash, 'evidenceHash');
  if (value.assessmentApplicability !== pilot.assessmentApplicability) {
    throw new TypeError('Execution receipt assessment applicability is invalid for the pilot.');
  }
  return { ...structuredClone(value), benchmarkManifestIds: manifests };
}

function enforceReceiptState(receipt) {
  if (receipt.releaseQualified) {
    throw new TypeError('Execution receipt cannot qualify release.');
  }
  if (receipt.codeReady) {
    throw new TypeError('The controlled analytical pilots do not establish CODE_READY.');
  }
  if (receipt.status === 'ACCEPTED') {
    for (const field of [
      'sourceAuthorityHash', 'exactSourceHash', 'stageExecutionEvidenceHash',
      'lifecycleProducerBatchHash', 'lifecycleStateHash', 'resultEvidenceHash',
      'productEvidenceHash',
    ]) {
      if (receipt[field] === null) throw new TypeError(`ACCEPTED receipt requires ${field}.`);
    }
    if (!receipt.calculationAccepted || !receipt.resultReady) {
      throw new TypeError('ACCEPTED receipt requires calculation and result readiness.');
    }
    const expectedAssessment = receipt.assessmentApplicability === 'APPLICABLE';
    if (receipt.assessmentReady !== expectedAssessment) {
      throw new TypeError('ACCEPTED receipt assessment readiness is inconsistent.');
    }
  }
  if (!receipt.resultReady && receipt.assessmentReady) {
    throw new TypeError('Assessment readiness requires RESULT_READY.');
  }
  if (!receipt.calculationAccepted && receipt.resultReady) {
    throw new TypeError('RESULT_READY requires calculation acceptance.');
  }
}

function requestBasis(request) {
  const value = { ...request };
  delete value.semanticHash;
  return value;
}
function receiptSemanticBasis(receipt) {
  const value = { ...receipt };
  delete value.semanticHash;
  delete value.evidenceHash;
  delete value.diagnostics;
  return value;
}
function requirePilot(templateId) {
  text(templateId, 'templateId');
  const pilot = LAFEA_ANALYTICAL_EXECUTION_PILOTS[templateId];
  if (!pilot) throw new TypeError(`Template is not an authorized analytical pilot: ${templateId}.`);
  return pilot;
}
function validate(value, callback) {
  const errors = [];
  try {
    callback();
    if (!isDeepFrozen(value)) throw new TypeError('Contract value must be deeply frozen.');
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}
function hash(value, field) {
  if (typeof value !== 'string' || !HASH.test(value)) {
    throw new TypeError(`${field} must be an engineering hash.`);
  }
  return value;
}
function nullableHash(value, field) { return value === null ? null : hash(value, field); }
function nullableOwnHash(value, field) {
  if (value === null) return null;
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(`${field} must be a SHA-256 hash.`);
  }
  return value;
}
function revision(value, field) {
  if (typeof value !== 'string' || !FNV.test(value)) {
    throw new TypeError(`${field} must be an FNV revision digest.`);
  }
  return value;
}
function text(value, field) {
  if (typeof value !== 'string' || !value) throw new TypeError(`${field} must be non-empty text.`);
  return value;
}
function boolean(value, field) {
  if (typeof value !== 'boolean') throw new TypeError(`${field} must be boolean.`);
  return value;
}
function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw new TypeError(`${field} is invalid.`);
  return value;
}
function strings(value, field) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new TypeError(`${field} must contain non-empty strings.`);
  }
  const sorted = [...value].sort();
  if (new Set(sorted).size !== sorted.length) throw new TypeError(`${field} values must be unique.`);
  return sorted;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
