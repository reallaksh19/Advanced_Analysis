import { deepFreeze } from '../shared-piping-model/index.js';
import { PRIMITIVE_TYPES } from '../model-loads/index.js';

export function projectLoadCases(loadCaseSet, readinessAudit) {
  const auditById = new Map(readinessAudit.cases.map((row) => [row.loadCaseId, row]));
  return deepFreeze(loadCaseSet.loadCases.map((loadCase) => {
    const audit = auditById.get(loadCase.loadCaseId);
    return deepFreeze({
      loadCaseId: loadCase.loadCaseId,
      name: loadCase.name,
      caseType: loadCase.caseType,
      qualification: audit.qualification,
      includedMassSources: sortedStrings(loadCase.includedMassSources),
      excludedMassSources: sortedStrings(loadCase.excludedMassSources),
      readyComponentCount: audit.readyComponentIds.length,
      blockedComponentCount: audit.blockedComponentIds.length,
      distributedPrimitiveCount: audit.distributedPrimitiveCount,
      pointPrimitiveCount: audit.pointPrimitiveCount,
      explicitMomentCount: audit.explicitMomentCount,
      totalMassKg: audit.totalMassKg,
      totalForceN: audit.totalForceN,
      blockers: sortedStrings(audit.blockers),
      diagnostics: canonicalDiagnostics(audit.diagnostics),
    });
  }).sort((a, b) => a.loadCaseId.localeCompare(b.loadCaseId)));
}

export function projectComponentOutcomes(primitiveSet) {
  return deepFreeze(primitiveSet.componentOutcomes.map((row) => deepFreeze({
    loadCaseId: row.loadCaseId,
    componentKey: row.componentKey,
    ready: row.ready,
    mode: row.ready ? row.mode : null,
    blockers: sortedStrings(row.blockers),
    diagnostics: canonicalDiagnostics(row.diagnostics),
  })).sort(outcomeOrder));
}

export function projectPrimitives(primitiveSet) {
  return deepFreeze(primitiveSet.primitives.map(projectPrimitive)
    .sort((a, b) => a.primitiveId.localeCompare(b.primitiveId)));
}

export function projectScreeningSummary(pathModel, screening, audit) {
  const pathById = new Map(pathModel.paths.map((row) => [row.pathId, row]));
  return deepFreeze(audit.records.map((row) => {
    const path = pathById.get(row.pathId);
    return deepFreeze({
      pathId: row.pathId,
      loadCaseId: row.loadCaseId,
      qualification: row.qualification,
      screenedAppliedForceN: row.appliedForceN,
      screenedSupportForceN: row.screenedSupportForceN,
      forceResidualN: row.equilibriumResidualN,
      relativeResidual: row.relativeResidual,
      supportCount: (row.qualifiedSupportIds?.length || 0) + (row.blockedSupportIds?.length || 0),
      spanCount: row.spanCount,
      blockers: sortedStrings(row.blockers),
      diagnostics: canonicalDiagnostics(row.diagnostics),
      pathSemanticHash: path?.semanticHash || null,
      screeningSemanticHash: screening.semanticHash,
    });
  }).sort(screeningOrder));
}

function projectPrimitive(row) {
  if (row.primitiveType === PRIMITIVE_TYPES.DISTRIBUTED) return distributed(row);
  if (row.primitiveType === PRIMITIVE_TYPES.POINT) return point(row);
  if (row.primitiveType === PRIMITIVE_TYPES.MOMENT) return moment(row);
  throw new TypeError(`Unsupported model-load primitive type: ${row.primitiveType}.`);
}

function distributed(row) {
  return deepFreeze({
    primitiveId: row.primitiveId,
    loadCaseId: row.loadCaseId,
    componentKey: row.componentKey,
    primitiveType: row.primitiveType,
    startPoint: row.startPoint,
    endPoint: row.endPoint,
    sourceLengthM: row.sourceLengthM,
    massPerLengthKgM: row.massPerLengthKgM,
    forcePerLengthNM: row.forcePerLengthNM,
    semanticDirection: row.semanticDirection,
    globalVector: row.globalVector,
    massSourceBreakdown: row.massSourceBreakdown,
    formulaTrace: row.formulaTrace,
    sourceEvidence: row.sourceEvidence,
    diagnostics: canonicalDiagnostics(row.diagnostics),
  });
}

function point(row) {
  return deepFreeze({
    primitiveId: row.primitiveId,
    loadCaseId: row.loadCaseId,
    componentKey: row.componentKey,
    primitiveType: row.primitiveType,
    applicationPoint: row.applicationPoint,
    pointMassKg: row.pointMassKg,
    pointForceN: row.pointForceN,
    semanticDirection: row.semanticDirection,
    globalVector: row.globalVector,
    formulaTrace: row.formulaTrace,
    sourceEvidence: row.sourceEvidence,
    diagnostics: canonicalDiagnostics(row.diagnostics),
  });
}

function moment(row) {
  return deepFreeze({
    primitiveId: row.primitiveId,
    loadCaseId: row.loadCaseId,
    componentKey: row.componentKey,
    primitiveType: row.primitiveType,
    applicationPoint: row.applicationPoint,
    momentMagnitudeNm: row.momentMagnitudeNm,
    axisEvidence: row.axisEvidence,
    globalVector: row.globalVector,
    sourceEvidence: row.sourceEvidence,
    diagnostics: canonicalDiagnostics(row.diagnostics),
  });
}

function canonicalDiagnostics(rows) {
  return deepFreeze([...(rows || [])].sort((a, b) => diagnosticKey(a).localeCompare(diagnosticKey(b))));
}
function diagnosticKey(row) {
  return `${row?.scope || ''}\0${row?.loadCaseId || ''}\0${row?.componentKey || ''}\0${row?.code || ''}\0${row?.severity || ''}\0${row?.message || ''}`;
}
function sortedStrings(rows) { return deepFreeze([...(rows || [])].sort()); }
function outcomeOrder(a, b) {
  return `${a.loadCaseId}\0${a.componentKey}`.localeCompare(`${b.loadCaseId}\0${b.componentKey}`);
}
function screeningOrder(a, b) {
  return `${a.pathId}\0${a.loadCaseId}`.localeCompare(`${b.pathId}\0${b.loadCaseId}`);
}
