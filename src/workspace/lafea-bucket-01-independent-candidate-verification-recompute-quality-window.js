import {
  CORNER_NATURAL_POINTS,
  DENSE_JACOBIAN_DIVISIONS,
  INTEGRATION_POINTS,
  deepFreeze,
  featureRoleAngle,
  findNearIndex,
  near,
  radiusOf,
  verificationError,
} from './lafea-bucket-01-independent-candidate-verification-internal.js';
import {
  boundaryRadiusError,
  mapT6,
  minimumTriangleAngle,
  scaledJacobianAt,
  triangleAspectRatio,
} from './lafea-bucket-01-independent-candidate-verification-numerics.js';

export function recomputeQuality(packageValue) {
  const mesh = packageValue.mesh;
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
      throw verificationError('LAFEA_B01_INDEPENDENT_ELEMENT_NODE_MISSING');
    }
    const corners = nodes.slice(0, 3);
    const scaled = Math.min(...CORNER_NATURAL_POINTS.map((point) =>
      scaledJacobianAt(nodes, point.xi, point.eta)));
    if (scaled < minimumScaledJacobian) {
      minimumScaledJacobian = scaled;
      minimumScaledJacobianElementId = element.elementId;
    }
    const aspectRatio = triangleAspectRatio(corners);
    if (aspectRatio > maximumAspectRatio) {
      maximumAspectRatio = aspectRatio;
      maximumAspectRatioElementId = element.elementId;
    }
    const angle = minimumTriangleAngle(corners);
    if (angle < minimumAngleDegrees) {
      minimumAngleDegrees = angle;
      minimumAngleElementId = element.elementId;
    }
    for (const point of INTEGRATION_POINTS) {
      const determinant = mapT6(nodes, point.xi, point.eta).determinant;
      if (determinant < minimumIntegrationPointJacobian) {
        minimumIntegrationPointJacobian = determinant;
        minimumIntegrationPointJacobianElementId = element.elementId;
      }
      integratedArea += determinant * point.weight;
    }
    for (let i = 0; i <= DENSE_JACOBIAN_DIVISIONS; i += 1) {
      for (let j = 0; j <= DENSE_JACOBIAN_DIVISIONS - i; j += 1) {
        const determinant = mapT6(
          nodes,
          i / DENSE_JACOBIAN_DIVISIONS,
          j / DENSE_JACOBIAN_DIVISIONS,
        ).determinant;
        if (determinant < minimumDenseJacobian) {
          minimumDenseJacobian = determinant;
          minimumDenseJacobianElementId = element.elementId;
        }
        if (!(determinant > 0)) nonPositiveDenseJacobianSampleCount += 1;
      }
    }
  }
  const holeRadius = packageValue.spec.radialAxis.domainStart;
  const outerRadius = packageValue.spec.radialAxis.domainEnd;
  const analyticalArea = Math.PI * (outerRadius ** 2 - holeRadius ** 2);
  const metrics = deepFreeze({
    schema: 'lafea-lug-pinhole-probe-stable-mesh-quality/v3',
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
      packageValue.featureSets.holeBoundary,
      nodeById,
      packageValue.spec.center,
      holeRadius,
    ),
    outerBoundaryMaximumRadiusError: boundaryRadiusError(
      packageValue.featureSets.outerBoundary,
      nodeById,
      packageValue.spec.center,
      outerRadius,
    ),
  });
  return deepFreeze({
    metrics,
    accepted: minimumScaledJacobian > 0
      && minimumIntegrationPointJacobian > 0
      && minimumDenseJacobian > 0
      && nonPositiveDenseJacobianSampleCount === 0,
  });
}

