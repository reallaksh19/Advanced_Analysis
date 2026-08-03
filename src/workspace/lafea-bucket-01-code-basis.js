import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_BUCKET_01_CODE_BASIS_INPUT_SCHEMA =
  'lafea-bucket-01-code-basis-input/v1';
export const LAFEA_BUCKET_01_CODE_BASIS_PACKAGE_SCHEMA =
  'lafea-bucket-01-code-basis-package/v1';
export const LAFEA_BUCKET_01_CODE_BASIS_REVISION = 'B01-CODE-BASIS.2';

const INPUT_KEYS = Object.freeze([
  'schema', 'basisId', 'exactHeadSha', 'benchmarkId', 'target',
  'probeSpecHash', 'governingCode', 'allowable', 'stressClassification',
  'loadCombination', 'authority',
]);
const CODE_KEYS = Object.freeze([
  'organization', 'documentId', 'title', 'edition', 'addenda',
  'jurisdiction', 'sourceDocumentHash',
]);
const ALLOWABLE_KEYS = Object.freeze([
  'allowableId', 'value', 'units', 'temperature', 'temperatureUnits',
  'materialScope', 'sourceSection', 'sourceTable', 'interpolationPolicy',
]);
const CLASSIFICATION_KEYS = Object.freeze([
  'classificationId', 'method', 'sourceSection', 'locationIds',
  'stressQuantity', 'extractionAuthority', 'singularityTreatment',
]);
const COMBINATION_KEYS = Object.freeze([
  'combinationId', 'sourceSection', 'terms',
]);
const TERM_KEYS = Object.freeze(['loadCaseId', 'factor', 'role']);
const AUTHORITY_KEYS = Object.freeze([
  'approvalStatus', 'approvalId', 'authoritySource', 'issuer', 'approver',
  'approverRole', 'approvedAt', 'approvalRecordHash',
]);
const ALLOWED_INTERPOLATION = Object.freeze([
  'NONE', 'LINEAR_AUTHORIZED_BY_SOURCE',
]);
const ALLOWED_EXTRACTION = 'RETAINED_DIRECT_T6_FIXED_PROBES_AND_PATHS';
const ALLOWED_SINGULARITY = 'EXCLUDE_UNCLASSIFIED_SINGULAR_PEAKS';

export function createLafeaBucket01CodeBasis(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'code-basis input');
  if (inputValue.schema !== LAFEA_BUCKET_01_CODE_BASIS_INPUT_SCHEMA) {
    throw basisError('LAFEA_B01_CODE_BASIS_INPUT_SCHEMA_INVALID');
  }
  const basis = deepFreeze({
    basisId: text(inputValue.basisId, 'basisId'),
    exactHeadSha: gitSha(inputValue.exactHeadSha),
    benchmarkId: exactText(inputValue.benchmarkId, 'C2D-LUG-PINHOLE-01', 'benchmarkId'),
    target: exactText(inputValue.target, 'C2D-LUG-PINHOLE -> LAFEA.3', 'target'),
    probeSpecHash: sha256(inputValue.probeSpecHash, 'probeSpecHash'),
    governingCode: normalizeCode(inputValue.governingCode),
    allowable: normalizeAllowable(inputValue.allowable),
    stressClassification: normalizeClassification(inputValue.stressClassification),
    loadCombination: normalizeCombination(inputValue.loadCombination),
    authority: normalizeAuthority(inputValue.authority),
  });
  const semanticBase = {
    schema: LAFEA_BUCKET_01_CODE_BASIS_PACKAGE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CODE_BASIS_REVISION,
    ...basis,
    status: 'CODE_BASIS_FROZEN',
    authorityBoundary: {
      codeBasisFrozen: true,
      externalEngineeringApprovalRequired: true,
      codeAssessmentPerformed: false,
      codeVerified: false,
      reportAuthority: false,
      releaseQualified: false,
      bucketQualified: false,
    },
  };
  const semanticHash = canonicalLafeaSha256(semanticBase);
  return deepFreeze({
    ...semanticBase,
    semanticHash,
    evidenceHash: canonicalLafeaSha256({
      schema: 'lafea-bucket-01-code-basis-evidence/v1',
      semanticHash,
      approvalRecordHash: basis.authority.approvalRecordHash,
      sourceDocumentHash: basis.governingCode.sourceDocumentHash,
    }),
  });
}

