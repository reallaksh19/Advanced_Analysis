import * as THREE from 'three';

export const TOPOLOGY_EDIT_PRIMITIVE_GEOMETRY_ERROR = 'TOPOLOGY_EDIT_PRIMITIVE_GEOMETRY_INVALID';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const MIN_LENGTH = 1e-9;
const DIRECTION_TOLERANCE = 1e-9;
const PLANE_TOLERANCE_MM = 1e-7;

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
  ELBOW_ARC: (context) => addElbow(context, context.parameters),
  CONICAL_REDUCER: (context) => addReducer(context, context.parameters, false),
  ECCENTRIC_REDUCER: (context) => addReducer(context, context.parameters, true),
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
          new PiecewiseLinearCurve3(points),
          Math.max(points.length - 1, 1),
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

function addElbow(context, parameters) {
  const start = point(parameters.start);
  const end = point(parameters.end);
  const center = point(parameters.center);
  const normal = direction(parameters.bendPlaneNormal);
  const radius = positive(parameters.centerlineRadiusMm, 'ELBOW_CENTERLINE_RADIUS_INVALID');
  const outsideRadius = diameter(parameters.outsideDiameterMm) / 2;
  const angleRad = positive(parameters.angleRad, 'ELBOW_ANGLE_INVALID');
  const segmentCount = integerAtLeast(
    parameters.segmentCount,
    3,
    'ELBOW_SEGMENT_COUNT_INVALID',
  );
  const startRadial = start.clone().sub(center);
  const endRadial = end.clone().sub(center);
  if (Math.abs(startRadial.length() - radius) > PLANE_TOLERANCE_MM
    || Math.abs(endRadial.length() - radius) > PLANE_TOLERANCE_MM) {
    fail('Elbow endpoints do not lie on the governed centerline radius.', 'ELBOW_RADIUS_MISMATCH');
  }
  const planeError = Math.max(
    Math.abs(startRadial.dot(normal)),
    Math.abs(endRadial.dot(normal)),
  );
  if (planeError > PLANE_TOLERANCE_MM) {
    fail('Elbow endpoints do not lie in the governed bend plane.', 'ELBOW_PLANE_MISMATCH');
  }
  const curve = new CircularArcCurve3(center, startRadial, normal, angleRad);
  if (curve.getPoint(1).distanceTo(end) > PLANE_TOLERANCE_MM) {
    fail('Elbow sweep does not terminate at the governed endpoint.', 'ELBOW_SWEEP_MISMATCH');
  }
  const geometry = new THREE.TubeGeometry(
    curve,
    segmentCount,
    outsideRadius,
    context.radialSegments,
    false,
  );
  geometry.userData.centerlineKind = 'EXACT_CIRCULAR_ARC';
  geometry.userData.centerlineRadiusMm = radius;
  geometry.userData.sweepAngleRad = angleRad;
  addMesh(context, geometry);
}

function addReducer(context, parameters, eccentric) {
  const start = point(parameters.start);
  const end = point(parameters.end);
  const startRadius = diameter(parameters.startOutsideDiameterMm) / 2;
  const endRadius = diameter(parameters.endOutsideDiameterMm) / 2;
  if (!eccentric) {
    addCylinder(context, start, end, startRadius, endRadius);
    return;
  }
  const sourceEnd = point(parameters.sourceEnd);
  const geometry = eccentricReducerGeometry(
    start,
    end,
    sourceEnd,
    startRadius,
    endRadius,
    context.radialSegments,
  );
  geometry.type = 'CylinderGeometry';
  geometry.userData.reducerProfile = 'ECCENTRIC_OFFSET_FRUSTUM';
  geometry.userData.sectionVertexCount = context.radialSegments;
  geometry.userData.sectionPlaneAxis = sourceEnd.clone().sub(start).normalize().toArray();
  addMesh(context, geometry);
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
  const branchLength = center.distanceTo(branchEnd);
  addCylinder(context, center, branchEnd, branchRadius);
  const transitionLength = Math.min(branchLength * 0.35, branchRadius * 1.1);
  if (!(transitionLength > MIN_LENGTH)) {
    fail('Olet branch transition length is degenerate.', 'OLET_TRANSITION_LENGTH_INVALID');
  }
  const transitionEnd = center.clone().addScaledVector(branchDirection, transitionLength);
  addCylinder(context, center, transitionEnd, branchRadius * 1.45, branchRadius);
}

function addFlange(context, parameters) {
  const start = point(parameters.start);
  const end = point(parameters.end);
  const outsideRadius = diameter(parameters.outsideDiameterMm) / 2;
  const placement = axisPlacement(start, end);
  const discThickness = Math.min(placement.length * 0.42, outsideRadius * 0.42);
  const faceStart = placement.length / 2 - discThickness;
  const hubRadius = outsideRadius * 0.58;
  const neckRadius = outsideRadius * 0.38;
  const profile = [
    new THREE.Vector2(0, -placement.length / 2),
    new THREE.Vector2(neckRadius, -placement.length / 2),
    new THREE.Vector2(hubRadius, faceStart),
    new THREE.Vector2(outsideRadius, faceStart),
    new THREE.Vector2(outsideRadius, placement.length / 2),
    new THREE.Vector2(0, placement.length / 2),
  ];
  const geometry = new THREE.LatheGeometry(profile, context.radialSegments);
  geometry.userData.flangeProfile = 'HUB_AND_DISC';
  addMesh(context, geometry, placement.position, placement.quaternion);
}

