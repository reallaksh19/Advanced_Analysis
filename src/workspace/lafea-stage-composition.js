/**
 * Registered LAFEA stage composition root.
 *
 * The registry owns stage identity and component IDs. This module resolves
 * those IDs to the already-qualified current-core adapters. No numerical
 * formulation, benchmark value, tolerance, shell label or release authority is
 * introduced here.
 */
import {
  calculateLocalAttachmentFoundation,
  createCanonicalLocalAttachmentFoundationModel,
  MODEL_SCHEMA as ATTACHMENT_MODEL_SCHEMA,
  validateCanonicalLocalAttachmentFoundationModel,
} from '../core/local-stress/index.js';
import {
  calculateLocalAttachmentScreening,
  createLocalAttachmentScreeningRequest,
  validateLocalAttachmentScreeningRequest,
} from '../core/local-attachment-screening/index.js';
import {
  calculateLocalContinuum,
  createCanonicalLocalContinuumModel,
  MODEL_SCHEMA as CONTINUUM_MODEL_SCHEMA,
  validateCanonicalLocalContinuumModel,
} from '../core/local-continuum/index.js';
import {
  calculateLocalShell,
  createCanonicalLocalShellModel,
  validateCanonicalLocalShellModel,
} from '../core/local-shell/index.js';
import {
  calculateLocalTrunnionFootprint,
  canonicalShellTemplateSemanticHash,
  createCanonicalTrunnionFootprintModel,
  createCanonicalTrunnionFootprintSource,
} from '../core/local-trunnion-footprint/index.js';
import { requireLafeaLifecycleProfileForStage } from './lafea-lifecycle-profiles.js';
import {
  LAFEA_STAGE_REGISTRY,
  requireLafeaStageRegistryEntry,
} from './lafea-stage-registry.js';

export const LAFEA_STAGE_COMPOSITION_SCHEMA = 'lafea-stage-composition-root/v1';

const NORMALIZERS = Object.freeze({
  'LAFEA.1/NORMALIZER/ATTACHMENT_FOUNDATION/V1': normalizeAttachmentFoundation,
  'LAFEA.2/NORMALIZER/PIPE_SECTION_SCREENING/V1': normalizePipeSectionScreening,
  'LAFEA.3/NORMALIZER/T3_T6_Q8_CONTINUUM/V1': normalizeContinuum,
  'LAFEA.4/NORMALIZER/CST_DKT_TRI3_THIN_SHELL/V1': normalizeThinShell,
  'LAFEA.5/NORMALIZER/TRUNNION_FOOTPRINT/V1': normalizeTrunnionFootprint,
  'LAFEA.6/NORMALIZER/UNSUPPORTED_WELD_PROFILE/V1': normalizeUnsupportedWeldProfile,
});

const EDIT_RESEALERS = Object.freeze({
  'LAFEA.1/EDIT_RESEAL/ATTACHMENT_FOUNDATION/V1': cloneRecord,
  'LAFEA.2/EDIT_RESEAL/PIPE_SECTION_SCREENING/V1': cloneRecord,
  'LAFEA.3/EDIT_RESEAL/T3_T6_Q8_CONTINUUM/V1': cloneRecord,
  'LAFEA.4/EDIT_RESEAL/CST_DKT_TRI3_THIN_SHELL/V1': cloneRecord,
  'LAFEA.5/EDIT_RESEAL/TRUNNION_FOOTPRINT/V1': resealTrunnionEdit,
  'LAFEA.6/EDIT_RESEAL/UNSUPPORTED_WELD_PROFILE/V1': cloneRecord,
});

