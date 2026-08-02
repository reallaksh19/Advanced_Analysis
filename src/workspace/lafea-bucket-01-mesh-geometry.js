import {
  AREA_POINTS,
  BOUNDARY_SAMPLES_PER_EDGE,
  edgeLength,
  edgePoint,
  pointDistance,
  t6Jacobian,
} from './lafea-bucket-01-mesh-math.js';

export function inspectBucket01MeshGeometry(spec, mesh, featureSets, nodeById) {
  let integratedArea = 0;
  let maximumMidsidePlacementError = 0;
  const boundaryMidIds = new Set([
    ...featureSets.holeBoundary.edgeNodeIds.map((row) => row[1]),
    ...featureSets.outerBoundary.edgeNodeIds.map((row) => row[1]),
  ]);
  const seenMidsides = new Set();
  for (const element of mesh.elements) {
    if (element.elementType !== 'T6' || element.nodeIds.length !== 6) continue;
    const nodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
    for (const point of AREA_POINTS) {
      integratedArea += t6Jacobian(nodes, point.xi, point.eta) * point.weight;
    }
    for (const [aIndex, bIndex, midIndex] of [[0, 1, 3], [1, 2, 4], [2, 0, 5]]) {
      const midId = element.nodeIds[midIndex];
      if (seenMidsides.has(midId)) continue;
      seenMidsides.add(midId);
      const aId = element.nodeIds[aIndex]; const bId = element.nodeIds[bIndex];
      const a = nodes[aIndex]; const b = nodes[bIndex]; const mid = nodes[midIndex];
      const aCorner = /^C-R(\d+)-S(\d+)$/u.exec(aId);
      const bCorner = /^C-R(\d+)-S(\d+)$/u.exec(bId);
      const sameRing = aCorner && bCorner && aCorner[1] === bCorner[1];
      const difference = sameRing
        ? Math.abs(Number(aCorner[2]) - Number(bCorner[2])) : null;
      const circumferentialEdge = sameRing
        && (difference === 1 || difference === spec.circumferentialDivisions - 1);
      const expected = circumferentialEdge || boundaryMidIds.has(midId)
        ? circularMidpoint(a, b, spec.center)
        : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      maximumMidsidePlacementError = Math.max(
        maximumMidsidePlacementError,
        pointDistance(mid, expected),
      );
    }
  }
  const analyticalArea = Math.PI * (spec.outerRadius ** 2 - spec.holeRadius ** 2);
  const hole = circularBoundary(
    featureSets.holeBoundary.edgeNodeIds,
    nodeById,
    spec.center,
    spec.holeRadius,
  );
  const outer = circularBoundary(
    featureSets.outerBoundary.edgeNodeIds,
    nodeById,
    spec.center,
    spec.outerRadius,
  );
  const holeCenterError = oppositeCenterError(
    featureSets.holeBoundary.edgeNodeIds,
    nodeById,
    spec.center,
  );
  const ligament = inspectLigament(
    featureSets.holeBoundary.edgeNodeIds,
    featureSets.outerBoundary.edgeNodeIds,
    nodeById,
    spec.outerRadius - spec.holeRadius,
  );
  const rotationalSymmetryError = Math.max(
    rotationalError(featureSets.holeBoundary.edgeNodeIds, nodeById, spec.center),
    rotationalError(featureSets.outerBoundary.edgeNodeIds, nodeById, spec.center),
  );
  const analyticalPerimeter = 2 * Math.PI * (spec.holeRadius + spec.outerRadius);
  const integratedPerimeter = hole.integratedPerimeter + outer.integratedPerimeter;
  return Object.freeze({
    referenceLength: spec.holeRadius,
    integratedArea,
    analyticalArea,
    areaRelativeError: Math.abs(integratedArea - analyticalArea) / analyticalArea,
    holeBoundaryMaximumRadiusError: hole.maximumRadiusError,
    outerBoundaryMaximumRadiusError: outer.maximumRadiusError,
    maximumBoundaryDeviation: Math.max(
      hole.maximumRadiusError,
      outer.maximumRadiusError,
    ),
    holeCenterError,
    criticalLigamentMinimum: ligament.minimum,
    criticalLigamentMaximum: ligament.maximum,
    analyticalCriticalLigament: ligament.analytical,
    criticalLigamentRelativeError: ligament.relativeError,
    holePerimeter: hole.integratedPerimeter,
    outerPerimeter: outer.integratedPerimeter,
    integratedPerimeter,
    analyticalPerimeter,
    totalPerimeterRelativeError:
      Math.abs(integratedPerimeter - analyticalPerimeter) / analyticalPerimeter,
    maximumMidsidePlacementError,
    rotationalSymmetryError,
  });
}

