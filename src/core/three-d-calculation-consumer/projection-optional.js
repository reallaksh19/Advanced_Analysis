import { deepFreeze } from '../shared-piping-model/index.js';
import { canonicalDiagnostics } from './projection-model.js';

export function projectLoadPrimitives(primitiveSet) {
  return deepFreeze(primitiveSet.primitives.map((row) => deepFreeze({
    primitiveId: row.primitiveId,
    loadCaseId: row.loadCaseId,
    componentKey: row.componentKey,
    primitiveType: row.primitiveType,
    geometry: primitiveGeometry(row),
    massEvidence: primitiveMass(row),
    forceEvidence: primitiveForce(row),
    momentEvidence: primitiveMoment(row),
    semanticDirection: row.semanticDirection ?? null,
    globalVector: row.globalVector ?? null,
    formulaTrace: row.formulaTrace,
    sourceEvidence: row.sourceEvidence,
    diagnostics: canonicalDiagnostics(row.diagnostics),
  })).sort((a, b) => a.primitiveId.localeCompare(b.primitiveId)));
}

export function projectFlexuralProperties(projection) {
  return deepFreeze(projection.records.map((row) => deepFreeze({
    componentKey: row.componentKey,
    pathId: row.pathId,
    qualification: row.qualification,
    sourceMode: row.resolutionBasis,
    elasticModulusEvidence: deepFreeze({
      valuePa: row.elasticModulusPa,
      sourceEvidence: row.sourceEvidence,
    }),
    secondMomentEvidence: deepFreeze({
      valueM4: row.secondMomentAreaM4,
      sourceEvidence: row.sourceEvidence,
    }),
    flexuralRigidityEvidence: deepFreeze({
      valueNm2: row.flexuralRigidityNm2,
      sourceEvidence: row.sourceEvidence,
    }),
    formulaTrace: row.formulaTrace,
    diagnostics: canonicalDiagnostics(row.diagnostics),
  })).sort((a, b) => `${a.pathId}\0${a.componentKey}`.localeCompare(`${b.pathId}\0${b.componentKey}`)));
}

export function projectVerticalBeamCases(beamModel, solution, audit) {
  const modelByKey = new Map(beamModel.pathCases.map((row) => [caseKey(row), row]));
  const auditByKey = new Map(audit.records.map((row) => [caseKey(row), row]));
  return deepFreeze(solution.pathCases.map((row) => beamCase(row, modelByKey, auditByKey))
    .sort((a, b) => caseKey(a).localeCompare(caseKey(b))));
}

function beamCase(row, modelByKey, auditByKey) {
  const model = modelByKey.get(caseKey(row));
  const auditRow = auditByKey.get(caseKey(row));
  return deepFreeze({
    pathId: row.pathId,
    loadCaseId: row.loadCaseId,
    qualification: row.qualification,
    nodeCount: auditRow?.nodeCount ?? row.nodeResults.length,
    elementCount: auditRow?.elementCount ?? row.elementEndForces.length,
    freeDofCount: row.freeDofCount,
    constrainedDofCount: row.constrainedDofCount,
    qualifiedSupports: model?.qualifiedSupportKeys,
    appliedForceN: row.appliedForceTotalN ?? null,
    signedSupportForceN: row.supportForceTotalN ?? null,
    maximumAbsoluteDisplacementM: row.maximumAbsoluteDisplacementM ?? null,
    maximumAbsoluteRotationRad: row.maximumAbsoluteRotationRad ?? null,
    forceResidualN: row.forceEquilibrium?.residual ?? null,
    momentResidualNm: row.momentEquilibrium?.residual ?? null,
    matrixResidualN: row.matrixResidual?.residual ?? null,
    supportForceRows: row.supportForceResults,
    nodeDisplacementRows: row.nodeResults.map(nodeDisplacement),
    nodeRotationRows: row.nodeResults.map(nodeRotation),
    blockers: [...row.blockers].sort(),
    diagnostics: canonicalDiagnostics(row.diagnostics),
  });
}

function primitiveGeometry(row) {
  if ('startPoint' in row) {
    return deepFreeze({ startPoint: row.startPoint, endPoint: row.endPoint, sourceLengthM: row.sourceLengthM });
  }
  return deepFreeze({ applicationPoint: row.applicationPoint ?? null });
}
function primitiveMass(row) {
  if ('massPerLengthKgM' in row) {
    return deepFreeze({ massPerLengthKgM: row.massPerLengthKgM, massSourceBreakdown: row.massSourceBreakdown });
  }
  if ('pointMassKg' in row) return deepFreeze({ pointMassKg: row.pointMassKg });
  return null;
}
function primitiveForce(row) {
  if ('forcePerLengthNM' in row) return deepFreeze({ forcePerLengthNM: row.forcePerLengthNM });
  if ('pointForceN' in row) return deepFreeze({ pointForceN: row.pointForceN });
  return null;
}
function primitiveMoment(row) {
  return 'momentMagnitudeNm' in row
    ? deepFreeze({ momentMagnitudeNm: row.momentMagnitudeNm, axisEvidence: row.axisEvidence })
    : null;
}
function nodeDisplacement(row) {
  return deepFreeze({
    nodeId: row.nodeId,
    pathStationM: row.pathStationM,
    verticalDisplacementM: row.verticalDisplacementM,
    directionConvention: row.directionConvention,
  });
}
function nodeRotation(row) {
  return deepFreeze({
    nodeId: row.nodeId,
    pathStationM: row.pathStationM,
    rotationRad: row.rotationRad,
    directionConvention: row.directionConvention,
  });
}
function caseKey(row) { return `${row.pathId}\0${row.loadCaseId}`; }
