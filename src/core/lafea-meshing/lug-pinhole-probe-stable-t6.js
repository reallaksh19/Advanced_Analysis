import { LafeaMeshingError } from './errors.js';
import { aspectRatioOf, minimumAngleDegreesOf, minimumScaledJacobianOf } from './quality-gates.js';
import { jacobianAt, t6ShapeFunctions } from './element-geometry.js';
import { canonicalLafeaSha256 } from '../../workspace/lafea-canonical-sha256.js';

export const LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_SPEC_SCHEMA =
  'lafea-lug-pinhole-probe-stable-t6-spec/v1';
export const LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_PACKAGE_SCHEMA =
  'lafea-lug-pinhole-probe-stable-t6-package/v1';
export const LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_GENERATOR_REVISION =
  'B01-PROBE-STABLE-T6.1';
export const LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_TOPOLOGY_SCHEMA =
  'lafea-lug-pinhole-probe-stable-t6-topology-observation/v1';

const SPEC_KEYS = Object.freeze([
  'schema', 'meshIdentity', 'designId', 'ordinal', 'center',
  'radialAxis', 'circumferentialAxis', 'protectedFeatureLinesDegrees',
]);
const CENTER_KEYS = Object.freeze(['x', 'y']);
const AXIS_KEYS = Object.freeze([
  'axisId', 'axisKind', 'ordinal', 'domainStart', 'domainEnd',
  'coordinates', 'coordinateHash', 'protectedBreakpoints', 'anchorCells',
]);
const ANCHOR_KEYS = Object.freeze([
  'anchorId', 'anchorValue', 'cellIndex', 'left', 'right', 'width',
  'phase', 'distanceToLeft', 'distanceToRight', 'cellId', 'parentCellId',
]);
const CARDINAL_LINES = Object.freeze([0, 90, 180, 270]);
const TOLERANCE = 1e-12;
const NATURAL_TOLERANCE = 1e-9;
const NEWTON_LIMIT = 30;
const DENSE_JACOBIAN_DIVISIONS = 8;
const AREA_POINTS = Object.freeze([
  Object.freeze({ xi: 1 / 6, eta: 1 / 6, weight: 1 / 6 }),
  Object.freeze({ xi: 2 / 3, eta: 1 / 6, weight: 1 / 6 }),
  Object.freeze({ xi: 1 / 6, eta: 2 / 3, weight: 1 / 6 }),
]);
const ELEMENT_PATTERN = /^E-R(?<ring>\d+)-S(?<sector>\d+)-(?<side>[AB])$/u;

export function generateLafeaLugPinholeProbeStableT6Mesh(specValue) {
  const spec = canonicalSpec(specValue);
  const state = createState(spec);
  createCornerNodes(state);
  createElements(state);
  const mesh = analysisMesh(state);
  const sidecar = createSidecar(state);
  const featureSets = createFeatureSets(state);
  const quality = evaluateCandidateMeshQuality(mesh, featureSets, spec);
  const reasons = candidateQualityReasons(quality);
  const status = reasons.length === 0
    ? 'CANDIDATE_MESH_READY_NOT_PRODUCTION'
    : 'CANDIDATE_MESH_BLOCKED';
  const specHash = canonicalLafeaSha256(spec);
  const meshHash = canonicalLafeaSha256(mesh);
  const sidecarHash = canonicalLafeaSha256(sidecar);
  const featureSetHash = canonicalLafeaSha256(featureSets);
  const qualityHash = canonicalLafeaSha256(quality);
  const base = {
    schema: LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_PACKAGE_SCHEMA,
    generatorRevision: LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_GENERATOR_REVISION,
    spec,
    specHash,
    mesh,
    sidecar,
    featureSets,
    quality,
    meshHash,
    sidecarHash,
    featureSetHash,
    qualityHash,
    status,
    reasons,
    authority: candidateAuthority(),
  };
  return deepFreeze({
    ...base,
    semanticHash: canonicalLafeaSha256(packageSemanticIdentity(base)),
  });
}

