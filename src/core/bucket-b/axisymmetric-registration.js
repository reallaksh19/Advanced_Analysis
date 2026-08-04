import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';

export const AXISYMMETRIC_INDEPENDENT_CHECKER_EVIDENCE_SCHEMA =
  'bucket-b-axisymmetric-independent-checker-evidence/v1';
export const AXISYMMETRIC_REGISTRATION_APPROVAL_SCHEMA =
  'bucket-b-axisymmetric-registration-approval/v1';
export const BB10_AXISYMMETRIC_REGISTRATION_REPORT_SCHEMA =
  'bucket-b-bb10-axisymmetric-registration-report/v1';
export const AXISYMMETRIC_REGISTRATION_STATUS = 'AXI_Q8_REGISTRATION_QUALIFIED';
export const AXISYMMETRIC_FORMULATION_PROFILE = 'AXISYMMETRIC';
export const AXISYMMETRIC_ELEMENT_PROFILE = 'AXI_Q8_FULL_3X3';
export const AXISYMMETRIC_REGISTRATION_CASES = Object.freeze([
  'AXI-Q8-REG-001-A', 'AXI-Q8-REG-001-B', 'AXI-Q8-REG-001-C',
]);

const REQUIRED_INDEPENDENT_COMPARISONS = Object.freeze([
  'RECTANGULAR_STIFFNESS',
  'DISTORTED_STIFFNESS',
  'GAUSS_POINT_B_MATRICES',
  'GAUSS_POINT_RADII',
  'MANUFACTURED_STRAINS',
  'MANUFACTURED_STRESSES',
  'INTERNAL_FORCES',
  'STRAIN_ENERGY',
  'EDGE_LOADS',
  'LAME_FIELD_VALUES',
]);

const REQUIRED_REPORT_CHECKS = Object.freeze([
  'BB10_SHARED_GATE_RECEIPT_VALID',
  'BB10_PLANAR_REGRESSION_CHAIN_PASS',
  'BB10_AXISYMMETRIC_SHAPE_AND_RADIUS',
  'BB10_AXISYMMETRIC_CONSTITUTIVE',
  'BB10_AXISYMMETRIC_RECTANGULAR_ORACLE',
  'BB10_AXISYMMETRIC_DISTORTED_ORACLE',
  'BB10_CONSTANT_STRAIN_PATCH',
  'BB10_AXIAL_TRANSLATION_ZERO_ENERGY',
  'BB10_RADIAL_TRANSLATION_NOT_RIGID',
  'BB10_FULL_CIRCUMFERENCE_CYLINDRICAL_PRESSURE',
  'BB10_FULL_CIRCUMFERENCE_ANNULAR_AXIAL_LOAD',
  'BB10_FULL_CIRCUMFERENCE_VARIABLE_LOAD',
  'BB10_LAME_PRESSURE_BOUNDARY_NORMALIZATION',
  'BB10_LAME_DISPLACEMENT_CONVERGENCE',
  'BB10_LAME_STRESS_CONVERGENCE',
  'BB10_LAME_ENERGY',
  'BB10_LAME_AXIAL_REACTION_RESULTANT',
  'BB10_AXIS_RADIUS_REJECTION',
  'BB10_MISSING_CIRCUMFERENCE_REJECTED',
  'BB10_DOUBLE_CIRCUMFERENCE_REJECTED',
  'BB10_FAKE_APPROVAL_HASH_REJECTED',
  'BB10_STALE_HEAD_RECEIPT_REJECTED',
  'BB10_CALLER_STATUS_TAMPER_REJECTED',
  'BB10_REPORT_TAMPER_REJECTED',
  'BB10_DETERMINISTIC_REPORT_REPLAY',
]);

