/**
 * Single dispatch boundary for the five LAFEA presenter contracts.
 */
import { presentAttachmentScreening } from './attachment-screening.js';
import { presentLocalContinuum } from './local-continuum.js';
import { presentLocalShell } from './local-shell.js';
import { presentLocalStress } from './local-stress.js';
import { presentTrunnionFootprint } from './trunnion-footprint.js';

function presentWeldProfile(result, units) {
  const rows = (result?.stresses ?? []).map((s, idx) => ({
    label: `Element ${s.label ?? `Profile ${idx}`} · Fillet Weld Toe Shear Stress`,
    value: s.value ?? 0,
    unit: s.unit ?? units?.stress ?? 'MPa',
    formulaId: 'WELD-TOE-001',
    sourcePath: `Element ${s.label ?? `Profile ${idx}`} · Weld Toe Shear Stress`,
  }));
  if (result?.moments) {
    result.moments.forEach((m, idx) => rows.push({
      label: `Moment Reaction ${m.label ?? `Profile ${idx}`} · Eccentric Lever Arm Moment M=F*X`,
      value: m.value ?? 0,
      unit: m.unit ?? 'N-m',
      formulaId: 'MOMENT-ARM-X',
      sourcePath: `Moment Reaction ${m.label ?? `Profile ${idx}`} · Lever Arm Moment`,
    }));
  }
  return {
    governing: rows[0]
      ? {
        label: 'Governing Fillet Weld Throat Shear Stress',
        value: rows[0].value,
        unit: rows[0].unit,
        locationId: rows[0].label.split(' · ')[0],
        sourcePath: rows[0].sourcePath,
      }
      : null,
    sections: [{ title: 'Weld Profile & Eccentric Load Evidence', rows }],
    limitations: ['Weld throat shear analysis per ASME B-3.2 / WRC guidelines.'],
  };
}

const PRESENTERS = Object.freeze({
  'LAFEA.1': presentLocalStress,
  'LAFEA.2': presentAttachmentScreening,
  'LAFEA.3': presentLocalContinuum,
  'LAFEA.4': presentLocalShell,
  'LAFEA.5': presentTrunnionFootprint,
  'LAFEA.6': presentWeldProfile,
});

export function presentLafeaResult(stageId, result, units) {
  const presenter = PRESENTERS[stageId];
  if (!presenter) throw new TypeError(`No LAFEA presenter for ${stageId}.`);
  return presenter(result, units);
}

export function resolveLafeaUnits(stageId, documentValue) {
  const candidates = {
    'LAFEA.1': documentValue?.units,
    'LAFEA.2': documentValue?.sourceEvidence
      ?.foundationModel?.units?.canonical,
    'LAFEA.3': documentValue?.units,
    'LAFEA.4': documentValue?.units,
    'LAFEA.5': documentValue?.shellTemplate?.units,
    'LAFEA.6': documentValue?.units ?? { length: 'mm', force: 'N', moment: 'N-m', stress: 'MPa', rotation: 'deg' },
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
