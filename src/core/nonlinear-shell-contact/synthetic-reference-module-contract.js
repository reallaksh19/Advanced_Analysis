import {
  assertArray, assertEnum, assertExactKeys, assertFiniteNumber, assertPlainData,
  clonePlain, deepFreeze, sealWithHash, verifySealedHash,
} from './contracts.js';

export const SYNTHETIC_REFERENCE_MODULE_SCHEMA = 'nonlinear-shell-contact-synthetic-reference-module-contract/v1';
export const REQUIRED_NC08_DOMAINS = Object.freeze([
  'NC08-MOD-01_SYNTHETIC_NC07_RECEIPT_BINDING',
  'NC08-MOD-02_API_SCHEMA_VERSION_AND_MIGRATION',
  'NC08-MOD-03_REPRODUCIBLE_BUILD_AND_REPLAY',
  'NC08-MOD-04_FAIL_CLOSED_AUTHORITY_ENFORCEMENT',
  'NC08-MOD-05_INPUT_SECURITY_AND_RUNTIME_ISOLATION',
  'NC08-MOD-06_RECEIPT_CHAIN_RECONSTRUCTION',
  'NC08-MOD-07_SYNTHETIC_REFERENCE_REGRESSION',
  'NC08-MOD-08_ERROR_AND_BOUNDARY_HANDLING',
  'NC08-MOD-09_BUILD_LOCK_AND_SBOM_CUSTODY',
  'NC08-MOD-10_RESOURCE_REVIEW_AND_CHANGE_CONTROL',
]);

export function createSyntheticReferenceModuleContract(input = {}) {
  const payload = {
    schema: SYNTHETIC_REFERENCE_MODULE_SCHEMA,
    analysisClass: 'SYNTHETIC_NON_PHYSICAL_REFERENCE_MODULE',
    upstreamRequirement: 'QUALIFIED_NC07_SYNTHETIC_CASE_RECEIPT_ONLY',
    apiPolicy: 'VERSIONED_PLAIN_DATA_SCHEMAS_WITH_EXPLICIT_MIGRATION',
    determinismPolicy: 'BYTE_IDENTICAL_BUILD_AND_RECEIPTS_FOR_IDENTICAL_GOVERNED_INPUTS',
    authorityPolicy: 'SYNTHETIC_REFERENCE_ONLY_NO_REAL_ASSET_OR_PRODUCTION_AUTHORITY',
    securityPolicy: 'NO_NETWORK_NO_RUNTIME_EXTENSIONS_NO_DYNAMIC_CODE',
    reconstructionPolicy: 'COMPLETE_HASH_CHAIN_TO_NC05_NC06_NC07_RECEIPTS',
    buildPolicy: 'EXACT_HEAD_REPRODUCIBLE_SOURCE_BUNDLE_WITH_LOCK_AND_SBOM',
    reviewPolicy: 'SIMULATED_INDEPENDENT_TEST_ACTOR_NO_HUMAN_APPROVAL_CLAIM',
    changePolicy: 'ANY_GOVERNED_BYTE_CHANGE_REQUIRES_NEW_EXACT_HEAD_RECEIPT',
    minimumBuildReplayCount: 2,
    minimumModuleReplayCount: 3,
    minimumReferenceRegressionCount: 5,
    minimumNegativeControlCount: 24,
    minimumReceiptChainLinkCount: 6,
    maximumReferenceRelativeDifference: 1e-12,
    maximumArtifactBytes: 262144,
    maximumGovernedOperationCount: 10000,
    requiredDomains: [...REQUIRED_NC08_DOMAINS],
    syntheticReferenceModuleAuthorized: true,
    realModuleQualificationAuthorized: false,
    codeAssessmentAuthorized: false,
    realAssetAssessmentAuthorized: false,
    externalCodeComplianceAuthorized: false,
    automaticCaseAcceptanceAuthorized: false,
    autonomousDispositionAuthorized: false,
    fitnessForServiceAuthorized: false,
    remainingStrengthAuthorized: false,
    failurePressureAuthorized: false,
    productionExecutionAuthorized: false,
    nc09Authorized: false,
    ...clonePlain(input),
  };
  validateSyntheticReferenceModuleContract(payload);
  return sealWithHash(payload, 'syntheticReferenceModuleContractHash');
}