export function createAxisymmetricIndependentCheckerEvidence({
  exactHeadSha,
  baseSha,
  oracleId,
  oracleSemanticHash,
  sourceArtifactHashes,
  rawEvidenceHashes,
  semanticEvidenceHashes,
  comparisons,
  checks,
} = {}) {
  requireGitSha(exactHeadSha, 'exactHeadSha');
  requireGitSha(baseSha, 'baseSha');
  requireText(oracleId, 'oracleId');
  requireHash(oracleSemanticHash, 'oracleSemanticHash');
  requireHashArray(sourceArtifactHashes, 'sourceArtifactHashes');
  requireHashArray(rawEvidenceHashes, 'rawEvidenceHashes');
  requireHashArray(semanticEvidenceHashes, 'semanticEvidenceHashes');
  const normalizedComparisons = requireNamedPassRows(
    comparisons,
    REQUIRED_INDEPENDENT_COMPARISONS,
    'independent comparison',
  );
  const normalizedChecks = requirePassChecks(checks, 'independent checker');
  const payload = {
    schema: AXISYMMETRIC_INDEPENDENT_CHECKER_EVIDENCE_SCHEMA,
    exactHeadSha,
    baseSha,
    oracleId,
    oracleSemanticHash,
    sourceArtifactHashes: [...sourceArtifactHashes],
    rawEvidenceHashes: [...rawEvidenceHashes],
    semanticEvidenceHashes: [...semanticEvidenceHashes],
    comparisons: normalizedComparisons,
    checks: normalizedChecks,
    status: 'PASS',
    authority: retainedAuthority({ independentOracleExecuted: true }),
  };
  return seal(payload);
}

export function validateAxisymmetricIndependentCheckerEvidence(value, {
  expectedHeadSha,
  expectedBaseSha,
} = {}) {
  requireSchemaAndHash(value, AXISYMMETRIC_INDEPENDENT_CHECKER_EVIDENCE_SCHEMA);
  requireGitSha(value.exactHeadSha, 'exactHeadSha');
  requireGitSha(value.baseSha, 'baseSha');
  if (expectedHeadSha && value.exactHeadSha !== expectedHeadSha) {
    throw new TypeError('AXI_REG_INDEPENDENT_STALE_HEAD');
  }
  if (expectedBaseSha && value.baseSha !== expectedBaseSha) {
    throw new TypeError('AXI_REG_INDEPENDENT_WRONG_BASE');
  }
  requireHash(value.oracleSemanticHash, 'oracleSemanticHash');
  requireHashArray(value.sourceArtifactHashes, 'sourceArtifactHashes');
  requireHashArray(value.rawEvidenceHashes, 'rawEvidenceHashes');
  requireHashArray(value.semanticEvidenceHashes, 'semanticEvidenceHashes');
  requireNamedPassRows(value.comparisons, REQUIRED_INDEPENDENT_COMPARISONS, 'independent comparison');
  requirePassChecks(value.checks, 'independent checker');
  if (value.status !== 'PASS') throw new TypeError('AXI_REG_INDEPENDENT_NOT_PASS');
  validateRetainedAuthority(value.authority, { independentOracleExecuted: true });
  return true;
}

export function createAxisymmetricRegistrationApproval({
  exactHeadSha,
  baseSha,
  sourceArtifactHashes,
  rawEvidenceHashes,
  semanticEvidenceHashes,
  changedPaths,
  checkResults,
  independentCheckerEvidence,
  stdoutHash,
  stderrHash,
  caseEvidence,
} = {}) {
  requireGitSha(exactHeadSha, 'exactHeadSha');
  requireGitSha(baseSha, 'baseSha');
  validateAxisymmetricIndependentCheckerEvidence(independentCheckerEvidence, {
    expectedHeadSha: exactHeadSha,
    expectedBaseSha: baseSha,
  });
  requireHashArray(sourceArtifactHashes, 'sourceArtifactHashes');
  requireHashArray(rawEvidenceHashes, 'rawEvidenceHashes');
  requireHashArray(semanticEvidenceHashes, 'semanticEvidenceHashes');
  requireHash(stdoutHash, 'stdoutHash');
  requireHash(stderrHash, 'stderrHash');
  const paths = requireChangedPaths(changedPaths);
  const checks = requirePassChecks(checkResults, 'axisymmetric registration');
  const cases = requireCaseEvidence(caseEvidence);
  const payload = {
    schema: AXISYMMETRIC_REGISTRATION_APPROVAL_SCHEMA,
    exactHeadSha,
    baseSha,
    formulationProfile: AXISYMMETRIC_FORMULATION_PROFILE,
    elementProfile: AXISYMMETRIC_ELEMENT_PROFILE,
    recoveryProfileId: 'AXI_Q8_GAUSS_POINT_STRESS_RECOVERY_V1',
    loadIntegrationProfileId: 'AXI_Q8_FULL_CIRCUMFERENCE_LOAD_INTEGRATION_V1',
    registrationCases: cases,
    sourceArtifactHashes: [...sourceArtifactHashes],
    rawEvidenceHashes: [...rawEvidenceHashes],
    semanticEvidenceHashes: [...semanticEvidenceHashes],
    changedPaths: paths,
    checkResults: checks,
    independentCheckerEvidence,
    stdoutHash,
    stderrHash,
    status: AXISYMMETRIC_REGISTRATION_STATUS,
    axisymmetricFormulationQualified: true,
    axisymmetricNumericalReferenceQualified: true,
    fullCircumferenceLoadingQualified: true,
    bb11Authorized: true,
    authority: retainedAuthority({ registrationApproval: true }),
  };
  return seal(payload);
}

