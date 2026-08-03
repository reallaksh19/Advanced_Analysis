#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_INPUT_SCHEMA,
  buildLafeaBucket01ProbeStableAxisPlan,
} from '../src/workspace/lafea-bucket-01-probe-stable-axis-plan.js';
import {
  LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_SPEC_SCHEMA,
  generateLafeaLugPinholeProbeStableT6Mesh,
  observeLafeaLugPinholeProbeStableT6Topology,
  validateLafeaLugPinholeProbeStableT6MeshPackage,
} from '../src/core/lafea-meshing/lug-pinhole-probe-stable-t6.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_PATH = path.join(ROOT, 'validation/bucket-01/13-probe-stable-polar-mesh-design.json');
const PROBE_SPEC_PATH = path.join(ROOT, 'validation/bucket-01/08-production-lug-fixed-probe-spec.json');
const REPORT_PATH = path.resolve(ROOT, process.env.LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_REPORT_PATH
  ?? 'reports/qualification-diagnostics/lafea-bucket-01-probe-stable-candidate-mesh.json');
const design = JSON.parse(fs.readFileSync(DESIGN_PATH, 'utf8'));
const probeSpec = JSON.parse(fs.readFileSync(PROBE_SPEC_PATH, 'utf8'));
const sourceHeadSha = process.env.EXPECTED_HEAD_SHA?.trim() || gitHead();
const state = { levels: [], locations: [], negativeCases: [], reasons: [] };

let report;
try {
  report = executeCandidateCheck();
} catch (error) {
  state.reasons.push(error?.code ?? error?.message ?? 'UNEXPECTED_CANDIDATE_FAILURE');
  report = buildReport('BLOCKED');
}
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
if (report.status !== 'PASS') process.exit(1);

function executeCandidateCheck() {
  assert.equal(design.authority.productionMeshAuthority, false);
  assert.equal(design.authority.qualificationAuthority, false);
  assert.equal(design.authority.bucketQualified, false);
  assert.equal(probeSpec.specId, design.sourceProbeSpecId);
  const radialPlan = buildLafeaBucket01ProbeStableAxisPlan(axisInput(
    design.radialAxis, design.geometry.holeRadius, design.geometry.outerRadius,
  ));
  const circumferentialPlan = buildLafeaBucket01ProbeStableAxisPlan(axisInput(
    design.circumferentialAxis,
    design.geometry.startAngleDegrees,
    design.geometry.endAngleDegrees,
  ));
  const expectedCounts = [480, 1190, 4080, 13992];
  const packages = [];
  for (let index = 0; index < design.levelCount; index += 1) {
    const spec = candidateSpec(radialPlan.levels[index], circumferentialPlan.levels[index]);
    const packageValue = generateLafeaLugPinholeProbeStableT6Mesh(spec);
    const validation = validateLafeaLugPinholeProbeStableT6MeshPackage(packageValue);
    assert.equal(validation.ok, true, validation.errors.join(','));
    assert.equal(packageValue.mesh.elements.length, expectedCounts[index]);
    assertCandidateAuthority(packageValue.authority);
    verifyQuality(packageValue.quality, spec);
    verifyCardinalFeatureNodes(packageValue);
    if (packageValue.status !== 'CANDIDATE_MESH_READY_NOT_PRODUCTION') {
      state.reasons.push(...packageValue.reasons.map((reason) =>
        `LEVEL_${spec.ordinal}_${reason}`));
    }
    packages.push(packageValue);
    state.levels.push({
      ordinal: spec.ordinal,
      radialCellCount: spec.radialAxis.coordinates.length - 1,
      circumferentialCellCount: spec.circumferentialAxis.coordinates.length - 1,
      elementCount: packageValue.mesh.elements.length,
      nodeCount: packageValue.mesh.nodes.length,
      meshHash: packageValue.meshHash,
      sidecarHash: packageValue.sidecarHash,
      packageSemanticHash: packageValue.semanticHash,
      quality: packageValue.quality,
      reasons: packageValue.reasons,
      authority: packageValue.authority,
      status: packageValue.status === 'CANDIDATE_MESH_READY_NOT_PRODUCTION'
        ? 'PASS' : 'BLOCKED',
    });
  }
  assert.deepEqual(state.levels.map((row) => row.elementCount), expectedCounts);
  verifyFrozenLocations(packages);
  runNegativeCases(
    packages[1],
    candidateSpec(radialPlan.levels[1], circumferentialPlan.levels[1]),
    packages[0],
  );
  assert.equal(state.negativeCases.every((row) => row.status === 'PASS'), true);
  const status = state.levels.every((row) => row.status === 'PASS')
    && state.locations.every((row) => row.status === 'PASS')
    ? 'PASS' : 'BLOCKED';
  return buildReport(
    status,
    radialPlan.semanticHash,
    circumferentialPlan.semanticHash,
  );
}

