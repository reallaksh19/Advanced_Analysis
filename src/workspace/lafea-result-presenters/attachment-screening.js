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
  const rows = (result.envelopes ?? []).map((record, index) =>
    presenterRow(
      `${record.quantity} — ${record.screeningCaseId} at ${record.evaluationLocationId}`,
      record.value,
      stress,
      formulaId(record),
      `result.envelopes[${index}].value`,
    ));
  const governingRecord = (result.envelopes ?? [])
    .find((row) => row.quantity === 'vonMisesMaximum');
  const governing = governingRecord
    ? {
      label: 'Nominal run-pipe von Mises screening maximum',
      value: governingRecord.value,
      unit: stress,
      locationId: governingRecord.evaluationLocationId,
      sourcePath: 'result.envelopes[vonMisesMaximum].value',
    }
    : null;
  return presenterResult(result, [{
    title: 'Nominal run-pipe section envelopes — not local attachment stress',
    rows,
  }], governing);
}
