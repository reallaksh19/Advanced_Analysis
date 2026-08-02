import { semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_SECTION_STATE_SCHEMA = 'TopologyEditSectionState.v1';
export const TOPOLOGY_EDIT_SECTION_BOX_SCHEMA = 'TopologyEditSectionBox.v1';

export const TOPOLOGY_EDIT_SECTION_ACTIONS = Object.freeze({
  SET_BOX: 'SET_SECTION_BOX',
  CLEAR: 'CLEAR_SECTION_BOX',
});

export function createTopologyEditSectionState(input = {}) {
  const box = input.box == null ? null : createTopologyEditSectionBox(input.box);
  const serializable = {
    schema: TOPOLOGY_EDIT_SECTION_STATE_SCHEMA,
    box,
  };
  return deepFreeze({
    ...serializable,
    sectionHash: semanticHash(serializable),
  });
}

export function createTopologyEditSectionBox(input = {}) {
  const min = finitePoint(input.min, 'min');
  const max = finitePoint(input.max, 'max');
  assertPositiveExtent(min, max);
  return deepFreeze({
    schema: TOPOLOGY_EDIT_SECTION_BOX_SCHEMA,
    coordinateSpace: 'ENGINEERING',
    min,
    max,
  });
}

export function reduceTopologyEditSectionState(state, action = {}) {
  assertSectionState(state);
  if (action.type === TOPOLOGY_EDIT_SECTION_ACTIONS.SET_BOX) {
    return createTopologyEditSectionState({ box: action.box });
  }
  if (action.type === TOPOLOGY_EDIT_SECTION_ACTIONS.CLEAR) {
    return createTopologyEditSectionState();
  }
  throw new Error(`Unknown topology-edit section action "${String(action.type)}".`);
}

export function topologyEditSectionBoxToPlaneEquations(sectionState) {
  assertSectionState(sectionState);
  if (!sectionState.box) return Object.freeze([]);
  const { min, max } = sectionState.box;
  return createTopologyEditSectionPlaneEquations([
    plane(1, 0, 0, -min.x),
    plane(-1, 0, 0, max.x),
    plane(0, 1, 0, -min.y),
    plane(0, -1, 0, max.y),
    plane(0, 0, 1, -min.z),
    plane(0, 0, -1, max.z),
  ]);
}

export function createTopologyEditSectionPlaneEquations(input = []) {
  if (!Array.isArray(input)) throw new TypeError('Section planes must be an array.');
  return deepFreeze(input.map((value, index) => normalizePlane(value, index)));
}

export function isEngineeringPointInsideSectionPlanes(
  pointInput,
  planes = [],
  tolerance = 1e-7,
) {
  const point = finitePoint(pointInput, 'point');
  const epsilon = finiteNonNegative(tolerance, 'tolerance');
  return planes.every(({ normal, constant }) => (
    normal.x * point.x + normal.y * point.y + normal.z * point.z + constant
  ) >= -epsilon);
}

export function topologyEditSectionSummary(state) {
  assertSectionState(state);
  return Object.freeze({
    active: Boolean(state.box),
    planeCount: state.box ? 6 : 0,
    coordinateSpace: state.box?.coordinateSpace || null,
  });
}

function normalizePlane(input, index) {
  const normal = finitePoint(input?.normal, `planes[${index}].normal`);
  const magnitude = Math.hypot(normal.x, normal.y, normal.z);
  if (magnitude <= Number.EPSILON) {
    throw new RangeError(`planes[${index}].normal must be non-zero.`);
  }
  const constant = finiteNumber(input?.constant, `planes[${index}].constant`);
  return {
    normal: {
      x: normal.x / magnitude,
      y: normal.y / magnitude,
      z: normal.z / magnitude,
    },
    constant: constant / magnitude,
  };
}

function plane(x, y, z, constant) {
  return { normal: { x, y, z }, constant };
}

function assertPositiveExtent(min, max) {
  ['x', 'y', 'z'].forEach((axis) => {
    if (max[axis] <= min[axis]) {
      throw new RangeError(`Section max.${axis} must be greater than min.${axis}.`);
    }
  });
}

function finitePoint(input, name) {
  if (!input || typeof input !== 'object') throw new TypeError(`${name} is required.`);
  return Object.freeze({
    x: finiteNumber(input.x, `${name}.x`),
    y: finiteNumber(input.y, `${name}.y`),
    z: finiteNumber(input.z, `${name}.z`),
  });
}

function finiteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} must be finite.`);
  return number;
}

function finiteNonNegative(value, name) {
  const number = finiteNumber(value, name);
  if (number < 0) throw new RangeError(`${name} must be non-negative.`);
  return number;
}

function assertSectionState(state) {
  if (state?.schema !== TOPOLOGY_EDIT_SECTION_STATE_SCHEMA) {
    throw new TypeError('A valid topology-edit section state is required.');
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
