import {
  assertArray,
  assertEnum,
  assertExactKeys,
  assertFiniteNumber,
  assertPlainData,
  assertString,
  clonePlain,
  deepFreeze,
  sealWithHash,
  verifySealedHash,
} from './contracts.js';

export const CASE_ASSESSMENT_RECEIPT_SCHEMA = 'nonlinear-shell-contact-case-assessment-receipt/v1';

export const REQUIRED_CASE_ASSESSMENT_DOMAINS = Object.freeze([
  'NC06_PACKAGE_RECEIPT_BINDING',
  'CASE_IDENTITY_AND_ASSET_CUSTODY',
  'INPUT_MEASUREMENT_TRACEABILITY',
  'ASSESSMENT_BASIS_AND_APPLICABILITY',
  'QUALIFIED_CELL_AND_DOMAIN_BINDING',
  'CALCULATION_LEDGER_REPRODUCTION',
  'UNCERTAINTY_AND_SENSITIVITY',
  'INDEPENDENT_TECHNICAL_REVIEW',
  'OWNER_DISPOSITION_RECORD',
  'REPORT_SEALING_AND_RETENTION',
]);

export const REQUIRED_CASE_REPORT_SECTIONS = Object.freeze([
  'CASE_IDENTITY',
  'BASIS_AND_SCOPE',
  'SOURCE_RECEIPTS',
  'INPUTS_AND_MEASUREMENTS',
  'APPLICABILITY_AND_EXCLUSIONS',
  'CALCULATION_LEDGER',
  'UNCERTAINTY_AND_SENSITIVITY',
  'RESULTS_AND_LIMITATIONS',
  'REVIEW_AND_DISPOSITION',
  'RECEIPT_AND_RETENTION',
]);

export function createCaseAssessmentReceiptContract(input = {}) {
  const payload = {
    schema: CASE_ASSESSMENT_RECEIPT_SCHEMA,
    analysisClass: 'CASE_SPECIFIC_LOCAL_DENT_CODE_ASSESSMENT',
    packageDependency: 'QUALIFIED_NC06_CODE_ASSESSMENT_PACKAGE_RECEIPT',
    mechanicsDependency: 'QUALIFIED_NC05_PLASTIC_DENTING_RECEIPT',
    caseIdentityPolicy: 'IMMUTABLE_ASSET_DEFECT_AND_ASSESSMENT_IDENTITIES',
    inputCustodyPolicy: 'MEASURED_OR_APPROVED_INPUTS_WITH_SOURCE_HASHES',
    applicabilityPolicy: 'EXPLICIT_CLAUSE_AND_MODEL_DOMAIN_CHECKS_FAIL_CLOSED',
    qualifiedCellPolicy: 'EXACT_BINDING_TO_A_QUALIFIED_NC05_CELL',
    calculationPolicy: 'REPRODUCIBLE_CLAUSE_BOUND_CALCULATION_LEDGER',
    uncertaintyPolicy: 'NON_BENEFICIAL_PROPAGATION_WITH_RECORDED_SENSITIVITY',
    reviewPolicy: 'INDEPENDENT_TECHNICAL_REVIEW_AND_OWNER_DISPOSITION_REQUIRED',
    receiptPolicy: 'HASH_BOUND_CASE_REPORT_AND_RETENTION_RECORD',
    minimumIndependentReviewerCount: 1,
    maximumEquationRelativeError: 1e-8,
    maximumUnitConversionRelativeError: 1e-12,
    maximumLedgerRelativeDifference: 1e-10,
    minimumNonBeneficialUncertaintyImpact: 0,
    requiredDomains: [...REQUIRED_CASE_ASSESSMENT_DOMAINS],
    requiredReportSections: [...REQUIRED_CASE_REPORT_SECTIONS],
    automaticAcceptanceAuthorized: false,
    fitnessForServiceAuthorized: false,
    remainingStrengthAuthorized: false,
    failurePressureAuthorized: false,
    damageAuthorized: false,
    fractureAuthorized: false,
    fatigueAuthorized: false,
    productionExecutionAuthorized: false,
    mergeAuthorized: false,
    ...clonePlain(input),
  };
  validateCaseAssessmentReceiptContract(payload);
  return sealWithHash(payload, 'caseAssessmentReceiptContractHash');
}

