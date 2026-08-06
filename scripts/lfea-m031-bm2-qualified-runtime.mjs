import {
  BM2_M031_ACTIVE_SET_PROFILE,
  BM2_M031_SOLVER_CONDITIONING_PROFILE,
  solveBm2InputXmlQualified as solveBm2InputXmlQualifiedBase,
} from './lfea-m031-bm2-qualified-runtime-base.mjs';

export {
  BM2_M031_ACTIVE_SET_PROFILE,
  BM2_M031_SOLVER_CONDITIONING_PROFILE,
};

const AXIS_CUSTODY_PROFILE = 'M032_BM2_JUNCTION_ADJACENT_REPORTING_PLANE_V1';
const PARALLEL_TOLERANCE = 1e-9;

function clean(value) {
  return Object.is(value, -0) || Math.abs(value) < 1e-18 ? 0 : value;
}

function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}

function scale(vector, factor) {
  return vector.map((value) => value * factor);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function unit(vector, label) {
  const length = Math.hypot(...vector);
  if (!(length > 0)) throw new Error(`${label} has zero length.`);
  return scale(vector, 1 / length);
}

function axesFromAB(aInput, bInput, label) {
  const a = unit(aInput, `${label} local a`);
  const b = unit(bInput, `${label} local b`);
  if (Math.abs(dot(a, b)) > PARALLEL_TOLERANCE) {
    throw new Error(`${label} local a and b are not orthogonal.`);
  }
  const c = unit(cross(a, b), `${label} local c`);
  return Object.freeze({ a: Object.freeze(a), b: Object.freeze(b), c: Object.freeze(c) });
}

function genericStraightAxes(aInput, label) {
  const a = unit(aInput, `${label} generic local a`);
  const vertical = [0, 1, 0];
  const b = Math.abs(dot(a, vertical)) >= 1 - 1e-10
    ? [1, 0, 0]
    : unit(cross(a, vertical), `${label} generic local b`);
  return axesFromAB(a, b, `${label} generic`);
}

function reportingPlaneForElement(solved, element) {
  if (element.bendTagged === true || element.sourceType === 'TANGENT_CONSUMED_REPORT_TRANSFER') return null;
  const elementIds = String(element.kernelElementId).split('|');
  const planes = elementIds
    .map((elementId) => solved.junctionMechanics.referenceVectorByElement.get(elementId)?.normal ?? null)
    .filter(Boolean);
  if (planes.length === 0) return null;
  const first = unit(planes[0], `${element.sourceElementId} reporting plane`);
  for (const plane of planes.slice(1)) {
    const candidate = unit(plane, `${element.sourceElementId} reporting plane`);
    if (Math.abs(Math.abs(dot(first, candidate)) - 1) > PARALLEL_TOLERANCE) {
      throw new Error(`${element.sourceElementId} has incompatible junction reporting planes.`);
    }
  }
  return Object.freeze(first);
}

function reportAxisCandidate(element, positions, planeNormal) {
  const from = positions.get(String(element.fromNode));
  const to = positions.get(String(element.toNode));
  if (!from || !to) throw new Error(`${element.sourceElementId} lacks report endpoint positions.`);
  const span = subtract([to.x, to.y, to.z], [from.x, from.y, from.z]);
  const generic = genericStraightAxes(span, element.sourceElementId);
  const owned = axesFromAB(span, planeNormal, `${element.sourceElementId} owned-plane`);
  const transverseFrameIsExactlyReversed = dot(generic.b, owned.b) <= -1 + PARALLEL_TOLERANCE
    && dot(generic.c, owned.c) <= -1 + PARALLEL_TOLERANCE;
  return Object.freeze({ generic, owned, transverseFrameIsExactlyReversed });
}

function project(global, axes) {
  const force = [global.fx, global.fy, global.fz];
  const moment = [global.mx, global.my, global.mz];
  return Object.freeze({
    fx: clean(dot(axes.a, force)),
    fy: clean(dot(axes.b, force)),
    fz: clean(dot(axes.c, force)),
    mx: clean(dot(axes.a, moment)),
    my: clean(dot(axes.b, moment)),
    mz: clean(dot(axes.c, moment)),
  });
}

function correctCase(caseResult, axes) {
  return Object.freeze({
    ...caseResult,
    local: Object.freeze({
      I: project(caseResult.global.I, axes),
      J: project(caseResult.global.J, axes),
    }),
  });
}

function correctElement(solved, element, positions) {
  const planeNormal = reportingPlaneForElement(solved, element);
  if (planeNormal === null) return element;
  const candidate = reportAxisCandidate(element, positions, planeNormal);
  if (!candidate.transverseFrameIsExactlyReversed) return element;
  return Object.freeze({
    ...element,
    sustained: correctCase(element.sustained, candidate.owned),
    operating: correctCase(element.operating, candidate.owned),
    reportingAxisCustody: Object.freeze({
      profile: AXIS_CUSTODY_PROFILE,
      basis: 'CORRECT_ONLY_EXACT_180_DEGREE_TRANSVERSE_FRAME_DISCONTINUITY',
      priorAxes: candidate.generic,
      correctedAxes: candidate.owned,
    }),
  });
}

function correctReport(solved) {
  const positions = new Map(solved.report.nodes.map((node) => [
    String(node.sourceNodeId),
    node.position,
  ]));
  const elements = Object.freeze(solved.report.elements.map((element) => (
    correctElement(solved, element, positions)
  )));
  const correctedPairs = Object.freeze(elements
    .filter((element) => element.reportingAxisCustody?.profile === AXIS_CUSTODY_PROFILE)
    .map((element) => `${element.fromNode}-${element.toNode}`));
  return Object.freeze({
    ...solved.report,
    localForceReportingAuthority: Object.freeze({
      ...solved.report.localForceReportingAuthority,
      junctionAdjacentStraight: 'correct exact 180-degree transverse-frame discontinuity using the element-owned junction plane at both endpoints',
      junctionAdjacentStraightProfile: AXIS_CUSTODY_PROFILE,
      correctedPairs,
    }),
    elements,
  });
}

export function solveBm2InputXmlQualified() {
  const solved = solveBm2InputXmlQualifiedBase();
  return Object.freeze({ ...solved, report: correctReport(solved) });
}

export const solveBm2InputXmlConditioned = solveBm2InputXmlQualified;
