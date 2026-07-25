import { deepFreeze } from '../shared-piping-model/index.js';
import { normalizeDiagnostics, uniqueSorted } from './diagnostics.js';

export function buildQualificationSummary(screening, beam) {
  const screeningRows = new Map((screening?.audit.records || []).map((row) => [keyOf(row), row]));
  const beamRows = new Map((beam?.solution.pathCases || []).map((row) => [keyOf(row), row]));
  const keys = uniqueSorted([...screeningRows.keys(), ...beamRows.keys()]);
  return deepFreeze(keys.map((key) => summaryRow(screeningRows.get(key), beamRows.get(key))));
}

function summaryRow(screening, beam) {
  const pathId = screening?.pathId || beam?.pathId;
  const loadCaseId = screening?.loadCaseId || beam?.loadCaseId;
  const diagnostics = normalizeDiagnostics([
    ...(screening?.diagnostics || []).map((row) => ({ ...row, method: 'TRIBUTARY_SCREENING' })),
    ...(beam?.diagnostics || []).map((row) => ({ ...row, method: 'VERTICAL_BEAM' })),
  ]);
  return deepFreeze({
    pathId, loadCaseId,
    screeningQualification: screening?.qualification || null,
    beamQualification: beam?.qualification || null,
    screenedAppliedForceN: screening?.appliedForceN ?? null,
    screenedSupportForceN: screening?.screenedSupportForceN ?? null,
    beamAppliedForceN: beam?.appliedForceTotalN ?? null,
    beamSignedSupportForceN: beam?.supportForceTotalN ?? null,
    maximumAbsoluteDisplacementM: beam?.maximumAbsoluteDisplacementM ?? null,
    maximumAbsoluteRotationRad: beam?.maximumAbsoluteRotationRad ?? null,
    forceResidualN: beam?.forceEquilibrium?.residual ?? screening?.equilibriumResidualN ?? null,
    momentResidualNm: beam?.momentEquilibrium?.residual ?? null,
    matrixResidualN: beam?.matrixResidual?.residual ?? null,
    blockers: uniqueSorted([...(screening?.blockers || []), ...(beam?.blockers || [])]),
    diagnostics,
  });
}
function keyOf(row) { return `${row.pathId}|${row.loadCaseId}`; }
