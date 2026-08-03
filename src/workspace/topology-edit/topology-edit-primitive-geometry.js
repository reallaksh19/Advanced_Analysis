import * as THREE from 'three';
import { deepFreeze } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_PRIMITIVE_GEOMETRY_ERROR = 'TOPOLOGY_EDIT_PRIMITIVE_GEOMETRY_INVALID';
export const TOPOLOGY_EDIT_COMPONENT_SHAPE_PROFILE = deepFreeze({
  schema: 'TopologyEditComponentShapeProfile.v1',
  teeRunLengthFactor: 1.25,
  teeBranchLengthFactor: 1.75,
  oletLengthFactor: 2,
  oletTipRadiusFactor: 0.5,
  valveNeckRadiusFactor: 0.6,
  instrumentStemRadiusFactor: 0.25,
});

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const MIN_LENGTH = 1e-9;

export class TopologyEditPrimitiveGeometryError extends Error {
  constructor(message, detailCode) {
    super(`${TOPOLOGY_EDIT_PRIMITIVE_GEOMETRY_ERROR}: ${message}`);
    this.name = 'TopologyEditPrimitiveGeometryError';
    this.code = TOPOLOGY_EDIT_PRIMITIVE_GEOMETRY_ERROR;
    this.detailCode = detailCode;
  }
}

export function materializeTopologyEditPrimitive(primitive, options = {}) {
  const kind = requiredToken(primitive?.kind, 'PRIMITIVE_KIND_MISSING');
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
  const context = { group, material, radialSegments, markerSize, pickUserData, primitive };
  const builder = BUILDERS[kind];
  if (!builder) fail(`Unsupported primitive kind ${kind}.`, 'PRIMITIVE_KIND_UNSUPPORTED');
  builder(context);
  if (!group.children.length) fail(`Primitive ${kind} produced no geometry.`, 'EMPTY_GEOMETRY');
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  if (bounds.isEmpty() || !finiteBox(bounds)) fail(`Primitive ${kind} produced invalid bounds.`, 'BOUNDS_INVALID');
  return { object: group, bounds };
}

const BUILDERS = {
  PIPE_CYLINDER: ({ primitive, ...context }) => {
    const parameters = primitive.parameters;
    addCylinder(context, point(parameters.start), point(parameters.end), diameter(parameters.outsideDiameterMm) / 2);
  },
  ELBOW_ARC: ({ primitive, ...context }) => {
    const parameters = primitive.parameters;
    const points = pointArray(parameters.arcPoints, 2);
    const radius = diameter(parameters.outsideDiameterMm) / 2;
    const segments = integerAtLeast(parameters.segmentCount, points.length - 1, 'ELBOW_SEGMENT_COUNT_INVALID');
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    addMesh(context, new THREE.TubeGeometry(curve, segments, radius, context.radialSegments, false));
  },
  CONICAL_REDUCER: ({ primitive, ...context }) => addReducer(context, primitive.parameters),
  ECCENTRIC_REDUCER: ({ primitive, ...context }) => addReducer(context, primitive.parameters),
  TEE_JUNCTION: ({ primitive, ...context }) => addTee(context, primitive.parameters),
  OLET_BRANCH: ({ primitive, ...context }) => addOlet(context, primitive.parameters),
  FLANGE_DISC: ({ primitive, ...context }) => addFlange(context, primitive.parameters),
  VALVE_BODY: ({ primitive, ...context }) => addValve(context, primitive.parameters),
  GASKET_DISC: ({ primitive, ...context }) => {
    const p = primitive.parameters;
    addCylinder(context, point(p.start), point(p.end), diameter(p.outsideDiameterMm) / 2);
  },
  INSTRUMENT_MARKER: ({ primitive, ...context }) => addInstrument(context, primitive.parameters),
  JUNCTION_MARKER: ({ primitive, ...context }) => {
    const position = point(primitive.parameters.position);
    addMesh(context, new THREE.SphereGeometry(context.markerSize, context.radialSegments, Math.max(6, Math.floor(context.radialSegments * 0.75))), position);
  },
  DIAGNOSTIC_CENTERLINE: ({ primitive, ...context }) => {
    const p = primitive.parameters;
    const radius = positive(p.radiusMm, 'DIAGNOSTIC_RADIUS_INVALID');
    if (Array.isArray(p.arcPoints) && p.arcPoints.length >= 2) {
      const points = pointArray(p.arcPoints, 2);
      addMesh(context, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'centripetal'), points.length - 1, radius, context.radialSegments, false));
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
  const runDirections = directionArray(parameters.runDirections, 2);
  const branchDirection = direction(parameters.branchDirection);
  const runDiameter = diameter(parameters.runOutsideDiameterMm);
  const branchDiameter = diameter(parameters.branchOutsideDiameterMm);
  const runRadius = runDiameter / 2;
  const branchRadius = branchDiameter / 2;
  runDirections.forEach((axis) => {
    addCylinder(
      context,
      center,
      center.clone().addScaledVector(axis, runDiameter * TOPOLOGY_EDIT_COMPONENT_SHAPE_PROFILE.teeRunLengthFactor),
      runRadius * 1.12,
    );
  });
  addCylinder(
    context,
    center,
    center.clone().addScaledVector(branchDirection, branchDiameter * TOPOLOGY_EDIT_COMPONENT_SHAPE_PROFILE.teeBranchLengthFactor),
    branchRadius * 1.12,
  );
}

