/**
 * Single dispatch boundary for retained LAFEA presenter contracts.
 *
 * LAFEA.6 has no qualified result contract or presenter. The stage remains a
 * visible non-calculating placeholder and fails closed at this boundary too.
 */
import { presentAttachmentScreening } from './attachment-screening.js';
import { presentLocalContinuum } from './local-continuum.js';
import { presentLocalShell } from './local-shell.js';
import { presentLocalStress } from './local-stress.js';
import { presentTrunnionFootprint } from './trunnion-footprint.js';

const PRESENTERS = Object.freeze({
  'LAFEA.1': presentLocalStress,
  'LAFEA.2': presentAttachmentScreening,
  'LAFEA.3': presentLocalContinuum,
  'LAFEA.4': presentLocalShell,
  'LAFEA.5': presentTrunnionFootprint,
});

export function presentLafeaResult(stageId, result, units) {
  if (stageId === 'LAFEA.6') throw unsupportedWeldPresenterError();
  const presenter = PRESENTERS[stageId];
  if (!presenter) throw new TypeError(`No LAFEA presenter for ${stageId}.`);
  return presenter(result, units);
}

export function resolveLafeaUnits(stageId, documentValue) {
  if (stageId === 'LAFEA.6') throw unsupportedWeldPresenterError();
  const candidates = {
    'LAFEA.1': documentValue?.units,
    'LAFEA.2': documentValue?.sourceEvidence
      ?.foundationModel?.units?.canonical,
    'LAFEA.3': documentValue?.units,
    'LAFEA.4': documentValue?.units,
    'LAFEA.5': documentValue?.shellTemplate?.units,
  };
  const units = candidates[stageId];
  if (!units || typeof units !== 'object') {
    throw new TypeError(`${stageId} source document has no explicit units.`);
  }
  return Object.freeze({
    length: units.length,
    force: units.force,
    moment: units.moment,
    stress: units.stress ?? units.pressure ?? units.modulus,
    rotation: units.rotation,
  });
}

function unsupportedWeldPresenterError() {
  const error = new TypeError('LAFEA.6 has no qualified result presenter.');
  error.code = 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED';
  return error;
}