function verifyFrozenLocations(packages) {
  for (const location of allLocations()) {
    const observations = packages.map((packageValue) =>
      observeLafeaLugPinholeProbeStableT6Topology(packageValue, location));
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
      assertCandidateAuthority(observation.authority);
    }
    const transitions = [];
    for (let index = 1; index < observations.length; index += 1) {
      const coarse = observations[index - 1];
      const fine = observations[index];
      assert.equal(fine.topologySignature, coarse.topologySignature);
      assert.equal(fine.triangleSide, coarse.triangleSide);
      assert.equal(fine.radialAnchor.parentAnchorCellId, coarse.radialAnchor.anchorCellId);
      assert.equal(
        fine.circumferentialAnchor.parentAnchorCellId,
        coarse.circumferentialAnchor.anchorCellId,
      );
      transitions.push({
        coarseOrdinal: coarse.ordinal,
        fineOrdinal: fine.ordinal,
        radialParentCompatible: true,
        circumferentialParentCompatible: true,
        topologySignatureStable: true,
        naturalCoordinateDrift: {
          xi: Math.abs(fine.naturalCoordinates.xi - coarse.naturalCoordinates.xi),
          eta: Math.abs(fine.naturalCoordinates.eta - coarse.naturalCoordinates.eta),
          lambda1: Math.abs(fine.naturalCoordinates.lambda1 - coarse.naturalCoordinates.lambda1),
          lambda2: Math.abs(fine.naturalCoordinates.lambda2 - coarse.naturalCoordinates.lambda2),
          lambda3: Math.abs(fine.naturalCoordinates.lambda3 - coarse.naturalCoordinates.lambda3),
        },
      });
    }
    state.locations.push({
      probeId: location.probeId,
      physicalCoordinates: { x: location.x, y: location.y },
      radius: location.radius,
      angleDegrees: location.angleDegrees,
      observations: observations.map((row) => ({
        ordinal: row.ordinal,
        elementId: row.elementId,
        cellId: row.cellId,
        triangleSide: row.triangleSide,
        orientation: row.orientation,
        naturalCoordinates: row.naturalCoordinates,
        minimumNaturalMargin: row.minimumNaturalMargin,
        mappingResidual: row.mappingResidual,
        jacobianDeterminant: row.jacobianDeterminant,
        radialAnchor: row.radialAnchor,
        circumferentialAnchor: row.circumferentialAnchor,
        topologySignature: row.topologySignature,
        semanticHash: row.semanticHash,
      })),
      transitions,
      minimumNaturalMargin: Math.min(...observations.map((row) => row.minimumNaturalMargin)),
      maximumNaturalCoordinateDrift: Math.max(0, ...transitions.flatMap((row) =>
        Object.values(row.naturalCoordinateDrift))),
      status: 'PASS',
    });
  }
}

function verifyQuality(quality, spec) {
  assert.ok(Number.isFinite(quality.minimumScaledJacobian));
  assert.ok(Number.isFinite(quality.minimumIntegrationPointJacobian));
  assert.ok(quality.relativeAreaError <= 0.005);
  assert.ok(quality.holeBoundaryMaximumRadiusError / spec.radialAxis.domainStart <= 0.001);
  assert.ok(quality.outerBoundaryMaximumRadiusError / spec.radialAxis.domainEnd <= 0.001);
  assert.ok(Number.isFinite(quality.maximumAspectRatio));
  assert.ok(quality.minimumAngleDegrees > 0);
}

function verifyCardinalFeatureNodes(packageValue) {
  const nodeById = new Map(packageValue.mesh.nodes.map((row) => [row.nodeId, row]));
  const radii = packageValue.spec.radialAxis.coordinates;
  for (const feature of packageValue.featureSets.radialLines) {
    assert.ok([0, 90, 180, 270].includes(feature.angleDegrees));
    for (let ring = 0; ring < radii.length; ring += 1) {
      const node = nodeById.get(`C-R${ring}-S${feature.sector}`);
      assert.ok(node);
      const angle = feature.angleDegrees * Math.PI / 180;
      const expectedX = clean(packageValue.spec.center.x + radii[ring] * Math.cos(angle));
      const expectedY = clean(packageValue.spec.center.y + radii[ring] * Math.sin(angle));
      assert.equal(node.x, expectedX);
      assert.equal(node.y, expectedY);
    }
  }
}

