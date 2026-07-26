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
  for (const [regionIndex, region] of
    (result.assessmentRegionResults ?? []).entries()) {
    for (const [recordIndex, record] of region.records.entries()) {
      rows.push(presenterRow(
        `${region.loadCaseId} ${region.regionId} ${record.elementId} `
          + `${record.integrationPointId} ${record.surface}`,
        record.vonMises,
        stress,
        null,
        `result.assessmentRegionResults[${regionIndex}]`
          + `.records[${recordIndex}].vonMises`,
      ));
    }
  }
  return presenterResult(result, [{
    title: 'Raw shell footprint stress by assessment region',
    rows,
  }], null);
}
