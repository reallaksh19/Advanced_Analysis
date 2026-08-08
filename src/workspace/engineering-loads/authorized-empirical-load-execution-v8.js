import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import { clonePlain, stringValue } from '../dataset-utils.js';
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
import {
  assertEnrichmentProductionMaterialSelectionOverlay,
  assertEnrichmentProductionSupportCapabilityOverlay,
} from '../engineering-enrichment/production-material-support-authority-overlays.js';
import { assertEngineeringEnrichmentObservedAuthority } from '../engineering-enrichment/review-package-validation.js';
import { requireAuthorizedEmpiricalLoadInput } from './authorized-empirical-load-input.js';
import { applySealedComponentWeightEnrichmentToAuthorizedProfile } from './authorized-empirical-load-execution-v3.js';
import { AUTHORIZED_EMPIRICAL_EXECUTION_METHODS } from './authorized-empirical-load-execution-v2.js';
import {
  EMPIRICAL_LOAD_METHOD,
  calculateSupportLoadDistribution,
  calculateSupportLoadDistributionWithComponentCog,
} from './support-load-distribution-v3.js';

export const AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V8_REQUEST_SCHEMA =
  'authorized-empirical-load-execution-request/v8';
export const AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V8_SCHEMA =
  'authorized-empirical-load-execution/v8';

const FIELD_FAMILIES = Object.freeze([
  'COMPONENT_WEIGHTS',
  'OPERATING_FLUID_DENSITIES',
  'MATERIAL_DENSITIES',
  'PIPE_SECTIONS',
  'INSULATION_DENSITIES',
  'HYDRO_FLUID_DENSITIES',
  'MATERIAL_SELECTION',
  'SUPPORT_CAPABILITIES',
]);
const REQUEST_KEYS = Object.freeze([
  'schema', 'executionId', 'executedAt', 'method', 'authorizedInput',
  'sealedComponentWeightOverlay', 'componentObservedAuthority',
  'sealedOperatingFluidDensityOverlay', 'operatingFluidObservedAuthority',
  'sealedMaterialDensityOverlay', 'materialObservedAuthority',
  'sealedPipeSectionOverlay', 'pipeSectionObservedAuthority',
  'sealedInsulationDensityOverlay', 'insulationObservedAuthority',
  'sealedHydroFluidDensityOverlay', 'hydroFluidObservedAuthority',
  'sealedMaterialSelectionOverlay', 'materialSelectionObservedAuthority',
  'sealedSupportCapabilityOverlay', 'supportCapabilityObservedAuthority',
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
  'materialSelectionSealHash', 'materialSelectionCurrentnessHash',
  'materialSelectionObservedAuthorityHash', 'materialSelectionOverlayHash',
  'supportCapabilitySealHash', 'supportCapabilityCurrentnessHash',
  'supportCapabilityObservedAuthorityHash', 'supportCapabilityOverlayHash',
  'activatedEnrichmentFieldFamilies',
  'effectiveComponentWeightsSemanticHash',
  'effectiveOperatingFluidDensitiesSemanticHash',
  'effectiveHydroFluidDensitiesSemanticHash',
  'effectiveMaterialDensitiesSemanticHash',
  'effectivePipeSectionPropertiesSemanticHash',
  'effectiveInsulationDensitiesSemanticHash',
  'effectiveSupportTypeCapabilitiesSemanticHash',
  'ephemeralProfileSemanticHash', 'distributionSemanticHash',
  'status', 'summary', 'distribution', 'semanticHash',
]);

