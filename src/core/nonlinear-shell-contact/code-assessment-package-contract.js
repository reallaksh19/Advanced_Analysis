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

export const CODE_ASSESSMENT_PACKAGE_SCHEMA = 'nonlinear-shell-contact-code-assessment-package/v1';

export const REQUIRED_CODE_ASSESSMENT_DOMAINS = Object.freeze([
  'UPSTREAM_NC05_RECEIPT_BINDING',
  'ASSESSMENT_BASIS_CUSTODY',
  'APPLICABILITY_AND_EXCLUSIONS',
  'INPUT_VARIABLE_AND_UNIT_MAPPING',
  'GEOMETRY_MATERIAL_AND_PRESSURE_MAPPING',
  'CLAUSE_EQUATION_REPRODUCTION',
  'DOMAIN_LIMIT_AND_REJECTION',
  'UNCERTAINTY_AND_ROUNDING_SENSITIVITY',
  'INDEPENDENT_REFERENCE_CASE_REPRODUCTION',
  'INDEPENDENT_REVIEW_AND_REPORT_TRACEABILITY',
]);

export const REQUIRED_CODE_ASSESSMENT_REPORT_SECTIONS = Object.freeze([
  'ASSESSMENT_BASIS',
  'APPLICABILITY',
  'SOURCE_RECEIPTS',
  'INPUT_TRACEABILITY',
  'CALCULATION_LEDGER',
  'UNCERTAINTY_AND_SENSITIVITY',
  'LIMITATIONS_AND_EXCLUSIONS',
  'REVIEW_AND_DISPOSITION',
]);

