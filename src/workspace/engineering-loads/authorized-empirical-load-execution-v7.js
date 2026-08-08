import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import { clonePlain } from '../dataset-utils.js';
import {
  createEvidenceValue,
  validateProjectDataProfile,
} from '../project-data/project-data-contract.js';
import { assertEnrichmentProductionComponentWeightOverlay } from '../engineering-enrichment/production-component-weight-overlay.js';
import { assertEnrichmentProductionOperatingFluidDensityOverlay } from '../engineering-enrichment/production-operating-fluid-density-overlay.js';
import { assertEnrichmentProductionMaterialDensityOverlay } from '../engineering-enrichment/production-material-density-overlay.js';
import { assertEnrichmentProductionPipeSectionOverlay } from '../engineering-enrichment/production-pipe-section-overlay.js';
import {
  assertEnrichmentProductionHydroFluidDensityOverlay,
  assertEnrichmentProductionInsulationDensityOverlay,
} from '../engineering-enrichment/production-secondary-density-overlays.js';
import { assertEngineeringEnrichmentObservedAuthority } from '../engineering-enrichment/review-package-validation.js';
import { requireAuthorizedEmpiricalLoadInput } from './authorized-empirical-load-input.js';
import { applySealedComponentWeightEnrichmentToAuthorizedProfile } from './authorized-empirical-load-execution-v3.js';
import { AUTHORIZED_EMPIRICAL_EXECUTION_METHODS } from './authorized-empirical-load-execution-v2.js';
import {
  EMPIRICAL_LOAD_METHOD,
  calculateSupportLoadDistribution,
  calculateSupportLoadDistributionWithComponentCog,
} from './support-load-distribution-v3.js';

export const AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V7_REQUEST_SCHEMA =
  'authorized-empirical-load-execution-request/v7';
export const AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V7_SCHEMA =
  'authorized-empirical-load-execution/v7';

const FIELD_FAMILIES = Object.freeze([
  'COMPONENT_WEIGHTS',
  'OPERATING_FLUID_DENSITIES',
  'MATERIAL_DENSITIES',
  'PIPE_SECTIONS',
  'INSULATION_DENSITIES',
  'HYDRO_FLUID_DENSITIES',
]);
const REQUEST_KEYS = Object.freeze([
  'schema', 'executionId', 'executedAt', 'method', 'authorizedInput',
  'sealedComponentWeightOverlay', 'componentObservedAuthority',
  'sealedOperatingFluidDensityOverlay', 'operatingFluidObservedAuthority',
  'sealedMaterialDensityOverlay', 'materialObservedAuthority',
  'sealedPipeSectionOverlay', 'pipeSectionObservedAuthority',
  'sealedInsulationDensityOverlay', 'insulationObservedAuthority',
  'sealedHydroFluidDensityOverlay', 'hydroFluidObservedAuthority',
  'dataset', 'profile', 'supportSiteModel', 'routePartitionModel', 'masterData',
]);
const OUTPUT_KEYS = Object.freeze([
  'schema', 'executionId', 'executedAt', 'requestedMethod', 'executedMethod',
  'projectId', 'datasetId', 'datasetVersion', 'authorizedInputSemanticHash',
  'baseOverlaySemanticHash',
  'componentWeightSealHash', 'componentWeightCurrentnessHash',
  'componentObservedAuthorityHash', 'componentWeightOverlayHash',
  'operatingFluidDensitySealHash', 'operatingFluidDensityCurrentnessHash',
  'operatingFluidObservedAuthorityHash', 'operatingFluidDensityOverlayHash',
  'materialDensitySealHash', 'materialDensityCurrentnessHash',
  'materialObservedAuthorityHash', 'materialDensityOverlayHash',
  'pipeSectionSealHash', 'pipeSectionCurrentnessHash',
  'pipeSectionObservedAuthorityHash', 'pipeSectionOverlayHash',
  'insulationDensitySealHash', 'insulationDensityCurrentnessHash',
  'insulationObservedAuthorityHash', 'insulationDensityOverlayHash',
  'hydroFluidDensitySealHash', 'hydroFluidDensityCurrentnessHash',
  'hydroFluidObservedAuthorityHash', 'hydroFluidDensityOverlayHash',
  'activatedEnrichmentFieldFamilies',
  'effectiveComponentWeightsSemanticHash',
  'effectiveOperatingFluidDensitiesSemanticHash',
  'effectiveHydroFluidDensitiesSemanticHash',
  'effectiveMaterialDensitiesSemanticHash',
  'effectivePipeSectionPropertiesSemanticHash',
  'effectiveInsulationDensitiesSemanticHash',
  'ephemeralProfileSemanticHash', 'distributionSemanticHash',
  'status', 'summary', 'distribution', 'semanticHash',
]);

