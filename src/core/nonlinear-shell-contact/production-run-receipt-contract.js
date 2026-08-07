import {
  assertArray, assertEnum, assertExactKeys, assertFiniteNumber, assertPlainData,
  assertString, clonePlain, deepFreeze, sealWithHash, verifySealedHash,
} from './contracts.js';

export const PRODUCTION_RUN_RECEIPT_SCHEMA = 'nonlinear-shell-contact-production-run-receipt/v1';
export const REQUIRED_PRODUCTION_RUN_DOMAINS = Object.freeze([
  'NC09_DEPLOYMENT_AUTHORIZATION_BINDING',
  'CASE_INPUT_PACKAGE_CUSTODY',
  'OPERATOR_AND_RUN_WINDOW_BINDING',
  'EXACT_BUILD_AND_CONFIGURATION_MATCH',
  'EXECUTION_COMPLETION_AND_EXIT_STATUS',
  'RAW_OUTPUT_AND_PARSER_CUSTODY',
  'RESULT_RECONSTRUCTION_AND_LEDGER',
  'WARNING_EXCEPTION_AND_RETRY_CLOSURE',
  'INDEPENDENT_TECHNICAL_REVIEW',
  'OWNER_DISPOSITION_AND_RETENTION',
]);

export function createProductionRunReceiptContract(input = {}) {
  const payload = {
    schema: PRODUCTION_RUN_RECEIPT_SCHEMA,
    analysisClass: 'GOVERNED_HUMAN_REVIEWED_PRODUCTION_RUN',
    upstreamDependency: 'AUTHORIZED_NC09_DEPLOYMENT_RECEIPT',
    runIdentityPolicy: 'EXACT_DEPLOYMENT_BUILD_INPUT_OPERATOR_AND_WINDOW_BINDING',
    inputPolicy: 'IMMUTABLE_CASE_INPUT_PACKAGE_WITH_HASH_AND_SCHEMA',
    executionPolicy: 'SINGLE_REGISTERED_DEPLOYMENT_WITHOUT_FALLBACK',
    resultPolicy: 'COMPLETE_RAW_PARSED_AND_RECONSTRUCTED_OUTPUT_CUSTODY',
    reviewPolicy: 'TWO_PERSON_TECHNICAL_REVIEW_BEFORE_DISPOSITION',
    dispositionPolicy: 'HUMAN_OWNER_DISPOSITION_REQUIRED_NO_AUTOMATION',
    auditPolicy: 'APPEND_ONLY_RUN_LEDGER_AND_RETENTION',
    retryPolicy: 'EVERY_RETRY_CREATES_A_NEW_LINKED_RECEIPT',
    exceptionPolicy: 'FAIL_CLOSED_ON_PARTIAL_TIMEOUT_WARNING_OR_MISMATCH',
    minimumIndependentReviewerCount: 2,
    minimumRawArtifactCount: 3,
    maximumUnresolvedWarningCount: 0,
    maximumUnresolvedExceptionCount: 0,
    requiredDomains: [...REQUIRED_PRODUCTION_RUN_DOMAINS],
    autonomousCaseDispositionAuthorized: false,
    automaticAssetAcceptanceAuthorized: false,
    fitnessForServiceAuthorized: false,
    remainingStrengthAuthorized: false,
    failurePressureAuthorized: false,
    productionPolicyMutationAuthorized: false,
    mergeAuthorized: false,
    ...clonePlain(input),
  };
  validateProductionRunReceiptContract(payload);
  return sealWithHash(payload, 'productionRunReceiptContractHash');
}

