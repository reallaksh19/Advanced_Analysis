import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_BUCKET_01_MESH_QUALIFICATION_INPUT_SCHEMA =
  'lafea-bucket-01-mesh-qualification-input/v1';
export const LAFEA_BUCKET_01_MESH_QUALIFICATION_EVIDENCE_SCHEMA =
  'lafea-bucket-01-mesh-qualification-evidence/v1';
export const LAFEA_BUCKET_01_MESH_QUALIFICATION_REVISION = 'B01-MESH.2';

const INPUT_KEYS = Object.freeze([
  'schema', 'exactHeadSha', 'meshPackageHash', 'qualificationProfileHash',
  'meshPackage', 'tolerances',
]);
const TOLERANCE_KEYS = Object.freeze([
  'areaRelative', 'holeRadiusRelative', 'holeCenterOverRadius',
  'criticalLigamentRelative', 'perimeterRelative',
  'boundaryDeviationOverRadius', 'midsideOverReference',
  'rotationalSymmetryOverReference', 'duplicateNodeDistance',
]);
const AREA_POINTS = Object.freeze([
  Object.freeze({ xi: 1 / 6, eta: 1 / 6, weight: 1 / 6 }),
  Object.freeze({ xi: 2 / 3, eta: 1 / 6, weight: 1 / 6 }),
  Object.freeze({ xi: 1 / 6, eta: 2 / 3, weight: 1 / 6 }),
]);
const EDGE_GAUSS = Object.freeze([
  Object.freeze({ point: -0.906179845938664, weight: 0.236926885056189 }),
  Object.freeze({ point: -0.538469310105683, weight: 0.478628670499366 }),
  Object.freeze({ point: 0, weight: 0.568888888888889 }),
  Object.freeze({ point: 0.538469310105683, weight: 0.478628670499366 }),
  Object.freeze({ point: 0.906179845938664, weight: 0.236926885056189 }),
]);
const BOUNDARY_SAMPLES = 16;
const JACOBIAN_DIVISIONS = 8;

export function qualifyLafeaBucket01Mesh(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'mesh qualification input');
  if (inputValue.schema !== LAFEA_BUCKET_01_MESH_QUALIFICATION_INPUT_SCHEMA) {
    throw meshError('LAFEA_B01_MESH_INPUT_SCHEMA_INVALID');
  }
  exactKeys(inputValue.tolerances, TOLERANCE_KEYS, 'mesh tolerances');
  const exactHeadSha = gitSha(inputValue.exactHeadSha);
  const meshPackageHash = sha256(inputValue.meshPackageHash, 'meshPackageHash');
  const qualificationProfileHash = sha256(
    inputValue.qualificationProfileHash,
    'qualificationProfileHash',
  );
  const tolerances = normalizeTolerances(inputValue.tolerances);
  const meshPackage = requirePackage(inputValue.meshPackage);
  const { spec, mesh, featureSets } = meshPackage;
  const nodeById = new Map(mesh.nodes.map((node) => [node.nodeId, node]));
  const topology = inspectTopology(mesh, featureSets, nodeById);
  const geometry = inspectGeometry(spec, mesh, featureSets, nodeById);
  const validity = inspectValidity(
    mesh,
    nodeById,
    tolerances.duplicateNodeDistance,
  );
  const reasons = acceptanceReasons(spec, geometry, topology, validity, tolerances);
  const status = reasons.length === 0 ? 'PASS' : 'BLOCKED';
  const base = {
    schema: LAFEA_BUCKET_01_MESH_QUALIFICATION_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_MESH_QUALIFICATION_REVISION,
    exactHeadSha,
    meshPackageHash,
    qualificationProfileHash,
    meshIdentity: spec.meshIdentity,
    geometryClass: 'CONCENTRIC_ANNULAR_LUG_PINHOLE',
    elementType: 'T6',
    tolerances,
    geometry,
    topology,
    validity,
    status,
    reasons,
    authority: {
      productionMeshGeometryQualified: status === 'PASS',
      materialCoverageQualified: false,
      loadCoverageQualified: false,
      restraintCoverageQualified: false,
      arbitraryOuterProfileSupported: false,
      arbitraryHoleTopologySupported: false,
      solverExecuted: false,
      recoveryProduced: false,
      codeAssessmentProduced: false,
      releaseQualified: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

export function validateLafeaBucket01MeshQualificationEvidence(value, meshPackage) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_MESH_QUALIFICATION_EVIDENCE_SCHEMA
      || value.producerRevision !== LAFEA_BUCKET_01_MESH_QUALIFICATION_REVISION) {
      throw meshError('LAFEA_B01_MESH_EVIDENCE_CONTRACT_INVALID');
    }
    const rebuilt = qualifyLafeaBucket01Mesh({
      schema: LAFEA_BUCKET_01_MESH_QUALIFICATION_INPUT_SCHEMA,
      exactHeadSha: value.exactHeadSha,
      meshPackageHash: value.meshPackageHash,
      qualificationProfileHash: value.qualificationProfileHash,
      meshPackage,
      tolerances: value.tolerances,
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw meshError('LAFEA_B01_MESH_EVIDENCE_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw meshError('LAFEA_B01_MESH_EVIDENCE_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_MESH_EVIDENCE_INVALID'],
    });
  }
}