const CANONICAL_INPUT_FACTORIES = Object.freeze({
  'LAFEA.1/CANONICAL_INPUT/ATTACHMENT_FOUNDATION/V1':
    (source) => createCanonicalLocalAttachmentFoundationModel(stripWorkbenchFields(source)),
  'LAFEA.2/CANONICAL_INPUT/PIPE_SECTION_SCREENING/V1':
    (source) => createLocalAttachmentScreeningRequest(stripWorkbenchFields(source)),
  'LAFEA.3/CANONICAL_INPUT/T3_T6_Q8_CONTINUUM/V1':
    (source) => createCanonicalLocalContinuumModel(stripWorkbenchFields(source)),
  'LAFEA.4/CANONICAL_INPUT/CST_DKT_TRI3_THIN_SHELL/V1':
    (source) => createCanonicalLocalShellModel(stripWorkbenchFields(source)),
  'LAFEA.5/CANONICAL_INPUT/TRUNNION_FOOTPRINT/V1':
    (source) => createCanonicalTrunnionFootprintSource(stripWorkbenchFields(source)),
  'LAFEA.6/CANONICAL_INPUT/UNSUPPORTED_WELD_PROFILE/V1':
    () => { throw unsupportedStageError('LAFEA.6'); },
});

const EXECUTORS = Object.freeze({
  'LAFEA.1/EXECUTOR/ATTACHMENT_FOUNDATION/V1': calculateLocalAttachmentFoundation,
  'LAFEA.2/EXECUTOR/PIPE_SECTION_SCREENING/V1': calculateLocalAttachmentScreening,
  'LAFEA.3/EXECUTOR/T3_T6_Q8_CONTINUUM/V1': calculateLocalContinuum,
  'LAFEA.4/EXECUTOR/CST_DKT_TRI3_THIN_SHELL/V1': calculateLocalShell,
  'LAFEA.5/EXECUTOR/TRUNNION_FOOTPRINT/V1': calculateLocalTrunnionFootprint,
  'LAFEA.6/EXECUTOR/UNSUPPORTED_WELD_PROFILE/V1':
    () => { throw unsupportedStageError('LAFEA.6'); },
});

const ACCEPTANCE_EVALUATORS = Object.freeze({
  'LAFEA.1/ACCEPTANCE/ATTACHMENT_FOUNDATION/V1':
    (result) => result?.qualification?.state === 'ACCEPTED',
  'LAFEA.2/ACCEPTANCE/PIPE_SECTION_SCREENING/V1':
    (result) => result?.qualification?.state === 'ACCEPTED',
  'LAFEA.3/ACCEPTANCE/T3_T6_Q8_CONTINUUM/V1':
    (result) => result?.qualification?.state === 'ACCEPTED',
  'LAFEA.4/ACCEPTANCE/CST_DKT_TRI3_THIN_SHELL/V1':
    (result) => result?.qualification?.accepted === true,
  'LAFEA.5/ACCEPTANCE/TRUNNION_FOOTPRINT/V1':
    (result) => result?.qualification?.accepted === true,
  'LAFEA.6/ACCEPTANCE/UNSUPPORTED_WELD_PROFILE/V1': () => false,
});

export const LAFEA_STAGE_COMPOSITIONS = Object.freeze(
  LAFEA_STAGE_REGISTRY.map(createComposition),
);

export function requireLafeaStageComposition(stageId) {
  requireLafeaStageRegistryEntry(stageId);
  const composition = LAFEA_STAGE_COMPOSITIONS.find((row) => row.stageId === stageId);
  if (!composition) throw new TypeError(`No LAFEA composition is registered for ${stageId}.`);
  return composition;
}

export function lafeaStageCompositionSummary(stageId) {
  const composition = requireLafeaStageComposition(stageId);
  return deepFreeze({
    schema: composition.schema,
    stageId: composition.stageId,
    authorityPathId: composition.authorityPathId,
    componentIds: composition.componentIds,
    benchmarkManifestIds: composition.benchmarkManifestIds,
    lifecycleProfileId: composition.lifecycleProfileId,
    releaseStateBinding: composition.releaseStateBinding,
    engineState: composition.engineState,
  });
}

export function normalizeLafeaComposedStageDocument(stageId, input) {
  const composition = requireLafeaStageComposition(stageId);
  const meshConfig = isRecord(input?.meshConfig) ? cloneRecord(input.meshConfig) : undefined;
  const cleanInput = stripWorkbenchFields(cloneRecord(input));
  const source = composition.documentNormalizer(cleanInput);
  return freezeClone({ ...source, ...(meshConfig ? { meshConfig } : {}) });
}

