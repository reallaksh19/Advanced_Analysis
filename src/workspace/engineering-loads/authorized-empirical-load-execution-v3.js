import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import { clonePlain } from '../dataset-utils.js';
import {
  createEvidenceValue,
  validateProjectDataProfile,
} from '../project-data/project-data-contract.js';
import {
  assertEnrichmentProductionComponentWeightOverlay,
} from '../engineering-enrichment/production-component-weight-overlay.js';
import { requireAuthorizedEmpiricalLoadInput } from './authorized-empirical-load-input.js';
import { buildAuthorizedEmpiricalLoadProfile } from './authorized-empirical-load-execution.js';
import {
  AUTHORIZED_EMPIRICAL_EXECUTION_METHODS,
} from './authorized-empirical-load-execution-v2.js';
import {
  EMPIRICAL_LOAD_METHOD,
  calculateSupportLoadDistribution,
  calculateSupportLoadDistributionWithComponentCog,
} from './support-load-distribution-v3.js';

export const AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V3_REQUEST_SCHEMA =
  'authorized-empirical-load-execution-request/v3';
export const AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V3_SCHEMA =
  'authorized-empirical-load-execution/v3';

const REQUEST_KEYS = [
  'schema', 'executionId', 'executedAt', 'method', 'authorizedInput',
  'sealedComponentWeightOverlay', 'dataset', 'profile', 'supportSiteModel',
  'routePartitionModel', 'masterData',
];
const OUTPUT_KEYS = [
  'schema', 'executionId', 'executedAt', 'requestedMethod', 'executedMethod',
  'projectId', 'datasetId', 'datasetVersion', 'authorizedInputSemanticHash',
  'baseOverlaySemanticHash', 'engineeringInputSealHash',
  'engineeringInputSealCurrentnessHash', 'componentWeightOverlayHash',
  'activatedEnrichmentFieldFamilies', 'effectiveComponentWeightsSemanticHash',
  'ephemeralProfileSemanticHash', 'distributionSemanticHash', 'status', 'summary',
  'distribution', 'semanticHash',
];

