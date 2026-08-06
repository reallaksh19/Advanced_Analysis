import {
  assertArray, assertEnum, assertExactKeys, assertFiniteNumber, assertPlainData,
  clonePlain, deepFreeze, sealWithHash, verifySealedHash,
} from './contracts.js';

export const REAL_MODULE_QUALIFICATION_SCHEMA = 'nonlinear-shell-contact-real-module-qualification-contract/v1';
export const REQUIRED_NC08R_DOMAINS = Object.freeze([
  'NC08R-MOD-01_UPSTREAM_SYNTHETIC_REFERENCE_BINDING',
  'NC08R-MOD-02_PRODUCTION_SOURCE_AND_BUILD_IDENTITY',
  'NC08R-MOD-03_SIGNED_ARTIFACT_AND_PROVENANCE',
  'NC08R-MOD-04_DEPENDENCY_LOCK_AND_SBOM_CUSTODY',
  'NC08R-MOD-05_API_SCHEMA_AND_MIGRATION_COMPATIBILITY',
  'NC08R-MOD-06_REFERENCE_REGRESSION_AND_DETERMINISM',
  'NC08R-MOD-07_SECURITY_AND_RESOURCE_BOUNDARIES',
  'NC08R-MOD-08_REAL_RELEASE_REVIEW_AND_OWNER_APPROVAL',
  'NC08R-MOD-09_ROLLBACK_PACKAGE_AND_OPERATIONAL_READINESS',
  'NC08R-MOD-10_EXPIRY_REVOCATION_AND_REQUALIFICATION',
]);

export function createRealModuleQualificationContract(input = {}) {
  const payload = {
    schema: REAL_MODULE_QUALIFICATION_SCHEMA,
    qualificationClass: 'PRODUCTION_INTENDED_REAL_MODULE_RELEASE',
    upstreamRequirement: 'QUALIFIED_NC08_SYNTHETIC_REFERENCE_MODULE_RECEIPT',
    sourcePolicy: 'EXACT_PRODUCTION_INTENDED_SOURCE_AND_TREE_IDENTITY',
    artifactPolicy: 'SIGNED_IMMUTABLE_ARTIFACT_WITH_VERIFIED_PROVENANCE',
    dependencyPolicy: 'COMPLETE_LOCK_SBOM_AND_APPROVED_DEPENDENCY_CUSTODY',
    compatibilityPolicy: 'VERSIONED_SCHEMAS_EXPLICIT_MIGRATIONS_AND_BACKWARD_COMPATIBILITY',
    regressionPolicy: 'REPRODUCIBLE_BUILD_AND_COMPLETE_REFERENCE_REGRESSION',
    securityPolicy: 'FAIL_CLOSED_SECURITY_RESOURCE_AND_SUPPLY_CHAIN_REVIEW',
    approvalPolicy: 'REAL_IDENTIFIED_TECHNICAL_REVIEW_AND_OWNER_RELEASE_APPROVAL',
    operationsPolicy: 'VERSIONED_RUNBOOK_INSTALL_ROLLBACK_AND_RECOVERY_PACKAGE',
    lifecyclePolicy: 'EXPIRY_REVOCATION_AND_BYTE_CHANGE_REQUALIFICATION',
    minimumIndependentBuildCount: 2,
    minimumReferenceRegressionCount: 5,
    minimumNegativeControlCount: 20,
    maximumReferenceRelativeDifference: 1e-12,
    maximumArtifactBytes: 1048576,
    maximumGovernedOperationCount: 1000000,
    requiredDomains: [...REQUIRED_NC08R_DOMAINS],
    realModuleQualificationAuthorized: true,
    productionExecutionAuthorized: false,
    nc10Authorized: false,
    automaticCaseAcceptanceAuthorized: false,
    autonomousDispositionAuthorized: false,
    fitnessForServiceAuthorized: false,
    remainingStrengthAuthorized: false,
    failurePressureAuthorized: false,
    ...clonePlain(input),
  };
  validateRealModuleQualificationContract(payload);
  return sealWithHash(payload, 'realModuleQualificationContractHash');
}