export function createCodeAssessmentPackageContract(input = {}) {
  const payload = {
    schema: CODE_ASSESSMENT_PACKAGE_SCHEMA,
    analysisClass: 'REGISTERED_LOCAL_DENT_ASSESSMENT_PACKAGE',
    upstreamDependency: 'QUALIFIED_NC05_PLASTIC_DENTING_RECEIPT',
    assessmentBasisPolicy: 'EXPLICIT_APPROVED_STANDARD_EDITION_ADDENDA_AND_CLAUSE_SET',
    sourceCustodyPolicy: 'APPROVED_SOURCE_METADATA_AND_HASH_WITHOUT_TEXT_REDISTRIBUTION',
    applicabilityPolicy: 'ALL_SCOPE_PREREQUISITES_EXPLICIT_AND_FAIL_CLOSED',
    unitPolicy: 'CANONICAL_SI_WITH_EXPLICIT_CODE_UNIT_CONVERSION_LEDGER',
    inputMappingPolicy: 'NO_UNMAPPED_INFERRED_OR_OUTPUT_FITTED_INPUTS',
    equationPolicy: 'CLAUSE_BOUND_EQUATIONS_WITH_INDEPENDENT_REPRODUCTION',
    extrapolationPolicy: 'NO_EXTRAPOLATION_OUTSIDE_QUALIFIED_NC05_CELLS_OR_CODE_DOMAIN',
    uncertaintyPolicy: 'PROPAGATE_INPUT_REFERENCE_AND_MODEL_UNCERTAINTY',
    roundingPolicy: 'ROUND_ONLY_AT_FINAL_REPORTED_PRECISION',
    acceptancePolicy: 'NO_PASS_WITH_UNRESOLVED_APPLICABILITY_DOMAIN_OR_TRACEABILITY_GAPS',
    reviewPolicy: 'INDEPENDENT_TECHNICAL_REVIEW_REQUIRED',
    minimumIndependentReviewerCount: 1,
    minimumIndependentReferenceCaseCount: 3,
    maximumEquationRelativeError: 1e-8,
    maximumUnitConversionRelativeError: 1e-12,
    minimumNonBeneficialUncertaintyImpact: 0,
    requiredDomains: [...REQUIRED_CODE_ASSESSMENT_DOMAINS],
    requiredReportSections: [...REQUIRED_CODE_ASSESSMENT_REPORT_SECTIONS],
    automaticCodeComplianceAuthorized: false,
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
  validateCodeAssessmentPackageContract(payload);
  return sealWithHash(payload, 'codeAssessmentPackageHash');
}

export function validateCodeAssessmentPackageContract(value) {
  assertPlainData(value, '$codeAssessmentPackage');
  assertExactKeys(value, [
    'schema', 'analysisClass', 'upstreamDependency', 'assessmentBasisPolicy',
    'sourceCustodyPolicy', 'applicabilityPolicy', 'unitPolicy', 'inputMappingPolicy',
    'equationPolicy', 'extrapolationPolicy', 'uncertaintyPolicy', 'roundingPolicy',
    'acceptancePolicy', 'reviewPolicy', 'minimumIndependentReviewerCount',
    'minimumIndependentReferenceCaseCount', 'maximumEquationRelativeError',
    'maximumUnitConversionRelativeError', 'minimumNonBeneficialUncertaintyImpact',
    'requiredDomains', 'requiredReportSections', 'automaticCodeComplianceAuthorized',
    'fitnessForServiceAuthorized', 'remainingStrengthAuthorized',
    'failurePressureAuthorized', 'damageAuthorized', 'fractureAuthorized',
    'fatigueAuthorized', 'productionExecutionAuthorized', 'mergeAuthorized',
  ], '$codeAssessmentPackage', ['codeAssessmentPackageHash']);
  assertEnum(value.schema, [CODE_ASSESSMENT_PACKAGE_SCHEMA], '$codeAssessmentPackage.schema');
  assertEnum(value.analysisClass, ['REGISTERED_LOCAL_DENT_ASSESSMENT_PACKAGE'], '$codeAssessmentPackage.analysisClass');
  assertEnum(value.upstreamDependency, ['QUALIFIED_NC05_PLASTIC_DENTING_RECEIPT'], '$codeAssessmentPackage.upstreamDependency');
  assertEnum(value.assessmentBasisPolicy, ['EXPLICIT_APPROVED_STANDARD_EDITION_ADDENDA_AND_CLAUSE_SET'], '$codeAssessmentPackage.assessmentBasisPolicy');
  assertEnum(value.sourceCustodyPolicy, ['APPROVED_SOURCE_METADATA_AND_HASH_WITHOUT_TEXT_REDISTRIBUTION'], '$codeAssessmentPackage.sourceCustodyPolicy');
  assertEnum(value.applicabilityPolicy, ['ALL_SCOPE_PREREQUISITES_EXPLICIT_AND_FAIL_CLOSED'], '$codeAssessmentPackage.applicabilityPolicy');
  assertEnum(value.unitPolicy, ['CANONICAL_SI_WITH_EXPLICIT_CODE_UNIT_CONVERSION_LEDGER'], '$codeAssessmentPackage.unitPolicy');
  assertEnum(value.inputMappingPolicy, ['NO_UNMAPPED_INFERRED_OR_OUTPUT_FITTED_INPUTS'], '$codeAssessmentPackage.inputMappingPolicy');
  assertEnum(value.equationPolicy, ['CLAUSE_BOUND_EQUATIONS_WITH_INDEPENDENT_REPRODUCTION'], '$codeAssessmentPackage.equationPolicy');
  assertEnum(value.extrapolationPolicy, ['NO_EXTRAPOLATION_OUTSIDE_QUALIFIED_NC05_CELLS_OR_CODE_DOMAIN'], '$codeAssessmentPackage.extrapolationPolicy');
  assertEnum(value.uncertaintyPolicy, ['PROPAGATE_INPUT_REFERENCE_AND_MODEL_UNCERTAINTY'], '$codeAssessmentPackage.uncertaintyPolicy');
  assertEnum(value.roundingPolicy, ['ROUND_ONLY_AT_FINAL_REPORTED_PRECISION'], '$codeAssessmentPackage.roundingPolicy');
  assertEnum(value.acceptancePolicy, ['NO_PASS_WITH_UNRESOLVED_APPLICABILITY_DOMAIN_OR_TRACEABILITY_GAPS'], '$codeAssessmentPackage.acceptancePolicy');
  assertEnum(value.reviewPolicy, ['INDEPENDENT_TECHNICAL_REVIEW_REQUIRED'], '$codeAssessmentPackage.reviewPolicy');
  assertFiniteNumber(value.minimumIndependentReviewerCount, '$codeAssessmentPackage.minimumIndependentReviewerCount', Number.isInteger, 'integer');
  if (value.minimumIndependentReviewerCount < 1) throw new TypeError('At least one independent reviewer is required.');
  assertFiniteNumber(value.minimumIndependentReferenceCaseCount, '$codeAssessmentPackage.minimumIndependentReferenceCaseCount', Number.isInteger, 'integer');
  if (value.minimumIndependentReferenceCaseCount < 3) throw new TypeError('At least three independent reference cases are required.');
  assertFiniteNumber(value.maximumEquationRelativeError, '$codeAssessmentPackage.maximumEquationRelativeError', (n) => n > 0 && n <= 1e-6, 'bounded positive ratio');
  assertFiniteNumber(value.maximumUnitConversionRelativeError, '$codeAssessmentPackage.maximumUnitConversionRelativeError', (n) => n > 0 && n <= 1e-9, 'bounded positive ratio');
  assertFiniteNumber(value.minimumNonBeneficialUncertaintyImpact, '$codeAssessmentPackage.minimumNonBeneficialUncertaintyImpact', (n) => n === 0, 'zero lower bound');
  validateRequiredSet(value.requiredDomains, REQUIRED_CODE_ASSESSMENT_DOMAINS, '$codeAssessmentPackage.requiredDomains');
  validateExactOrderedSet(value.requiredReportSections, REQUIRED_CODE_ASSESSMENT_REPORT_SECTIONS, '$codeAssessmentPackage.requiredReportSections');
  for (const field of [
    'automaticCodeComplianceAuthorized', 'fitnessForServiceAuthorized',
    'remainingStrengthAuthorized', 'failurePressureAuthorized', 'damageAuthorized',
    'fractureAuthorized', 'fatigueAuthorized', 'productionExecutionAuthorized',
    'mergeAuthorized',
  ]) {
    if (value[field] !== false) throw new TypeError(`${field} is outside NC-06 authority.`);
  }
  if (value.codeAssessmentPackageHash) verifySealedHash(value, 'codeAssessmentPackageHash', '$codeAssessmentPackage');
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

export const DEFAULT_CODE_ASSESSMENT_PACKAGE = deepFreeze(createCodeAssessmentPackageContract());
