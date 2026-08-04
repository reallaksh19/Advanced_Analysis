#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROFILE_KINDS,
  canonicalProfile,
} from '../src/core/lafea-profile-contract/index.js';
import {
  LAFEA_CONTINUUM_MAPPING_EVIDENCE_SCHEMA,
  LAFEA_CONTINUUM_PATH_MAPPING_EVIDENCE_SCHEMA,
  validateLafeaLugPinholeMappingPackage,
} from '../src/core/lafea-application-templates/continuum-application-mapping-evidence.js';
import {
  LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_SPEC_SCHEMA,
} from '../src/core/lafea-meshing/lug-pinhole-probe-stable-t6.js';
import {
  generateLafeaLugPinholeProbeStableT6MeshV3,
} from '../src/core/lafea-meshing/lug-pinhole-probe-stable-t6-v3.js';
import {
  LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_INPUT_SCHEMA,
  buildLafeaBucket01ProbeStableAxisPlan,
} from '../src/workspace/lafea-bucket-01-probe-stable-axis-plan.js';
import {
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_REVISION,
} from '../src/workspace/lafea-bucket-01-probe-stable-candidate-intake.js';
import {
  LAFEA_BUCKET_01_CANDIDATE_PROJECTION_INPUT_SCHEMA,
  createLafeaBucket01CandidateProjection,
  validateLafeaBucket01CandidateProjection,
} from '../src/workspace/lafea-bucket-01-candidate-projection.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import { createNbT6cFixture } from './lafea-nb-t6c-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = 'a'.repeat(40);
const design = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'validation/bucket-01/13-probe-stable-polar-mesh-design.json'),
  'utf8',
));
const fixture = createNbT6cFixture(ROOT, HEAD);
const designHash = canonicalLafeaSha256(design);
const packages = candidatePackages();
const intake = candidateIntake(packages);
const source = structuredClone(fixture.projectionInput);
source.physicalProblem.modelIdentity = 'B01-CANDIDATE-PROJECTION-CONTRACT';
source.physicalProblem.sourceAncestry.sourceModelIdentity =
  'B01-CANDIDATE-PROJECTION-CONTRACT';
source.physicalProblem.sourceAncestry.adapterIdentity =
  'B01-CANDIDATE-PROJECTION-ADAPTER';
source.physicalProblem.kinematics = {
  mode: 'BOUNDARY_ZERO',
  ux: { xCoefficient: 0, yCoefficient: 0, constant: 0 },
  uy: { xCoefficient: 0, yCoefficient: 0, constant: 0 },
};
source.physicalProblem.limitations = [
  'CONCENTRIC_ANNULAR_LUG_PINHOLE_ONLY',
  'BUCKET_01_PROBE_STABLE_V3_CANDIDATE_ONLY',
];
source.featureProjection.loadFeature.role = 'RADIAL_QUARTER_0';
source.featureProjection.boundaryFeature.role = 'RADIAL_QUARTER_2';
const input = projectionInput(source, packages, intake);
const projection = createLafeaBucket01CandidateProjection(input);