function addValve(context, parameters) {
  const start = point(parameters.start);
  const end = point(parameters.end);
  const center = point(parameters.center);
  const radius = diameter(parameters.outsideDiameterMm) / 2;
  const axis = end.clone().sub(start);
  const length = axis.length();
  if (!(length > MIN_LENGTH)) fail('Valve endpoints must be distinct.', 'VALVE_AXIS_INVALID');
  axis.multiplyScalar(1 / length);
  const bodyHalfLength = Math.min(length * 0.24, radius * 0.9);
  const bodyStart = center.clone().addScaledVector(axis, -bodyHalfLength);
  const bodyEnd = center.clone().addScaledVector(axis, bodyHalfLength);
  addCylinder(context, start, bodyStart, radius * 0.74);
  addCylinder(context, bodyEnd, end, radius * 0.74);
  const bodyGeometry = new THREE.SphereGeometry(
    radius,
    context.radialSegments,
    Math.max(6, Math.floor(context.radialSegments * 0.75)),
  );
  bodyGeometry.scale(1.22, Math.max(bodyHalfLength / radius, 0.72), 1.05);
  bodyGeometry.userData.valveBodyProfile = 'BULGED_INLINE_BODY';
  addMesh(
    context,
    bodyGeometry,
    center,
    new THREE.Quaternion().setFromUnitVectors(Y_AXIS, axis),
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

function eccentricReducerGeometry(
  start,
  endCenter,
  sourceEnd,
  startRadius,
  endRadius,
  radialSegments,
) {
  const axis = sourceEnd.clone().sub(start);
  const length = axis.length();
  if (!(length > MIN_LENGTH)) {
    fail('Eccentric reducer source endpoints must be distinct.', 'ECCENTRIC_SOURCE_AXIS_INVALID');
  }
  axis.multiplyScalar(1 / length);
  const centerOffset = endCenter.clone().sub(sourceEnd);
  if (Math.abs(centerOffset.dot(axis)) > PLANE_TOLERANCE_MM) {
    fail(
      'Eccentric reducer end-center offset must lie in the end-face plane.',
      'ECCENTRIC_END_PLANE_MISMATCH',
    );
  }
  const basisU = stablePerpendicular(axis);
  const basisV = new THREE.Vector3().crossVectors(axis, basisU).normalize();
  const positions = [];
  const indices = [];
  for (let index = 0; index < radialSegments; index += 1) {
    const angle = (index / radialSegments) * Math.PI * 2;
    const radial = basisU.clone().multiplyScalar(Math.cos(angle))
      .addScaledVector(basisV, Math.sin(angle));
    positions.push(...start.clone().addScaledVector(radial, startRadius).toArray());
  }
  for (let index = 0; index < radialSegments; index += 1) {
    const angle = (index / radialSegments) * Math.PI * 2;
    const radial = basisU.clone().multiplyScalar(Math.cos(angle))
      .addScaledVector(basisV, Math.sin(angle));
    positions.push(...endCenter.clone().addScaledVector(radial, endRadius).toArray());
  }
  const startCenterIndex = radialSegments * 2;
  const endCenterIndex = startCenterIndex + 1;
  positions.push(...start.toArray(), ...endCenter.toArray());
  for (let index = 0; index < radialSegments; index += 1) {
    const next = (index + 1) % radialSegments;
    const startA = index;
    const startB = next;
    const endA = radialSegments + index;
    const endB = radialSegments + next;
    indices.push(startA, endA, endB, startA, endB, startB);
    indices.push(startCenterIndex, startB, startA);
    indices.push(endCenterIndex, endA, endB);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function addCylinder(context, start, end, startRadius, endRadius = startRadius) {
  const acceptedStartRadius = positive(startRadius, 'START_RADIUS_INVALID');
  const acceptedEndRadius = positive(endRadius, 'END_RADIUS_INVALID');
  const placement = axisPlacement(start, end);
  const geometry = new THREE.CylinderGeometry(
    acceptedEndRadius,
    acceptedStartRadius,
    placement.length,
    context.radialSegments,
  );
  return addMesh(context, geometry, placement.position, placement.quaternion);
}

function axisPlacement(start, end) {
  const axis = end.clone().sub(start);
  const length = axis.length();
  if (!(length > MIN_LENGTH)) fail('Cylinder endpoints must be distinct.', 'ZERO_LENGTH_AXIS');
  return {
    length,
    position: start.clone().add(end).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromUnitVectors(Y_AXIS, axis.normalize()),
  };
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

class CircularArcCurve3 extends THREE.Curve {
  constructor(center, startRadial, normal, angleRad) {
    super();
    this.center = center.clone();
    this.startRadial = startRadial.clone();
    this.normal = normal.clone().normalize();
    this.angleRad = angleRad;
  }

  getPoint(t, target = new THREE.Vector3()) {
    return target.copy(this.startRadial)
      .applyAxisAngle(this.normal, this.angleRad * t)
      .add(this.center);
  }
}

class PiecewiseLinearCurve3 extends THREE.Curve {
  constructor(points) {
    super();
    this.points = points.map((row) => row.clone());
  }

  getPoint(t, target = new THREE.Vector3()) {
    const scaled = Math.min(Math.max(t, 0), 1) * (this.points.length - 1);
    const index = Math.min(Math.floor(scaled), this.points.length - 2);
    const fraction = scaled - index;
    return target.copy(this.points[index]).lerp(this.points[index + 1], fraction);
  }
}

function stablePerpendicular(axis) {
  const reference = Math.abs(axis.x) <= Math.abs(axis.y) && Math.abs(axis.x) <= Math.abs(axis.z)
    ? new THREE.Vector3(1, 0, 0)
    : Math.abs(axis.y) <= Math.abs(axis.z)
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3().crossVectors(axis, reference).normalize();
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
