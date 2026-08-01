/** Single presentation boundary resolved by the governed composition root. */
import { requireLafeaStageComposition } from '../lafea-stage-composition-root.js';

export function presentLafeaResult(stageId, result, units) {
  const composition = requireLafeaStageComposition(stageId);
  if (!composition.presentResult) throw unsupportedStagePresenterError(composition);
  return composition.presentResult(result, units);
}

export function resolveLafeaUnits(stageId, documentValue) {
  const composition = requireLafeaStageComposition(stageId);
  if (!composition.resolveUnits) throw unsupportedStagePresenterError(composition);
  return composition.resolveUnits(documentValue);
}

function unsupportedStagePresenterError(composition) {
  const error = new TypeError(`${composition.stageId} has no qualified result presenter.`);
  error.code = 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED';
  return error;
}
