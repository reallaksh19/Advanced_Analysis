import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  ELEMENT_PATTERN,
  NATURAL_MARGIN_TARGET,
  angularDistance,
  clean,
  deepFreeze,
  normalizeDegrees,
  verificationError,
} from './lafea-bucket-01-independent-candidate-verification-internal.js';
import {
  allLocations,
  anchorEvidence,
  bboxContains,
  findAnchor,
  insideNatural,
  invertT6,
  mapT6,
  signedTriangleArea,
} from './lafea-bucket-01-independent-candidate-verification-numerics.js';

export function recomputeLocationHistories(packages, probeSpec, design) {
  const histories = [];
  for (const location of allLocations(probeSpec)) {
    const observations = packages.map((packageValue) =>
      locateAndObserve(packageValue, location, probeSpec, design));
    const transitions = [];
    const reasons = [];
    for (const observation of observations) reasons.push(...observation.reasons);
    for (let index = 1; index < observations.length; index += 1) {
      const coarse = observations[index - 1];
      const fine = observations[index];
      const radialParentCompatible = fine.radialAnchor.parentAnchorCellId
        === coarse.radialAnchor.anchorCellId;
      const circumferentialParentCompatible =
        fine.circumferentialAnchor.parentAnchorCellId
          === coarse.circumferentialAnchor.anchorCellId;
      const topologySignatureStable = fine.topologySignature
        === coarse.topologySignature;
      if (!radialParentCompatible) reasons.push(
        `LOCATION_${location.probeId}_L${fine.ordinal}_RADIAL_PARENT_MISMATCH`,
      );
      if (!circumferentialParentCompatible) reasons.push(
        `LOCATION_${location.probeId}_L${fine.ordinal}_CIRCUMFERENTIAL_PARENT_MISMATCH`,
      );
      if (!topologySignatureStable) reasons.push(
        `LOCATION_${location.probeId}_L${fine.ordinal}_TOPOLOGY_SIGNATURE_CHANGED`,
      );
      transitions.push(deepFreeze({
        coarseOrdinal: coarse.ordinal,
        fineOrdinal: fine.ordinal,
        radialParentCompatible,
        circumferentialParentCompatible,
        topologySignatureStable,
        naturalCoordinateDrift: {
          xi: Math.abs(fine.naturalCoordinates.xi - coarse.naturalCoordinates.xi),
          eta: Math.abs(fine.naturalCoordinates.eta - coarse.naturalCoordinates.eta),
          lambda1: Math.abs(fine.naturalCoordinates.lambda1 - coarse.naturalCoordinates.lambda1),
          lambda2: Math.abs(fine.naturalCoordinates.lambda2 - coarse.naturalCoordinates.lambda2),
          lambda3: Math.abs(fine.naturalCoordinates.lambda3 - coarse.naturalCoordinates.lambda3),
        },
      }));
    }
    const uniqueReasons = [...new Set(reasons)].sort();
    histories.push(deepFreeze({
      probeId: location.probeId,
      physicalCoordinates: { x: location.x, y: location.y },
      radius: location.radius,
      angleDegrees: location.angleDegrees,
      observations,
      transitions,
      minimumNaturalMargin: Math.min(
        ...observations.map((row) => row.minimumNaturalMargin),
      ),
      maximumNaturalCoordinateDrift: Math.max(
        0,
        ...transitions.flatMap((row) => Object.values(row.naturalCoordinateDrift)),
      ),
      status: uniqueReasons.length === 0 ? 'PASS' : 'BLOCKED',
      reasons: uniqueReasons,
    }));
  }
  return deepFreeze(histories);
}

