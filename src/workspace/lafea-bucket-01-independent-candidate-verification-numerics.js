import {
  CORNER_PATTERN,
  NATURAL_TOLERANCE,
  NEWTON_LIMIT,
  clean,
  edgeKey,
  near,
  normalizeDegrees,
  radiusOf,
  verificationError,
} from './lafea-bucket-01-independent-candidate-verification-internal.js';

export function classifyEdge(aId, bId, radialCellCount) {
  const a = CORNER_PATTERN.exec(aId);
  const b = CORNER_PATTERN.exec(bId);
  if (!a || !b) throw verificationError('LAFEA_B01_INDEPENDENT_CORNER_ID_INVALID');
  const ringA = Number(a.groups.ring);
  const ringB = Number(b.groups.ring);
  const sectorA = Number(a.groups.sector);
  const sectorB = Number(b.groups.sector);
  if (ringA === ringB) {
    if (ringA === 0) return 'HOLE_BOUNDARY_CIRCUMFERENTIAL';
    if (ringA === radialCellCount) return 'OUTER_BOUNDARY_CIRCUMFERENTIAL';
    return 'INTERNAL_CIRCUMFERENTIAL';
  }
  return sectorA === sectorB ? 'RADIAL' : 'DIAGONAL';
}

export function expectedMidside(classification, a, b, center, radii) {
  if (classification !== 'HOLE_BOUNDARY_CIRCUMFERENTIAL'
    && classification !== 'OUTER_BOUNDARY_CIRCUMFERENTIAL') {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 };
  }
  const radius = classification === 'HOLE_BOUNDARY_CIRCUMFERENTIAL'
    ? radii[0] : radii.at(-1);
  const ux = (a.x - center.x) / radius + (b.x - center.x) / radius;
  const uy = (a.y - center.y) / radius + (b.y - center.y) / radius;
  const norm = Math.hypot(ux, uy);
  if (!(norm > 0)) throw verificationError('LAFEA_B01_INDEPENDENT_ANALYTIC_MIDSIDE_INVALID');
  return {
    x: center.x + radius * ux / norm,
    y: center.y + radius * uy / norm,
    z: 0,
  };
}

export function qualityRecordsMatch(actual, supplied) {
  const numericKeys = [
    'nodeCount', 'elementCount', 'minimumScaledJacobian',
    'minimumIntegrationPointJacobian', 'denseJacobianSampleDivisions',
    'minimumDenseJacobian', 'nonPositiveDenseJacobianSampleCount',
    'maximumAspectRatio', 'minimumAngleDegrees', 'integratedArea',
    'analyticalArea', 'relativeAreaError',
    'holeBoundaryMaximumRadiusError', 'outerBoundaryMaximumRadiusError',
  ];
  const textKeys = [
    'schema', 'minimumScaledJacobianElementId',
    'minimumIntegrationPointJacobianElementId',
    'minimumDenseJacobianElementId', 'maximumAspectRatioElementId',
    'minimumAngleElementId',
  ];
  return numericKeys.every((key) => near(actual[key], supplied?.[key], 1e-12))
    && textKeys.every((key) => actual[key] === supplied?.[key]);
}

export function t6Shape(xi, eta) {
  const l1 = 1 - xi - eta;
  const l2 = xi;
  const l3 = eta;
  return {
    N: [
      l1 * (2 * l1 - 1),
      l2 * (2 * l2 - 1),
      l3 * (2 * l3 - 1),
      4 * l1 * l2,
      4 * l2 * l3,
      4 * l3 * l1,
    ],
    dXi: [
      4 * xi + 4 * eta - 3,
      4 * xi - 1,
      0,
      4 * (1 - 2 * xi - eta),
      4 * eta,
      -4 * eta,
    ],
    dEta: [
      4 * xi + 4 * eta - 3,
      0,
      4 * eta - 1,
      -4 * xi,
      4 * xi,
      4 * (1 - xi - 2 * eta),
    ],
  };
}

export function mapT6(nodes, xi, eta) {
  const shape = t6Shape(xi, eta);
  let x = 0; let y = 0;
  let dxXi = 0; let dyXi = 0; let dxEta = 0; let dyEta = 0;
  for (let index = 0; index < 6; index += 1) {
    x += shape.N[index] * nodes[index].x;
    y += shape.N[index] * nodes[index].y;
    dxXi += shape.dXi[index] * nodes[index].x;
    dyXi += shape.dXi[index] * nodes[index].y;
    dxEta += shape.dEta[index] * nodes[index].x;
    dyEta += shape.dEta[index] * nodes[index].y;
  }
  return {
    x,
    y,
    dxXi,
    dyXi,
    dxEta,
    dyEta,
    determinant: dxXi * dyEta - dxEta * dyXi,
  };
}

export function scaledJacobianAt(nodes, xi, eta) {
  const mapped = mapT6(nodes, xi, eta);
  const first = Math.hypot(mapped.dxXi, mapped.dyXi);
  const second = Math.hypot(mapped.dxEta, mapped.dyEta);
  return first === 0 || second === 0 ? 0 : mapped.determinant / (first * second);
}