export function authorizedEmpiricalLoadExecutionV3SemanticProjection(value) {
  return Object.fromEntries(OUTPUT_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeAuthorizedEmpiricalLoadExecutionV3SemanticHash(value) {
  return semanticHash(authorizedEmpiricalLoadExecutionV3SemanticProjection(value));
}

/**
 * Package 5A production cutover. Executes the existing authorized gravity
 * method with exactly one additional sealed field family: component weights.
 * V2/V3 gravity mechanics are reused unchanged.
 */
export function calculateAuthorizedEmpiricalLoadExecutionV3(value) {
  exact(value, REQUEST_KEYS, 'authorizedEmpiricalLoadExecutionV3Request');
  if (value.schema !== AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V3_REQUEST_SCHEMA) {
    fail('Unsupported authorized empirical V3 execution request.', 'EMPIRICAL_EXECUTION_V3_SCHEMA_INVALID');
  }
  const requestedMethod = method(value.method);
  const authorizedInput = requireAuthorizedEmpiricalLoadInput(value.authorizedInput);
  const enrichment = assertEnrichmentProductionComponentWeightOverlay(
    value.sealedComponentWeightOverlay,
  );
  if (enrichment.status !== 'READY_FOR_PRODUCTION_CONSUMPTION') {
    fail(
      'Sealed component-weight enrichment overlay is not production-ready.',
      'EMPIRICAL_EXECUTION_V3_ENRICHMENT_BLOCKED',
      { blockers: enrichment.blockers },
    );
  }
  if (enrichment.sourceDatasetHash !== value.dataset?.sourceSha256
      || enrichment.sourceSharedModelHash !== value.dataset?.sharedModel?.semanticHash) {
    fail(
      'Sealed component-weight overlay is bound to a different active dataset.',
      'EMPIRICAL_EXECUTION_V3_ENRICHMENT_SOURCE_MISMATCH',
    );
  }

  const baseProfile = buildAuthorizedEmpiricalLoadProfile(value.profile, authorizedInput);
  const profile = applyComponentWeightEnrichment(baseProfile, enrichment);
  const activeHashes = masterHashes(value.masterData, value.dataset);
  const errors = [
    ...validateProjectDataProfile(profile, 'loads', activeHashes).errors,
    ...validateProjectDataProfile(profile, 'topology', activeHashes).errors,
  ];
  if (errors.length > 0) {
    fail(
      'The sealed-enrichment ephemeral Project Data profile is not calculation-ready.',
      'EMPIRICAL_EXECUTION_V3_PROFILE_BLOCKED',
      { errors },
    );
  }

  const calculationInput = {
    dataset: value.dataset,
    profile,
    supportSiteModel: value.supportSiteModel,
    routePartitionModel: value.routePartitionModel,
    masterData: value.masterData,
  };
  const distribution = requestedMethod === EMPIRICAL_LOAD_METHOD
    ? calculateSupportLoadDistribution(calculationInput)
    : calculateSupportLoadDistributionWithComponentCog(calculationInput);
  if (distribution.method !== requestedMethod) {
    fail(
      'Executed empirical method differs from the authorized method.',
      'EMPIRICAL_EXECUTION_V3_METHOD_MISMATCH',
      { requestedMethod, executedMethod: distribution.method },
    );
  }

  const effectiveComponentWeights = clonePlain(
    profile.loadCalculation.componentWeightsKg?.value
      ?? profile.loadCalculation.componentWeightsKg,
  );
  const draft = {
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V3_SCHEMA,
    executionId: identity(value.executionId, 'executionId'),
    executedAt: timestamp(value.executedAt, 'executedAt'),
    requestedMethod,
    executedMethod: distribution.method,
    projectId: authorizedInput.projectId,
    datasetId: identity(value.dataset?.datasetId, 'dataset.datasetId'),
    datasetVersion: nullableVersion(value.dataset?.version),
    authorizedInputSemanticHash: authorizedInput.semanticHash,
    baseOverlaySemanticHash: authorizedInput.overlaySemanticHash,
    engineeringInputSealHash: enrichment.sealHash,
    engineeringInputSealCurrentnessHash: enrichment.currentnessHash,
    componentWeightOverlayHash: enrichment.overlayHash,
    activatedEnrichmentFieldFamilies: ['COMPONENT_WEIGHTS'],
    effectiveComponentWeightsSemanticHash: semanticHash(effectiveComponentWeights),
    ephemeralProfileSemanticHash: semanticHash(profile),
    distributionSemanticHash: semanticHash(distribution),
    status: distribution.status,
    summary: summarize(distribution),
    distribution,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireAuthorizedEmpiricalLoadExecutionV3({
    ...draft,
    semanticHash: computeAuthorizedEmpiricalLoadExecutionV3SemanticHash(draft),
  });
}

export function requireAuthorizedEmpiricalLoadExecutionV3(value) {
  exact(value, OUTPUT_KEYS, 'authorizedEmpiricalLoadExecutionV3');
  if (value.schema !== AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V3_SCHEMA) {
    fail('Unsupported authorized empirical V3 execution.', 'EMPIRICAL_EXECUTION_V3_SCHEMA_INVALID');
  }
  const result = {
    ...value,
    executionId: identity(value.executionId, 'executionId'),
    executedAt: timestamp(value.executedAt, 'executedAt'),
    requestedMethod: method(value.requestedMethod),
    executedMethod: method(value.executedMethod),
    projectId: identity(value.projectId, 'projectId'),
    datasetId: identity(value.datasetId, 'datasetId'),
    datasetVersion: nullableVersion(value.datasetVersion),
    authorizedInputSemanticHash: hash(value.authorizedInputSemanticHash, 'authorizedInputSemanticHash'),
    baseOverlaySemanticHash: hash(value.baseOverlaySemanticHash, 'baseOverlaySemanticHash'),
    engineeringInputSealHash: hash(value.engineeringInputSealHash, 'engineeringInputSealHash'),
    engineeringInputSealCurrentnessHash: hash(
      value.engineeringInputSealCurrentnessHash,
      'engineeringInputSealCurrentnessHash',
    ),
    componentWeightOverlayHash: hash(value.componentWeightOverlayHash, 'componentWeightOverlayHash'),
    activatedEnrichmentFieldFamilies: fieldFamilies(value.activatedEnrichmentFieldFamilies),
    effectiveComponentWeightsSemanticHash: hash(
      value.effectiveComponentWeightsSemanticHash,
      'effectiveComponentWeightsSemanticHash',
    ),
    ephemeralProfileSemanticHash: hash(value.ephemeralProfileSemanticHash, 'ephemeralProfileSemanticHash'),
    distributionSemanticHash: hash(value.distributionSemanticHash, 'distributionSemanticHash'),
    status: executionStatus(value.status),
    summary: requireSummary(value.summary),
    distribution: requireDistribution(value.distribution),
    semanticHash: hash(value.semanticHash, 'semanticHash'),
  };
  if (result.requestedMethod !== result.executedMethod
      || result.distribution.method !== result.executedMethod) {
    fail(
      'Authorized, executed and distribution methods do not agree.',
      'EMPIRICAL_EXECUTION_V3_METHOD_MISMATCH',
    );
  }
  if (result.distribution.status !== result.status) {
    fail('Execution status differs from distribution.', 'EMPIRICAL_EXECUTION_V3_STATUS_MISMATCH');
  }
  if (result.distributionSemanticHash !== semanticHash(result.distribution)) {
    fail('Distribution semantic hash is stale.', 'EMPIRICAL_EXECUTION_V3_HASH_MISMATCH');
  }
  if (semanticHash(result.summary) !== semanticHash(summarize(result.distribution))) {
    fail('Execution summary is stale.', 'EMPIRICAL_EXECUTION_V3_SUMMARY_MISMATCH');
  }
  if (result.semanticHash !== computeAuthorizedEmpiricalLoadExecutionV3SemanticHash(result)) {
    fail('Execution semantic hash is stale.', 'EMPIRICAL_EXECUTION_V3_HASH_MISMATCH');
  }
  return deepFreeze(result);
}

export function applySealedComponentWeightEnrichmentToAuthorizedProfile(
  profile,
  authorizedInput,
  sealedComponentWeightOverlay,
) {
  const input = requireAuthorizedEmpiricalLoadInput(authorizedInput);
  const enrichment = assertEnrichmentProductionComponentWeightOverlay(
    sealedComponentWeightOverlay,
  );
  if (enrichment.status !== 'READY_FOR_PRODUCTION_CONSUMPTION') {
    fail('Production component-weight overlay is blocked.', 'EMPIRICAL_EXECUTION_V3_ENRICHMENT_BLOCKED');
  }
  return applyComponentWeightEnrichment(
    buildAuthorizedEmpiricalLoadProfile(profile, input),
    enrichment,
  );
}

function applyComponentWeightEnrichment(profile, enrichment) {
  const loadCalculation = clonePlain(profile.loadCalculation);
  loadCalculation.componentWeightsKg = createEvidenceValue(
    clonePlain(enrichment.componentWeightsKg),
    {
      source: 'SEALED_ENGINEERING_ENRICHMENT_COMPONENT_WEIGHTS',
      schema: enrichment.schema,
      sealId: enrichment.sealId,
      sealHash: enrichment.sealHash,
      currentnessHash: enrichment.currentnessHash,
      candidateProjectionHash: enrichment.candidateProjectionHash,
      overlayHash: enrichment.overlayHash,
      activatedFieldFamilies: enrichment.activatedFieldFamilies,
    },
    true,
  );
  return deepFreeze({
    ...clonePlain(profile),
    loadCalculation,
  });
}

function requireDistribution(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.schema !== 'string' || !Array.isArray(value.loadCases)) {
    fail('A support-load distribution is required.', 'EMPIRICAL_EXECUTION_V3_DISTRIBUTION_INVALID');
  }
  return clonePlain(value);
}

function summarize(distribution) {
  const cases = Array.isArray(distribution.loadCases) ? distribution.loadCases : [];
  return {
    loadCaseCount: cases.length,
    calculatedCaseCount: cases.filter((row) => row.status === 'CALCULATED').length,
    blockedCaseCount: cases.filter((row) => row.status === 'BLOCKED').length,
    contributionCount: cases.reduce((total, row) => (
      total + (Array.isArray(row.contributionLedger) ? row.contributionLedger.length : 0)
    ), 0),
    excludedInputCount: cases.reduce((total, row) => (
      total + (Array.isArray(row.excludedInputs) ? row.excludedInputs.length : 0)
    ), 0),
  };
}

function requireSummary(value) {
  exact(value, [
    'loadCaseCount', 'calculatedCaseCount', 'blockedCaseCount',
    'contributionCount', 'excludedInputCount',
  ], 'summary');
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    nonnegativeInteger(item, `summary.${key}`),
  ]));
}

