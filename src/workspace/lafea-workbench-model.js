/**
 * LAFEA workbench stage calculation adapters.
 *
 * Stage identity, taxonomy, capability state and collection paths are owned by
 * `lafea-stage-registry.js`. This module owns only source normalization and
 * dispatch to already-qualified core calculation packages.
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
  LAFEA_STAGE_DEFINITIONS,
  LAFEA_STAGE_IDS,
  lafeaRegisteredCollectionPaths,
  lafeaRegisteredExecutionSupported,
  requireLafeaStageRegistryEntry,
} from './lafea-stage-registry.js';

export { lafeaPreviewGeometry } from './lafea-stage-preview.js';
export { LAFEA_STAGE_DEFINITIONS, LAFEA_STAGE_IDS };

export const LAFEA_WORKBENCH_DOCUMENT_SCHEMA = 'lafea-workbench-document/v1';

/**
 * Validate and normalize an editable document for one exact LAFEA stage.
 *
 * @param {string} stageId Exact LAFEA stage identity.
 * @param {unknown} input Imported source or canonical model.
 * @returns {Readonly<Record<string, unknown>>} Editable canonical source.
 */
export function normalizeLafeaStageDocument(stageId, input) {
  assertStageId(stageId);
  const meshConfig = isRecord(input?.meshConfig) ? cloneRecord(input.meshConfig) : undefined;
  const cleanInput = stripWorkbenchFields(cloneRecord(input));
  const source = editableSource(stageId, cleanInput);
  if (stageId === 'LAFEA.1') {
    const retained = createCanonicalLocalAttachmentFoundationModel(source).sourceEvidence;
    return freezeClone({ ...retained, schema: ATTACHMENT_MODEL_SCHEMA, ...(meshConfig ? { meshConfig } : {}) });
  }
  if (stageId === 'LAFEA.2') {
    const base = editableScreening(createLocalAttachmentScreeningRequest(source));
    return freezeClone({ ...base, ...(meshConfig ? { meshConfig } : {}) });
  }
  if (stageId === 'LAFEA.3') {
    const retained = createCanonicalLocalContinuumModel(source).sourceEvidence;
    return freezeClone({ ...retained, schema: CONTINUUM_MODEL_SCHEMA, ...(meshConfig ? { meshConfig } : {}) });
  }
  if (stageId === 'LAFEA.4') {
    const base = withoutHash(createCanonicalLocalShellModel(source));
    return freezeClone({ ...base, ...(meshConfig ? { meshConfig } : {}) });
  }
  if (stageId === 'LAFEA.6') {
    return freezeClone({ ...source, ...(meshConfig ? { meshConfig } : {}) });
  }
  const retained = createCanonicalTrunnionFootprintSource(source);
  createCanonicalTrunnionFootprintModel(retained);
  return freezeClone({ ...retained, ...(meshConfig ? { meshConfig } : {}) });
}

/**
 * Reseal only derived ancestry produced by an explicit local form edit.
 *
 * @param {string} stageId Exact LAFEA stage identity.
 * @param {unknown} input Edited source document.
 * @returns {Readonly<Record<string, unknown>>} Validated editable source.
 */
export function normalizeLafeaStageEdit(stageId, input) {
  const source = cloneRecord(input);
  if (stageId === 'LAFEA.5' && isRecord(source.sourceAncestry) && isRecord(source.shellTemplate)) {
    source.sourceAncestry.shellTemplateSemanticHash = canonicalShellTemplateSemanticHash(source.shellTemplate);
  }
  return normalizeLafeaStageDocument(stageId, source);
}

/**
 * Whether the registry declares a qualified calculation route.
 *
 * @param {string} stageId Exact LAFEA stage identity.
 * @returns {boolean}
 */
export function lafeaStageExecutionSupported(stageId) {
  return lafeaRegisteredExecutionSupported(stageId);
}

/**
 * Execute the qualified calculation adapter assigned to a registered stage.
 *
 * @param {string} stageId Exact LAFEA stage identity.
 * @param {unknown} document Editable stage source.
 * @returns {Readonly<Record<string, unknown>>} Calculation outcome and evidence.
 */
