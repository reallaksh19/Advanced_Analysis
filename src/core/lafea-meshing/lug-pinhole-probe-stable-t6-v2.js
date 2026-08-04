import { LafeaMeshingError } from './errors.js';
import {
  aspectRatioOf,
  minimumAngleDegreesOf,
  minimumScaledJacobianOf,
} from './quality-gates.js';
import { jacobianAt, t6ShapeFunctions } from './element-geometry.js';
import { canonicalLafeaSha256 } from '../../workspace/lafea-canonical-sha256.js';
import {
  LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_PACKAGE_SCHEMA as V1_PACKAGE_SCHEMA,
  generateLafeaLugPinholeProbeStableT6Mesh as generateV1Mesh,
  observeLafeaLugPinholeProbeStableT6Topology as observeV1Topology,
} from './lug-pinhole-probe-stable-t6.js';

export const LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V2_PACKAGE_SCHEMA =
  'lafea-lug-pinhole-probe-stable-t6-package/v2';
export const LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V2_TOPOLOGY_SCHEMA =
  'lafea-lug-pinhole-probe-stable-t6-topology-observation/v2';
export const LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V2_GENERATOR_REVISION =
  'B01-PROBE-STABLE-T6.2';
export const LAFEA_BUCKET_01_PROBE_STABLE_DESIGN_V2_ID =
  'B01-PROBE-STABLE-POLAR-V2';

const DENSE_JACOBIAN_DIVISIONS = 8;
const AREA_POINTS = Object.freeze([
  Object.freeze({ xi: 1 / 6, eta: 1 / 6, weight: 1 / 6 }),
  Object.freeze({ xi: 2 / 3, eta: 1 / 6, weight: 1 / 6 }),
  Object.freeze({ xi: 1 / 6, eta: 2 / 3, weight: 1 / 6 }),
]);
const MIDSIDE_EDGE_PATTERN =
  /^M-(C-R(?<ringA>\d+)-S\d+)--(C-R(?<ringB>\d+)-S\d+)$/u;
const EXPECTED_POLICY = deepFreeze({
  holeBoundaryCircumferentialEdges: 'ANALYTIC_CIRCULAR_ARC',
  outerBoundaryCircumferentialEdges: 'ANALYTIC_CIRCULAR_ARC',
  internalCircumferentialEdges: 'STRAIGHT_CHORD',
  radialEdges: 'STRAIGHT_CHORD',
  diagonalEdges: 'STRAIGHT_CHORD',
  physicalBoundaryGeometryPreserved: true,
  internalCircularConstraintClaimed: false,
});

export function generateLafeaLugPinholeProbeStableT6MeshV2(specValue) {
  const sourcePackage = generateV1Mesh(specValue);
  if (sourcePackage.spec.designId !== LAFEA_BUCKET_01_PROBE_STABLE_DESIGN_V2_ID) {
    throw meshError('LAFEA_B01_CANDIDATE_V2_DESIGN_ID_REQUIRED');
  }
  const transformed = transformInternalCircumferentialMidsides(
    sourcePackage.mesh,
    sourcePackage.spec.radialAxis.coordinates.length - 1,
  );
  const mesh = deepFreeze(transformed.mesh);
  const sidecar = sourcePackage.sidecar;
  const featureSets = sourcePackage.featureSets;
  const quality = evaluateCandidateMeshQuality(mesh, featureSets, sourcePackage.spec);
  const reasons = candidateQualityReasons(quality);
  const status = reasons.length === 0
    ? 'CANDIDATE_MESH_READY_NOT_PRODUCTION'
    : 'CANDIDATE_MESH_BLOCKED';
  const midsideGeometryPolicyHash = canonicalLafeaSha256(EXPECTED_POLICY);
  const meshHash = canonicalLafeaSha256(mesh);
  const qualityHash = canonicalLafeaSha256(quality);
  const base = {
    schema: LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V2_PACKAGE_SCHEMA,
    generatorRevision: LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V2_GENERATOR_REVISION,
    sourceGeneratorRevision: sourcePackage.generatorRevision,
    spec: sourcePackage.spec,
    specHash: sourcePackage.specHash,
    midsideGeometryPolicy: EXPECTED_POLICY,
    midsideGeometryPolicyHash,
    midsideTransformationEvidence: deepFreeze({
      internalCircumferentialMidsideCount:
        transformed.internalCircumferentialMidsideCount,
      physicalBoundaryCircumferentialMidsideCount:
        transformed.physicalBoundaryCircumferentialMidsideCount,
      allInternalCircumferentialMidsidesChordal: true,
      allPhysicalBoundaryCircumferentialMidsidesAnalytic: true,
    }),
    mesh,
    sidecar,
    featureSets,
    quality,
    meshHash,
    sidecarHash: sourcePackage.sidecarHash,
    featureSetHash: sourcePackage.featureSetHash,
    qualityHash,
    status,
    reasons,
    authority: sourcePackage.authority,
  };
  return deepFreeze({
    ...base,
    semanticHash: canonicalLafeaSha256(packageSemanticIdentity(base)),
  });
}

