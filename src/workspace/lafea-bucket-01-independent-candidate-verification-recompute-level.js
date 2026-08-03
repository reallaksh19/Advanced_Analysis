import {
  deepFreeze,
  edgeKey,
  verificationError,
} from './lafea-bucket-01-independent-candidate-verification-internal.js';
import {
  classifyEdge,
  expectedMidside,
  qualityRecordsMatch,
} from './lafea-bucket-01-independent-candidate-verification-numerics.js';
import {
  mappingWindowMatches,
  recomputeQuality,
  verifyRadialWindow,
} from './lafea-bucket-01-independent-candidate-verification-recompute-quality-window.js';

export function recomputeLevelEvidence({ packageValue, expected, design, productionSpec }) {
  const edgePolicy = recomputeEdgePolicy(packageValue, design);
  const quality = recomputeQuality(packageValue);
  const loadWindow = verifyRadialWindow(
    packageValue,
    productionSpec.load.featureRole,
    productionSpec.load.selectedSegmentRadiusStart,
    productionSpec.load.selectedSegmentRadiusEnd,
    'LOAD',
  );
  const restraintWindow = verifyRadialWindow(
    packageValue,
    productionSpec.restraint.featureRole,
    productionSpec.load.selectedSegmentRadiusStart,
    productionSpec.load.selectedSegmentRadiusEnd,
    'RESTRAINT',
  );
  if (!mappingWindowMatches(
    packageValue.mappingWindow,
    loadWindow,
    restraintWindow,
    packageValue.spec,
  )) {
    throw verificationError('LAFEA_B01_INDEPENDENT_MAPPING_WINDOW_MISMATCH');
  }
  const reasons = [];
  if (!edgePolicy.accepted) reasons.push(`LEVEL_${expected.ordinal}_MIDSIDE_POLICY_BLOCKED`);
  if (!quality.accepted) reasons.push(`LEVEL_${expected.ordinal}_JACOBIAN_QUALITY_BLOCKED`);
  if (!loadWindow.exactWindow) reasons.push(...loadWindow.reasons.map(
    (reason) => `LEVEL_${expected.ordinal}_${reason}`));
  if (!restraintWindow.exactWindow) reasons.push(...restraintWindow.reasons.map(
    (reason) => `LEVEL_${expected.ordinal}_${reason}`));
  const suppliedQualityMatches = qualityRecordsMatch(quality.metrics, packageValue.quality);
  if (!suppliedQualityMatches) {
    throw verificationError('LAFEA_B01_INDEPENDENT_SUPPLIED_QUALITY_MISMATCH');
  }
  const expectedStatus = quality.accepted ? 'CANDIDATE_MESH_READY_NOT_PRODUCTION'
    : 'CANDIDATE_MESH_BLOCKED';
  if (packageValue.status !== expectedStatus) {
    throw verificationError('LAFEA_B01_INDEPENDENT_PACKAGE_STATUS_MISMATCH');
  }
  return deepFreeze({
    ordinal: expected.ordinal,
    radialCellCount: expected.radialCellCount,
    circumferentialCellCount: expected.circumferentialCellCount,
    elementCount: expected.elementCount,
    nodeCount: packageValue.mesh.nodes.length,
    meshHash: packageValue.meshHash,
    packageSemanticHash: packageValue.semanticHash,
    edgePolicy,
    quality: quality.metrics,
    loadWindow,
    restraintWindow,
    status: reasons.length === 0 ? 'PASS' : 'BLOCKED',
    reasons: [...new Set(reasons)].sort(),
  });
}

export function recomputeEdgePolicy(packageValue, design) {
  const mesh = packageValue.mesh;
  const nodeById = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  if (nodeById.size !== mesh.nodes.length) {
    throw verificationError('LAFEA_B01_INDEPENDENT_DUPLICATE_NODE_ID');
  }
  const radialCellCount = packageValue.spec.radialAxis.coordinates.length - 1;
  const edgeMap = new Map();
  for (const element of mesh.elements) {
    if (element.elementType !== 'T6' || element.nodeIds.length !== 6) {
      throw verificationError('LAFEA_B01_INDEPENDENT_NON_T6_ELEMENT');
    }
    for (const [aIndex, bIndex, midIndex] of [[0, 1, 3], [1, 2, 4], [2, 0, 5]]) {
      const aId = element.nodeIds[aIndex];
      const bId = element.nodeIds[bIndex];
      const midId = element.nodeIds[midIndex];
      const key = edgeKey(aId, bId);
      const row = edgeMap.get(key) ?? { aId, bId, midIds: new Set(), elementIds: [] };
      row.midIds.add(midId);
      row.elementIds.push(element.elementId);
      edgeMap.set(key, row);
    }
  }
  const counts = {
    HOLE_BOUNDARY_CIRCUMFERENTIAL: 0,
    OUTER_BOUNDARY_CIRCUMFERENTIAL: 0,
    INTERNAL_CIRCUMFERENTIAL: 0,
    RADIAL: 0,
    DIAGONAL: 0,
  };
  let maximumMidsideError = 0;
  let sharedEdgeIdentityAccepted = true;
  const violations = [];
  for (const [key, edge] of edgeMap.entries()) {
    if (edge.midIds.size !== 1 || edge.elementIds.length > 2) {
      sharedEdgeIdentityAccepted = false;
      violations.push(`EDGE_IDENTITY:${key}`);
      continue;
    }
    const a = nodeById.get(edge.aId);
    const b = nodeById.get(edge.bId);
    const midId = [...edge.midIds][0];
    const mid = nodeById.get(midId);
    if (!a || !b || !mid) {
      throw verificationError('LAFEA_B01_INDEPENDENT_EDGE_NODE_MISSING');
    }
    const classification = classifyEdge(edge.aId, edge.bId, radialCellCount);
    counts[classification] += 1;
    const expected = expectedMidside(
      classification,
      a,
      b,
      packageValue.spec.center,
      packageValue.spec.radialAxis.coordinates,
    );
    const error = Math.hypot(
      mid.x - expected.x,
      mid.y - expected.y,
      (mid.z ?? 0) - (expected.z ?? 0),
    );
    maximumMidsideError = Math.max(maximumMidsideError, error);
    const scale = Math.max(
      1,
      packageValue.spec.radialAxis.domainEnd,
      Math.abs(expected.x),
      Math.abs(expected.y),
    );
    if (error > 1e-12 * scale) violations.push(`MIDSIDE_POLICY:${key}`);
  }
  const evidence = packageValue.midsideTransformationEvidence;
  if (evidence?.internalCircumferentialMidsideCount
      !== counts.INTERNAL_CIRCUMFERENTIAL
    || evidence?.physicalBoundaryCircumferentialMidsideCount
      !== counts.HOLE_BOUNDARY_CIRCUMFERENTIAL
        + counts.OUTER_BOUNDARY_CIRCUMFERENTIAL
    || evidence?.allInternalCircumferentialMidsidesChordal !== true
    || evidence?.allPhysicalBoundaryCircumferentialMidsidesAnalytic !== true
    || JSON.stringify(packageValue.midsideGeometryPolicy)
      !== JSON.stringify(design.midsideGeometryPolicy)) {
    violations.push('DECLARED_MIDSIDE_POLICY_EVIDENCE_MISMATCH');
  }
  return deepFreeze({
    edgeCount: edgeMap.size,
    classifications: counts,
    sharedEdgeIdentityAccepted,
    maximumMidsideError,
    violationCount: violations.length,
    violations: violations.sort(),
    accepted: sharedEdgeIdentityAccepted && violations.length === 0,
  });
}