function runNegativeCases(validPackage, validSpec, blockedPackage) {
  negative('UNORDERED_OR_DUPLICATE_RADIAL_COORDINATES', () => {
    const value = structuredClone(validSpec);
    value.radialAxis.coordinates[1] = value.radialAxis.coordinates[0];
    generateLafeaLugPinholeProbeStableT6Mesh(value);
  }, 'LAFEA_B01_CANDIDATE_AXIS_COORDINATE_ORDER_INVALID');

  negative('ANGULAR_SPAN_NOT_360', () => {
    const value = structuredClone(validSpec);
    value.circumferentialAxis.domainEnd = 359;
    value.circumferentialAxis.coordinates.at(-1);
    value.circumferentialAxis.coordinates[value.circumferentialAxis.coordinates.length - 1] = 359;
    value.circumferentialAxis.coordinateHash = coordinateHash(value.circumferentialAxis);
    generateLafeaLugPinholeProbeStableT6Mesh(value);
  }, 'LAFEA_B01_CANDIDATE_ANGLE_SPAN_INVALID');

  negative('MISSING_CARDINAL_FEATURE_BREAKPOINT', () => {
    const value = structuredClone(validSpec);
    const index = value.circumferentialAxis.coordinates.indexOf(270);
    value.circumferentialAxis.coordinates.splice(index, 1);
    value.circumferentialAxis.protectedBreakpoints = [90, 180];
    value.circumferentialAxis.coordinateHash = coordinateHash(value.circumferentialAxis);
    generateLafeaLugPinholeProbeStableT6Mesh(value);
  }, 'LAFEA_B01_CANDIDATE_CARDINAL_FEATURE_MISSING');

  negative('PROTECTED_BREAKPOINT_INSIDE_ANCHOR_WINDOW', () => {
    const value = structuredClone(validSpec);
    value.circumferentialAxis.protectedBreakpoints.push(83);
    generateLafeaLugPinholeProbeStableT6Mesh(value);
  }, 'LAFEA_B01_CANDIDATE_BREAKPOINT_INSIDE_ANCHOR_WINDOW');

  negative('PROBE_ANCHOR_EMITTED_AS_GRIDLINE', () => {
    const value = structuredClone(validSpec);
    const anchor = value.radialAxis.anchorCells[0];
    value.radialAxis.coordinates.splice(anchor.cellIndex + 1, 0, anchor.anchorValue);
    value.radialAxis.coordinateHash = coordinateHash(value.radialAxis);
    generateLafeaLugPinholeProbeStableT6Mesh(value);
  }, 'LAFEA_B01_CANDIDATE_ANCHOR_EMITTED_AS_GRIDLINE');

  negative('OVERLAPPING_ANCHOR_WINDOWS', () => {
    const value = structuredClone(validSpec);
    value.radialAxis.anchorCells[1].left = value.radialAxis.anchorCells[0].right - 0.1;
    value.radialAxis.anchorCells[1].width = value.radialAxis.anchorCells[1].right
      - value.radialAxis.anchorCells[1].left;
    generateLafeaLugPinholeProbeStableT6Mesh(value);
  }, 'LAFEA_B01_CANDIDATE_ANCHOR_WINDOWS_OVERLAP');

  const nonPositiveAccepted = blockedPackage.status === 'CANDIDATE_MESH_BLOCKED'
    && blockedPackage.reasons.includes('NON_POSITIVE_SCALED_JACOBIAN');
  state.negativeCases.push({
    caseId: 'NON_POSITIVE_JACOBIAN',
    expectedCode: 'NON_POSITIVE_SCALED_JACOBIAN',
    observedCode: blockedPackage.reasons[0] ?? null,
    status: nonPositiveAccepted ? 'PASS' : 'FAIL',
  });
  assert.equal(nonPositiveAccepted, true);

  negative('TAMPERED_COORDINATE_HASH', () => {
    const value = structuredClone(validSpec);
    value.radialAxis.coordinateHash = `sha256:${'0'.repeat(64)}`;
    generateLafeaLugPinholeProbeStableT6Mesh(value);
  }, 'LAFEA_B01_CANDIDATE_AXIS_COORDINATE_HASH_MISMATCH');

  negativeValidation('TAMPERED_MESH_HASH', () => {
    const value = structuredClone(validPackage);
    value.meshHash = `sha256:${'0'.repeat(64)}`;
    return value;
  }, 'LAFEA_B01_CANDIDATE_MESH_HASH_MISMATCH');

  negativeValidation('PRODUCTION_AUTHORITY_FORBIDDEN', () => {
    const value = structuredClone(validPackage);
    value.authority.productionMeshAuthority = true;
    return value;
  }, 'LAFEA_B01_CANDIDATE_PRODUCTION_AUTHORITY_FORBIDDEN');
}