export function validateLafeaLugPinholeProbeStableT6MeshV2Package(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw meshError('LAFEA_B01_CANDIDATE_V2_PACKAGE_NOT_RECORD');
    }
    if (value.schema !== LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V2_PACKAGE_SCHEMA
      || value.generatorRevision
        !== LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V2_GENERATOR_REVISION
      || value.spec?.designId !== LAFEA_BUCKET_01_PROBE_STABLE_DESIGN_V2_ID) {
      throw meshError('LAFEA_B01_CANDIDATE_V2_PACKAGE_SCHEMA_INVALID');
    }
    assertCandidateAuthority(value.authority);
    if (JSON.stringify(value.midsideGeometryPolicy)
      !== JSON.stringify(EXPECTED_POLICY)
      || canonicalLafeaSha256(value.midsideGeometryPolicy)
        !== value.midsideGeometryPolicyHash) {
      throw meshError('LAFEA_B01_CANDIDATE_V2_MIDSIDE_POLICY_INVALID');
    }
    if (canonicalLafeaSha256(value.mesh) !== value.meshHash
      || canonicalLafeaSha256(value.sidecar) !== value.sidecarHash
      || canonicalLafeaSha256(value.featureSets) !== value.featureSetHash) {
      throw meshError('LAFEA_B01_CANDIDATE_V2_HASH_MISMATCH');
    }
    verifyMidsidePolicy(value.mesh, value.spec.radialAxis.coordinates.length - 1);
    const independentQuality = evaluateCandidateMeshQuality(
      value.mesh,
      value.featureSets,
      value.spec,
    );
    if (JSON.stringify(independentQuality) !== JSON.stringify(value.quality)
      || canonicalLafeaSha256(independentQuality) !== value.qualityHash) {
      throw meshError('LAFEA_B01_CANDIDATE_V2_QUALITY_MISMATCH');
    }
    const expectedReasons = candidateQualityReasons(independentQuality);
    const expectedStatus = expectedReasons.length === 0
      ? 'CANDIDATE_MESH_READY_NOT_PRODUCTION'
      : 'CANDIDATE_MESH_BLOCKED';
    if (value.status !== expectedStatus
      || JSON.stringify(value.reasons) !== JSON.stringify(expectedReasons)) {
      throw meshError('LAFEA_B01_CANDIDATE_V2_STATUS_MISMATCH');
    }
    if (canonicalLafeaSha256(packageSemanticIdentity(value))
      !== value.semanticHash) {
      throw meshError('LAFEA_B01_CANDIDATE_V2_SEMANTIC_HASH_MISMATCH');
    }
    const rebuilt = generateLafeaLugPinholeProbeStableT6MeshV2(value.spec);
    if (rebuilt.semanticHash !== value.semanticHash
      || rebuilt.meshHash !== value.meshHash
      || rebuilt.qualityHash !== value.qualityHash) {
      throw meshError('LAFEA_B01_CANDIDATE_V2_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw meshError('LAFEA_B01_CANDIDATE_V2_PACKAGE_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_CANDIDATE_V2_PACKAGE_INVALID'],
    });
  }
}