function addOlet(context, parameters) {
  const center = point(parameters.center);
  const branchDirection = direction(parameters.branchDirection);
  const branchDiameter = diameter(parameters.branchOutsideDiameterMm);
  const branchRadius = branchDiameter / 2;
  const end = center.clone().addScaledVector(
    branchDirection,
    branchDiameter * TOPOLOGY_EDIT_COMPONENT_SHAPE_PROFILE.oletLengthFactor,
  );
  addCylinder(
    context,
    center,
    end,
    branchRadius,
    branchRadius * TOPOLOGY_EDIT_COMPONENT_SHAPE_PROFILE.oletTipRadiusFactor,
  );
}

function addFlange(context, parameters) {
  const start = point(parameters.start);
  const end = point(parameters.end);
  const radius = diameter(parameters.outsideDiameterMm) / 2;
  const mesh = addCylinder(context, start, end, radius);
  const length = start.distanceTo(end);
  const ringTube = Math.min(radius / 6, length / 4);
  if (ringTube > MIN_LENGTH && radius > ringTube) {
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(radius - ringTube, ringTube, Math.max(6, Math.floor(context.radialSegments / 2)), context.radialSegments),
      context.material,
    );
    torus.position.copy(start).add(end).multiplyScalar(0.5);
    torus.quaternion.setFromUnitVectors(Z_AXIS, end.clone().sub(start).normalize());
    applyPick(torus, context);
    context.group.add(torus);
  }
  return mesh;
}

function addValve(context, parameters) {
  const start = point(parameters.start);
  const end = point(parameters.end);
  const center = point(parameters.center);
  const radius = diameter(parameters.outsideDiameterMm) / 2;
  const neckRadius = radius * TOPOLOGY_EDIT_COMPONENT_SHAPE_PROFILE.valveNeckRadiusFactor;
  addCylinder(context, start, center, neckRadius);
  addCylinder(context, center, end, neckRadius);
  addMesh(context, new THREE.SphereGeometry(radius, context.radialSegments, Math.max(6, Math.floor(context.radialSegments * 0.75))), center);
}

function addInstrument(context, parameters) {
  const start = point(parameters.start);
  const end = point(parameters.end);
  const center = point(parameters.center);
  const radius = diameter(parameters.outsideDiameterMm) / 2;
  addCylinder(context, start, end, radius * TOPOLOGY_EDIT_COMPONENT_SHAPE_PROFILE.instrumentStemRadiusFactor);
  addMesh(context, new THREE.IcosahedronGeometry(radius, 1), center);
}

function addCylinder(context, start, end, startRadius, endRadius = startRadius) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (!(length > MIN_LENGTH)) fail('Cylinder endpoints must be distinct.', 'ZERO_LENGTH_AXIS');
  const geometry = new THREE.CylinderGeometry(endRadius, startRadius, length, context.radialSegments);
  const position = start.clone().add(end).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize());
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
  if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) fail('A finite point is required.', 'POINT_INVALID');
  return new THREE.Vector3(value.x, value.y, value.z);
}

function pointArray(value, minimum) {
  if (!Array.isArray(value) || value.length < minimum) fail(`At least ${minimum} points are required.`, 'POINT_ARRAY_INVALID');
  return value.map(point);
}

function direction(value) {
  const vector = point(value);
  const length = vector.length();
  if (!(length > MIN_LENGTH)) fail('A non-zero direction is required.', 'DIRECTION_INVALID');
  return vector.multiplyScalar(1 / length);
}

function directionArray(value, minimum) {
  if (!Array.isArray(value) || value.length < minimum) {
    fail(`At least ${minimum} directions are required.`, 'DIRECTION_ARRAY_INVALID');
  }
  return value.map(direction);
}

function diameter(value) {
  return positive(value, 'DIAMETER_INVALID');
}

function positive(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail('A positive finite value is required.', code);
  return number;
}

function integerAtLeast(value, minimum, code = 'INTEGER_INVALID') {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) fail(`An integer of at least ${minimum} is required.`, code);
  return number;
}

function requiredToken(value, code) {
  const token = String(value || '').trim().toUpperCase();
  if (!token) fail('A non-empty token is required.', code);
  return token;
}

function objectRecord(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('An object record is required.', code);
  return value;
}

function finiteBox(box) {
  return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite);
}

function fail(message, code) {
  throw new TopologyEditPrimitiveGeometryError(message, code);
}
