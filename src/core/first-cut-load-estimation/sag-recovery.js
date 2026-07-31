/**
 * Functionality: Recovers the exact Euler-Bernoulli span deflection field for
 * uniform and point loads from solved end displacement/rotation conditions.
 * Outputs governing sag and project-criterion status without code claims.
 */

import { deepFreeze } from '../shared-piping-model/index.js';
import { FIRST_CUT_STATUSES } from './constants.js';
import { assertExactKeys, assertFinite } from './validation.js';

const SPAN_KEYS = Object.freeze([
  'startStationM', 'lengthM', 'flexuralRigidityNm2',
  'startDisplacementM', 'startRotationRad', 'endDisplacementM', 'endRotationRad',
  'uniformForcePerLengthNM', 'pointForces',
]);

export function recoverSpanSag(input) {
  assertExactKeys(input, SPAN_KEYS, 'Span-sag input');
  const span = validateSpan(input);
  const segments = segmentBoundaries(span);
  const roots = segments.flatMap(([start, end]) => derivativeRoots(span, start, end));
  const stations = uniqueSorted([0, span.lengthM, ...span.pointForces.map((row) => row.stationM), ...roots]);
  const samples = stations.map((stationM) => deepFreeze({
    stationM: span.startStationM + stationM,
    displacementM: displacementAt(span, stationM),
    rotationRad: rotationAt(span, stationM),
  }));
  const governing = [...samples].sort((left, right) => (
    Math.abs(right.displacementM) - Math.abs(left.displacementM) || left.stationM - right.stationM
  ))[0];
  return deepFreeze({
    startStationM: span.startStationM,
    endStationM: span.startStationM + span.lengthM,
    maximumAbsoluteSagM: Math.abs(governing.displacementM),
    governingStationM: governing.stationM,
    signedDisplacementM: governing.displacementM,
    extrema: samples,
    fieldBasis: 'EXACT_EULER_BERNOULLI_LOAD_SHAPE_WITH_SOLVED_END_CONDITIONS',
  });
}

export function recoverBeamSag(input) {
  assertExactKeys(input, ['beamModel', 'solution', 'sagCriterion'], 'Beam-sag input');
  const rows = input.beamModel.pathCases.flatMap((modelCase) => {
    const solutionCase = input.solution.pathCases.find((row) => (
      row.pathId === modelCase.pathId && row.loadCaseId === modelCase.loadCaseId
    ));
    if (modelCase.qualification !== 'READY' || solutionCase?.qualification !== 'READY') {
      return [blockedCase(modelCase, solutionCase)];
    }
    return [recoverCase(modelCase, solutionCase, input.sagCriterion)];
  }).sort((left, right) => `${left.pathId}|${left.loadCaseId}`.localeCompare(`${right.pathId}|${right.loadCaseId}`));
  const statuses = rows.map((row) => row.status);
  return deepFreeze({
    cases: rows,
    status: aggregateSagStatus(statuses),
    maximumAbsoluteSagM: Math.max(0, ...rows.map((row) => row.maximumAbsoluteSagM || 0)),
  });
}

function validateSpan(input) {
  if (!Array.isArray(input.pointForces)) throw new TypeError('Point forces must be an array.');
  const lengthM = assertFinite(input.lengthM, 'Span length', (value) => value > 0);
  const pointForces = input.pointForces.map((row) => validatePointForce(row, lengthM));
  return deepFreeze({
    startStationM: assertFinite(input.startStationM, 'Span start', () => true),
    lengthM,
    flexuralRigidityNm2: assertFinite(input.flexuralRigidityNm2, 'Span EI', (value) => value > 0),
    startDisplacementM: assertFinite(input.startDisplacementM, 'Start displacement', () => true),
    startRotationRad: assertFinite(input.startRotationRad, 'Start rotation', () => true),
    endDisplacementM: assertFinite(input.endDisplacementM, 'End displacement', () => true),
    endRotationRad: assertFinite(input.endRotationRad, 'End rotation', () => true),
    uniformForcePerLengthNM: assertFinite(input.uniformForcePerLengthNM, 'Uniform force', () => true),
    pointForces: pointForces.sort((left, right) => left.stationM - right.stationM),
  });
}

function validatePointForce(value, lengthM) {
  assertExactKeys(value, ['stationM', 'forceN'], 'Span point force');
  return deepFreeze({
    stationM: assertFinite(value.stationM, 'Point-force station', (number) => number > 0 && number < lengthM),
    forceN: assertFinite(value.forceN, 'Point force', () => true),
  });
}

function recoverCase(modelCase, solutionCase, criterion) {
  const nodeResults = new Map(solutionCase.nodeResults.map((row) => [row.nodeId, row]));
  const spans = modelCase.elements.map((element) => recoverElement(modelCase, element, nodeResults));
  const governing = [...spans].sort((left, right) => right.maximumAbsoluteSagM - left.maximumAbsoluteSagM)[0];
  const maximumAbsoluteSagM = governing?.maximumAbsoluteSagM || 0;
  const utilization = criterion ? maximumAbsoluteSagM / criterion.maximumM : null;
  const status = criterion === null
    ? FIRST_CUT_STATUSES.CONDITIONAL
    : utilization > 1 ? FIRST_CUT_STATUSES.ESCALATE : FIRST_CUT_STATUSES.QUALIFIED;
  return deepFreeze({
    pathId: modelCase.pathId,
    loadCaseId: modelCase.loadCaseId,
    spans,
    maximumAbsoluteSagM,
    governingStationM: governing?.governingStationM ?? null,
    projectCriterion: criterion,
    utilization,
    status,
    blockers: [],
  });
}

