import { deepFreeze } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_COORDINATE_TRANSFORM = 'TopologyEditCoordinateTransform.v1';
export const TOPOLOGY_EDIT_COORDINATE_REJECTION = deepFreeze({
  INVALID_POINT: 'TOPOLOGY_EDIT_COORDINATE_INVALID_POINT',
  INVALID_VECTOR: 'TOPOLOGY_EDIT_COORDINATE_INVALID_VECTOR',
  INVALID_DIRECTION: 'TOPOLOGY_EDIT_COORDINATE_INVALID_DIRECTION',
  INVALID_PLANE: 'TOPOLOGY_EDIT_COORDINATE_INVALID_PLANE',
  INVALID_BOUNDS: 'TOPOLOGY_EDIT_COORDINATE_INVALID_BOUNDS',
  UNSUPPORTED_TRANSFORM: 'TOPOLOGY_EDIT_COORDINATE_TRANSFORM_UNSUPPORTED',
});

/** Row-major matrix for p_render = T * p_engineering. */
export const ENGINEERING_TO_RENDER_MATRIX3 = deepFreeze([
  [1, 0, 0],
  [0, 0, 1],
  [0, -1, 0],
]);

/** Row-major inverse matrix for p_engineering = T^-1 * p_render. */
export const RENDER_TO_ENGINEERING_MATRIX3 = deepFreeze([
  [1, 0, 0],
  [0, 0, -1],
  [0, 1, 0],
]);

/** Column-major elements consumable by THREE.Matrix4.fromArray(). */
export const ENGINEERING_TO_RENDER_MATRIX4_ELEMENTS = deepFreeze([
  1, 0, 0, 0,
  0, 0, -1, 0,
  0, 1, 0, 0,
  0, 0, 0, 1,
]);

export function engineeringPointToRender(point) {
  const value = finiteTuple(point, 'point', TOPOLOGY_EDIT_COORDINATE_REJECTION.INVALID_POINT);
  return deepFreeze({ x: value.x, y: value.z, z: -value.y });
}

export function renderPointToEngineering(point) {
  const value = finiteTuple(point, 'point', TOPOLOGY_EDIT_COORDINATE_REJECTION.INVALID_POINT);
  return deepFreeze({ x: value.x, y: -value.z, z: value.y });
}

export function engineeringVectorToRender(vector) {
  const value = finiteTuple(vector, 'vector', TOPOLOGY_EDIT_COORDINATE_REJECTION.INVALID_VECTOR);
  return deepFreeze({ x: value.x, y: value.z, z: -value.y });
}

export function renderVectorToEngineering(vector) {
  const value = finiteTuple(vector, 'vector', TOPOLOGY_EDIT_COORDINATE_REJECTION.INVALID_VECTOR);
  return deepFreeze({ x: value.x, y: -value.z, z: value.y });
}

export function engineeringDirectionToRender(direction) {
  return normalized(engineeringVectorToRender(direction), 'direction');
}

export function renderDirectionToEngineering(direction) {
  return normalized(renderVectorToEngineering(direction), 'direction');
}

export function engineeringNormalToRender(normal) {
  return normalized(engineeringVectorToRender(normal), 'normal');
}

export function renderNormalToEngineering(normal) {
  return normalized(renderVectorToEngineering(normal), 'normal');
}

export function engineeringPlaneToRender(plane) {
  const source = finitePlane(plane);
  const mapped = engineeringVectorToRender(source.normal);
  const magnitude = vectorMagnitude(mapped);
  if (!(magnitude > Number.EPSILON)) {
    throw rejection(
      TOPOLOGY_EDIT_COORDINATE_REJECTION.INVALID_PLANE,
      'Topology edit section-plane normal must be non-zero.',
    );
  }
  return deepFreeze({
    normal: {
      x: mapped.x / magnitude,
      y: mapped.y / magnitude,
      z: mapped.z / magnitude,
    },
    constant: source.constant / magnitude,
  });
}

export function renderPlaneToEngineering(plane) {
  const source = finitePlane(plane);
  const mapped = renderVectorToEngineering(source.normal);
  const magnitude = vectorMagnitude(mapped);
  if (!(magnitude > Number.EPSILON)) {
    throw rejection(
      TOPOLOGY_EDIT_COORDINATE_REJECTION.INVALID_PLANE,
      'Topology edit section-plane normal must be non-zero.',
    );
  }
  return deepFreeze({
    normal: {
      x: mapped.x / magnitude,
      y: mapped.y / magnitude,
      z: mapped.z / magnitude,
    },
    constant: source.constant / magnitude,
  });
}

export function engineeringBoundsToRender(bounds) {
  const source = finiteBounds(bounds);
  const transformed = boundsCorners(source).map(engineeringPointToRender);
  return deepFreeze(boundsFromPoints(transformed));
}

export function renderBoundsToEngineering(bounds) {
  const source = finiteBounds(bounds);
  const transformed = boundsCorners(source).map(renderPointToEngineering);
  return deepFreeze(boundsFromPoints(transformed));
}

