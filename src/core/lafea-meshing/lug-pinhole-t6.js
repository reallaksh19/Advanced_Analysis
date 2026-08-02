import { LafeaMeshingError } from './errors.js';
import {
  aspectRatioOf,
  minimumAngleDegreesOf,
  minimumScaledJacobianOf,
} from './quality-gates.js';
import {
  jacobianAt,
  t6ShapeFunctions,
} from './element-geometry.js';

/**
 * Deterministic quadratic triangular mesh for the bounded annular
 * C2D-LUG-PINHOLE pilot geometry.
 *
 * This is intentionally not a general polygon-with-holes mesher. The accepted
 * geometry is one concentric circular hole and one concentric circular outer
 * boundary. The restriction is explicit so production evidence cannot imply
 * support for arbitrary lug outlines or arbitrary hole topology.
 */
export const LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA =
  'lafea-lug-pinhole-t6-mesh-spec/v1';
export const LAFEA_LUG_PINHOLE_T6_MESH_PACKAGE_SCHEMA =
  'lafea-lug-pinhole-t6-mesh-package/v1';
export const LAFEA_LUG_PINHOLE_T6_GENERATOR_REVISION = 'NB-T6B.1';

const SPEC_KEYS = Object.freeze([
  'schema',
  'meshIdentity',
  'center',
  'holeRadius',
  'outerRadius',
  'radialDivisions',
  'circumferentialDivisions',
  'startAngleDegrees',
]);
const CENTER_KEYS = Object.freeze(['x', 'y']);
const TWO_PI = 2 * Math.PI;
const T6_AREA_POINTS = Object.freeze([
  Object.freeze({ xi: 1 / 6, eta: 1 / 6, weight: 1 / 6 }),
  Object.freeze({ xi: 2 / 3, eta: 1 / 6, weight: 1 / 6 }),
  Object.freeze({ xi: 1 / 6, eta: 2 / 3, weight: 1 / 6 }),
]);

/**
 * Generate a T6-only analysis mesh and explicit feature sets.
 *
 * Corner nodes are arranged in radial rings. Each annular cell is split into
 * two counter-clockwise triangles. Midside nodes are shared by exact edge
 * identity. Circumferential midsides lie on their analytic ring; radial and
 * diagonal midsides lie on straight chords.
 */
export function generateLafeaLugPinholeT6Mesh(specValue) {
  const spec = canonicalSpec(specValue);
  const state = createState(spec);
  createCornerNodes(state);
  createElements(state);
  const mesh = analysisMesh(state);
  const featureSets = createFeatureSets(state);
  const quality = evaluateGeneratedMesh(mesh, spec);
  if (!(quality.minimumScaledJacobian > 0)
    || !(quality.minimumIntegrationPointJacobian > 0)) {
    throw new LafeaMeshingError(
      'Generated lug-pinhole mesh contains a non-positive Jacobian.',
      'LUG_PINHOLE_T6_NON_POSITIVE_JACOBIAN',
    );
  }
  return deepFreeze({
    schema: LAFEA_LUG_PINHOLE_T6_MESH_PACKAGE_SCHEMA,
    generatorRevision: LAFEA_LUG_PINHOLE_T6_GENERATOR_REVISION,
    spec,
    mesh,
    featureSets,
    quality,
    authority: {
      selectedGeometryClass: 'CONCENTRIC_ANNULAR_LUG_PINHOLE',
      elementType: 'T6',
      holeTopologySupported: true,
      arbitraryOuterProfileSupported: false,
      arbitraryHoleTopologySupported: false,
      productionMeshGenerated: true,
      solverExecuted: false,
      recoveryProduced: false,
      convergenceProduced: false,
      codeAssessmentProduced: false,
      releaseQualified: false,
    },
  });
}

/** Rebuild validation used by the workspace evidence producer. */
export function validateLafeaLugPinholeT6MeshPackage(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return Object.freeze({ ok: false, errors: ['PACKAGE_NOT_RECORD'] });
    }
    const rebuilt = generateLafeaLugPinholeT6Mesh(value.spec);
    return Object.freeze({
      ok: JSON.stringify(rebuilt) === JSON.stringify(value),
      errors: JSON.stringify(rebuilt) === JSON.stringify(value)
        ? Object.freeze([])
        : Object.freeze(['PACKAGE_REBUILD_MISMATCH']),
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      errors: Object.freeze([
        typeof error?.code === 'string'
          ? error.code
          : 'PACKAGE_REBUILD_FAILED',
      ]),
    });
  }
}

