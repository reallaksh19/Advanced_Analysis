import {
  assertArray, assertEnum, assertExactKeys, assertFiniteNumber,
  assertPlainData, clonePlain, deepFreeze, sealWithHash, verifySealedHash,
} from './contracts.js';

export const SYNTHETIC_CASE_SCHEMA = 'nonlinear-shell-contact-synthetic-case-assessment-contract/v2';
export const REQUIRED_NC07_DOMAINS = Object.freeze([
  'NC07-CASE-01_UPSTREAM_RECEIPT_BINDING',
  'NC07-CASE-02_SYNTHETIC_IDENTITY_AND_CUSTODY',
  'NC07-CASE-03_GENERATED_INPUT_TRACEABILITY',
  'NC07-CASE-04_BASIS_AND_APPLICABILITY',
  'NC07-CASE-05_QUALIFIED_CELL_BINDING',
  'NC07-CASE-06_CALCULATION_LEDGER_REPRODUCTION',
  'NC07-CASE-07_UNCERTAINTY_AND_SENSITIVITY',
  'NC07-CASE-08_SIMULATED_INDEPENDENT_REVIEW',
  'NC07-CASE-09_SIMULATED_OWNER_DISPOSITION',
  'NC07-CASE-10_REPORT_SEALING_AND_RETENTION',
]);
export const REQUIRED_REPORT_SECTIONS = Object.freeze([
  'CASE_IDENTITY', 'BASIS_AND_SCOPE', 'SOURCE_RECEIPTS', 'GENERATED_INPUTS',
  'APPLICABILITY_AND_EXCLUSIONS', 'CALCULATION_LEDGER',
  'UNCERTAINTY_AND_SENSITIVITY', 'RESULTS_AND_LIMITATIONS',
  'SIMULATED_REVIEW_AND_DISPOSITION', 'RECEIPT_AND_RETENTION',
]);

export function createSyntheticCaseAssessmentContract(input = {}) {
  const payload = {
    schema: SYNTHETIC_CASE_SCHEMA,
    analysisClass: 'SYNTHETIC_NON_PHYSICAL_LOCAL_DENT_ASSESSMENT',
    upstreamRequirement: 'QUALIFIED_NC05_AND_NC06_EXACT_RECEIPTS',
    caseNatureRequirement: 'SYNTHETIC_NON_PHYSICAL_DEMONSTRATION_ONLY',
    generatedInputPolicy: 'DETERMINISTIC_REGISTERED_CELL_VALUES_WITH_HASHED_PROVENANCE',
    reviewPolicy: 'SIMULATED_INDEPENDENT_TEST_ACTOR_ONLY',
    dispositionPolicy: 'ENGINEERING_REVIEW_REQUIRED_NO_REAL_ASSET_DECISION',
    retentionPolicy: 'HASH_BOUND_REPOSITORY_TEST_ARTIFACT',
    maximumEquationRelativeError: 1e-12,
    maximumUnitConversionRelativeError: 1e-12,
    maximumLedgerRelativeDifference: 1e-12,
    minimumNonBeneficialUncertaintyImpact: 0,
    minimumSimulatedReviewerCount: 1,
    requiredDomains: [...REQUIRED_NC07_DOMAINS],
    requiredReportSections: [...REQUIRED_REPORT_SECTIONS],
    syntheticCaseAssessmentAuthorized: true,
    realAssetAssessmentAuthorized: false,
    externalCodeComplianceAuthorized: false,
    automaticAcceptanceAuthorized: false,
    autonomousDispositionAuthorized: false,
    fitnessForServiceAuthorized: false,
    remainingStrengthAuthorized: false,
    failurePressureAuthorized: false,
    productionExecutionAuthorized: false,
    ...clonePlain(input),
  };
  validateSyntheticCaseAssessmentContract(payload);
  return sealWithHash(payload, 'syntheticCaseAssessmentContractHash');
}

