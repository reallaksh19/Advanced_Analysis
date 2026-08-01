import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { RESULT_SCHEMA } from './constants.js';
import { reconstructScreeningResultHashes } from './result-hashes.js';

export const SCREENING_PRODUCT_REQUEST_SCHEMA =
  'lafea-pipe-section-screening-product-request/v1';
export const SCREENING_PRODUCT_RESULT_SCHEMA =
  'lafea-pipe-section-screening-product-result/v1';
export const SCREENING_PRODUCT_STATES = Object.freeze([
  'PASS', 'ESCALATE', 'BLOCKED',
]);
export const SCREENING_APPLICABILITY_STATUSES = Object.freeze([
  'PASS', 'FAIL', 'UNRESOLVED',
]);
export const SCREENING_APPLICABILITY_KINDS = Object.freeze([
  'FAR_FIELD_LOCATION',
  'ATTACHMENT_EDGE',
  'OPENING',
  'WELD',
  'LOCAL_LOAD',
  'TRANSVERSE_SHEAR',
  'CONFIGURED_THRESHOLD',
]);
export const SCREENING_PRODUCT_LIMITATIONS = Object.freeze([
  'NOMINAL_PIPE_SECTION_SCREENING_ONLY',
  'NO_LOCAL_ATTACHMENT_STRESS',
  'NO_FE_OR_CODE_STRESS_TRANSFER',
  'NO_MATERIAL_ALLOWABLE_OR_CODE_UTILIZATION',
]);

export function normalizeScreeningProductRequest(input) {
  const row = exactScreeningProductRecord(input, [
    'schema', 'assessmentIdentity', 'assessmentVersion', 'screeningResult',
    'applicabilityEvidence', 'limitations',
  ], 'request');
  if (row.schema !== SCREENING_PRODUCT_REQUEST_SCHEMA) {
    throw screeningProductError('SCREENING_PRODUCT_REQUEST_SCHEMA_MISMATCH', 'schema');
  }
  const screeningResult = validateAcceptedScreeningResult(row.screeningResult);
  const applicabilityEvidence = normalizeEvidence(row.applicabilityEvidence);
  const expected = new Set(screeningProductExpectedLocations(screeningResult)
    .map(screeningProductLocationKey));
  for (const evidence of applicabilityEvidence) {
    if (!expected.has(screeningProductLocationKey(evidence))) {
      throw screeningProductError(
        'SCREENING_APPLICABILITY_LOCATION_UNKNOWN',
        screeningProductLocationKey(evidence),
      );
    }
  }
  return deepFreeze({
    schema: row.schema,
    assessmentIdentity: screeningProductText(
      row.assessmentIdentity,
      'assessmentIdentity',
    ),
    assessmentVersion: screeningProductText(
      row.assessmentVersion,
      'assessmentVersion',
    ),
    screeningResult,
    applicabilityEvidence,
    limitations: screeningProductStringArray(row.limitations, 'limitations'),
  });
}

export function validateLocalAttachmentScreeningProduct(input) {
  if (!isRecord(input) || input.schema !== SCREENING_PRODUCT_RESULT_SCHEMA) {
    throw screeningProductError('SCREENING_PRODUCT_SCHEMA_MISMATCH', 'schema');
  }
  const copy = structuredClone(input);
  const retained = copy.semanticHash;
  delete copy.semanticHash;
  if (retained !== semanticHash(copy)) {
    throw screeningProductError('SCREENING_PRODUCT_HASH_MISMATCH', 'semanticHash');
  }
  if (!SCREENING_PRODUCT_STATES.includes(copy.overallState)
    || copy.qualification?.codeAssessmentProduced !== false
    || copy.qualification?.releaseQualified !== false) {
    throw screeningProductError(
      'SCREENING_PRODUCT_AUTHORITY_INVALID',
      'qualification',
    );
  }
  return deepFreeze({ ...copy, semanticHash: retained });
}

export function validateAcceptedScreeningResult(result) {
  if (!isRecord(result) || result.schema !== RESULT_SCHEMA
    || result.qualification?.state !== 'ACCEPTED') {
    throw screeningProductError('SCREENING_RESULT_NOT_ACCEPTED', 'screeningResult');
  }
  const reconstructed = reconstructScreeningResultHashes(result, null);
  for (const [hashKey, value] of Object.entries(reconstructed)) {
    if (result.semanticHashes?.[hashKey] !== value) {
      throw screeningProductError(
        'SCREENING_RESULT_HASH_MISMATCH',
        `screeningResult.semanticHashes.${hashKey}`,
      );
    }
  }
  return deepFreeze(structuredClone(result));
}