export function validateCaseAssessmentReceiptContract(value) {
  assertPlainData(value, '$caseAssessmentReceiptContract');
  assertExactKeys(value, [
    'schema', 'analysisClass', 'packageDependency', 'mechanicsDependency',
    'caseIdentityPolicy', 'inputCustodyPolicy', 'applicabilityPolicy',
    'qualifiedCellPolicy', 'calculationPolicy', 'uncertaintyPolicy',
    'reviewPolicy', 'receiptPolicy', 'minimumIndependentReviewerCount',
    'maximumEquationRelativeError', 'maximumUnitConversionRelativeError',
    'maximumLedgerRelativeDifference', 'minimumNonBeneficialUncertaintyImpact',
    'requiredDomains', 'requiredReportSections', 'automaticAcceptanceAuthorized',
    'fitnessForServiceAuthorized', 'remainingStrengthAuthorized',
    'failurePressureAuthorized', 'damageAuthorized', 'fractureAuthorized',
    'fatigueAuthorized', 'productionExecutionAuthorized', 'mergeAuthorized',
  ], '$caseAssessmentReceiptContract', ['caseAssessmentReceiptContractHash']);
  assertEnum(value.schema, [CASE_ASSESSMENT_RECEIPT_SCHEMA], '$caseAssessmentReceiptContract.schema');
  assertEnum(value.analysisClass, ['CASE_SPECIFIC_LOCAL_DENT_CODE_ASSESSMENT'], '$caseAssessmentReceiptContract.analysisClass');
  assertEnum(value.packageDependency, ['QUALIFIED_NC06_CODE_ASSESSMENT_PACKAGE_RECEIPT'], '$caseAssessmentReceiptContract.packageDependency');
  assertEnum(value.mechanicsDependency, ['QUALIFIED_NC05_PLASTIC_DENTING_RECEIPT'], '$caseAssessmentReceiptContract.mechanicsDependency');
  assertEnum(value.caseIdentityPolicy, ['IMMUTABLE_ASSET_DEFECT_AND_ASSESSMENT_IDENTITIES'], '$caseAssessmentReceiptContract.caseIdentityPolicy');
  assertEnum(value.inputCustodyPolicy, ['MEASURED_OR_APPROVED_INPUTS_WITH_SOURCE_HASHES'], '$caseAssessmentReceiptContract.inputCustodyPolicy');
  assertEnum(value.applicabilityPolicy, ['EXPLICIT_CLAUSE_AND_MODEL_DOMAIN_CHECKS_FAIL_CLOSED'], '$caseAssessmentReceiptContract.applicabilityPolicy');
  assertEnum(value.qualifiedCellPolicy, ['EXACT_BINDING_TO_A_QUALIFIED_NC05_CELL'], '$caseAssessmentReceiptContract.qualifiedCellPolicy');
  assertEnum(value.calculationPolicy, ['REPRODUCIBLE_CLAUSE_BOUND_CALCULATION_LEDGER'], '$caseAssessmentReceiptContract.calculationPolicy');
  assertEnum(value.uncertaintyPolicy, ['NON_BENEFICIAL_PROPAGATION_WITH_RECORDED_SENSITIVITY'], '$caseAssessmentReceiptContract.uncertaintyPolicy');
  assertEnum(value.reviewPolicy, ['INDEPENDENT_TECHNICAL_REVIEW_AND_OWNER_DISPOSITION_REQUIRED'], '$caseAssessmentReceiptContract.reviewPolicy');
  assertEnum(value.receiptPolicy, ['HASH_BOUND_CASE_REPORT_AND_RETENTION_RECORD'], '$caseAssessmentReceiptContract.receiptPolicy');
  assertFiniteNumber(value.minimumIndependentReviewerCount, '$caseAssessmentReceiptContract.minimumIndependentReviewerCount', Number.isInteger, 'integer');
  if (value.minimumIndependentReviewerCount < 1) throw new TypeError('At least one independent reviewer is required.');
  assertFiniteNumber(value.maximumEquationRelativeError, '$caseAssessmentReceiptContract.maximumEquationRelativeError', (n) => n > 0 && n <= 1e-6, 'bounded positive ratio');
  assertFiniteNumber(value.maximumUnitConversionRelativeError, '$caseAssessmentReceiptContract.maximumUnitConversionRelativeError', (n) => n > 0 && n <= 1e-9, 'bounded positive ratio');
  assertFiniteNumber(value.maximumLedgerRelativeDifference, '$caseAssessmentReceiptContract.maximumLedgerRelativeDifference', (n) => n > 0 && n <= 1e-8, 'bounded positive ratio');
  assertFiniteNumber(value.minimumNonBeneficialUncertaintyImpact, '$caseAssessmentReceiptContract.minimumNonBeneficialUncertaintyImpact', (n) => n === 0, 'zero lower bound');
  validateRequiredSet(value.requiredDomains, REQUIRED_CASE_ASSESSMENT_DOMAINS, '$caseAssessmentReceiptContract.requiredDomains');
  validateExactOrderedSet(value.requiredReportSections, REQUIRED_CASE_REPORT_SECTIONS, '$caseAssessmentReceiptContract.requiredReportSections');
  for (const field of [
    'automaticAcceptanceAuthorized', 'fitnessForServiceAuthorized',
    'remainingStrengthAuthorized', 'failurePressureAuthorized', 'damageAuthorized',
    'fractureAuthorized', 'fatigueAuthorized', 'productionExecutionAuthorized',
    'mergeAuthorized',
  ]) {
    if (value[field] !== false) throw new TypeError(`${field} is outside NC-07 authority.`);
  }
  if (value.caseAssessmentReceiptContractHash) verifySealedHash(value, 'caseAssessmentReceiptContractHash', '$caseAssessmentReceiptContract');
  return true;
}

function validateRequiredSet(value, required, path) {
  assertArray(value, path, { min: required.length });
  value.forEach((entry, index) => assertString(entry, `${path}[${index}]`));
  if (new Set(value).size !== value.length) throw new TypeError(`${path} must be unique.`);
  for (const id of required) if (!value.includes(id)) throw new TypeError(`${path} is missing ${id}.`);
}

function validateExactOrderedSet(value, required, path) {
  assertArray(value, path, { min: required.length });
  if (value.length !== required.length || value.some((entry, index) => entry !== required[index])) {
    throw new TypeError(`${path} must preserve the canonical ordered sequence.`);
  }
}

export const DEFAULT_CASE_ASSESSMENT_RECEIPT_CONTRACT = deepFreeze(createCaseAssessmentReceiptContract());