export function validateAxisymmetricRegistrationApprovalReceipt(value, {
  expectedHeadSha,
  expectedBaseSha,
} = {}) {
  requireSchemaAndHash(value, AXISYMMETRIC_REGISTRATION_APPROVAL_SCHEMA);
  requireGitSha(value.exactHeadSha, 'exactHeadSha');
  requireGitSha(value.baseSha, 'baseSha');
  if (expectedHeadSha && value.exactHeadSha !== expectedHeadSha) {
    throw new TypeError('AXI_REG_APPROVAL_STALE_HEAD');
  }
  if (expectedBaseSha && value.baseSha !== expectedBaseSha) {
    throw new TypeError('AXI_REG_APPROVAL_WRONG_BASE');
  }
  if (value.formulationProfile !== AXISYMMETRIC_FORMULATION_PROFILE
    || value.elementProfile !== AXISYMMETRIC_ELEMENT_PROFILE
    || value.recoveryProfileId !== 'AXI_Q8_GAUSS_POINT_STRESS_RECOVERY_V1'
    || value.loadIntegrationProfileId !== 'AXI_Q8_FULL_CIRCUMFERENCE_LOAD_INTEGRATION_V1') {
    throw new TypeError('AXI_REG_APPROVAL_PROFILE_MISMATCH');
  }
  requireCaseEvidence(value.registrationCases);
  requireHashArray(value.sourceArtifactHashes, 'sourceArtifactHashes');
  requireHashArray(value.rawEvidenceHashes, 'rawEvidenceHashes');
  requireHashArray(value.semanticEvidenceHashes, 'semanticEvidenceHashes');
  requireChangedPaths(value.changedPaths);
  requirePassChecks(value.checkResults, 'axisymmetric registration');
  requireHash(value.stdoutHash, 'stdoutHash');
  requireHash(value.stderrHash, 'stderrHash');
  validateAxisymmetricIndependentCheckerEvidence(value.independentCheckerEvidence, {
    expectedHeadSha: value.exactHeadSha,
    expectedBaseSha: value.baseSha,
  });
  if (value.status !== AXISYMMETRIC_REGISTRATION_STATUS
    || value.axisymmetricFormulationQualified !== true
    || value.axisymmetricNumericalReferenceQualified !== true
    || value.fullCircumferenceLoadingQualified !== true
    || value.bb11Authorized !== true) {
    throw new TypeError('AXI_REG_APPROVAL_NOT_QUALIFIED');
  }
  validateRetainedAuthority(value.authority, { registrationApproval: true });
  return true;
}

