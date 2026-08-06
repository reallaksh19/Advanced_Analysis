import {
  deepFreeze,
  semanticHash,
} from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_AUTHORING_BRANCH_GEOMETRY_SCHEMA =
  'TopologyEditAuthoringBranchGeometry.v1';

export const TOPOLOGY_EDIT_AUTHORING_BRANCH_FAMILIES = Object.freeze([
  'TEE',
  'OLET',
]);

const EPSILON = 1e-9;
const GLOBAL_AXES = Object.freeze([
  Object.freeze({ x: 1, y: 0, z: 0 }),
  Object.freeze({ x: 0, y: 1, z: 0 }),
  Object.freeze({ x: 0, y: 0, z: 1 }),
]);

export function deriveTopologyEditAuthoringBranchGeometry(input = {}) {
  const branchFamily = branchFamilyValue(input.branchFamily);
  const hostFrom = pointValue(input.hostFrom, 'hostFrom');
  const hostTo = pointValue(input.hostTo, 'hostTo');
  const hostVector = subtract(hostTo, hostFrom);
  const hostLengthMm = magnitude(hostVector);
  if (!(hostLengthMm > EPSILON)) {
    throw new RangeError(
      'TopologyEditAuthoringBranchGeometry: host edge must have positive length.',
    );
  }

  const stationMm = positiveNumber(input.stationMm, 'stationMm');
  if (!(stationMm < hostLengthMm - EPSILON)) {
    throw new RangeError(
      'TopologyEditAuthoringBranchGeometry: station must fit strictly inside the host edge.',
    );
  }
  const componentLengthMm = positiveNumber(
    input.componentLengthMm,
    'componentLengthMm',
  );
  const branchPipeLengthMm = positiveNumber(
    input.branchPipeLengthMm,
    'branchPipeLengthMm',
  );
  const clockingDeg = normalizedClocking(input.clockingDeg);

  const hostAxis = scale(hostVector, 1 / hostLengthMm);
  const referenceAxis = leastAlignedGlobalAxis(hostAxis);
  const clockingZeroAxis = normalize(cross(hostAxis, referenceAxis));
  const clockingQuarterAxis = normalize(cross(hostAxis, clockingZeroAxis));
  const clockingRad = clockingDeg * Math.PI / 180;
  const branchAxis = normalize(add(
    scale(clockingZeroAxis, Math.cos(clockingRad)),
    scale(clockingQuarterAxis, Math.sin(clockingRad)),
  ));

  const junctionPoint = add(hostFrom, scale(hostAxis, stationMm));
  const componentFacePoint = add(
    junctionPoint,
    scale(branchAxis, componentLengthMm),
  );
  const branchEndPoint = add(
    componentFacePoint,
    scale(branchAxis, branchPipeLengthMm),
  );

  const material = {
    schema: TOPOLOGY_EDIT_AUTHORING_BRANCH_GEOMETRY_SCHEMA,
    branchFamily,
    hostFrom,
    hostTo,
    hostLengthMm,
    stationMm,
    upstreamPipeLengthMm: stationMm,
    downstreamPipeLengthMm: hostLengthMm - stationMm,
    componentLengthMm,
    branchPipeLengthMm,
    totalBranchReachMm: componentLengthMm + branchPipeLengthMm,
    clockingDeg,
    hostAxis,
    referenceAxis,
    clockingZeroAxis,
    clockingQuarterAxis,
    branchAxis,
    junctionPoint,
    componentFacePoint,
    branchEndPoint,
  };
  return deepFreeze({
    ...material,
    geometryHash: semanticHash(material),
  });
}

export function assertTopologyEditAuthoringBranchGeometry(value) {
  if (
    !value
    || value.schema !== TOPOLOGY_EDIT_AUTHORING_BRANCH_GEOMETRY_SCHEMA
  ) {
    throw new TypeError(
      `TopologyEditAuthoringBranchGeometry: geometry must use ${TOPOLOGY_EDIT_AUTHORING_BRANCH_GEOMETRY_SCHEMA}.`,
    );
  }
  const supplied = { ...value };
  delete supplied.geometryHash;
  if (value.geometryHash !== semanticHash(supplied)) {
    throw new RangeError(
      'TopologyEditAuthoringBranchGeometry: geometry hash mismatch.',
    );
  }
  branchFamilyValue(value.branchFamily);
  pointValue(value.hostFrom, 'hostFrom');
  pointValue(value.hostTo, 'hostTo');
  pointValue(value.junctionPoint, 'junctionPoint');
  pointValue(value.componentFacePoint, 'componentFacePoint');
  pointValue(value.branchEndPoint, 'branchEndPoint');
  positiveNumber(value.hostLengthMm, 'hostLengthMm');
  positiveNumber(value.stationMm, 'stationMm');
  positiveNumber(value.componentLengthMm, 'componentLengthMm');
  positiveNumber(value.branchPipeLengthMm, 'branchPipeLengthMm');
  return value;
}

export function normalizeTopologyEditAuthoringBranchClocking(value) {
  return normalizedClocking(value);
}

function branchFamilyValue(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!TOPOLOGY_EDIT_AUTHORING_BRANCH_FAMILIES.includes(normalized)) {
    throw new RangeError(
      `TopologyEditAuthoringBranchGeometry: unsupported branch family ${normalized || '(empty)'}.`,
    );
  }
  return normalized;
}

function pointValue(value, field) {
  if (!value || typeof value !== 'object') {
    throw new TypeError(
      `TopologyEditAuthoringBranchGeometry: ${field} must be a point.`,
    );
  }
  return Object.freeze({
    x: finiteNumber(value.x, `${field}.x`),
    y: finiteNumber(value.y, `${field}.y`),
    z: finiteNumber(value.z, `${field}.z`),
  });
}

function positiveNumber(value, field) {
  const number = finiteNumber(value, field);
  if (!(number > EPSILON)) {
    throw new RangeError(
      `TopologyEditAuthoringBranchGeometry: ${field} must be positive.`,
    );
  }
  return number;
}

function finiteNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(
      `TopologyEditAuthoringBranchGeometry: ${field} must be finite.`,
    );
  }
  return Object.is(number, -0) ? 0 : number;
}

function normalizedClocking(value) {
  const number = finiteNumber(value ?? 0, 'clockingDeg');
  const normalized = ((number % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function leastAlignedGlobalAxis(axis) {
  return GLOBAL_AXES
    .map((candidate, index) => ({
      candidate,
      index,
      alignment: Math.abs(dot(axis, candidate)),
    }))
    .sort((left, right) => (
      left.alignment - right.alignment || left.index - right.index
    ))[0].candidate;
}

function add(left, right) {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  };
}

function subtract(left, right) {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

function scale(vector, scalar) {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
    z: vector.z * scalar,
  };
}

function dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function magnitude(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector) {
  const length = magnitude(vector);
  if (!(length > EPSILON)) {
    throw new RangeError(
      'TopologyEditAuthoringBranchGeometry: cannot normalize a zero vector.',
    );
  }
  return scale(vector, 1 / length);
}
