import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  ALLOWED_ARTIFACT_SCOPES,
  ARTIFACT_KEYS,
  EXPECTED_DESIGN_ID,
  EXPECTED_LEVELS,
  EXPECTED_LOCATION_COUNT,
  PACKAGE_REVISION,
  PACKAGE_SCHEMA,
  assertFalseAuthority,
  assertFalseCandidateAuthority,
  deepFreeze,
  exactKeys,
  fullSemanticHash,
  gitSha,
  hashArray,
  near,
  nullableOrdinal,
  plainRecord,
  relativePath,
  sha256,
  text,
  verificationError,
  verifyFullSemanticHash,
} from './lafea-bucket-01-independent-candidate-verification-internal.js';
import { allLocations } from './lafea-bucket-01-independent-candidate-verification-numerics.js';

export function validateArtifactEnvelope(value, expectedRole, expectedScope) {
  exactKeys(value, ARTIFACT_KEYS, `${expectedRole} artifact`);
  if (value.role !== expectedRole
    || value.artifactScope !== expectedScope
    || !ALLOWED_ARTIFACT_SCOPES.has(value.artifactScope)) {
    throw verificationError('LAFEA_B01_INDEPENDENT_ARTIFACT_ROLE_INVALID', expectedRole);
  }
  const artifact = {
    artifactId: text(value.artifactId, 'artifactId'),
    artifactScope: value.artifactScope,
    role: value.role,
    relativePath: relativePath(value.relativePath),
    routeId: text(value.routeId, 'routeId'),
    levelOrdinal: nullableOrdinal(value.levelOrdinal),
    exactHeadSha: gitSha(value.exactHeadSha, 'artifact.exactHeadSha'),
    designHash: sha256(value.designHash, 'artifact.designHash'),
    parentArtifactHashes: hashArray(
      value.parentArtifactHashes,
      'parentArtifactHashes',
    ),
    declaredRawFileHash: sha256(value.declaredRawFileHash, 'declaredRawFileHash'),
    computedRawFileHash: sha256(value.computedRawFileHash, 'computedRawFileHash'),
    payload: plainRecord(value.payload, 'artifact payload'),
  };
  if (artifact.declaredRawFileHash !== artifact.computedRawFileHash) {
    throw verificationError('LAFEA_B01_INDEPENDENT_RAW_FILE_HASH_MISMATCH');
  }
  return deepFreeze(artifact);
}

export function validateDesign(value) {
  if (value.schema !== 'lafea-bucket-01-probe-stable-polar-design/v3'
    || value.designId !== EXPECTED_DESIGN_ID
    || value.levelCount !== EXPECTED_LEVELS.length
    || value.geometry?.holeRadius !== 20
    || value.geometry?.outerRadius !== 100
    || value.geometry?.startAngleDegrees !== 0
    || value.geometry?.endAngleDegrees !== 360
    || JSON.stringify(value.radialAxis?.protectedBreakpoints) !== '[60]'
    || value.productionMappingPolicy?.radialWindowStart !== 20
    || value.productionMappingPolicy?.radialWindowEnd !== 60
    || value.productionMappingPolicy?.windowEndpointsRequiredAtEveryLevel !== true
    || value.productionMappingPolicy?.edgeSelectionAuthority
      !== 'EXACT_PHYSICAL_COORDINATE_WINDOW_NOT_INDEX_SCALING'
    || value.midsideGeometryPolicy?.holeBoundaryCircumferentialEdges
      !== 'ANALYTIC_CIRCULAR_ARC'
    || value.midsideGeometryPolicy?.outerBoundaryCircumferentialEdges
      !== 'ANALYTIC_CIRCULAR_ARC'
    || value.midsideGeometryPolicy?.internalCircumferentialEdges
      !== 'STRAIGHT_CHORD'
    || value.midsideGeometryPolicy?.radialEdges !== 'STRAIGHT_CHORD'
    || value.midsideGeometryPolicy?.diagonalEdges !== 'STRAIGHT_CHORD') {
    throw verificationError('LAFEA_B01_INDEPENDENT_DESIGN_INVALID');
  }
  assertFalseAuthority(value.authority, 'LAFEA_B01_INDEPENDENT_DESIGN_AUTHORITY_ESCALATED');
}