export function validateLafeaLugPinholeProbeStableT6MeshPackage(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw meshError('LAFEA_B01_CANDIDATE_PACKAGE_NOT_RECORD');
    }
    if (value.schema !== LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_PACKAGE_SCHEMA
      || value.generatorRevision
        !== LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_GENERATOR_REVISION) {
      throw meshError('LAFEA_B01_CANDIDATE_PACKAGE_SCHEMA_INVALID');
    }
    assertCandidateAuthority(value.authority);
    const spec = canonicalSpec(value.spec);
    if (canonicalLafeaSha256(spec) !== value.specHash) {
      throw meshError('LAFEA_B01_CANDIDATE_SPEC_HASH_MISMATCH');
    }
    if (canonicalLafeaSha256(value.mesh) !== value.meshHash) {
      throw meshError('LAFEA_B01_CANDIDATE_MESH_HASH_MISMATCH');
    }
    if (canonicalLafeaSha256(value.sidecar) !== value.sidecarHash) {
      throw meshError('LAFEA_B01_CANDIDATE_SIDECAR_HASH_MISMATCH');
    }
    if (canonicalLafeaSha256(value.featureSets) !== value.featureSetHash) {
      throw meshError('LAFEA_B01_CANDIDATE_FEATURE_SET_HASH_MISMATCH');
    }
    const independentQuality = evaluateCandidateMeshQuality(
      value.mesh,
      value.featureSets,
      spec,
    );
    const expectedReasons = candidateQualityReasons(independentQuality);
    const expectedStatus = expectedReasons.length === 0
      ? 'CANDIDATE_MESH_READY_NOT_PRODUCTION'
      : 'CANDIDATE_MESH_BLOCKED';
    if (value.status !== expectedStatus
      || JSON.stringify(value.reasons) !== JSON.stringify(expectedReasons)) {
      throw meshError('LAFEA_B01_CANDIDATE_QUALITY_STATUS_MISMATCH');
    }
    if (JSON.stringify(independentQuality) !== JSON.stringify(value.quality)
      || canonicalLafeaSha256(value.quality) !== value.qualityHash) {
      throw meshError('LAFEA_B01_CANDIDATE_QUALITY_EVIDENCE_MISMATCH');
    }
    if (canonicalLafeaSha256(packageSemanticIdentity(value))
      !== value.semanticHash) {
      throw meshError('LAFEA_B01_CANDIDATE_PACKAGE_SEMANTIC_HASH_MISMATCH');
    }
    const rebuilt = generateLafeaLugPinholeProbeStableT6Mesh(spec);
    if (rebuilt.semanticHash !== value.semanticHash
      || rebuilt.specHash !== value.specHash
      || rebuilt.meshHash !== value.meshHash
      || rebuilt.sidecarHash !== value.sidecarHash
      || rebuilt.featureSetHash !== value.featureSetHash
      || rebuilt.qualityHash !== value.qualityHash
      || rebuilt.status !== value.status
      || JSON.stringify(rebuilt.reasons) !== JSON.stringify(value.reasons)) {
      throw meshError('LAFEA_B01_CANDIDATE_PACKAGE_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw meshError('LAFEA_B01_CANDIDATE_PACKAGE_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_CANDIDATE_PACKAGE_INVALID'],
    });
  }
}

