import {
  INPUTXML_LENGTH_UNIT_REGISTRY_ID,
  LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
  sealLinearPipingInputXmlUnitProfile,
} from './inputxml-unit-contract.js';
import { normalizeLinearPipingInputXmlGeometry } from './inputxml-unit-normalization.js';
import {
  computeInputXmlModelHealthSourceEvidenceHash,
  computeInputXmlModelHealthSourceSemanticHash,
  requireInputXmlModelHealthSource,
} from '../geometry/model-health/index.js';
import { diagnoseInputXmlLinearModelHealth } from './inputxml-linear-model-health.js';
import { requireInputXmlLinearModelHealth } from './inputxml-linear-model-health-contract.js';
import { prepareInputXmlElementAuthorities } from './inputxml-linear-preparation-authorities.js';
import {
  InputXmlLinearSolvePreparationError,
  requireInputXmlLinearSolvePreparationProfile,
} from './inputxml-linear-preparation-profile.js';
import {
  INPUTXML_LINEAR_SOLVE_PREPARATION_SCHEMA,
  sealInputXmlLinearSolvePreparation,
} from './inputxml-linear-solve-preparation-contract.js';

export function prepareInputXmlLinearSolve(sourceBundle, analysisProfileId, options = {}) {
  const source = requireInputXmlModelHealthSource(sourceBundle);
  const profile = requireInputXmlLinearSolvePreparationProfile(analysisProfileId);
  const modelHealth = options.modelHealthReport === undefined
    ? diagnoseInputXmlLinearModelHealth(source, options.modelHealthOptions ?? {})
    : requireInputXmlLinearModelHealth(options.modelHealthReport, source);
  const modelCapability = modelHealth.capabilities
    .find((row) => row.capabilityId === profile.modelCapabilityId) ?? null;
  if (modelCapability === null || modelCapability.status === 'BLOCK') {
    throw new InputXmlLinearSolvePreparationError(
      `InputXML ${profile.modelCapabilityId} capability blocks ${analysisProfileId} preparation.`,
      'INPUTXML_PREPARATION_MODEL_CAPABILITY_BLOCKED',
      {
        analysisProfileId,
        modelCapabilityId: profile.modelCapabilityId,
        capabilityStatus: modelCapability?.status ?? null,
        findingIds: modelCapability?.findingIds ?? [],
        limitationCodes: modelCapability?.limitationCodes ?? [],
      },
    );
  }

  const sourceSemanticHash = computeInputXmlModelHealthSourceSemanticHash(source);
  const sourceEvidenceHash = computeInputXmlModelHealthSourceEvidenceHash(source);
  const unitProfile = options.unitProfile ?? defaultUnitProfile(
    source,
    sourceSemanticHash,
    sourceEvidenceHash,
    analysisProfileId,
  );
  const unitNormalization = normalizeLinearPipingInputXmlGeometry(
    source.geometry,
    unitProfile,
  );
  const modelId = nonempty(options.modelId ?? 'IXP', 'options.modelId');
  const preparationId = nonempty(
    options.preparationId ?? `${modelId}:${analysisProfileId}`,
    'options.preparationId',
  );
  const authorities = prepareInputXmlElementAuthorities({
    sourceBundle: source,
    sourceBundleSemanticHash: sourceSemanticHash,
    geometry: unitNormalization.geometry,
    inventory: modelHealth.inventory,
    modelId,
    analysisProfileId,
  });
  const caseAvailability = buildCaseAvailability(authorities.loadBindings);
  const limitations = uniqueAscii([
    ...modelCapability.limitationCodes,
    ...authorities.segmentBindings.map((row) => row.limitationCode),
    ...caseAvailability.sustained.reasonCodes,
    ...caseAvailability.operating.reasonCodes,
  ]);
  const thermalCounts = countThermal(authorities.loadBindings);

  return sealInputXmlLinearSolvePreparation({
    schema: INPUTXML_LINEAR_SOLVE_PREPARATION_SCHEMA,
    preparationId,
    modelId,
    analysisProfileId,
    modelCapabilityId: profile.modelCapabilityId,
    modelCapabilityStatus: modelCapability.status,
    sourceBundleSemanticHash: sourceSemanticHash,
    sourceBundleEvidenceHash: sourceEvidenceHash,
    modelHealthSemanticHash: modelHealth.semanticHash,
    modelHealthEvidenceHash: modelHealth.evidenceHash,
    unitNormalizationSemanticHash: unitNormalization.semanticHash,
    unitNormalizationEvidenceHash: unitNormalization.evidenceHash,
    normalizedGeometry: unitNormalization.geometry,
    materialResolutions: authorities.materialResolutions,
    sectionResolutions: authorities.sectionResolutions,
    rigidAuthorities: authorities.rigidAuthorities,
    segmentBindings: authorities.segmentBindings,
    loadBindings: authorities.loadBindings,
    caseAvailability,
    limitations,
    summary: Object.freeze({
      sourceSegmentCount: source.geometry.segments.length,
      preparedSegmentCount: authorities.segmentBindings.length,
      materialResolutionCount: authorities.materialResolutions.length,
      sectionResolutionCount: authorities.sectionResolutions.length,
      rigidAuthorityCount: authorities.rigidAuthorities.length,
      gravityLoadBindingCount: authorities.loadBindings.length,
      activePressureBindingCount: authorities.loadBindings
        .filter((row) => row.pressure.active).length,
      activeThermalBindingCount: thermalCounts.active,
      resolvedThermalBindingCount: thermalCounts.resolved,
      unresolvedThermalBindingCount: thermalCounts.unresolved,
    }),
    executionBoundary: Object.freeze({
      constraintsCompiled: false,
      mechanicalModelCompiled: false,
      loadPrimitivesCompiled: false,
      stiffnessAssembled: false,
      factorizationCreated: false,
      solveAuthorized: false,
      reasonCodes: Object.freeze([
        'CONSTRAINT_COMPILATION_DEFERRED',
        'MECHANICAL_MODEL_COMPILATION_DEFERRED',
        'LOAD_PRIMITIVE_COMPILATION_DEFERRED',
        'STIFFNESS_PREFLIGHT_DEFERRED',
      ]),
    }),
  });
}

