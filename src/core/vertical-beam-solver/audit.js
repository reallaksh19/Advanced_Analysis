import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { AUDIT_CODES, QUALIFICATION, VERTICAL_BEAM_SOLVER_AUDIT_SCHEMA } from './constants.js';
import { uniqueSorted } from './diagnostics.js';
import { validateVerticalBeamSolution } from './solution.js';

export function createVerticalBeamSolverAudit(solution) {
  const validation = validateVerticalBeamSolution(solution);
  if (!validation.ok) throw new TypeError(`Invalid vertical-beam solution: ${validation.errors.join(' ')}`);
  const records = solution.pathCases.map(auditRecord).sort(recordOrder);
  const diagnostics = records.flatMap((row) => row.diagnostics);
  const base = {
    schema: VERTICAL_BEAM_SOLVER_AUDIT_SCHEMA, datasetId: solution.datasetId,
    solutionSemanticHash: solution.semanticHash, records, diagnostics,
    summary: {
      pathCaseCount: records.length,
      readyPathCaseCount: records.filter((row) => row.qualification === QUALIFICATION.READY).length,
      blockedPathCaseCount: records.filter((row) => row.qualification !== QUALIFICATION.READY).length,
      upliftOrDirectionReversalCount: records.filter((row) => row.diagnostics.some((item) => item.code === AUDIT_CODES.SUPPORT_UPLIFT_OR_DIRECTION_REVERSAL)).length,
      scope: 'SCALAR_LINEAR_ELASTIC_EULER_BERNOULLI_VERTICAL_PATH_ONLY',
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateVerticalBeamSolverAudit(value) {
  const errors = [];
  if (value?.schema !== VERTICAL_BEAM_SOLVER_AUDIT_SCHEMA) errors.push('Invalid vertical-beam solver audit schema.');
  if (!Array.isArray(value?.records)) errors.push('Vertical-beam solver audit records must be an array.');
  const keys = (value?.records || []).map((row) => `${row.pathId}|${row.loadCaseId}`);
  if (new Set(keys).size !== keys.length) errors.push('Vertical-beam solver audit records must be unique.');
  if (value?.summary?.scope !== 'SCALAR_LINEAR_ELASTIC_EULER_BERNOULLI_VERTICAL_PATH_ONLY') errors.push('Vertical-beam audit scope is invalid.');
  if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('Vertical-beam solver audit semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function auditRecord(row) {
  const diagnostics = row.diagnostics || [];
  const base = {
    pathId: row.pathId, loadCaseId: row.loadCaseId,
    qualification: row.qualification,
    nodeCount: row.nodeResults.length, elementCount: row.elementEndForces.length,
    supportCount: row.supportForceResults.length,
    freeDofCount: row.freeDofCount, constrainedDofCount: row.constrainedDofCount,
    appliedForceN: row.appliedForceTotalN, signedSupportForceN: row.supportForceTotalN,
    maximumAbsoluteDisplacementM: row.maximumAbsoluteDisplacementM,
    maximumAbsoluteRotationRad: row.maximumAbsoluteRotationRad,
    forceResidualN: row.forceEquilibrium?.residual ?? null,
    momentResidualNm: row.momentEquilibrium?.residual ?? null,
    matrixResidualNorm: row.matrixResidual?.residual ?? null,
    supportDisplacementResidualM: row.supportDisplacementResidual?.residual ?? null,
    blockers: uniqueSorted(row.blockers || []), diagnostics,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}
function recordOrder(a, b) { return `${a.pathId}|${a.loadCaseId}`.localeCompare(`${b.pathId}|${b.loadCaseId}`); }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
