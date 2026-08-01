import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { createValidatedLafeaAnalyticalHandoff } from '../lafea-analytical-handoff.js';
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

export function evaluateLocalAttachmentScreeningProduct(input) {
  const request = normalizeRequest(input);
  const expected = expectedLocations(request.screeningResult);
  const supplied = new Map(request.applicabilityEvidence.map((row) => [key(row), row]));
  const assessments = expected.map((location) => {
    const evidence = supplied.get(key(location));
    return evidence ? assessEvidence(evidence) : missingEvidence(location);
  });
  const overallState = assessments.some((row) => row.state === 'BLOCKED')
    ? 'BLOCKED'
    : assessments.some((row) => row.state === 'ESCALATE') ? 'ESCALATE' : 'PASS';
  const base = {
    schema: SCREENING_PRODUCT_RESULT_SCHEMA,
    assessmentIdentity: request.assessmentIdentity,
    assessmentVersion: request.assessmentVersion,
    sourceAuthority: {
      screeningRequestSemanticHash:
        request.screeningResult.semanticHashes.screeningRequestSemanticHash,
      screeningResultPayloadSemanticHash:
        request.screeningResult.semanticHashes.screeningResultPayloadSemanticHash,
    },
    assessments,
    overallState,
    qualification: {
      state: 'ACCEPTED',
      engineeringLevel: 'NOMINAL_SCREENING_APPLICABILITY_AND_ESCALATION_ONLY',
      codeAssessmentProduced: false,
      releaseQualified: false,
    },
    limitations: mergedLimitations(request.limitations),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateLocalAttachmentScreeningProduct(input) {
  if (!isRecord(input) || input.schema !== SCREENING_PRODUCT_RESULT_SCHEMA) {
    throw productError('SCREENING_PRODUCT_SCHEMA_MISMATCH', 'schema');
  }
  const copy = structuredClone(input);
  const retained = copy.semanticHash;
  delete copy.semanticHash;
  if (retained !== semanticHash(copy)) {
    throw productError('SCREENING_PRODUCT_HASH_MISMATCH', 'semanticHash');
  }
  if (!SCREENING_PRODUCT_STATES.includes(copy.overallState)
    || copy.qualification?.codeAssessmentProduced !== false
    || copy.qualification?.releaseQualified !== false) {
    throw productError('SCREENING_PRODUCT_AUTHORITY_INVALID', 'qualification');
  }
  return deepFreeze({ ...copy, semanticHash: retained });
}

export function createLocalAttachmentScreeningHandoff(input) {
  const row = exactRecord(input, [
    'handoffIdentity', 'handoffVersion', 'screeningResult', 'productResult',
    'screeningCaseId', 'evaluationLocationId', 'targetStageId', 'targetSource',
    'targetLoadBindings', 'sourceReference', 'limitations',
  ], 'handoff');
  const screeningResult = validateScreeningResult(row.screeningResult);
  const productResult = validateLocalAttachmentScreeningProduct(row.productResult);
  if (productResult.sourceAuthority.screeningResultPayloadSemanticHash
    !== screeningResult.semanticHashes.screeningResultPayloadSemanticHash) {
    throw productError('SCREENING_HANDOFF_PARENT_MISMATCH', 'productResult.sourceAuthority');
  }
  const assessment = productResult.assessments.find((candidate) => (
    candidate.screeningCaseId === row.screeningCaseId
    && candidate.evaluationLocationId === row.evaluationLocationId
  ));
  if (!assessment || assessment.state !== 'ESCALATE') {
    throw productError('SCREENING_HANDOFF_ESCALATION_REQUIRED', 'productResult.assessments');
  }
  const caseResult = screeningResult.screeningCases.find(
    (candidate) => candidate.screeningCaseId === row.screeningCaseId,
  );
  if (!caseResult) throw productError('SCREENING_HANDOFF_CASE_MISSING', 'screeningCaseId');
  const referencePoint = commonTargetPoint(screeningResult, caseResult);
  return createValidatedLafeaAnalyticalHandoff({
    handoffIdentity: row.handoffIdentity,
    handoffVersion: row.handoffVersion,
    sourceStageId: 'LAFEA.2',
    sourceResultHash: screeningResult.semanticHashes.screeningResultPayloadSemanticHash,
    governingRecord: {
      screeningCaseId: assessment.screeningCaseId,
      evaluationLocationId: assessment.evaluationLocationId,
      productState: assessment.state,
      reasons: assessment.reasons,
    },
    resultant: {
      coordinateSystem: 'PIPE_LOCAL',
      referencePoint,
      force: caseResult.combinedForceLocal,
      moment: caseResult.combinedMomentLocal,
    },
    targetStageId: row.targetStageId,
    targetSource: row.targetSource,
    targetLoadBindings: row.targetLoadBindings,
    sourceReference: row.sourceReference,
    limitations: row.limitations,
  });
}

function normalizeRequest(input) {
  const row = exactRecord(input, [
    'schema', 'assessmentIdentity', 'assessmentVersion', 'screeningResult',
    'applicabilityEvidence', 'limitations',
  ], 'request');
  if (row.schema !== SCREENING_PRODUCT_REQUEST_SCHEMA) {
    throw productError('SCREENING_PRODUCT_REQUEST_SCHEMA_MISMATCH', 'schema');
  }
  const screeningResult = validateScreeningResult(row.screeningResult);
  const applicabilityEvidence = normalizeEvidence(row.applicabilityEvidence);
  const expected = new Set(expectedLocations(screeningResult).map(key));
  for (const evidence of applicabilityEvidence) {
    if (!expected.has(key(evidence))) {
      throw productError('SCREENING_APPLICABILITY_LOCATION_UNKNOWN', key(evidence));
    }
  }
  return deepFreeze({
    schema: row.schema,
    assessmentIdentity: text(row.assessmentIdentity, 'assessmentIdentity'),
    assessmentVersion: text(row.assessmentVersion, 'assessmentVersion'),
    screeningResult,
    applicabilityEvidence,
    limitations: stringArray(row.limitations, 'limitations'),
  });
}

function validateScreeningResult(result) {
  if (!isRecord(result) || result.schema !== RESULT_SCHEMA
    || result.qualification?.state !== 'ACCEPTED') {
    throw productError('SCREENING_RESULT_NOT_ACCEPTED', 'screeningResult');
  }
  const reconstructed = reconstructScreeningResultHashes(result, null);
  for (const [hashKey, value] of Object.entries(reconstructed)) {
    if (result.semanticHashes?.[hashKey] !== value) {
      throw productError('SCREENING_RESULT_HASH_MISMATCH', `screeningResult.semanticHashes.${hashKey}`);
    }
  }
  return deepFreeze(structuredClone(result));
}

function normalizeEvidence(values) {
  if (!Array.isArray(values)) {
    throw productError('SCREENING_APPLICABILITY_ARRAY_REQUIRED', 'applicabilityEvidence');
  }
  const rows = values.map((value, index) => {
    const path = `applicabilityEvidence[${index}]`;
    const row = exactRecord(value,
      ['screeningCaseId', 'evaluationLocationId', 'checks'], path);
    return {
      screeningCaseId: text(row.screeningCaseId, `${path}.screeningCaseId`),
      evaluationLocationId: text(row.evaluationLocationId, `${path}.evaluationLocationId`),
      checks: normalizeChecks(row.checks, `${path}.checks`),
    };
  }).sort(compareEvidence);
  if (new Set(rows.map(key)).size !== rows.length) {
    throw productError('DUPLICATE_SCREENING_APPLICABILITY_EVIDENCE', 'applicabilityEvidence');
  }
  return rows;
}

function normalizeChecks(values, path) {
  if (!Array.isArray(values)) throw productError('SCREENING_CHECK_ARRAY_REQUIRED', path);
  const rows = values.map((value, index) => {
    const checkPath = `${path}[${index}]`;
    const row = exactRecord(value,
      ['checkId', 'kind', 'status', 'rationale', 'sourceReference'], checkPath);
    return {
      checkId: text(row.checkId, `${checkPath}.checkId`),
      kind: member(row.kind, SCREENING_APPLICABILITY_KINDS, `${checkPath}.kind`),
      status: member(row.status, SCREENING_APPLICABILITY_STATUSES, `${checkPath}.status`),
      rationale: text(row.rationale, `${checkPath}.rationale`),
      sourceReference: text(row.sourceReference, `${checkPath}.sourceReference`),
    };
  }).sort((left, right) => left.kind.localeCompare(right.kind));
  if (new Set(rows.map((row) => row.kind)).size !== rows.length) {
    throw productError('DUPLICATE_SCREENING_APPLICABILITY_KIND', path);
  }
  return rows;
}

function assessEvidence(evidence) {
  const byKind = new Map(evidence.checks.map((check) => [check.kind, check]));
  const missing = SCREENING_APPLICABILITY_KINDS.filter((kind) => !byKind.has(kind));
  const unresolved = evidence.checks.filter((check) => check.status === 'UNRESOLVED');
  const failed = evidence.checks.filter((check) => check.status === 'FAIL');
  const state = missing.length || unresolved.length ? 'BLOCKED'
    : failed.length ? 'ESCALATE' : 'PASS';
  const reasons = [
    ...missing.map((kind) => `MISSING:${kind}`),
    ...unresolved.map((check) => `UNRESOLVED:${check.kind}`),
    ...failed.map((check) => `FAILED:${check.kind}`),
  ].sort();
  return {
    screeningCaseId: evidence.screeningCaseId,
    evaluationLocationId: evidence.evaluationLocationId,
    state,
    reasons: reasons.length ? reasons : ['ALL_APPLICABILITY_CHECKS_PASS'],
    checks: evidence.checks,
  };
}

function missingEvidence(location) {
  return {
    ...location,
    state: 'BLOCKED',
    reasons: ['MISSING_APPLICABILITY_EVIDENCE'],
    checks: [],
  };
}

function expectedLocations(result) {
  return result.pointStressStates.map((row) => ({
    screeningCaseId: row.screeningCaseId,
    evaluationLocationId: row.evaluationLocationId,
  })).sort(compareEvidence);
}

function commonTargetPoint(result, caseResult) {
  const loadMap = new Map(result.sourceEvidence.foundationResult.transformedLoadCases
    .map((load) => [load.identity, load]));
  const points = caseResult.mechanicalTerms.map((term) => loadMap.get(term.loadCaseId)?.targetPointGlobal);
  if (!points.length || points.some((point) => !Array.isArray(point))) {
    throw productError('SCREENING_HANDOFF_REFERENCE_POINT_MISSING', 'screeningCases');
  }
  const first = points[0];
  if (points.some((point) => point.some((value, index) => value !== first[index]))) {
    throw productError('SCREENING_HANDOFF_MIXED_REFERENCE_POINTS', 'screeningCases');
  }
  return [...first];
}

function mergedLimitations(value) {
  return [...new Set([...SCREENING_PRODUCT_LIMITATIONS, ...stringArray(value, 'limitations')])].sort();
}

function exactRecord(value, keys, path) {
  if (!isRecord(value)) throw productError('SCREENING_PRODUCT_OBJECT_REQUIRED', path);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw productError('SCREENING_PRODUCT_EXACT_KEYS_REQUIRED', path);
  }
  return value;
}

function stringArray(value, path) {
  if (!Array.isArray(value)) throw productError('SCREENING_PRODUCT_STRING_ARRAY_REQUIRED', path);
  return [...new Set(value.map((row, index) => text(row, `${path}[${index}]`)))].sort();
}

function member(value, allowed, path) {
  if (!allowed.includes(value)) throw productError('SCREENING_PRODUCT_ENUM_INVALID', path);
  return value;
}

function text(value, path) {
  if (typeof value !== 'string' || !value.trim()) throw productError('SCREENING_PRODUCT_TEXT_REQUIRED', path);
  return value.trim();
}

function key(row) { return `${row.screeningCaseId}::${row.evaluationLocationId}`; }
function compareEvidence(left, right) { return key(left).localeCompare(key(right)); }
function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function productError(code, path) {
  const error = new TypeError(`${code}: ${path}`);
  error.code = code;
  error.path = path;
  return error;
}