export function createBb10AxisymmetricRegistrationReport({
  exactHeadSha,
  baseSha,
  sharedGateReceiptHash,
  planarRegressionReportHashes,
  approvalReceipt,
  checkResults,
  limitations,
} = {}) {
  requireGitSha(exactHeadSha, 'exactHeadSha');
  requireGitSha(baseSha, 'baseSha');
  requireHash(sharedGateReceiptHash, 'sharedGateReceiptHash');
  requireHashArray(planarRegressionReportHashes, 'planarRegressionReportHashes');
  validateAxisymmetricRegistrationApprovalReceipt(approvalReceipt, {
    expectedHeadSha: exactHeadSha,
    expectedBaseSha: baseSha,
  });
  const checks = requirePassChecks(checkResults, 'BB-10 report');
  requireRequiredCheckIds(checks);
  if (!Array.isArray(limitations) || limitations.length === 0
    || !limitations.every((row) => typeof row === 'string' && row.length > 0)) {
    throw new TypeError('BB10_LIMITATIONS_REQUIRED');
  }
  const payload = {
    schema: BB10_AXISYMMETRIC_REGISTRATION_REPORT_SCHEMA,
    exactHeadSha,
    baseSha,
    sharedGateReceiptHash,
    planarRegressionReportHashes: [...planarRegressionReportHashes],
    approvalReceipt,
    checkResults: checks,
    status: AXISYMMETRIC_REGISTRATION_STATUS,
    axisymmetricFormulationQualified: true,
    axisymmetricNumericalReferenceQualified: true,
    fullCircumferenceLoadingQualified: true,
    bb11Authorized: true,
    flangeHubApplicationQualified: false,
    flangeHubNumericalOutputQualified: false,
    codeAssessmentQualified: false,
    moduleQualified: false,
    applicationModulePromoted: false,
    productionSwitchAuthorized: false,
    bucket01Qualified: 'UNCHANGED',
    limitations: [...limitations],
  };
  return seal(payload);
}

export function validateBb10AxisymmetricRegistrationReport(value, {
  expectedHeadSha,
  expectedBaseSha,
} = {}) {
  requireSchemaAndHash(value, BB10_AXISYMMETRIC_REGISTRATION_REPORT_SCHEMA);
  if (expectedHeadSha && value.exactHeadSha !== expectedHeadSha) throw new TypeError('BB10_REPORT_STALE_HEAD');
  if (expectedBaseSha && value.baseSha !== expectedBaseSha) throw new TypeError('BB10_REPORT_WRONG_BASE');
  validateAxisymmetricRegistrationApprovalReceipt(value.approvalReceipt, {
    expectedHeadSha: value.exactHeadSha,
    expectedBaseSha: value.baseSha,
  });
  requireHash(value.sharedGateReceiptHash, 'sharedGateReceiptHash');
  requireHashArray(value.planarRegressionReportHashes, 'planarRegressionReportHashes');
  const checks = requirePassChecks(value.checkResults, 'BB-10 report');
  requireRequiredCheckIds(checks);
  if (value.status !== AXISYMMETRIC_REGISTRATION_STATUS
    || value.axisymmetricFormulationQualified !== true
    || value.axisymmetricNumericalReferenceQualified !== true
    || value.fullCircumferenceLoadingQualified !== true
    || value.bb11Authorized !== true
    || value.flangeHubApplicationQualified !== false
    || value.flangeHubNumericalOutputQualified !== false
    || value.codeAssessmentQualified !== false
    || value.moduleQualified !== false
    || value.applicationModulePromoted !== false
    || value.productionSwitchAuthorized !== false
    || value.bucket01Qualified !== 'UNCHANGED') {
    throw new TypeError('BB10_REPORT_AUTHORITY_INVALID');
  }
  return true;
}