export function validateRealModuleQualificationContract(value) {
  assertPlainData(value, '$contract');
  assertExactKeys(value, [
    'schema','qualificationClass','upstreamRequirement','sourcePolicy','artifactPolicy',
    'dependencyPolicy','compatibilityPolicy','regressionPolicy','securityPolicy',
    'approvalPolicy','operationsPolicy','lifecyclePolicy','minimumIndependentBuildCount',
    'minimumReferenceRegressionCount','minimumNegativeControlCount',
    'maximumReferenceRelativeDifference','maximumArtifactBytes','maximumGovernedOperationCount',
    'requiredDomains','realModuleQualificationAuthorized','productionExecutionAuthorized',
    'nc10Authorized','automaticCaseAcceptanceAuthorized','autonomousDispositionAuthorized',
    'fitnessForServiceAuthorized','remainingStrengthAuthorized','failurePressureAuthorized',
  ], '$contract', ['realModuleQualificationContractHash']);
  const enums = {
    schema: [REAL_MODULE_QUALIFICATION_SCHEMA],
    qualificationClass: ['PRODUCTION_INTENDED_REAL_MODULE_RELEASE'],
    upstreamRequirement: ['QUALIFIED_NC08_SYNTHETIC_REFERENCE_MODULE_RECEIPT'],
    sourcePolicy: ['EXACT_PRODUCTION_INTENDED_SOURCE_AND_TREE_IDENTITY'],
    artifactPolicy: ['SIGNED_IMMUTABLE_ARTIFACT_WITH_VERIFIED_PROVENANCE'],
    dependencyPolicy: ['COMPLETE_LOCK_SBOM_AND_APPROVED_DEPENDENCY_CUSTODY'],
    compatibilityPolicy: ['VERSIONED_SCHEMAS_EXPLICIT_MIGRATIONS_AND_BACKWARD_COMPATIBILITY'],
    regressionPolicy: ['REPRODUCIBLE_BUILD_AND_COMPLETE_REFERENCE_REGRESSION'],
    securityPolicy: ['FAIL_CLOSED_SECURITY_RESOURCE_AND_SUPPLY_CHAIN_REVIEW'],
    approvalPolicy: ['REAL_IDENTIFIED_TECHNICAL_REVIEW_AND_OWNER_RELEASE_APPROVAL'],
    operationsPolicy: ['VERSIONED_RUNBOOK_INSTALL_ROLLBACK_AND_RECOVERY_PACKAGE'],
    lifecyclePolicy: ['EXPIRY_REVOCATION_AND_BYTE_CHANGE_REQUALIFICATION'],
  };
  for (const [key, allowed] of Object.entries(enums)) assertEnum(value[key], allowed, `$contract.${key}`);
  const minimums = { minimumIndependentBuildCount: 2, minimumReferenceRegressionCount: 5, minimumNegativeControlCount: 20 };
  for (const [key, minimum] of Object.entries(minimums)) {
    assertFiniteNumber(value[key], `$contract.${key}`, Number.isInteger, 'integer');
    if (value[key] < minimum) throw new TypeError(`${key} is below the governed minimum.`);
  }
  assertFiniteNumber(value.maximumReferenceRelativeDifference, '$contract.maximumReferenceRelativeDifference', (n) => n > 0 && n <= 1e-9, 'bounded positive ratio');
  assertFiniteNumber(value.maximumArtifactBytes, '$contract.maximumArtifactBytes', Number.isInteger, 'integer');
  if (value.maximumArtifactBytes <= 0 || value.maximumArtifactBytes > 16777216) throw new TypeError('maximumArtifactBytes is outside the governed bound.');
  assertFiniteNumber(value.maximumGovernedOperationCount, '$contract.maximumGovernedOperationCount', Number.isInteger, 'integer');
  if (value.maximumGovernedOperationCount <= 0 || value.maximumGovernedOperationCount > 10000000) throw new TypeError('maximumGovernedOperationCount is outside the governed bound.');
  assertArray(value.requiredDomains, '$contract.requiredDomains', { min: REQUIRED_NC08R_DOMAINS.length });
  if (value.requiredDomains.length !== REQUIRED_NC08R_DOMAINS.length || value.requiredDomains.some((id, i) => id !== REQUIRED_NC08R_DOMAINS[i])) throw new TypeError('requiredDomains must preserve canonical coverage.');
  if (value.realModuleQualificationAuthorized !== true) throw new TypeError('Real-module qualification authority must be true.');
  for (const key of ['productionExecutionAuthorized','nc10Authorized','automaticCaseAcceptanceAuthorized','autonomousDispositionAuthorized','fitnessForServiceAuthorized','remainingStrengthAuthorized','failurePressureAuthorized']) {
    if (value[key] !== false) throw new TypeError(`${key} is outside NC-08R authority.`);
  }
  if (value.realModuleQualificationContractHash) verifySealedHash(value, 'realModuleQualificationContractHash', '$contract');
  return true;
}

export const DEFAULT_REAL_MODULE_QUALIFICATION_CONTRACT = deepFreeze(createRealModuleQualificationContract());
