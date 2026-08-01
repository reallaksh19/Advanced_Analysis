/**
 * LAFEA workbench stage calculation facade.
 *
 * Stage identity, component bindings and the single current authority path are
 * owned by registry v2 and the composition root. This facade preserves the
 * existing public workbench API without duplicating stage dispatch.
 */
import {
  LAFEA_STAGE_DEFINITIONS,
  LAFEA_STAGE_IDS,
  lafeaRegisteredCollectionPaths,
  lafeaRegisteredExecutionSupported,
} from './lafea-stage-registry.js';
import {
  executeLafeaComposedStage,
  normalizeLafeaComposedStageDocument,
  normalizeLafeaComposedStageEdit,
} from './lafea-stage-composition.js';

export { lafeaPreviewGeometry } from './lafea-stage-preview.js';
export { LAFEA_STAGE_DEFINITIONS, LAFEA_STAGE_IDS };

export const LAFEA_WORKBENCH_DOCUMENT_SCHEMA = 'lafea-workbench-document/v1';

export function normalizeLafeaStageDocument(stageId, input) {
  return normalizeLafeaComposedStageDocument(stageId, input);
}

export function normalizeLafeaStageEdit(stageId, input) {
  return normalizeLafeaComposedStageEdit(stageId, input);
}

export function lafeaStageExecutionSupported(stageId) {
  return lafeaRegisteredExecutionSupported(stageId);
}

export function executeLafeaStage(stageId, document) {
  return executeLafeaComposedStage(stageId, document);
}

export function lafeaCollectionPaths(stageId) {
  return lafeaRegisteredCollectionPaths(stageId);
}