export function normalizeLafeaComposedStageEdit(stageId, input) {
  const composition = requireLafeaStageComposition(stageId);
  const source = composition.editResealer(input);
  return normalizeLafeaComposedStageDocument(stageId, source);
}

export function executeLafeaComposedStage(stageId, document) {
  const composition = requireLafeaStageComposition(stageId);
  if (composition.engineState !== 'QUALIFIED_ROUTE_REGISTERED') {
    return freezeClone({
      stageId,
      authorityPathId: composition.authorityPathId,
      status: 'FAILED',
      source: null,
      canonicalInput: null,
      result: null,
      diagnostics: [unsupportedStageDiagnostic(stageId)],
    });
  }
  try {
    const source = normalizeLafeaComposedStageDocument(stageId, document);
    const canonicalInput = composition.canonicalInputFactory(source);
    const result = composition.calculationExecutor(canonicalInput);
    const accepted = composition.acceptanceEvaluator(result);
    return freezeClone({
      stageId,
      authorityPathId: composition.authorityPathId,
      status: accepted ? 'QUALIFIED' : 'FAILED',
      source,
      canonicalInput,
      result,
      diagnostics: accepted ? [] : normalizedDiagnostics(result),
    });
  } catch (error) {
    return freezeClone({
      stageId,
      authorityPathId: composition.authorityPathId,
      status: 'FAILED',
      source: null,
      canonicalInput: null,
      result: null,
      diagnostics: [errorDiagnostic(error)],
    });
  }
}

function createComposition(registryEntry) {
  const profile = requireLafeaLifecycleProfileForStage(registryEntry.stageId);
  if (profile.profileId !== registryEntry.lifecycleProfileId) {
    throw new TypeError(
      `Lifecycle profile mismatch for ${registryEntry.stageId}: `
      + `${registryEntry.lifecycleProfileId} != ${profile.profileId}.`,
    );
  }
  if (registryEntry.releaseStateBinding.state !== 'RELEASE_NOT_QUALIFIED'
      || registryEntry.releaseStateBinding.automaticPromotion !== false) {
    throw new TypeError(`Composition release binding must fail closed for ${registryEntry.stageId}.`);
  }
  const componentIds = registryEntry.componentIds;
  const documentNormalizer = requireComponent(
    NORMALIZERS, componentIds.documentNormalizerId, registryEntry.stageId,
  );
  const editResealer = requireComponent(
    EDIT_RESEALERS, componentIds.editResealerId, registryEntry.stageId,
  );
  const canonicalInputFactory = requireComponent(
    CANONICAL_INPUT_FACTORIES, componentIds.canonicalInputFactoryId, registryEntry.stageId,
  );
  const calculationExecutor = requireComponent(
    EXECUTORS, componentIds.calculationExecutorId, registryEntry.stageId,
  );
  const acceptanceEvaluator = requireComponent(
    ACCEPTANCE_EVALUATORS, componentIds.acceptanceEvaluatorId, registryEntry.stageId,
  );
  return deepFreeze({
    schema: LAFEA_STAGE_COMPOSITION_SCHEMA,
    stageId: registryEntry.stageId,
    authorityPathId: registryEntry.authorityPathId,
    componentIds,
    benchmarkManifestIds: registryEntry.benchmarkManifestIds,
    lifecycleProfileId: registryEntry.lifecycleProfileId,
    releaseStateBinding: registryEntry.releaseStateBinding,
    engineState: registryEntry.engineState,
    documentNormalizer,
    editResealer,
    canonicalInputFactory,
    calculationExecutor,
    acceptanceEvaluator,
  });
}

function requireComponent(catalog, componentId, stageId) {
  const component = catalog[componentId];
  if (typeof component !== 'function') {
    throw new TypeError(`Missing registered component ${componentId} for ${stageId}.`);
  }
  return component;
}

function resealTrunnionEdit(input) {
  const source = cloneRecord(input);
  if (isRecord(source.sourceAncestry) && isRecord(source.shellTemplate)) {
    source.sourceAncestry.shellTemplateSemanticHash =
      canonicalShellTemplateSemanticHash(source.shellTemplate);
  }
  return source;
}