export function assertTopologyEditCoordinateTransform(tolerance = 1e-12) {
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw rejection(
      TOPOLOGY_EDIT_COORDINATE_REJECTION.UNSUPPORTED_TRANSFORM,
      'Topology edit coordinate-transform tolerance must be finite and non-negative.',
    );
  }
  const basis = [
    [{ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
    [{ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }],
    [{ x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }],
  ];
  for (const [source, expected] of basis) {
    const actual = engineeringVectorToRender(source);
    if (!sameTuple(actual, expected, tolerance)) {
      throw rejection(
        TOPOLOGY_EDIT_COORDINATE_REJECTION.UNSUPPORTED_TRANSFORM,
        'Topology edit coordinate transform does not match the approved X,Y,Z to X,Z,-Y basis.',
      );
    }
  }
  const determinant = determinant3(ENGINEERING_TO_RENDER_MATRIX3);
  if (Math.abs(determinant - 1) > tolerance) {
    throw rejection(
      TOPOLOGY_EDIT_COORDINATE_REJECTION.UNSUPPORTED_TRANSFORM,
      'Topology edit coordinate transform must be a proper right-handed rotation.',
    );
  }
  const probe = { x: 13.25, y: -7.5, z: 101.125 };
  if (!sameTuple(renderPointToEngineering(engineeringPointToRender(probe)), probe, tolerance)) {
    throw rejection(
      TOPOLOGY_EDIT_COORDINATE_REJECTION.UNSUPPORTED_TRANSFORM,
      'Topology edit coordinate transform is not reversible.',
    );
  }
  return deepFreeze({
    schema: TOPOLOGY_EDIT_COORDINATE_TRANSFORM,
    determinant,
    sourceBasis: ['x', 'y', 'z'],
    renderBasis: ['x', 'z', '-y'],
    reversible: true,
    rightHanded: true,
  });
}

function finiteTuple(value, name, code) {
  if (!value || typeof value !== 'object') {
    throw rejection(code, `Topology edit ${name} is required.`);
  }
  const tuple = { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
  if (![tuple.x, tuple.y, tuple.z].every(Number.isFinite)) {
    throw rejection(code, `Topology edit ${name} coordinates must be finite.`);
  }
  return tuple;
}

function finitePlane(value) {
  if (!value || typeof value !== 'object') {
    throw rejection(
      TOPOLOGY_EDIT_COORDINATE_REJECTION.INVALID_PLANE,
      'Topology edit section plane is required.',
    );
  }
  const normal = finiteTuple(
    value.normal,
    'section-plane normal',
    TOPOLOGY_EDIT_COORDINATE_REJECTION.INVALID_PLANE,
  );
  const constant = Number(value.constant);
  if (!Number.isFinite(constant)) {
    throw rejection(
      TOPOLOGY_EDIT_COORDINATE_REJECTION.INVALID_PLANE,
      'Topology edit section-plane constant must be finite.',
    );
  }
  return { normal, constant };
}

function finiteBounds(value) {
  if (!value || typeof value !== 'object') {
    throw rejection(
      TOPOLOGY_EDIT_COORDINATE_REJECTION.INVALID_BOUNDS,
      'Topology edit bounds are required.',
    );
  }
  const min = finiteTuple(
    value.min,
    'bounds minimum',
    TOPOLOGY_EDIT_COORDINATE_REJECTION.INVALID_BOUNDS,
  );
  const max = finiteTuple(
    value.max,
    'bounds maximum',
    TOPOLOGY_EDIT_COORDINATE_REJECTION.INVALID_BOUNDS,
  );
  for (const axis of ['x', 'y', 'z']) {
    if (max[axis] < min[axis]) {
      throw rejection(
        TOPOLOGY_EDIT_COORDINATE_REJECTION.INVALID_BOUNDS,
        `Topology edit bounds maximum ${axis} must not be less than minimum ${axis}.`,
      );
    }
  }
  return { min, max };
}

function boundsCorners(bounds) {
  const { min, max } = bounds;
  return [
    { x: min.x, y: min.y, z: min.z },
    { x: min.x, y: min.y, z: max.z },
    { x: min.x, y: max.y, z: min.z },
    { x: min.x, y: max.y, z: max.z },
    { x: max.x, y: min.y, z: min.z },
    { x: max.x, y: min.y, z: max.z },
    { x: max.x, y: max.y, z: min.z },
    { x: max.x, y: max.y, z: max.z },
  ];
}

function boundsFromPoints(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const zs = points.map((point) => point.z);
  return {
    min: { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) },
    max: { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) },
  };
}

function normalized(value, name) {
  const magnitude = vectorMagnitude(value);
  if (!(magnitude > Number.EPSILON)) {
    throw rejection(
      TOPOLOGY_EDIT_COORDINATE_REJECTION.INVALID_DIRECTION,
      `Topology edit ${name} must be non-zero.`,
    );
  }
  return deepFreeze({
    x: value.x / magnitude,
    y: value.y / magnitude,
    z: value.z / magnitude,
  });
}

function vectorMagnitude(value) {
  return Math.hypot(value.x, value.y, value.z);
}

function determinant3(matrix) {
  const [a, b, c] = matrix;
  return a[0] * ((b[1] * c[2]) - (b[2] * c[1]))
    - a[1] * ((b[0] * c[2]) - (b[2] * c[0]))
    + a[2] * ((b[0] * c[1]) - (b[1] * c[0]));
}

function sameTuple(left, right, tolerance) {
  return ['x', 'y', 'z'].every((axis) => Math.abs(left[axis] - right[axis]) <= tolerance);
}

function rejection(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}
