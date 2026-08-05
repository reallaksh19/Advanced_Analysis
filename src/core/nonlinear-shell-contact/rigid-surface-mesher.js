import { deepFreeze, semanticHash } from './contracts.js';

export const RIGID_SURFACE_FACETING_PROFILE = deepFreeze({
  profileId: 'NC00_DETERMINISTIC_RIGID_SURFACE_FACETING_V1',
  solverFacetElements: Object.freeze({ triangle: 'S3', quadrilateral: 'S4' }),
  sphere: Object.freeze({ circumferentialSegments: 24, meridionalSegments: 8 }),
  cylinder: Object.freeze({ circumferentialSegments: 24, axialSegments: 4 }),
  saddle: Object.freeze({ circumferentialSegments: 16, axialSegments: 4 }),
  coordinateQuantization: '15_SIGNIFICANT_DIGITS',
  limitations: Object.freeze([
    'FACETED_GEOMETRY_NOT_CONTACT_ACCURACY_QUALIFIED',
    'SPHERE_IS_A_POLAR_CAP_WITH_ANGLE_LESS_THAN_180_DEGREES',
    'CYLINDER_ANGLE_IS_LIMITED_TO_360_DEGREES',
    'SADDLE_WIDTH_MUST_BE_LESS_THAN_TWICE_RADIUS',
  ]),
});

export function createDeterministicRigidSurfaceMesh(surface, {
  firstNodeId,
  firstElementId,
} = {}) {
  if (!surface || typeof surface !== 'object' || Array.isArray(surface)) {
    throw new TypeError('Rigid surface must be an object.');
  }
  if (!Number.isInteger(firstNodeId) || firstNodeId < 1) {
    throw new TypeError('firstNodeId must be a positive integer.');
  }
  if (!Number.isInteger(firstElementId) || firstElementId < 1) {
    throw new TypeError('firstElementId must be a positive integer.');
  }

  const basis = createBasis(surface.orientation);
  const geometry = (() => {
    if (surface.surfaceType === 'RIGID_PLANE') {
      return planeMesh(surface, basis, firstNodeId, firstElementId);
    }
    if (surface.surfaceType === 'RIGID_SPHERE') {
      return sphereMesh(surface, basis, firstNodeId, firstElementId);
    }
    if (surface.surfaceType === 'RIGID_CYLINDER') {
      return cylinderMesh(surface, basis, firstNodeId, firstElementId);
    }
    if (surface.surfaceType === 'RIGID_SADDLE') {
      return saddleMesh(surface, basis, firstNodeId, firstElementId);
    }
    throw new TypeError(`Unsupported rigid surface type ${surface.surfaceType}.`);
  })();

  const payload = {
    rigidSurfaceId: surface.rigidSurfaceId,
    surfaceType: surface.surfaceType,
    geometryProfileId: RIGID_SURFACE_FACETING_PROFILE.profileId,
    referenceNode: {
      id: geometry.nextNodeId,
      coordinates: normalizePoint(surface.referencePoint),
    },
    nodes: geometry.nodes,
    elements: geometry.elements,
    contactFaceLabel: 'SPOS',
    nextNodeId: geometry.nextNodeId + 1,
    nextElementId: geometry.nextElementId,
    geometryStatistics: {
      nodeCount: geometry.nodes.length,
      triangleCount: geometry.elements.filter((row) => row.type === 'S3').length,
      quadrilateralCount: geometry.elements.filter((row) => row.type === 'S4').length,
    },
  };
  return deepFreeze({ ...payload, geometrySemanticHash: semanticHash(payload) });
}

function planeMesh(surface, basis, firstNodeId, firstElementId) {
  const { length, width, radius, angle } = surface.dimensions;
  requirePositive(length, 'RIGID_PLANE dimensions.length');
  requirePositive(width, 'RIGID_PLANE dimensions.width');
  requireNull(radius, 'RIGID_PLANE dimensions.radius');
  requireNull(angle, 'RIGID_PLANE dimensions.angle');
  const center = normalizePoint(surface.referencePoint);
  const points = [
    combine(center, scaled(basis.axis, -length / 2), scaled(basis.binormal, -width / 2)),
    combine(center, scaled(basis.axis, length / 2), scaled(basis.binormal, -width / 2)),
    combine(center, scaled(basis.axis, length / 2), scaled(basis.binormal, width / 2)),
    combine(center, scaled(basis.axis, -length / 2), scaled(basis.binormal, width / 2)),
  ];
  return assemble(points, [{ type: 'S4', localNodeIds: [0, 1, 2, 3] }], firstNodeId, firstElementId);
}