export function observeLafeaLugPinholeProbeStableT6Topology(
  packageValue,
  locationValue,
) {
  if (!packageValue
    || packageValue.schema !== LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_PACKAGE_SCHEMA) {
    throw meshError('LAFEA_B01_CANDIDATE_TOPOLOGY_PACKAGE_INVALID');
  }
  assertCandidateAuthority(packageValue.authority);
  const location = canonicalLocation(locationValue);
  const located = locatePoint(packageValue.mesh, location.x, location.y);
  const parsed = parseElementId(located.element.elementId);
  if (!parsed) throw meshError('LAFEA_B01_CANDIDATE_ELEMENT_ID_INVALID');
  const cellId = `CANDIDATE:L${packageValue.spec.ordinal}:R${parsed.ring}:S${parsed.sector}`;
  const cell = packageValue.sidecar.cells.find((row) => row.cellId === cellId);
  if (!cell) throw meshError('LAFEA_B01_CANDIDATE_CELL_SIDECAR_MISSING');
  const radialAnchor = findAnchor(
    packageValue.sidecar.radialAxis.anchorCells,
    location.radius,
  );
  const circumferentialAnchor = findAnchor(
    packageValue.sidecar.circumferentialAxis.anchorCells,
    normalizeDegrees(location.angleDegrees),
  );
  if (!radialAnchor || !circumferentialAnchor) {
    throw meshError('LAFEA_B01_CANDIDATE_PROBE_ANCHOR_MISSING');
  }
  if (radialAnchor.cellIndex !== parsed.ring
    || circumferentialAnchor.cellIndex !== parsed.sector) {
    throw meshError('LAFEA_B01_CANDIDATE_PROBE_ANCHOR_CELL_MISMATCH');
  }
  const mapping = mapT6WithJacobian(
    located.nodes,
    located.natural.xi,
    located.natural.eta,
  );
  if (!(mapping.determinant > 0)) {
    throw meshError('LAFEA_B01_CANDIDATE_PROBE_JACOBIAN_NON_POSITIVE');
  }
  const lambda1 = clean(1 - located.natural.xi - located.natural.eta);
  const lambda2 = clean(located.natural.xi);
  const lambda3 = clean(located.natural.eta);
  const minimumNaturalMargin = Math.min(lambda1, lambda2, lambda3);
  if (!(minimumNaturalMargin > NATURAL_TOLERANCE)) {
    throw meshError('LAFEA_B01_CANDIDATE_PROBE_ON_ELEMENT_BOUNDARY');
  }
  const signedCornerArea = signedTriangleArea(located.nodes.slice(0, 3));
  if (!(signedCornerArea > 0)) {
    throw meshError('LAFEA_B01_CANDIDATE_PROBE_ORIENTATION_INVALID');
  }
  const scale = Math.max(1, ...located.nodes.flatMap((row) => [
    Math.abs(row.x), Math.abs(row.y),
  ]));
  const minimumNodeDistance = Math.min(...packageValue.mesh.nodes.map((node) =>
    Math.hypot(node.x - location.x, node.y - location.y)));
  const onProtectedFeatureLine = packageValue.spec.protectedFeatureLinesDegrees
    .some((row) => angularDistanceDegrees(row, location.angleDegrees) <= TOLERANCE);
  const naturalCoordinates = deepFreeze({
    xi: clean(located.natural.xi),
    eta: clean(located.natural.eta),
    lambda1,
    lambda2,
    lambda3,
  });
  const base = {
    schema: LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_TOPOLOGY_SCHEMA,
    designId: packageValue.spec.designId,
    ordinal: packageValue.spec.ordinal,
    meshIdentity: packageValue.mesh.meshIdentity,
    meshHash: packageValue.meshHash,
    location,
    elementId: located.element.elementId,
    cellId,
    radialCellIndex: parsed.ring,
    circumferentialCellIndex: parsed.sector,
    triangleSide: parsed.side,
    orientation: 'COUNTER_CLOCKWISE',
    naturalCoordinates,
    minimumNaturalMargin,
    mappingResidual: Math.hypot(
      mapping.x - location.x,
      mapping.y - location.y,
    ),
    jacobianDeterminant: mapping.determinant,
    signedCornerArea,
    containmentCandidateCount: 1,
    minimumNodeDistance,
    onNode: minimumNodeDistance <= 1e-10 * scale,
    onElementEdgeOrDiagonal: minimumNaturalMargin <= NATURAL_TOLERANCE,
    onProtectedFeatureLine,
    radialAnchor: {
      anchorId: radialAnchor.anchorId,
      anchorCellId: radialAnchor.cellId,
      parentAnchorCellId: radialAnchor.parentCellId,
      cellIndex: radialAnchor.cellIndex,
      phase: radialAnchor.phase,
    },
    circumferentialAnchor: {
      anchorId: circumferentialAnchor.anchorId,
      anchorCellId: circumferentialAnchor.cellId,
      parentAnchorCellId: circumferentialAnchor.parentCellId,
      cellIndex: circumferentialAnchor.cellIndex,
      phase: circumferentialAnchor.phase,
    },
    topologySignature: canonicalLafeaSha256({
      schema: 'lafea-bucket-01-candidate-compatible-topology/v1',
      elementFamily: 'ANNULAR_T6_TWO_TRIANGLE_CELL',
      triangleSide: parsed.side,
      orientation: 'COUNTER_CLOCKWISE',
    }),
    status: 'PASS',
    authority: candidateAuthority(),
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function canonicalSpec(value) {
  exactKeys(value, SPEC_KEYS, 'candidate mesh spec');
  if (value.schema !== LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_SPEC_SCHEMA) {
    throw meshError('LAFEA_B01_CANDIDATE_SPEC_SCHEMA_INVALID');
  }
  exactKeys(value.center, CENTER_KEYS, 'candidate mesh center');
  const ordinal = positiveInteger(value.ordinal, 'ordinal');
  const radialAxis = canonicalAxis(value.radialAxis, 'RADIAL_LENGTH', ordinal);
  const circumferentialAxis = canonicalAxis(
    value.circumferentialAxis,
    'POLAR_ANGLE_DEGREES',
    ordinal,
  );
  if (!(radialAxis.domainStart > 0)
    || !(radialAxis.domainEnd > radialAxis.domainStart)) {
    throw meshError('LAFEA_B01_CANDIDATE_RADIAL_DOMAIN_INVALID');
  }
  if (Math.abs(
    circumferentialAxis.domainEnd
      - circumferentialAxis.domainStart - 360,
  ) > TOLERANCE) {
    throw meshError('LAFEA_B01_CANDIDATE_ANGLE_SPAN_INVALID');
  }
  const protectedFeatureLinesDegrees = value.protectedFeatureLinesDegrees
    .map((row) => normalizeDegrees(finite(row, 'protectedFeatureLine')));
  if (JSON.stringify(protectedFeatureLinesDegrees)
    !== JSON.stringify(CARDINAL_LINES)) {
    throw meshError('LAFEA_B01_CANDIDATE_CARDINAL_FEATURE_POLICY_INVALID');
  }
  for (const feature of CARDINAL_LINES) {
    if (!circumferentialAxis.coordinates.includes(feature)) {
      throw meshError('LAFEA_B01_CANDIDATE_CARDINAL_FEATURE_MISSING');
    }
  }
  return deepFreeze({
    schema: LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_SPEC_SCHEMA,
    meshIdentity: text(value.meshIdentity, 'meshIdentity'),
    designId: text(value.designId, 'designId'),
    ordinal,
    center: {
      x: finite(value.center.x, 'center.x'),
      y: finite(value.center.y, 'center.y'),
    },
    radialAxis,
    circumferentialAxis,
    protectedFeatureLinesDegrees,
  });
}

function canonicalAxis(value, expectedKind, ordinal) {
  exactKeys(value, AXIS_KEYS, `${expectedKind} axis`);
  const axisId = text(value.axisId, 'axisId');
  if (value.axisKind !== expectedKind || value.ordinal !== ordinal) {
    throw meshError('LAFEA_B01_CANDIDATE_AXIS_IDENTITY_INVALID');
  }
  const domainStart = finite(value.domainStart, 'axis.domainStart');
  const domainEnd = finite(value.domainEnd, 'axis.domainEnd');
  const coordinates = value.coordinates.map((row) => finite(row, 'coordinate'));
  if (coordinates.length < 2
    || coordinates[0] !== domainStart
    || coordinates.at(-1) !== domainEnd) {
    throw meshError('LAFEA_B01_CANDIDATE_AXIS_DOMAIN_COVERAGE_INVALID');
  }
  for (let index = 1; index < coordinates.length; index += 1) {
    if (!(coordinates[index] > coordinates[index - 1])) {
      throw meshError('LAFEA_B01_CANDIDATE_AXIS_COORDINATE_ORDER_INVALID');
    }
  }
  const coordinateHash = sha256(value.coordinateHash, 'coordinateHash');
  const expectedCoordinateHash = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-probe-stable-axis-coordinates/v1',
    axisId,
    ordinal,
    coordinates,
  });
  if (coordinateHash !== expectedCoordinateHash) {
    throw meshError('LAFEA_B01_CANDIDATE_AXIS_COORDINATE_HASH_MISMATCH');
  }
  const protectedBreakpoints = value.protectedBreakpoints
    .map((row) => finite(row, 'protectedBreakpoint'));
  const anchorCells = value.anchorCells.map((row) => {
    exactKeys(row, ANCHOR_KEYS, 'anchor cell');
    return {
      anchorId: text(row.anchorId, 'anchorId'),
      anchorValue: finite(row.anchorValue, 'anchorValue'),
      cellIndex: nonNegativeInteger(row.cellIndex, 'cellIndex'),
      left: finite(row.left, 'left'),
      right: finite(row.right, 'right'),
      width: positive(row.width, 'width'),
      phase: finite(row.phase, 'phase'),
      distanceToLeft: positive(row.distanceToLeft, 'distanceToLeft'),
      distanceToRight: positive(row.distanceToRight, 'distanceToRight'),
      cellId: text(row.cellId, 'cellId'),
      parentCellId: row.parentCellId === null
        ? null : text(row.parentCellId, 'parentCellId'),
    };
  }).sort((left, right) => left.left - right.left);
  if (new Set(anchorCells.map((row) => row.anchorId)).size
      !== anchorCells.length
    || new Set(anchorCells.map((row) => row.anchorValue)).size
      !== anchorCells.length) {
    throw meshError('LAFEA_B01_CANDIDATE_ANCHOR_DUPLICATE');
  }
  if (anchorCells.some((anchor) => coordinates.some((coordinate) =>
    Math.abs(coordinate - anchor.anchorValue) <= TOLERANCE))) {
    throw meshError('LAFEA_B01_CANDIDATE_ANCHOR_EMITTED_AS_GRIDLINE');
  }
  for (let index = 1; index < anchorCells.length; index += 1) {
    if (!(anchorCells[index - 1].right < anchorCells[index].left)) {
      throw meshError('LAFEA_B01_CANDIDATE_ANCHOR_WINDOWS_OVERLAP');
    }
  }
  if (protectedBreakpoints.some((breakpoint) => anchorCells.some((anchor) =>
    breakpoint > anchor.left - TOLERANCE
      && breakpoint < anchor.right + TOLERANCE))) {
    throw meshError('LAFEA_B01_CANDIDATE_BREAKPOINT_INSIDE_ANCHOR_WINDOW');
  }
  for (const anchor of anchorCells) {
    if (anchor.cellIndex >= coordinates.length - 1
      || coordinates[anchor.cellIndex] !== anchor.left
      || coordinates[anchor.cellIndex + 1] !== anchor.right
      || !(anchor.left < anchor.anchorValue
        && anchor.anchorValue < anchor.right)
      || Math.abs(anchor.right - anchor.left - anchor.width) > TOLERANCE
      || Math.abs(
        (anchor.anchorValue - anchor.left) / anchor.width - anchor.phase,
      ) > TOLERANCE) {
      throw meshError('LAFEA_B01_CANDIDATE_ANCHOR_CELL_INVALID');
    }
  }
  for (const breakpoint of protectedBreakpoints) {
    if (!coordinates.includes(breakpoint)) {
      throw meshError('LAFEA_B01_CANDIDATE_BREAKPOINT_NOT_RETAINED');
    }
  }
  return deepFreeze({
    axisId,
    axisKind: expectedKind,
    ordinal,
    domainStart,
    domainEnd,
    coordinates,
    coordinateHash,
    protectedBreakpoints,
    anchorCells,
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
  const radii = state.spec.radialAxis.coordinates;
  const angles = state.spec.circumferentialAxis.coordinates.slice(0, -1);
  for (let ring = 0; ring < radii.length; ring += 1) {
    for (let sector = 0; sector < angles.length; sector += 1) {
      const radius = radii[ring];
      const angleDegrees = angles[sector];
      const angle = angleDegrees * Math.PI / 180;
      addNode(state, cornerNodeId(ring, sector), {
        x: state.spec.center.x + radius * Math.cos(angle),
        y: state.spec.center.y + radius * Math.sin(angle),
        z: 0,
      }, {
        kind: 'CORNER', ring, sector, radius, angleDegrees,
      });
    }
  }
}

function createElements(state) {
  const radialCount = state.spec.radialAxis.coordinates.length - 1;
  const sectorCount = state.spec.circumferentialAxis.coordinates.length - 1;
  for (let ring = 0; ring < radialCount; ring += 1) {
    for (let sector = 0; sector < sectorCount; sector += 1) {
      const next = (sector + 1) % sectorCount;
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
  const corners = cornerIds.map((row) => requireNode(state, row));
  if (!(signedTriangleArea(corners) > 0)) {
    throw meshError('LAFEA_B01_CANDIDATE_ELEMENT_ORIENTATION_INVALID');
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
  let point;
  if (firstMeta?.kind === 'CORNER'
    && secondMeta?.kind === 'CORNER'
    && firstMeta.ring === secondMeta.ring) {
    const radius = firstMeta.radius;
    const ux = (first.x - state.spec.center.x) / radius
      + (second.x - state.spec.center.x) / radius;
    const uy = (first.y - state.spec.center.y) / radius
      + (second.y - state.spec.center.y) / radius;
    const norm = Math.hypot(ux, uy);
    if (!(norm > 0)) {
      throw meshError('LAFEA_B01_CANDIDATE_CIRCUMFERENTIAL_MIDSIDE_INVALID');
    }
    point = {
      x: state.spec.center.x + radius * ux / norm,
      y: state.spec.center.y + radius * uy / norm,
      z: 0,
    };
  } else {
    point = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
      z: 0,
    };
  }
  addNode(state, nodeId, point, {
    kind: 'MIDSIDE', edgeKey: key, firstId, secondId,
  });
  state.edgeMidpointIds.set(key, nodeId);
  return nodeId;
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

function createSidecar(state) {
  const radialAxis = axisSidecar(state.spec.radialAxis);
  const circumferentialAxis = axisSidecar(state.spec.circumferentialAxis);
  const radialByIndex = new Map(
    radialAxis.cells.map((row) => [row.cellIndex, row]),
  );
  const circumferentialByIndex = new Map(
    circumferentialAxis.cells.map((row) => [row.cellIndex, row]),
  );
  const cells = [];
  for (let ring = 0; ring < radialAxis.cells.length; ring += 1) {
    for (let sector = 0;
      sector < circumferentialAxis.cells.length;
      sector += 1) {
      const radial = radialByIndex.get(ring);
      const circumferential = circumferentialByIndex.get(sector);
      cells.push(deepFreeze({
        cellId: `CANDIDATE:L${state.spec.ordinal}:R${ring}:S${sector}`,
        radialCellId: radial.cellId,
        circumferentialCellId: circumferential.cellId,
        radialAnchorId: radial.anchorId,
        radialAnchorCellId: radial.anchorCellId,
        parentRadialAnchorCellId: radial.parentAnchorCellId,
        circumferentialAnchorId: circumferential.anchorId,
        circumferentialAnchorCellId: circumferential.anchorCellId,
        parentCircumferentialAnchorCellId:
          circumferential.parentAnchorCellId,
        triangleElementIds: [
          `E-R${ring}-S${sector}-A`,
          `E-R${ring}-S${sector}-B`,
        ],
      }));
    }
  }
  const base = {
    schema: 'lafea-lug-pinhole-probe-stable-t6-sidecar/v1',
    designId: state.spec.designId,
    ordinal: state.spec.ordinal,
    radialAxis,
    circumferentialAxis,
    cells,
    authority: candidateAuthority(),
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function axisSidecar(axis) {
  const anchorByCellIndex = new Map(
    axis.anchorCells.map((row) => [row.cellIndex, row]),
  );
  const cells = axis.coordinates.slice(1).map((right, cellIndex) => {
    const left = axis.coordinates[cellIndex];
    const anchor = anchorByCellIndex.get(cellIndex) ?? null;
    return deepFreeze({
      cellIndex,
      cellId: `${axis.axisId}:CELL:L${axis.ordinal}:${cellIndex}`,
      left,
      right,
      width: right - left,
      anchorId: anchor?.anchorId ?? null,
      anchorValue: anchor?.anchorValue ?? null,
      anchorCellId: anchor?.cellId ?? null,
      parentAnchorCellId: anchor?.parentCellId ?? null,
    });
  });
  return deepFreeze({
    axisId: axis.axisId,
    axisKind: axis.axisKind,
    ordinal: axis.ordinal,
    coordinateHash: axis.coordinateHash,
    coordinates: axis.coordinates,
    anchorCells: axis.anchorCells,
    cells,
  });
}

function createFeatureSets(state) {
  const radialCount = state.spec.radialAxis.coordinates.length - 1;
  const sectorCount = state.spec.circumferentialAxis.coordinates.length - 1;
  const holeBoundary = circularBoundaryFeature(state, 0, 'HOLE_BOUNDARY');
  const outerBoundary = circularBoundaryFeature(
    state,
    radialCount,
    'OUTER_BOUNDARY',
  );
  const radialLines = CARDINAL_LINES.map((angleDegrees) => {
    const sector = state.spec.circumferentialAxis.coordinates
      .indexOf(angleDegrees);
    if (sector < 0 || sector >= sectorCount) {
      throw meshError('LAFEA_B01_CANDIDATE_CARDINAL_FEATURE_MISSING');
    }
    const cornerNodeIds = [];
    for (let ring = 0; ring <= radialCount; ring += 1) {
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
      role: `RADIAL_FEATURE_${angleDegrees}`,
      angleDegrees,
      sector,
      nodeIds,
    });
  });
  return deepFreeze({
    schema: 'lafea-lug-pinhole-probe-stable-feature-sets/v1',
    holeBoundary,
    outerBoundary,
    radialLines,
  });
}

function circularBoundaryFeature(state, ring, role) {
  const sectorCount = state.spec.circumferentialAxis.coordinates.length - 1;
  const edgeNodeIds = [];
  const nodeIds = [];
  for (let sector = 0; sector < sectorCount; sector += 1) {
    const next = (sector + 1) % sectorCount;
    const first = cornerNodeId(ring, sector);
    const second = cornerNodeId(ring, next);
    const mid = midpointNodeId(state, first, second);
    edgeNodeIds.push(Object.freeze([first, mid, second]));
    nodeIds.push(first, mid);
  }
  return deepFreeze({ role, ring, nodeIds, edgeNodeIds });
}

function evaluateCandidateMeshQuality(mesh, featureSets, spec) {
  const nodeById = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  let minimumScaledJacobian = Number.POSITIVE_INFINITY;
  let minimumScaledJacobianElementId = null;
  let minimumIntegrationPointJacobian = Number.POSITIVE_INFINITY;
  let minimumIntegrationPointJacobianElementId = null;
  let minimumDenseJacobian = Number.POSITIVE_INFINITY;
  let minimumDenseJacobianElementId = null;
  let nonPositiveDenseJacobianSampleCount = 0;
  let maximumAspectRatio = 0;
  let maximumAspectRatioElementId = null;
  let minimumAngleDegrees = Number.POSITIVE_INFINITY;
  let minimumAngleElementId = null;
  let integratedArea = 0;
  for (const element of mesh.elements) {
    const nodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
    if (nodes.some((row) => !row)) {
      throw meshError('LAFEA_B01_CANDIDATE_MESH_NODE_MISSING');
    }
    const corners = nodes.slice(0, 3);
    const scaledJacobian = minimumScaledJacobianOf('T6', nodes);
    if (scaledJacobian < minimumScaledJacobian) {
      minimumScaledJacobian = scaledJacobian;
      minimumScaledJacobianElementId = element.elementId;
    }
    const aspectRatio = aspectRatioOf(corners);
    if (aspectRatio > maximumAspectRatio) {
      maximumAspectRatio = aspectRatio;
      maximumAspectRatioElementId = element.elementId;
    }
    const minimumAngle = minimumAngleDegreesOf(corners);
    if (minimumAngle < minimumAngleDegrees) {
      minimumAngleDegrees = minimumAngle;
      minimumAngleElementId = element.elementId;
    }
    for (const point of AREA_POINTS) {
      const jacobian = jacobianAt(
        t6ShapeFunctions(point.xi, point.eta),
        nodes,
      );
      if (jacobian.determinant < minimumIntegrationPointJacobian) {
        minimumIntegrationPointJacobian = jacobian.determinant;
        minimumIntegrationPointJacobianElementId = element.elementId;
      }
      integratedArea += jacobian.determinant * point.weight;
    }
    for (let i = 0; i <= DENSE_JACOBIAN_DIVISIONS; i += 1) {
      for (let j = 0; j <= DENSE_JACOBIAN_DIVISIONS - i; j += 1) {
        const determinant = jacobianAt(
          t6ShapeFunctions(
            i / DENSE_JACOBIAN_DIVISIONS,
            j / DENSE_JACOBIAN_DIVISIONS,
          ),
          nodes,
        ).determinant;
        if (determinant < minimumDenseJacobian) {
          minimumDenseJacobian = determinant;
          minimumDenseJacobianElementId = element.elementId;
        }
        if (!(determinant > 0)) nonPositiveDenseJacobianSampleCount += 1;
      }
    }
  }
  const holeRadius = spec.radialAxis.domainStart;
  const outerRadius = spec.radialAxis.domainEnd;
  const analyticalArea = Math.PI * (outerRadius ** 2 - holeRadius ** 2);
  return deepFreeze({
    schema: 'lafea-lug-pinhole-probe-stable-mesh-quality/v1',
    nodeCount: mesh.nodes.length,
    elementCount: mesh.elements.length,
    minimumScaledJacobian,
    minimumScaledJacobianElementId,
    minimumIntegrationPointJacobian,
    minimumIntegrationPointJacobianElementId,
    denseJacobianSampleDivisions: DENSE_JACOBIAN_DIVISIONS,
    minimumDenseJacobian,
    minimumDenseJacobianElementId,
    nonPositiveDenseJacobianSampleCount,
    maximumAspectRatio,
    maximumAspectRatioElementId,
    minimumAngleDegrees,
    minimumAngleElementId,
    integratedArea,
    analyticalArea,
    relativeAreaError: Math.abs(integratedArea - analyticalArea) / analyticalArea,
    holeBoundaryMaximumRadiusError: boundaryRadiusError(
      featureSets.holeBoundary,
      nodeById,
      spec.center,
      holeRadius,
    ),
    outerBoundaryMaximumRadiusError: boundaryRadiusError(
      featureSets.outerBoundary,
      nodeById,
      spec.center,
      outerRadius,
    ),
  });
}

function candidateQualityReasons(quality) {
  const reasons = [];
  if (!(quality.minimumScaledJacobian > 0)) {
    reasons.push('NON_POSITIVE_SCALED_JACOBIAN');
  }
  if (!(quality.minimumIntegrationPointJacobian > 0)) {
    reasons.push('NON_POSITIVE_INTEGRATION_POINT_JACOBIAN');
  }
  if (!(quality.minimumDenseJacobian > 0)
    || quality.nonPositiveDenseJacobianSampleCount > 0) {
    reasons.push('NON_POSITIVE_DENSE_JACOBIAN');
  }
  return deepFreeze(reasons);
}

function boundaryRadiusError(feature, nodeById, center, expected) {
  let maximum = 0;
  for (const nodeId of feature.nodeIds) {
    const node = nodeById.get(nodeId);
    if (!node) throw meshError('LAFEA_B01_CANDIDATE_FEATURE_NODE_MISSING');
    maximum = Math.max(maximum, Math.abs(
      Math.hypot(node.x - center.x, node.y - center.y) - expected,
    ));
  }
  return maximum;
}

function locatePoint(mesh, x, y) {
  const nodeById = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  const candidates = [];
  for (const element of mesh.elements) {
    if (element.elementType !== 'T6' || element.nodeIds.length !== 6) continue;
    const nodes = element.nodeIds.map((row) => nodeById.get(row));
    if (nodes.some((row) => !row)) {
      throw meshError('LAFEA_B01_CANDIDATE_MESH_NODE_MISSING');
    }
    const natural = invertT6(nodes, x, y);
    if (natural && insideNaturalTriangle(natural.xi, natural.eta)) {
      candidates.push({ element, nodes, natural });
    }
  }
  if (candidates.length === 0) {
    throw meshError('LAFEA_B01_CANDIDATE_PROBE_OUTSIDE_MESH');
  }
  if (candidates.length !== 1) {
    throw meshError('LAFEA_B01_CANDIDATE_PROBE_CONTAINMENT_AMBIGUOUS');
  }
  return candidates[0];
}

function invertT6(nodes, x, y) {
  const [a, b, c] = nodes;
  const denominator = (b.x - a.x) * (c.y - a.y)
    - (c.x - a.x) * (b.y - a.y);
  if (denominator === 0) return null;
  let xi = ((x - a.x) * (c.y - a.y)
    - (c.x - a.x) * (y - a.y)) / denominator;
  let eta = ((b.x - a.x) * (y - a.y)
    - (x - a.x) * (b.y - a.y)) / denominator;
  const scale = Math.max(1, ...nodes.flatMap((row) => [
    Math.abs(row.x), Math.abs(row.y),
  ]));
  for (let iteration = 0; iteration < NEWTON_LIMIT; iteration += 1) {
    const mapped = mapT6WithJacobian(nodes, xi, eta);
    const residualX = mapped.x - x;
    const residualY = mapped.y - y;
    if (Math.hypot(residualX, residualY) <= 1e-12 * scale) {
      return { xi, eta };
    }
    if (!(Math.abs(mapped.determinant) > 1e-18 * scale * scale)) return null;
    const deltaXi = (mapped.dyDeta * residualX
      - mapped.dxDeta * residualY) / mapped.determinant;
    const deltaEta = (-mapped.dyDxi * residualX
      + mapped.dxDxi * residualY) / mapped.determinant;
    xi -= deltaXi;
    eta -= deltaEta;
    if (!Number.isFinite(xi) || !Number.isFinite(eta)) return null;
  }
  const mapped = mapT6WithJacobian(nodes, xi, eta);
  return Math.hypot(mapped.x - x, mapped.y - y) <= 1e-9 * scale
    ? { xi, eta } : null;
}

function mapT6WithJacobian(nodes, xi, eta) {
  const shape = t6ShapeFunctions(xi, eta);
  let x = 0; let y = 0;
  for (let index = 0; index < nodes.length; index += 1) {
    x += shape.N[index] * nodes[index].x;
    y += shape.N[index] * nodes[index].y;
  }
  return { x, y, ...jacobianAt(shape, nodes) };
}

function insideNaturalTriangle(xi, eta) {
  return xi >= -NATURAL_TOLERANCE
    && eta >= -NATURAL_TOLERANCE
    && xi + eta <= 1 + NATURAL_TOLERANCE;
}

function canonicalLocation(value) {
  return deepFreeze({
    probeId: text(value.probeId, 'probeId'),
    x: finite(value.x, 'x'),
    y: finite(value.y, 'y'),
    radius: positive(value.radius, 'radius'),
    angleDegrees: normalizeDegrees(finite(value.angleDegrees, 'angleDegrees')),
  });
}

function findAnchor(anchors, value) {
  return anchors.find((row) => Math.abs(row.anchorValue - value) <= TOLERANCE)
    ?? null;
}

function parseElementId(value) {
  const match = ELEMENT_PATTERN.exec(value);
  return match ? {
    ring: Number(match.groups.ring),
    sector: Number(match.groups.sector),
    side: match.groups.side,
  } : null;
}

function packageSemanticIdentity(value) {
  return {
    schema: value.schema,
    generatorRevision: value.generatorRevision,
    specHash: value.specHash,
    meshHash: value.meshHash,
    sidecarHash: value.sidecarHash,
    featureSetHash: value.featureSetHash,
    qualityHash: value.qualityHash,
    status: value.status,
    reasons: value.reasons,
    authority: value.authority,
  };
}

function candidateAuthority() {
  return deepFreeze({
    candidateMeshOnly: true,
    productionMeshAuthority: false,
    stressAcceptanceAuthority: false,
    qualificationAuthority: false,
    bucketQualified: false,
  });
}

function assertCandidateAuthority(value) {
  if (!value
    || value.candidateMeshOnly !== true
    || value.productionMeshAuthority !== false
    || value.stressAcceptanceAuthority !== false
    || value.qualificationAuthority !== false
    || value.bucketQualified !== false) {
    throw meshError('LAFEA_B01_CANDIDATE_PRODUCTION_AUTHORITY_FORBIDDEN');
  }
}

function addNode(state, nodeId, point, metadata) {
  if (state.nodes.has(nodeId)) {
    throw meshError('LAFEA_B01_CANDIDATE_NODE_ID_DUPLICATE');
  }
  state.nodes.set(nodeId, Object.freeze({
    x: clean(point.x), y: clean(point.y), z: clean(point.z ?? 0),
  }));
  state.nodeMetadata.set(nodeId, Object.freeze({ ...metadata }));
}

function requireNode(state, nodeId) {
  const node = state.nodes.get(nodeId);
  if (!node) throw meshError('LAFEA_B01_CANDIDATE_NODE_MISSING');
  return node;
}

function cornerNodeId(ring, sector) { return `C-R${ring}-S${sector}`; }
function edgeKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }
function signedTriangleArea([a, b, c]) {
  return ((b.x - a.x) * (c.y - a.y)
    - (c.x - a.x) * (b.y - a.y)) / 2;
}
function angularDistanceDegrees(a, b) {
  const difference = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return Math.min(difference, 360 - difference);
}
function normalizeDegrees(value) {
  const normalized = value % 360;
  return clean(normalized < 0 ? normalized + 360 : normalized);
}
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw meshError('LAFEA_B01_CANDIDATE_EXACT_KEYS_INVALID', label);
  }
}
function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw meshError('LAFEA_B01_CANDIDATE_FINITE_REQUIRED', label);
  }
  return clean(value);
}
function positive(value, label) {
  const result = finite(value, label);
  if (!(result > 0)) throw meshError('LAFEA_B01_CANDIDATE_POSITIVE_REQUIRED', label);
  return result;
}
function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw meshError('LAFEA_B01_CANDIDATE_POSITIVE_INTEGER_REQUIRED', label);
  }
  return value;
}
function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw meshError('LAFEA_B01_CANDIDATE_NONNEGATIVE_INTEGER_REQUIRED', label);
  }
  return value;
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw meshError('LAFEA_B01_CANDIDATE_TEXT_REQUIRED', label);
  }
  return value;
}
function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw meshError('LAFEA_B01_CANDIDATE_SHA256_REQUIRED', label);
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
function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