function requireCaseEvidence(value) {
  if (!Array.isArray(value) || value.length !== AXISYMMETRIC_REGISTRATION_CASES.length) {
    throw new TypeError('AXI_REG_A_B_C_EVIDENCE_REQUIRED');
  }
  const byId = new Map(value.map((row) => [row?.caseId, row]));
  return AXISYMMETRIC_REGISTRATION_CASES.map((caseId) => {
    const row = byId.get(caseId);
    if (!row || row.status !== 'PASS' || !isHash(row.semanticEvidenceHash)
      || !isHash(row.rawEvidenceHash)) {
      throw new TypeError(`AXI_REG_CASE_INVALID:${caseId}`);
    }
    return { caseId, status: 'PASS', semanticEvidenceHash: row.semanticEvidenceHash, rawEvidenceHash: row.rawEvidenceHash };
  });
}
function requireNamedPassRows(rows, requiredIds, label) {
  if (!Array.isArray(rows)) throw new TypeError(`${label} rows are required.`);
  const byId = new Map(rows.map((row) => [row?.comparisonId, row]));
  return requiredIds.map((comparisonId) => {
    const row = byId.get(comparisonId);
    if (!row || row.status !== 'PASS' || !isHash(row.evidenceHash)) {
      throw new TypeError(`${label} failed or missing: ${comparisonId}`);
    }
    return { comparisonId, status: 'PASS', evidenceHash: row.evidenceHash };
  });
}
function requirePassChecks(rows, label) {
  if (!Array.isArray(rows) || rows.length === 0) throw new TypeError(`${label} checks are required.`);
  const seen = new Set();
  return rows.map((row) => {
    if (typeof row?.checkId !== 'string' || !row.checkId || seen.has(row.checkId)
      || row.status !== 'PASS' || !isHash(row.evidenceHash)) {
      throw new TypeError(`${label} contains an invalid or failing check.`);
    }
    seen.add(row.checkId);
    return { checkId: row.checkId, status: 'PASS', evidenceHash: row.evidenceHash };
  });
}
function requireRequiredCheckIds(rows) {
  const ids = new Set(rows.map((row) => row.checkId));
  const missing = REQUIRED_REPORT_CHECKS.filter((id) => !ids.has(id));
  if (missing.length) throw new TypeError(`BB10_REQUIRED_CHECKS_MISSING:${missing.join(',')}`);
}
function requireChangedPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) throw new TypeError('AXI_REG_CHANGED_PATHS_REQUIRED');
  const sorted = [...paths].sort();
  if (new Set(sorted).size !== sorted.length || sorted.some((path) => (
    typeof path !== 'string' || !path.length || !allowedChangedPath(path)
  ))) {
    throw new TypeError('AXI_REG_CHANGED_PATH_AUDIT_FAILED');
  }
  return sorted;
}
function allowedChangedPath(path) {
  return path === '.github/workflows/bucket-b-bb10-axisymmetric-registration.yml'
    || path === 'src/core/bucket-b/registry.js'
    || path === 'src/core/bucket-b/index.js'
    || path === 'src/core/bucket-b/bb10-check.mjs'
    || /^src\/core\/bucket-b\/axisymmetric-[a-z0-9-]+\.js$/u.test(path);
}
function retainedAuthority(extra = {}) {
  return {
    ...extra,
    flangeHubApplicationQualified: false,
    flangeHubNumericalOutputQualified: false,
    codeAssessmentQualified: false,
    moduleQualified: false,
    applicationModulePromoted: false,
    productionSwitchAuthorized: false,
    bucket01Qualified: 'UNCHANGED',
  };
}
function validateRetainedAuthority(value, required = {}) {
  if (!value || Object.entries(required).some(([key, expected]) => value[key] !== expected)
    || value.flangeHubApplicationQualified !== false
    || value.flangeHubNumericalOutputQualified !== false
    || value.codeAssessmentQualified !== false
    || value.moduleQualified !== false
    || value.applicationModulePromoted !== false
    || value.productionSwitchAuthorized !== false
    || value.bucket01Qualified !== 'UNCHANGED') {
    throw new TypeError('AXI_REG_FORBIDDEN_AUTHORITY_FLAGS');
  }
}
function requireSchemaAndHash(value, schema) {
  if (!value || value.schema !== schema) throw new TypeError(`AXI_REG_SCHEMA_MISMATCH:${schema}`);
  const copy = clone(value); const retained = copy.semanticHash; delete copy.semanticHash;
  if (retained !== semanticHash(copy)) throw new TypeError('AXI_REG_SEMANTIC_HASH_MISMATCH');
}
function seal(payload) { const clean = clone(payload); return deepFreeze({ ...clean, semanticHash: semanticHash(clean) }); }
function requireGitSha(value, label) { if (typeof value !== 'string' || !/^[0-9a-f]{40}$/iu.test(value)) throw new TypeError(`AXI_REG_INVALID_${label.toUpperCase()}`); }
function requireHash(value, label) { if (!isHash(value)) throw new TypeError(`AXI_REG_INVALID_${label.toUpperCase()}`); }
function requireHashArray(value, label) { if (!Array.isArray(value) || value.length === 0 || !value.every(isHash)) throw new TypeError(`AXI_REG_INVALID_${label.toUpperCase()}`); }
function requireText(value, label) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`AXI_REG_INVALID_${label.toUpperCase()}`); }
function isHash(value) { return typeof value === 'string' && /^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/iu.test(value); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