function masterHashes(masterData, dataset) {
  return {
    dataset: dataset?.sourceSha256 || '',
    lineList: masterData?.lineList?.sourceHash || '',
    pipingClass: masterData?.pipingClass?.sourceHash || '',
    componentWeight: masterData?.weight?.sourceHash || '',
  };
}

function method(value) {
  if (!AUTHORIZED_EMPIRICAL_EXECUTION_METHODS.includes(value)) {
    fail(
      'Authorized empirical method is unsupported.',
      'EMPIRICAL_EXECUTION_V3_METHOD_INVALID',
      { value, allowed: AUTHORIZED_EMPIRICAL_EXECUTION_METHODS },
    );
  }
  return value;
}

function fieldFamilies(value) {
  if (JSON.stringify(value) !== JSON.stringify(['COMPONENT_WEIGHTS'])) {
    fail('Package 5A may activate only COMPONENT_WEIGHTS.', 'EMPIRICAL_EXECUTION_V3_FIELD_FAMILY_INVALID');
  }
  return ['COMPONENT_WEIGHTS'];
}

function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`, 'EMPIRICAL_EXECUTION_V3_TYPE_INVALID');
  }
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} contains unexpected or missing keys.`, 'EMPIRICAL_EXECUTION_V3_KEYS_INVALID', { actual, expected });
  }
}

