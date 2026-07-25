import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { MODEL_LOAD_READINESS_AUDIT_SCHEMA, PRIMITIVE_TYPES } from './constants.js';

export function createModelLoadReadinessAudit(loadCaseSet, primitiveSet) {
  const cases = loadCaseSet.loadCases.map((loadCase) => caseAudit(loadCase, primitiveSet))
    .sort((left, right) => left.loadCaseId.localeCompare(right.loadCaseId));
  const diagnostics = cases.flatMap((row) => row.diagnostics);
  const base = {
    schema: MODEL_LOAD_READINESS_AUDIT_SCHEMA,
    datasetId: primitiveSet.datasetId,
    loadCaseSetSemanticHash: loadCaseSet.semanticHash,
    primitiveSetSemanticHash: primitiveSet.semanticHash,
    cases,
    diagnostics,
    summary: {
      caseCount: cases.length,
      readyCaseCount: cases.filter((row) => row.qualification === 'READY').length,
      blockedCaseCount: cases.filter((row) => row.qualification !== 'READY').length,
      diagnosticCount: diagnostics.length,
      scope: 'COMPONENT_LOADS_ONLY',
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateModelLoadReadinessAudit(value) {
  const errors = [];
  if (value?.schema !== MODEL_LOAD_READINESS_AUDIT_SCHEMA) errors.push('Invalid model-load readiness-audit schema.');
  if (!Array.isArray(value?.cases)) errors.push('Readiness cases must be an array.');
  if (value?.summary?.scope !== 'COMPONENT_LOADS_ONLY') errors.push('Readiness scope must remain component loads only.');
  if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('Readiness-audit semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function caseAudit(loadCase, primitiveSet) {
  const outcomes = primitiveSet.componentOutcomes.filter((row) => row.loadCaseId === loadCase.loadCaseId);
  const primitives = primitiveSet.primitives.filter((row) => row.loadCaseId === loadCase.loadCaseId);
  const readyComponentIds = outcomes.filter((row) => row.ready).map((row) => row.componentKey).sort();
  const blockedComponentIds = outcomes.filter((row) => !row.ready).map((row) => row.componentKey).sort();
  const blockers = [...new Set(outcomes.flatMap((row) => row.blockers))].sort();
  const totals = primitiveTotals(primitives);
  return deepFreeze({
    loadCaseId: loadCase.loadCaseId,
    qualification: blockedComponentIds.length ? 'BLOCKED' : 'READY',
    readyComponentIds,
    blockedComponentIds,
    distributedPrimitiveCount: primitives.filter((row) => row.primitiveType === PRIMITIVE_TYPES.DISTRIBUTED).length,
    pointPrimitiveCount: primitives.filter((row) => row.primitiveType === PRIMITIVE_TYPES.POINT).length,
    explicitMomentCount: primitives.filter((row) => row.primitiveType === PRIMITIVE_TYPES.MOMENT).length,
    totalMassKg: totals.massKg,
    totalForceN: totals.forceN,
    blockers,
    diagnostics: outcomes.flatMap((row) => row.diagnostics).map((row) => ({ ...row, loadCaseId: loadCase.loadCaseId })),
  });
}

function primitiveTotals(primitives) {
  return primitives.reduce((totals, primitive) => {
    if (primitive.primitiveType === PRIMITIVE_TYPES.DISTRIBUTED) {
      totals.massKg += primitive.massPerLengthKgM * primitive.sourceLengthM;
      totals.forceN += primitive.forcePerLengthNM * primitive.sourceLengthM;
    }
    if (primitive.primitiveType === PRIMITIVE_TYPES.POINT) {
      totals.massKg += primitive.pointMassKg;
      totals.forceN += primitive.pointForceN;
    }
    return totals;
  }, { massKg: 0, forceN: 0 });
}

function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
