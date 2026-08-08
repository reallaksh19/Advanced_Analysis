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
  assertEnrichmentProductionMaterialDensityOverlay,
} from '../engineering-enrichment/production-material-density-overlay.js';
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

export const AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V5_REQUEST_SCHEMA =
  'authorized-empirical-load-execution-request/v5';
export const AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V5_SCHEMA =
  'authorized-empirical-load-execution/v5';

const FIELD_FAMILIES = ['COMPONENT_WEIGHTS', 'OPERATING_FLUID_DENSITIES', 'MATERIAL_DENSITIES'];
const REQUEST_KEYS = [
  'schema', 'executionId', 'executedAt', 'method', 'authorizedInput',
  'sealedComponentWeightOverlay', 'componentObservedAuthority',
  'sealedOperatingFluidDensityOverlay', 'operatingFluidObservedAuthority',
  'sealedMaterialDensityOverlay', 'materialObservedAuthority',
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
  'materialDensitySealHash', 'materialDensityCurrentnessHash',
  'materialObservedAuthorityHash', 'materialDensityOverlayHash',
  'activatedEnrichmentFieldFamilies',
  'effectiveComponentWeightsSemanticHash',
  'effectiveOperatingFluidDensitiesSemanticHash',
  'effectiveHydroFluidDensitiesSemanticHash',
  'effectiveMaterialDensitiesSemanticHash',
  'effectivePipeSectionPropertiesSemanticHash',
  'ephemeralProfileSemanticHash', 'distributionSemanticHash',
  'status', 'summary', 'distribution', 'semanticHash',
];

