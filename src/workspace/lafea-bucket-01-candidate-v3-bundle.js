import {
  LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_SPEC_SCHEMA,
} from '../core/lafea-meshing/lug-pinhole-probe-stable-t6.js';
import {
  LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V3_GENERATOR_REVISION,
  generateLafeaLugPinholeProbeStableT6MeshV3,
  observeLafeaLugPinholeProbeStableT6TopologyV3,
  validateLafeaLugPinholeProbeStableT6MeshV3Package,
} from '../core/lafea-meshing/lug-pinhole-probe-stable-t6-v3.js';
import {
  LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_INPUT_SCHEMA,
  buildLafeaBucket01ProbeStableAxisPlan,
} from './lafea-bucket-01-probe-stable-axis-plan.js';
import {
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_INPUT_SCHEMA,
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_PACKAGE_SCHEMA,
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_TOPOLOGY_REPORT_SCHEMA,
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_VALIDATION_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_PROBE_STABLE_TOPOLOGY_VALIDATION_EVIDENCE_SCHEMA,
  evaluateLafeaBucket01ProbeStableCandidateIntake,
} from './lafea-bucket-01-probe-stable-candidate-intake.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_BUCKET_01_CANDIDATE_V3_BUNDLE_SCHEMA =
  'lafea-bucket-01-candidate-v3-bundle/v1';
export const LAFEA_BUCKET_01_CANDIDATE_V3_BUNDLE_REVISION =
  'B01-CANDIDATE-V3-BUNDLE.1';

const INPUT_KEYS = Object.freeze([
  'exactHeadSha', 'design', 'probeSpec',
]);
const EXPECTED_COUNTS = Object.freeze([480, 1190, 4080, 14256]);

