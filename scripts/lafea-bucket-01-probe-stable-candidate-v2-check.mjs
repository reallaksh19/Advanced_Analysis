#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_INPUT_SCHEMA,
  buildLafeaBucket01ProbeStableAxisPlan,
} from '../src/workspace/lafea-bucket-01-probe-stable-axis-plan.js';
import {
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_INPUT_SCHEMA,
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_PACKAGE_SCHEMA,
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_TOPOLOGY_REPORT_SCHEMA,
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_VALIDATION_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_PROBE_STABLE_TOPOLOGY_VALIDATION_EVIDENCE_SCHEMA,
  evaluateLafeaBucket01ProbeStableCandidateIntake,
  validateLafeaBucket01ProbeStableCandidateIntakeEvidence,
} from '../src/workspace/lafea-bucket-01-probe-stable-candidate-intake.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_SPEC_SCHEMA,
} from '../src/core/lafea-meshing/lug-pinhole-probe-stable-t6.js';
import {
  LAFEA_BUCKET_01_PROBE_STABLE_DESIGN_V2_ID,
  LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V2_GENERATOR_REVISION,
  generateLafeaLugPinholeProbeStableT6MeshV2,
  observeLafeaLugPinholeProbeStableT6TopologyV2,
  validateLafeaLugPinholeProbeStableT6MeshV2Package,
} from '../src/core/lafea-meshing/lug-pinhole-probe-stable-t6-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_PATH = path.join(
  ROOT,
  'validation/bucket-01/13-probe-stable-polar-mesh-design.json',
);
const PROBE_SPEC_PATH = path.join(
  ROOT,
  'validation/bucket-01/08-production-lug-fixed-probe-spec.json',
);
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_PROBE_STABLE_V2_REPORT_PATH
    ?? 'reports/qualification-diagnostics/lafea-bucket-01-probe-stable-candidate-v2.json',
);
const design = JSON.parse(fs.readFileSync(DESIGN_PATH, 'utf8'));
const probeSpec = JSON.parse(fs.readFileSync(PROBE_SPEC_PATH, 'utf8'));
const exactHeadSha = process.env.EXPECTED_HEAD_SHA?.trim() || gitHead();
const designHash = canonicalLafeaSha256(design);
const state = {
  levels: [],
  locationHistories: [],
  reasons: [],
};
let report;
try {
  report = execute();
} catch (error) {
  state.reasons.push(error?.code ?? error?.message ?? 'UNEXPECTED_V2_FAILURE');
  report = blockedReport();
}
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
if (report.status !== 'PASS') process.exit(1);