export function authorizedEmpiricalLoadExecutionV5SemanticProjection(value) {
  return Object.fromEntries(OUTPUT_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeAuthorizedEmpiricalLoadExecutionV5SemanticHash(value) {
  return semanticHash(authorizedEmpiricalLoadExecutionV5SemanticProjection(value));
}

export function calculateAuthorizedEmpiricalLoadExecutionV5(value) {
  exact(value, REQUEST_KEYS, 'authorizedEmpiricalLoadExecutionV5Request');
  if (value.schema !== AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V5_REQUEST_SCHEMA) {
    fail('Unsupported authorized empirical V5 execution request.', 'EMPIRICAL_EXECUTION_V5_SCHEMA_INVALID');
  }
  const requestedMethod = method(value.method);
  const authorizedInput = requireAuthorizedEmpiricalLoadInput(value.authorizedInput);
  const component = assertEnrichmentProductionComponentWeightOverlay(value.sealedComponentWeightOverlay);
  const operatingFluid = assertEnrichmentProductionOperatingFluidDensityOverlay(value.sealedOperatingFluidDensityOverlay);
  const material = assertEnrichmentProductionMaterialDensityOverlay(value.sealedMaterialDensityOverlay);
  const componentObserved = assertEngineeringEnrichmentObservedAuthority(value.componentObservedAuthority);
  const fluidObserved = assertEngineeringEnrichmentObservedAuthority(value.operatingFluidObservedAuthority);
  const materialObserved = assertEngineeringEnrichmentObservedAuthority(value.materialObservedAuthority);

  ready(component, 'component-weight', 'EMPIRICAL_EXECUTION_V5_COMPONENT_ENRICHMENT_BLOCKED');
  ready(operatingFluid, 'operating-fluid-density', 'EMPIRICAL_EXECUTION_V5_FLUID_ENRICHMENT_BLOCKED');
  ready(material, 'material-density', 'EMPIRICAL_EXECUTION_V5_MATERIAL_ENRICHMENT_BLOCKED');
  observedBinding(component, componentObserved, 'component-weight', 'EMPIRICAL_EXECUTION_V5_COMPONENT_OBSERVED_AUTHORITY_MISMATCH');
  observedBinding(operatingFluid, fluidObserved, 'operating-fluid-density', 'EMPIRICAL_EXECUTION_V5_FLUID_OBSERVED_AUTHORITY_MISMATCH');
  observedBinding(material, materialObserved, 'material-density', 'EMPIRICAL_EXECUTION_V5_MATERIAL_OBSERVED_AUTHORITY_MISMATCH');
  sourceBinding(component, componentObserved, value.dataset, 'component-weight');
  sourceBinding(operatingFluid, fluidObserved, value.dataset, 'operating-fluid-density');
  sourceBinding(material, materialObserved, value.dataset, 'material-density');

  const contextHashes = [componentObserved, fluidObserved, materialObserved]
    .map((observed) => semanticHash(observed.contextIdentities));
  if (new Set(contextHashes).size !== 1) {
    fail(
      'Component-weight, operating-fluid and material-density approvals were reviewed against different context identities.',
      'EMPIRICAL_EXECUTION_V5_CONTEXT_AUTHORITY_MISMATCH',
    );
  }
  const activeProjectDataHash = semanticHash(value.profile);
  for (const observed of [componentObserved, fluidObserved, materialObserved]) {
    if (observed.contextIdentities?.projectDataHash !== activeProjectDataHash) {
      fail(
        'Active Project Data changed after one or more enrichment review/seal authority snapshots.',
        'EMPIRICAL_EXECUTION_V5_PROJECT_DATA_STALE',
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
  requireCompleteLineCoverage(
    authorizedLineKeys,
    Object.keys(operatingFluid.operatingFluidDensitiesKgPerM3).sort(ascii),
    'Package 5C requires complete Package 5B operating-fluid-density coverage.',
    'EMPIRICAL_EXECUTION_V5_OPERATING_FLUID_COVERAGE_INCOMPLETE',
  );
  requireCompleteLineCoverage(
    authorizedLineKeys,
    Object.keys(material.lineMaterialDensitiesKgPerM3).sort(ascii),
    'Package 5C requires complete sealed material-density coverage for every authorized line binding.',
    'EMPIRICAL_EXECUTION_V5_MATERIAL_DENSITY_COVERAGE_INCOMPLETE',
  );

  const componentProfile = applySealedComponentWeightEnrichmentToAuthorizedProfile(
    value.profile,
    authorizedInput,
    component,
  );
  const fluidProfile = applyOperatingFluidDensityEnrichment(componentProfile, operatingFluid);
  const profile = applyMaterialDensityEnrichment(fluidProfile, material, authorizedInput);
  const activeHashes = masterHashes(value.masterData, value.dataset);
  const errors = [
    ...validateProjectDataProfile(profile, 'loads', activeHashes).errors,
    ...validateProjectDataProfile(profile, 'topology', activeHashes).errors,
  ];
  if (errors.length > 0) {
    fail(
      'The Package 5C sealed-enrichment Project Data profile is not calculation-ready.',
      'EMPIRICAL_EXECUTION_V5_PROFILE_BLOCKED',
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
      'EMPIRICAL_EXECUTION_V5_METHOD_MISMATCH',
      { requestedMethod, executedMethod: distribution.method },
    );
  }

  const effectiveComponentWeights = projectDataPayload(profile.loadCalculation.componentWeightsKg);
  const effectiveOperatingFluidDensities = projectDataPayload(profile.loadCalculation.operatingFluidDensitiesKgPerM3);
  const effectiveHydroFluidDensities = projectDataPayload(profile.loadCalculation.hydroFluidDensitiesKgPerM3);
  const effectiveMaterialDensities = projectDataPayload(profile.loadCalculation.materialDensitiesKgPerM3);
  const effectivePipeSections = projectDataPayload(profile.loadCalculation.pipeSectionProperties);
  const draft = {
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V5_SCHEMA,
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
    materialDensitySealHash: material.sealHash,
    materialDensityCurrentnessHash: material.currentnessHash,
    materialObservedAuthorityHash: materialObserved.observedAuthorityHash,
    materialDensityOverlayHash: material.overlayHash,
    activatedEnrichmentFieldFamilies: FIELD_FAMILIES,
    effectiveComponentWeightsSemanticHash: semanticHash(effectiveComponentWeights),
    effectiveOperatingFluidDensitiesSemanticHash: semanticHash(effectiveOperatingFluidDensities),
    effectiveHydroFluidDensitiesSemanticHash: semanticHash(effectiveHydroFluidDensities),
    effectiveMaterialDensitiesSemanticHash: semanticHash(effectiveMaterialDensities),
    effectivePipeSectionPropertiesSemanticHash: semanticHash(effectivePipeSections),
    ephemeralProfileSemanticHash: semanticHash(profile),
    distributionSemanticHash: semanticHash(distribution),
    status: distribution.status,
    summary: summarize(distribution),
    distribution,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireAuthorizedEmpiricalLoadExecutionV5({
    ...draft,
    semanticHash: computeAuthorizedEmpiricalLoadExecutionV5SemanticHash(draft),
  });
}

export function requireAuthorizedEmpiricalLoadExecutionV5(value) {
  exact(value, OUTPUT_KEYS, 'authorizedEmpiricalLoadExecutionV5');
  if (value.schema !== AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V5_SCHEMA) {
    fail('Unsupported authorized empirical V5 execution.', 'EMPIRICAL_EXECUTION_V5_SCHEMA_INVALID');
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
    componentWeightCurrentnessHash: hash(value.componentWeightCurrentnessHash, 'componentWeightCurrentnessHash'),
    componentObservedAuthorityHash: hash(value.componentObservedAuthorityHash, 'componentObservedAuthorityHash'),
    componentWeightOverlayHash: hash(value.componentWeightOverlayHash, 'componentWeightOverlayHash'),
    operatingFluidDensitySealHash: hash(value.operatingFluidDensitySealHash, 'operatingFluidDensitySealHash'),
    operatingFluidDensityCurrentnessHash: hash(value.operatingFluidDensityCurrentnessHash, 'operatingFluidDensityCurrentnessHash'),
    operatingFluidObservedAuthorityHash: hash(value.operatingFluidObservedAuthorityHash, 'operatingFluidObservedAuthorityHash'),
    operatingFluidDensityOverlayHash: hash(value.operatingFluidDensityOverlayHash, 'operatingFluidDensityOverlayHash'),
    materialDensitySealHash: hash(value.materialDensitySealHash, 'materialDensitySealHash'),
    materialDensityCurrentnessHash: hash(value.materialDensityCurrentnessHash, 'materialDensityCurrentnessHash'),
    materialObservedAuthorityHash: hash(value.materialObservedAuthorityHash, 'materialObservedAuthorityHash'),
    materialDensityOverlayHash: hash(value.materialDensityOverlayHash, 'materialDensityOverlayHash'),
    activatedEnrichmentFieldFamilies: fieldFamilies(value.activatedEnrichmentFieldFamilies),
    effectiveComponentWeightsSemanticHash: hash(value.effectiveComponentWeightsSemanticHash, 'effectiveComponentWeightsSemanticHash'),
    effectiveOperatingFluidDensitiesSemanticHash: hash(value.effectiveOperatingFluidDensitiesSemanticHash, 'effectiveOperatingFluidDensitiesSemanticHash'),
    effectiveHydroFluidDensitiesSemanticHash: hash(value.effectiveHydroFluidDensitiesSemanticHash, 'effectiveHydroFluidDensitiesSemanticHash'),
    effectiveMaterialDensitiesSemanticHash: hash(value.effectiveMaterialDensitiesSemanticHash, 'effectiveMaterialDensitiesSemanticHash'),
    effectivePipeSectionPropertiesSemanticHash: hash(value.effectivePipeSectionPropertiesSemanticHash, 'effectivePipeSectionPropertiesSemanticHash'),
    ephemeralProfileSemanticHash: hash(value.ephemeralProfileSemanticHash, 'ephemeralProfileSemanticHash'),
    distributionSemanticHash: hash(value.distributionSemanticHash, 'distributionSemanticHash'),
    status: executionStatus(value.status),
    summary: requireSummary(value.summary),
    distribution: requireDistribution(value.distribution),
    semanticHash: hash(value.semanticHash, 'semanticHash'),
  };
  if (result.requestedMethod !== result.executedMethod || result.distribution.method !== result.executedMethod) {
    fail('Authorized, executed and distribution methods do not agree.', 'EMPIRICAL_EXECUTION_V5_METHOD_MISMATCH');
  }
  if (result.distribution.status !== result.status) {
    fail('Execution status differs from distribution.', 'EMPIRICAL_EXECUTION_V5_STATUS_MISMATCH');
  }
  if (result.distributionSemanticHash !== semanticHash(result.distribution)) {
    fail('Distribution semantic hash is stale.', 'EMPIRICAL_EXECUTION_V5_HASH_MISMATCH');
  }
  if (semanticHash(result.summary) !== semanticHash(summarize(result.distribution))) {
    fail('Execution summary is stale.', 'EMPIRICAL_EXECUTION_V5_SUMMARY_MISMATCH');
  }
  if (result.semanticHash !== computeAuthorizedEmpiricalLoadExecutionV5SemanticHash(result)) {
    fail('Execution semantic hash is stale.', 'EMPIRICAL_EXECUTION_V5_HASH_MISMATCH');
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
  return deepFreeze({ ...clonePlain(profile), loadCalculation });
}

function applyMaterialDensityEnrichment(profile, enrichment, authorizedInput) {
  const sections = projectDataPayload(profile.loadCalculation.pipeSectionProperties) || {};
  const materialDensitiesKgPerM3 = {};
  const materialCodeBindings = [];
  for (const binding of authorizedInput.lineBindings) {
    const lineKey = identity(binding.lineKey, 'lineBindings.lineKey');
    const section = sections[lineKey];
    if (!section || typeof section !== 'object' || Array.isArray(section)) {
      fail('Authorized line is missing an active pipe section.', 'EMPIRICAL_EXECUTION_V5_PIPE_SECTION_MISSING', { lineKey });
    }
    const materialCode = identity(section.materialCode, `pipeSectionProperties.${lineKey}.materialCode`);
    const densityKgPerM3 = enrichment.lineMaterialDensitiesKgPerM3[lineKey];
    if (!positive(densityKgPerM3)) {
      fail('Authorized line is missing a sealed material density.', 'EMPIRICAL_EXECUTION_V5_MATERIAL_DENSITY_MISSING', { lineKey });
    }
    if (Object.prototype.hasOwnProperty.call(materialDensitiesKgPerM3, materialCode)
        && materialDensitiesKgPerM3[materialCode] !== densityKgPerM3) {
      fail(
        'Lines sharing one materialCode resolved to conflicting sealed material densities.',
        'EMPIRICAL_EXECUTION_V5_MATERIAL_CODE_DENSITY_CONFLICT',
        { materialCode, existingDensityKgPerM3: materialDensitiesKgPerM3[materialCode], densityKgPerM3, lineKey },
      );
    }
    materialDensitiesKgPerM3[materialCode] = densityKgPerM3;
    materialCodeBindings.push({ lineKey, materialCode, densityKgPerM3 });
  }
  const orderedDensities = Object.fromEntries(
    Object.entries(materialDensitiesKgPerM3).sort(([left], [right]) => ascii(left, right)),
  );
  materialCodeBindings.sort((left, right) => ascii(left.lineKey, right.lineKey));
  const loadCalculation = clonePlain(profile.loadCalculation);
  loadCalculation.materialDensitiesKgPerM3 = createEvidenceValue(
    orderedDensities,
    {
      source: 'SEALED_ENGINEERING_ENRICHMENT_MATERIAL_DENSITIES',
      schema: enrichment.schema,
      sealId: enrichment.sealId,
      sealHash: enrichment.sealHash,
      currentnessHash: enrichment.currentnessHash,
      observedAuthorityHash: enrichment.observedAuthorityHash,
      candidateProjectionHash: enrichment.candidateProjectionHash,
      overlayHash: enrichment.overlayHash,
      activatedFieldFamilies: enrichment.activatedFieldFamilies,
      lineToMaterialCodeBindingHash: semanticHash(materialCodeBindings),
      pipeSectionsActivated: false,
    },
    true,
  );
  return deepFreeze({ ...clonePlain(profile), loadCalculation });
}

function requireCompleteLineCoverage(expected, actual, message, code) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) fail(message, code, { expected, actual });
}

function ready(overlay, label, code) {
  if (overlay.status !== 'READY_FOR_PRODUCTION_CONSUMPTION') {
    fail(`Sealed ${label} enrichment overlay is not production-ready.`, code, { blockers: overlay.blockers });
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
    fail(`Sealed ${label} authority is bound to a different active dataset.`, 'EMPIRICAL_EXECUTION_V5_ENRICHMENT_SOURCE_MISMATCH', { label });
  }
}

function projectDataPayload(entry) {
  return clonePlain(entry?.value ?? entry);
}

function requireDistribution(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.schema !== 'string' || !Array.isArray(value.loadCases)) {
    fail('A support-load distribution is required.', 'EMPIRICAL_EXECUTION_V5_DISTRIBUTION_INVALID');
  }
  return clonePlain(value);
}

function summarize(distribution) {
  const cases = Array.isArray(distribution.loadCases) ? distribution.loadCases : [];
  return {
    loadCaseCount: cases.length,
    calculatedCaseCount: cases.filter((row) => row.status === 'CALCULATED').length,
    blockedCaseCount: cases.filter((row) => row.status === 'BLOCKED').length,
    contributionCount: cases.reduce((total, row) => total + (Array.isArray(row.contributionLedger) ? row.contributionLedger.length : 0), 0),
    excludedInputCount: cases.reduce((total, row) => total + (Array.isArray(row.excludedInputs) ? row.excludedInputs.length : 0), 0),
  };
}

function requireSummary(value) {
  exact(value, ['loadCaseCount', 'calculatedCaseCount', 'blockedCaseCount', 'contributionCount', 'excludedInputCount'], 'summary');
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, nonnegativeInteger(item, `summary.${key}`)]));
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
    fail('Authorized empirical method is unsupported.', 'EMPIRICAL_EXECUTION_V5_METHOD_INVALID', { value, allowed: AUTHORIZED_EMPIRICAL_EXECUTION_METHODS });
  }
  return value;
}

