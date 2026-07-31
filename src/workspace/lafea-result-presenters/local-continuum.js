/**
 * LAFEA.3 continuum presenter.
 *
 * Integration-point stress is authoritative for T6/Q8. T3 retains its
 * element-constant recovery. Nodal projection is display-only and is not
 * surfaced as retained engineering stress evidence.
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
  const stressRows = [];
  const displacementRows = [];
  let maximumStress = -Infinity;
  let maximumLocation = '';
  let maximumPath = null;

  for (const [caseIndex, loadCase] of (result.loadCaseResults ?? []).entries()) {
    const caseLabel = loadCase.loadCaseId || `Case ${caseIndex + 1}`;
    for (const [elementIndex, record] of (loadCase.elementResults ?? []).entries()) {
      const elementPrefix = `result.loadCaseResults[${caseIndex}].elementResults[${elementIndex}]`;
      if (record.recoveryLayer === INTEGRATION_POINT_LAYER && Array.isArray(record.gaussPointResults)) {
        record.gaussPointResults.forEach((point, pointIndex) => {
          const sourcePath = `${elementPrefix}.gaussPointResults[${pointIndex}].vonMises`;
          if (point.vonMises > maximumStress) {
            maximumStress = point.vonMises;
            maximumLocation = `Element ${record.elementId} (${point.pointId})`;
            maximumPath = sourcePath;
          }
          stressRows.push(presenterRow(
            `${caseLabel} · Element ${record.elementId} · ${point.pointId} · von Mises equivalent stress`,
            point.vonMises,
            stress,
            formulaId(record),
            sourcePath,
          ));
        });
      } else {
        const sourcePath = `${elementPrefix}.vonMises`;
        if (record.vonMises > maximumStress) {
          maximumStress = record.vonMises;
          maximumLocation = `Element ${record.elementId}`;
          maximumPath = sourcePath;
        }
        stressRows.push(presenterRow(
          `${caseLabel} · Element ${record.elementId} · von Mises equivalent stress`,
          record.vonMises,
          stress,
          formulaId(record),
          sourcePath,
        ));
      }
    }

    for (const [nodeIndex, record] of (loadCase.nodalDisplacements ?? []).entries()) {
      const nodePrefix = `result.loadCaseResults[${caseIndex}].nodalDisplacements[${nodeIndex}]`;
      displacementRows.push(
        presenterRow(
          `${caseLabel} · Node ${record.nodeId} · UX`,
          record.ux,
          length,
          formulaId(loadCase),
          `${nodePrefix}.ux`,
        ),
        presenterRow(
          `${caseLabel} · Node ${record.nodeId} · UY`,
          record.uy,
          length,
          formulaId(loadCase),
          `${nodePrefix}.uy`,
        ),
      );
    }
  }

  const governing = maximumPath
    ? {
      label: 'Governing retained continuum von Mises equivalent stress',
      value: maximumStress,
      unit: stress,
      locationId: maximumLocation,
      sourcePath: maximumPath,
    }
    : null;

  return presenterResult(result, [
    {
      title: 'Continuum retained stress evidence',
      rows: stressRows,
    },
    {
      title: 'Continuum retained nodal displacement evidence',
      rows: displacementRows,
    },
  ], governing);
}
