import { semanticHash, codeUnitCompare } from './json.js';
import { qualification } from './numeric.js';

export function assessmentRegionEvidence(regions, shellResult, profile) {
  const caseMap = new Map(shellResult.loadCaseResults.map((row) => [row.loadCaseId, row]));
  return shellResult.loadCaseResults.flatMap((loadCase) => regions.map((region) => assessRegion(loadCase, caseMap.get(loadCase.loadCaseId), region, profile)));
}

function assessRegion(loadCase, retainedCase, region, profile) {
  const selected = new Set(region.elementIds);
  const records = retainedCase.elementResults.filter((element) => selected.has(element.elementId)).flatMap((element) => rawRecords(loadCase.loadCaseId, region, element));
  const governing = selectGoverning(records);
  const reconstructed = selectGoverning([...records].reverse());
  const residual = governing && reconstructed ? Math.abs(governing.vonMises - reconstructed.vonMises) : 0;
  const envelopeQualification = qualification(residual, governing?.vonMises ?? 1, profile.assessmentEnvelope);
  const body = {
    loadCaseId: loadCase.loadCaseId,
    regionId: region.regionId,
    classification: region.classification,
    sourceReference: region.sourceReference,
    loadIntroductionSensitive: region.classification === 'FOOTPRINT_ADJACENT',
    authority: 'RAW_LAFEA4_ELEMENT_INTEGRATION_POINT_SURFACE_STRESS',
    records,
    governingRecord: governing,
    envelopeQualification,
  };
  return { ...body, semanticHash: semanticHash(body) };
}
function rawRecords(loadCaseId, region, element) {
  return element.integrationPoints.flatMap((point) => point.surfaces.map((surface) => ({
    loadCaseId,
    regionId: region.regionId,
    classification: region.classification,
    elementId: element.elementId,
    integrationPointId: point.integrationPointId,
    surface: surface.surface,
    membraneStress: surface.membraneStress,
    bendingStress: surface.bendingStress,
    combinedStress: surface.combinedStress,
    principalMaximum: surface.principalMaximum,
    principalMinimum: surface.principalMinimum,
    maximumInPlaneShear: surface.maximumInPlaneShear,
    vonMises: surface.vonMises,
  })));
}
function selectGoverning(records) {
  if (records.length === 0) return null;
  return [...records].sort((left, right) => {
    if (right.vonMises !== left.vonMises) return right.vonMises - left.vonMises;
    return codeUnitCompare(recordKey(left), recordKey(right));
  })[0];
}
function recordKey(row) { return [row.loadCaseId, row.regionId, row.elementId, row.integrationPointId, row.surface].join('\u0000'); }