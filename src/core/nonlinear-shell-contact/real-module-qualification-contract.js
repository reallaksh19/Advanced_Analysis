import {
  assertArray,
  assertEnum,
  assertExactKeys,
  assertFiniteNumber,
  assertPlainData,
  clonePlain,
  deepFreeze,
  sealWithHash,
  verifySealedHash,
} from './contracts.js';

export const REAL_MODULE_QUALIFICATION_SCHEMA =
  'nonlinear-shell-contact-real-module-qualification-contract/v1';

export const REQUIRED_NC08R_DOMAINS = Object.freeze([
  'NC08R-MOD-01_SYNTHETIC_REFERENCE_RECEIPT_BINDING',
  'NC08R-MOD-02_PRODUCTION_SOURCE_AND_BUILD_IDENTITY',
  'NC08R-MOD-03_REPRODUCIBLE_SIGNED_ARTIFACT',
  'NC08R-MOD-04_DEPENDENCY_LOCK_AND_SBOM_CUSTODY',
  'NC08R-MOD-05_API_SCHEMA_AND_MIGRATION_EVIDENCE',
  'NC08R-MOD-06_REFERENCE_AND_NEGATIVE_REGRESSION',
  'NC08R-MOD-07_SECURITY_AND_RESOURCE_BOUNDARIES',
  'NC08R-MOD-08_RUNTIME_AND_CONFIGURATION_CUSTODY',
  'NC08R-MOD-09_REAL_RELEASE_REVIEW_AND_OWNER_APPROVAL',
  'NC08R-MOD-10_EXPIRY_REVOCATION_AND_REQUALIFICATION',
]);

export function createRealModuleQualificationContract(input = {}) {
  const payload = {
    schema: REAL_MODULE_QUALIFICATION_SCHEMA,
    analysisClass: 'PRODUCTION_INTENDED_NONLINEAR_SHELL_CONTACT_MODULE',
    upstreamRequirement: 'QUALIFIED_NC08_SYNTHETIC_REFERENCE_RECEIPT',
    sourcePolicy: 'EXACT_PRODUCTION_INTENDED_SOURCE_AND_TREE_IDENTITY',
    buildPolicy: 'ISOLATED_REPRODUCIBLE_BUILD_WITH_SIGNED_ARTIFACT_AND_PROVENANCE',
    dependencyPolicy: 'LOCKED_DEPENDENCIES_AND_COMPLETE_SBOM',
    schemaPolicy: 'VERSIONED_API_WITH_EXPLICIT_TESTED_MIGRATIONS',
    regressionPolicy: 'REFERENCE_AND_HOSTILE_INPUT_REGRESSION_WITHOUT_AUTHORITY_DRIFT',
    securityPolicy: 'APPROVED_RUNTIME_NO_UNDECLARED_NETWORK_EXTENSIONS_OR_DYNAMIC_CODE',
    reviewPolicy: 'REAL_TECHNICAL_REVIEW_AND_REAL_OWNER_APPROVAL_REQUIRED',
    authorityPolicy: 'MODULE_QUALIFICATION_DOES_NOT_AUTHORIZE_PRODUCTION_EXECUTION',
    changePolicy: 'ANY_GOVERNED_CHANGE_INVALIDATES_THE_RELEASE_RECEIPT',
    minimumIndependentBuildCount: 2,
    minimumReferenceRegressionCount: 5,
    minimumNegativeControlCount: 30,
    minimumReceiptChainLinkCount: 6,
    maximumReferenceRelativeDifference: 1e-12,
    maximumArtifactBytes: 1048576,
    maximumGovernedOperationCount: 100000,
    requiredDomains: [...REQUIRED_NC08R_DOMAINS],
    realModuleQualificationEvaluationAuthorized: true,
    productionExecutionAuthorized: false,
    automaticCaseAcceptanceAuthorized: false,
    autonomousDispositionAuthorized: false,
    fitnessForServiceAuthorized: false,
    remainingStrengthAuthorized: false,
    failurePressureAuthorized: false,
    nc10Authorized: false,
    ...clonePlain(input),
  };
  validateRealModuleQualificationContract(payload);
  return sealWithHash(payload, 'realModuleQualificationContractHash');
}

