/**
 * LAFEA.1 load-transfer and pressure-baseline presenter.
 */
import {
  formulaId,
  presenterResult,
  presenterRow,
  requiredUnit,
} from './common.js';

export function presentLocalStress(result, units) {
  const force = requiredUnit(units, 'force');
  const moment = requiredUnit(units, 'moment');
  const stress = requiredUnit(units, 'stress');
  const rows = [];
  for (const [index, record] of (result.transformedLoadCases ?? []).entries()) {
    const prefix = `result.transformedLoadCases[${index}]`;
    record.transformedForceLocal.forEach((value, component) => {
      rows.push(presenterRow(
        `${record.identity} local force ${component}`,
        value,
        force,
        formulaId(record),
        `${prefix}.transformedForceLocal[${component}]`,
      ));
    });
    record.transformedMomentLocal.forEach((value, component) => {
      rows.push(presenterRow(
        `${record.identity} local moment ${component}`,
        value,
        moment,
        formulaId(record),
        `${prefix}.transformedMomentLocal[${component}]`,
      ));
    });
  }
  const pressureRows = [];
  for (const [index, record] of (result.pressureStressResults ?? []).entries()) {
    const prefix = `result.pressureStressResults[${index}]`;
    pressureRows.push(presenterRow(
      `${record.identity} axial pressure stress`,
      record.axialPressureStress,
      stress,
      formulaId(record),
      `${prefix}.axialPressureStress`,
    ));
    record.requestedPoints.forEach((point, pointIndex) => {
      pressureRows.push(
        presenterRow(
          `${record.identity} point ${pointIndex + 1} hoop stress`,
          point.hoopStress,
          stress,
          formulaId(record),
          `${prefix}.requestedPoints[${pointIndex}].hoopStress`,
        ),
        presenterRow(
          `${record.identity} point ${pointIndex + 1} radial stress`,
          point.radialStress,
          stress,
          formulaId(record),
          `${prefix}.requestedPoints[${pointIndex}].radialStress`,
        ),
      );
    });
  }
  return presenterResult(result, [
    { title: 'Transferred resultants', rows },
    { title: 'Lamé pressure stress', rows: pressureRows },
  ], null);
}
