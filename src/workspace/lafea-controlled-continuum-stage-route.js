/**
 * Public controller-owned boundary for the bounded LAFEA.3 continuum pilot.
 *
 * Numerical dispatch remains inside the governed workbench composition root.
 * This facade exposes only stage normalization, stage execution and exact
 * retained-result hash reconstruction required by B7D orchestration.
 */
import {
  reconstructContinuumResultHashes,
} from '../core/local-continuum/index.js';
import {
  executeLafeaStage,
  normalizeLafeaStageDocument,
} from './lafea-workbench-model.js';

export const LAFEA_CONTROLLED_CONTINUUM_STAGE_ROUTE_SCHEMA =
  'lafea-controlled-continuum-stage-route/v1';
export const LAFEA_CONTROLLED_CONTINUUM_STAGE_ID = 'LAFEA.3';

export function normalizeControlledContinuumStageSource(input) {
  return normalizeLafeaStageDocument(LAFEA_CONTROLLED_CONTINUUM_STAGE_ID, input);
}

export function executeControlledContinuumStageRoute(documentValue) {
  return executeLafeaStage(
    LAFEA_CONTROLLED_CONTINUUM_STAGE_ID,
    documentValue,
  );
}

export function reconstructControlledContinuumResultHashes(resultValue) {
  return reconstructContinuumResultHashes(resultValue);
}