export function validateRealModuleQualificationContract(value) {
  assertPlainData(value, '$contract');
  assertExactKeys(value, [
    'schema',
    'analysisClass',
    'upstreamRequirement',
    'sourcePolicy',
    'buildPolicy',
    'dependencyPolicy',
    'schemaPolicy',
    'regressionPolicy',
    'securityPolicy',
    'reviewPolicy',
    'authorityPolicy',
    'changePolicy',
    'minimumIndependentBuildCount',
    'minimumReferenceRegressionCount',
    'minimumNegativeControlCount',
    'minimumReceiptChainLinkCount',
    'maximumReferenceRelativeDifference',
    'maximumArtifactBytes',
    'maximumGovernedOperationCount',
    'requiredDomains',
    'realModuleQualificationEvaluationAuthorized',
    'productionExecutionAuthorized',
    'automaticCaseAcceptanceAuthorized',
    'autonomousDispositionAuthorized',
    'fitnessForServiceAuthorized',
    'remainingStrengthAuthorized',
    'failurePressureAuthorized',
    'nc10Authorized',
  ], '$contract', ['realModuleQualificationContractHash']);

  const enums = {
    schema: [REAL_MODULE_QUALIFICATION_SCHEMA],
    analysisClass: ['PRODUCTION_INTENDED_NONLINEAR_SHELL_CONTACT_MODULE'],
    upstreamRequirement: ['QUALIFIED_NC08_SYNTHETIC_REFERENCE_RECEIPT'],
    sourcePolicy: ['EXACT_PRODUCTION_INTENDED_SOURCE_AND_TREE_IDENTITY'],
    buildPolicy: ['ISOLATED_REPRODUCIBLE_BUILD_WITH_SIGNED_ARTIFACT_AND_PROVENANCE'],
    dependencyPolicy: ['LOCKED_DEPENDENCIES_AND_COMPLETE_SBOM'],
    schemaPolicy: ['VERSIONED_API_WITH_EXPLICIT_TESTED_MIGRATIONS'],
    regressionPolicy: ['REFERENCE_AND_HOSTILE_INPUT_REGRESSION_WITHOUT_AUTHORITY_DRIFT'],
    securityPolicy: ['APPROVED_RUNTIME_NO_UNDECLARED_NETWORK_EXTENSIONS_OR_DYNAMIC_CODE'],
    reviewPolicy: ['REAL_TECHNICAL_REVIEW_AND_REAL_OWNER_APPROVAL_REQUIRED'],
    authorityPolicy: ['MODULE_QUALIFICATION_DOES_NOT_AUTHORIZE_PRODUCTION_EXECUTION'],
    changePolicy: ['ANY_GOVERNED_CHANGE_INVALIDATES_THE_RELEASE_RECEIPT'],
  };
  for (const [key, allowed] of Object.entries(enums)) {
    assertEnum(value[key], allowed, `$contract.${key}`);
  }

  const minimums = {
    minimumIndependentBuildCount: 2,
    minimumReferenceRegressionCount: 5,
    minimumNegativeControlCount: 30,
    minimumReceiptChainLinkCount: 6,
  };
  for (const [key, minimum] of Object.entries(minimums)) {
    assertFiniteNumber(value[key], `$contract.${key}`, Number.isInteger, 'integer');
    if (value[key] < minimum) throw new TypeError(`${key} is below the governed minimum.`);
  }

  assertFiniteNumber(
    value.maximumReferenceRelativeDifference,
    '$contract.maximumReferenceRelativeDifference',
    (number) => number > 0 && number <= 1e-9,
    'bounded positive ratio',
  );
  assertFiniteNumber(value.maximumArtifactBytes, '$contract.maximumArtifactBytes', Number.isInteger, 'integer');
  if (value.maximumArtifactBytes <= 0 || value.maximumArtifactBytes > 10485760) {
    throw new TypeError('maximumArtifactBytes is outside the governed bound.');
  }
  assertFiniteNumber(
    value.maximumGovernedOperationCount,
    '$contract.maximumGovernedOperationCount',
    Number.isInteger,
    'integer',
  );
  if (value.maximumGovernedOperationCount <= 0 || value.maximumGovernedOperationCount > 10000000) {
    throw new TypeError('maximumGovernedOperationCount is outside the governed bound.');
  }

  assertArray(value.requiredDomains, '$contract.requiredDomains', { min: REQUIRED_NC08R_DOMAINS.length });
  if (
    value.requiredDomains.length !== REQUIRED_NC08R_DOMAINS.length ||
    value.requiredDomains.some((id, index) => id !== REQUIRED_NC08R_DOMAINS[index])
  ) {
    throw new TypeError('requiredDomains must preserve canonical NC-08R coverage.');
  }

  if (value.realModuleQualificationEvaluationAuthorized !== true) {
    throw new TypeError('Real-module qualification evaluation must be authorized.');
  }
  for (const key of [
    'productionExecutionAuthorized',
    'automaticCaseAcceptanceAuthorized',
    'autonomousDispositionAuthorized',
    'fitnessForServiceAuthorized',
    'remainingStrengthAuthorized',
    'failurePressureAuthorized',
    'nc10Authorized',
  ]) {
    if (value[key] !== false) throw new TypeError(`${key} is outside NC-08R authority.`);
  }

  if (value.realModuleQualificationContractHash) {
    verifySealedHash(value, 'realModuleQualificationContractHash', '$contract');
  }
  return true;
}

export const DEFAULT_REAL_MODULE_QUALIFICATION_CONTRACT = deepFreeze(
  createRealModuleQualificationContract(),
);