function inspectTopology(mesh, featureSets, nodeById) {
  const errors = [];
  if (nodeById.size !== mesh.nodes.length) errors.push('DUPLICATE_NODE_ID');
  const elementIds = new Set(mesh.elements.map((row) => row.elementId));
  if (elementIds.size !== mesh.elements.length) errors.push('DUPLICATE_ELEMENT_ID');
  const edgeMap = new Map();
  const nodeToElements = new Map();
  for (const element of mesh.elements) {
    if (element.elementType !== 'T6' || !Array.isArray(element.nodeIds)
      || element.nodeIds.length !== 6) {
      errors.push('NON_T6_OR_INVALID_CONNECTIVITY');
      continue;
    }
    if (element.nodeIds.some((nodeId) => !nodeById.has(nodeId))) {
      errors.push('ELEMENT_NODE_MISSING');
      continue;
    }
    for (const nodeId of element.nodeIds) {
      if (!nodeToElements.has(nodeId)) nodeToElements.set(nodeId, []);
      nodeToElements.get(nodeId).push(element.elementId);
    }
    for (const [aIndex, bIndex, midIndex] of [[0, 1, 3], [1, 2, 4], [2, 0, 5]]) {
      const key = edgeKey(element.nodeIds[aIndex], element.nodeIds[bIndex]);
      const entry = edgeMap.get(key) ?? { midsideIds: new Set(), elementIds: [] };
      entry.midsideIds.add(element.nodeIds[midIndex]);
      entry.elementIds.push(element.elementId);
      edgeMap.set(key, entry);
    }
  }
  if ([...edgeMap.values()].some((entry) => entry.midsideIds.size !== 1)) {
    errors.push('SHARED_EDGE_MIDSIDE_IDENTITY_MISMATCH');
  }
  if ([...edgeMap.values()].some((entry) => entry.elementIds.length > 2)) {
    errors.push('NON_MANIFOLD_EDGE');
  }
  const boundaryTriplets = [
    ...(featureSets.holeBoundary?.edgeNodeIds ?? []),
    ...(featureSets.outerBoundary?.edgeNodeIds ?? []),
  ];
  const boundaryKeys = new Set();
  for (const triplet of boundaryTriplets) {
    if (!Array.isArray(triplet) || triplet.length !== 3
      || triplet.some((nodeId) => !nodeById.has(nodeId))) {
      errors.push('BOUNDARY_FEATURE_EDGE_INVALID');
      continue;
    }
    const key = edgeKey(triplet[0], triplet[2]);
    boundaryKeys.add(key);
    const entry = edgeMap.get(key);
    if (!entry || entry.elementIds.length !== 1
      || !entry.midsideIds.has(triplet[1])) {
      errors.push('BOUNDARY_FEATURE_EDGE_NOT_MESH_BOUNDARY');
    }
  }
  for (const [key, entry] of edgeMap.entries()) {
    if (entry.elementIds.length !== (boundaryKeys.has(key) ? 1 : 2)) {
      errors.push('EDGE_INCIDENCE_INVALID');
      break;
    }
  }
  if ((featureSets.holeBoundary?.edgeNodeIds?.length ?? 0) === 0
    || (featureSets.outerBoundary?.edgeNodeIds?.length ?? 0) === 0
    || !Array.isArray(featureSets.radialLines)
    || featureSets.radialLines.length !== 4
    || featureSets.radialLines.some((row) => !Array.isArray(row.nodeIds)
      || row.nodeIds.length === 0
      || row.nodeIds.some((nodeId) => !nodeById.has(nodeId)))) {
    errors.push('FEATURE_SET_COMPLETENESS_FAILED');
  }
  const connectedComponentCount = componentCount(mesh.elements, nodeToElements);
  if (connectedComponentCount !== 1) errors.push('DISCONNECTED_ELEMENT_REGION');
  return deepFreeze({
    nodeCount: mesh.nodes.length,
    elementCount: mesh.elements.length,
    uniqueEdgeCount: edgeMap.size,
    boundaryEdgeCount: boundaryKeys.size,
    connectedComponentCount,
    sharedEdgeIdentityAccepted:
      !errors.includes('SHARED_EDGE_MIDSIDE_IDENTITY_MISMATCH'),
    featureSetsComplete: !errors.includes('FEATURE_SET_COMPLETENESS_FAILED'),
    errors: [...new Set(errors)].sort(),
  });
}

