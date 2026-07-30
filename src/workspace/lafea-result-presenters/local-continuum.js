/**
 * LAFEA.3 continuum presenter.
 *
 * Dispatches on the recovery layer each element result actually carries
 * (spec §12.1), because the default T6/Q8 elements deliberately expose no
 * single element-constant stress — claiming one would misrepresent a
 * quadratic strain field as constant. T3 keeps its existing element-constant
 * row verbatim (same label, same sourcePath); T6/Q8 expose one row per
 * integration point, the authoritative layer.
 *
 * Nodal-projected values are NOT surfaced here: they are
 * `NON_AUTHORITATIVE_DISPLAY_PROJECTION` (see
 * `local-continuum/nodal-projection-display.js`) and the repo invariant is
 * that raw and projected stress never share authority — mixing them into one
 * table is exactly the blur that invariant forbids.
 */
import {
  formulaId,
  presenterResult,
  presenterRow,
  requiredUnit,
} from './common.js';

const INTEGRATION_POINT_LAYER = 'INTEGRATION_POINT';

export function presentLocalContinuum(result, units) {
  const stress = requiredUnit(units, 'stress');
  const length = requiredUnit(units, 'length');
  const rows = [];
  for (const [caseIndex, loadCase] of (result.loadCaseResults ?? []).entries()) {
    for (const [index, record] of loadCase.elementResults.entries()) {
      rows.push(...elementStressRows(record, loadCase, caseIndex, index, stress));
    }
    for (const [index, record] of loadCase.nodalDisplacements.entries()) {
      rows.push(
        presenterRow(
          `${loadCase.loadCaseId} ${record.nodeId} UX`,
          record.ux,
          length,
          formulaId(loadCase),
          `result.loadCaseResults[${caseIndex}].nodalDisplacements[${index}].ux`,
        ),
        presenterRow(
          `${loadCase.loadCaseId} ${record.nodeId} UY`,
          record.uy,
          length,
          formulaId(loadCase),
          `result.loadCaseResults[${caseIndex}].nodalDisplacements[${index}].uy`,
        ),
      );
    }
  }
  return presenterResult(result, [{
    title: 'Authoritative raw element/integration-point stress and nodal displacement',
    rows,
  }], null);
}

function elementStressRows(record, loadCase, caseIndex, index, stress) {
  const base = `result.loadCaseResults[${caseIndex}].elementResults[${index}]`;
  if (record.recoveryLayer === INTEGRATION_POINT_LAYER) {
    return record.gaussPointResults.map((point, pointIndex) => presenterRow(
      `${loadCase.loadCaseId} ${record.elementId} ${point.pointId} von Mises`,
      point.vonMises,
      stress,
      formulaId(record),
      `${base}.gaussPointResults[${pointIndex}].vonMises`,
    ));
  }
  return [presenterRow(
    `${loadCase.loadCaseId} ${record.elementId} von Mises`,
    record.vonMises,
    stress,
    formulaId(record),
    `${base}.vonMises`,
  )];
}