export function invertT6(nodes, x, y) {
  const initial = linearNatural(nodes.slice(0, 3), x, y);
  if (!initial) return null;
  let xi = initial.xi;
  let eta = initial.eta;
  const scale = Math.max(1, ...nodes.flatMap((row) => [Math.abs(row.x), Math.abs(row.y)]));
  for (let iteration = 0; iteration < NEWTON_LIMIT; iteration += 1) {
    const mapped = mapT6(nodes, xi, eta);
    const rx = mapped.x - x;
    const ry = mapped.y - y;
    if (Math.hypot(rx, ry) <= 1e-12 * scale) return { xi, eta };
    if (Math.abs(mapped.determinant) <= 1e-16 * scale * scale) return null;
    const dXi = (mapped.dyEta * rx - mapped.dxEta * ry) / mapped.determinant;
    const dEta = (-mapped.dyXi * rx + mapped.dxXi * ry) / mapped.determinant;
    xi -= dXi;
    eta -= dEta;
    if (!Number.isFinite(xi) || !Number.isFinite(eta)) return null;
  }
  const mapped = mapT6(nodes, xi, eta);
  return Math.hypot(mapped.x - x, mapped.y - y) <= 1e-10 * scale
    ? { xi, eta } : null;
}

export function linearNatural(corners, x, y) {
  const [a, b, c] = corners;
  const determinant = (b.x - a.x) * (c.y - a.y)
    - (c.x - a.x) * (b.y - a.y);
  if (Math.abs(determinant) <= 1e-18) return null;
  return {
    xi: ((x - a.x) * (c.y - a.y) - (c.x - a.x) * (y - a.y)) / determinant,
    eta: ((b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y)) / determinant,
  };
}

export function insideNatural(xi, eta) {
  return xi >= -NATURAL_TOLERANCE
    && eta >= -NATURAL_TOLERANCE
    && 1 - xi - eta >= -NATURAL_TOLERANCE;
}

export function bboxContains(nodes, x, y) {
  const xs = nodes.map((row) => row.x);
  const ys = nodes.map((row) => row.y);
  const scale = Math.max(1, ...xs.map(Math.abs), ...ys.map(Math.abs));
  const tolerance = 1e-10 * scale;
  return x >= Math.min(...xs) - tolerance && x <= Math.max(...xs) + tolerance
    && y >= Math.min(...ys) - tolerance && y <= Math.max(...ys) + tolerance;
}

export function boundaryRadiusError(feature, nodeById, center, expectedRadius) {
  let maximum = 0;
  for (const nodeId of feature.nodeIds) {
    const node = nodeById.get(nodeId);
    if (!node) throw verificationError('LAFEA_B01_INDEPENDENT_FEATURE_NODE_MISSING');
    maximum = Math.max(maximum, Math.abs(radiusOf(node, center) - expectedRadius));
  }
  return maximum;
}

export function triangleAspectRatio(corners) {
  const lengths = corners.map((row, index) => {
    const next = corners[(index + 1) % corners.length];
    return Math.hypot(next.x - row.x, next.y - row.y);
  });
  const shortest = Math.min(...lengths);
  if (!(shortest > 0)) throw verificationError('LAFEA_B01_INDEPENDENT_DEGENERATE_ELEMENT');
  return Math.max(...lengths) / shortest;
}

export function minimumTriangleAngle(corners) {
  return Math.min(...[0, 1, 2].map((index) => {
    const a = corners[index];
    const b = corners[(index + 1) % 3];
    const c = corners[(index + 2) % 3];
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const ac = { x: c.x - a.x, y: c.y - a.y };
    return Math.atan2(
      Math.abs(ab.x * ac.y - ab.y * ac.x),
      ab.x * ac.x + ab.y * ac.y,
    ) * 180 / Math.PI;
  }));
}

export function signedTriangleArea(corners) {
  const [a, b, c] = corners;
  return ((b.x - a.x) * (c.y - a.y)
    - (c.x - a.x) * (b.y - a.y)) / 2;
}

export function findAnchor(anchorCells, value) {
  return anchorCells.find((row) => near(row.anchorValue, value, 1e-12)) ?? null;
}

export function anchorEvidence(anchor) {
  if (!anchor) return null;
  return {
    anchorId: anchor.anchorId,
    anchorCellId: anchor.cellId,
    parentAnchorCellId: anchor.parentCellId,
    cellIndex: anchor.cellIndex,
    phase: anchor.phase,
  };
}

export function allLocations(probeSpec) {
  return [
    ...probeSpec.probes.map((row) => ({
      probeId: row.probeId,
      x: row.x,
      y: row.y,
      radius: row.radius,
      angleDegrees: row.angleDegrees,
    })),
    ...probeSpec.paths.flatMap((pathValue) => pathValue.stations.map((row) => ({
      probeId: `${pathValue.pathId}:${row.stationId}`,
      x: row.x,
      y: row.y,
      radius: row.radius,
      angleDegrees: pathValue.angleDegrees,
    }))),
  ];
}
