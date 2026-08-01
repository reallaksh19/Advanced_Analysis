/**
 * LAFEA workbench calculation orchestration.
 *
 * Stage-specific normalizers, calculators, acceptance rules, presenters and
 * unit resolvers are resolved through the governed composition root.
 */
import {
  LAFEA_STAGE_DEFINITIONS,
  LAFEA_STAGE_IDS,
  lafeaRegisteredCollectionPaths,
  requireLafeaStageRegistryEntry,
} from './lafea-stage-registry.js';
import { requireLafeaStageComposition } from './lafea-stage-composition-root.js';

export { lafeaPreviewGeometry } from './lafea-stage-preview.js';
export { LAFEA_STAGE_DEFINITIONS, LAFEA_STAGE_IDS };

export const LAFEA_WORKBENCH_DOCUMENT_SCHEMA = 'lafea-workbench-document/v1';

/** Validate and normalize an editable document for one exact LAFEA stage. */
export function normalizeLafeaStageDocument(stageId, input) {
  return requireLafeaStageComposition(stageId).normalizeDocument(input);
}

/** Reseal only derived ancestry produced by an explicit local form edit. */
export function normalizeLafeaStageEdit(stageId, input) {
  return requireLafeaStageComposition(stageId).normalizeEdit(input);
}

/** Whether the composition root declares a qualified calculation route. */
export function lafeaStageExecutionSupported(stageId) {
  return requireLafeaStageComposition(stageId).executionSupported;
}

/** Execute the exact calculation route assigned by the composition root. */
export function executeLafeaStage(stageId, document) {
  const composition = requireLafeaStageComposition(stageId);
  if (!composition.executionSupported) return unsupportedExecution(composition.registryEntry);
  try {
    const source = composition.normalizeDocument(document);
    const canonicalInput = composition.canonicalize(source);
    const result = composition.calculate(canonicalInput);
    const accepted = composition.acceptResult(result);
    return freezeClone({
      stageId,
      status: accepted ? 'QUALIFIED' : 'FAILED',
      source,
      canonicalInput,
      result,
      diagnostics: accepted ? [] : normalizedDiagnostics(result),
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

/** Return collection paths owned by the stage registry. */
export function lafeaCollectionPaths(stageId) {
  return lafeaRegisteredCollectionPaths(stageId);
}

function unsupportedExecution(entry) {
  return freezeClone({
    stageId: entry.stageId,
    status: 'FAILED',
    source: null,
    canonicalInput: null,
    result: null,
    diagnostics: [{
      severity: 'ERROR',
      code: 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED',
      path: 'stageId',
      message: `${entry.stageId} calculation is disabled because no qualified core engine is registered.`,
    }],
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

function errorDiagnostic(error) {
  return {
    severity: 'ERROR',
    code: typeof error?.code === 'string' ? error.code : 'LAFEA_DOCUMENT_REJECTED',
    path: typeof error?.path === 'string' ? error.path : 'document',
    message: error instanceof Error ? error.message : 'Unknown LAFEA document failure.',
  };
}

export function requireLafeaWorkbenchStage(stageId) {
  return requireLafeaStageRegistryEntry(stageId);
}

function freezeClone(value) {
  return deepFreeze(structuredClone(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