function canonicalSpec(value) {
  exactKeys(value, SPEC_KEYS, 'lug-pinhole mesh specification');
  if (value.schema !== LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA) {
    throw meshError('LUG_PINHOLE_T6_SPEC_SCHEMA_INVALID');
  }
  exactKeys(value.center, CENTER_KEYS, 'lug-pinhole center');
  const center = Object.freeze({
    x: finite(value.center.x, 'center.x'),
    y: finite(value.center.y, 'center.y'),
  });
  const holeRadius = positive(value.holeRadius, 'holeRadius');
  const outerRadius = positive(value.outerRadius, 'outerRadius');
  if (!(outerRadius > holeRadius)) {
    throw meshError('LUG_PINHOLE_T6_RADIUS_ORDER_INVALID');
  }
  const radialDivisions = integerAtLeast(
    value.radialDivisions,
    1,
    'radialDivisions',
  );
  const circumferentialDivisions = integerAtLeast(
    value.circumferentialDivisions,
    8,
    'circumferentialDivisions',
  );
  if (circumferentialDivisions % 4 !== 0) {
    throw meshError('LUG_PINHOLE_T6_CIRCUMFERENTIAL_DIVISIONS_NOT_QUARTERABLE');
  }
  const startAngleDegrees = finite(
    value.startAngleDegrees,
    'startAngleDegrees',
  );
  return deepFreeze({
    schema: LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
    meshIdentity: text(value.meshIdentity, 'meshIdentity'),
    center,
    holeRadius,
    outerRadius,
    radialDivisions,
    circumferentialDivisions,
    startAngleDegrees: normalizeDegrees(startAngleDegrees),
  });
}

function createState(spec) {
  return {
    spec,
    nodes: new Map(),
    nodeMetadata: new Map(),
    edgeMidpointIds: new Map(),
    elements: [],
  };
}

function createCornerNodes(state) {
  const { spec } = state;
  for (let ring = 0; ring <= spec.radialDivisions; ring += 1) {
    const radius = radiusAt(spec, ring);
    for (let sector = 0; sector < spec.circumferentialDivisions;
      sector += 1) {
      const angle = angleAt(spec, sector);
      const nodeId = cornerNodeId(ring, sector);
      addNode(state, nodeId, {
        x: spec.center.x + radius * Math.cos(angle),
        y: spec.center.y + radius * Math.sin(angle),
        z: 0,
      }, {
        kind: 'CORNER',
        ring,
        sector,
        radius,
        angle,
      });
    }
  }
}

function createElements(state) {
  const { spec } = state;
  for (let ring = 0; ring < spec.radialDivisions; ring += 1) {
    for (let sector = 0; sector < spec.circumferentialDivisions;
      sector += 1) {
      const next = (sector + 1) % spec.circumferentialDivisions;
      const innerA = cornerNodeId(ring, sector);
      const outerA = cornerNodeId(ring + 1, sector);
      const outerB = cornerNodeId(ring + 1, next);
      const innerB = cornerNodeId(ring, next);
      addT6Element(state, `E-R${ring}-S${sector}-A`, [
        innerA, outerA, outerB,
      ]);
      addT6Element(state, `E-R${ring}-S${sector}-B`, [
        innerA, outerB, innerB,
      ]);
    }
  }
}

function addT6Element(state, elementId, cornerIds) {
  const corners = cornerIds.map((nodeId) => requireNode(state, nodeId));
  if (!(signedTriangleArea(corners) > 0)) {
    throw new LafeaMeshingError(
      `Generated element ${elementId} is not counter-clockwise.`,
      'LUG_PINHOLE_T6_ELEMENT_ORIENTATION_INVALID',
    );
  }
  const midsideIds = [
    midpointNodeId(state, cornerIds[0], cornerIds[1]),
    midpointNodeId(state, cornerIds[1], cornerIds[2]),
    midpointNodeId(state, cornerIds[2], cornerIds[0]),
  ];
  state.elements.push(Object.freeze({
    elementId,
    elementType: 'T6',
    nodeIds: Object.freeze([...cornerIds, ...midsideIds]),
  }));
}

function midpointNodeId(state, firstId, secondId) {
  const key = edgeKey(firstId, secondId);
  const existing = state.edgeMidpointIds.get(key);
  if (existing) return existing;
  const first = requireNode(state, firstId);
  const second = requireNode(state, secondId);
  const firstMeta = state.nodeMetadata.get(firstId);
  const secondMeta = state.nodeMetadata.get(secondId);
  const nodeId = `M-${key.replace(':', '--')}`;
  const point = midpointCoordinates(state.spec, first, second, firstMeta, secondMeta);
  addNode(state, nodeId, point, {
    kind: 'MIDSIDE',
    edgeKey: key,
    firstId,
    secondId,
  });
  state.edgeMidpointIds.set(key, nodeId);
  return nodeId;
}

