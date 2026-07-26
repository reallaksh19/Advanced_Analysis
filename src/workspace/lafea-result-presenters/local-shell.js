/**
 * LAFEA.4 thin-shell CST+DKT presenter.
 */
import {
  formulaId,
  presenterResult,
  presenterRow,
  requiredUnit,
} from './common.js';

export function presentLocalShell(result, units) {
  const stress = requiredUnit(units, 'stress');
  const length = requiredUnit(units, 'length');
  const rows = [];
  for (const [caseIndex, loadCase] of (result.loadCaseResults ?? []).entries()) {
    for (const [elementIndex, element] of loadCase.elementResults.entries()) {
      element.integrationPoints.forEach((point, pointIndex) => {
        point.surfaces.forEach((surface, surfaceIndex) => {
          rows.push(presenterRow(
            `${loadCase.loadCaseId} ${element.elementId} `
              + `${point.integrationPointId} ${surface.surface} von Mises`,
            surface.vonMises,
            stress,
            formulaId(surface),
            `result.loadCaseResults[${caseIndex}].elementResults`
              + `[${elementIndex}].integrationPoints[${pointIndex}]`
              + `.surfaces[${surfaceIndex}].vonMises`,
          ));
        });
      });
    }
    loadCase.nodalDisplacements.forEach((record, index) => {
      rows.push(presenterRow(
        `${loadCase.loadCaseId} ${record.nodeId} UZ`,
        record.uz,
        length,
        formulaId(loadCase),
        `result.loadCaseResults[${caseIndex}].nodalDisplacements[${index}].uz`,
      ));
    });
  }
  return presenterResult(result, [{
    title: 'Raw integration-point surface stress — thin-shell only',
    rows,
  }], null);
}