function circularBoundary(edgeNodeIds, nodeById, center, radius) {
  let maximumRadiusError = 0;
  let integratedPerimeter = 0;
  for (const triplet of edgeNodeIds) {
    const nodes = triplet.map((nodeId) => nodeById.get(nodeId));
    for (let sample = 0; sample <= BOUNDARY_SAMPLES_PER_EDGE; sample += 1) {
      const point = edgePoint(nodes, sample / BOUNDARY_SAMPLES_PER_EDGE);
      maximumRadiusError = Math.max(
        maximumRadiusError,
        Math.abs(Math.hypot(point.x - center.x, point.y - center.y) - radius),
      );
    }
    integratedPerimeter += edgeLength(nodes);
  }
  return { maximumRadiusError, integratedPerimeter };
}

function oppositeCenterError(edgeNodeIds, nodeById, center) {
  const count = edgeNodeIds.length;
  let maximum = 0;
  for (let edge = 0; edge < count / 2; edge += 1) {
    const first = edgeNodeIds[edge].map((nodeId) => nodeById.get(nodeId));
    const opposite = edgeNodeIds[edge + count / 2]
      .map((nodeId) => nodeById.get(nodeId));
    for (let sample = 0; sample <= BOUNDARY_SAMPLES_PER_EDGE; sample += 1) {
      const t = sample / BOUNDARY_SAMPLES_PER_EDGE;
      const a = edgePoint(first, t); const b = edgePoint(opposite, t);
      maximum = Math.max(maximum, Math.hypot(
        (a.x + b.x) / 2 - center.x,
        (a.y + b.y) / 2 - center.y,
      ));
    }
  }
  return maximum;
}

function inspectLigament(holeEdges, outerEdges, nodeById, analytical) {
  if (holeEdges.length !== outerEdges.length) {
    throw geometryError('LAFEA_B01_BOUNDARY_EDGE_COUNT_MISMATCH');
  }
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = 0;
  for (let edge = 0; edge < holeEdges.length; edge += 1) {
    const hole = holeEdges[edge].map((nodeId) => nodeById.get(nodeId));
    const outer = outerEdges[edge].map((nodeId) => nodeById.get(nodeId));
    for (let sample = 0; sample <= BOUNDARY_SAMPLES_PER_EDGE; sample += 1) {
      const t = sample / BOUNDARY_SAMPLES_PER_EDGE;
      const distance = pointDistance(edgePoint(hole, t), edgePoint(outer, t));
      minimum = Math.min(minimum, distance);
      maximum = Math.max(maximum, distance);
    }
  }
  return {
    minimum,
    maximum,
    analytical,
    relativeError: Math.max(
      Math.abs(minimum - analytical),
      Math.abs(maximum - analytical),
    ) / analytical,
  };
}

function rotationalError(edgeNodeIds, nodeById, center) {
  const count = edgeNodeIds.length;
  let maximum = 0;
  for (let edge = 0; edge < count; edge += 1) {
    const current = edgeNodeIds[edge].map((nodeId) => nodeById.get(nodeId));
    const quarter = edgeNodeIds[(edge + count / 4) % count]
      .map((nodeId) => nodeById.get(nodeId));
    for (let sample = 0; sample <= BOUNDARY_SAMPLES_PER_EDGE; sample += 1) {
      const t = sample / BOUNDARY_SAMPLES_PER_EDGE;
      const a = edgePoint(current, t); const b = edgePoint(quarter, t);
      maximum = Math.max(maximum, pointDistance(b, {
        x: center.x - (a.y - center.y),
        y: center.y + (a.x - center.x),
      }));
    }
  }
  return maximum;
}

function circularMidpoint(a, b, center) {
  const radius = Math.hypot(a.x - center.x, a.y - center.y);
  const ux = (a.x - center.x) / radius + (b.x - center.x) / radius;
  const uy = (a.y - center.y) / radius + (b.y - center.y) / radius;
  const norm = Math.hypot(ux, uy);
  return { x: center.x + radius * ux / norm, y: center.y + radius * uy / norm };
}

function geometryError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}