export function validateSyntheticCaseAssessmentContract(value) {
  assertPlainData(value, '$contract');
  assertExactKeys(value, [
    'schema','analysisClass','upstreamRequirement','caseNatureRequirement',
    'generatedInputPolicy','reviewPolicy','dispositionPolicy','retentionPolicy',
    'maximumEquationRelativeError','maximumUnitConversionRelativeError',
    'maximumLedgerRelativeDifference','minimumNonBeneficialUncertaintyImpact',
    'minimumSimulatedReviewerCount','requiredDomains','requiredReportSections',
    'syntheticCaseAssessmentAuthorized','realAssetAssessmentAuthorized',
    'externalCodeComplianceAuthorized','automaticAcceptanceAuthorized',
    'autonomousDispositionAuthorized','fitnessForServiceAuthorized',
    'remainingStrengthAuthorized','failurePressureAuthorized',
    'productionExecutionAuthorized',
  ], '$contract', ['syntheticCaseAssessmentContractHash']);
  assertEnum(value.schema, [SYNTHETIC_CASE_SCHEMA], '$contract.schema');
  assertEnum(value.analysisClass, ['SYNTHETIC_NON_PHYSICAL_LOCAL_DENT_ASSESSMENT'], '$contract.analysisClass');
  assertEnum(value.upstreamRequirement, ['QUALIFIED_NC05_AND_NC06_EXACT_RECEIPTS'], '$contract.upstreamRequirement');
  assertEnum(value.caseNatureRequirement, ['SYNTHETIC_NON_PHYSICAL_DEMONSTRATION_ONLY'], '$contract.caseNatureRequirement');
  assertEnum(value.generatedInputPolicy, ['DETERMINISTIC_REGISTERED_CELL_VALUES_WITH_HASHED_PROVENANCE'], '$contract.generatedInputPolicy');
  assertEnum(value.reviewPolicy, ['SIMULATED_INDEPENDENT_TEST_ACTOR_ONLY'], '$contract.reviewPolicy');
  assertEnum(value.dispositionPolicy, ['ENGINEERING_REVIEW_REQUIRED_NO_REAL_ASSET_DECISION'], '$contract.dispositionPolicy');
  assertEnum(value.retentionPolicy, ['HASH_BOUND_REPOSITORY_TEST_ARTIFACT'], '$contract.retentionPolicy');
  for (const key of ['maximumEquationRelativeError','maximumUnitConversionRelativeError','maximumLedgerRelativeDifference']) {
    assertFiniteNumber(value[key], `$contract.${key}`, (n) => n > 0 && n <= 1e-9, 'bounded positive ratio');
  }
  assertFiniteNumber(value.minimumNonBeneficialUncertaintyImpact, '$contract.minimumNonBeneficialUncertaintyImpact', (n) => n === 0, 'zero');
  assertFiniteNumber(value.minimumSimulatedReviewerCount, '$contract.minimumSimulatedReviewerCount', Number.isInteger, 'integer');
  if (value.minimumSimulatedReviewerCount < 1) throw new TypeError('At least one simulated reviewer is required.');
  exact(value.requiredDomains, REQUIRED_NC07_DOMAINS, '$contract.requiredDomains');
  exact(value.requiredReportSections, REQUIRED_REPORT_SECTIONS, '$contract.requiredReportSections');
  requireBoolean(value.syntheticCaseAssessmentAuthorized, '$contract.syntheticCaseAssessmentAuthorized');
  if (value.syntheticCaseAssessmentAuthorized !== true) throw new TypeError('Synthetic-case assessment must be explicitly authorized.');
  for (const key of ['realAssetAssessmentAuthorized','externalCodeComplianceAuthorized','automaticAcceptanceAuthorized','autonomousDispositionAuthorized','fitnessForServiceAuthorized','remainingStrengthAuthorized','failurePressureAuthorized','productionExecutionAuthorized']) {
    requireBoolean(value[key], `$contract.${key}`);
    if (value[key] !== false) throw new TypeError(`${key} is outside NC-07 synthetic authority.`);
  }
  if (value.syntheticCaseAssessmentContractHash) verifySealedHash(value, 'syntheticCaseAssessmentContractHash', '$contract');
  return true;
}
function requireBoolean(value, path) { if (typeof value !== 'boolean') throw new TypeError(`${path} must be boolean.`); }
function exact(value, required, path) {
  assertArray(value, path, { min: required.length });
  if (value.length !== required.length || value.some((entry, index) => entry !== required[index])) throw new TypeError(`${path} must preserve canonical coverage.`);
}
export const DEFAULT_SYNTHETIC_CASE_ASSESSMENT_CONTRACT = deepFreeze(createSyntheticCaseAssessmentContract());
