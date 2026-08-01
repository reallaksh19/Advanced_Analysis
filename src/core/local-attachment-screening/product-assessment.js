export const SCREENING_PRODUCT_ASSESSMENT_SCHEMA =
  'lafea-screening-product-assessment/v1';
export const SCREENING_PRODUCT_HANDOFF_SCHEMA =
  'lafea-screening-product-handoff/v1';

export const SCREENING_PRODUCT_STATES = Object.freeze([
  'PASS',
  'ESCALATE',
  'BLOCKED',
]);

export const SCREENING_LOCATION_CLASSES = Object.freeze([
  'FAR_FIELD',
  'ATTACHMENT',
  'OPENING',
  'WELD',
  'LOCAL_LOAD',
  'OTHER_DISCONTINUITY',
]);

export const SCREENING_TRANSVERSE_SHEAR_STATES = Object.freeze([
  'NOT_PRESENT',
  'SUPPORTED_BY_SCREENING_PROFILE',
  'UNSUPPORTED',
  'UNRESOLVED',
]);

export const SCREENING_PRODUCT_BENCHMARK_IDS = Object.freeze([
  'A2-ESC-01',
  'A2-ESC-02',
  'A2-ESC-03',
  'A2-ESC-04',
  'A2-HO-01',
  'A2-HO-02',
]);

const TARGET_STAGES = Object.freeze(['LAFEA.3', 'LAFEA.4', 'LAFEA.5']);
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export function createLocalAttachmentScreeningAssessment(options) {
  const result = requireAcceptedResult(options?.screeningResult);
  const governingQuantity = text(options?.governingQuantity, 'governingQuantity');
  const governingEnvelope = result.envelopes.find((row) =>
    row.quantity === governingQuantity);
  if (!governingEnvelope) {
    fail('SCREENING_GOVERNING_QUANTITY_NOT_RETAINED', 'governingQuantity',
      'The governing quantity must be retained by the screening result.');
  }
  const records = normalizeApplicabilityRecords(options?.applicabilityRecords);
  const recordMap = new Map(records.map((row) => [key(row), row]));
  const decisions = result.pointStressStates.map((point) =>
    decision(point, recordMap.get(key(point))));
  const state = decisions.reduce((current, row) =>
    severity(row.state) > severity(current) ? row.state : current, 'PASS');
  return deepFreeze({
    schema: SCREENING_PRODUCT_ASSESSMENT_SCHEMA,
    assessmentIdentity: text(options?.assessmentIdentity, 'assessmentIdentity'),
    assessmentProfileId: text(options?.assessmentProfileId, 'assessmentProfileId'),
    requestIdentity: result.requestIdentity,
    requestVersion: result.requestVersion,
    governingQuantity,
    governingEnvelope: retainedEnvelope(governingEnvelope),
    decisions,
    state,
    qualification: {
      accepted: state !== 'BLOCKED',
      engineeringLevel: 'NOMINAL_PIPE_SECTION_PRODUCT_SCREENING_ONLY',
    },
    limitations: Object.freeze([
      'NO_LOCAL_ATTACHMENT_STRESS',
      'NO_TRANSVERSE_SHEAR_RECOVERY',
      'NO_SHELL_OR_CONTINUUM_ANALYSIS',
      'NO_WELD_ANALYSIS',
      'NO_CODE_COMPLIANCE',
      'PASS_MEANS_SCREENING_APPLICABILITY_ONLY',
    ]),
  });
}

export function createLocalAttachmentScreeningHandoff(options) {
  const assessment = options?.assessment;
  if (!assessment || assessment.schema !== SCREENING_PRODUCT_ASSESSMENT_SCHEMA
    || assessment.state !== 'ESCALATE') {
    fail('SCREENING_HANDOFF_ESCALATION_REQUIRED', 'assessment',
      'Only an ESCALATE screening assessment may create a downstream handoff.');
  }
  const result = requireAcceptedResult(options?.screeningResult);
  const targetStageId = options?.targetStageId;
  if (!TARGET_STAGES.includes(targetStageId)) {
    fail('SCREENING_HANDOFF_TARGET_UNSUPPORTED', 'targetStageId',
      'Screening handoff target must be LAFEA.3, LAFEA.4 or LAFEA.5.');
  }
  const governing = assessment.governingEnvelope;
  const caseEvidence = result.screeningCases.find((row) =>
    row.screeningCaseId === governing.screeningCaseId);
  if (!caseEvidence) {
    fail('SCREENING_HANDOFF_GOVERNING_CASE_MISSING', 'screeningResult',
      'The governing screening case is not retained.');
  }
  return deepFreeze({
    schema: SCREENING_PRODUCT_HANDOFF_SCHEMA,
    handoffIdentity: text(options?.handoffIdentity, 'handoffIdentity'),
    sourceStageId: 'LAFEA.2',
    targetStageId,
    targetSourceHash: sha256(options?.targetSourceHash, 'targetSourceHash'),
    assessmentIdentity: assessment.assessmentIdentity,
    governingQuantity: assessment.governingQuantity,
    governingCase: governing.screeningCaseId,
    governingLocation: governing.evaluationLocationId,
    geometryBasis: {
      radius: governing.radius,
      angle: governing.angle,
    },
    resultants: {
      forceLocal: caseEvidence.combinedForceLocal,
      momentLocal: caseEvidence.combinedMomentLocal,
    },
    sourceReferences: Object.freeze([
      caseEvidence.sourceReference,
      ...caseEvidence.termEvidence.flatMap((row) => row.sourceReferences ?? []),
    ].filter(Boolean).sort()),
    authority: 'GOVERNING_RESULTANT_HANDOFF_ONLY',
    prohibitedInferences: Object.freeze([
      'NO_NOMINAL_STRESS_TRANSFER_AS_FE_STRESS',
      'NO_CODE_STRESS_TRANSFER',
      'NO_TARGET_MODEL_AUTOGENERATION',
    ]),
  });
}

