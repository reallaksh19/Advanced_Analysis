#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateLafeaLugPinholeT6Mesh,
  LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
} from '../src/core/lafea-meshing/lug-pinhole-t6.js';
import {
  observeLafeaBucket01ProbeTopology,
} from '../src/workspace/lafea-bucket-01-fixed-probe.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = path.join(
  ROOT,
  'validation/bucket-01/08-production-lug-fixed-probe-spec.json',
);
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_LUG_PROBE_CONTRACT_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-production-lug-probe-contract.json',
);
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));

validateSpec(spec);
const points = allPoints(spec);
const levels = spec.meshLadder.map((definition) =>
  qualifyLevel(definition, points));
const topologySequences = points.map((point) =>
  topologySequence(point, levels));
const reportBase = {
  schema: 'lafea-bucket-01-production-lug-probe-contract-evidence/v2',
  producerRevision: 'B01-LUG-PROBE-CONTRACT.3',
  specId: spec.specId,
  specHash: canonicalLafeaSha256(spec),
  levels,
  topologySequences,
  pointCount: points.length,
  convergenceWindow: spec.convergenceWindow,
  authority: {
    ...spec.authority,
    containingElementObserved: true,
    radialRingObserved: true,
    circumferentialSectorObserved: true,
    triangleSideObserved: true,
    naturalCoordinatesObserved: true,
    naturalMarginObserved: true,
    pointJacobianObserved: true,
    localElementSizeObserved: true,
    exactQuadraticEdgeDistancesObserved: true,
    topologySignatureObserved: true,
    parentCellLineageObserved: true,
    topologyCompatibilityIsQualificationAuthority: false,
  },
  status: 'PASS',
  disposition: topologySequences.every((row) => row.topologyCompatible)
    ? 'TOPOLOGY_OBSERVABILITY_RETAINED_COMPATIBLE'
    : 'TOPOLOGY_OBSERVABILITY_RETAINED_MESH_REPAIR_REQUIRED',
};
const report = { ...reportBase, evidenceHash: canonicalLafeaSha256(reportBase) };
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));

function validateSpec(value) {
  assert.equal(value.schema, 'lafea-bucket-01-production-lug-probe-spec/v2');
  assert.equal(value.benchmarkId, 'C2D-LUG-PINHOLE-01');
  assert.equal(value.stageId, 'LAFEA.3');
  assert.equal(value.formulation, 'PLANE_STRESS');
  assert.deepEqual(
    value.meshLadder.map((row) => row.elementCount),
    [64, 256, 1024, 4096],
  );
  assert.deepEqual(
    value.meshLadder.map((row) => row.radialDivisions),
    [2, 4, 8, 16],
  );
  assert.deepEqual(
    value.meshLadder.map((row) => row.circumferentialDivisions),
    [16, 32, 64, 128],
  );
  assert.deepEqual(value.convergenceWindow.governedLevelOrdinals, [1, 2, 3, 4]);
  assert.deepEqual(value.convergenceWindow.evaluatedLevelOrdinals, [2, 3, 4]);
  assert.equal(
    value.convergenceWindow.policy,
    'FINEST_THREE_OF_GOVERNED_FOUR_LEVEL_LADDER',
  );
  assert.equal(value.authority.coordinatesFrozenBeforeProductionStressObservation, true);
  assert.equal(value.authority.productionOutputUsedToSelectCoordinates, false);
  assert.equal(value.authority.productionOutputUsedToSetTolerances, false);
  assert.equal(value.authority.movingMaximumUsed, false);
  assert.equal(value.authority.nodalProjectionUsed, false);
  assert.equal(value.authority.crossElementAveragingUsed, false);
  assert.equal(value.authority.integrationPointExtrapolationUsed, false);
  assert.equal(
    value.authority.recovery,
    'DIRECT_T6_B_MATRIX_AT_FIXED_PHYSICAL_COORDINATE',
  );
  assert.ok(value.tolerances.highGradientGciMax > 0);
  assert.ok(value.tolerances.nonSingularGciMax > 0);
  const ids = allPoints(value).map((row) => row.probeId);
  assert.equal(new Set(ids).size, ids.length);
}

function allPoints(value) {
  const probes = value.probes.map((row) => ({ ...row, role: 'FIXED_PROBE' }));
  const pathPoints = value.paths.flatMap((pathValue) =>
    pathValue.stations.map((station) => ({
      probeId: `${pathValue.pathId}:${station.stationId}`,
      pathId: pathValue.pathId,
      stationId: station.stationId,
      radius: station.radius,
      angleDegrees: pathValue.angleDegrees,
      x: station.x,
      y: station.y,
      component: pathValue.component,
      units: pathValue.units,
      zone: station.zone,
      role: 'FIXED_PATH_STATION',
    })));
  return [...probes, ...pathPoints];
}

