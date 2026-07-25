import { ACTION_SENSES, COORDINATE_SYSTEMS, FORMULA_IDS } from './constants.js';
import { loadError } from './errors.js';
import { canonicalNumber, toleranceFor } from './numeric.js';
import { localToGlobal, proveVectorRoundTrip } from './coordinates.js';
import { add, cross, negate, subtract } from './vector-math.js';
export function transformRequestedLoadCases(model, frame) {
  const requested = new Set(model.resultRequests.transformedLoadCaseIdentities);
  return model.loadCases.filter((row) => requested.has(row.identity)).map((row) => transformLoadCase(model, frame, row));
}
export function transformLoadCase(model, frame, loadCase) {
  const points = new Map(model.loadReferencePoints.map((row) => [row.identity, row]));
  const sourcePoint = globalPoint(points.get(loadCase.sourceReferencePointIdentity), frame);
  const targetPoint = globalPoint(points.get(loadCase.targetReferencePointIdentity), frame);
  const sourceForce = globalVector(loadCase.force.value, loadCase.sourceCoordinateSystem, frame);
  const sourceMoment = globalVector(loadCase.moment.value, loadCase.sourceCoordinateSystem, frame);
  const reversed = loadCase.actionSense === ACTION_SENSES.PIPE_ON_SUPPORT;
  const pipeForce = reversed ? negate(sourceForce) : sourceForce;
  const pipeMoment = reversed ? negate(sourceMoment) : sourceMoment;
  const leverArm = subtract(sourcePoint, targetPoint);
  const targetMoment = add(pipeMoment, cross(leverArm, pipeForce));
  const forceProof = proveVectorRoundTrip(frame, pipeForce, 'force', model.qualificationProfile);
  const momentProof = proveVectorRoundTrip(frame, targetMoment, 'moment', model.qualificationProfile);
  const commonOrigin = commonOriginProof(model, pipeForce, pipeMoment, targetMoment, sourcePoint, targetPoint, frame.originGlobal);
  return loadResult(loadCase, {
    sourcePoint, targetPoint, sourceForce, sourceMoment, reversed, pipeForce,
    pipeMoment, leverArm, targetMoment, forceProof, momentProof, commonOrigin,
  });
}
function loadResult(loadCase, evidence) {
  const { sourcePoint, targetPoint, sourceForce, sourceMoment, reversed, pipeForce } = evidence;
  const { pipeMoment, leverArm, targetMoment, forceProof, momentProof, commonOrigin } = evidence;
  const formulaIds = transferFormulaIds(reversed);
  return {
    identity: loadCase.identity,
    sourceCoordinateSystem: loadCase.sourceCoordinateSystem,
    sourceReferencePointIdentity: loadCase.sourceReferencePointIdentity,
    targetReferencePointIdentity: loadCase.targetReferencePointIdentity,
    inputActionSense: loadCase.actionSense,
    canonicalActionSense: ACTION_SENSES.SUPPORT_ON_PIPE,
    actionMultiplier: reversed ? -1 : 1,
    sourcePointGlobal: sourcePoint,
    targetPointGlobal: targetPoint,
    leverArmGlobal: leverArm,
    sourceForceGlobal: sourceForce,
    sourceMomentGlobal: sourceMoment,
    canonicalForceGlobal: pipeForce,
    canonicalMomentAtSourceGlobal: pipeMoment,
    transformedForceGlobal: pipeForce,
    transformedMomentGlobal: targetMoment,
    transformedForceLocal: forceProof.local,
    transformedMomentLocal: momentProof.local,
    reconstructedForceGlobal: forceProof.reconstructed,
    reconstructedMomentGlobal: momentProof.reconstructed,
    forceResidualGlobal: forceProof.residual,
    momentResidualGlobal: momentProof.residual,
    commonOriginMomentResidualGlobal: commonOrigin.residual,
    tolerances: { force: forceProof.tolerance, moment: momentProof.tolerance, commonOriginMoment: commonOrigin.tolerance },
    sourceReferences: { force: loadCase.force.sourceRef, moment: loadCase.moment.sourceRef },
    formulaIds,
  };
}
function transferFormulaIds(reversed) {
  const formulaIds = [FORMULA_IDS.GLOBAL_TO_LOCAL, FORMULA_IDS.LOCAL_TO_GLOBAL, FORMULA_IDS.MOMENT_TRANSFER, FORMULA_IDS.FORCE_CONSERVATION, FORMULA_IDS.MOMENT_CONSERVATION];
  if (reversed) formulaIds.push(FORMULA_IDS.ACTION_REVERSAL);
  return formulaIds.sort();
}
function globalVector(vector, coordinateSystem, frame) {
  return coordinateSystem === COORDINATE_SYSTEMS.GLOBAL ? vector : localToGlobal(frame, vector);
}
function globalPoint(point, frame) {
  if (!point) throw loadError('REFERENCE_POINT_MISSING', 'loadCase', 'Load reference point is missing.');
  return point.coordinateSystem === COORDINATE_SYSTEMS.GLOBAL ? point.point.value : add(frame.originGlobal, localToGlobal(frame, point.point.value));
}
function commonOriginProof(model, force, sourceMoment, targetMoment, sourcePoint, targetPoint, origin) {
  const source = add(sourceMoment, cross(subtract(sourcePoint, origin), force));
  const target = add(targetMoment, cross(subtract(targetPoint, origin), force));
  const residual = subtract(target, source);
  const tolerance = toleranceFor(model.qualificationProfile, 'moment', ...source, ...target);
  if (residual.some((value) => Math.abs(value) > tolerance)) {
    throw loadError('COMMON_ORIGIN_MOMENT_FAILURE', 'loadCase', 'Common-origin moment conservation did not qualify.');
  }
  return { residual: residual.map((value) => canonicalNumber(value, 'common-origin residual')), tolerance };
}