function midpointCoordinates(spec, first, second, firstMeta, secondMeta) {
  if (firstMeta?.kind === 'CORNER' && secondMeta?.kind === 'CORNER'
    && firstMeta.ring === secondMeta.ring
    && sectorsAdjacent(
      firstMeta.sector,
      secondMeta.sector,
      spec.circumferentialDivisions,
    )) {
    const radius = firstMeta.radius;
    const ux = (first.x - spec.center.x) / radius
      + (second.x - spec.center.x) / radius;
    const uy = (first.y - spec.center.y) / radius
      + (second.y - spec.center.y) / radius;
    const norm = Math.hypot(ux, uy);
    if (!(norm > 0)) {
      throw meshError('LUG_PINHOLE_T6_CIRCUMFERENTIAL_MIDPOINT_INVALID');
    }
    return {
      x: spec.center.x + radius * ux / norm,
      y: spec.center.y + radius * uy / norm,
      z: 0,
    };
  }
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    z: 0,
  };
}

function analysisMesh(state) {
  return deepFreeze({
    schema: 'lafea-analysis-mesh/v1',
    meshIdentity: state.spec.meshIdentity,
    nodes: [...state.nodes.entries()]
      .map(([nodeId, point]) => ({ nodeId, ...point }))
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
    elements: [...state.elements]
      .sort((left, right) => left.elementId.localeCompare(right.elementId)),
  });
}

function createFeatureSets(state) {
  const { spec } = state;
  const hole = circularBoundaryFeature(state, 0, 'HOLE_BOUNDARY');
  const outer = circularBoundaryFeature(
    state,
    spec.radialDivisions,
    'OUTER_BOUNDARY',
  );
  const radialLines = [0, 1, 2, 3].map((quarter) => {
    const sector = quarter * spec.circumferentialDivisions / 4;
    const cornerNodeIds = [];
    for (let ring = 0; ring <= spec.radialDivisions; ring += 1) {
      cornerNodeIds.push(cornerNodeId(ring, sector));
    }
    const nodeIds = [];
    for (let index = 0; index < cornerNodeIds.length; index += 1) {
      nodeIds.push(cornerNodeIds[index]);
      if (index < cornerNodeIds.length - 1) {
        nodeIds.push(midpointNodeId(
          state,
          cornerNodeIds[index],
          cornerNodeIds[index + 1],
        ));
      }
    }
    return deepFreeze({
      role: `RADIAL_QUARTER_${quarter}`,
      sector,
      nodeIds,
    });
  });
  return deepFreeze({
    schema: 'lafea-lug-pinhole-feature-sets/v1',
    holeBoundary: hole,
    outerBoundary: outer,
    radialLines,
  });
}

function circularBoundaryFeature(state, ring, role) {
  const { spec } = state;
  const edgeNodeIds = [];
  const nodeIds = [];
  for (let sector = 0; sector < spec.circumferentialDivisions;
    sector += 1) {
    const next = (sector + 1) % spec.circumferentialDivisions;
    const first = cornerNodeId(ring, sector);
    const second = cornerNodeId(ring, next);
    const mid = midpointNodeId(state, first, second);
    edgeNodeIds.push(Object.freeze([first, mid, second]));
    nodeIds.push(first, mid);
  }
  return deepFreeze({
    role,
    ring,
    nodeIds,
    edgeNodeIds,
  });
}

function evaluateGeneratedMesh(mesh, spec) {
  const nodeById = new Map(mesh.nodes.map((node) => [node.nodeId, node]));
  let minimumScaledJacobian = Number.POSITIVE_INFINITY;
  let minimumIntegrationPointJacobian = Number.POSITIVE_INFINITY;
  let maximumAspectRatio = 0;
  let minimumAngleDegrees = Number.POSITIVE_INFINITY;
  let integratedArea = 0;
  for (const element of mesh.elements) {
    const nodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
    const corners = nodes.slice(0, 3);
    minimumScaledJacobian = Math.min(
      minimumScaledJacobian,
      minimumScaledJacobianOf('T6', nodes),
    );
    maximumAspectRatio = Math.max(
      maximumAspectRatio,
      aspectRatioOf(corners),
    );
    minimumAngleDegrees = Math.min(
      minimumAngleDegrees,
      minimumAngleDegreesOf(corners),
    );
    for (const point of T6_AREA_POINTS) {
      const jacobian = jacobianAt(
        t6ShapeFunctions(point.xi, point.eta),
        nodes,
      );
      minimumIntegrationPointJacobian = Math.min(
        minimumIntegrationPointJacobian,
        jacobian.determinant,
      );
      integratedArea += jacobian.determinant * point.weight;
    }
  }
  const analyticalArea = Math.PI
    * (spec.outerRadius ** 2 - spec.holeRadius ** 2);
  const relativeAreaError = Math.abs(integratedArea - analyticalArea)
    / analyticalArea;
  return deepFreeze({
    schema: 'lafea-lug-pinhole-generated-mesh-quality/v1',
    nodeCount: mesh.nodes.length,
    elementCount: mesh.elements.length,
    minimumScaledJacobian,
    minimumIntegrationPointJacobian,
    maximumAspectRatio,
    minimumAngleDegrees,
    integratedArea,
    analyticalArea,
    relativeAreaError,
    holeBoundaryMaximumRadiusError: boundaryRadiusError(
      mesh,
      spec,
      0,
    ),
    outerBoundaryMaximumRadiusError: boundaryRadiusError(
      mesh,
      spec,
      spec.radialDivisions,
    ),
  });
}