function requireAcceptedResult(value) {
  if (!value || value.qualification?.state !== 'ACCEPTED'
    || !Array.isArray(value.pointStressStates)
    || !Array.isArray(value.envelopes)
    || !Array.isArray(value.screeningCases)) {
    fail('SCREENING_PRODUCT_RESULT_NOT_ACCEPTED', 'screeningResult',
      'A current accepted screening result is required.');
  }
  return value;
}

function normalizeApplicabilityRecords(values) {
  if (!Array.isArray(values)) {
    fail('SCREENING_APPLICABILITY_RECORDS_REQUIRED', 'applicabilityRecords',
      'applicabilityRecords must be an array.');
  }
  const records = values.map((value, index) => applicability(value, index))
    .sort((left, right) => key(left).localeCompare(key(right)));
  const keys = records.map(key);
  if (new Set(keys).size !== keys.length) {
    fail('SCREENING_APPLICABILITY_DUPLICATE', 'applicabilityRecords',
      'Applicability records must be unique by case and location.');
  }
  return records;
}

function applicability(value, index) {
  const path = `applicabilityRecords[${index}]`;
  const source = exactRecord(value, [
    'screeningCaseId', 'evaluationLocationId', 'locationClass',
    'transverseShearState', 'evidenceReferences',
  ], path);
  if (!SCREENING_LOCATION_CLASSES.includes(source.locationClass)) {
    fail('SCREENING_LOCATION_CLASS_UNSUPPORTED', `${path}.locationClass`,
      `Unsupported location class ${source.locationClass}.`);
  }
  if (!SCREENING_TRANSVERSE_SHEAR_STATES.includes(source.transverseShearState)) {
    fail('SCREENING_TRANSVERSE_SHEAR_STATE_UNSUPPORTED',
      `${path}.transverseShearState`,
      `Unsupported transverse-shear state ${source.transverseShearState}.`);
  }
  if (!Array.isArray(source.evidenceReferences)
    || source.evidenceReferences.length === 0) {
    fail('SCREENING_APPLICABILITY_EVIDENCE_REQUIRED',
      `${path}.evidenceReferences`,
      'At least one applicability evidence reference is required.');
  }
  return {
    screeningCaseId: text(source.screeningCaseId, `${path}.screeningCaseId`),
    evaluationLocationId: text(source.evaluationLocationId,
      `${path}.evaluationLocationId`),
    locationClass: source.locationClass,
    transverseShearState: source.transverseShearState,
    evidenceReferences: [...new Set(source.evidenceReferences.map((row, refIndex) =>
      text(row, `${path}.evidenceReferences[${refIndex}]`)))].sort(),
  };
}

function decision(point, applicabilityRecord) {
  if (!applicabilityRecord) {
    return {
      screeningCaseId: point.screeningCaseId,
      evaluationLocationId: point.evaluationLocationId,
      state: 'BLOCKED',
      rationaleCodes: ['MISSING_APPLICABILITY_EVIDENCE'],
      applicability: null,
    };
  }
  const rationaleCodes = [];
  let state = 'PASS';
  if (applicabilityRecord.transverseShearState === 'UNRESOLVED') {
    state = 'BLOCKED';
    rationaleCodes.push('TRANSVERSE_SHEAR_UNRESOLVED');
  } else if (applicabilityRecord.transverseShearState === 'UNSUPPORTED') {
    state = 'ESCALATE';
    rationaleCodes.push('TRANSVERSE_SHEAR_UNSUPPORTED');
  }
  if (applicabilityRecord.locationClass !== 'FAR_FIELD' && state !== 'BLOCKED') {
    state = 'ESCALATE';
    rationaleCodes.push(`LOCATION_${applicabilityRecord.locationClass}`);
  }
  if (state === 'PASS') rationaleCodes.push('CLEAR_FAR_FIELD_SECTION');
  return {
    screeningCaseId: point.screeningCaseId,
    evaluationLocationId: point.evaluationLocationId,
    state,
    rationaleCodes: rationaleCodes.sort(),
    applicability: applicabilityRecord,
  };
}

function retainedEnvelope(value) {
  return {
    quantity: value.quantity,
    value: value.value,
    screeningCaseId: value.screeningCaseId,
    evaluationLocationId: value.evaluationLocationId,
    radius: value.radius,
    angle: value.angle,
    tieBreakRule: value.tieBreakRule,
  };
}

function severity(value) {
  return SCREENING_PRODUCT_STATES.indexOf(value);
}
function key(value) {
  return `${value.screeningCaseId}\0${value.evaluationLocationId}`;
}
function exactRecord(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('SCREENING_PRODUCT_RECORD_REQUIRED', path, `${path} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((row, index) => row !== expected[index])) {
    fail('SCREENING_PRODUCT_KEYS_INVALID', path,
      `${path} keys must be exactly ${expected.join(', ')}.`);
  }
  return structuredClone(value);
}
function sha256(value, path) {
  const result = text(value, path);
  if (!HASH_PATTERN.test(result)) {
    fail('SCREENING_PRODUCT_SHA256_REQUIRED', path,
      `${path} must be a canonical SHA-256 identity.`);
  }
  return result;
}
function text(value, path) {
  if (typeof value !== 'string' || !value.trim()) {
    fail('SCREENING_PRODUCT_TEXT_REQUIRED', path, `${path} is required.`);
  }
  return value.trim();
}
function fail(code, path, message) {
  const error = new TypeError(message);
  error.code = code;
  error.path = path;
  throw error;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