function cylinderMesh(surface, basis, firstNodeId, firstElementId) {
  const { radius, length, width, angle } = surface.dimensions;
  requirePositive(radius, 'RIGID_CYLINDER dimensions.radius');
  requirePositive(length, 'RIGID_CYLINDER dimensions.length');
  requireNull(width, 'RIGID_CYLINDER dimensions.width');
  requireAngle(angle, 'RIGID_CYLINDER dimensions.angle', { maximum: 360 });
  const center = normalizePoint(surface.referencePoint);
  const full = nearlyEqual(angle, 360);
  const circumferentialSegments = scaledSegments(
    RIGID_SURFACE_FACETING_PROFILE.cylinder.circumferentialSegments,
    angle,
    360,
    1,
  );
  const axialSegments = RIGID_SURFACE_FACETING_PROFILE.cylinder.axialSegments;
  const angularNodeCount = full ? circumferentialSegments : circumferentialSegments + 1;
  const points = [];
  for (let axial = 0; axial <= axialSegments; axial += 1) {
    const axialOffset = length * (axial / axialSegments - 0.5);
    for (let angular = 0; angular < angularNodeCount; angular += 1) {
      const fraction = angular / circumferentialSegments;
      const theta = toRadians(-angle / 2 + fraction * angle);
      const radial = combine(
        scaled(basis.normal, Math.cos(theta)),
        scaled(basis.binormal, Math.sin(theta)),
      );
      points.push(combine(center, scaled(basis.axis, axialOffset), scaled(radial, radius)));
    }
  }
  const elements = [];
  const index = (axial, angular) => axial * angularNodeCount + angular;
  for (let axial = 0; axial < axialSegments; axial += 1) {
    for (let angular = 0; angular < circumferentialSegments; angular += 1) {
      const nextAngular = full ? (angular + 1) % angularNodeCount : angular + 1;
      elements.push({
        type: 'S4',
        localNodeIds: [
          index(axial, angular),
          index(axial + 1, angular),
          index(axial + 1, nextAngular),
          index(axial, nextAngular),
        ],
      });
    }
  }
  return assemble(points, elements, firstNodeId, firstElementId);
}

function sphereMesh(surface, basis, firstNodeId, firstElementId) {
  const { radius, length, width, angle } = surface.dimensions;
  requirePositive(radius, 'RIGID_SPHERE dimensions.radius');
  requireNull(length, 'RIGID_SPHERE dimensions.length');
  requireNull(width, 'RIGID_SPHERE dimensions.width');
  requireAngle(angle, 'RIGID_SPHERE dimensions.angle', { maximum: 179.999999 });
  const center = normalizePoint(surface.referencePoint);
  const circumferentialSegments = RIGID_SURFACE_FACETING_PROFILE.sphere.circumferentialSegments;
  const meridionalSegments = RIGID_SURFACE_FACETING_PROFILE.sphere.meridionalSegments;
  const points = [combine(center, scaled(basis.normal, radius))];
  for (let ring = 1; ring <= meridionalSegments; ring += 1) {
    const phi = toRadians(angle * ring / meridionalSegments);
    for (let angular = 0; angular < circumferentialSegments; angular += 1) {
      const theta = 2 * Math.PI * angular / circumferentialSegments;
      const tangent = combine(
        scaled(basis.axis, Math.cos(theta)),
        scaled(basis.binormal, Math.sin(theta)),
      );
      const radial = combine(
        scaled(basis.normal, Math.cos(phi)),
        scaled(tangent, Math.sin(phi)),
      );
      points.push(combine(center, scaled(radial, radius)));
    }
  }
  const ringIndex = (ring, angular) => 1
    + (ring - 1) * circumferentialSegments
    + (angular % circumferentialSegments);
  const elements = [];
  for (let angular = 0; angular < circumferentialSegments; angular += 1) {
    elements.push({
      type: 'S3',
      localNodeIds: [0, ringIndex(1, angular), ringIndex(1, angular + 1)],
    });
  }
  for (let ring = 1; ring < meridionalSegments; ring += 1) {
    for (let angular = 0; angular < circumferentialSegments; angular += 1) {
      elements.push({
        type: 'S4',
        localNodeIds: [
          ringIndex(ring, angular),
          ringIndex(ring + 1, angular),
          ringIndex(ring + 1, angular + 1),
          ringIndex(ring, angular + 1),
        ],
      });
    }
  }
  return assemble(points, elements, firstNodeId, firstElementId);
}