export function validateProbeSpec(value, design) {
  if (value.schema !== 'lafea-bucket-01-production-lug-probe-spec/v2'
    || value.specId !== design.sourceProbeSpecId
    || value.geometry?.holeRadius !== design.geometry.holeRadius
    || value.geometry?.outerRadius !== design.geometry.outerRadius) {
    throw verificationError('LAFEA_B01_INDEPENDENT_PROBE_SPEC_INVALID');
  }
  const locations = allLocations(value);
  if (locations.length !== EXPECTED_LOCATION_COUNT
    || new Set(locations.map((row) => row.probeId)).size !== locations.length) {
    throw verificationError('LAFEA_B01_INDEPENDENT_PROBE_LOCATION_SET_INVALID');
  }
  for (const location of locations) {
    const angle = location.angleDegrees * Math.PI / 180;
    if (!near(location.x, location.radius * Math.cos(angle), 1e-12)
      || !near(location.y, location.radius * Math.sin(angle), 1e-12)) {
      throw verificationError('LAFEA_B01_INDEPENDENT_PROBE_COORDINATE_DRIFT');
    }
  }
}

export function validateProductionSpec(value, design) {
  if (value.schema !== 'lafea-bucket-01-production-response-spec/v3'
    || value.geometry?.holeRadius !== design.geometry.holeRadius
    || value.geometry?.outerRadius !== design.geometry.outerRadius
    || value.load?.selectedSegmentRadiusStart !== 20
    || value.load?.selectedSegmentRadiusEnd !== 60
    || value.load?.featureRole !== 'RADIAL_QUARTER_0'
    || value.restraint?.featureRole !== 'RADIAL_QUARTER_2'
    || value.load?.baseStartEdge !== 0
    || value.load?.baseEdgeCount !== 1
    || value.restraint?.baseStartEdge !== 0
    || value.restraint?.baseEdgeCount !== 1) {
    throw verificationError('LAFEA_B01_INDEPENDENT_PRODUCTION_WINDOW_SPEC_INVALID');
  }
}

export function validateSuppliedArtifactManifest({
  value,
  candidateArtifactHeadSha,
  designHash,
  artifacts,
}) {
  if (value.schema !== 'lafea-bucket-01-phase-3a-supplied-artifact-manifest/v1'
    || value.exactHeadSha !== candidateArtifactHeadSha
    || value.designHash !== designHash
    || value.authority?.productionSwitchAuthorized !== false
    || value.authority?.qualificationAuthority !== false
    || value.authority?.bucketQualified !== false) {
    throw verificationError('LAFEA_B01_INDEPENDENT_SUPPLIED_MANIFEST_INVALID');
  }
  verifyFullSemanticHash(
    value,
    'LAFEA_B01_INDEPENDENT_SUPPLIED_MANIFEST_HASH_TAMPERED',
  );
  if (!Array.isArray(value.artifacts)
    || value.artifacts.length !== artifacts.length) {
    throw verificationError('LAFEA_B01_INDEPENDENT_SUPPLIED_MANIFEST_COUNT_INVALID');
  }
  const byId = new Map(value.artifacts.map((row) => [row.artifactId, row]));
  for (const artifact of artifacts) {
    const source = byId.get(artifact.artifactId);
    if (!source
      || source.artifactScope !== artifact.artifactScope
      || source.role !== artifact.role
      || source.relativePath !== artifact.relativePath
      || source.routeId !== artifact.routeId
      || source.levelOrdinal !== artifact.levelOrdinal
      || source.exactHeadSha !== artifact.exactHeadSha
      || source.designHash !== artifact.designHash
      || JSON.stringify(source.parentArtifactHashes)
        !== JSON.stringify(artifact.parentArtifactHashes)
      || source.rawFileHash !== artifact.computedRawFileHash) {
      throw verificationError('LAFEA_B01_INDEPENDENT_SUPPLIED_MANIFEST_CUSTODY_MISMATCH');
    }
  }
}

