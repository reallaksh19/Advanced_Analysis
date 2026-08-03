import * as THREE from 'three';

export const TOPOLOGY_EDIT_PRIMITIVE_GEOMETRY_ERROR = 'TOPOLOGY_EDIT_PRIMITIVE_GEOMETRY_INVALID';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const MIN_LENGTH = 1e-9;
const DIRECTION_TOLERANCE = 1e-9;

export class TopologyEditPrimitiveGeometryError extends Error {
  constructor(message, detailCode) {
    super(`${TOPOLOGY_EDIT_PRIMITIVE_GEOMETRY_ERROR}: ${message}`);
    this.name = 'TopologyEditPrimitiveGeometryError';
    this.code = TOPOLOGY_EDIT_PRIMITIVE_GEOMETRY_ERROR;
    this.detailCode = detailCode;
  }
}

export function materializeTopologyEditPrimitive(primitiveValue, options = {}) {
  const primitive = objectRecord(primitiveValue, 'PRIMITIVE_RECORD_MISSING');
  const kind = requiredToken(primitive.kind, 'PRIMITIVE_KIND_MISSING');
  const parameters = objectRecord(primitive.parameters, 'PARAMETERS_MISSING');
  const material = options.material;
  if (!material?.isMaterial) fail('A governed Three.js material is required.', 'MATERIAL_MISSING');
  const radialSegments = integerAtLeast(options.radialSegments, 8, 'RADIAL_SEGMENTS_INVALID');
  const markerSize = positive(options.markerSize, 'MARKER_SIZE_INVALID');
  const pickUserData = objectRecord(options.pickUserData, 'PICK_IDENTITY_MISSING');
  const group = new THREE.Group();
  group.name = `topology-edit-primitive:${primitive.primitiveId || primitive.canonicalEntityId || kind}`;
  group.userData = {
    primitiveId: String(primitive.primitiveId || ''),
    primitiveKind: kind,
    canonicalEntityId: String(primitive.canonicalEntityId || ''),
    partRole: String(primitive.partRole || 'body'),
  };
  const context = {
    group,
    material,
    radialSegments,
    markerSize,
    pickUserData,
    primitive,
    parameters,
  };
  const builder = BUILDERS[kind];
  if (!builder) fail(`Unsupported primitive kind ${kind}.`, 'PRIMITIVE_KIND_UNSUPPORTED');
  builder(context);
  if (!group.children.length) fail(`Primitive ${kind} produced no geometry.`, 'EMPTY_GEOMETRY');
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  if (bounds.isEmpty() || !finiteBox(bounds)) {
    fail(`Primitive ${kind} produced invalid bounds.`, 'BOUNDS_INVALID');
  }
  return { object: group, bounds };
}

const BUILDERS = {
  PIPE_CYLINDER: (context) => {
    const p = context.parameters;
    addCylinder(context, point(p.start), point(p.end), diameter(p.outsideDiameterMm) / 2);
  },
  ELBOW_ARC: (context) => {
    const p = context.parameters;
    const points = pointArray(p.arcPoints, 2);
    const radius = diameter(p.outsideDiameterMm) / 2;
    const segments = integerAtLeast(p.segmentCount, points.length - 1, 'ELBOW_SEGMENT_COUNT_INVALID');
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    addMesh(
      context,
      new THREE.TubeGeometry(curve, segments, radius, context.radialSegments, false),
    );
  },
  CONICAL_REDUCER: (context) => addReducer(context, context.parameters),
  ECCENTRIC_REDUCER: (context) => addReducer(context, context.parameters),
  TEE_JUNCTION: (context) => addTee(context, context.parameters),
  OLET_BRANCH: (context) => addOlet(context, context.parameters),
  FLANGE_DISC: (context) => addFlange(context, context.parameters),
  VALVE_BODY: (context) => addValve(context, context.parameters),
  GASKET_DISC: (context) => {
    const p = context.parameters;
    addCylinder(context, point(p.start), point(p.end), diameter(p.outsideDiameterMm) / 2);
  },
  INSTRUMENT_MARKER: (context) => addInstrument(context, context.parameters),
  JUNCTION_MARKER: (context) => {
    const position = point(context.parameters.position);
    addMesh(
      context,
      new THREE.SphereGeometry(
        context.markerSize,
        context.radialSegments,
        Math.max(6, Math.floor(context.radialSegments * 0.75)),
      ),
      position,
    );
  },
  DIAGNOSTIC_CENTERLINE: (context) => {
    const p = context.parameters;
    const radius = positive(p.radiusMm, 'DIAGNOSTIC_RADIUS_INVALID');
    if (Array.isArray(p.arcPoints) && p.arcPoints.length >= 2) {
      const points = pointArray(p.arcPoints, 2);
      addMesh(
        context,
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points, false, 'centripetal'),
          points.length - 1,
          radius,
          context.radialSegments,
          false,
        ),
      );
      return;
    }
    addCylinder(context, point(p.start), point(p.end), radius);
  },
};