function saddleMesh(surface, basis, firstNodeId, firstElementId) {
  const { radius, length, width, angle } = surface.dimensions;
  requirePositive(radius, 'RIGID_SADDLE dimensions.radius');
  requirePositive(length, 'RIGID_SADDLE dimensions.length');
  requirePositive(width, 'RIGID_SADDLE dimensions.width');
  requireNull(angle, 'RIGID_SADDLE dimensions.angle');
  if (!(width < 2 * radius)) {
    throw new TypeError('RIGID_SADDLE dimensions.width must be less than twice radius.');
  }
  const halfAngle = Math.asin(width / (2 * radius));
  const center = normalizePoint(surface.referencePoint);
  const curvatureCenter = combine(center, scaled(basis.normal, radius));
  const circumferentialSegments = RIGID_SURFACE_FACETING_PROFILE.saddle.circumferentialSegments;
  const axialSegments = RIGID_SURFACE_FACETING_PROFILE.saddle.axialSegments;
  const angularNodeCount = circumferentialSegments + 1;
  const points = [];
  for (let axial = 0; axial <= axialSegments; axial += 1) {
    const axialOffset = length * (axial / axialSegments - 0.5);
    for (let angular = 0; angular <= circumferentialSegments; angular += 1) {
      const theta = -halfAngle + 2 * halfAngle * angular / circumferentialSegments;
      const inwardRadius = combine(
        scaled(basis.normal, -Math.cos(theta)),
        scaled(basis.binormal, -Math.sin(theta)),
      );
      points.push(combine(
        curvatureCenter,
        scaled(basis.axis, axialOffset),
        scaled(inwardRadius, radius),
      ));
    }
  }
  const index = (axial, angular) => axial * angularNodeCount + angular;
  const elements = [];
  for (let axial = 0; axial < axialSegments; axial += 1) {
    for (let angular = 0; angular < circumferentialSegments; angular += 1) {
      elements.push({
        type: 'S4',
        localNodeIds: [
          index(axial, angular),
          index(axial, angular + 1),
          index(axial + 1, angular + 1),
          index(axial + 1, angular),
        ],
      });
    }
  }
  return assemble(points, elements, firstNodeId, firstElementId);
}

function assemble(points, elementDefinitions, firstNodeId, firstElementId) {
  const nodes = points.map((coordinates, index) => ({
    id: firstNodeId + index,
    coordinates: normalizePoint(coordinates),
  }));
  const elements = elementDefinitions.map((row, index) => ({
    id: firstElementId + index,
    type: row.type,
    nodeIds: row.localNodeIds.map((localId) => firstNodeId + localId),
  }));
  return {
    nodes,
    elements,
    nextNodeId: firstNodeId + nodes.length,
    nextElementId: firstElementId + elements.length,
  };
}

function createBasis(orientation) {
  if (!orientation || typeof orientation !== 'object') {
    throw new TypeError('Rigid-surface orientation is required.');
  }
  const normal = normalized(orientation.normal, 'orientation.normal');
  const rawAxis = normalized(orientation.axis, 'orientation.axis');
  const projection = dot(rawAxis, normal);
  const tangent = rawAxis.map((value, index) => value - projection * normal[index]);
  const tangentNorm = Math.hypot(...tangent);
  if (!(tangentNorm > 1e-10)) {
    throw new TypeError('Rigid-surface axis must not be parallel to the normal.');
  }
  const axis = tangent.map((value) => value / tangentNorm);
  return { normal, axis, binormal: normalized(cross(normal, axis), 'orientation.binormal') };
}

function normalized(value, path) {
  if (!Array.isArray(value) || value.length !== 3
      || value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
    throw new TypeError(`${path} must be a finite three-component vector.`);
  }
  const norm = Math.hypot(...value);
  if (!(norm > 0)) throw new TypeError(`${path} must be nonzero.`);
  return value.map((entry) => entry / norm);
}
function normalizePoint(value) {
  if (!Array.isArray(value) || value.length !== 3
      || value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
    throw new TypeError('Rigid-surface point must contain three finite coordinates.');
  }
  return value.map((entry) => {
    const quantized = Number(entry.toPrecision(15));
    return Object.is(quantized, -0) ? 0 : quantized;
  });
}
function requirePositive(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) {
    throw new TypeError(`${path} must be positive.`);
  }
}
function requireNull(value, path) {
  if (value !== null) throw new TypeError(`${path} must be null for this surface type.`);
}
function requireAngle(value, path, { maximum }) {
  requirePositive(value, path);
  if (!(value <= maximum)) throw new TypeError(`${path} must not exceed ${maximum} degrees.`);
}
function scaledSegments(base, span, fullSpan, minimum) {
  return Math.max(minimum, Math.ceil(base * span / fullSpan));
}
function toRadians(value) { return value * Math.PI / 180; }
function nearlyEqual(a, b) { return Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b)); }
function dot(a, b) { return a.reduce((sum, value, index) => sum + value * b[index], 0); }
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function scaled(vector, scalar) { return vector.map((value) => value * scalar); }
function combine(...vectors) {
  return [0, 1, 2].map((index) => vectors.reduce((sum, vector) => sum + vector[index], 0));
}
