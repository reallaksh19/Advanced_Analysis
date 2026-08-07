import {
  validateLoadCaseSet,
  validateModelLoadPrimitiveSet,
  validateModelLoadReadinessAudit,
} from '../model-loads/index.js';
import { deepFreeze } from '../shared-piping-model/index.js';

/**
 * Neutral W10.4 bookkeeping kernel shared by common Non-FEA preprocessing and
 * the historical First Cut compatibility wrapper. It owns no product schema.
 */
export function compileNonFeaMassLedgerBody(modelLoadFoundation) {
  const foundation = validateNonFeaMassFoundation(modelLoadFoundation);
  const gravity = foundation.gravityProfile.accelerationMPerS2;
  const rows = foundation.loadPrimitiveSet.primitives
    .filter((primitive) => primitive.primitiveType !== 'EXPLICIT_POINT_MOMENT')
    .flatMap((primitive) => ledgerRows(primitive, gravity))
    .sort((left, right) => left.ledgerRowId.localeCompare(right.ledgerRowId));
  const cases = foundation.loadCaseSet.loadCases.map((loadCase) => (
    summarizeCase(loadCase.loadCaseId, rows, foundation.readinessAudit)
  )).sort((left, right) => left.loadCaseId.localeCompare(right.loadCaseId));
  return deepFreeze({
    datasetId: foundation.loadPrimitiveSet.datasetId,
    loadPrimitiveSemanticHash: foundation.loadPrimitiveSet.semanticHash,
    loadCaseSetSemanticHash: foundation.loadCaseSet.semanticHash,
    rows,
    cases,
  });
}

export function validateNonFeaMassFoundation(value) {
  const checks = [
    validateLoadCaseSet(value?.loadCaseSet),
    validateModelLoadPrimitiveSet(value?.loadPrimitiveSet),
    validateModelLoadReadinessAudit(value?.readinessAudit),
  ];
  const errors = checks.flatMap((row) => row.errors);
  if (errors.length) throw new TypeError(`Invalid W10.4 foundation: ${errors.join(' ')}`);
  if (!(value?.gravityProfile?.accelerationMPerS2 > 0)) throw new TypeError('W10.4 gravity is invalid.');
  return value;
}

function ledgerRows(primitive, gravity) {
  if (primitive.primitiveType === 'POINT_GRAVITY_LOAD') {
    return [pointRow(primitive, gravity)];
  }
  const positionM = midpoint(primitive.startPoint, primitive.endPoint);
  return primitive.massSourceBreakdown.map((source, index) => {
    const massKg = source.massPerLengthKgM * primitive.sourceLengthM;
    return deepFreeze({
      ledgerRowId: `${primitive.primitiveId}:mass:${index}`,
      primitiveId: primitive.primitiveId,
      componentKey: primitive.componentKey,
      loadCaseId: primitive.loadCaseId,
      category: source.sourceId,
      distribution: 'DISTRIBUTED',
      massKg,
      weightN: massKg * gravity,
      massPerLengthKgM: source.massPerLengthKgM,
      sourceLengthM: primitive.sourceLengthM,
      positionM,
      firstMomentKgM: firstMoment(massKg, positionM),
      sourceEvidence: source.sourceEvidence || sourceTrace(primitive, source.sourceId),
    });
  });
}

function pointRow(primitive, gravity) {
  return deepFreeze({
    ledgerRowId: `${primitive.primitiveId}:mass:0`,
    primitiveId: primitive.primitiveId,
    componentKey: primitive.componentKey,
    loadCaseId: primitive.loadCaseId,
    category: 'COMPONENT_POINT_MASS',
    distribution: 'POINT',
    massKg: primitive.pointMassKg,
    weightN: primitive.pointMassKg * gravity,
    massPerLengthKgM: null,
    sourceLengthM: null,
    positionM: primitive.applicationPoint,
    firstMomentKgM: firstMoment(primitive.pointMassKg, primitive.applicationPoint),
    sourceEvidence: primitive.sourceEvidence,
  });
}

function summarizeCase(loadCaseId, rows, audit) {
  const selected = rows.filter((row) => row.loadCaseId === loadCaseId);
  const massKg = selected.reduce((sum, row) => sum + row.massKg, 0);
  const weightN = selected.reduce((sum, row) => sum + row.weightN, 0);
  const moments = selected.reduce((sum, row) => addPoint(sum, row.firstMomentKgM), { x: 0, y: 0, z: 0 });
  const readiness = audit.cases.find((row) => row.loadCaseId === loadCaseId);
  return deepFreeze({
    loadCaseId,
    qualification: readiness?.qualification || 'BLOCKED',
    blockers: [...(readiness?.blockers || [])].sort(),
    massKg,
    weightN,
    firstMomentKgM: moments,
    cogM: massKg > 0 ? dividePoint(moments, massKg) : null,
    rowCount: selected.length,
  });
}

function midpoint(left, right) {
  return deepFreeze({
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    z: (left.z + right.z) / 2,
  });
}
function firstMoment(mass, point) { return deepFreeze({ x: mass * point.x, y: mass * point.y, z: mass * point.z }); }
function addPoint(left, right) { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function dividePoint(point, divisor) { return deepFreeze({ x: point.x / divisor, y: point.y / divisor, z: point.z / divisor }); }
function sourceTrace(primitive, sourceId) {
  return primitive.formulaTrace.find((trace) => trace.formulaId.includes(sourceId.split('_')[0])) || null;
}
