import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { SCREENING_AUDIT_SCHEMA, QUALIFICATION } from './constants.js';

export function createSupportLoadScreeningAudit(screening) {
  const records = screening.pathCases.map((row) => auditRecord(row)).sort(recordOrder);
  const diagnostics = records.flatMap((row) => row.diagnostics);
  const base = {
    schema: SCREENING_AUDIT_SCHEMA,
    datasetId: screening.datasetId,
    screeningSemanticHash: screening.semanticHash,
    records,
    diagnostics,
    summary: {
      recordCount: records.length,
      readyRecordCount: records.filter((row) => row.qualification === QUALIFICATION.READY).length,
      blockedRecordCount: records.filter((row) => row.qualification !== QUALIFICATION.READY).length,
      spanCount: records.reduce((sum, row) => sum + row.spanCount, 0),
      contributionCount: records.reduce((sum, row) => sum + row.contributionCount, 0),
      appliedForceN: records.reduce((sum, row) => sum + row.appliedForceN, 0),
      screenedSupportForceN: records.reduce((sum, row) => sum + row.screenedSupportForceN, 0),
      scope: 'SIMPLE_CHAIN_TRIBUTARY_VERTICAL_SCREENING_ONLY',
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateSupportLoadScreeningAudit(audit) {
  const errors = [];
  if (audit?.schema !== SCREENING_AUDIT_SCHEMA) errors.push('Invalid support-load screening audit schema.');
  if (audit?.summary?.scope !== 'SIMPLE_CHAIN_TRIBUTARY_VERTICAL_SCREENING_ONLY') errors.push('Screening audit scope is invalid.');
  if (audit?.semanticHash !== semanticHash(withoutHash(audit))) errors.push('Screening-audit semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function auditRecord(row) {
  const equilibrium = row.equilibrium;
  return deepFreeze({
    pathId: row.pathId,
    loadCaseId: row.loadCaseId,
    qualification: row.qualification,
    qualifiedSupportIds: row.qualifiedSupportIds,
    blockedSupportIds: row.blockedSupportIds,
    eligiblePrimitiveIds: row.eligiblePrimitiveIds,
    blockedPrimitiveIds: row.blockedPrimitiveIds,
    spanCount: row.spans.length,
    contributionCount: row.contributionCount ?? 0,
    appliedForceN: equilibrium?.appliedForceN || 0,
    screenedSupportForceN: equilibrium?.screenedSupportForceN || 0,
    equilibriumResidualN: equilibrium?.residualForceN || 0,
    relativeResidual: equilibrium?.relativeResidual || 0,
    equilibriumPass: equilibrium?.pass ?? false,
    blockers: row.blockers,
    diagnostics: row.diagnostics || [],
  });
}
function recordOrder(a, b) { return `${a.pathId}|${a.loadCaseId}`.localeCompare(`${b.pathId}|${b.loadCaseId}`); }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
