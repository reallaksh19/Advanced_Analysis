/**
 * LAFEA.5 trunnion footprint presenter.
 */
import {
  presenterResult,
  presenterRow,
  requiredUnit,
} from './common.js';

export function presentTrunnionFootprint(result, units) {
  const stress = requiredUnit(units, 'stress');
  const rows = [];
  let maxStress = -Infinity;
  let maxLoc = '';
  let maxCase = '';

  for (const [regionIndex, region] of (result.assessmentRegionResults ?? []).entries()) {
    const caseName = region.loadCaseId || `Case #${regionIndex + 1}`;
    for (const [recordIndex, record] of region.records.entries()) {
      if (record.vonMises > maxStress) {
        maxStress = record.vonMises;
        maxLoc = `Region ${region.regionId} · Element ${record.elementId} (${record.integrationPointId}, ${record.surface})`;
        maxCase = caseName;
      }
      rows.push(presenterRow(
        `${caseName} · Region ${region.regionId} · Element ${record.elementId} · ${record.integrationPointId} · ${record.surface} · Von Mises Equivalent Stress (σvm)`,
        record.vonMises,
        stress,
        null,
        `Load Case ${caseName} · Region ${region.regionId} · Element ${record.elementId} · ${record.integrationPointId} · ${record.surface} · Von Mises Stress (σvm)`,
      ));
    }
  }

  const governing = maxStress > -Infinity
    ? {
      label: 'Governing Trunnion Footprint Local Surface Stress Intensity',
      value: maxStress,
      unit: stress,
      locationId: maxLoc,
      sourcePath: `Load Case ${maxCase} · ${maxLoc} · Von Mises Stress (σvm max)`,
    }
    : null;

  return presenterResult(result, [{
    title: 'Trunnion Footprint & Assessment Region Local Surface Stress',
    rows,
  }], governing);
}