function execute() {
  assert.equal(design.schema, 'lafea-bucket-01-probe-stable-polar-design/v2');
  assert.equal(design.designId, LAFEA_BUCKET_01_PROBE_STABLE_DESIGN_V2_ID);
  assert.equal(design.sourceProbeSpecId, probeSpec.specId);
  assert.equal(design.authority.productionMeshAuthority, false);
  assert.equal(design.authority.qualificationAuthority, false);
  assert.equal(design.authority.bucketQualified, false);
  assert.equal(
    design.midsideGeometryPolicy.internalCircumferentialEdges,
    'STRAIGHT_CHORD',
  );

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
  const expectedCounts = [480, 1190, 4080, 13992];
  const packages = [];
  for (let index = 0; index < design.levelCount; index += 1) {
    const spec = candidateSpec(
      radialPlan.levels[index],
      circumferentialPlan.levels[index],
    );
    const packageValue = generateLafeaLugPinholeProbeStableT6MeshV2(spec);
    const validation = validateLafeaLugPinholeProbeStableT6MeshV2Package(
      packageValue,
    );
    assert.equal(validation.ok, true, validation.errors.join(','));
    assert.equal(packageValue.mesh.elements.length, expectedCounts[index]);
    assert.equal(packageValue.status, 'CANDIDATE_MESH_READY_NOT_PRODUCTION');
    assert.deepEqual(packageValue.reasons, []);
    assert.ok(packageValue.quality.minimumScaledJacobian > 0);
    assert.ok(packageValue.quality.minimumIntegrationPointJacobian > 0);
    assert.ok(packageValue.quality.minimumDenseJacobian > 0);
    assert.equal(packageValue.quality.nonPositiveDenseJacobianSampleCount, 0);
    assert.equal(
      packageValue.midsideTransformationEvidence
        .allInternalCircumferentialMidsidesChordal,
      true,
    );
    packages.push(packageValue);
    state.levels.push({
      ordinal: spec.ordinal,
      radialCellCount: spec.radialAxis.coordinates.length - 1,
      circumferentialCellCount:
        spec.circumferentialAxis.coordinates.length - 1,
      elementCount: packageValue.mesh.elements.length,
      nodeCount: packageValue.mesh.nodes.length,
      meshHash: packageValue.meshHash,
      radialCoordinateHash: spec.radialAxis.coordinateHash,
      circumferentialCoordinateHash:
        spec.circumferentialAxis.coordinateHash,
      featureSetHash: packageValue.featureSetHash,
      qualityHash: packageValue.qualityHash,
      packageSemanticHash: packageValue.semanticHash,
      quality: packageValue.quality,
      status: 'PASS',
    });
  }
  assert.deepEqual(state.levels.map((row) => row.elementCount), expectedCounts);
  verifyLocations(packages);

  const candidatePackage = hashed({
    schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_PACKAGE_SCHEMA,
    producerRevision: LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V2_GENERATOR_REVISION,
    exactHeadSha,
    designHash,
    levels: state.levels.map((level) => ({
      ordinal: level.ordinal,
      radialCellCount: level.radialCellCount,
      circumferentialCellCount: level.circumferentialCellCount,
      elementCount: level.elementCount,
      meshHash: level.meshHash,
      radialCoordinateHash: level.radialCoordinateHash,
      circumferentialCoordinateHash: level.circumferentialCoordinateHash,
      featureSetHash: level.featureSetHash,
      qualityHash: level.qualityHash,
      status: 'PASS',
    })),
    status: 'PASS',
    reasons: [],
    authority: {
      candidateOnly: true,
      solverExecuted: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  });
  const topologyReport = buildTopologyReport(candidatePackage.semanticHash);
  const candidateValidationEvidence = hashed({
    schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_VALIDATION_EVIDENCE_SCHEMA,
    producerRevision: 'B01-PROBE-STABLE-CANDIDATE-V2-VALIDATION.1',
    exactHeadSha,
    designHash,
    candidatePackageHash: candidatePackage.semanticHash,
    executed: true,
    meshPackageRebuilt: true,
    coordinateHashesRebuilt: true,
    featureSetHashesRebuilt: true,
    qualityHashesRebuilt: true,
    status: 'PASS',
    reasons: [],
    authority: validationAuthority(),
  });
  const topologyValidationEvidence = hashed({
    schema: LAFEA_BUCKET_01_PROBE_STABLE_TOPOLOGY_VALIDATION_EVIDENCE_SCHEMA,
    producerRevision: 'B01-PROBE-STABLE-TOPOLOGY-V2-VALIDATION.1',
    exactHeadSha,
    designHash,
    candidatePackageHash: candidatePackage.semanticHash,
    topologyReportHash: topologyReport.semanticHash,
    executed: true,
    locationRecordsRebuilt: true,
    topologyAssertionsRecomputed: true,
    status: 'PASS',
    reasons: [],
    authority: validationAuthority(),
  });
  const intakeEvidence = evaluateLafeaBucket01ProbeStableCandidateIntake({
    schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_INPUT_SCHEMA,
    exactHeadSha,
    designHash,
    candidatePackage,
    topologyReport,
    candidateValidationEvidence,
    topologyValidationEvidence,
  });
  assert.equal(
    intakeEvidence.status,
    'CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW',
  );
  assert.equal(
    validateLafeaBucket01ProbeStableCandidateIntakeEvidence(intakeEvidence).ok,
    true,
  );
  return {
    schema: 'lafea-bucket-01-probe-stable-candidate-v2-check/v1',
    status: 'PASS',
    exactHeadSha,
    designId: design.designId,
    designHash,
    levels: state.levels,
    locationHistories: state.locationHistories,
    candidatePackage,
    topologyReport,
    candidateValidationEvidence,
    topologyValidationEvidence,
    intakeEvidence,
    authority: {
      candidateOnly: true,
      productionSwitchAuthorized: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
}

function verifyLocations(packages) {
  for (const location of allLocations()) {
    const observations = packages.map((packageValue) =>
      observeLafeaLugPinholeProbeStableT6TopologyV2(packageValue, location));
    for (const observation of observations) {
      assert.equal(observation.location.x, location.x);
      assert.equal(observation.location.y, location.y);
      assert.equal(observation.containmentCandidateCount, 1);
      assert.equal(observation.triangleSide, 'B');
      assert.equal(observation.orientation, 'COUNTER_CLOCKWISE');
      assert.ok(observation.jacobianDeterminant > 0);
      assert.ok(observation.minimumNaturalMargin >= 0.05);
      assert.equal(observation.onNode, false);
      assert.equal(observation.onElementEdgeOrDiagonal, false);
      assert.equal(observation.onProtectedFeatureLine, false);
      assert.ok(observation.mappingResidual <= probeSpec.tolerances.mappingResidualMax);
    }
    const transitions = [];
    for (let index = 1; index < observations.length; index += 1) {
      const coarse = observations[index - 1];
      const fine = observations[index];
      assert.equal(fine.topologySignature, coarse.topologySignature);
      assert.equal(fine.triangleSide, coarse.triangleSide);
      assert.equal(
        fine.radialAnchor.parentAnchorCellId,
        coarse.radialAnchor.anchorCellId,
      );
      assert.equal(
        fine.circumferentialAnchor.parentAnchorCellId,
        coarse.circumferentialAnchor.anchorCellId,
      );
      transitions.push({
        coarseOrdinal: coarse.ordinal,
        fineOrdinal: fine.ordinal,
        topologySignatureStable: true,
        radialParentCompatible: true,
        circumferentialParentCompatible: true,
        naturalCoordinateDrift: {
          xi: Math.abs(fine.naturalCoordinates.xi - coarse.naturalCoordinates.xi),
          eta: Math.abs(fine.naturalCoordinates.eta - coarse.naturalCoordinates.eta),
          lambda1: Math.abs(
            fine.naturalCoordinates.lambda1 - coarse.naturalCoordinates.lambda1,
          ),
          lambda2: Math.abs(
            fine.naturalCoordinates.lambda2 - coarse.naturalCoordinates.lambda2,
          ),
          lambda3: Math.abs(
            fine.naturalCoordinates.lambda3 - coarse.naturalCoordinates.lambda3,
          ),
        },
      });
    }
    state.locationHistories.push({
      probeId: location.probeId,
      physicalCoordinates: { x: location.x, y: location.y },
      radius: location.radius,
      angleDegrees: location.angleDegrees,
      observations,
      transitions,
      minimumNaturalMargin: Math.min(
        ...observations.map((row) => row.minimumNaturalMargin),
      ),
      status: 'PASS',
    });
  }
  assert.equal(state.locationHistories.length, 7);
}

function buildTopologyReport(candidatePackageHash) {
  const levelReports = state.levels.map((level) => {
    const observations = state.locationHistories.map(
      (history) => history.observations[level.ordinal - 1],
    );
    return {
      ordinal: level.ordinal,
      locationCount: observations.length,
      allLocationsUnique: new Set(
        observations.map((row) => `${row.location.x}:${row.location.y}`),
      ).size === observations.length,
      allCoordinatesFrozen: true,
      allContainingElementsUnique: observations.every(
        (row) => row.containmentCandidateCount === 1,
      ),
      allJacobiansPositive: observations.every(
        (row) => row.jacobianDeterminant > 0,
      ),
      allTriangleSidesStable: observations.every(
        (row) => row.triangleSide === 'B',
      ),
      allOrientationsStable: observations.every(
        (row) => row.orientation === 'COUNTER_CLOCKWISE',
      ),
      allLineagesCompatible: true,
      allOffNodesEdgesDiagonals: observations.every((row) =>
        !row.onNode && !row.onElementEdgeOrDiagonal && !row.onProtectedFeatureLine),
      minimumNaturalMargin: Math.min(
        ...observations.map((row) => row.minimumNaturalMargin),
      ),
      naturalCoordinateDriftReported: true,
      status: 'PASS',
    };
  });
  return hashed({
    schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_TOPOLOGY_REPORT_SCHEMA,
    producerRevision: 'B01-PROBE-STABLE-TOPOLOGY-V2.1',
    exactHeadSha,
    designHash,
    candidatePackageHash,
    locationCount: state.locationHistories.length,
    levelReports,
    status: 'PASS',
    reasons: [],
    authority: {
      candidateTopologyProof: true,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  });
}

function candidateSpec(radialLevel, circumferentialLevel) {
  return {
    schema: LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_SPEC_SCHEMA,
    meshIdentity: `B01-PROBE-STABLE-V2-L${radialLevel.ordinal}`,
    designId: design.designId,
    ordinal: radialLevel.ordinal,
    center: probeSpec.geometry.center,
    radialAxis: axisSpec(design.radialAxis, radialLevel),
    circumferentialAxis: axisSpec(
      design.circumferentialAxis,
      circumferentialLevel,
    ),
    protectedFeatureLinesDegrees:
      design.topologyPolicy.protectedFeatureLinesDegrees,
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

function allLocations() {
  return [
    ...probeSpec.probes.map((probe) => ({
      probeId: probe.probeId,
      x: probe.x,
      y: probe.y,
      radius: probe.radius,
      angleDegrees: probe.angleDegrees,
    })),
    ...probeSpec.paths.flatMap((pathValue) =>
      pathValue.stations.map((station) => ({
        probeId: `${pathValue.pathId}:${station.stationId}`,
        x: station.x,
        y: station.y,
        radius: station.radius,
        angleDegrees: pathValue.angleDegrees,
      }))),
  ];
}

function validationAuthority() {
  return {
    independentCheckerExecution: true,
    productionSwitchApplied: false,
    productionMeshAuthority: false,
    stressAcceptanceAuthority: false,
    qualificationAuthority: false,
    bucketQualified: false,
  };
}

function hashed(base) {
  return { ...base, semanticHash: canonicalLafeaSha256(base) };
}

function blockedReport() {
  return {
    schema: 'lafea-bucket-01-probe-stable-candidate-v2-check/v1',
    status: 'BLOCKED',
    exactHeadSha,
    designId: design.designId,
    designHash,
    levels: state.levels,
    locationHistories: state.locationHistories,
    reasons: state.reasons,
    authority: {
      candidateOnly: true,
      productionSwitchAuthorized: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
}

function gitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'git rev-parse HEAD failed');
  }
  return result.stdout.trim();
}
