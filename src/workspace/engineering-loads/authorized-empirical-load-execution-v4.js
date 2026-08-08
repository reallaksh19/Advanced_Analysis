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
import {
  assertEnrichmentProductionOperatingFluidDensityOverlay,
} from '../engineering-enrichment/production-operating-fluid-density-overlay.js';
import {
  assertEngineeringEnrichmentObservedAuthority,
} from '../engineering-enrichment/review-package-validation.js';
import { requireAuthorizedEmpiricalLoadInput } from './authorized-empirical-load-input.js';
import {
  applySealedComponentWeightEnrichmentToAuthorizedProfile,
} from './authorized-empirical-load-execution-v3.js';
import {
  AUTHORIZED_EMPIRICAL_EXECUTION_METHODS,
} from './authorized-empirical-load-execution-v2.js';
import {
  EMPIRICAL_LOAD_METHOD,
  calculateSupportLoadDistribution,
  calculateSupportLoadDistributionWithComponentCog,
} from './support-load-distribution-v3.js';

export const AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V4_REQUEST_SCHEMA =
  'authorized-empirical-load-execution-request/v4';
export const AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V4_SCHEMA =
  'authorized-empirical-load-execution/v4';

const FIELD_FAMILIES = ['COMPONENT_WEIGHTS', 'OPERATING_FLUID_DENSITIES'];
const REQUEST_KEYS = [
  'schema', 'executionId', 'executedAt', 'method', 'authorizedInput',
  'sealedComponentWeightOverlay', 'componentObservedAuthority',
  'sealedOperatingFluidDensityOverlay', 'operatingFluidObservedAuthority',
  'dataset', 'profile', 'supportSiteModel', 'routePartitionModel', 'masterData',
];
const OUTPUT_KEYS = [
  'schema', 'executionId', 'executedAt', 'requestedMethod', 'executedMethod',
  'projectId', 'datasetId', 'datasetVersion', 'authorizedInputSemanticHash',
  'baseOverlaySemanticHash',
  'componentWeightSealHash', 'componentWeightCurrentnessHash',
  'componentObservedAuthorityHash', 'componentWeightOverlayHash',
  'operatingFluidDensitySealHash', 'operatingFluidDensityCurrentnessHash',
  'operatingFluidObservedAuthorityHash', 'operatingFluidDensityOverlayHash',
  'activatedEnrichmentFieldFamilies',
  'effectiveComponentWeightsSemanticHash',
  'effectiveOperatingFluidDensitiesSemanticHash',
  'effectiveHydroFluidDensitiesSemanticHash',
  'ephemeralProfileSemanticHash', 'distributionSemanticHash',
  'status', 'summary', 'distribution', 'semanticHash',
];