export function buildLafeaBucket01CandidateV3Bundle(input) {
  exactKeys(input, INPUT_KEYS, 'candidate V3 bundle input');
  const exactHeadSha = gitSha(input.exactHeadSha);
  const design = structuredClone(input.design);
  const probeSpec = structuredClone(input.probeSpec);
  if (design.designId !== 'B01-PROBE-STABLE-POLAR-V3'
    || design.schema !== 'lafea-bucket-01-probe-stable-polar-design/v3'
    || design.sourceProbeSpecId !== probeSpec.specId
    || JSON.stringify(design.radialAxis.protectedBreakpoints)
      !== JSON.stringify([60])) {
    throw bundleError('LAFEA_B01_CANDIDATE_V3_DESIGN_INVALID');
  }
  const designHash = canonicalLafeaSha256(design);
  const radialPlan = buildLafeaBucket01ProbeStableAxisPlan(axisInput(
    design,
    design.radialAxis,
    design.geometry.holeRadius,
    design.geometry.outerRadius,
  ));
  const circumferentialPlan = buildLafeaBucket01ProbeStableAxisPlan(axisInput(
    design,
    design.circumferentialAxis,
    design.geometry.startAngleDegrees,
    design.geometry.endAngleDegrees,
  ));
  const packages = radialPlan.levels.map((radialLevel, index) => {
    const packageValue = generateLafeaLugPinholeProbeStableT6MeshV3({
      schema: LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_SPEC_SCHEMA,
      meshIdentity: `B01-PROBE-STABLE-V3-L${index + 1}`,
      designId: design.designId,
      ordinal: index + 1,
      center: probeSpec.geometry.center,
      radialAxis: axisSpec(design.radialAxis, radialLevel),
      circumferentialAxis: axisSpec(
        design.circumferentialAxis,
        circumferentialPlan.levels[index],
      ),
      protectedFeatureLinesDegrees:
        design.topologyPolicy.protectedFeatureLinesDegrees,
    });
    const validation = validateLafeaLugPinholeProbeStableT6MeshV3Package(
      packageValue,
    );
    if (!validation.ok
      || packageValue.status !== 'CANDIDATE_MESH_READY_NOT_PRODUCTION'
      || packageValue.mesh.elements.length !== EXPECTED_COUNTS[index]) {
      throw bundleError(
        'LAFEA_B01_CANDIDATE_V3_PACKAGE_BLOCKED',
        validation.errors.join(','),
      );
    }
    return packageValue;
  });
  const locations = allLocations(probeSpec);
  const locationHistories = locations.map((location) => {
    const observations = packages.map((packageValue) =>
      observeLafeaLugPinholeProbeStableT6TopologyV3(
        packageValue,
        location,
      ));
    observations.forEach((observation) => {
      if (observation.containmentCandidateCount !== 1
        || observation.triangleSide !== 'B'
        || observation.orientation !== 'COUNTER_CLOCKWISE'
        || !(observation.jacobianDeterminant > 0)
        || !(observation.minimumNaturalMargin >= 0.05)
        || observation.onNode
        || observation.onElementEdgeOrDiagonal
        || observation.onProtectedFeatureLine
        || observation.mappingResidual
          > probeSpec.tolerances.mappingResidualMax) {
        throw bundleError('LAFEA_B01_CANDIDATE_V3_LOCATION_BLOCKED');
      }
    });
    const transitions = observations.slice(1).map((fine, index) => {
      const coarse = observations[index];
      if (fine.topologySignature !== coarse.topologySignature
        || fine.triangleSide !== coarse.triangleSide
        || fine.radialAnchor.parentAnchorCellId
          !== coarse.radialAnchor.anchorCellId
        || fine.circumferentialAnchor.parentAnchorCellId
          !== coarse.circumferentialAnchor.anchorCellId) {
        throw bundleError('LAFEA_B01_CANDIDATE_V3_TOPOLOGY_DRIFT');
      }
      return deepFreeze({
        coarseOrdinal: coarse.ordinal,
        fineOrdinal: fine.ordinal,
        topologySignatureStable: true,
        radialParentCompatible: true,
        circumferentialParentCompatible: true,
        naturalCoordinateDrift: {
          xi: Math.abs(fine.naturalCoordinates.xi - coarse.naturalCoordinates.xi),
          eta: Math.abs(fine.naturalCoordinates.eta - coarse.naturalCoordinates.eta),
          lambda1: Math.abs(
            fine.naturalCoordinates.lambda1
              - coarse.naturalCoordinates.lambda1,
          ),
          lambda2: Math.abs(
            fine.naturalCoordinates.lambda2
              - coarse.naturalCoordinates.lambda2,
          ),
          lambda3: Math.abs(
            fine.naturalCoordinates.lambda3
              - coarse.naturalCoordinates.lambda3,
          ),
        },
      });
    });
    return deepFreeze({
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
  });
  const candidatePackage = hashed({
    schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_PACKAGE_SCHEMA,
    producerRevision: LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V3_GENERATOR_REVISION,
    exactHeadSha,
    designHash,
    levels: packages.map((packageValue) => ({
      ordinal: packageValue.spec.ordinal,
      radialCellCount: packageValue.spec.radialAxis.coordinates.length - 1,
      circumferentialCellCount:
        packageValue.spec.circumferentialAxis.coordinates.length - 1,
      elementCount: packageValue.mesh.elements.length,
      meshHash: packageValue.meshHash,
      radialCoordinateHash: packageValue.spec.radialAxis.coordinateHash,
      circumferentialCoordinateHash:
        packageValue.spec.circumferentialAxis.coordinateHash,
      featureSetHash: packageValue.featureSetHash,
      qualityHash: packageValue.qualityHash,
      mappingWindowHash: packageValue.mappingWindowHash,
      status: 'PASS',
    })),
    status: 'PASS',
    reasons: [],
    authority: candidateAuthority(),
  });
  const topologyReport = buildTopologyReport({
    exactHeadSha,
    designHash,
    candidatePackageHash: candidatePackage.semanticHash,
    packages,
    locationHistories,
  });
  const candidateValidationEvidence = hashed({
    schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_VALIDATION_EVIDENCE_SCHEMA,
    producerRevision: 'B01-PROBE-STABLE-CANDIDATE-V3-RECOMPUTATION.1',
    exactHeadSha,
    designHash,
    candidatePackageHash: candidatePackage.semanticHash,
    executed: true,
    meshPackageRebuilt: true,
    coordinateHashesRebuilt: true,
    featureSetHashesRebuilt: true,
    qualityHashesRebuilt: true,
    mappingWindowRecomputed: true,
    status: 'PASS',
    reasons: [],
    authority: validationAuthority(),
  });
  const topologyValidationEvidence = hashed({
    schema: LAFEA_BUCKET_01_PROBE_STABLE_TOPOLOGY_VALIDATION_EVIDENCE_SCHEMA,
    producerRevision: 'B01-PROBE-STABLE-TOPOLOGY-V3-RECOMPUTATION.1',
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
  const base = {
    schema: LAFEA_BUCKET_01_CANDIDATE_V3_BUNDLE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CANDIDATE_V3_BUNDLE_REVISION,
    exactHeadSha,
    designHash,
    radialPlan,
    circumferentialPlan,
    packages,
    locationHistories,
    candidatePackage,
    topologyReport,
    candidateValidationEvidence,
    topologyValidationEvidence,
    intakeEvidence,
    authority: {
      candidateOnly: true,
      executedRecomputation: true,
      independentCheckerExecution: false,
      solverExecuted: false,
      productionSwitchAuthorized: false,
      productionMeshAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function buildTopologyReport(context) {
  const levelReports = context.packages.map((packageValue, index) => {
    const observations = context.locationHistories.map(
      (history) => history.observations[index],
    );
    return {
      ordinal: index + 1,
      locationCount: observations.length,
      allLocationsUnique: new Set(observations.map(
        (row) => `${row.location.x}:${row.location.y}`,
      )).size === observations.length,
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
        !row.onNode
          && !row.onElementEdgeOrDiagonal
          && !row.onProtectedFeatureLine),
      minimumNaturalMargin: Math.min(
        ...observations.map((row) => row.minimumNaturalMargin),
      ),
      naturalCoordinateDriftReported: true,
      status: packageValue.status === 'CANDIDATE_MESH_READY_NOT_PRODUCTION'
        ? 'PASS' : 'BLOCKED',
    };
  });
  return hashed({
    schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_TOPOLOGY_REPORT_SCHEMA,
    producerRevision: 'B01-PROBE-STABLE-TOPOLOGY-V3.1',
    exactHeadSha: context.exactHeadSha,
    designHash: context.designHash,
    candidatePackageHash: context.candidatePackageHash,
    locationCount: context.locationHistories.length,
    levelReports,
    status: levelReports.every((row) => row.status === 'PASS')
      ? 'PASS' : 'BLOCKED',
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

function allLocations(probeSpec) {
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

function axisInput(design, axis, domainStart, domainEnd) {
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

function candidateAuthority() {
  return {
    candidateOnly: true,
    solverExecuted: false,
    productionSwitchApplied: false,
    productionMeshAuthority: false,
    stressAcceptanceAuthority: false,
    qualificationAuthority: false,
    bucketQualified: false,
  };
}

function validationAuthority() {
  return {
    executedRecomputation: true,
    independentCheckerExecution: false,
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

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw bundleError('LAFEA_B01_CANDIDATE_V3_EXACT_KEYS_INVALID', label);
  }
}

function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw bundleError('LAFEA_B01_CANDIDATE_V3_HEAD_INVALID');
  }
  return value;
}

function bundleError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