export function screeningProductExpectedLocations(result) {
  return result.pointStressStates.map((row) => ({
    screeningCaseId: row.screeningCaseId,
    evaluationLocationId: row.evaluationLocationId,
  })).sort(compareEvidence);
}

export function screeningProductLocationKey(row) {
  return `${row.screeningCaseId}::${row.evaluationLocationId}`;
}

export function mergedScreeningProductLimitations(value) {
  return [...new Set([
    ...SCREENING_PRODUCT_LIMITATIONS,
    ...screeningProductStringArray(value, 'limitations'),
  ])].sort();
}

export function exactScreeningProductRecord(value, keys, path) {
  if (!isRecord(value)) {
    throw screeningProductError('SCREENING_PRODUCT_OBJECT_REQUIRED', path);
  }
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw screeningProductError('SCREENING_PRODUCT_EXACT_KEYS_REQUIRED', path);
  }
  return value;
}

export function screeningProductStringArray(value, path) {
  if (!Array.isArray(value)) {
    throw screeningProductError('SCREENING_PRODUCT_STRING_ARRAY_REQUIRED', path);
  }
  return [...new Set(value.map((row, index) => screeningProductText(
    row,
    `${path}[${index}]`,
  )))].sort();
}

export function screeningProductText(value, path) {
  if (typeof value !== 'string' || !value.trim()) {
    throw screeningProductError('SCREENING_PRODUCT_TEXT_REQUIRED', path);
  }
  return value.trim();
}

export function screeningProductError(code, path) {
  const error = new TypeError(`${code}: ${path}`);
  error.code = code;
  error.path = path;
  return error;
}

function normalizeEvidence(values) {
  if (!Array.isArray(values)) {
    throw screeningProductError(
      'SCREENING_APPLICABILITY_ARRAY_REQUIRED',
      'applicabilityEvidence',
    );
  }
  const rows = values.map((value, index) => {
    const path = `applicabilityEvidence[${index}]`;
    const row = exactScreeningProductRecord(value,
      ['screeningCaseId', 'evaluationLocationId', 'checks'], path);
    return {
      screeningCaseId: screeningProductText(
        row.screeningCaseId,
        `${path}.screeningCaseId`,
      ),
      evaluationLocationId: screeningProductText(
        row.evaluationLocationId,
        `${path}.evaluationLocationId`,
      ),
      checks: normalizeChecks(row.checks, `${path}.checks`),
    };
  }).sort(compareEvidence);
  if (new Set(rows.map(screeningProductLocationKey)).size !== rows.length) {
    throw screeningProductError(
      'DUPLICATE_SCREENING_APPLICABILITY_EVIDENCE',
      'applicabilityEvidence',
    );
  }
  return rows;
}

function normalizeChecks(values, path) {
  if (!Array.isArray(values)) {
    throw screeningProductError('SCREENING_CHECK_ARRAY_REQUIRED', path);
  }
  const rows = values.map((value, index) => {
    const checkPath = `${path}[${index}]`;
    const row = exactScreeningProductRecord(value,
      ['checkId', 'kind', 'status', 'rationale', 'sourceReference'], checkPath);
    return {
      checkId: screeningProductText(row.checkId, `${checkPath}.checkId`),
      kind: member(row.kind, SCREENING_APPLICABILITY_KINDS, `${checkPath}.kind`),
      status: member(
        row.status,
        SCREENING_APPLICABILITY_STATUSES,
        `${checkPath}.status`,
      ),
      rationale: screeningProductText(
        row.rationale,
        `${checkPath}.rationale`,
      ),
      sourceReference: screeningProductText(
        row.sourceReference,
        `${checkPath}.sourceReference`,
      ),
    };
  }).sort((left, right) => left.kind.localeCompare(right.kind));
  if (new Set(rows.map((row) => row.kind)).size !== rows.length) {
    throw screeningProductError(
      'DUPLICATE_SCREENING_APPLICABILITY_KIND',
      path,
    );
  }
  return rows;
}

function member(value, allowed, path) {
  if (!allowed.includes(value)) {
    throw screeningProductError('SCREENING_PRODUCT_ENUM_INVALID', path);
  }
  return value;
}

function compareEvidence(left, right) {
  return screeningProductLocationKey(left)
    .localeCompare(screeningProductLocationKey(right));
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