function recoverElement(modelCase, element, nodes) {
  const left = nodes.get(element.startNodeId), right = nodes.get(element.endNodeId);
  if (!left || !right) throw new TypeError(`Missing solved nodes for ${element.elementId}.`);
  const uniform = modelCase.loadVectorRecords
    .filter((row) => row.elementId === element.elementId)
    .reduce((sum, row) => sum + (row.forcePerLengthNM || 0), 0);
  const points = modelCase.loadVectorRecords.filter((row) => (
    row.pointForceN !== null && row.pathStationM > element.startStationM
    && row.pathStationM < element.endStationM
  )).map((row) => ({
    stationM: row.pathStationM - element.startStationM,
    forceN: row.pointForceN,
  }));
  return recoverSpanSag({
    startStationM: element.startStationM,
    lengthM: element.lengthM,
    flexuralRigidityNm2: element.flexuralRigidityNm2,
    startDisplacementM: left.verticalDisplacementM,
    startRotationRad: left.rotationRad,
    endDisplacementM: right.verticalDisplacementM,
    endRotationRad: right.rotationRad,
    uniformForcePerLengthNM: uniform,
    pointForces: points,
  });
}

function polynomialCoefficients(span) {
  const length = span.lengthM, ei = span.flexuralRigidityNm2;
  const particularEnd = particular(span, length), particularSlopeEnd = particularSlope(span, length);
  const displacementRemainder = span.endDisplacementM - span.startDisplacementM
    - span.startRotationRad * length - particularEnd;
  const rotationRemainder = span.endRotationRad - span.startRotationRad - particularSlopeEnd;
  return {
    a: span.startDisplacementM,
    b: span.startRotationRad,
    c: (3 * displacementRemainder - rotationRemainder * length) / length ** 2,
    d: (rotationRemainder * length - 2 * displacementRemainder) / length ** 3,
    q: span.uniformForcePerLengthNM / (24 * ei),
  };
}

function displacementAt(span, x) {
  const coefficients = polynomialCoefficients(span);
  return coefficients.a + coefficients.b * x + coefficients.c * x ** 2
    + coefficients.d * x ** 3 + coefficients.q * x ** 4 + pointParticular(span, x);
}

function rotationAt(span, x) {
  const coefficients = polynomialCoefficients(span);
  return coefficients.b + 2 * coefficients.c * x + 3 * coefficients.d * x ** 2
    + 4 * coefficients.q * x ** 3 + pointParticularSlope(span, x);
}

function particular(span, x) {
  return span.uniformForcePerLengthNM * x ** 4 / (24 * span.flexuralRigidityNm2) + pointParticular(span, x);
}
function particularSlope(span, x) {
  return span.uniformForcePerLengthNM * x ** 3 / (6 * span.flexuralRigidityNm2) + pointParticularSlope(span, x);
}
function pointParticular(span, x) {
  return span.pointForces.filter((row) => x > row.stationM)
    .reduce((sum, row) => sum + row.forceN * (x - row.stationM) ** 3 / (6 * span.flexuralRigidityNm2), 0);
}
function pointParticularSlope(span, x) {
  return span.pointForces.filter((row) => x > row.stationM)
    .reduce((sum, row) => sum + row.forceN * (x - row.stationM) ** 2 / (2 * span.flexuralRigidityNm2), 0);
}

function segmentBoundaries(span) {
  const values = uniqueSorted([0, ...span.pointForces.map((row) => row.stationM), span.lengthM]);
  return values.slice(0, -1).map((start, index) => [start, values[index + 1]]);
}

function derivativeRoots(span, start, end) {
  const roots = [], steps = 96;
  let left = start, leftValue = rotationAt(span, left);
  for (let index = 1; index <= steps; index += 1) {
    const right = start + (end - start) * index / steps;
    const rightValue = rotationAt(span, right);
    if (leftValue === 0) roots.push(left);
    if (leftValue * rightValue < 0) roots.push(bisectRoot(span, left, right));
    left = right; leftValue = rightValue;
  }
  return roots;
}

function bisectRoot(span, start, end) {
  let left = start, right = end, leftValue = rotationAt(span, left);
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (left + right) / 2, value = rotationAt(span, middle);
    if (Math.abs(value) <= 1e-14) return middle;
    if (leftValue * value <= 0) right = middle;
    else { left = middle; leftValue = value; }
  }
  return (left + right) / 2;
}

function blockedCase(modelCase, solutionCase) {
  return deepFreeze({
    pathId: modelCase.pathId, loadCaseId: modelCase.loadCaseId, spans: [],
    maximumAbsoluteSagM: null, governingStationM: null, projectCriterion: null,
    utilization: null, status: FIRST_CUT_STATUSES.BLOCKED,
    blockers: [...new Set([...(modelCase.blockers || []), ...(solutionCase?.blockers || [])])].sort(),
  });
}
function aggregateSagStatus(statuses) {
  for (const status of [FIRST_CUT_STATUSES.BLOCKED, FIRST_CUT_STATUSES.ESCALATE, FIRST_CUT_STATUSES.CONDITIONAL]) {
    if (statuses.includes(status)) return status;
  }
  return FIRST_CUT_STATUSES.QUALIFIED;
}
function uniqueSorted(values) { return [...new Set(values.map((value) => Number(value.toPrecision(14))))].sort((a, b) => a - b); }
