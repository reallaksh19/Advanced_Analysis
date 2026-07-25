import { deepFreeze } from '../shared-piping-model/index.js';
import { FORMULA_IDS } from './constants.js';

export function simpleSpanPointContributions(input) {
  const localX = input.loadStationM - input.spanStartM;
  const length = input.spanEndM - input.spanStartM;
  assertSpan(length, localX);
  const left = input.forceN * (length - localX) / length;
  const right = input.forceN * localX / length;
  return pair(input, FORMULA_IDS.POINT, input.forceN, input.loadStationM, left, right, {
    forceN: input.forceN,
    localCoordinateM: localX,
    spanLengthM: length,
  });
}

export function simpleSpanUniformContributions(input) {
  const length = input.spanEndM - input.spanStartM;
  const segmentLength = input.intervalEndM - input.intervalStartM;
  const force = input.forcePerLengthNM * segmentLength;
  const centroid = (input.intervalStartM + input.intervalEndM) / 2;
  const localX = centroid - input.spanStartM;
  assertSpan(length, localX);
  const left = force * (length - localX) / length;
  const right = force * localX / length;
  return pair(input, FORMULA_IDS.UNIFORM, force, centroid, left, right, {
    forcePerLengthNM: input.forcePerLengthNM,
    intervalStartM: input.intervalStartM,
    intervalEndM: input.intervalEndM,
    segmentLengthM: segmentLength,
    segmentForceN: force,
    centroidStationM: centroid,
    localCentroidM: localX,
    spanLengthM: length,
  });
}

export function equilibriumCheck(appliedForceN, supportForceN, policy) {
  const residualForceN = supportForceN - appliedForceN;
  const scale = Math.max(policy.scaleFloorN, Math.abs(appliedForceN), Math.abs(supportForceN));
  const toleranceN = policy.absoluteToleranceN + policy.relativeTolerance * scale;
  const relativeResidual = Math.abs(residualForceN) / scale;
  return deepFreeze({
    formulaId: FORMULA_IDS.EQUILIBRIUM,
    formulaVersion: 1,
    appliedForceN,
    screenedSupportForceN: supportForceN,
    residualForceN,
    relativeResidual,
    tolerancePolicy: policy,
    toleranceN,
    pass: Math.abs(residualForceN) <= toleranceN,
  });
}

function pair(input, formulaId, force, centroid, left, right, substitutions) {
  return [
    contribution(input, formulaId, input.leftSupport, force, centroid, input.spanEndM - centroid, left, substitutions),
    contribution(input, formulaId, input.rightSupport, force, centroid, centroid - input.spanStartM, right, substitutions),
  ];
}

function contribution(input, formulaId, support, force, centroid, leverArm, screenedForce, substitutions) {
  const side = support.supportKey === input.leftSupport.supportKey ? 'left' : 'right';
  return deepFreeze({
    contributionId: `screening-contribution:${input.loadCaseId}:${input.pathId}:${input.spanId}:${input.primitiveId}:${support.supportKey}:${input.segmentIndex ?? 0}`,
    loadCaseId: input.loadCaseId,
    pathId: input.pathId,
    spanId: input.spanId,
    primitiveId: input.primitiveId,
    supportKey: support.supportKey,
    formulaId,
    formulaVersion: 1,
    spanStartM: input.spanStartM,
    spanEndM: input.spanEndM,
    spanLengthM: input.spanEndM - input.spanStartM,
    ...(input.loadStationM !== undefined ? { loadStationM: input.loadStationM } : { loadIntervalM: [input.intervalStartM, input.intervalEndM] }),
    segmentForceN: force,
    centroidStationM: centroid,
    leverArmM: leverArm,
    screenedVerticalForceN: screenedForce,
    formulaTrace: { formulaId, formulaVersion: 1, substitutions: { ...substitutions, side }, rawResultN: screenedForce, roundingRule: 'NONE' },
    sourceEvidence: input.sourceEvidence || null,
    diagnostics: [],
  });
}

function assertSpan(length, localX) {
  if (!(length > 0) || localX < -1e-12 || localX > length + 1e-12) throw new RangeError('Load coordinate is outside the screening span.');
}
