/**
 * LAFEA.3 CST continuum presenter.
 */
import {
  formulaId,
  presenterResult,
  presenterRow,
  requiredUnit,
} from './common.js';

export function presentLocalContinuum(result, units) {
  const stress = requiredUnit(units, 'stress');
  const length = requiredUnit(units, 'length');
  const rows = [];
  for (const [caseIndex, loadCase] of (result.loadCaseResults ?? []).entries()) {
    for (const [index, record] of loadCase.elementResults.entries()) {
      rows.push(presenterRow(
        `${loadCase.loadCaseId} ${record.elementId} von Mises`,
        record.vonMises,
        stress,
        formulaId(record),
        `result.loadCaseResults[${caseIndex}].elementResults[${index}].vonMises`,
      ));
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
    title: 'Raw CST element stress and nodal displacement',
    rows,
  }], null);
}