function negative(caseId, action, expectedCode) {
  let code = null;
  try { action(); } catch (error) { code = error?.code ?? null; }
  const status = code === expectedCode ? 'PASS' : 'FAIL';
  state.negativeCases.push({ caseId, expectedCode, observedCode: code, status });
  assert.equal(status, 'PASS', `${caseId}: expected ${expectedCode}; got ${code}`);
}

function negativeValidation(caseId, mutate, expectedCode) {
  const result = validateLafeaLugPinholeProbeStableT6MeshPackage(mutate());
  const code = result.errors[0] ?? null;
  const status = !result.ok && code === expectedCode ? 'PASS' : 'FAIL';
  state.negativeCases.push({ caseId, expectedCode, observedCode: code, status });
  assert.equal(status, 'PASS', `${caseId}: expected ${expectedCode}; got ${code}`);
}

function candidateSpec(radialLevel, circumferentialLevel) {
  return {
    schema: LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_SPEC_SCHEMA,
    meshIdentity: `B01_PROBE_STABLE_CANDIDATE_L${radialLevel.ordinal}`,
    designId: design.designId,
    ordinal: radialLevel.ordinal,
    center: probeSpec.geometry.center,
    radialAxis: axisLevel(design.radialAxis, radialLevel,
      design.geometry.holeRadius, design.geometry.outerRadius),
    circumferentialAxis: axisLevel(design.circumferentialAxis,
      circumferentialLevel, design.geometry.startAngleDegrees,
      design.geometry.endAngleDegrees),
    protectedFeatureLinesDegrees: design.topologyPolicy.protectedFeatureLinesDegrees,
  };
}

function axisLevel(axis, level, domainStart, domainEnd) {
  return {
    axisId: axis.axisId,
    axisKind: axis.axisKind,
    ordinal: level.ordinal,
    domainStart,
    domainEnd,
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
    ...probeSpec.probes.map((row) => ({
      probeId: row.probeId, x: row.x, y: row.y,
      radius: row.radius, angleDegrees: row.angleDegrees,
    })),
    ...probeSpec.paths.flatMap((pathValue) => pathValue.stations.map((row) => ({
      probeId: `${pathValue.pathId}:${row.stationId}`,
      x: row.x, y: row.y, radius: row.radius,
      angleDegrees: pathValue.angleDegrees,
    }))),
  ];
}

function coordinateHash(axis) {
  return canonicalLafeaSha256({
    schema: 'lafea-bucket-01-probe-stable-axis-coordinates/v1',
    axisId: axis.axisId,
    ordinal: axis.ordinal,
    coordinates: axis.coordinates,
  });
}

function assertCandidateAuthority(value) {
  assert.equal(value.candidateMeshOnly, true);
  assert.equal(value.productionMeshAuthority, false);
  assert.equal(value.stressAcceptanceAuthority, false);
  assert.equal(value.qualificationAuthority, false);
  assert.equal(value.bucketQualified, false);
}

function buildReport(status, radialPlanHash = null, circumferentialPlanHash = null) {
  const base = {
    schema: 'lafea-bucket-01-probe-stable-candidate-mesh-report/v1',
    producerRevision: 'B01-PROBE-STABLE-CANDIDATE-CHECK.1',
    designId: design.designId,
    sourceProbeSpecId: probeSpec.specId,
    sourceHeadSha,
    radialPlanHash,
    circumferentialPlanHash,
    candidateNaturalMarginTarget: 0.05,
    governedProductionNaturalMarginUnchanged: probeSpec.tolerances.naturalCoordinateMarginMin,
    levels: state.levels,
    locations: state.locations,
    negativeCases: state.negativeCases,
    reasons: [...new Set(state.reasons)].sort(),
    status,
    exitGate: {
      allFourCandidateLevelsGenerated: state.levels.length === 4,
      allFrozenLocationsTopologyPass: state.locations.length === allLocations().length
        && state.locations.every((row) => row.status === 'PASS'),
      allNegativeCasesFailClosed: state.negativeCases.length === 10
        && state.negativeCases.every((row) => row.status === 'PASS'),
      productionAuthorityRemainsFalse: true,
      qualificationAuthorityRemainsFalse: true,
    },
    runtimeCustody: {
      focusedCandidateCheckExecuted: true,
      fullExactHeadCheckExecuted: false,
      exactHeadQualificationClaimed: false,
      realCheckoutExactHeadRunStillRequired: true,
    },
    authority: {
      candidateMeshOnly: true,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  return { ...base, evidenceHash: canonicalLafeaSha256(base) };
}

function clean(value) {
  return Object.is(value, -0) || Math.abs(value) < 1e-15 ? 0 : value;
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
