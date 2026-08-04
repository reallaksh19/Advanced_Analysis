import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  recomputeLafeaBucket01IndependentCandidateQuality,
} from '../src/workspace/lafea-bucket-01-independent-candidate-verification.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import { designFixture } from './lafea-bucket-01-independent-candidate-verification-fixture-design.mjs';

const candidateHead = 'b'.repeat(40);
const designHash = canonicalLafeaSha256(designFixture());

export function buildPackage(radial, angular, designValue) {
  const spec = {
    schema: 'lafea-lug-pinhole-probe-stable-t6-spec/v1',
    meshIdentity: `B01-PROBE-STABLE-V2-L${radial.ordinal}`,
    designId: designValue.designId,
    ordinal: radial.ordinal,
    center: { x: 0, y: 0 },
    radialAxis: axisSpec(designValue.radialAxis, radial),
    circumferentialAxis: axisSpec(designValue.circumferentialAxis, angular),
    protectedFeatureLinesDegrees: [0, 90, 180, 270],
  };
  const state = { nodes: new Map(), edgeMids: new Map(), elements: [] };
  const radii = radial.coordinates;
  const angles = angular.coordinates.slice(0, -1);
  for (let ring = 0; ring < radii.length; ring += 1) {
    for (let sector = 0; sector < angles.length; sector += 1) {
      const angle = angles[sector] * Math.PI / 180;
      state.nodes.set(cornerId(ring, sector), {
        x: clean(radii[ring] * Math.cos(angle)),
        y: clean(radii[ring] * Math.sin(angle)), z: 0,
      });
    }
  }
  const radialCount = radii.length - 1;
  const sectorCount = angles.length;
  for (let ring = 0; ring < radialCount; ring += 1) {
    for (let sector = 0; sector < sectorCount; sector += 1) {
      const next = (sector + 1) % sectorCount;
      addElement(state, `E-R${ring}-S${sector}-A`, [
        cornerId(ring, sector), cornerId(ring + 1, sector), cornerId(ring + 1, next),
      ], radialCount);
      addElement(state, `E-R${ring}-S${sector}-B`, [
        cornerId(ring, sector), cornerId(ring + 1, next), cornerId(ring, next),
      ], radialCount);
    }
  }
  const mesh = {
    schema: 'lafea-analysis-mesh/v1',
    meshIdentity: spec.meshIdentity,
    nodes: [...state.nodes].map(([nodeId, point]) => ({ nodeId, ...point }))
      .sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
    elements: state.elements.sort((a, b) => a.elementId.localeCompare(b.elementId)),
  };
  const featureSets = buildFeatures(state, spec);
  const mappingWindow = mappingWindowFixture(spec, featureSets);
  const sidecar = {
    schema: 'lafea-lug-pinhole-probe-stable-t6-sidecar/v1',
    designId: designValue.designId,
    ordinal: radial.ordinal,
    radialAxis: { anchorCells: radial.anchorCells, coordinates: radial.coordinates },
    circumferentialAxis: { anchorCells: angular.anchorCells, coordinates: angular.coordinates },
    authority: candidateAuthority(),
  };
  sidecar.semanticHash = canonicalLafeaSha256(sidecar);
  const provisional = { spec, mesh, featureSets };
  const quality = recomputeLafeaBucket01IndependentCandidateQuality(provisional);
  const reasons = [];
  if (!(quality.minimumScaledJacobian > 0)) reasons.push('NON_POSITIVE_SCALED_JACOBIAN');
  if (!(quality.minimumIntegrationPointJacobian > 0)) reasons.push('NON_POSITIVE_INTEGRATION_POINT_JACOBIAN');
  if (!(quality.minimumDenseJacobian > 0) || quality.nonPositiveDenseJacobianSampleCount > 0) {
    reasons.push('NON_POSITIVE_DENSE_JACOBIAN');
  }
  const counts = edgeClassificationCounts(mesh, radialCount);
  const base = {
    schema: 'lafea-lug-pinhole-probe-stable-t6-package/v3',
    generatorRevision: 'B01-PROBE-STABLE-T6.3',
    sourceGeneratorRevision: 'B01-PROBE-STABLE-T6.1',
    spec,
    specHash: canonicalLafeaSha256(spec),
    midsideGeometryPolicy: designValue.midsideGeometryPolicy,
    midsideGeometryPolicyHash: canonicalLafeaSha256(designValue.midsideGeometryPolicy),
    midsideTransformationEvidence: {
      internalCircumferentialMidsideCount: counts.INTERNAL_CIRCUMFERENTIAL,
      physicalBoundaryCircumferentialMidsideCount:
        counts.HOLE_BOUNDARY_CIRCUMFERENTIAL + counts.OUTER_BOUNDARY_CIRCUMFERENTIAL,
      allInternalCircumferentialMidsidesChordal: true,
      allPhysicalBoundaryCircumferentialMidsidesAnalytic: true,
    },
    mappingWindow,
    mappingWindowHash: canonicalLafeaSha256(mappingWindow),
    mesh,
    sidecar,
    featureSets,
    quality,
    meshHash: canonicalLafeaSha256(mesh),
    sidecarHash: canonicalLafeaSha256(sidecar),
    featureSetHash: canonicalLafeaSha256(featureSets),
    qualityHash: canonicalLafeaSha256(quality),
    status: reasons.length === 0 ? 'CANDIDATE_MESH_READY_NOT_PRODUCTION' : 'CANDIDATE_MESH_BLOCKED',
    reasons,
    authority: candidateAuthority(),
  };
  return { ...base, semanticHash: canonicalLafeaSha256(packageIdentity(base)) };
}