export function validateProductionRunReceiptContract(value) {
  assertPlainData(value, '$productionRunReceiptContract');
  assertExactKeys(value, [
    'schema', 'analysisClass', 'upstreamDependency', 'runIdentityPolicy', 'inputPolicy',
    'executionPolicy', 'resultPolicy', 'reviewPolicy', 'dispositionPolicy', 'auditPolicy',
    'retryPolicy', 'exceptionPolicy', 'minimumIndependentReviewerCount',
    'minimumRawArtifactCount', 'maximumUnresolvedWarningCount',
    'maximumUnresolvedExceptionCount', 'requiredDomains',
    'autonomousCaseDispositionAuthorized', 'automaticAssetAcceptanceAuthorized',
    'fitnessForServiceAuthorized', 'remainingStrengthAuthorized',
    'failurePressureAuthorized', 'productionPolicyMutationAuthorized', 'mergeAuthorized',
  ], '$productionRunReceiptContract', ['productionRunReceiptContractHash']);
  const enums = {
    schema: [PRODUCTION_RUN_RECEIPT_SCHEMA],
    analysisClass: ['GOVERNED_HUMAN_REVIEWED_PRODUCTION_RUN'],
    upstreamDependency: ['AUTHORIZED_NC09_DEPLOYMENT_RECEIPT'],
    runIdentityPolicy: ['EXACT_DEPLOYMENT_BUILD_INPUT_OPERATOR_AND_WINDOW_BINDING'],
    inputPolicy: ['IMMUTABLE_CASE_INPUT_PACKAGE_WITH_HASH_AND_SCHEMA'],
    executionPolicy: ['SINGLE_REGISTERED_DEPLOYMENT_WITHOUT_FALLBACK'],
    resultPolicy: ['COMPLETE_RAW_PARSED_AND_RECONSTRUCTED_OUTPUT_CUSTODY'],
    reviewPolicy: ['TWO_PERSON_TECHNICAL_REVIEW_BEFORE_DISPOSITION'],
    dispositionPolicy: ['HUMAN_OWNER_DISPOSITION_REQUIRED_NO_AUTOMATION'],
    auditPolicy: ['APPEND_ONLY_RUN_LEDGER_AND_RETENTION'],
    retryPolicy: ['EVERY_RETRY_CREATES_A_NEW_LINKED_RECEIPT'],
    exceptionPolicy: ['FAIL_CLOSED_ON_PARTIAL_TIMEOUT_WARNING_OR_MISMATCH'],
  };
  for (const [field, allowed] of Object.entries(enums)) {
    assertEnum(value[field], allowed, `$productionRunReceiptContract.${field}`);
  }
  for (const [field, minimum] of [
    ['minimumIndependentReviewerCount', 2], ['minimumRawArtifactCount', 3],
  ]) {
    assertFiniteNumber(value[field], `$productionRunReceiptContract.${field}`, Number.isInteger, 'integer');
    if (value[field] < minimum) throw new TypeError(`${field} is below the governed minimum.`);
  }
  for (const field of ['maximumUnresolvedWarningCount', 'maximumUnresolvedExceptionCount']) {
    assertFiniteNumber(value[field], `$productionRunReceiptContract.${field}`, Number.isInteger, 'integer');
    if (value[field] !== 0) throw new TypeError(`${field} must be zero.`);
  }
  validateRequiredSet(value.requiredDomains, REQUIRED_PRODUCTION_RUN_DOMAINS, '$productionRunReceiptContract.requiredDomains');
  for (const field of [
    'autonomousCaseDispositionAuthorized', 'automaticAssetAcceptanceAuthorized',
    'fitnessForServiceAuthorized', 'remainingStrengthAuthorized', 'failurePressureAuthorized',
    'productionPolicyMutationAuthorized', 'mergeAuthorized',
  ]) {
    if (value[field] !== false) throw new TypeError(`${field} is outside NC-10 authority.`);
  }
  if (value.productionRunReceiptContractHash) {
    verifySealedHash(value, 'productionRunReceiptContractHash', '$productionRunReceiptContract');
  }
  return true;
}

function validateRequiredSet(value, required, path) {
  assertArray(value, path, { min: required.length });
  value.forEach((entry, index) => assertString(entry, `${path}[${index}]`));
  if (new Set(value).size !== value.length) throw new TypeError(`${path} must be unique.`);
  for (const id of required) if (!value.includes(id)) throw new TypeError(`${path} is missing ${id}.`);
}

export const DEFAULT_PRODUCTION_RUN_RECEIPT_CONTRACT = deepFreeze(createProductionRunReceiptContract());
