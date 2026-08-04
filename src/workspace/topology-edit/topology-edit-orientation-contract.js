import { deepFreeze } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_ORIENTATION_SCHEMA = 'TopologyEditOrientationSnapshot.v1';
export const TOPOLOGY_EDIT_ORIENTATION_ERROR = 'TOPOLOGY_EDIT_ORIENTATION_INVALID';

const ALIGNMENT_DOT_THRESHOLD = 0.985;
const FACE_ROWS = deepFreeze([
  { id: 'top', action: 'top', label: 'Top', direction: { x: 0, y: 1, z: 0 } },
  { id: 'bottom', action: 'bottom', label: 'Bottom', direction: { x: 0, y: -1, z: 0 } },
  { id: 'front', action: 'front', label: 'Front', direction: { x: 0, y: 0, z: 1 } },
  { id: 'back', action: 'back', label: 'Back', direction: { x: 0, y: 0, z: -1 } },
  { id: 'left', action: 'left', label: 'Left', direction: { x: -1, y: 0, z: 0 } },
  { id: 'right', action: 'right', label: 'Right', direction: { x: 1, y: 0, z: 0 } },
]);
const ISO_DIRECTION = Object.freeze(unit({ x: 1, y: 1, z: 1 }));

export function topologyEditOrientationFaceManifest() {
  return FACE_ROWS;
}

export function createTopologyEditOrientationSnapshot(input = {}) {
  const quaternion = normalizeQuaternion(input.quaternion);
  const cameraDirection = normalizeDirection(input.cameraDirection, 'CAMERA_DIRECTION_INVALID');
  const projection = normalizeProjection(input.projection);
  const orientation = classifyDirection(cameraDirection);
  const material = {
    schema: TOPOLOGY_EDIT_ORIENTATION_SCHEMA,
    projection,
    engineeringBasis: 'RIGHT_HANDED_Z_UP',
    renderBasis: 'RIGHT_HANDED_Y_UP',
    quaternion,
    cameraDirection,
    cubeTransform: quaternionToCssMatrix(quaternion),
    nearestFace: orientation.nearestFace,
    activeFace: orientation.activeFace,
    isoActive: orientation.isoActive,
  };
  return deepFreeze(material);
}

export function assertTopologyEditOrientationSnapshot(value) {
  if (value?.schema !== TOPOLOGY_EDIT_ORIENTATION_SCHEMA) {
    throw orientationError('Orientation snapshot schema is invalid.', 'SNAPSHOT_SCHEMA_INVALID');
  }
  return createTopologyEditOrientationSnapshot(value);
}

export function quaternionToCssMatrix(value) {
  const q = normalizeQuaternion(value);
  const x = -q.x;
  const y = -q.y;
  const z = -q.z;
  const w = q.w;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  const rows = [
    [1 - (2 * (yy + zz)), 2 * (xy - wz), 2 * (xz + wy)],
    [2 * (xy + wz), 1 - (2 * (xx + zz)), 2 * (yz - wx)],
    [2 * (xz - wy), 2 * (yz + wx), 1 - (2 * (xx + yy))],
  ].map((row) => row.map(cleanNumber));
  const values = [
    rows[0][0], rows[1][0], rows[2][0], 0,
    rows[0][1], rows[1][1], rows[2][1], 0,
    rows[0][2], rows[1][2], rows[2][2], 0,
    0, 0, 0, 1,
  ];
  if (!values.every(Number.isFinite)) {
    throw orientationError('Cube transform contains a non-finite value.', 'CUBE_MATRIX_INVALID');
  }
  return `matrix3d(${values.map(formatNumber).join(',')})`;
}

export function classifyTopologyEditOrientation(directionInput) {
  return deepFreeze(classifyDirection(normalizeDirection(
    directionInput,
    'CAMERA_DIRECTION_INVALID',
  )));
}

function classifyDirection(direction) {
  const ranked = FACE_ROWS
    .map((face) => ({ id: face.id, score: dot(direction, face.direction) }))
    .sort((left, right) => right.score - left.score || compareCodeUnits(left.id, right.id));
  const nearest = ranked[0];
  const isoScore = dot(direction, ISO_DIRECTION);
  return {
    nearestFace: nearest.id,
    activeFace: nearest.score >= ALIGNMENT_DOT_THRESHOLD ? nearest.id : null,
    isoActive: isoScore >= ALIGNMENT_DOT_THRESHOLD,
  };
}

function normalizeQuaternion(value) {
  if (!value || ![value.x, value.y, value.z, value.w].every(finiteNumber)) {
    throw orientationError('A finite camera quaternion is required.', 'CAMERA_QUATERNION_INVALID');
  }
  const length = Math.hypot(value.x, value.y, value.z, value.w);
  if (!(length > 1e-12)) {
    throw orientationError('Camera quaternion must be non-degenerate.', 'CAMERA_QUATERNION_DEGENERATE');
  }
  return {
    x: cleanNumber(value.x / length),
    y: cleanNumber(value.y / length),
    z: cleanNumber(value.z / length),
    w: cleanNumber(value.w / length),
  };
}

function normalizeDirection(value, detailCode) {
  if (!value || ![value.x, value.y, value.z].every(finiteNumber)) {
    throw orientationError('A finite camera direction is required.', detailCode);
  }
  const normalized = unit(value);
  if (!normalized) throw orientationError('Camera direction must be non-degenerate.', detailCode);
  return normalized;
}

function normalizeProjection(value) {
  const projection = String(value || '').trim().toUpperCase();
  if (!['PERSPECTIVE', 'ORTHOGRAPHIC'].includes(projection)) {
    throw orientationError('Projection must be PERSPECTIVE or ORTHOGRAPHIC.', 'PROJECTION_INVALID');
  }
  return projection;
}

function unit(value) {
  const length = Math.hypot(value.x, value.y, value.z);
  return length > 1e-12 ? {
    x: cleanNumber(value.x / length),
    y: cleanNumber(value.y / length),
    z: cleanNumber(value.z / length),
  } : null;
}

function dot(left, right) {
  return (left.x * right.x) + (left.y * right.y) + (left.z * right.z);
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function cleanNumber(value) {
  const number = Number(value);
  if (Object.is(number, -0) || Math.abs(number) < 1e-15) return 0;
  return number;
}

function formatNumber(value) {
  return cleanNumber(value).toFixed(12).replace(/\.?0+$/u, '') || '0';
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function orientationError(message, detailCode) {
  const error = new Error(`${TOPOLOGY_EDIT_ORIENTATION_ERROR}: ${message}`);
  error.code = TOPOLOGY_EDIT_ORIENTATION_ERROR;
  error.detailCode = detailCode;
  return error;
}
