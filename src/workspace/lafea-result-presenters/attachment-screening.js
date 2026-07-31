/**
 * LAFEA.2 nominal far-field pipe-section screening presenter.
 *
 * This presenter does not convert screening arithmetic into a code-assessment
 * result, local attachment stress, shell stress or weld stress. Formula-trace
 * identities remain available in the retained raw evidence; they are not
 * represented as fabricated numeric rows.
 */
import {
  formulaId,
  presenterResult,
  presenterRow,
  requiredUnit,
} from './common.js';

export function presentAttachmentScreening(result, units) {
  const stress = requiredUnit(units, 'stress');
  const quantityLabels = {
    vonMisesMaximum: 'Von Mises equivalent stress maximum',
    principalMaximum: 'Maximum principal normal stress',
    principalMinimum: 'Minimum principal normal stress',
    sigmaRMaximum: 'Radial normal stress maximum',
    sigmaRMinimum: 'Radial normal stress minimum',
    sigmaThetaMaximum: 'Circumferential stress maximum',
    sigmaThetaMinimum: 'Circumferential stress minimum',
    sigmaXMaximum: 'Axial stress maximum',
    sigmaXMinimum: 'Axial stress minimum',
    tauXThetaMaximum: 'Torsional shear stress maximum',
    tauXThetaMinimum: 'Torsional shear stress minimum',
  };
  const locationLabels = {
    LMID: 'mid-wall location',
    L0: 'outer-surface location',
    L1: 'inner-surface location',
  };

  const rows = (result.envelopes ?? []).map((record, index) => {
    const quantity = quantityLabels[record.quantity] || String(record.quantity);
    const location = locationLabels[record.evaluationLocationId]
      || String(record.evaluationLocationId);
    return presenterRow(
      `${quantity} · case ${record.screeningCaseId} (${location})`,
      record.value,
      stress,
      formulaId(record),
      `result.envelopes[${index}].value`,
    );
  });

  const governingIndex = (result.envelopes ?? [])
    .findIndex((row) => row.quantity === 'vonMisesMaximum');
  const governingRecord = governingIndex >= 0 ? result.envelopes[governingIndex] : null;
  const governing = governingRecord
    ? {
      label: 'Governing nominal von Mises equivalent stress',
      value: governingRecord.value,
      unit: stress,
      locationId: governingRecord.evaluationLocationId,
      sourcePath: `result.envelopes[${governingIndex}].value`,
    }
    : null;

  return presenterResult(result, [
    {
      title: 'Nominal pipe-section stress envelopes and tensor invariants',
      rows,
    },
  ], governing);
}