function qualifyLevel(definition, points) {
  const packageValue = generateLafeaLugPinholeT6Mesh({
    schema: LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
    meshIdentity: `B01_LUG_PROBE_L${definition.ordinal}`,
    center: spec.geometry.center,
    holeRadius: spec.geometry.holeRadius,
    outerRadius: spec.geometry.outerRadius,
    radialDivisions: definition.radialDivisions,
    circumferentialDivisions: definition.circumferentialDivisions,
    startAngleDegrees: 0,
  });
  assert.equal(packageValue.mesh.elements.length, definition.elementCount);
  const pointEvidence = points.map((point) => {
    const observation = observeLafeaBucket01ProbeTopology(
      packageValue.mesh,
      point,
    );
    assert.equal(observation.status, 'PASS');
    assert.equal(observation.containmentCandidateCount, 1);
    assert.equal(observation.meshTopology.metadataAvailable, true);
    assert.ok(observation.mappingResidual <= spec.tolerances.mappingResidualMax);
    assert.ok(
      observation.minimumNaturalMargin
        >= spec.tolerances.naturalCoordinateMarginMin,
    );
    assert.ok(observation.jacobianDeterminant > 0);
    assert.ok(observation.localElementSize > 0);
    assert.ok(observation.minimumPhysicalEdgeDistance > 0);
    return {
      probeId: point.probeId,
      role: point.role,
      elementId: observation.elementId,
      ring: observation.meshTopology.radialRingIndex,
      sector: observation.meshTopology.circumferentialSectorIndex,
      triangleSide: observation.meshTopology.triangleSide,
      orientation: observation.meshTopology.orientation,
      xi: observation.naturalCoordinates.xi,
      eta: observation.naturalCoordinates.eta,
      lambda1: observation.naturalCoordinates.lambda1,
      minimumNaturalMargin: observation.minimumNaturalMargin,
      jacobianDeterminant: observation.jacobianDeterminant,
      localElementSize: observation.localElementSize,
      probeToEdgeDistances: observation.probeToEdgeDistances,
      minimumPhysicalEdgeDistance: observation.minimumPhysicalEdgeDistance,
      topologySignature: observation.topologySignature,
      elementPhaseSignature: observation.elementPhaseSignature,
      parentCellLineage: observation.meshTopology.parentCellLineage,
      mappingResidual: observation.mappingResidual,
      topologyObservationHash: observation.semanticHash,
      status: 'PASS',
    };
  });
  return {
    ordinal: definition.ordinal,
    elementCount: packageValue.mesh.elements.length,
    nodeCount: packageValue.mesh.nodes.length,
    radialDivisions: definition.radialDivisions,
    circumferentialDivisions: definition.circumferentialDivisions,
    meshHash: canonicalLafeaSha256(packageValue.mesh),
    pointEvidence,
    status: 'PASS',
  };
}

function topologySequence(point, levelsValue) {
  const observations = levelsValue.map((level) => {
    const row = level.pointEvidence.find((candidate) =>
      candidate.probeId === point.probeId);
    assert.ok(row);
    return { ordinal: level.ordinal, ...row };
  });
  const transitions = observations.slice(1).map((fine, index) => {
    const coarse = observations[index];
    const coarseLevel = levelsValue[index];
    const fineLevel = levelsValue[index + 1];
    const radialRatio = fineLevel.radialDivisions / coarseLevel.radialDivisions;
    const circumferentialRatio = fineLevel.circumferentialDivisions
      / coarseLevel.circumferentialDivisions;
    const radialParentCompatible = Number.isInteger(radialRatio)
      && Math.floor(fine.ring / radialRatio) === coarse.ring;
    const circumferentialParentCompatible = Number.isInteger(circumferentialRatio)
      && Math.floor(fine.sector / circumferentialRatio) === coarse.sector;
    const topologySignatureStable = fine.topologySignature === coarse.topologySignature;
    return {
      coarseOrdinal: coarse.ordinal,
      fineOrdinal: fine.ordinal,
      coarseElementId: coarse.elementId,
      fineElementId: fine.elementId,
      radialRefinementRatio: radialRatio,
      circumferentialRefinementRatio: circumferentialRatio,
      radialParentCompatible,
      circumferentialParentCompatible,
      triangleSideStable: fine.triangleSide === coarse.triangleSide,
      orientationStable: fine.orientation === coarse.orientation,
      topologySignatureStable,
      naturalCoordinateDelta: {
        xi: Math.abs(fine.xi - coarse.xi),
        eta: Math.abs(fine.eta - coarse.eta),
        lambda1: Math.abs(fine.lambda1 - coarse.lambda1),
      },
      parentElementLineage: `${fine.elementId}->${coarse.elementId}`,
      compatible: radialParentCompatible
        && circumferentialParentCompatible
        && topologySignatureStable
        && fine.orientation === coarse.orientation,
    };
  });
  const reasons = [];
  for (const transition of transitions) {
    if (!transition.radialParentCompatible) reasons.push('RADIAL_CELL_PHASE_MOVEMENT');
    if (!transition.circumferentialParentCompatible) {
      reasons.push('CIRCUMFERENTIAL_CELL_PHASE_MOVEMENT');
    }
    if (!transition.topologySignatureStable) reasons.push('TOPOLOGY_SIGNATURE_CHANGED');
    if (!transition.orientationStable) reasons.push('TRIANGLE_ORIENTATION_CHANGED');
  }
  return {
    probeId: point.probeId,
    observations,
    transitions,
    topologyCompatible: transitions.every((row) => row.compatible),
    reasons: [...new Set(reasons)].sort(),
  };
}
