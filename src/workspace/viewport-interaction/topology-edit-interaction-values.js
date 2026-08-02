import { deepFreeze } from '../../core/shared-piping-model/index.js';

export function requiredTopologyEditText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} is required.`);
  return text;
}

export function normalizeTopologyEditUnits(value = 'MM') {
  const units = requiredTopologyEditText(value, 'units').toUpperCase();
  if (units !== 'MM') {
    throw new RangeError('Topology-edit interaction units must be MM.');
  }
  return units;
}

export function optionalTopologyEditText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

export function requiredCanonicalNodeId(value, label = 'nodeId') {
  const nodeId = requiredTopologyEditText(value, label);
  if (!/^node:[^\s]+$/.test(nodeId)) {
    throw new TypeError(`${label} must be an exact canonical node ID.`);
  }
  return nodeId;
}

export function finiteTopologyEditNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new RangeError(`${label} must be a finite number.`);
  }
  return Object.is(number, -0) ? 0 : number;
}

export function nonNegativeTopologyEditNumber(value, label) {
  const number = finiteTopologyEditNumber(value, label);
  if (number < 0) throw new RangeError(`${label} must be non-negative.`);
  return number;
}

export function positiveTopologyEditNumber(value, label) {
  const number = finiteTopologyEditNumber(value, label);
  if (number <= 0) throw new RangeError(`${label} must be positive.`);
  return number;
}

export function finiteTopologyEditPoint(value, label = 'point') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return deepFreeze({
    x: finiteTopologyEditNumber(value.x, `${label}.x`),
    y: finiteTopologyEditNumber(value.y, `${label}.y`),
    z: finiteTopologyEditNumber(value.z, `${label}.z`),
  });
}

export function addTopologyEditPoints(left, right) {
  const a = finiteTopologyEditPoint(left, 'left');
  const b = finiteTopologyEditPoint(right, 'right');
  return deepFreeze({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
}

export function subtractTopologyEditPoints(left, right) {
  const a = finiteTopologyEditPoint(left, 'left');
  const b = finiteTopologyEditPoint(right, 'right');
  return deepFreeze({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
}

export function topologyEditPointDistance(left, right) {
  const delta = subtractTopologyEditPoints(left, right);
  return Math.hypot(delta.x, delta.y, delta.z);
}

export function normalizeTopologyEditDirection(value, label = 'direction') {
  const direction = finiteTopologyEditPoint(value, label);
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!(length > 0)) throw new RangeError(`${label} must have non-zero length.`);
  return deepFreeze({
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  });
}

export function scaleTopologyEditPoint(value, scalar) {
  const point = finiteTopologyEditPoint(value, 'value');
  const factor = finiteTopologyEditNumber(scalar, 'scalar');
  return deepFreeze({
    x: point.x * factor,
    y: point.y * factor,
    z: point.z * factor,
  });
}
