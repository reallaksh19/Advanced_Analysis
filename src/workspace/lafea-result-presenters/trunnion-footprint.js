/**
 * LAFEA.5 limited trunnion-footprint adapter presenter.
 *
 * The current core reports retained raw shell surface stress by declared
 * assessment region. It does not produce weld, SCL, convergence or code stress.
 */
import {
  presenterResult,
  presenterRow,
  requiredUnit,
} from './common.js';

export function presentTrunnionFootprint(result, units) {
  const stress = requiredUnit(units, 'stress');
  const rows = [];
  let maximumStress = -Infinity;
  let maximumLocation = '';
  let maximumPath = null;

  for (const [regionIndex, region] of (result.assessmentRegionResults ?? []).entries()) {
    const caseLabel = region.loadCaseId || `Case ${regionIndex + 1}`;
    for (const [recordIndex, record] of (region.records ?? []).entries()) {
      const sourcePath = `result.assessmentRegionResults[${regionIndex}].records[${recordIndex}].vonMises`;
      if (record.vonMises > maximumStress) {
        maximumStress = record.vonMises;
        maximumLocation = `Region ${region.regionId} · Element ${record.elementId} (${record.integrationPointId}, ${record.surface})`;
        maximumPath = sourcePath;
      }
      rows.push(presenterRow(
        `${caseLabel} · Region ${region.regionId} · Element ${record.elementId} · ${record.integrationPointId} · ${record.surface} · raw von Mises equivalent stress`,
        record.vonMises,
        stress,
        null,
        sourcePath,
      ));
    }
  }

  const governing = maximumPath
    ? {
      label: 'Maximum retained raw assessment-region surface stress',
      value: maximumStress,
      unit: stress,
      locationId: maximumLocation,
      sourcePath: maximumPath,
    }
    : null;

  return presenterResult(result, [{
    title: 'Limited footprint-adapter raw shell surface stress evidence',
    rows,
  }], governing);
}