export function verifyRadialWindow(packageValue, declaredRole, startRadius, endRadius, label) {
  const angleDegrees = featureRoleAngle(declaredRole);
  const line = packageValue.featureSets.radialLines.find(
    (row) => row.angleDegrees === angleDegrees,
  );
  if (!line || !Array.isArray(line.nodeIds) || line.nodeIds.length < 3) {
    return deepFreeze({
      featureRole: declaredRole,
      angleDegrees,
      radiusStart: startRadius,
      radiusEnd: endRadius,
      exactStart: false,
      exactEnd: false,
      selectedEdgeCount: 0,
      selectedNodeIds: [],
      exactWindow: false,
      reasons: [`${label}_FEATURE_LINE_MISSING`],
    });
  }
  const nodeById = new Map(packageValue.mesh.nodes.map((row) => [row.nodeId, row]));
  const corners = line.nodeIds.filter((_row, index) => index % 2 === 0);
  const radii = corners.map((nodeId) => radiusOf(
    nodeById.get(nodeId),
    packageValue.spec.center,
  ));
  const startIndex = findNearIndex(radii, startRadius);
  const endIndex = findNearIndex(radii, endRadius);
  const reasons = [];
  if (startIndex < 0) reasons.push(`${label}_WINDOW_START_NOT_EXACT`);
  if (endIndex < 0) reasons.push(`${label}_WINDOW_END_NOT_EXACT`);
  if (startIndex >= 0 && endIndex >= 0 && endIndex <= startIndex) {
    reasons.push(`${label}_WINDOW_ORDER_INVALID`);
  }
  let selectedEdgeCount = 0;
  let selectedNodeIds = [];
  let chainAccepted = false;
  if (startIndex >= 0 && endIndex > startIndex) {
    chainAccepted = true;
    for (let index = startIndex; index < endIndex; index += 1) {
      const tripletOffset = 2 * index;
      const triplet = line.nodeIds.slice(tripletOffset, tripletOffset + 3);
      if (triplet.length !== 3
        || triplet[0] !== corners[index]
        || triplet[2] !== corners[index + 1]) {
        chainAccepted = false;
        break;
      }
      const a = nodeById.get(triplet[0]);
      const m = nodeById.get(triplet[1]);
      const b = nodeById.get(triplet[2]);
      if (!a || !m || !b
        || !near(m.x, (a.x + b.x) / 2, 1e-12)
        || !near(m.y, (a.y + b.y) / 2, 1e-12)) {
        chainAccepted = false;
        break;
      }
      selectedEdgeCount += 1;
    }
    if (!chainAccepted) reasons.push(`${label}_WINDOW_EDGE_CHAIN_INVALID`);
    if (chainAccepted) {
      selectedNodeIds = line.nodeIds.slice(2 * startIndex, 2 * endIndex + 1);
    }
  }
  return deepFreeze({
    featureRole: declaredRole,
    angleDegrees,
    radiusStart: startRadius,
    radiusEnd: endRadius,
    exactStart: startIndex >= 0,
    exactEnd: endIndex >= 0,
    startCornerNodeId: startIndex >= 0 ? corners[startIndex] : null,
    endCornerNodeId: endIndex >= 0 ? corners[endIndex] : null,
    lowerBoundingRadius: Math.max(...radii.filter((row) => row <= endRadius)),
    upperBoundingRadius: Math.min(...radii.filter((row) => row >= endRadius)),
    selectedEdgeCount,
    selectedNodeIds,
    chainAccepted,
    exactWindow: reasons.length === 0,
    reasons,
  });
}

export function mappingWindowMatches(value, loadWindow, restraintWindow, spec) {
  return value?.schema === 'lafea-bucket-01-candidate-production-mapping-window/v1'
    && value.designId === spec.designId
    && value.ordinal === spec.ordinal
    && value.radialStart === loadWindow.radiusStart
    && value.radialEnd === loadWindow.radiusEnd
    && value.radialStartIndex
      === spec.radialAxis.coordinates.indexOf(loadWindow.radiusStart)
    && value.radialEndIndex
      === spec.radialAxis.coordinates.indexOf(loadWindow.radiusEnd)
    && value.edgeCount === loadWindow.selectedEdgeCount
    && value.loadFeatureRole === 'RADIAL_QUARTER_0'
    && value.restraintFeatureRole === 'RADIAL_QUARTER_2'
    && JSON.stringify(value.loadNodeIds)
      === JSON.stringify(loadWindow.selectedNodeIds)
    && JSON.stringify(value.restraintNodeIds)
      === JSON.stringify(restraintWindow.selectedNodeIds)
    && value.exactEndpointNodes === true
    && value.physicalCoordinateSelection === true
    && value.indexScaledSelectionUsed === false
    && value.authority?.productionMeshAuthority === false
    && value.authority?.qualificationAuthority === false
    && value.authority?.bucketQualified === false;
}