export function authorizedEmpiricalLoadExecutionV8SemanticProjection(value) {
  return Object.fromEntries(OUTPUT_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeAuthorizedEmpiricalLoadExecutionV8SemanticHash(value) {
  return semanticHash(authorizedEmpiricalLoadExecutionV8SemanticProjection(value));
}

/**
 * Package 5F is the structural/governance batch following the scalar 5E cutover.
 * It closes material selection identity and replaces the Project Data support
 * type capability map with a sealed projection of the existing support-
 * attachment/restraint-capability authority.
 *
 * It does not activate support availability scenarios, gap mechanics, spring
 * mechanics, friction or lift-off. Gravity distribution mechanics are reused
 * unchanged from CHAINAGE_TRIBUTARY_SPAN_V2 / V3_COG.
 */
export function calculateAuthorizedEmpiricalLoadExecutionV8(value) {
  exact(value, REQUEST_KEYS, 'authorizedEmpiricalLoadExecutionV8Request');
  if (value.schema !== AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V8_REQUEST_SCHEMA) {
    fail('Unsupported authorized empirical V8 execution request.', 'EMPIRICAL_EXECUTION_V8_SCHEMA_INVALID');
  }
  const requestedMethod = method(value.method);
  const authorizedInput = requireAuthorizedEmpiricalLoadInput(value.authorizedInput);
  const component = assertEnrichmentProductionComponentWeightOverlay(value.sealedComponentWeightOverlay);
  const operatingFluid = assertEnrichmentProductionOperatingFluidDensityOverlay(value.sealedOperatingFluidDensityOverlay);
  const materialDensity = assertEnrichmentProductionMaterialDensityOverlay(value.sealedMaterialDensityOverlay);
  const pipeSection = assertEnrichmentProductionPipeSectionOverlay(value.sealedPipeSectionOverlay);
  const insulation = assertEnrichmentProductionInsulationDensityOverlay(value.sealedInsulationDensityOverlay);
  const hydro = assertEnrichmentProductionHydroFluidDensityOverlay(value.sealedHydroFluidDensityOverlay);
  const materialSelection = assertEnrichmentProductionMaterialSelectionOverlay(value.sealedMaterialSelectionOverlay);
  const supportCapability = assertEnrichmentProductionSupportCapabilityOverlay(value.sealedSupportCapabilityOverlay);

  const authorities = Object.freeze([
    ['component-weight', component, assertEngineeringEnrichmentObservedAuthority(value.componentObservedAuthority), 'COMPONENT'],
    ['operating-fluid-density', operatingFluid, assertEngineeringEnrichmentObservedAuthority(value.operatingFluidObservedAuthority), 'OPERATING_FLUID'],
    ['material-density', materialDensity, assertEngineeringEnrichmentObservedAuthority(value.materialObservedAuthority), 'MATERIAL_DENSITY'],
    ['pipe-section', pipeSection, assertEngineeringEnrichmentObservedAuthority(value.pipeSectionObservedAuthority), 'PIPE_SECTION'],
    ['insulation-density', insulation, assertEngineeringEnrichmentObservedAuthority(value.insulationObservedAuthority), 'INSULATION'],
    ['hydro-fluid-density', hydro, assertEngineeringEnrichmentObservedAuthority(value.hydroFluidObservedAuthority), 'HYDRO'],
    ['material-selection', materialSelection, assertEngineeringEnrichmentObservedAuthority(value.materialSelectionObservedAuthority), 'MATERIAL_SELECTION'],
    ['support-capability', supportCapability, assertEngineeringEnrichmentObservedAuthority(value.supportCapabilityObservedAuthority), 'SUPPORT_CAPABILITY'],
  ]);
  for (const [label, overlay, observed, suffix] of authorities) {
    ready(overlay, label, `EMPIRICAL_EXECUTION_V8_${suffix}_ENRICHMENT_BLOCKED`);
    observedBinding(overlay, observed, label, `EMPIRICAL_EXECUTION_V8_${suffix}_OBSERVED_AUTHORITY_MISMATCH`);
    sourceBinding(overlay, observed, value.dataset, label);
  }

  const observedAuthorities = authorities.map((row) => row[2]);
  const contextHashes = observedAuthorities.map((observed) => semanticHash(observed.contextIdentities));
  if (new Set(contextHashes).size !== 1) {
    fail('Package 5A-5F approvals were reviewed against different context identities.', 'EMPIRICAL_EXECUTION_V8_CONTEXT_AUTHORITY_MISMATCH');
  }
  const activeProjectDataHash = semanticHash(value.profile);
  for (const observed of observedAuthorities) {
    if (observed.contextIdentities?.projectDataHash !== activeProjectDataHash) {
      fail('Active Project Data changed after one or more enrichment authority snapshots.', 'EMPIRICAL_EXECUTION_V8_PROJECT_DATA_STALE', {
        sealedProjectDataHash: observed.contextIdentities?.projectDataHash ?? null,
        activeProjectDataHash,
      });
    }
  }
  if (supportCapability.supportSiteModelSemanticHash !== semanticHash(value.supportSiteModel)) {
    fail('Active support-site model changed after support capability was sealed.', 'EMPIRICAL_EXECUTION_V8_SUPPORT_SITE_MODEL_STALE');
  }

  const authorizedLineKeys = uniqueSorted(authorizedInput.lineBindings.map((row) => identity(row.lineKey, 'lineBindings.lineKey')));
  completeCoverage(authorizedLineKeys, Object.keys(operatingFluid.operatingFluidDensitiesKgPerM3), 'OPERATING_FLUID');
  completeCoverage(authorizedLineKeys, Object.keys(materialDensity.lineMaterialDensitiesKgPerM3), 'MATERIAL_DENSITY');
  completeCoverage(authorizedLineKeys, Object.keys(pipeSection.pipeSectionProperties), 'PIPE_SECTION');
  completeCoverage(authorizedLineKeys, Object.keys(insulation.lineInsulationAuthority), 'INSULATION');
  completeCoverage(authorizedLineKeys, Object.keys(hydro.lineHydroFluidAuthority), 'HYDRO');
  completeCoverage(authorizedLineKeys, Object.keys(materialSelection.lineMaterialAuthority), 'MATERIAL_SELECTION');
  requireSupportTypeCoverage(value.supportSiteModel, supportCapability.supportTypeCapabilities);

  const componentProfile = applySealedComponentWeightEnrichmentToAuthorizedProfile(value.profile, authorizedInput, component);
  const operatingProfile = applyOperatingFluidDensityEnrichment(componentProfile, operatingFluid);
  const sectionProfile = applyPipeSectionEnrichment(
    operatingProfile,
    pipeSection,
    materialSelection,
    materialDensity,
    insulation,
    authorizedInput,
  );
  const materialProfile = applyMaterialAuthority(
    sectionProfile,
    materialDensity,
    materialSelection,
    authorizedInput,
  );
  const insulationProfile = applyInsulationDensityEnrichment(materialProfile, insulation, authorizedInput);
  const hydroProfile = applyHydroFluidDensityEnrichment(insulationProfile, hydro, authorizedInput);
  const profile = applySupportCapabilityEnrichment(hydroProfile, supportCapability);

  const activeHashes = masterHashes(value.masterData, value.dataset);
  const errors = [
    ...validateProjectDataProfile(profile, 'loads', activeHashes).errors,
    ...validateProjectDataProfile(profile, 'topology', activeHashes).errors,
  ];
  if (errors.length > 0) {
    fail('The Package 5F sealed-enrichment Project Data profile is not calculation-ready.', 'EMPIRICAL_EXECUTION_V8_PROFILE_BLOCKED', { errors });
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
    fail('Executed empirical method differs from the authorized method.', 'EMPIRICAL_EXECUTION_V8_METHOD_MISMATCH', {
      requestedMethod,
      executedMethod: distribution.method,
    });
  }

  const effectiveComponentWeights = payload(profile.loadCalculation.componentWeightsKg);
  const effectiveOperatingFluidDensities = payload(profile.loadCalculation.operatingFluidDensitiesKgPerM3);
  const effectiveHydroFluidDensities = payload(profile.loadCalculation.hydroFluidDensitiesKgPerM3);
  const effectiveMaterialDensities = payload(profile.loadCalculation.materialDensitiesKgPerM3);
  const effectivePipeSections = payload(profile.loadCalculation.pipeSectionProperties);
  const effectiveInsulationDensities = payload(profile.loadCalculation.insulationDensitiesKgPerM3);
  const effectiveSupportCapabilities = payload(profile.topology.supportTypeCapabilities);

  const draft = {
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V8_SCHEMA,
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
    materialDensitySealHash: materialDensity.sealHash,
    materialDensityCurrentnessHash: materialDensity.currentnessHash,
    materialObservedAuthorityHash: authorities[2][2].observedAuthorityHash,
    materialDensityOverlayHash: materialDensity.overlayHash,
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
    materialSelectionSealHash: materialSelection.sealHash,
    materialSelectionCurrentnessHash: materialSelection.currentnessHash,
    materialSelectionObservedAuthorityHash: authorities[6][2].observedAuthorityHash,
    materialSelectionOverlayHash: materialSelection.overlayHash,
    supportCapabilitySealHash: supportCapability.sealHash,
    supportCapabilityCurrentnessHash: supportCapability.currentnessHash,
    supportCapabilityObservedAuthorityHash: authorities[7][2].observedAuthorityHash,
    supportCapabilityOverlayHash: supportCapability.overlayHash,
    activatedEnrichmentFieldFamilies: FIELD_FAMILIES,
    effectiveComponentWeightsSemanticHash: semanticHash(effectiveComponentWeights),
    effectiveOperatingFluidDensitiesSemanticHash: semanticHash(effectiveOperatingFluidDensities),
    effectiveHydroFluidDensitiesSemanticHash: semanticHash(effectiveHydroFluidDensities),
    effectiveMaterialDensitiesSemanticHash: semanticHash(effectiveMaterialDensities),
    effectivePipeSectionPropertiesSemanticHash: semanticHash(effectivePipeSections),
    effectiveInsulationDensitiesSemanticHash: semanticHash(effectiveInsulationDensities),
    effectiveSupportTypeCapabilitiesSemanticHash: semanticHash(effectiveSupportCapabilities),
    ephemeralProfileSemanticHash: semanticHash(profile),
    distributionSemanticHash: semanticHash(distribution),
    status: distribution.status,
    summary: summarize(distribution),
    distribution,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireAuthorizedEmpiricalLoadExecutionV8({
    ...draft,
    semanticHash: computeAuthorizedEmpiricalLoadExecutionV8SemanticHash(draft),
  });
}

export function requireAuthorizedEmpiricalLoadExecutionV8(value) {
  exact(value, OUTPUT_KEYS, 'authorizedEmpiricalLoadExecutionV8');
  if (value.schema !== AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V8_SCHEMA) {
    fail('Unsupported authorized empirical V8 execution.', 'EMPIRICAL_EXECUTION_V8_SCHEMA_INVALID');
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
    activatedEnrichmentFieldFamilies: fieldFamilies(value.activatedEnrichmentFieldFamilies),
    status: executionStatus(value.status),
    summary: requireSummary(value.summary),
    distribution: requireDistribution(value.distribution),
  };
  const hashFields = OUTPUT_KEYS.filter((key) => key.endsWith('Hash') && key !== 'semanticHash');
  for (const key of hashFields) result[key] = hash(value[key], key);
  result.semanticHash = hash(value.semanticHash, 'semanticHash');
  if (result.requestedMethod !== result.executedMethod || result.distribution.method !== result.executedMethod) {
    fail('Authorized, executed and distribution methods do not agree.', 'EMPIRICAL_EXECUTION_V8_METHOD_MISMATCH');
  }
  if (result.distribution.status !== result.status) {
    fail('Execution status differs from distribution.', 'EMPIRICAL_EXECUTION_V8_STATUS_MISMATCH');
  }
  if (result.distributionSemanticHash !== semanticHash(result.distribution)) {
    fail('Distribution semantic hash is stale.', 'EMPIRICAL_EXECUTION_V8_HASH_MISMATCH');
  }
  if (semanticHash(result.summary) !== semanticHash(summarize(result.distribution))) {
    fail('Execution summary is stale.', 'EMPIRICAL_EXECUTION_V8_SUMMARY_MISMATCH');
  }
  if (result.semanticHash !== computeAuthorizedEmpiricalLoadExecutionV8SemanticHash(result)) {
    fail('Execution semantic hash is stale.', 'EMPIRICAL_EXECUTION_V8_HASH_MISMATCH');
  }
  return deepFreeze(result);
}

function applyOperatingFluidDensityEnrichment(profile, enrichment) {
  const loadCalculation = clonePlain(profile.loadCalculation);
  loadCalculation.operatingFluidDensitiesKgPerM3 = createEvidenceValue(
    clonePlain(enrichment.operatingFluidDensitiesKgPerM3),
    evidence('SEALED_ENGINEERING_ENRICHMENT_OPERATING_FLUID_DENSITIES', enrichment),
    true,
  );
  return deepFreeze({ ...clonePlain(profile), loadCalculation });
}

function applyPipeSectionEnrichment(profile, sectionAuthority, materialSelection, materialDensity, insulation, authorizedInput) {
  const sealedSections = sectionAuthority.pipeSectionProperties;
  const ordered = {};
  const materialConsensus = [];
  const insulationConsensus = [];
  for (const binding of authorizedInput.lineBindings) {
    const lineKey = identity(binding.lineKey, 'lineBindings.lineKey');
    const section = sealedSections[lineKey];
    const material = materialSelection.lineMaterialAuthority[lineKey];
    const insulationAuthority = insulation.lineInsulationAuthority[lineKey];
    const density = materialDensity.lineMaterialDensitiesKgPerM3[lineKey];
    if (!section || !material || !insulationAuthority || !positive(density)) {
      fail('Package 5F requires sealed section, material selection/density and insulation authority for every line.', 'EMPIRICAL_EXECUTION_V8_PIPE_SECTION_AUTHORITY_MISSING', { lineKey });
    }
    const sectionMaterialCode = canonicalCode(section.materialCode, `pipeSectionProperties.${lineKey}.materialCode`);
    const authorityMaterialCode = canonicalCode(material.referenceCode, `lineMaterialAuthority.${lineKey}.referenceCode`);
    if (sectionMaterialCode !== authorityMaterialCode) {
      fail('Sealed pipe-section materialCode and sealed material-selection authority disagree.', 'EMPIRICAL_EXECUTION_V8_MATERIAL_CODE_AUTHORITY_MISMATCH', {
        lineKey, sectionMaterialCode, authorityMaterialCode,
      });
    }
    if (material.densityKgPerM3 !== density) {
      fail('Material-selection density disagrees with independently sealed Package 5C density.', 'EMPIRICAL_EXECUTION_V8_MATERIAL_DENSITY_AUTHORITY_MISMATCH', {
        lineKey, selectionDensityKgPerM3: material.densityKgPerM3, densityAuthorityKgPerM3: density,
      });
    }
    const sectionInsulationCode = canonicalCode(section.insulationCode, `pipeSectionProperties.${lineKey}.insulationCode`);
    const authorityInsulationCode = canonicalCode(insulationAuthority.referenceCode, `lineInsulationAuthority.${lineKey}.referenceCode`);
    if (sectionInsulationCode !== authorityInsulationCode) {
      fail('Sealed pipe-section insulationCode and sealed insulation-register authority disagree.', 'EMPIRICAL_EXECUTION_V8_INSULATION_CODE_AUTHORITY_MISMATCH', {
        lineKey, sectionInsulationCode, authorityInsulationCode,
      });
    }
    ordered[lineKey] = clonePlain(section);
    materialConsensus.push({ lineKey, sectionMaterialCode, authorityMaterialCode, densityKgPerM3: density });
    insulationConsensus.push({ lineKey, sectionInsulationCode, authorityInsulationCode });
  }
  materialConsensus.sort(byLine);
  insulationConsensus.sort(byLine);
  const loadCalculation = clonePlain(profile.loadCalculation);
  loadCalculation.pipeSectionProperties = createEvidenceValue(ordered, {
    ...evidence('SEALED_ENGINEERING_ENRICHMENT_PIPE_SECTIONS', sectionAuthority),
    materialCodeChangePermittedWithIndependentSeal: true,
    materialSelectionOverlayHash: materialSelection.overlayHash,
    materialDensityOverlayHash: materialDensity.overlayHash,
    materialCodeConsensusHash: semanticHash(materialConsensus),
    insulationCodeChangePermittedWithIndependentSeal: true,
    insulationAuthorityOverlayHash: insulation.overlayHash,
    insulationCodeConsensusHash: semanticHash(insulationConsensus),
  }, true);
  return deepFreeze({ ...clonePlain(profile), loadCalculation });
}

function applyMaterialAuthority(profile, materialDensity, materialSelection, authorizedInput) {
  const sections = payload(profile.loadCalculation.pipeSectionProperties) || {};
  const map = {};
  const bindings = [];
  for (const binding of authorizedInput.lineBindings) {
    const lineKey = identity(binding.lineKey, 'lineBindings.lineKey');
    const section = sections[lineKey];
    const selection = materialSelection.lineMaterialAuthority[lineKey];
    const densityKgPerM3 = materialDensity.lineMaterialDensitiesKgPerM3[lineKey];
    if (!section || !selection || !positive(densityKgPerM3)) {
      fail('Authorized line is missing sealed material authority.', 'EMPIRICAL_EXECUTION_V8_MATERIAL_AUTHORITY_MISSING', { lineKey });
    }
    const materialCode = canonicalCode(section.materialCode, `pipeSectionProperties.${lineKey}.materialCode`);
    const selectionCode = canonicalCode(selection.referenceCode, `lineMaterialAuthority.${lineKey}.referenceCode`);
    if (materialCode !== selectionCode || selection.densityKgPerM3 !== densityKgPerM3) {
      fail('Active material code/density is not the consensus of 5C and 5F seals.', 'EMPIRICAL_EXECUTION_V8_MATERIAL_AUTHORITY_MISMATCH', { lineKey });
    }
    insertCodeDensity(map, materialCode, densityKgPerM3, 'EMPIRICAL_EXECUTION_V8_MATERIAL_CODE_DENSITY_CONFLICT', lineKey);
    bindings.push({ lineKey, materialCode, densityKgPerM3 });
  }
  bindings.sort(byLine);
  const loadCalculation = clonePlain(profile.loadCalculation);
  loadCalculation.materialDensitiesKgPerM3 = createEvidenceValue(orderedObject(map), {
    ...evidence('SEALED_ENGINEERING_ENRICHMENT_MATERIAL_DENSITIES_WITH_SELECTION', materialDensity),
    materialSelectionSealHash: materialSelection.sealHash,
    materialSelectionOverlayHash: materialSelection.overlayHash,
    lineToMaterialCodeBindingHash: semanticHash(bindings),
    materialCodeChangePermittedWithIndependentSeal: true,
  }, true);
  return deepFreeze({ ...clonePlain(profile), loadCalculation });
}

function applyInsulationDensityEnrichment(profile, enrichment, authorizedInput) {
  const sections = payload(profile.loadCalculation.pipeSectionProperties) || {};
  const map = {};
  const bindings = [];
  for (const binding of authorizedInput.lineBindings) {
    const lineKey = identity(binding.lineKey, 'lineBindings.lineKey');
    const section = sections[lineKey];
    const authority = enrichment.lineInsulationAuthority[lineKey];
    if (!section || !authority || !positive(authority.densityKgPerM3)) {
      fail('Authorized line is missing sealed insulation authority.', 'EMPIRICAL_EXECUTION_V8_INSULATION_DENSITY_MISSING', { lineKey });
    }
    const code = canonicalCode(section.insulationCode, `pipeSectionProperties.${lineKey}.insulationCode`);
    const authorityCode = canonicalCode(authority.referenceCode, `lineInsulationAuthority.${lineKey}.referenceCode`);
    if (code !== authorityCode) {
      fail('Active insulation code differs from sealed insulation authority.', 'EMPIRICAL_EXECUTION_V8_INSULATION_CODE_AUTHORITY_MISMATCH', { lineKey });
    }
    insertCodeDensity(map, code, authority.densityKgPerM3, 'EMPIRICAL_EXECUTION_V8_INSULATION_CODE_DENSITY_CONFLICT', lineKey);
    bindings.push({ lineKey, insulationCode: code, densityKgPerM3: authority.densityKgPerM3 });
  }
  bindings.sort(byLine);
  const loadCalculation = clonePlain(profile.loadCalculation);
  loadCalculation.insulationDensitiesKgPerM3 = createEvidenceValue(orderedObject(map), {
    ...evidence('SEALED_ENGINEERING_ENRICHMENT_INSULATION_DENSITIES', enrichment),
    lineToInsulationCodeBindingHash: semanticHash(bindings),
  }, true);
  return deepFreeze({ ...clonePlain(profile), loadCalculation });
}

function applyHydroFluidDensityEnrichment(profile, enrichment, authorizedInput) {
  const map = {};
  const bindings = [];
  for (const binding of authorizedInput.lineBindings) {
    const lineKey = identity(binding.lineKey, 'lineBindings.lineKey');
    const authority = enrichment.lineHydroFluidAuthority[lineKey];
    if (!authority || !positive(authority.densityKgPerM3)) {
      fail('Authorized line is missing positive sealed hydro/test-medium density.', 'EMPIRICAL_EXECUTION_V8_HYDRO_FLUID_DENSITY_MISSING', { lineKey });
    }
    map[lineKey] = authority.densityKgPerM3;
    bindings.push({ lineKey, testMediumCode: identity(authority.referenceCode, 'hydro.referenceCode'), densityKgPerM3: authority.densityKgPerM3 });
  }
  bindings.sort(byLine);
  const loadCalculation = clonePlain(profile.loadCalculation);
  loadCalculation.hydroFluidDensitiesKgPerM3 = createEvidenceValue(orderedObject(map), {
    ...evidence('SEALED_ENGINEERING_ENRICHMENT_HYDRO_FLUID_DENSITIES', enrichment),
    lineToTestMediumBindingHash: semanticHash(bindings),
    defaultWaterAssumptionPermitted: false,
  }, true);
  return deepFreeze({ ...clonePlain(profile), loadCalculation });
}

function applySupportCapabilityEnrichment(profile, enrichment) {
  const topology = clonePlain(profile.topology);
  topology.supportTypeCapabilities = createEvidenceValue(
    clonePlain(enrichment.supportTypeCapabilities),
    {
      ...evidence('SEALED_ENGINEERING_ENRICHMENT_SUPPORT_CAPABILITIES', enrichment),
      supportAttachmentModelSemanticHash: enrichment.supportAttachmentModelSemanticHash,
      restraintCapabilityModelSemanticHash: enrichment.restraintCapabilityModelSemanticHash,
      supportSiteModelSemanticHash: enrichment.supportSiteModelSemanticHash,
      supportAvailabilityScenariosActivated: false,
      gapMechanicsActivated: false,
      springMechanicsActivated: false,
      frictionMechanicsActivated: false,
      liftOffActivated: false,
    },
    true,
  );
  return deepFreeze({ ...clonePlain(profile), topology });
}

function evidence(source, enrichment) {
  return {
    source,
    schema: enrichment.schema,
    sealId: enrichment.sealId,
    sealHash: enrichment.sealHash,
    currentnessHash: enrichment.currentnessHash,
    observedAuthorityHash: enrichment.observedAuthorityHash,
    candidateProjectionHash: enrichment.candidateProjectionHash,
    overlayHash: enrichment.overlayHash,
    activatedFieldFamilies: enrichment.activatedFieldFamilies,
  };
}

function completeCoverage(expected, actual, label) {
  const sorted = [...actual].sort(ascii);
  if (JSON.stringify(expected) !== JSON.stringify(sorted)) {
    fail(`Package 5F requires complete ${label} line coverage.`, `EMPIRICAL_EXECUTION_V8_${label}_COVERAGE_INCOMPLETE`, { expected, actual: sorted });
  }
}

function requireSupportTypeCoverage(supportSiteModel, capabilities) {
  const active = uniqueSorted((supportSiteModel?.sites || []).flatMap((site) => (site.assemblies || []).flatMap((assembly) => (
    (assembly.members || []).map((member) => stringValue(member.sourceType)).filter(Boolean)
  ))));
  const sealed = Object.keys(capabilities || {}).sort(ascii);
  if (JSON.stringify(active) !== JSON.stringify(sealed)) {
    fail('Sealed support capability types do not exactly cover active support-site member types.', 'EMPIRICAL_EXECUTION_V8_SUPPORT_TYPE_COVERAGE_INCOMPLETE', { active, sealed });
  }
}

function ready(overlay, label, code) {
  if (overlay.status !== 'READY_FOR_PRODUCTION_CONSUMPTION') fail(`Sealed ${label} enrichment overlay is not production-ready.`, code, { blockers: overlay.blockers });
}
function observedBinding(overlay, observed, label, code) {
  if (observed.observedAuthorityHash !== overlay.observedAuthorityHash) fail(`Observed ${label} authority changed after overlay creation.`, code);
}
function sourceBinding(overlay, observed, dataset, label) {
  if (overlay.sourceDatasetHash !== dataset?.sourceSha256
      || overlay.sourceSharedModelHash !== dataset?.sharedModel?.semanticHash
      || observed.sourceDatasetHash !== overlay.sourceDatasetHash
      || observed.sourceSharedModelHash !== overlay.sourceSharedModelHash) {
    fail(`Sealed ${label} authority is bound to a different active dataset.`, 'EMPIRICAL_EXECUTION_V8_ENRICHMENT_SOURCE_MISMATCH', { label });
  }
}

function insertCodeDensity(map, code, density, errorCode, lineKey) {
  if (Object.prototype.hasOwnProperty.call(map, code) && map[code] !== density) {
    fail('Lines sharing one code resolved to conflicting sealed densities.', errorCode, { code, existingDensityKgPerM3: map[code], densityKgPerM3: density, lineKey });
  }
  map[code] = density;
}
function orderedObject(value) { return Object.fromEntries(Object.entries(value).sort(([a], [b]) => ascii(a, b))); }
function payload(entry) { return clonePlain(entry?.value ?? entry); }
function canonicalCode(value, label) { return identity(value, label).toUpperCase(); }
function byLine(left, right) { return ascii(left.lineKey, right.lineKey); }
function uniqueSorted(values) { return [...new Set(values)].sort(ascii); }
function positive(value) { return Number.isFinite(value) && value > 0; }

function requireDistribution(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.schema !== 'string' || !Array.isArray(value.loadCases)) {
    fail('A support-load distribution is required.', 'EMPIRICAL_EXECUTION_V8_DISTRIBUTION_INVALID');
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
  if (!AUTHORIZED_EMPIRICAL_EXECUTION_METHODS.includes(value)) fail('Authorized empirical method is unsupported.', 'EMPIRICAL_EXECUTION_V8_METHOD_INVALID', { value });
  return value;
}
function fieldFamilies(value) {
  if (JSON.stringify(value) !== JSON.stringify(FIELD_FAMILIES)) fail('Package 5F execution field-family set is invalid.', 'EMPIRICAL_EXECUTION_V8_FIELD_FAMILY_INVALID');
  return FIELD_FAMILIES;
}
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`, 'EMPIRICAL_EXECUTION_V8_TYPE_INVALID');
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} contains unexpected or missing keys.`, 'EMPIRICAL_EXECUTION_V8_KEYS_INVALID', { actual, expected });
}
function identity(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) fail(`${label} must be a non-empty trimmed string.`, 'EMPIRICAL_EXECUTION_V8_IDENTITY_INVALID');
  return value;
}
function timestamp(value, label) { const result = identity(value, label); if (new Date(result).toISOString() !== result) fail(`${label} must be canonical ISO-8601.`, 'EMPIRICAL_EXECUTION_V8_TIMESTAMP_INVALID'); return result; }
function hash(value, label) { if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) fail(`${label} must be an FNV-1a semantic hash.`, 'EMPIRICAL_EXECUTION_V8_HASH_INVALID'); return value; }
function nullableVersion(value) { if (value === null || value === undefined) return null; if ((typeof value !== 'string' && !Number.isInteger(value)) || (typeof value === 'string' && !value.length)) fail('datasetVersion invalid.', 'EMPIRICAL_EXECUTION_V8_VERSION_INVALID'); return value; }
function nonnegativeInteger(value, label) { if (!Number.isInteger(value) || value < 0) fail(`${label} must be non-negative integer.`, 'EMPIRICAL_EXECUTION_V8_NUMBER_INVALID'); return value; }
function executionStatus(value) { if (!['CALCULATED', 'BLOCKED'].includes(value)) fail('Execution status invalid.', 'EMPIRICAL_EXECUTION_V8_STATUS_INVALID'); return value; }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message, code, details = null) { const error = new Error(message); error.code = code; error.details = details === null ? null : deepFreeze(details); throw error; }