function addReducer(context, parameters) {
  addCylinder(
    context,
    point(parameters.start),
    point(parameters.end),
    diameter(parameters.startOutsideDiameterMm) / 2,
    diameter(parameters.endOutsideDiameterMm) / 2,
  );
}

function addTee(context, parameters) {
  const center = point(parameters.center);
  const runEnds = exactPointArray(parameters.runEnds, 2, 'TEE_RUN_ENDS_INVALID');
  const branchEnd = point(parameters.branchEnd);
  const runDirections = exactDirectionArray(
    parameters.runDirections,
    2,
    'TEE_RUN_DIRECTIONS_INVALID',
  );
  const branchDirection = direction(parameters.branchDirection);
  runEnds.forEach((end, index) => {
    assertDirection(center, end, runDirections[index], 'TEE_RUN_DIRECTION_MISMATCH');
  });
  assertDirection(center, branchEnd, branchDirection, 'TEE_BRANCH_DIRECTION_MISMATCH');
  const runRadius = diameter(parameters.runOutsideDiameterMm) / 2;
  const branchRadius = diameter(parameters.branchOutsideDiameterMm) / 2;
  runEnds.forEach((end) => addCylinder(context, center, end, runRadius));
  addCylinder(context, center, branchEnd, branchRadius);
}

function addOlet(context, parameters) {
  const center = point(parameters.center);
  const branchEnd = point(parameters.branchEnd);
  const branchDirection = direction(parameters.branchDirection);
  assertDirection(center, branchEnd, branchDirection, 'OLET_BRANCH_DIRECTION_MISMATCH');
  const branchRadius = diameter(parameters.branchOutsideDiameterMm) / 2;
  addCylinder(context, center, branchEnd, branchRadius);
  addMesh(
    context,
    new THREE.SphereGeometry(
      branchRadius,
      context.radialSegments,
      Math.max(6, Math.floor(context.radialSegments * 0.75)),
    ),
    center,
  );
}

function addFlange(context, parameters) {
  addCylinder(
    context,
    point(parameters.start),
    point(parameters.end),
    diameter(parameters.outsideDiameterMm) / 2,
  );
}

function addValve(context, parameters) {
  const start = point(parameters.start);
  const end = point(parameters.end);
  const center = point(parameters.center);
  const radius = diameter(parameters.outsideDiameterMm) / 2;
  addCylinder(context, start, center, radius);
  addCylinder(context, center, end, radius);
  addMesh(
    context,
    new THREE.SphereGeometry(
      radius,
      context.radialSegments,
      Math.max(6, Math.floor(context.radialSegments * 0.75)),
    ),
    center,
  );
}