function normalizeAttachmentFoundation(input) {
  const cleanInput = editableAttachmentFoundation(input);
  const retained = createCanonicalLocalAttachmentFoundationModel(cleanInput).sourceEvidence;
  return { ...retained, schema: ATTACHMENT_MODEL_SCHEMA };
}

function normalizePipeSectionScreening(input) {
  return editableScreening(createLocalAttachmentScreeningRequest(editableScreening(input)));
}

function normalizeContinuum(input) {
  const cleanInput = editableContinuum(input);
  const retained = createCanonicalLocalContinuumModel(cleanInput).sourceEvidence;
  return { ...retained, schema: CONTINUUM_MODEL_SCHEMA };
}

function normalizeThinShell(input) {
  return withoutHash(createCanonicalLocalShellModel(editableThinShell(input)));
}

function normalizeTrunnionFootprint(input) {
  const retained = createCanonicalTrunnionFootprintSource(input);
  createCanonicalTrunnionFootprintModel(retained);
  return retained;
}

function normalizeUnsupportedWeldProfile(input) {
  return input;
}

function editableAttachmentFoundation(input) {
  if (isRecord(input.sourceEvidence)) {
    const source = validateCanonicalLocalAttachmentFoundationModel(input).sourceEvidence;
    return { ...source, schema: ATTACHMENT_MODEL_SCHEMA };
  }
  return input;
}

function editableContinuum(input) {
  if (isRecord(input.sourceEvidence)) {
    const source = validateCanonicalLocalContinuumModel(input).sourceEvidence;
    return { ...source, schema: CONTINUUM_MODEL_SCHEMA };
  }
  return input;
}

function editableThinShell(input) {
  if (typeof input.semanticHash === 'string') {
    return withoutHash(validateCanonicalLocalShellModel(input));
  }
  return withoutHash(input);
}

function editableScreening(input) {
  const validated = typeof input.semanticHash === 'string'
    ? validateLocalAttachmentScreeningRequest(input)
    : input;
  const result = withoutHash(validated);
  if (Array.isArray(result.evaluationLocations)) {
    result.evaluationLocations = result.evaluationLocations.map((row) => {
      const copy = cloneRecord(row);
      delete copy.radius;
      return copy;
    });
  }
  return result;
}

function stripWorkbenchFields(input) {
  if (!isRecord(input)) return input;
  const { meshConfig, ...kernelSource } = input;
  return kernelSource;
}

function unsupportedStageDiagnostic(stageId) {
  const entry = requireLafeaStageRegistryEntry(stageId);
  return {
    severity: 'ERROR',
    code: 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED',
    path: 'stageId',
    message: `${entry.stageId} calculation is disabled because no qualified core engine is registered.`,
  };
}

function unsupportedStageError(stageId) {
  const error = new Error(`No qualified calculation engine is registered for ${stageId}.`);
  error.code = 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED';
  error.path = 'stageId';
  return error;
}

function normalizedDiagnostics(result) {
  const rows = Array.isArray(result?.diagnostics) ? result.diagnostics : [];
  return rows.length ? rows : [{
    severity: 'ERROR',
    code: 'LAFEA_CALCULATION_REJECTED',
    message: result?.qualification?.summary || 'The qualified kernel rejected the document.',
  }];
}

function errorDiagnostic(error) {
  return {
    severity: 'ERROR',
    code: typeof error?.code === 'string' ? error.code : 'LAFEA_DOCUMENT_REJECTED',
    path: typeof error?.path === 'string' ? error.path : 'document',
    message: error instanceof Error ? error.message : 'Unknown LAFEA document failure.',
  };
}

function withoutHash(value) {
  const result = cloneRecord(value);
  delete result.semanticHash;
  return result;
}

function cloneRecord(value) {
  if (!isRecord(value)) throw new TypeError('LAFEA document must be a JSON object.');
  return structuredClone(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function freezeClone(value) {
  return deepFreeze(structuredClone(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
