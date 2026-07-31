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
  const stressRows = [];
  const dispRows = [];
  let maxStress = -Infinity;
  let maxLoc = '';
  let maxCase = '';

  for (const [caseIndex, loadCase] of (result.loadCaseResults ?? []).entries()) {
    const caseName = loadCase.loadCaseId || `Case #${caseIndex + 1}`;
    for (const [index, record] of (loadCase.elementResults ?? []).entries()) {
      if (record.recoveryLayer === INTEGRATION_POINT_LAYER && record.gaussPointResults) {
        record.gaussPointResults.forEach((point, pointIndex) => {
          if (point.vonMises > maxStress) {
            maxStress = point.vonMises;
            maxLoc = `Element ${record.elementId} (${point.pointId})`;
            maxCase = caseName;
          }
          stressRows.push(presenterRow(
            `${caseName} · Element ${record.elementId} · ${point.pointId} · Von Mises Equivalent Stress (σvm)`,
            point.vonMises,
            stress,
            formulaId(record),
            `Load Case ${caseName} · Element ${record.elementId} · ${point.pointId} · Von Mises Stress (σvm)`,
          ));
        });
      } else {
        if (record.vonMises > maxStress) {
          maxStress = record.vonMises;
          maxLoc = `Element ${record.elementId}`;
          maxCase = caseName;
        }
        stressRows.push(presenterRow(
          `${caseName} · Element ${record.elementId} · Von Mises Equivalent Stress (σvm)`,
          record.vonMises,
          stress,
          formulaId(record),
          `Load Case ${caseName} · Element ${record.elementId} · Von Mises Stress (σvm)`,
        ));
      }
    }

    for (const [index, record] of (loadCase.nodalDisplacements ?? []).entries()) {
      dispRows.push(
        presenterRow(
          `${caseName} · Node ${record.nodeId} · Radial / X-Direction Displacement (UX)`,
          record.ux,
          length,
          formulaId(loadCase),
          `Load Case ${caseName} · Node ${record.nodeId} · Radial Displacement UX`,
        ),
        presenterRow(
          `${caseName} · Node ${record.nodeId} · Axial / Y-Direction Displacement (UY)`,
          record.uy,
          length,
          formulaId(loadCase),
          `Load Case ${caseName} · Node ${record.nodeId} · Axial Displacement UY`,
        ),
      );
    }
  }

  const governing = maxStress > -Infinity
    ? {
      label: 'Governing 2D Continuum Gauss Point Von Mises Stress Intensity',
      value: maxStress,
      unit: stress,
      locationId: maxLoc,
      sourcePath: `Load Case ${maxCase} · ${maxLoc} · Von Mises Stress (σvm max)`,
    }
    : null;

  return presenterResult(result, [
    {
      title: '2D Pipe-Pad Continuum Element & Gauss Integration-Point Stress',
      rows: stressRows,
    },
    {
      title: '2D Continuum Node Deformation & Translational Displacements',
      rows: dispRows,
    },
  ], governing);
}