export function validateCandidateIntakeEvidence(value, candidateArtifactHeadSha, designHash) {
  if (value.schema !== 'lafea-bucket-01-probe-stable-candidate-intake-evidence/v2'
    || value.exactHeadSha !== candidateArtifactHeadSha
    || value.designHash !== designHash
    || value.status !== 'CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW'
    || value.authority?.productionSwitchAuthorized !== false
    || value.authority?.productionMeshAuthority !== false
    || value.authority?.qualificationAuthority !== false
    || value.authority?.bucketQualified !== false) {
    throw verificationError('LAFEA_B01_INDEPENDENT_CANDIDATE_INTAKE_INVALID');
  }
  verifyFullSemanticHash(
    value,
    'LAFEA_B01_INDEPENDENT_CANDIDATE_INTAKE_HASH_TAMPERED',
  );
}

export function validateCandidateIntakeLevels(value, packages) {
  if (!Array.isArray(value.levels) || value.levels.length !== packages.length) {
    throw verificationError('LAFEA_B01_INDEPENDENT_CANDIDATE_INTAKE_LEVELS_INVALID');
  }
  value.levels.forEach((level, index) => {
    const packageValue = packages[index];
    if (level.ordinal !== index + 1
      || level.meshHash !== packageValue.meshHash
      || level.mappingWindowHash !== packageValue.mappingWindowHash
      || level.status !== 'PASS') {
      throw verificationError('LAFEA_B01_INDEPENDENT_CANDIDATE_INTAKE_LEVEL_MISMATCH');
    }
  });
}

export function validatePackageCustody(value, expected, design) {
  if (value.schema !== PACKAGE_SCHEMA
    || value.generatorRevision !== PACKAGE_REVISION
    || value.spec?.designId !== design.designId
    || value.spec?.ordinal !== expected.ordinal
    || value.mesh?.elements?.length !== expected.elementCount
    || value.spec?.radialAxis?.coordinates?.length - 1 !== expected.radialCellCount
    || value.spec?.circumferentialAxis?.coordinates?.length - 1
      !== expected.circumferentialCellCount
    || !value.spec.radialAxis.coordinates.includes(60)
    || !value.spec.radialAxis.protectedBreakpoints.includes(60)) {
    throw verificationError('LAFEA_B01_INDEPENDENT_PACKAGE_IDENTITY_INVALID');
  }
  assertFalseCandidateAuthority(value.authority);
  if (canonicalLafeaSha256(value.spec) !== value.specHash
    || canonicalLafeaSha256(value.mesh) !== value.meshHash
    || canonicalLafeaSha256(value.sidecar) !== value.sidecarHash
    || canonicalLafeaSha256(value.featureSets) !== value.featureSetHash
    || canonicalLafeaSha256(value.quality) !== value.qualityHash
    || canonicalLafeaSha256(value.mappingWindow) !== value.mappingWindowHash
    || canonicalLafeaSha256(value.midsideGeometryPolicy)
      !== value.midsideGeometryPolicyHash) {
    throw verificationError('LAFEA_B01_INDEPENDENT_PACKAGE_COMPONENT_HASH_MISMATCH');
  }
  const identity = {
    schema: value.schema,
    generatorRevision: value.generatorRevision,
    sourceGeneratorRevision: value.sourceGeneratorRevision,
    specHash: value.specHash,
    midsideGeometryPolicyHash: value.midsideGeometryPolicyHash,
    midsideTransformationEvidence: value.midsideTransformationEvidence,
    mappingWindowHash: value.mappingWindowHash,
    meshHash: value.meshHash,
    sidecarHash: value.sidecarHash,
    featureSetHash: value.featureSetHash,
    qualityHash: value.qualityHash,
    status: value.status,
    reasons: value.reasons,
    authority: value.authority,
  };
  if (canonicalLafeaSha256(identity) !== value.semanticHash) {
    throw verificationError('LAFEA_B01_INDEPENDENT_PACKAGE_SEMANTIC_HASH_MISMATCH');
  }
  return value;
}