export function axisSpec(axis, level) {
  return {
    axisId: axis.axisId,
    axisKind: axis.axisKind,
    ordinal: level.ordinal,
    domainStart: level.coordinates[0],
    domainEnd: level.coordinates.at(-1),
    coordinates: level.coordinates,
    coordinateHash: level.coordinateHash,
    protectedBreakpoints: level.protectedBreakpoints,
    anchorCells: level.anchorCells,
  };
}

export function addElement(state, elementId, cornerIds, radialCount) {
  const mids = [
    midpoint(state, cornerIds[0], cornerIds[1], radialCount),
    midpoint(state, cornerIds[1], cornerIds[2], radialCount),
    midpoint(state, cornerIds[2], cornerIds[0], radialCount),
  ];
  state.elements.push({ elementId, elementType: 'T6', nodeIds: [...cornerIds, ...mids] });
}
export function midpoint(state, firstId, secondId, radialCount) {
  const key = edgeKey(firstId, secondId);
  if (state.edgeMids.has(key)) return state.edgeMids.get(key);
  const first = state.nodes.get(firstId);
  const second = state.nodes.get(secondId);
  const firstMeta = parseCorner(firstId);
  const secondMeta = parseCorner(secondId);
  const sameRing = firstMeta.ring === secondMeta.ring;
  const boundaryRing = sameRing && (firstMeta.ring === 0 || firstMeta.ring === radialCount);
  let point;
  if (boundaryRing) {
    const radius = Math.hypot(first.x, first.y);
    const ux = first.x / radius + second.x / radius;
    const uy = first.y / radius + second.y / radius;
    const norm = Math.hypot(ux, uy);
    point = { x: clean(radius * ux / norm), y: clean(radius * uy / norm), z: 0 };
  } else {
    point = { x: clean((first.x + second.x) / 2), y: clean((first.y + second.y) / 2), z: 0 };
  }
  const nodeId = `M-${key.replace(':', '--')}`;
  state.nodes.set(nodeId, point);
  state.edgeMids.set(key, nodeId);
  return nodeId;
}

export function buildFeatures(state, spec) {
  const radialCount = spec.radialAxis.coordinates.length - 1;
  const sectorCount = spec.circumferentialAxis.coordinates.length - 1;
  const circular = (ring, role) => {
    const edgeNodeIds = [];
    const nodeIds = [];
    for (let sector = 0; sector < sectorCount; sector += 1) {
      const next = (sector + 1) % sectorCount;
      const first = cornerId(ring, sector);
      const second = cornerId(ring, next);
      const mid = state.edgeMids.get(edgeKey(first, second));
      edgeNodeIds.push([first, mid, second]);
      nodeIds.push(first, mid);
    }
    return { role, ring, nodeIds, edgeNodeIds };
  };
  const radialLines = [0, 90, 180, 270].map((angleDegrees) => {
    const sector = spec.circumferentialAxis.coordinates.indexOf(angleDegrees);
    const nodeIds = [];
    for (let ring = 0; ring <= radialCount; ring += 1) {
      const corner = cornerId(ring, sector);
      nodeIds.push(corner);
      if (ring < radialCount) {
        nodeIds.push(state.edgeMids.get(edgeKey(corner, cornerId(ring + 1, sector))));
      }
    }
    return { role: `RADIAL_QUARTER_${angleDegrees / 90}`, angleDegrees, sector, nodeIds };
  });
  return {
    schema: 'lafea-lug-pinhole-probe-stable-feature-sets/v1',
    holeBoundary: circular(0, 'HOLE_BOUNDARY'),
    outerBoundary: circular(radialCount, 'OUTER_BOUNDARY'),
    radialLines,
  };
}