assert.equal(projection.status, 'CANDIDATE_PROJECTION_READY_NOT_PRODUCTION');
assert.equal(projection.exactHeadSha, HEAD);
assert.equal(projection.designHash, designHash);
assert.equal(projection.candidateIntakeEvidenceHash, intake.semanticHash);
assert.equal(projection.levels.length, 4);
assert.deepEqual(
  projection.levels.map((row) => row.meshEvidence.mesh.elements.length),
  [480, 1190, 4080, 14256],
);
assert.deepEqual(
  projection.levels.map((row) => row.loadResultant),
  [[0, 0], [0, 0], [0, 0], [0, 0]],
);
assert.equal(projection.mappingPackages.length, 4);
projection.levels.forEach((level, index) => {
  assert.equal(level.ordinal, index + 1);
  assert.equal(level.mappingAuthority.radialStart, 20);
  assert.equal(level.mappingAuthority.radialEnd, 60);
  assert.equal(level.mappingAuthority.physicalCoordinateSelection, true);
  assert.equal(level.mappingAuthority.indexScaledSelectionUsed, false);
  assert.equal(level.mappingAuthority.productionMeshAuthority, false);
  assert.equal(level.mappingAuthority.qualificationAuthority, false);
  assert.equal(level.mappingWindowHash, packages[index].mappingWindowHash);
  assert.deepEqual(level.loadEdgeNodeIds, packages[index].mappingWindow.loadNodeIds.slice().sort());
  assert.deepEqual(
    level.boundaryEdgeNodeIds,
    packages[index].mappingWindow.restraintNodeIds.slice().sort(),
  );
  assert.equal(level.mappingPackage.status, 'MAPPING_EVIDENCE_QUALIFIED');
  assert.equal(level.mappingPackage.boundBinding.status, 'BOUND');
  assert.equal(
    validateLafeaLugPinholeMappingPackage(level.mappingPackage).ok,
    true,
  );
  assert.equal(
    level.mappingPackage.materialRegionEvidence.schema,
    LAFEA_CONTINUUM_MAPPING_EVIDENCE_SCHEMA,
  );
  assert.equal(
    level.mappingPackage.loadEdgeEvidence.schema,
    LAFEA_CONTINUUM_PATH_MAPPING_EVIDENCE_SCHEMA,
  );
  assert.equal(
    level.mappingPackage.boundaryEdgeEvidence.schema,
    LAFEA_CONTINUUM_PATH_MAPPING_EVIDENCE_SCHEMA,
  );
  assert.equal(level.mappingPackage.loadEdgeEvidence.metrics.radialStart, 20);
  assert.equal(level.mappingPackage.loadEdgeEvidence.metrics.radialEnd, 60);
  assert.equal(level.mappingPackage.loadEdgeEvidence.metrics.closureAccepted, true);
  assert.equal(level.mappingPackage.boundaryEdgeEvidence.metrics.radialStart, 20);
  assert.equal(level.mappingPackage.boundaryEdgeEvidence.metrics.radialEnd, 60);
  assert.equal(
    level.mappingPackage.boundaryEdgeEvidence.metrics.restraintSufficient,
    true,
  );
  assert.equal(
    level.mappingPackage.loadEdgeEvidence.metrics.mappingWindowHash,
    packages[index].mappingWindowHash,
  );
  assert.equal(
    level.mappingPackage.boundaryEdgeEvidence.metrics.mappingWindowHash,
    packages[index].mappingWindowHash,
  );
});
assert.equal(projection.authority.candidateOnly, true);
assert.equal(projection.authority.candidateIntakeVerified, true);
assert.equal(projection.authority.exactPhysicalWindowMappedPerLevel, true);
assert.equal(projection.authority.stageDocumentsGeneratedPerLevel, true);
assert.equal(projection.authority.mappingPackagesQualifiedPerLevel, true);
assert.equal(projection.authority.solverExecuted, false);
assert.equal(projection.authority.productionSwitchAuthorized, false);
assert.equal(projection.authority.productionSwitchApplied, false);
assert.equal(projection.authority.productionMeshAuthority, false);
assert.equal(projection.authority.stressAcceptanceAuthority, false);
assert.equal(projection.authority.qualificationAuthority, false);
assert.equal(projection.authority.bucketQualified, false);
assert.equal(validateLafeaBucket01CandidateProjection(projection).ok, true);

const staleIntake = clone(intake);
staleIntake.levels[3].mappingWindowHash = syntheticHash('stale-window');
rehashAndFreeze(staleIntake);
assert.throws(
  () => createLafeaBucket01CandidateProjection({
    ...input,
    candidateIntakeEvidence: staleIntake,
  }),
  hasCode('LAFEA_B01_CANDIDATE_PROJECTION_PACKAGE_INVALID'),
);

const wrongRole = structuredClone(input);
wrongRole.featureProjection.loadFeature.role = 'RADIAL_QUARTER_1';
assert.throws(
  () => createLafeaBucket01CandidateProjection(wrongRole),
  hasCode('LAFEA_B01_CANDIDATE_MAPPING_WINDOW_INVALID'),
);

const tamperedProjection = clone(projection);
tamperedProjection.levels[0].mappingPackage.loadEdgeEvidence.metrics.radialEnd = 61;
assert.equal(validateLafeaBucket01CandidateProjection(tamperedProjection).ok, false);

for (const relativePath of [
  'scripts/lafea-bucket-01-production-replay.mjs',
  'src/workspace/lafea-lug-pinhole-stage-projector.js',
  'src/workspace/lafea-lug-pinhole-mesh-ladder.js',
]) {
  const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  assert.equal(
    content.includes('lafea-bucket-01-candidate-projection'),
    false,
    `${relativePath} imports the candidate projection adapter`,
  );
  assert.equal(
    content.includes('generateLafeaLugPinholeProbeStableT6MeshV3'),
    false,
    `${relativePath} imports the Design V3 candidate generator`,
  );
}

console.log('PASS LAFEA Bucket-01 Design V3 candidate projection contract');

function projectionInput(sourceInput, candidatePackagesValue, intakeValue) {
  return {
    schema: LAFEA_BUCKET_01_CANDIDATE_PROJECTION_INPUT_SCHEMA,
    exactHeadSha: HEAD,
    designHash,
    candidateIntakeEvidence: intakeValue,
    candidatePackages: candidatePackagesValue,
    meshProfiles: meshProfiles(candidatePackagesValue),
    releaseRecord: sourceInput.releaseRecord,
    compatibilityReceipt: sourceInput.compatibilityReceipt,
    canonicalModelHash: sourceInput.canonicalModelHash,
    geometry: sourceInput.geometry,
    physicalProblem: sourceInput.physicalProblem,
    featureProjection: sourceInput.featureProjection,
    applicationEvidence: sourceInput.applicationEvidence,
    producerRef: 'B01/CANDIDATE-PROJECTION/LAFEA.3',
    sourceAuthorityOriginRef: 'B01/CANDIDATE-PROJECTION',
  };
}