export function observeLafeaLugPinholeProbeStableT6TopologyV2(
  packageValue,
  locationValue,
) {
  if (packageValue?.schema
      !== LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V2_PACKAGE_SCHEMA) {
    throw meshError('LAFEA_B01_CANDIDATE_V2_TOPOLOGY_PACKAGE_INVALID');
  }
  const v1CompatiblePackage = {
    ...packageValue,
    schema: V1_PACKAGE_SCHEMA,
  };
  const source = observeV1Topology(v1CompatiblePackage, locationValue);
  const { semanticHash: _discard, ...sourceWithoutHash } = source;
  const base = {
    ...sourceWithoutHash,
    schema: LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V2_TOPOLOGY_SCHEMA,
    generatorRevision: LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V2_GENERATOR_REVISION,
    designId: LAFEA_BUCKET_01_PROBE_STABLE_DESIGN_V2_ID,
    meshHash: packageValue.meshHash,
    midsideGeometryPolicyHash: packageValue.midsideGeometryPolicyHash,
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function transformInternalCircumferentialMidsides(sourceMesh, radialCellCount) {
  const mesh = JSON.parse(JSON.stringify(sourceMesh));
  const nodeById = new Map(mesh.nodes.map((node) => [node.nodeId, node]));
  let internalCircumferentialMidsideCount = 0;
  let physicalBoundaryCircumferentialMidsideCount = 0;
  for (const node of mesh.nodes) {
    const match = MIDSIDE_EDGE_PATTERN.exec(node.nodeId);
    if (!match || match.groups.ringA !== match.groups.ringB) continue;
    const ring = Number(match.groups.ringA);
    if (ring === 0 || ring === radialCellCount) {
      physicalBoundaryCircumferentialMidsideCount += 1;
      continue;
    }
    const first = nodeById.get(match[1]);
    const second = nodeById.get(match[3]);
    if (!first || !second) {
      throw meshError('LAFEA_B01_CANDIDATE_V2_MIDSIDE_ENDPOINT_MISSING');
    }
    node.x = clean((first.x + second.x) / 2);
    node.y = clean((first.y + second.y) / 2);
    node.z = clean(((first.z ?? 0) + (second.z ?? 0)) / 2);
    internalCircumferentialMidsideCount += 1;
  }
  verifyMidsidePolicy(mesh, radialCellCount);
  return {
    mesh,
    internalCircumferentialMidsideCount,
    physicalBoundaryCircumferentialMidsideCount,
  };
}

function verifyMidsidePolicy(mesh, radialCellCount) {
  const nodeById = new Map(mesh.nodes.map((node) => [node.nodeId, node]));
  for (const node of mesh.nodes) {
    const match = MIDSIDE_EDGE_PATTERN.exec(node.nodeId);
    if (!match || match.groups.ringA !== match.groups.ringB) continue;
    const ring = Number(match.groups.ringA);
    const first = nodeById.get(match[1]);
    const second = nodeById.get(match[3]);
    if (!first || !second) {
      throw meshError('LAFEA_B01_CANDIDATE_V2_MIDSIDE_ENDPOINT_MISSING');
    }
    const chordX = (first.x + second.x) / 2;
    const chordY = (first.y + second.y) / 2;
    const chordDistance = Math.hypot(node.x - chordX, node.y - chordY);
    if (ring !== 0 && ring !== radialCellCount && chordDistance > 1e-12) {
      throw meshError('LAFEA_B01_CANDIDATE_V2_INTERNAL_MIDSIDE_NOT_CHORDAL');
    }
    if ((ring === 0 || ring === radialCellCount) && !(chordDistance > 1e-12)) {
      throw meshError('LAFEA_B01_CANDIDATE_V2_BOUNDARY_MIDSIDE_NOT_ANALYTIC');
    }
  }
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
      throw meshError('LAFEA_B01_CANDIDATE_V2_MESH_NODE_MISSING');
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
      const determinant = jacobianAt(
        t6ShapeFunctions(point.xi, point.eta),
        nodes,
      ).determinant;
      if (determinant < minimumIntegrationPointJacobian) {
        minimumIntegrationPointJacobian = determinant;
        minimumIntegrationPointJacobianElementId = element.elementId;
      }
      integratedArea += determinant * point.weight;
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
    schema: 'lafea-lug-pinhole-probe-stable-mesh-quality/v2',
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

function boundaryRadiusError(feature, nodeById, center, expectedRadius) {
  let maximum = 0;
  for (const nodeId of feature.nodeIds) {
    const node = nodeById.get(nodeId);
    if (!node) throw meshError('LAFEA_B01_CANDIDATE_V2_FEATURE_NODE_MISSING');
    maximum = Math.max(maximum, Math.abs(
      Math.hypot(node.x - center.x, node.y - center.y) - expectedRadius,
    ));
  }
  return maximum;
}

function packageSemanticIdentity(value) {
  return {
    schema: value.schema,
    generatorRevision: value.generatorRevision,
    sourceGeneratorRevision: value.sourceGeneratorRevision,
    specHash: value.specHash,
    midsideGeometryPolicyHash: value.midsideGeometryPolicyHash,
    midsideTransformationEvidence: value.midsideTransformationEvidence,
    meshHash: value.meshHash,
    sidecarHash: value.sidecarHash,
    featureSetHash: value.featureSetHash,
    qualityHash: value.qualityHash,
    status: value.status,
    reasons: value.reasons,
    authority: value.authority,
  };
}

function assertCandidateAuthority(value) {
  if (!value
    || value.candidateMeshOnly !== true
    || value.productionMeshAuthority !== false
    || value.stressAcceptanceAuthority !== false
    || value.qualificationAuthority !== false
    || value.bucketQualified !== false) {
    throw meshError('LAFEA_B01_CANDIDATE_V2_PRODUCTION_AUTHORITY_FORBIDDEN');
  }
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