function addInstrument(context, parameters) {
  const start = point(parameters.start);
  const end = point(parameters.end);
  const center = point(parameters.center);
  const radius = diameter(parameters.outsideDiameterMm) / 2;
  addCylinder(context, start, end, radius);
  addMesh(context, new THREE.IcosahedronGeometry(radius, 1), center);
}

function addCylinder(context, start, end, startRadius, endRadius = startRadius) {
  const acceptedStartRadius = positive(startRadius, 'START_RADIUS_INVALID');
  const acceptedEndRadius = positive(endRadius, 'END_RADIUS_INVALID');
  const axis = end.clone().sub(start);
  const length = axis.length();
  if (!(length > MIN_LENGTH)) fail('Cylinder endpoints must be distinct.', 'ZERO_LENGTH_AXIS');
  const geometry = new THREE.CylinderGeometry(
    acceptedEndRadius,
    acceptedStartRadius,
    length,
    context.radialSegments,
  );
  const position = start.clone().add(end).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, axis.normalize());
  return addMesh(context, geometry, position, quaternion);
}

function addMesh(context, geometry, position = null, quaternion = null) {
  const mesh = new THREE.Mesh(geometry, context.material);
  if (position) mesh.position.copy(position);
  if (quaternion) mesh.quaternion.copy(quaternion);
  applyPick(mesh, context);
  context.group.add(mesh);
  return mesh;
}

function applyPick(object, context) {
  object.userData = {
    ...context.pickUserData,
    primitiveId: String(context.primitive.primitiveId || ''),
    primitiveKind: String(context.primitive.kind || ''),
    partRole: String(context.primitive.partRole || 'body'),
  };
}

function point(value) {
  if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) {
    fail('A finite point is required.', 'POINT_INVALID');
  }
  return new THREE.Vector3(value.x, value.y, value.z);
}

function pointArray(value, minimum) {
  if (!Array.isArray(value) || value.length < minimum) {
    fail(`At least ${minimum} points are required.`, 'POINT_ARRAY_INVALID');
  }
  return value.map(point);
}

function exactPointArray(value, count, code) {
  if (!Array.isArray(value) || value.length !== count) {
    fail(`Exactly ${count} points are required.`, code);
  }
  return value.map(point);
}

function direction(value) {
  const vector = point(value);
  const length = vector.length();
  if (!(length > MIN_LENGTH)) fail('A non-zero direction is required.', 'DIRECTION_INVALID');
  return vector.multiplyScalar(1 / length);
}

function exactDirectionArray(value, count, code) {
  if (!Array.isArray(value) || value.length !== count) {
    fail(`Exactly ${count} directions are required.`, code);
  }
  return value.map(direction);
}

function assertDirection(start, end, declaredDirection, code) {
  const axis = end.clone().sub(start);
  const length = axis.length();
  if (!(length > MIN_LENGTH)) fail('Placement endpoints must be distinct.', 'ZERO_LENGTH_AXIS');
  const alignment = axis.multiplyScalar(1 / length).dot(declaredDirection);
  if (Math.abs(1 - alignment) > DIRECTION_TOLERANCE) {
    fail('Declared direction conflicts with governed placement endpoints.', code);
  }
}

function diameter(value) {
  return positive(value, 'DIAMETER_INVALID');
}

function positive(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    fail('A positive finite value is required.', code);
  }
  return number;
}

function integerAtLeast(value, minimum, code = 'INTEGER_INVALID') {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    fail(`An integer of at least ${minimum} is required.`, code);
  }
  return number;
}

function requiredToken(value, code) {
  const token = String(value || '').trim().toUpperCase();
  if (!token) fail('A non-empty token is required.', code);
  return token;
}

function objectRecord(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('An object record is required.', code);
  }
  return value;
}

function finiteBox(box) {
  return [
    box.min.x,
    box.min.y,
    box.min.z,
    box.max.x,
    box.max.y,
    box.max.z,
  ].every(Number.isFinite);
}

function fail(message, code) {
  throw new TopologyEditPrimitiveGeometryError(message, code);
}