export function authorizedEmpiricalLoadExecutionV7SemanticProjection(value) {
  return Object.fromEntries(OUTPUT_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeAuthorizedEmpiricalLoadExecutionV7SemanticHash(value) {
  return semanticHash(authorizedEmpiricalLoadExecutionV7SemanticProjection(value));
}

/**
 * Package 5E is intentionally a batch cutover: insulation density and governed
 * hydro/test-medium density are activated together on top of 5A-5D. The
 * existing gravity solver remains untouched.
 *
 * materialCode remains parity-guarded because Package 5C does not yet publish
 * source material-code identity with its line density. insulationCode may
 * change only when the sealed 5D section code and independently sealed 5E
 * insulation-register code agree exactly.
 */
export function calculateAuthorizedEmpiricalLoadExecutionV7(value) {
  exact(value, REQUEST_KEYS, 'authorizedEmpiricalLoadExecutionV7Request');
  if (value.schema !== AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V7_REQUEST_SCHEMA) {
    fail('Unsupported authorized empirical V7 execution request.', 'EMPIRICAL_EXECUTION_V7_SCHEMA_INVALID');
  }
  const requestedMethod = method(value.method);
  const authorizedInput = requireAuthorizedEmpiricalLoadInput(value.authorizedInput);
  const component = assertEnrichmentProductionComponentWeightOverlay(value.sealedComponentWeightOverlay);
  const operatingFluid = assertEnrichmentProductionOperatingFluidDensityOverlay(value.sealedOperatingFluidDensityOverlay);
  const material = assertEnrichmentProductionMaterialDensityOverlay(value.sealedMaterialDensityOverlay);
  const pipeSection = assertEnrichmentProductionPipeSectionOverlay(value.sealedPipeSectionOverlay);
  const insulation = assertEnrichmentProductionInsulationDensityOverlay(value.sealedInsulationDensityOverlay);
  const hydro = assertEnrichmentProductionHydroFluidDensityOverlay(value.sealedHydroFluidDensityOverlay);

  const authorities = Object.freeze([
    ['component-weight', component, assertEngineeringEnrichmentObservedAuthority(value.componentObservedAuthority), 'COMPONENT'],
    ['operating-fluid-density', operatingFluid, assertEngineeringEnrichmentObservedAuthority(value.operatingFluidObservedAuthority), 'OPERATING_FLUID'],
    ['material-density', material, assertEngineeringEnrichmentObservedAuthority(value.materialObservedAuthority), 'MATERIAL'],
    ['pipe-section', pipeSection, assertEngineeringEnrichmentObservedAuthority(value.pipeSectionObservedAuthority), 'PIPE_SECTION'],
    ['insulation-density', insulation, assertEngineeringEnrichmentObservedAuthority(value.insulationObservedAuthority), 'INSULATION'],
    ['hydro-fluid-density', hydro, assertEngineeringEnrichmentObservedAuthority(value.hydroFluidObservedAuthority), 'HYDRO'],
  ]);

  for (const [label, overlay, observed, suffix] of authorities) {
    ready(overlay, label, `EMPIRICAL_EXECUTION_V7_${suffix}_ENRICHMENT_BLOCKED`);
    observedBinding(overlay, observed, label, `EMPIRICAL_EXECUTION_V7_${suffix}_OBSERVED_AUTHORITY_MISMATCH`);
    sourceBinding(overlay, observed, value.dataset, label);
  }

  const observedAuthorities = authorities.map((entry) => entry[2]);
  const contextHashes = observedAuthorities.map((observed) => semanticHash(observed.contextIdentities));
  if (new Set(contextHashes).size !== 1) {
    fail(
      'Package 5A-5E batch approvals were reviewed against different context identities.',
      'EMPIRICAL_EXECUTION_V7_CONTEXT_AUTHORITY_MISMATCH',
    );
  }
  const activeProjectDataHash = semanticHash(value.profile);
  for (const observed of observedAuthorities) {
    if (observed.contextIdentities?.projectDataHash !== activeProjectDataHash) {
      fail(
        'Active Project Data changed after one or more enrichment review/seal authority snapshots.',
        'EMPIRICAL_EXECUTION_V7_PROJECT_DATA_STALE',
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
    'Package 5E requires complete Package 5B operating-fluid-density coverage.',
    'EMPIRICAL_EXECUTION_V7_OPERATING_FLUID_COVERAGE_INCOMPLETE',
  );
  requireCompleteLineCoverage(
    authorizedLineKeys,
    Object.keys(material.lineMaterialDensitiesKgPerM3).sort(ascii),
    'Package 5E requires complete Package 5C material-density coverage.',
    'EMPIRICAL_EXECUTION_V7_MATERIAL_DENSITY_COVERAGE_INCOMPLETE',
  );
  requireCompleteLineCoverage(
    authorizedLineKeys,
    Object.keys(pipeSection.pipeSectionProperties).sort(ascii),
    'Package 5E requires complete Package 5D pipe-section coverage.',
    'EMPIRICAL_EXECUTION_V7_PIPE_SECTION_COVERAGE_INCOMPLETE',
  );
  requireCompleteLineCoverage(
    authorizedLineKeys,
    Object.keys(insulation.lineInsulationAuthority).sort(ascii),
    'Package 5E requires complete sealed insulation-density coverage.',
    'EMPIRICAL_EXECUTION_V7_INSULATION_DENSITY_COVERAGE_INCOMPLETE',
  );
  requireCompleteLineCoverage(
    authorizedLineKeys,
    Object.keys(hydro.lineHydroFluidAuthority).sort(ascii),
    'Package 5E requires complete sealed hydro/test-medium density coverage.',
    'EMPIRICAL_EXECUTION_V7_HYDRO_FLUID_COVERAGE_INCOMPLETE',
  );

  const componentProfile = applySealedComponentWeightEnrichmentToAuthorizedProfile(
    value.profile,
    authorizedInput,
    component,
  );
  const operatingProfile = applyOperatingFluidDensityEnrichment(componentProfile, operatingFluid);
  const sectionProfile = applyPipeSectionEnrichment(
    operatingProfile,
    pipeSection,
    insulation,
    authorizedInput,
  );
  const materialProfile = applyMaterialDensityEnrichment(sectionProfile, material, authorizedInput);
  const insulationProfile = applyInsulationDensityEnrichment(materialProfile, insulation, authorizedInput);
  const profile = applyHydroFluidDensityEnrichment(insulationProfile, hydro, authorizedInput);

  const activeHashes = masterHashes(value.masterData, value.dataset);
  const errors = [
    ...validateProjectDataProfile(profile, 'loads', activeHashes).errors,
    ...validateProjectDataProfile(profile, 'topology', activeHashes).errors,
  ];
  if (errors.length > 0) {
    fail(
      'The Package 5E batch sealed-enrichment Project Data profile is not calculation-ready.',
      'EMPIRICAL_EXECUTION_V7_PROFILE_BLOCKED',
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
      'EMPIRICAL_EXECUTION_V7_METHOD_MISMATCH',
      { requestedMethod, executedMethod: distribution.method },
    );
  }

  const effectiveComponentWeights = projectDataPayload(profile.loadCalculation.componentWeightsKg);
  const effectiveOperatingFluidDensities = projectDataPayload(profile.loadCalculation.operatingFluidDensitiesKgPerM3);
  const effectiveHydroFluidDensities = projectDataPayload(profile.loadCalculation.hydroFluidDensitiesKgPerM3);
  const effectiveMaterialDensities = projectDataPayload(profile.loadCalculation.materialDensitiesKgPerM3);
  const effectivePipeSections = projectDataPayload(profile.loadCalculation.pipeSectionProperties);
  const effectiveInsulationDensities = projectDataPayload(profile.loadCalculation.insulationDensitiesKgPerM3);

  const draft = {
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V7_SCHEMA,
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
    componentObservedAuthorityHash: authorities[0][2].observedAuthorityHash,
    componentWeightOverlayHash: component.overlayHash,
    operatingFluidDensitySealHash: operatingFluid.sealHash,
    operatingFluidDensityCurrentnessHash: operatingFluid.currentnessHash,
    operatingFluidObservedAuthorityHash: authorities[1][2].observedAuthorityHash,
    operatingFluidDensityOverlayHash: operatingFluid.overlayHash,
    materialDensitySealHash: material.sealHash,
    materialDensityCurrentnessHash: material.currentnessHash,
    materialObservedAuthorityHash: authorities[2][2].observedAuthorityHash,
    materialDensityOverlayHash: material.overlayHash,
    pipeSectionSealHash: pipeSection.sealHash,
    pipeSectionCurrentnessHash: pipeSection.currentnessHash,
    pipeSectionObservedAuthorityHash: authorities[3][2].observedAuthorityHash,
    pipeSectionOverlayHash: pipeSection.overlayHash,
    insulationDensitySealHash: insulation.sealHash,
    insulationDensityCurrentnessHash: insulation.currentnessHash,
    insulationObservedAuthorityHash: authorities[4][2].observedAuthorityHash,
    insulationDensityOverlayHash: insulation.overlayHash,
    hydroFluidDensitySealHash: hydro.sealHash,
    hydroFluidDensityCurrentnessHash: hydro.currentnessHash,
    hydroFluidObservedAuthorityHash: authorities[5][2].observedAuthorityHash,
    hydroFluidDensityOverlayHash: hydro.overlayHash,
    activatedEnrichmentFieldFamilies: FIELD_FAMILIES,
    effectiveComponentWeightsSemanticHash: semanticHash(effectiveComponentWeights),
    effectiveOperatingFluidDensitiesSemanticHash: semanticHash(effectiveOperatingFluidDensities),
    effectiveHydroFluidDensitiesSemanticHash: semanticHash(effectiveHydroFluidDensities),
    effectiveMaterialDensitiesSemanticHash: semanticHash(effectiveMaterialDensities),
    effectivePipeSectionPropertiesSemanticHash: semanticHash(effectivePipeSections),
    effectiveInsulationDensitiesSemanticHash: semanticHash(effectiveInsulationDensities),
    ephemeralProfileSemanticHash: semanticHash(profile),
    distributionSemanticHash: semanticHash(distribution),
    status: distribution.status,
    summary: summarize(distribution),
    distribution,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireAuthorizedEmpiricalLoadExecutionV7({
    ...draft,
    semanticHash: computeAuthorizedEmpiricalLoadExecutionV7SemanticHash(draft),
  });
}

export function requireAuthorizedEmpiricalLoadExecutionV7(value) {
  exact(value, OUTPUT_KEYS, 'authorizedEmpiricalLoadExecutionV7');
  if (value.schema !== AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V7_SCHEMA) {
    fail('Unsupported authorized empirical V7 execution.', 'EMPIRICAL_EXECUTION_V7_SCHEMA_INVALID');
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
    pipeSectionSealHash: hash(value.pipeSectionSealHash, 'pipeSectionSealHash'),
    pipeSectionCurrentnessHash: hash(value.pipeSectionCurrentnessHash, 'pipeSectionCurrentnessHash'),
    pipeSectionObservedAuthorityHash: hash(value.pipeSectionObservedAuthorityHash, 'pipeSectionObservedAuthorityHash'),
    pipeSectionOverlayHash: hash(value.pipeSectionOverlayHash, 'pipeSectionOverlayHash'),
    insulationDensitySealHash: hash(value.insulationDensitySealHash, 'insulationDensitySealHash'),
    insulationDensityCurrentnessHash: hash(value.insulationDensityCurrentnessHash, 'insulationDensityCurrentnessHash'),
    insulationObservedAuthorityHash: hash(value.insulationObservedAuthorityHash, 'insulationObservedAuthorityHash'),
    insulationDensityOverlayHash: hash(value.insulationDensityOverlayHash, 'insulationDensityOverlayHash'),
    hydroFluidDensitySealHash: hash(value.hydroFluidDensitySealHash, 'hydroFluidDensitySealHash'),
    hydroFluidDensityCurrentnessHash: hash(value.hydroFluidDensityCurrentnessHash, 'hydroFluidDensityCurrentnessHash'),
    hydroFluidObservedAuthorityHash: hash(value.hydroFluidObservedAuthorityHash, 'hydroFluidObservedAuthorityHash'),
    hydroFluidDensityOverlayHash: hash(value.hydroFluidDensityOverlayHash, 'hydroFluidDensityOverlayHash'),
    activatedEnrichmentFieldFamilies: fieldFamilies(value.activatedEnrichmentFieldFamilies),
    effectiveComponentWeightsSemanticHash: hash(value.effectiveComponentWeightsSemanticHash, 'effectiveComponentWeightsSemanticHash'),
    effectiveOperatingFluidDensitiesSemanticHash: hash(value.effectiveOperatingFluidDensitiesSemanticHash, 'effectiveOperatingFluidDensitiesSemanticHash'),
    effectiveHydroFluidDensitiesSemanticHash: hash(value.effectiveHydroFluidDensitiesSemanticHash, 'effectiveHydroFluidDensitiesSemanticHash'),
    effectiveMaterialDensitiesSemanticHash: hash(value.effectiveMaterialDensitiesSemanticHash, 'effectiveMaterialDensitiesSemanticHash'),
    effectivePipeSectionPropertiesSemanticHash: hash(value.effectivePipeSectionPropertiesSemanticHash, 'effectivePipeSectionPropertiesSemanticHash'),
    effectiveInsulationDensitiesSemanticHash: hash(value.effectiveInsulationDensitiesSemanticHash, 'effectiveInsulationDensitiesSemanticHash'),
    ephemeralProfileSemanticHash: hash(value.ephemeralProfileSemanticHash, 'ephemeralProfileSemanticHash'),
    distributionSemanticHash: hash(value.distributionSemanticHash, 'distributionSemanticHash'),
    status: executionStatus(value.status),
    summary: requireSummary(value.summary),
    distribution: requireDistribution(value.distribution),
    semanticHash: hash(value.semanticHash, 'semanticHash'),
  };
  if (result.requestedMethod !== result.executedMethod || result.distribution.method !== result.executedMethod) {
    fail('Authorized, executed and distribution methods do not agree.', 'EMPIRICAL_EXECUTION_V7_METHOD_MISMATCH');
  }
  if (result.distribution.status !== result.status) {
    fail('Execution status differs from distribution.', 'EMPIRICAL_EXECUTION_V7_STATUS_MISMATCH');
  }
  if (result.distributionSemanticHash !== semanticHash(result.distribution)) {
    fail('Distribution semantic hash is stale.', 'EMPIRICAL_EXECUTION_V7_HASH_MISMATCH');
  }
  if (semanticHash(result.summary) !== semanticHash(summarize(result.distribution))) {
    fail('Execution summary is stale.', 'EMPIRICAL_EXECUTION_V7_SUMMARY_MISMATCH');
  }
  if (result.semanticHash !== computeAuthorizedEmpiricalLoadExecutionV7SemanticHash(result)) {
    fail('Execution semantic hash is stale.', 'EMPIRICAL_EXECUTION_V7_HASH_MISMATCH');
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
    },
    true,
  );
  return deepFreeze({ ...clonePlain(profile), loadCalculation });
}

function applyPipeSectionEnrichment(profile, enrichment, insulation, authorizedInput) {
  const baselineSections = authorizedInput.loadCalculationOverlay.pipeSectionProperties || {};
  const sealedSections = enrichment.pipeSectionProperties;
  const ordered = {};
  const insulationConsensus = [];
  for (const binding of authorizedInput.lineBindings) {
    const lineKey = identity(binding.lineKey, 'lineBindings.lineKey');
    const baseline = baselineSections[lineKey];
    const sealed = sealedSections[lineKey];
    const insulationAuthority = insulation.lineInsulationAuthority[lineKey];
    if (!baseline || !sealed || !insulationAuthority) {
      fail(
        'Package 5E requires baseline section, sealed section and sealed insulation authority for every line.',
        'EMPIRICAL_EXECUTION_V7_PIPE_SECTION_MISSING',
        { lineKey },
      );
    }
    if (identity(sealed.materialCode, `pipeSectionProperties.${lineKey}.materialCode`)
        !== identity(baseline.materialCode, `authorizedPipeSection.${lineKey}.materialCode`)) {
      fail(
        'Package 5E still may not change materialCode; material selection identity is not yet published by Package 5C.',
        'EMPIRICAL_EXECUTION_V7_MATERIAL_CODE_CHANGE_OUTSIDE_SCOPE',
        { lineKey, baseline: baseline.materialCode, sealed: sealed.materialCode },
      );
    }
    const sectionInsulationCode = identity(sealed.insulationCode, `pipeSectionProperties.${lineKey}.insulationCode`).toUpperCase();
    const authorityInsulationCode = identity(insulationAuthority.referenceCode, `lineInsulationAuthority.${lineKey}.referenceCode`).toUpperCase();
    if (sectionInsulationCode !== authorityInsulationCode) {
      fail(
        'Sealed pipe-section insulationCode and sealed insulation-register authority disagree.',
        'EMPIRICAL_EXECUTION_V7_INSULATION_CODE_AUTHORITY_MISMATCH',
        { lineKey, sectionInsulationCode, authorityInsulationCode },
      );
    }
    ordered[lineKey] = clonePlain(sealed);
    insulationConsensus.push({
      lineKey,
      baselineInsulationCode: baseline.insulationCode,
      sealedInsulationCode: sealed.insulationCode,
      authorityInsulationCode: insulationAuthority.referenceCode,
    });
  }
  insulationConsensus.sort((left, right) => ascii(left.lineKey, right.lineKey));
  const loadCalculation = clonePlain(profile.loadCalculation);
  loadCalculation.pipeSectionProperties = createEvidenceValue(
    ordered,
    {
      source: 'SEALED_ENGINEERING_ENRICHMENT_PIPE_SECTIONS',
      schema: enrichment.schema,
      sealId: enrichment.sealId,
      sealHash: enrichment.sealHash,
      currentnessHash: enrichment.currentnessHash,
      observedAuthorityHash: enrichment.observedAuthorityHash,
      candidateProjectionHash: enrichment.candidateProjectionHash,
      pipingClassResolutionHash: enrichment.pipingClassResolutionHash,
      overlayHash: enrichment.overlayHash,
      activatedFieldFamilies: enrichment.activatedFieldFamilies,
      materialCodeChangePermitted: false,
      insulationCodeChangePermittedWithIndependentSeal: true,
      insulationAuthorityOverlayHash: insulation.overlayHash,
      insulationCodeConsensusHash: semanticHash(insulationConsensus),
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
      fail('Authorized line is missing an active pipe section.', 'EMPIRICAL_EXECUTION_V7_PIPE_SECTION_MISSING', { lineKey });
    }
    const materialCode = identity(section.materialCode, `pipeSectionProperties.${lineKey}.materialCode`);
    const densityKgPerM3 = enrichment.lineMaterialDensitiesKgPerM3[lineKey];
    if (!positive(densityKgPerM3)) {
      fail('Authorized line is missing a sealed material density.', 'EMPIRICAL_EXECUTION_V7_MATERIAL_DENSITY_MISSING', { lineKey });
    }
    insertCodeDensity(
      materialDensitiesKgPerM3,
      materialCode,
      densityKgPerM3,
      'EMPIRICAL_EXECUTION_V7_MATERIAL_CODE_DENSITY_CONFLICT',
      lineKey,
    );
    materialCodeBindings.push({ lineKey, materialCode, densityKgPerM3 });
  }
  materialCodeBindings.sort((left, right) => ascii(left.lineKey, right.lineKey));
  const loadCalculation = clonePlain(profile.loadCalculation);
  loadCalculation.materialDensitiesKgPerM3 = createEvidenceValue(
    orderedObject(materialDensitiesKgPerM3),
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
      pipeSectionsActivated: true,
    },
    true,
  );
  return deepFreeze({ ...clonePlain(profile), loadCalculation });
}

function applyInsulationDensityEnrichment(profile, enrichment, authorizedInput) {
  const sections = projectDataPayload(profile.loadCalculation.pipeSectionProperties) || {};
  const insulationDensitiesKgPerM3 = {};
  const bindings = [];
  for (const binding of authorizedInput.lineBindings) {
    const lineKey = identity(binding.lineKey, 'lineBindings.lineKey');
    const section = sections[lineKey];
    const authority = enrichment.lineInsulationAuthority[lineKey];
    if (!section || !authority) {
      fail('Authorized line is missing a sealed insulation authority.', 'EMPIRICAL_EXECUTION_V7_INSULATION_DENSITY_MISSING', { lineKey });
    }
    const insulationCode = identity(section.insulationCode, `pipeSectionProperties.${lineKey}.insulationCode`).toUpperCase();
    const authorityCode = identity(authority.referenceCode, `lineInsulationAuthority.${lineKey}.referenceCode`).toUpperCase();
    if (insulationCode !== authorityCode) {
      fail(
        'Active pipe-section insulation code differs from the sealed insulation-density authority.',
        'EMPIRICAL_EXECUTION_V7_INSULATION_CODE_AUTHORITY_MISMATCH',
        { lineKey, insulationCode, authorityCode },
      );
    }
    const densityKgPerM3 = authority.densityKgPerM3;
    if (!positive(densityKgPerM3)) {
      fail('Authorized line is missing a positive sealed insulation density.', 'EMPIRICAL_EXECUTION_V7_INSULATION_DENSITY_MISSING', { lineKey });
    }
    insertCodeDensity(
      insulationDensitiesKgPerM3,
      insulationCode,
      densityKgPerM3,
      'EMPIRICAL_EXECUTION_V7_INSULATION_CODE_DENSITY_CONFLICT',
      lineKey,
    );
    bindings.push({ lineKey, insulationCode, densityKgPerM3 });
  }
  bindings.sort((left, right) => ascii(left.lineKey, right.lineKey));
  const loadCalculation = clonePlain(profile.loadCalculation);
  loadCalculation.insulationDensitiesKgPerM3 = createEvidenceValue(
    orderedObject(insulationDensitiesKgPerM3),
    {
      source: 'SEALED_ENGINEERING_ENRICHMENT_INSULATION_DENSITIES',
      schema: enrichment.schema,
      sealId: enrichment.sealId,
      sealHash: enrichment.sealHash,
      currentnessHash: enrichment.currentnessHash,
      observedAuthorityHash: enrichment.observedAuthorityHash,
      candidateProjectionHash: enrichment.candidateProjectionHash,
      resolutionHash: enrichment.resolutionHash,
      overlayHash: enrichment.overlayHash,
      activatedFieldFamilies: enrichment.activatedFieldFamilies,
      lineToInsulationCodeBindingHash: semanticHash(bindings),
      pipeSectionInsulationConsensusRequired: true,
    },
    true,
  );
  return deepFreeze({ ...clonePlain(profile), loadCalculation });
}

function applyHydroFluidDensityEnrichment(profile, enrichment, authorizedInput) {
  const hydroFluidDensitiesKgPerM3 = {};
  const bindings = [];
  for (const binding of authorizedInput.lineBindings) {
    const lineKey = identity(binding.lineKey, 'lineBindings.lineKey');
    const authority = enrichment.lineHydroFluidAuthority[lineKey];
    if (!authority || !positive(authority.densityKgPerM3)) {
      fail('Authorized line is missing a positive sealed hydro/test-medium density.', 'EMPIRICAL_EXECUTION_V7_HYDRO_FLUID_DENSITY_MISSING', { lineKey });
    }
    hydroFluidDensitiesKgPerM3[lineKey] = authority.densityKgPerM3;
    bindings.push({
      lineKey,
      testMediumCode: identity(authority.referenceCode, `lineHydroFluidAuthority.${lineKey}.referenceCode`),
      densityKgPerM3: authority.densityKgPerM3,
    });
  }
  bindings.sort((left, right) => ascii(left.lineKey, right.lineKey));
  const loadCalculation = clonePlain(profile.loadCalculation);
  loadCalculation.hydroFluidDensitiesKgPerM3 = createEvidenceValue(
    orderedObject(hydroFluidDensitiesKgPerM3),
    {
      source: 'SEALED_ENGINEERING_ENRICHMENT_HYDRO_FLUID_DENSITIES',
      schema: enrichment.schema,
      sealId: enrichment.sealId,
      sealHash: enrichment.sealHash,
      currentnessHash: enrichment.currentnessHash,
      observedAuthorityHash: enrichment.observedAuthorityHash,
      candidateProjectionHash: enrichment.candidateProjectionHash,
      resolutionHash: enrichment.resolutionHash,
      overlayHash: enrichment.overlayHash,
      activatedFieldFamilies: enrichment.activatedFieldFamilies,
      testMediumBindingHash: semanticHash(bindings),
      defaultWaterAssumptionPermitted: false,
    },
    true,
  );
  return deepFreeze({ ...clonePlain(profile), loadCalculation });
}

function insertCodeDensity(target, code, densityKgPerM3, conflictCode, lineKey) {
  if (Object.prototype.hasOwnProperty.call(target, code) && target[code] !== densityKgPerM3) {
    fail(
      'Lines sharing one engineering code resolved to conflicting sealed densities.',
      conflictCode,
      { code, existingDensityKgPerM3: target[code], densityKgPerM3, lineKey },
    );
  }
  target[code] = densityKgPerM3;
}

function orderedObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => ascii(left, right)));
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
    fail(
      `Sealed ${label} authority is bound to a different active dataset.`,
      'EMPIRICAL_EXECUTION_V7_ENRICHMENT_SOURCE_MISMATCH',
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
    fail('A support-load distribution is required.', 'EMPIRICAL_EXECUTION_V7_DISTRIBUTION_INVALID');
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
    fail('Authorized empirical method is unsupported.', 'EMPIRICAL_EXECUTION_V7_METHOD_INVALID', {
      value,
      allowed: AUTHORIZED_EMPIRICAL_EXECUTION_METHODS,
    });
  }
  return value;
}

