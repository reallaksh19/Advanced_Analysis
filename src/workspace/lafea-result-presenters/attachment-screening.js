/**
 * LAFEA.2 nominal run-pipe section screening presenter.
 */
import {
  formulaId,
  presenterResult,
  presenterRow,
  requiredUnit,
} from './common.js';

export function presentAttachmentScreening(result, units) {
  const stress = requiredUnit(units, 'stress');
  const QUANTITY_ENGLISH = {
    vonMisesMaximum: 'Von Mises equivalent stress intensity (σvm max)',
    principalMaximum: 'Maximum principal normal stress (σ1 max)',
    principalMinimum: 'Minimum principal normal stress (σ3 min)',
    sigmaRMaximum: 'Radial normal stress maximum (σr max)',
    sigmaRMinimum: 'Radial normal stress minimum (σr min)',
    sigmaThetaMaximum: 'Hoop circumferential stress maximum (σθ max)',
    sigmaThetaMinimum: 'Hoop circumferential stress minimum (σθ min)',
    sigmaXMaximum: 'Axial longitudinal stress maximum (σx max)',
    sigmaXMinimum: 'Axial longitudinal stress minimum (σx min)',
    tauXThetaMaximum: 'Torsional shear stress maximum (τxθ max)',
    tauXThetaMinimum: 'Torsional shear stress minimum (τxθ min)',
  };
  const LOCATION_ENGLISH = {
    LMID: 'Mid-wall fiber',
    L0: 'Outer surface fiber',
    L1: 'Inner surface fiber',
  };
  const rows = (result.envelopes ?? []).map((record) => {
    const quantLabel = QUANTITY_ENGLISH[record.quantity] || record.quantity;
    const locLabel = LOCATION_ENGLISH[record.evaluationLocationId] || record.evaluationLocationId;
    return presenterRow(
      `${quantLabel} · Case ${record.screeningCaseId} (${locLabel})`,
      record.value,
      stress,
      formulaId(record),
      `Load Case ${record.screeningCaseId} · ${quantLabel}`,
    );
  });
  const formulaRows = (result.formulaTrace ?? []).map((fid, idx) =>
    presenterRow(
      `Eq #${idx + 1}: ${String(fid).replace(/_V\d+$/, '').replace(/_/g, ' ')}`,
      1.0,
      'ASME Basis',
      fid,
      `result.formulaTrace[${idx}]`,
    ));
  const governingRecord = (result.envelopes ?? [])
    .find((row) => row.quantity === 'vonMisesMaximum');
  const governing = governingRecord
    ? {
      label: 'Governing Von Mises equivalent stress intensity (ASME B31.3 Eq. 17)',
      value: governingRecord.value,
      unit: stress,
      locationId: governingRecord.evaluationLocationId,
      sourcePath: 'Load Case CASE-A · Von Mises equivalent stress intensity (σvm max)',
    }
    : null;
  return presenterResult(result, [
    {
      title: 'ASME B31.3 Pipe-Section Stress Envelopes & Principal Stress Invariants',
      rows,
    },
    {
      title: 'Governing ASME B31.3 Analytical Equations (Formula Trace)',
      rows: formulaRows,
    },
  ], governing);
}

