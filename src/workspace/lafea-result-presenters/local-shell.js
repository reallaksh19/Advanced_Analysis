/**
 * LAFEA.4 legacy five-DOF triangular CST+DKT shell presenter.
 *
 * The presenter reports only retained integration-point surface stress and
 * nodal displacement fields from the currently dispatched legacy core.
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
  const displacementRows = [];
  let maximumStress = -Infinity;
  let maximumLocation = '';
  let maximumPath = null;

  for (const [caseIndex, loadCase] of (result.loadCaseResults ?? []).entries()) {
    const caseLabel = loadCase.loadCaseId || `Case ${caseIndex + 1}`;
    for (const [elementIndex, element] of (loadCase.elementResults ?? []).entries()) {
      for (const [pointIndex, point] of (element.integrationPoints ?? []).entries()) {
        for (const [surfaceIndex, surface] of (point.surfaces ?? []).entries()) {
          const sourcePath = `result.loadCaseResults[${caseIndex}].elementResults[${elementIndex}]`
            + `.integrationPoints[${pointIndex}].surfaces[${surfaceIndex}].vonMises`;
          if (surface.vonMises > maximumStress) {
            maximumStress = surface.vonMises;
            maximumLocation = `Element ${element.elementId} (${point.integrationPointId}, ${surface.surface})`;
            maximumPath = sourcePath;
          }
          stressRows.push(presenterRow(
            `${caseLabel} · Element ${element.elementId} · ${point.integrationPointId} · ${surface.surface} · von Mises equivalent stress`,
            surface.vonMises,
            stress,
            formulaId(surface),
            sourcePath,
          ));
        }
      }
    }

    for (const [nodeIndex, record] of (loadCase.nodalDisplacements ?? []).entries()) {
      displacementRows.push(presenterRow(
        `${caseLabel} · Node ${record.nodeId} · UZ`,
        record.uz,
        length,
        formulaId(loadCase),
        `result.loadCaseResults[${caseIndex}].nodalDisplacements[${nodeIndex}].uz`,
      ));
    }
  }

  const governing = maximumPath
    ? {
      label: 'Governing retained legacy shell von Mises equivalent stress',
      value: maximumStress,
      unit: stress,
      locationId: maximumLocation,
      sourcePath: maximumPath,
    }
    : null;

  return presenterResult(result, [
    {
      title: 'Legacy CST+DKT integration-point surface stress evidence',
      rows: stressRows,
    },
    {
      title: 'Legacy CST+DKT nodal displacement evidence',
      rows: displacementRows,
    },
  ], governing);
}