function fieldFamilies(value) {
  if (JSON.stringify(value) !== JSON.stringify(FIELD_FAMILIES)) {
    fail('Package 5C execution may activate only component weights, operating fluid densities and material densities.', 'EMPIRICAL_EXECUTION_V5_FIELD_FAMILY_INVALID');
  }
  return FIELD_FAMILIES;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(ascii);
}

function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`, 'EMPIRICAL_EXECUTION_V5_TYPE_INVALID');
  }
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} contains unexpected or missing keys.`, 'EMPIRICAL_EXECUTION_V5_KEYS_INVALID', { actual, expected });
  }
}

function identity(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail(`${label} must be a non-empty trimmed string.`, 'EMPIRICAL_EXECUTION_V5_IDENTITY_INVALID');
  }
  return value;
}

function timestamp(value, label) {
  const result = identity(value, label);
  if (new Date(result).toISOString() !== result) {
    fail(`${label} must be a canonical ISO-8601 timestamp.`, 'EMPIRICAL_EXECUTION_V5_TIMESTAMP_INVALID');
  }
  return result;
}

function hash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    fail(`${label} must be an FNV-1a semantic hash.`, 'EMPIRICAL_EXECUTION_V5_HASH_INVALID');
  }
  return value;
}

function nullableVersion(value) {
  if (value === null || value === undefined) return null;
  if ((typeof value !== 'string' && !Number.isInteger(value)) || (typeof value === 'string' && value.length === 0)) {
    fail('datasetVersion must be null, integer or non-empty string.', 'EMPIRICAL_EXECUTION_V5_VERSION_INVALID');
  }
  return value;
}

function nonnegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer.`, 'EMPIRICAL_EXECUTION_V5_NUMBER_INVALID');
  }
  return value;
}

function positive(value) {
  return Number.isFinite(value) && value > 0;
}

function executionStatus(value) {
  if (!['CALCULATED', 'BLOCKED'].includes(value)) {
    fail('Execution status must be CALCULATED or BLOCKED.', 'EMPIRICAL_EXECUTION_V5_STATUS_INVALID');
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