function identity(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail(`${label} must be a non-empty trimmed string.`, 'EMPIRICAL_EXECUTION_V3_IDENTITY_INVALID');
  }
  return value;
}

function timestamp(value, label) {
  const result = identity(value, label);
  if (new Date(result).toISOString() !== result) {
    fail(`${label} must be a canonical ISO-8601 timestamp.`, 'EMPIRICAL_EXECUTION_V3_TIMESTAMP_INVALID');
  }
  return result;
}

function hash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    fail(`${label} must be an FNV-1a semantic hash.`, 'EMPIRICAL_EXECUTION_V3_HASH_INVALID');
  }
  return value;
}

function nullableVersion(value) {
  if (value === null || value === undefined) return null;
  if ((typeof value !== 'string' && !Number.isInteger(value))
      || (typeof value === 'string' && value.length === 0)) {
    fail('datasetVersion must be null, integer or non-empty string.', 'EMPIRICAL_EXECUTION_V3_VERSION_INVALID');
  }
  return value;
}

function nonnegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer.`, 'EMPIRICAL_EXECUTION_V3_NUMBER_INVALID');
  }
  return value;
}

function executionStatus(value) {
  if (!['CALCULATED', 'BLOCKED'].includes(value)) {
    fail('Execution status must be CALCULATED or BLOCKED.', 'EMPIRICAL_EXECUTION_V3_STATUS_INVALID');
  }
  return value;
}

function ascii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message, code, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details === null ? null : deepFreeze(details);
  throw error;
}