function inspectGeometry(spec, mesh, featureSets, nodeById) {
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
        distance(mid, expected),
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
  return deepFreeze({
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

function inspectValidity(mesh, nodeById, duplicateNodeDistance) {
  const errors = [];
  let minimumDenseJacobian = Number.POSITIVE_INFINITY;
  let nonPositiveDenseJacobianCount = 0;
  for (const element of mesh.elements) {
    if (element.elementType !== 'T6' || element.nodeIds.length !== 6) continue;
    const nodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
    for (let i = 0; i <= JACOBIAN_DIVISIONS; i += 1) {
      for (let j = 0; j <= JACOBIAN_DIVISIONS - i; j += 1) {
        const determinant = t6Jacobian(
          nodes,
          i / JACOBIAN_DIVISIONS,
          j / JACOBIAN_DIVISIONS,
        );
        minimumDenseJacobian = Math.min(minimumDenseJacobian, determinant);
        if (!(determinant > 0)) nonPositiveDenseJacobianCount += 1;
      }
    }
  }
  if (nonPositiveDenseJacobianCount) errors.push('NON_POSITIVE_DENSE_JACOBIAN');
  const duplicateNodePairs = findDuplicateNodePairs(mesh.nodes, duplicateNodeDistance);
  if (duplicateNodePairs.length) errors.push('UNINTENDED_DUPLICATE_NODE_COORDINATES');
  return deepFreeze({
    jacobianSampleDivisions: JACOBIAN_DIVISIONS,
    minimumDenseJacobian,
    nonPositiveDenseJacobianCount,
    duplicateNodeDistance,
    duplicateNodePairCount: duplicateNodePairs.length,
    duplicateNodePairs,
    errors: [...new Set(errors)].sort(),
  });
}

function acceptanceReasons(spec, geometry, topology, validity, tolerances) {
  const checks = [
    ['AREA_ERROR_EXCEEDS_TOLERANCE',
      geometry.areaRelativeError <= tolerances.areaRelative],
    ['HOLE_RADIUS_ERROR_EXCEEDS_TOLERANCE',
      geometry.holeBoundaryMaximumRadiusError / spec.holeRadius
        <= tolerances.holeRadiusRelative],
    ['HOLE_CENTER_ERROR_EXCEEDS_TOLERANCE',
      geometry.holeCenterError / spec.holeRadius
        <= tolerances.holeCenterOverRadius],
    ['CRITICAL_LIGAMENT_ERROR_EXCEEDS_TOLERANCE',
      geometry.criticalLigamentRelativeError
        <= tolerances.criticalLigamentRelative],
    ['PERIMETER_ERROR_EXCEEDS_TOLERANCE',
      geometry.totalPerimeterRelativeError <= tolerances.perimeterRelative],
    ['BOUNDARY_DEVIATION_EXCEEDS_TOLERANCE',
      geometry.maximumBoundaryDeviation / spec.holeRadius
        <= tolerances.boundaryDeviationOverRadius],
    ['MIDSIDE_PLACEMENT_ERROR_EXCEEDS_TOLERANCE',
      geometry.maximumMidsidePlacementError / geometry.referenceLength
        <= tolerances.midsideOverReference],
    ['ROTATIONAL_SYMMETRY_ERROR_EXCEEDS_TOLERANCE',
      geometry.rotationalSymmetryError / geometry.referenceLength
        <= tolerances.rotationalSymmetryOverReference],
  ];
  return Object.freeze([
    ...checks.filter(([, accepted]) => !accepted).map(([code]) => code),
    ...topology.errors,
    ...validity.errors,
  ].filter((code, index, rows) => rows.indexOf(code) === index).sort());
}

function requirePackage(value) {
  if (!value
    || value.schema !== 'lafea-lug-pinhole-t6-mesh-package/v1'
    || value.generatorRevision !== 'NB-T6B.1'
    || !value.spec || !value.mesh || !value.featureSets) {
    throw meshError('LAFEA_B01_MESH_PACKAGE_INVALID');
  }
  const spec = value.spec;
  if (spec.schema !== 'lafea-lug-pinhole-t6-mesh-spec/v1'
    || !Number.isFinite(spec.center?.x) || !Number.isFinite(spec.center?.y)
    || !(spec.holeRadius > 0) || !(spec.outerRadius > spec.holeRadius)
    || !Number.isInteger(spec.radialDivisions) || spec.radialDivisions < 1
    || !Number.isInteger(spec.circumferentialDivisions)
    || spec.circumferentialDivisions < 8
    || spec.circumferentialDivisions % 4 !== 0) {
    throw meshError('LAFEA_B01_MESH_SPEC_INVALID');
  }
  if (value.mesh.schema !== 'lafea-analysis-mesh/v1'
    || !Array.isArray(value.mesh.nodes) || !value.mesh.nodes.length
    || !Array.isArray(value.mesh.elements) || !value.mesh.elements.length) {
    throw meshError('LAFEA_B01_ANALYSIS_MESH_INVALID');
  }
  if (value.featureSets.schema !== 'lafea-lug-pinhole-feature-sets/v1') {
    throw meshError('LAFEA_B01_FEATURE_SETS_INVALID');
  }
  return value;
}

function circularBoundary(edgeNodeIds, nodeById, center, radius) {
  let maximumRadiusError = 0;
  let integratedPerimeter = 0;
  for (const triplet of edgeNodeIds) {
    const nodes = triplet.map((nodeId) => nodeById.get(nodeId));
    for (let sample = 0; sample <= BOUNDARY_SAMPLES; sample += 1) {
      const point = edgePoint(nodes, sample / BOUNDARY_SAMPLES);
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
    for (let sample = 0; sample <= BOUNDARY_SAMPLES; sample += 1) {
      const t = sample / BOUNDARY_SAMPLES;
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
    throw meshError('LAFEA_B01_BOUNDARY_EDGE_COUNT_MISMATCH');
  }
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = 0;
  for (let edge = 0; edge < holeEdges.length; edge += 1) {
    const hole = holeEdges[edge].map((nodeId) => nodeById.get(nodeId));
    const outer = outerEdges[edge].map((nodeId) => nodeById.get(nodeId));
    for (let sample = 0; sample <= BOUNDARY_SAMPLES; sample += 1) {
      const t = sample / BOUNDARY_SAMPLES;
      const value = distance(edgePoint(hole, t), edgePoint(outer, t));
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
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
    for (let sample = 0; sample <= BOUNDARY_SAMPLES; sample += 1) {
      const t = sample / BOUNDARY_SAMPLES;
      const a = edgePoint(current, t); const b = edgePoint(quarter, t);
      maximum = Math.max(maximum, distance(b, {
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

function t6Jacobian(nodes, xi, eta) {
  const dNdXi = [
    4 * xi + 4 * eta - 3, 4 * xi - 1, 0,
    4 * (1 - 2 * xi - eta), 4 * eta, -4 * eta,
  ];
  const dNdEta = [
    4 * xi + 4 * eta - 3, 0, 4 * eta - 1,
    -4 * xi, 4 * xi, 4 * (1 - xi - 2 * eta),
  ];
  let dxDxi = 0; let dyDxi = 0; let dxDeta = 0; let dyDeta = 0;
  for (let index = 0; index < 6; index += 1) {
    dxDxi += dNdXi[index] * nodes[index].x;
    dyDxi += dNdXi[index] * nodes[index].y;
    dxDeta += dNdEta[index] * nodes[index].x;
    dyDeta += dNdEta[index] * nodes[index].y;
  }
  return dxDxi * dyDeta - dxDeta * dyDxi;
}

function edgePoint(nodes, t) {
  const weights = [
    (1 - t) * (1 - 2 * t),
    4 * t * (1 - t),
    t * (2 * t - 1),
  ];
  return {
    x: weights.reduce((sum, value, index) => sum + value * nodes[index].x, 0),
    y: weights.reduce((sum, value, index) => sum + value * nodes[index].y, 0),
  };
}

function edgeLength(nodes) {
  return EDGE_GAUSS.reduce((sum, point) => {
    const t = (point.point + 1) / 2;
    const weights = [4 * t - 3, 4 - 8 * t, 4 * t - 1];
    const dx = weights.reduce(
      (total, value, index) => total + value * nodes[index].x,
      0,
    );
    const dy = weights.reduce(
      (total, value, index) => total + value * nodes[index].y,
      0,
    );
    return sum + point.weight * Math.hypot(dx, dy) / 2;
  }, 0);
}

function findDuplicateNodePairs(nodes, tolerance) {
  const buckets = new Map();
  const duplicates = [];
  const cell = Math.max(tolerance, Number.EPSILON);
  for (const node of nodes) {
    const ix = Math.floor(node.x / cell); const iy = Math.floor(node.y / cell);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of buckets.get(`${ix + dx}:${iy + dy}`) ?? []) {
          if (distance(node, other) <= tolerance) {
            duplicates.push(Object.freeze([other.nodeId, node.nodeId].sort()));
          }
        }
      }
    }
    const key = `${ix}:${iy}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(node);
  }
  return duplicates.sort((left, right) => left.join(':').localeCompare(right.join(':')));
}

function componentCount(elements, nodeToElements) {
  if (!elements.length) return 0;
  const byId = new Map(elements.map((row) => [row.elementId, row]));
  const visited = new Set();
  let count = 0;
  for (const element of elements) {
    if (visited.has(element.elementId)) continue;
    count += 1;
    const queue = [element.elementId];
    visited.add(element.elementId);
    while (queue.length) {
      const current = byId.get(queue.shift());
      for (const nodeId of current.nodeIds) {
        for (const neighbour of nodeToElements.get(nodeId) ?? []) {
          if (!visited.has(neighbour)) {
            visited.add(neighbour);
            queue.push(neighbour);
          }
        }
      }
    }
  }
  return count;
}

function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeTolerances(value) {
  return deepFreeze(Object.fromEntries(
    TOLERANCE_KEYS.map((key) => [key, nonNegative(value[key], key)]),
  ));
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw meshError('LAFEA_B01_MESH_RECORD_INVALID', `${label} invalid.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw meshError('LAFEA_B01_MESH_EXACT_KEYS_INVALID', `${label} keys differ.`);
  }
}

function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw meshError('LAFEA_B01_MESH_EXACT_HEAD_INVALID');
  }
  return value;
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw meshError('LAFEA_B01_MESH_SHA256_REQUIRED', `${label} invalid.`);
  }
  return value;
}

function nonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw meshError('LAFEA_B01_MESH_NONNEGATIVE_REQUIRED', `${label} invalid.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function meshError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
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