export function validateSyntheticReferenceModuleContract(value) {
  assertPlainData(value, '$contract');
  assertExactKeys(value, [
    'schema','analysisClass','upstreamRequirement','apiPolicy','determinismPolicy',
    'authorityPolicy','securityPolicy','reconstructionPolicy','buildPolicy',
    'reviewPolicy','changePolicy','minimumBuildReplayCount','minimumModuleReplayCount',
    'minimumReferenceRegressionCount','minimumNegativeControlCount',
    'minimumReceiptChainLinkCount','maximumReferenceRelativeDifference',
    'maximumArtifactBytes','maximumGovernedOperationCount','requiredDomains',
    'syntheticReferenceModuleAuthorized','realModuleQualificationAuthorized',
    'codeAssessmentAuthorized','realAssetAssessmentAuthorized',
    'externalCodeComplianceAuthorized','automaticCaseAcceptanceAuthorized',
    'autonomousDispositionAuthorized','fitnessForServiceAuthorized',
    'remainingStrengthAuthorized','failurePressureAuthorized',
    'productionExecutionAuthorized','nc09Authorized',
  ], '$contract', ['syntheticReferenceModuleContractHash']);
  const enums = {
    schema: [SYNTHETIC_REFERENCE_MODULE_SCHEMA],
    analysisClass: ['SYNTHETIC_NON_PHYSICAL_REFERENCE_MODULE'],
    upstreamRequirement: ['QUALIFIED_NC07_SYNTHETIC_CASE_RECEIPT_ONLY'],
    apiPolicy: ['VERSIONED_PLAIN_DATA_SCHEMAS_WITH_EXPLICIT_MIGRATION'],
    determinismPolicy: ['BYTE_IDENTICAL_BUILD_AND_RECEIPTS_FOR_IDENTICAL_GOVERNED_INPUTS'],
    authorityPolicy: ['SYNTHETIC_REFERENCE_ONLY_NO_REAL_ASSET_OR_PRODUCTION_AUTHORITY'],
    securityPolicy: ['NO_NETWORK_NO_RUNTIME_EXTENSIONS_NO_DYNAMIC_CODE'],
    reconstructionPolicy: ['COMPLETE_HASH_CHAIN_TO_NC05_NC06_NC07_RECEIPTS'],
    buildPolicy: ['EXACT_HEAD_REPRODUCIBLE_SOURCE_BUNDLE_WITH_LOCK_AND_SBOM'],
    reviewPolicy: ['SIMULATED_INDEPENDENT_TEST_ACTOR_NO_HUMAN_APPROVAL_CLAIM'],
    changePolicy: ['ANY_GOVERNED_BYTE_CHANGE_REQUIRES_NEW_EXACT_HEAD_RECEIPT'],
  };
  for (const [key, allowed] of Object.entries(enums)) assertEnum(value[key], allowed, `$contract.${key}`);
  const minimums = {
    minimumBuildReplayCount: 2,
    minimumModuleReplayCount: 3,
    minimumReferenceRegressionCount: 5,
    minimumNegativeControlCount: 24,
    minimumReceiptChainLinkCount: 6,
  };
  for (const [key, minimum] of Object.entries(minimums)) {
    assertFiniteNumber(value[key], `$contract.${key}`, Number.isInteger, 'integer');
    if (value[key] < minimum) throw new TypeError(`${key} is below the governed minimum.`);
  }
  assertFiniteNumber(value.maximumReferenceRelativeDifference, '$contract.maximumReferenceRelativeDifference', (n) => n > 0 && n <= 1e-9, 'bounded positive ratio');
  assertFiniteNumber(value.maximumArtifactBytes, '$contract.maximumArtifactBytes', Number.isInteger, 'integer');
  if (value.maximumArtifactBytes <= 0 || value.maximumArtifactBytes > 1048576) throw new TypeError('maximumArtifactBytes is outside the governed bound.');
  assertFiniteNumber(value.maximumGovernedOperationCount, '$contract.maximumGovernedOperationCount', Number.isInteger, 'integer');
  if (value.maximumGovernedOperationCount <= 0 || value.maximumGovernedOperationCount > 1000000) throw new TypeError('maximumGovernedOperationCount is outside the governed bound.');
  assertArray(value.requiredDomains, '$contract.requiredDomains', { min: REQUIRED_NC08_DOMAINS.length });
  if (value.requiredDomains.length !== REQUIRED_NC08_DOMAINS.length || value.requiredDomains.some((id, index) => id !== REQUIRED_NC08_DOMAINS[index])) throw new TypeError('requiredDomains must preserve canonical coverage.');
  if (value.syntheticReferenceModuleAuthorized !== true) throw new TypeError('Synthetic reference module authority must be true.');
  for (const key of [
    'realModuleQualificationAuthorized','codeAssessmentAuthorized','realAssetAssessmentAuthorized',
    'externalCodeComplianceAuthorized','automaticCaseAcceptanceAuthorized',
    'autonomousDispositionAuthorized','fitnessForServiceAuthorized','remainingStrengthAuthorized',
    'failurePressureAuthorized','productionExecutionAuthorized','nc09Authorized',
  ]) if (value[key] !== false) throw new TypeError(`${key} is outside NC-08 synthetic authority.`);
  if (value.syntheticReferenceModuleContractHash) verifySealedHash(value, 'syntheticReferenceModuleContractHash', '$contract');
  return true;
}

export const DEFAULT_SYNTHETIC_REFERENCE_MODULE_CONTRACT = deepFreeze(createSyntheticReferenceModuleContract());