export function mappingWindowFixture(spec, featureSets) {
  const startIndex = spec.radialAxis.coordinates.indexOf(20);
  const endIndex = spec.radialAxis.coordinates.indexOf(60);
  assert.equal(startIndex, 0);
  assert.ok(endIndex > startIndex);
  const edgeCount = endIndex - startIndex;
  const nodeStart = startIndex * 2;
  const nodeEnd = nodeStart + edgeCount * 2 + 1;
  const loadLine = featureSets.radialLines.find((row) => row.role === 'RADIAL_QUARTER_0');
  const restraintLine = featureSets.radialLines.find((row) => row.role === 'RADIAL_QUARTER_2');
  return {
    schema: 'lafea-bucket-01-candidate-production-mapping-window/v1',
    designId: spec.designId,
    ordinal: spec.ordinal,
    radialStart: 20, radialEnd: 60,
    radialStartIndex: startIndex, radialEndIndex: endIndex, edgeCount,
    loadFeatureRole: 'RADIAL_QUARTER_0',
    restraintFeatureRole: 'RADIAL_QUARTER_2',
    loadNodeIds: loadLine.nodeIds.slice(nodeStart, nodeEnd),
    restraintNodeIds: restraintLine.nodeIds.slice(nodeStart, nodeEnd),
    exactEndpointNodes: true,
    physicalCoordinateSelection: true,
    indexScaledSelectionUsed: false,
    authority: {
      candidateOnly: true,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
}

export function edgeClassificationCounts(mesh, radialCount) {
  const edges = new Map();
  for (const element of mesh.elements) {
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const first = element.nodeIds[a];
      const second = element.nodeIds[b];
      edges.set(edgeKey(first, second), [first, second]);
    }
  }
  const counts = {
    HOLE_BOUNDARY_CIRCUMFERENTIAL: 0,
    OUTER_BOUNDARY_CIRCUMFERENTIAL: 0,
    INTERNAL_CIRCUMFERENTIAL: 0,
    RADIAL: 0,
    DIAGONAL: 0,
  };
  for (const [first, second] of edges.values()) {
    const a = parseCorner(first); const b = parseCorner(second);
    if (a.ring === b.ring) {
      if (a.ring === 0) counts.HOLE_BOUNDARY_CIRCUMFERENTIAL += 1;
      else if (a.ring === radialCount) counts.OUTER_BOUNDARY_CIRCUMFERENTIAL += 1;
      else counts.INTERNAL_CIRCUMFERENTIAL += 1;
    } else if (a.sector === b.sector) counts.RADIAL += 1;
    else counts.DIAGONAL += 1;
  }
  return counts;
}

export function packageIdentity(value) {
  return {
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
}
export function candidateAuthority() {
  return {
    candidateMeshOnly: true,
    productionMeshAuthority: false,
    stressAcceptanceAuthority: false,
    qualificationAuthority: false,
    bucketQualified: false,
  };
}
export function candidateIntakeFixture(packages, hash) {
  return hashed({
    schema: 'lafea-bucket-01-probe-stable-candidate-intake-evidence/v2',
    producerRevision: 'B01-PROBE-STABLE-INTAKE.3',
    exactHeadSha: candidateHead,
    designHash: hash,
    candidatePackageHash: canonicalLafeaSha256({ packages: packages.map((row) => row.semanticHash) }),
    topologyReportHash: canonicalLafeaSha256({ topology: 1 }),
    candidateValidationEvidenceHash: canonicalLafeaSha256({ validation: 1 }),
    topologyValidationEvidenceHash: canonicalLafeaSha256({ topologyValidation: 1 }),
    expectedLocationCount: 7,
    minimumCandidateNaturalMargin: 0.05,
    levels: packages.map((row, index) => ({
      ordinal: index + 1,
      radialCellCount: row.spec.radialAxis.coordinates.length - 1,
      circumferentialCellCount: row.spec.circumferentialAxis.coordinates.length - 1,
      elementCount: row.mesh.elements.length,
      meshHash: row.meshHash,
      mappingWindowHash: row.mappingWindowHash,
      topologyMinimumNaturalMargin: 0.19,
      status: 'PASS',
    })),
    status: 'CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW',
    reasons: [],
    authority: {
      candidatePackageVerified: true,
      topologyProofVerified: true,
      candidateRebuildValidationExecuted: true,
      topologyRecomputationExecuted: true,
      mappingWindowRecomputed: true,
      executedRecomputation: true,
      independentCheckerExecution: false,
      independentCheckerRequiredBeforeReplayAdjudication: true,
      exactHeadBound: true,
      designHashBound: true,
      productionSwitchAuthorized: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  });
}
export function manifestDefinition(row) {
  return {
    artifactId: row.artifactId,
    artifactScope: row.artifactScope,
    role: row.role,
    relativePath: row.relativePath,
    routeId: row.routeId,
    levelOrdinal: row.levelOrdinal,
    exactHeadSha: row.exactHeadSha,
    designHash: row.designHash,
    parentArtifactHashes: row.parentArtifactHashes,
    rawFileHash: row.computedRawFileHash,
  };
}
export function artifact({
  artifactId, role, relativePath, payload, levelOrdinal = null,
  artifactScope = 'CANDIDATE_MESH_BOUND', parentArtifactHashes = [],
}) {
  const hash = rawHash(payload);
  return {
    artifactId, artifactScope, role, relativePath,
    routeId: 'PROBE_STABLE_T6_CANDIDATE_REPLAY',
    levelOrdinal, exactHeadSha: candidateHead, designHash,
    parentArtifactHashes,
    declaredRawFileHash: hash, computedRawFileHash: hash, payload,
  };
}

export function refreshPackage(value, recomputeMappingHash = true) {
  value.specHash = canonicalLafeaSha256(value.spec);
  value.meshHash = canonicalLafeaSha256(value.mesh);
  value.sidecarHash = canonicalLafeaSha256(value.sidecar);
  value.featureSetHash = canonicalLafeaSha256(value.featureSets);
  value.quality = recomputeLafeaBucket01IndependentCandidateQuality(value);
  value.qualityHash = canonicalLafeaSha256(value.quality);
  if (recomputeMappingHash) {
    value.mappingWindowHash = canonicalLafeaSha256(value.mappingWindow);
  }
  const qualityBlocked = !(value.quality.minimumScaledJacobian > 0)
    || !(value.quality.minimumIntegrationPointJacobian > 0)
    || !(value.quality.minimumDenseJacobian > 0)
    || value.quality.nonPositiveDenseJacobianSampleCount > 0;
  value.reasons = qualityBlocked ? ['NON_POSITIVE_JACOBIAN'] : [];
  value.status = qualityBlocked
    ? 'CANDIDATE_MESH_BLOCKED' : 'CANDIDATE_MESH_READY_NOT_PRODUCTION';
  value.semanticHash = canonicalLafeaSha256(packageIdentity(value));
}
export function syncLevelCase(caseInput, index, updateIntake) {
  const levelArtifact = caseInput.levelArtifacts[index];
  rehashArtifact(levelArtifact);
  const definition = caseInput.replayArtifactManifestArtifact.payload.artifacts
    .find((row) => row.artifactId === levelArtifact.artifactId);
  Object.assign(definition, manifestDefinition(levelArtifact));
  if (updateIntake) {
    const intake = caseInput.candidateIntakeEvidenceArtifact.payload;
    intake.levels[index].meshHash = levelArtifact.payload.meshHash;
    intake.levels[index].mappingWindowHash = levelArtifact.payload.mappingWindowHash;
    rehash(intake);
    rehashArtifact(caseInput.candidateIntakeEvidenceArtifact);
    const intakeDefinition = caseInput.replayArtifactManifestArtifact.payload.artifacts
      .find((row) => row.artifactId === caseInput.candidateIntakeEvidenceArtifact.artifactId);
    Object.assign(intakeDefinition, manifestDefinition(caseInput.candidateIntakeEvidenceArtifact));
  }
  rehash(caseInput.replayArtifactManifestArtifact.payload);
  rehashArtifact(caseInput.replayArtifactManifestArtifact);
}

export function rawHash(payload) {
  return `sha256:${createHash('sha256').update(`${JSON.stringify(payload, null, 2)}\n`).digest('hex')}`;
}
export function hashed(base) { return { ...base, semanticHash: canonicalLafeaSha256(base) }; }
export function rehash(value) { delete value.semanticHash; value.semanticHash = canonicalLafeaSha256(value); return value; }
export function rehashArtifact(value) {
  const hash = rawHash(value.payload);
  value.declaredRawFileHash = hash;
  value.computedRawFileHash = hash;
  return value;
}
export function hasCode(code) { return (error) => error?.code === code; }
export function edgeKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }
export function cornerId(ring, sector) { return `C-R${ring}-S${sector}`; }
export function parseCorner(id) {
  const match = /^C-R(?<ring>\d+)-S(?<sector>\d+)$/u.exec(id);
  assert.ok(match, id);
  return { ring: Number(match.groups.ring), sector: Number(match.groups.sector) };
}
export function clean(value) { return Object.is(value, -0) || Math.abs(value) < 1e-15 ? 0 : value; }