export function validateLafeaBucket01CodeBasis(value) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_CODE_BASIS_PACKAGE_SCHEMA
      || value.producerRevision !== LAFEA_BUCKET_01_CODE_BASIS_REVISION
      || value.status !== 'CODE_BASIS_FROZEN'
      || value.authorityBoundary?.codeBasisFrozen !== true
      || value.authorityBoundary?.codeAssessmentPerformed !== false
      || value.authorityBoundary?.codeVerified !== false
      || value.authorityBoundary?.bucketQualified !== false) {
      throw basisError('LAFEA_B01_CODE_BASIS_PACKAGE_INVALID');
    }
    const rebuilt = createLafeaBucket01CodeBasis({
      schema: LAFEA_BUCKET_01_CODE_BASIS_INPUT_SCHEMA,
      basisId: value.basisId,
      exactHeadSha: value.exactHeadSha,
      benchmarkId: value.benchmarkId,
      target: value.target,
      probeSpecHash: value.probeSpecHash,
      governingCode: value.governingCode,
      allowable: value.allowable,
      stressClassification: value.stressClassification,
      loadCombination: value.loadCombination,
      authority: value.authority,
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw basisError('LAFEA_B01_CODE_BASIS_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw basisError('LAFEA_B01_CODE_BASIS_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({ ok: false, errors: [error?.code ?? 'LAFEA_B01_CODE_BASIS_INVALID'] });
  }
}

function normalizeCode(value) {
  exactKeys(value, CODE_KEYS, 'governingCode');
  return deepFreeze({
    organization: text(value.organization, 'governingCode.organization'),
    documentId: text(value.documentId, 'governingCode.documentId'),
    title: text(value.title, 'governingCode.title'),
    edition: text(value.edition, 'governingCode.edition'),
    addenda: nullableText(value.addenda, 'governingCode.addenda'),
    jurisdiction: text(value.jurisdiction, 'governingCode.jurisdiction'),
    sourceDocumentHash: sha256(value.sourceDocumentHash, 'governingCode.sourceDocumentHash'),
  });
}

function normalizeAllowable(value) {
  exactKeys(value, ALLOWABLE_KEYS, 'allowable');
  if (value.units !== 'MPa') throw basisError('LAFEA_B01_CODE_BASIS_ALLOWABLE_UNITS_INVALID');
  if (value.temperatureUnits !== 'degC') throw basisError('LAFEA_B01_CODE_BASIS_TEMPERATURE_UNITS_INVALID');
  if (!ALLOWED_INTERPOLATION.includes(value.interpolationPolicy)) {
    throw basisError('LAFEA_B01_CODE_BASIS_INTERPOLATION_POLICY_INVALID');
  }
  return deepFreeze({
    allowableId: text(value.allowableId, 'allowable.allowableId'),
    value: positive(value.value, 'allowable.value'),
    units: value.units,
    temperature: finite(value.temperature, 'allowable.temperature'),
    temperatureUnits: value.temperatureUnits,
    materialScope: text(value.materialScope, 'allowable.materialScope'),
    sourceSection: text(value.sourceSection, 'allowable.sourceSection'),
    sourceTable: nullableText(value.sourceTable, 'allowable.sourceTable'),
    interpolationPolicy: value.interpolationPolicy,
  });
}

function normalizeClassification(value) {
  exactKeys(value, CLASSIFICATION_KEYS, 'stressClassification');
  if (value.extractionAuthority !== ALLOWED_EXTRACTION) {
    throw basisError('LAFEA_B01_CODE_BASIS_EXTRACTION_AUTHORITY_INVALID');
  }
  if (value.singularityTreatment !== ALLOWED_SINGULARITY) {
    throw basisError('LAFEA_B01_CODE_BASIS_SINGULARITY_TREATMENT_INVALID');
  }
  if (!Array.isArray(value.locationIds) || value.locationIds.length < 1) {
    throw basisError('LAFEA_B01_CODE_BASIS_LOCATION_IDS_REQUIRED');
  }
  const locationIds = value.locationIds.map((row, index) =>
    text(row, `stressClassification.locationIds[${index}]`));
  if (new Set(locationIds).size !== locationIds.length) {
    throw basisError('LAFEA_B01_CODE_BASIS_LOCATION_IDS_DUPLICATED');
  }
  return deepFreeze({
    classificationId: text(value.classificationId, 'stressClassification.classificationId'),
    method: text(value.method, 'stressClassification.method'),
    sourceSection: text(value.sourceSection, 'stressClassification.sourceSection'),
    locationIds: deepFreeze([...locationIds].sort()),
    stressQuantity: text(value.stressQuantity, 'stressClassification.stressQuantity'),
    extractionAuthority: value.extractionAuthority,
    singularityTreatment: value.singularityTreatment,
  });
}

function normalizeCombination(value) {
  exactKeys(value, COMBINATION_KEYS, 'loadCombination');
  if (!Array.isArray(value.terms) || value.terms.length < 1) {
    throw basisError('LAFEA_B01_CODE_BASIS_LOAD_TERMS_REQUIRED');
  }
  const terms = value.terms.map((row, index) => {
    exactKeys(row, TERM_KEYS, `loadCombination.terms[${index}]`);
    return deepFreeze({
      loadCaseId: text(row.loadCaseId, `loadCombination.terms[${index}].loadCaseId`),
      factor: finite(row.factor, `loadCombination.terms[${index}].factor`),
      role: text(row.role, `loadCombination.terms[${index}].role`),
    });
  }).sort((left, right) => left.loadCaseId.localeCompare(right.loadCaseId));
  if (new Set(terms.map((row) => row.loadCaseId)).size !== terms.length) {
    throw basisError('LAFEA_B01_CODE_BASIS_LOAD_CASE_DUPLICATED');
  }
  if (terms.every((row) => row.factor === 0)) {
    throw basisError('LAFEA_B01_CODE_BASIS_ZERO_LOAD_COMBINATION');
  }
  return deepFreeze({
    combinationId: text(value.combinationId, 'loadCombination.combinationId'),
    sourceSection: text(value.sourceSection, 'loadCombination.sourceSection'),
    terms: deepFreeze(terms),
  });
}

function normalizeAuthority(value) {
  exactKeys(value, AUTHORITY_KEYS, 'authority');
  if (value.approvalStatus !== 'APPROVED') throw basisError('LAFEA_B01_CODE_BASIS_APPROVAL_REQUIRED');
  if (value.authoritySource !== 'EXTERNAL_ENGINEERING_AUTHORITY') {
    throw basisError('LAFEA_B01_CODE_BASIS_AUTHORITY_SOURCE_INVALID');
  }
  const approvedAt = text(value.approvedAt, 'authority.approvedAt');
  if (!Number.isFinite(Date.parse(approvedAt))) {
    throw basisError('LAFEA_B01_CODE_BASIS_APPROVAL_DATE_INVALID');
  }
  return deepFreeze({
    approvalStatus: value.approvalStatus,
    approvalId: text(value.approvalId, 'authority.approvalId'),
    authoritySource: value.authoritySource,
    issuer: text(value.issuer, 'authority.issuer'),
    approver: text(value.approver, 'authority.approver'),
    approverRole: text(value.approverRole, 'authority.approverRole'),
    approvedAt,
    approvalRecordHash: sha256(value.approvalRecordHash, 'authority.approvalRecordHash'),
  });
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw basisError('LAFEA_B01_CODE_BASIS_RECORD_INVALID', label);
  }
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw basisError('LAFEA_B01_CODE_BASIS_EXACT_KEYS_INVALID', label);
  }
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw basisError('LAFEA_B01_CODE_BASIS_TEXT_REQUIRED', label);
  }
  return value.trim();
}
function exactText(value, expected, label) {
  const normalized = text(value, label);
  if (normalized !== expected) throw basisError('LAFEA_B01_CODE_BASIS_BOUND_IDENTITY_INVALID', label);
  return normalized;
}
function nullableText(value, label) { return value === null ? null : text(value, label); }
function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw basisError('LAFEA_B01_CODE_BASIS_FINITE_REQUIRED', label);
  }
  return Object.is(value, -0) ? 0 : value;
}
function positive(value, label) {
  const normalized = finite(value, label);
  if (!(normalized > 0)) throw basisError('LAFEA_B01_CODE_BASIS_POSITIVE_REQUIRED', label);
  return normalized;
}
function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw basisError('LAFEA_B01_CODE_BASIS_EXACT_HEAD_INVALID');
  }
  return value;
}
function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw basisError('LAFEA_B01_CODE_BASIS_SHA256_REQUIRED', label);
  }
  return value;
}
function basisError(code, message = code) { const error = new TypeError(message); error.code = code; return error; }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
