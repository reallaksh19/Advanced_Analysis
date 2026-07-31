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
  const stressRows = [];
  const dispRows = [];
  let maxStress = -Infinity;
  let maxLoc = '';
  let maxCase = '';

  for (const [caseIndex, loadCase] of (result.loadCaseResults ?? []).entries()) {
    const caseName = loadCase.loadCaseId || `Case #${caseIndex + 1}`;
    for (const [elementIndex, element] of (loadCase.elementResults ?? []).entries()) {
      element.integrationPoints.forEach((point, pointIndex) => {
        point.surfaces.forEach((surface, surfaceIndex) => {
          if (surface.vonMises > maxStress) {
            maxStress = surface.vonMises;
            maxLoc = `Element ${element.elementId} (${point.integrationPointId}, ${surface.surface})`;
            maxCase = caseName;
          }
          stressRows.push(presenterRow(
            `${caseName} · Element ${element.elementId} · ${point.integrationPointId} · ${surface.surface} · Von Mises Equivalent Stress (σvm)`,
            surface.vonMises,
            stress,
            formulaId(surface),
            `Load Case ${caseName} · Element ${element.elementId} · ${point.integrationPointId} · ${surface.surface} · Von Mises Stress (σvm)`,
          ));
        });
      });
    }
    (loadCase.nodalDisplacements ?? []).forEach((record, index) => {
      dispRows.push(presenterRow(
        `${caseName} · Node ${record.nodeId} · Out-of-Plane Displacement UZ`,
        record.uz,
        length,
        formulaId(loadCase),
        `Load Case ${caseName} · Node ${record.nodeId} · Out-of-Plane Displacement UZ`,
      ));
    });
  }

  const governing = maxStress > -Infinity
    ? {
      label: 'Governing Thin-Shell Gauss Point Von Mises Stress Intensity',
      value: maxStress,
      unit: stress,
      locationId: maxLoc,
      sourcePath: `Load Case ${maxCase} · ${maxLoc} · Von Mises Stress (σvm max)`,
    }
    : null;

  return presenterResult(result, [
    {
      title: 'Thin-Shell Element & Gauss Integration-Point Surface Stress',
      rows: stressRows,
    },
    {
      title: 'Thin-Shell Node Out-of-Plane Displacements',
      rows: dispRows,
    }
  ], governing);
}