export function authorizedEmpiricalLoadExecutionV4SemanticProjection(value) {
  return Object.fromEntries(OUTPUT_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeAuthorizedEmpiricalLoadExecutionV4SemanticHash(value) {
  return semanticHash(authorizedEmpiricalLoadExecutionV4SemanticProjection(value));
}

/**
 * Package 5B production cutover. Component weights remain governed by the
 * independently sealed Package 5A overlay; process/service fluid density is
 * added as a second independently sealed authority. The two reviews must have
 * been performed against identical context identities and both must still be
 * current against the active source and Project Data at execution time.
 *
 * The exact fluid register governs OPE service-fluid density only. HYD remains
 * on the existing authorized hydrotest-fluid input because hydro medium is a
 * separate engineering decision.
 */
export function calculateAuthorizedEmpiricalLoadExecutionV4(value) {
  exact(value, REQUEST_KEYS, 'authorizedEmpiricalLoadExecutionV4Request');
  if (value.schema !== AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V4_REQUEST_SCHEMA) {
    fail('Unsupported authorized empirical V4 execution request.', 'EMPIRICAL_EXECUTION_V4_SCHEMA_INVALID');
  }
  const requestedMethod = method(value.method);
  const authorizedInput = requireAuthorizedEmpiricalLoadInput(value.authorizedInput);
  const component = assertEnrichmentProductionComponentWeightOverlay(
    value.sealedComponentWeightOverlay,
  );
  const operatingFluid = assertEnrichmentProductionOperatingFluidDensityOverlay(
    value.sealedOperatingFluidDensityOverlay,
  );
  const componentObserved = assertEngineeringEnrichmentObservedAuthority(
    value.componentObservedAuthority,
  );
  const fluidObserved = assertEngineeringEnrichmentObservedAuthority(
    value.operatingFluidObservedAuthority,
  );

  ready(component, 'component-weight', 'EMPIRICAL_EXECUTION_V4_COMPONENT_ENRICHMENT_BLOCKED');
  ready(operatingFluid, 'operating-fluid-density', 'EMPIRICAL_EXECUTION_V4_FLUID_ENRICHMENT_BLOCKED');
  observedBinding(
    component,
    componentObserved,
    'component-weight',
    'EMPIRICAL_EXECUTION_V4_COMPONENT_OBSERVED_AUTHORITY_MISMATCH',
  );
  observedBinding(
    operatingFluid,
    fluidObserved,
    'operating-fluid-density',
    'EMPIRICAL_EXECUTION_V4_FLUID_OBSERVED_AUTHORITY_MISMATCH',
  );
  sourceBinding(component, componentObserved, value.dataset, 'component-weight');
  sourceBinding(operatingFluid, fluidObserved, value.dataset, 'operating-fluid-density');

  if (semanticHash(componentObserved.contextIdentities)
      !== semanticHash(fluidObserved.contextIdentities)) {
    fail(
      'Component-weight and operating-fluid approvals were reviewed against different context identities.',
      'EMPIRICAL_EXECUTION_V4_CONTEXT_AUTHORITY_MISMATCH',
    );
  }
  const activeProjectDataHash = semanticHash(value.profile);
  for (const observed of [componentObserved, fluidObserved]) {
    if (observed.contextIdentities?.projectDataHash !== activeProjectDataHash) {
      fail(
        'Active Project Data changed after one or more enrichment review/seal authority snapshots.',
        'EMPIRICAL_EXECUTION_V4_PROJECT_DATA_STALE',
        {
          sealedProjectDataHash: observed.contextIdentities?.projectDataHash ?? null,
          activeProjectDataHash,
        },
      );
    }
  }

  const authorizedLineKeys = uniqueSorted(
    authorizedInput.lineBindings.map((row) => identity(row.lineKey, 'lineBindings.lineKey')),
  );
  const fluidLineKeys = Object.keys(operatingFluid.operatingFluidDensitiesKgPerM3).sort(ascii);
  if (JSON.stringify(fluidLineKeys) !== JSON.stringify(authorizedLineKeys)) {
    fail(
      'Package 5B requires a complete sealed operating-fluid-density map for every authorized line binding.',
      'EMPIRICAL_EXECUTION_V4_OPERATING_FLUID_COVERAGE_INCOMPLETE',
      { authorizedLineKeys, fluidLineKeys },
    );
  }

  const componentProfile = applySealedComponentWeightEnrichmentToAuthorizedProfile(
    value.profile,
    authorizedInput,
    component,
  );
  const profile = applyOperatingFluidDensityEnrichment(componentProfile, operatingFluid);
  const activeHashes = masterHashes(value.masterData, value.dataset);
  const errors = [
    ...validateProjectDataProfile(profile, 'loads', activeHashes).errors,
    ...validateProjectDataProfile(profile, 'topology', activeHashes).errors,
  ];
  if (errors.length > 0) {
    fail(
      'The Package 5B sealed-enrichment Project Data profile is not calculation-ready.',
      'EMPIRICAL_EXECUTION_V4_PROFILE_BLOCKED',
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
      'EMPIRICAL_EXECUTION_V4_METHOD_MISMATCH',
      { requestedMethod, executedMethod: distribution.method },
    );
  }

  const effectiveComponentWeights = projectDataPayload(
    profile.loadCalculation.componentWeightsKg,
  );
  const effectiveOperatingFluidDensities = projectDataPayload(
    profile.loadCalculation.operatingFluidDensitiesKgPerM3,
  );
  const effectiveHydroFluidDensities = projectDataPayload(
    profile.loadCalculation.hydroFluidDensitiesKgPerM3,
  );
  const draft = {
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V4_SCHEMA,
    executionId: identity(value.executionId, 'executionId'),
    executedAt: timestamp(value.executedAt, 'executedAt'),
    requestedMethod,
    executedMethod: distribution.method,
    projectId: authorizedInput.projectId,
    datasetId: identity(value.dataset?.datasetId, 'dataset.datasetId'),
    datasetVersion: nullableVersion(value.dataset?.version),
    authorizedInputSemanticHash: authorizedInput.semanticHash,
    baseOverlaySemanticHash: authorizedInput.overlaySemanticHash,
    componentWeightSealHash: component.sealHash,
    componentWeightCurrentnessHash: component.currentnessHash,
    componentObservedAuthorityHash: componentObserved.observedAuthorityHash,
    componentWeightOverlayHash: component.overlayHash,
    operatingFluidDensitySealHash: operatingFluid.sealHash,
    operatingFluidDensityCurrentnessHash: operatingFluid.currentnessHash,
    operatingFluidObservedAuthorityHash: fluidObserved.observedAuthorityHash,
    operatingFluidDensityOverlayHash: operatingFluid.overlayHash,
    activatedEnrichmentFieldFamilies: FIELD_FAMILIES,
    effectiveComponentWeightsSemanticHash: semanticHash(effectiveComponentWeights),
    effectiveOperatingFluidDensitiesSemanticHash: semanticHash(effectiveOperatingFluidDensities),
    effectiveHydroFluidDensitiesSemanticHash: semanticHash(effectiveHydroFluidDensities),
    ephemeralProfileSemanticHash: semanticHash(profile),
    distributionSemanticHash: semanticHash(distribution),
    status: distribution.status,
    summary: summarize(distribution),
    distribution,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireAuthorizedEmpiricalLoadExecutionV4({
    ...draft,
    semanticHash: computeAuthorizedEmpiricalLoadExecutionV4SemanticHash(draft),
  });
}

export function requireAuthorizedEmpiricalLoadExecutionV4(value) {
  exact(value, OUTPUT_KEYS, 'authorizedEmpiricalLoadExecutionV4');
  if (value.schema !== AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V4_SCHEMA) {
    fail('Unsupported authorized empirical V4 execution.', 'EMPIRICAL_EXECUTION_V4_SCHEMA_INVALID');
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
    componentWeightSealHash: hash(value.componentWeightSealHash, 'componentWeightSealHash'),
    componentWeightCurrentnessHash: hash(
      value.componentWeightCurrentnessHash,
      'componentWeightCurrentnessHash',
    ),
    componentObservedAuthorityHash: hash(
      value.componentObservedAuthorityHash,
      'componentObservedAuthorityHash',
    ),
    componentWeightOverlayHash: hash(value.componentWeightOverlayHash, 'componentWeightOverlayHash'),
    operatingFluidDensitySealHash: hash(
      value.operatingFluidDensitySealHash,
      'operatingFluidDensitySealHash',
    ),
    operatingFluidDensityCurrentnessHash: hash(
      value.operatingFluidDensityCurrentnessHash,
      'operatingFluidDensityCurrentnessHash',
    ),
    operatingFluidObservedAuthorityHash: hash(
      value.operatingFluidObservedAuthorityHash,
      'operatingFluidObservedAuthorityHash',
    ),
    operatingFluidDensityOverlayHash: hash(
      value.operatingFluidDensityOverlayHash,
      'operatingFluidDensityOverlayHash',
    ),
    activatedEnrichmentFieldFamilies: fieldFamilies(value.activatedEnrichmentFieldFamilies),
    effectiveComponentWeightsSemanticHash: hash(
      value.effectiveComponentWeightsSemanticHash,
      'effectiveComponentWeightsSemanticHash',
    ),
    effectiveOperatingFluidDensitiesSemanticHash: hash(
      value.effectiveOperatingFluidDensitiesSemanticHash,
      'effectiveOperatingFluidDensitiesSemanticHash',
    ),
    effectiveHydroFluidDensitiesSemanticHash: hash(
      value.effectiveHydroFluidDensitiesSemanticHash,
      'effectiveHydroFluidDensitiesSemanticHash',
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
      'EMPIRICAL_EXECUTION_V4_METHOD_MISMATCH',
    );
  }
  if (result.distribution.status !== result.status) {
    fail('Execution status differs from distribution.', 'EMPIRICAL_EXECUTION_V4_STATUS_MISMATCH');
  }
  if (result.distributionSemanticHash !== semanticHash(result.distribution)) {
    fail('Distribution semantic hash is stale.', 'EMPIRICAL_EXECUTION_V4_HASH_MISMATCH');
  }
  if (semanticHash(result.summary) !== semanticHash(summarize(result.distribution))) {
    fail('Execution summary is stale.', 'EMPIRICAL_EXECUTION_V4_SUMMARY_MISMATCH');
  }
  if (result.semanticHash !== computeAuthorizedEmpiricalLoadExecutionV4SemanticHash(result)) {
    fail('Execution semantic hash is stale.', 'EMPIRICAL_EXECUTION_V4_HASH_MISMATCH');
  }
  return deepFreeze(result);
}

function applyOperatingFluidDensityEnrichment(profile, enrichment) {
  const loadCalculation = clonePlain(profile.loadCalculation);
  loadCalculation.operatingFluidDensitiesKgPerM3 = createEvidenceValue(
    clonePlain(enrichment.operatingFluidDensitiesKgPerM3),
    {
      source: 'SEALED_ENGINEERING_ENRICHMENT_OPERATING_FLUID_DENSITIES',
      schema: enrichment.schema,
      sealId: enrichment.sealId,
      sealHash: enrichment.sealHash,
      currentnessHash: enrichment.currentnessHash,
      observedAuthorityHash: enrichment.observedAuthorityHash,
      candidateProjectionHash: enrichment.candidateProjectionHash,
      overlayHash: enrichment.overlayHash,
      activatedFieldFamilies: enrichment.activatedFieldFamilies,
      hydroFluidDensitiesActivated: false,
    },
    true,
  );
  return deepFreeze({
    ...clonePlain(profile),
    loadCalculation,
  });
}

function ready(overlay, label, code) {
  if (overlay.status !== 'READY_FOR_PRODUCTION_CONSUMPTION') {
    fail(`Sealed ${label} enrichment overlay is not production-ready.`, code, {
      blockers: overlay.blockers,
    });
  }
}

function observedBinding(overlay, observed, label, code) {
  if (observed.observedAuthorityHash !== overlay.observedAuthorityHash) {
    fail(`Observed ${label} authority changed after the production overlay was built.`, code, {
      overlayObservedAuthorityHash: overlay.observedAuthorityHash,
      executionObservedAuthorityHash: observed.observedAuthorityHash,
    });
  }
}

function sourceBinding(overlay, observed, dataset, label) {
  if (overlay.sourceDatasetHash !== dataset?.sourceSha256
      || overlay.sourceSharedModelHash !== dataset?.sharedModel?.semanticHash
      || observed.sourceDatasetHash !== overlay.sourceDatasetHash
      || observed.sourceSharedModelHash !== overlay.sourceSharedModelHash) {
    fail(
      `Sealed ${label} authority is bound to a different active dataset.`,
      'EMPIRICAL_EXECUTION_V4_ENRICHMENT_SOURCE_MISMATCH',
      { label },
    );
  }
}

function projectDataPayload(entry) {
  return clonePlain(entry?.value ?? entry);
}

function requireDistribution(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.schema !== 'string' || !Array.isArray(value.loadCases)) {
    fail('A support-load distribution is required.', 'EMPIRICAL_EXECUTION_V4_DISTRIBUTION_INVALID');
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
      'EMPIRICAL_EXECUTION_V4_METHOD_INVALID',
      { value, allowed: AUTHORIZED_EMPIRICAL_EXECUTION_METHODS },
    );
  }
  return value;
}

function fieldFamilies(value) {
  if (JSON.stringify(value) !== JSON.stringify(FIELD_FAMILIES)) {
    fail(
      'Package 5B execution may activate only component weights plus operating fluid densities.',
      'EMPIRICAL_EXECUTION_V4_FIELD_FAMILY_INVALID',
    );
  }
  return FIELD_FAMILIES;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(ascii);
}

function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`, 'EMPIRICAL_EXECUTION_V4_TYPE_INVALID');
  }
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      `${label} contains unexpected or missing keys.`,
      'EMPIRICAL_EXECUTION_V4_KEYS_INVALID',
      { actual, expected },
    );
  }
}

function identity(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail(`${label} must be a non-empty trimmed string.`, 'EMPIRICAL_EXECUTION_V4_IDENTITY_INVALID');
  }
  return value;
}

function timestamp(value, label) {
  const result = identity(value, label);
  if (new Date(result).toISOString() !== result) {
    fail(`${label} must be a canonical ISO-8601 timestamp.`, 'EMPIRICAL_EXECUTION_V4_TIMESTAMP_INVALID');
  }
  return result;
}

function hash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    fail(`${label} must be an FNV-1a semantic hash.`, 'EMPIRICAL_EXECUTION_V4_HASH_INVALID');
  }
  return value;
}

function nullableVersion(value) {
  if (value === null || value === undefined) return null;
  if ((typeof value !== 'string' && !Number.isInteger(value))
      || (typeof value === 'string' && value.length === 0)) {
    fail('datasetVersion must be null, integer or non-empty string.', 'EMPIRICAL_EXECUTION_V4_VERSION_INVALID');
  }
  return value;
}

function nonnegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer.`, 'EMPIRICAL_EXECUTION_V4_NUMBER_INVALID');
  }
  return value;
}

function executionStatus(value) {
  if (!['CALCULATED', 'BLOCKED'].includes(value)) {
    fail('Execution status must be CALCULATED or BLOCKED.', 'EMPIRICAL_EXECUTION_V4_STATUS_INVALID');
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