function candidatePackages() {
  const radialPlan = buildLafeaBucket01ProbeStableAxisPlan(axisInput(
    design.radialAxis,
    design.geometry.holeRadius,
    design.geometry.outerRadius,
  ));
  const circumferentialPlan = buildLafeaBucket01ProbeStableAxisPlan(axisInput(
    design.circumferentialAxis,
    design.geometry.startAngleDegrees,
    design.geometry.endAngleDegrees,
  ));
  return radialPlan.levels.map((radialLevel, index) =>
    generateLafeaLugPinholeProbeStableT6MeshV3({
      schema: LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_SPEC_SCHEMA,
      meshIdentity: `B01-CANDIDATE-PROJECTION-L${index + 1}`,
      designId: design.designId,
      ordinal: index + 1,
      center: { x: 0, y: 0 },
      radialAxis: axisSpec(design.radialAxis, radialLevel),
      circumferentialAxis: axisSpec(
        design.circumferentialAxis,
        circumferentialPlan.levels[index],
      ),
      protectedFeatureLinesDegrees:
        design.topologyPolicy.protectedFeatureLinesDegrees,
    }));
}

function candidateIntake(candidatePackagesValue) {
  const base = {
    schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_REVISION,
    exactHeadSha: HEAD,
    designHash,
    candidatePackageHash: syntheticHash('candidate-package-summary'),
    topologyReportHash: syntheticHash('topology-report'),
    candidateValidationEvidenceHash: syntheticHash('candidate-validation'),
    topologyValidationEvidenceHash: syntheticHash('topology-validation'),
    expectedLocationCount: 7,
    minimumCandidateNaturalMargin: 0.05,
    levels: candidatePackagesValue.map((packageValue) => ({
      ordinal: packageValue.spec.ordinal,
      radialCellCount: packageValue.spec.radialAxis.coordinates.length - 1,
      circumferentialCellCount:
        packageValue.spec.circumferentialAxis.coordinates.length - 1,
      elementCount: packageValue.mesh.elements.length,
      meshHash: packageValue.meshHash,
      mappingWindowHash: packageValue.mappingWindowHash,
      topologyMinimumNaturalMargin: 0.1,
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
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function meshProfiles(candidatePackagesValue) {
  return candidatePackagesValue.map((packageValue, index) => canonicalProfile(
    PROFILE_KINDS.MESH,
    {
      schema: 'lafea-mesh-profile/v1',
      profileIdentity: `B01-CANDIDATE-PROJECTION-L${index + 1}`,
      sourceRevision: '1',
      fields: {
        continuumElement: 'T6',
        shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1',
        globalTargetSize: 100
          / packageValue.spec.circumferentialAxis.coordinates.length,
        adjacentSizeRatioMax: 3,
        aspectRatioWarn: 10,
        aspectRatioBlock: 100,
        scaledJacobianWarn: 0.1,
        scaledJacobianBlock: 0.001,
        adaptiveLevels: 3,
      },
      semanticHash: undefined,
    },
  ));
}

function axisInput(axis, domainStart, domainEnd) {
  return {
    schema: LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_INPUT_SCHEMA,
    axisId: axis.axisId,
    axisKind: axis.axisKind,
    domainStart,
    domainEnd,
    anchors: axis.anchors,
    protectedBreakpoints: axis.protectedBreakpoints,
    targetPhase: axis.targetPhase,
    refinementRatio: design.refinementRatio,
    levelCount: design.levelCount,
    backgroundBaseDivisions: axis.backgroundBaseDivisions,
    windowClearanceFraction: axis.windowClearanceFraction,
  };
}

function axisSpec(axisDesign, level) {
  return {
    axisId: axisDesign.axisId,
    axisKind: axisDesign.axisKind,
    ordinal: level.ordinal,
    domainStart: level.coordinates[0],
    domainEnd: level.coordinates.at(-1),
    coordinates: level.coordinates,
    coordinateHash: level.coordinateHash,
    protectedBreakpoints: level.protectedBreakpoints,
    anchorCells: level.anchorCells,
  };
}

function syntheticHash(label) {
  return canonicalLafeaSha256({ schema: 'synthetic/v1', label });
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function rehashAndFreeze(value) {
  delete value.semanticHash;
  value.semanticHash = canonicalLafeaSha256(value);
  return deepFreeze(value);
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function hasCode(code) {
  return (error) => error?.code === code;
}