function defaultUnitProfile(
  source,
  sourceSemanticHash,
  sourceEvidenceHash,
  analysisProfileId,
) {
  const sourceUnit = nonempty(source.geometry.unit, 'sourceBundle.geometry.unit');
  return sealLinearPipingInputXmlUnitProfile({
    schema: LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
    profileId: `INPUTXML-PREPARATION-UNIT-${analysisProfileId}`,
    registryId: INPUTXML_LENGTH_UNIT_REGISTRY_ID,
    allowedSourceUnits: [sourceUnit],
    sourceEvidence: {
      authority: 'INPUTXML_MODEL_HEALTH_SOURCE_BUNDLE',
      documentId: source.fileName ?? source.jobName ?? source.source ?? 'inputxml',
      revision: sourceEvidenceHash,
      sourceSemanticHash,
    },
    semanticHash: '',
  });
}

function buildCaseAvailability(loadBindings) {
  const thermal = countThermal(loadBindings);
  const operatingReasonCodes = [];
  if (thermal.active === 0) operatingReasonCodes.push('OPERATING_TEMPERATURE_NOT_ACTIVE');
  if (thermal.unresolved > 0) operatingReasonCodes.push('THERMAL_EXPANSION_AUTHORITY_UNRESOLVED');
  if (operatingReasonCodes.length === 0) {
    operatingReasonCodes.push('LOAD_PRIMITIVE_COMPILATION_DEFERRED');
  }
  return Object.freeze({
    sustained: Object.freeze({
      status: 'PREPARED_AUTHORITY_ONLY',
      loadCaseCompilationAvailable: false,
      reasonCodes: Object.freeze(['LOAD_PRIMITIVE_COMPILATION_DEFERRED']),
    }),
    operating: Object.freeze({
      status: thermal.active > 0 && thermal.unresolved === 0
        ? 'PREPARED_AUTHORITY_ONLY'
        : 'UNAVAILABLE',
      loadCaseCompilationAvailable: false,
      reasonCodes: Object.freeze(operatingReasonCodes),
    }),
  });
}

function countThermal(loadBindings) {
  const thermalRows = loadBindings.map((row) => row.thermal);
  return {
    active: thermalRows.filter((row) => row.active).length,
    resolved: thermalRows.filter((row) => row.status === 'RESOLVED').length,
    unresolved: thermalRows.filter((row) => row.status === 'UNRESOLVED').length,
  };
}

function nonempty(value, field) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new InputXmlLinearSolvePreparationError(
      `${field} must be a non-empty string.`,
      'INPUTXML_PREPARATION_ID_INVALID',
      { field },
    );
  }
  return text;
}

function uniqueAscii(values) {
  return [...new Set(values
    .filter((value) => value !== null && value !== undefined)
    .map(String))].sort(compareAscii);
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
