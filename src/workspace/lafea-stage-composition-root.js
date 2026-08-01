/**
 * NB-T3 composition root for current LAFEA stage routes.
 *
 * This is the only workspace module that binds stage identity to current-core
 * normalization, canonical-input, calculation and result-acceptance functions.
 * The registry owns component identity; this module proves the bound functions
 * implement exactly that declared route. It does not add numerical authority.
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
import {
  LAFEA_COMPONENT_ROLES,
  LAFEA_STAGE_IDS,
  requireLafeaStageRegistryEntry,
} from './lafea-stage-registry.js';

export const LAFEA_STAGE_COMPOSITION_SCHEMA = 'lafea-stage-composition-root/v1';

const ROUTES = Object.freeze([
  route('LAFEA.1', {
    normalizeSource: normalizeAttachment,
    canonicalInput: createCanonicalLocalAttachmentFoundationModel,
    calculate: calculateLocalAttachmentFoundation,
    acceptsResult: acceptsStateResult,
  }),
  route('LAFEA.2', {
    normalizeSource: normalizeScreening,
    canonicalInput: createLocalAttachmentScreeningRequest,
    calculate: calculateLocalAttachmentScreening,
    acceptsResult: acceptsStateResult,
  }),
  route('LAFEA.3', {
    normalizeSource: normalizeContinuum,
    canonicalInput: createCanonicalLocalContinuumModel,
    calculate: calculateLocalContinuum,
    acceptsResult: acceptsStateResult,
  }),
  route('LAFEA.4', {
    normalizeSource: normalizeShell,
    canonicalInput: createCanonicalLocalShellModel,
    calculate: calculateLocalShell,
    acceptsResult: acceptsBooleanResult,
  }),
  route('LAFEA.5', {
    normalizeSource: normalizeTrunnion,
    canonicalInput: createCanonicalTrunnionFootprintSource,
    calculate: calculateLocalTrunnionFootprint,
    acceptsResult: acceptsBooleanResult,
  }),
  route('LAFEA.6', {
    normalizeSource: normalizeUnsupported,
    canonicalInput: null,
    calculate: null,
    acceptsResult: null,
  }),
]);

export const LAFEA_STAGE_COMPOSITION_METADATA = deepFreeze(
  ROUTES.map((row) => ({
    schema: row.schema,
    stageId: row.stageId,
    compositionRootId: row.compositionRootId,
    componentIds: row.componentIds,
    executionSupported: row.executionSupported,
  })),
);

export function requireLafeaStageCompositionRoute(stageId) {
  const result = ROUTES.find((row) => row.stageId === stageId);
  if (!result) throw new TypeError(`No LAFEA composition route is registered for ${stageId}.`);
  return result;
}

export function normalizeLafeaComposedStageDocument(stageId, input, options = {}) {
  const routeValue = requireLafeaStageCompositionRoute(stageId);
  const meshConfig = isRecord(input?.meshConfig) ? cloneRecord(input.meshConfig) : undefined;
  const cleanInput = stripWorkbenchFields(cloneRecord(input));
  const normalized = routeValue.normalizeSource(cleanInput, options);
  return freezeClone({ ...normalized, ...(meshConfig ? { meshConfig } : {}) });
}

export function createLafeaComposedCanonicalInput(stageId, source) {
  const routeValue = requireLafeaStageCompositionRoute(stageId);
  if (!routeValue.canonicalInput) throw unsupportedStageError(stageId);
  return routeValue.canonicalInput(stripWorkbenchFields(source));
}

export function calculateLafeaComposedStage(stageId, canonicalInput) {
  const routeValue = requireLafeaStageCompositionRoute(stageId);
  if (!routeValue.calculate) throw unsupportedStageError(stageId);
  return routeValue.calculate(canonicalInput);
}

export function acceptsLafeaComposedResult(stageId, result) {
  const routeValue = requireLafeaStageCompositionRoute(stageId);
  return routeValue.acceptsResult ? routeValue.acceptsResult(result) : false;
}

function normalizeAttachment(input) {
  const source = editableAttachment(input);
  const retained = createCanonicalLocalAttachmentFoundationModel(source).sourceEvidence;
  return { ...retained, schema: ATTACHMENT_MODEL_SCHEMA };
}

function normalizeScreening(input) {
  const source = typeof input.semanticHash === 'string'
    ? editableScreening(validateLocalAttachmentScreeningRequest(input))
    : editableScreening(input);
  return editableScreening(createLocalAttachmentScreeningRequest(source));
}

function normalizeContinuum(input) {
  const source = editableContinuum(input);
  const retained = createCanonicalLocalContinuumModel(source).sourceEvidence;
  return { ...retained, schema: CONTINUUM_MODEL_SCHEMA };
}

function normalizeShell(input) {
  const source = typeof input.semanticHash === 'string'
    ? withoutHash(validateCanonicalLocalShellModel(input))
    : withoutHash(input);
  return withoutHash(createCanonicalLocalShellModel(source));
}

function normalizeTrunnion(input, options) {
  const source = cloneRecord(input);
  if (options.edit === true && isRecord(source.sourceAncestry) && isRecord(source.shellTemplate)) {
    source.sourceAncestry.shellTemplateSemanticHash =
      canonicalShellTemplateSemanticHash(source.shellTemplate);
  }
  const retained = createCanonicalTrunnionFootprintSource(source);
  createCanonicalTrunnionFootprintModel(retained);
  return retained;
}

function normalizeUnsupported(input) {
  return cloneRecord(input);
}

function editableAttachment(input) {
  if (!isRecord(input.sourceEvidence)) return input;
  const source = validateCanonicalLocalAttachmentFoundationModel(input).sourceEvidence;
  return { ...source, schema: ATTACHMENT_MODEL_SCHEMA };
}

function editableContinuum(input) {
  if (!isRecord(input.sourceEvidence)) return input;
  const source = validateCanonicalLocalContinuumModel(input).sourceEvidence;
  return { ...source, schema: CONTINUUM_MODEL_SCHEMA };
}

function editableScreening(input) {
  const result = withoutHash(input);
  if (Array.isArray(result.evaluationLocations)) {
    result.evaluationLocations = result.evaluationLocations.map((row) => {
      const copy = cloneRecord(row);
      delete copy.radius;
      return copy;
    });
  }
  return result;
}

function acceptsStateResult(result) {
  return result?.qualification?.state === 'ACCEPTED';
}

function acceptsBooleanResult(result) {
  return result?.qualification?.accepted === true;
}

function route(stageId, handlers) {
  const registry = requireLafeaStageRegistryEntry(stageId);
  const executionSupported = registry.engineState === 'QUALIFIED_ROUTE_REGISTERED';
  if (executionSupported !== Boolean(
    handlers.canonicalInput && handlers.calculate && handlers.acceptsResult,
  )) {
    throw new TypeError(`LAFEA composition support mismatch for ${stageId}.`);
  }
  const componentIds = registry.componentIds;
  if (JSON.stringify(Object.keys(componentIds).sort())
    !== JSON.stringify([...LAFEA_COMPONENT_ROLES].sort())) {
    throw new TypeError(`LAFEA component role mismatch for ${stageId}.`);
  }
  return Object.freeze({
    schema: LAFEA_STAGE_COMPOSITION_SCHEMA,
    stageId,
    compositionRootId: registry.compositionRootId,
    componentIds,
    executionSupported,
    normalizeSource: handlers.normalizeSource,
    canonicalInput: handlers.canonicalInput,
    calculate: handlers.calculate,
    acceptsResult: handlers.acceptsResult,
  });
}

if (ROUTES.length !== LAFEA_STAGE_IDS.length
  || new Set(ROUTES.map((row) => row.stageId)).size !== LAFEA_STAGE_IDS.length) {
  throw new TypeError('Every LAFEA stage must have exactly one composition route.');
}
for (const stageId of LAFEA_STAGE_IDS) requireLafeaStageCompositionRoute(stageId);

function stripWorkbenchFields(input) {
  if (!isRecord(input)) return input;
  const { meshConfig, ...kernelSource } = input;
  return kernelSource;
}

function unsupportedStageError(stageId) {
  const error = new Error(`No qualified calculation engine is registered for ${stageId}.`);
  error.code = 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED';
  error.path = 'stageId';
  return error;
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