export function executeLafeaStage(stageId, document) {
  assertStageId(stageId);
  if (!lafeaStageExecutionSupported(stageId)) {
    return freezeClone({
      stageId,
      status: 'FAILED',
      source: null,
      canonicalInput: null,
      result: null,
      diagnostics: [unsupportedStageDiagnostic(stageId)],
    });
  }
  try {
    const source = normalizeLafeaStageDocument(stageId, document);
    const canonicalInput = canonicalCalculationInput(stageId, source);
    const result = calculate(stageId, canonicalInput);
    const accepted = acceptedResult(stageId, result);
    const diagnostics = accepted ? [] : normalizedDiagnostics(result);
    return freezeClone({
      stageId,
      status: accepted ? 'QUALIFIED' : 'FAILED',
      source,
      canonicalInput,
      result,
      diagnostics,
    });
  } catch (error) {
    return freezeClone({
      stageId,
      status: 'FAILED',
      source: null,
      canonicalInput: null,
      result: null,
      diagnostics: [errorDiagnostic(error)],
    });
  }
}

/**
 * Return collection paths owned by the stage registry.
 *
 * @param {string} stageId Exact LAFEA stage identity.
 * @returns {ReadonlyArray<string>} Stable collection paths.
 */
export function lafeaCollectionPaths(stageId) {
  return lafeaRegisteredCollectionPaths(stageId);
}

function stripWorkbenchFields(input) {
  if (!isRecord(input)) return input;
  const { meshConfig, ...kernelSource } = input;
  return kernelSource;
}

function canonicalCalculationInput(stageId, source) {
  const cleanSource = stripWorkbenchFields(source);
  if (stageId === 'LAFEA.1') return createCanonicalLocalAttachmentFoundationModel(cleanSource);
  if (stageId === 'LAFEA.2') return createLocalAttachmentScreeningRequest(cleanSource);
  if (stageId === 'LAFEA.3') return createCanonicalLocalContinuumModel(cleanSource);
  if (stageId === 'LAFEA.4') return createCanonicalLocalShellModel(cleanSource);
  if (stageId === 'LAFEA.5') return createCanonicalTrunnionFootprintSource(cleanSource);
  throw unsupportedStageError(stageId);
}

function calculate(stageId, input) {
  if (stageId === 'LAFEA.1') return calculateLocalAttachmentFoundation(input);
  if (stageId === 'LAFEA.2') return calculateLocalAttachmentScreening(input);
  if (stageId === 'LAFEA.3') return calculateLocalContinuum(input);
  if (stageId === 'LAFEA.4') return calculateLocalShell(input);
  if (stageId === 'LAFEA.5') return calculateLocalTrunnionFootprint(input);
  throw unsupportedStageError(stageId);
}

function acceptedResult(stageId, result) {
  if (stageId === 'LAFEA.4' || stageId === 'LAFEA.5') {
    return result?.qualification?.accepted === true;
  }
  return result?.qualification?.state === 'ACCEPTED';
}

function normalizedDiagnostics(result) {
  const rows = Array.isArray(result?.diagnostics) ? result.diagnostics : [];
  return rows.length ? rows : [{
    severity: 'ERROR',
    code: 'LAFEA_CALCULATION_REJECTED',
    message: result?.qualification?.summary || 'The qualified kernel rejected the document.',
  }];
}

function editableSource(stageId, input) {
  const cleanInput = stripWorkbenchFields(input);
  if (stageId === 'LAFEA.1' && isRecord(cleanInput.sourceEvidence)) {
    const source = validateCanonicalLocalAttachmentFoundationModel(cleanInput).sourceEvidence;
    return { ...source, schema: ATTACHMENT_MODEL_SCHEMA };
  }
  if (stageId === 'LAFEA.3' && isRecord(cleanInput.sourceEvidence)) {
    const source = validateCanonicalLocalContinuumModel(cleanInput).sourceEvidence;
    return { ...source, schema: CONTINUUM_MODEL_SCHEMA };
  }
  if (stageId === 'LAFEA.2' && typeof cleanInput.semanticHash === 'string') {
    return editableScreening(validateLocalAttachmentScreeningRequest(cleanInput));
  }
  if (stageId === 'LAFEA.4' && typeof cleanInput.semanticHash === 'string') {
    return withoutHash(validateCanonicalLocalShellModel(cleanInput));
  }
  if (stageId === 'LAFEA.2') return editableScreening(cleanInput);
  if (stageId === 'LAFEA.4') return withoutHash(cleanInput);
  return cleanInput;
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

function errorDiagnostic(error) {
  return {
    severity: 'ERROR',
    code: typeof error?.code === 'string' ? error.code : 'LAFEA_DOCUMENT_REJECTED',
    path: typeof error?.path === 'string' ? error.path : 'document',
    message: error instanceof Error ? error.message : 'Unknown LAFEA document failure.',
  };
}

function assertStageId(stageId) {
  requireLafeaStageRegistryEntry(stageId);
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