function boundaryRadiusError(mesh, spec, ring) {
  const expected = radiusAt(spec, ring);
  const prefix = `C-R${ring}-`;
  const edgeMarker = `C-R${ring}-`;
  let maximum = 0;
  for (const node of mesh.nodes) {
    const isCorner = node.nodeId.startsWith(prefix);
    const isBoundaryMid = node.nodeId.startsWith('M-')
      && node.nodeId.includes(edgeMarker)
      && midpointBelongsToRing(node.nodeId, ring);
    if (!isCorner && !isBoundaryMid) continue;
    const radius = Math.hypot(
      node.x - spec.center.x,
      node.y - spec.center.y,
    );
    maximum = Math.max(maximum, Math.abs(radius - expected));
  }
  return maximum;
}

function midpointBelongsToRing(nodeId, ring) {
  const matches = [...nodeId.matchAll(/C-R(\d+)-S\d+/gu)];
  return matches.length === 2
    && matches.every((match) => Number(match[1]) === ring);
}

function addNode(state, nodeId, point, metadata) {
  if (state.nodes.has(nodeId)) {
    throw new LafeaMeshingError(
      `Duplicate generated node identity: ${nodeId}`,
      'LUG_PINHOLE_T6_NODE_ID_DUPLICATE',
    );
  }
  const canonical = Object.freeze({
    x: clean(point.x),
    y: clean(point.y),
    z: clean(point.z ?? 0),
  });
  state.nodes.set(nodeId, canonical);
  state.nodeMetadata.set(nodeId, Object.freeze({ ...metadata }));
}

function requireNode(state, nodeId) {
  const node = state.nodes.get(nodeId);
  if (!node) {
    throw new LafeaMeshingError(
      `Unresolved generated node: ${nodeId}`,
      'LUG_PINHOLE_T6_NODE_MISSING',
    );
  }
  return node;
}

function radiusAt(spec, ring) {
  return spec.holeRadius
    + (spec.outerRadius - spec.holeRadius)
      * ring / spec.radialDivisions;
}

function angleAt(spec, sector) {
  return spec.startAngleDegrees * Math.PI / 180
    + TWO_PI * sector / spec.circumferentialDivisions;
}

function cornerNodeId(ring, sector) {
  return `C-R${ring}-S${sector}`;
}

function edgeKey(first, second) {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

function sectorsAdjacent(first, second, count) {
  const difference = Math.abs(first - second);
  return difference === 1 || difference === count - 1;
}

function signedTriangleArea(points) {
  const [a, b, c] = points;
  return ((b.x - a.x) * (c.y - a.y)
    - (c.x - a.x) * (b.y - a.y)) / 2;
}

function normalizeDegrees(value) {
  const normalized = value % 360;
  const positiveValue = normalized < 0 ? normalized + 360 : normalized;
  return clean(positiveValue);
}

function exactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw meshError('LUG_PINHOLE_T6_RECORD_INVALID', `${label} must be a plain record.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw meshError(
      'LUG_PINHOLE_T6_EXACT_KEYS_INVALID',
      `${label} must contain exactly ${expected.join(', ')}.`,
    );
  }
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw meshError('LUG_PINHOLE_T6_NUMBER_INVALID', `${label} must be finite.`);
  }
  return clean(value);
}

function positive(value, label) {
  const result = finite(value, label);
  if (!(result > 0)) {
    throw meshError('LUG_PINHOLE_T6_POSITIVE_NUMBER_REQUIRED', `${label} must be positive.`);
  }
  return result;
}

function integerAtLeast(value, minimum, label) {
  if (!Number.isInteger(value) || value < minimum) {
    throw meshError(
      'LUG_PINHOLE_T6_INTEGER_INVALID',
      `${label} must be an integer >= ${minimum}.`,
    );
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw meshError('LUG_PINHOLE_T6_TEXT_INVALID', `${label} is required.`);
  }
  return value;
}

function clean(value) {
  if (Object.is(value, -0) || Math.abs(value) < 1e-15) return 0;
  return value;
}

function meshError(code, message = code) {
  return new LafeaMeshingError(message, code);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
