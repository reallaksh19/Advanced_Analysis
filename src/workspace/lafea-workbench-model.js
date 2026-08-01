/**
 * LAFEA workbench stage calculation facade.
 *
 * Registry v2 owns route identity and the NB-T3 composition root is the only
 * workspace module that binds stage identity to current-core functions.
 */
import {
  acceptsLafeaComposedResult,
  calculateLafeaComposedStage,
  createLafeaComposedCanonicalInput,
  normalizeLafeaComposedStageDocument,
} from './lafea-stage-composition-root.js';
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

/** Validate and normalize an editable document for one exact LAFEA stage. */
export function normalizeLafeaStageDocument(stageId, input) {
  assertStageId(stageId);
  return normalizeLafeaComposedStageDocument(stageId, input);
}

/** Reseal only derived ancestry produced by an explicit local form edit. */
export function normalizeLafeaStageEdit(stageId, input) {
  assertStageId(stageId);
  return normalizeLafeaComposedStageDocument(stageId, input, { edit: true });
}

/** Whether registry v2 declares a qualified calculation route. */
export function lafeaStageExecutionSupported(stageId) {
  return lafeaRegisteredExecutionSupported(stageId);
}

/** Execute the exact current-core route registered by the composition root. */
export function executeLafeaStage(stageId, document) {
  assertStageId(stageId);
  if (!lafeaStageExecutionSupported(stageId)) {
    return frozenFailure(stageId, unsupportedStageDiagnostic(stageId));
  }
  try {
    const source = normalizeLafeaStageDocument(stageId, document);
    const canonicalInput = createLafeaComposedCanonicalInput(stageId, source);
    const result = calculateLafeaComposedStage(stageId, canonicalInput);
    const accepted = acceptsLafeaComposedResult(stageId, result);
    return freezeClone({
      stageId,
      status: accepted ? 'QUALIFIED' : 'FAILED',
      source,
      canonicalInput,
      result,
      diagnostics: accepted ? [] : normalizedDiagnostics(result),
    });
  } catch (error) {
    return frozenFailure(stageId, errorDiagnostic(error));
  }
}

/** Return collection paths owned by registry v2. */
export function lafeaCollectionPaths(stageId) {
  return lafeaRegisteredCollectionPaths(stageId);
}

function frozenFailure(stageId, diagnostic) {
  return freezeClone({
    stageId,
    status: 'FAILED',
    source: null,
    canonicalInput: null,
    result: null,
    diagnostics: [diagnostic],
  });
}

function normalizedDiagnostics(result) {
  const rows = Array.isArray(result?.diagnostics) ? result.diagnostics : [];
  return rows.length ? rows : [{
    severity: 'ERROR',
    code: 'LAFEA_CALCULATION_REJECTED',
    message: result?.qualification?.summary || 'The qualified kernel rejected the document.',
  }];
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

function freezeClone(value) {
  return deepFreeze(structuredClone(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