export function locateAndObserve(packageValue, location, probeSpec, design) {
  const mesh = packageValue.mesh;
  const nodeById = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  const candidates = [];
  for (const element of mesh.elements) {
    const nodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
    if (!bboxContains(nodes, location.x, location.y)) continue;
    const natural = invertT6(nodes, location.x, location.y);
    if (natural && insideNatural(natural.xi, natural.eta)) {
      candidates.push({ element, nodes, natural });
    }
  }
  const reasons = [];
  if (candidates.length !== 1) {
    reasons.push(`LOCATION_${location.probeId}_L${packageValue.spec.ordinal}_CONTAINMENT_COUNT_${candidates.length}`);
  }
  const located = candidates[0];
  if (!located) {
    return deepFreeze({
      ordinal: packageValue.spec.ordinal,
      containmentCandidateCount: candidates.length,
      elementId: null,
      triangleSide: null,
      orientation: null,
      naturalCoordinates: null,
      minimumNaturalMargin: Number.NEGATIVE_INFINITY,
      mappingResidual: Number.POSITIVE_INFINITY,
      jacobianDeterminant: Number.NEGATIVE_INFINITY,
      topologySignature: null,
      radialAnchor: null,
      circumferentialAnchor: null,
      reasons,
      status: 'BLOCKED',
    });
  }
  const parsed = ELEMENT_PATTERN.exec(located.element.elementId);
  if (!parsed) throw verificationError('LAFEA_B01_INDEPENDENT_ELEMENT_ID_INVALID');
  const mapping = mapT6(located.nodes, located.natural.xi, located.natural.eta);
  const naturalCoordinates = {
    xi: clean(located.natural.xi),
    eta: clean(located.natural.eta),
    lambda1: clean(1 - located.natural.xi - located.natural.eta),
    lambda2: clean(located.natural.xi),
    lambda3: clean(located.natural.eta),
  };
  const minimumNaturalMargin = Math.min(
    naturalCoordinates.lambda1,
    naturalCoordinates.lambda2,
    naturalCoordinates.lambda3,
  );
  const signedArea = signedTriangleArea(located.nodes.slice(0, 3));
  const scale = Math.max(1, packageValue.spec.radialAxis.domainEnd);
  const minimumNodeDistance = Math.min(...mesh.nodes.map((node) =>
    Math.hypot(node.x - location.x, node.y - location.y)));
  const radialAnchor = findAnchor(
    packageValue.sidecar.radialAxis.anchorCells,
    location.radius,
  );
  const circumferentialAnchor = findAnchor(
    packageValue.sidecar.circumferentialAxis.anchorCells,
    normalizeDegrees(location.angleDegrees),
  );
  if (candidates.length !== 1) reasons.push(
    `LOCATION_${location.probeId}_L${packageValue.spec.ordinal}_AMBIGUOUS`,
  );
  if (!(mapping.determinant > 0)) reasons.push(
    `LOCATION_${location.probeId}_L${packageValue.spec.ordinal}_JACOBIAN_NON_POSITIVE`,
  );
  if (!(signedArea > 0)) reasons.push(
    `LOCATION_${location.probeId}_L${packageValue.spec.ordinal}_ORIENTATION_INVALID`,
  );
  if (minimumNaturalMargin < NATURAL_MARGIN_TARGET) reasons.push(
    `LOCATION_${location.probeId}_L${packageValue.spec.ordinal}_MARGIN_BELOW_TARGET`,
  );
  if (minimumNodeDistance <= 1e-10 * scale) reasons.push(
    `LOCATION_${location.probeId}_L${packageValue.spec.ordinal}_ON_NODE`,
  );
  if (design.topologyPolicy.protectedFeatureLinesDegrees.some((angle) =>
    angularDistance(angle, location.angleDegrees) <= 1e-12)) reasons.push(
    `LOCATION_${location.probeId}_L${packageValue.spec.ordinal}_ON_PROTECTED_FEATURE`,
  );
  if (Math.hypot(mapping.x - location.x, mapping.y - location.y)
    > probeSpec.tolerances.mappingResidualMax) reasons.push(
    `LOCATION_${location.probeId}_L${packageValue.spec.ordinal}_MAPPING_RESIDUAL`,
  );
  if (!radialAnchor || radialAnchor.cellIndex !== Number(parsed.groups.ring)) reasons.push(
    `LOCATION_${location.probeId}_L${packageValue.spec.ordinal}_RADIAL_ANCHOR_MISMATCH`,
  );
  if (!circumferentialAnchor
    || circumferentialAnchor.cellIndex !== Number(parsed.groups.sector)) reasons.push(
    `LOCATION_${location.probeId}_L${packageValue.spec.ordinal}_CIRCUMFERENTIAL_ANCHOR_MISMATCH`,
  );
  const topologySignature = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-candidate-compatible-topology/v1',
    elementFamily: 'ANNULAR_T6_TWO_TRIANGLE_CELL',
    triangleSide: parsed.groups.side,
    orientation: 'COUNTER_CLOCKWISE',
  });
  const uniqueReasons = [...new Set(reasons)].sort();
  return deepFreeze({
    ordinal: packageValue.spec.ordinal,
    containmentCandidateCount: candidates.length,
    elementId: located.element.elementId,
    radialCellIndex: Number(parsed.groups.ring),
    circumferentialCellIndex: Number(parsed.groups.sector),
    triangleSide: parsed.groups.side,
    orientation: 'COUNTER_CLOCKWISE',
    naturalCoordinates,
    minimumNaturalMargin,
    mappingResidual: Math.hypot(mapping.x - location.x, mapping.y - location.y),
    jacobianDeterminant: mapping.determinant,
    signedCornerArea: signedArea,
    minimumNodeDistance,
    topologySignature,
    radialAnchor: anchorEvidence(radialAnchor),
    circumferentialAnchor: anchorEvidence(circumferentialAnchor),
    status: uniqueReasons.length === 0 ? 'PASS' : 'BLOCKED',
    reasons: uniqueReasons,
  });
}