function fieldFamilies(value) {
  if (JSON.stringify(value) !== JSON.stringify(FIELD_FAMILIES)) {
    fail(
      'Package 5E batch execution may activate only 5A-5D plus insulation and hydro/test-medium densities.',
      'EMPIRICAL_EXECUTION_V7_FIELD_FAMILY_INVALID',
    );
  }
  return FIELD_FAMILIES;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(ascii);
}

function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`, 'EMPIRICAL_EXECUTION_V7_TYPE_INVALID');
  }
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} contains unexpected or missing keys.`, 'EMPIRICAL_EXECUTION_V7_KEYS_INVALID', { actual, expected });
  }
}

function identity(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail(`${label} must be a non-empty trimmed string.`, 'EMPIRICAL_EXECUTION_V7_IDENTITY_INVALID');
  }
  return value;
}

function timestamp(value, label) {
  const result = identity(value, label);
  if (new Date(result).toISOString() !== result) {
    fail(`${label} must be a canonical ISO-8601 timestamp.`, 'EMPIRICAL_EXECUTION_V7_TIMESTAMP_INVALID');
  }
  return result;
}

function hash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    fail(`${label} must be an FNV-1a semantic hash.`, 'EMPIRICAL_EXECUTION_V7_HASH_INVALID');
  }
  return value;
}

function nullableVersion(value) {
  if (value === null || value === undefined) return null;
  if ((typeof value !== 'string' && !Number.isInteger(value))
      || (typeof value === 'string' && value.length === 0)) {
    fail('datasetVersion must be null, integer or non-empty string.', 'EMPIRICAL_EXECUTION_V7_VERSION_INVALID');
  }
  return value;
}

function nonnegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer.`, 'EMPIRICAL_EXECUTION_V7_NUMBER_INVALID');
  }
  return value;
}

function positive(value) {
  return Number.isFinite(value) && value > 0;
}

function executionStatus(value) {
  if (!['CALCULATED', 'BLOCKED'].includes(value)) {
    fail('Execution status must be CALCULATED or BLOCKED.', 'EMPIRICAL_EXECUTION_V7_STATUS_INVALID');
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
