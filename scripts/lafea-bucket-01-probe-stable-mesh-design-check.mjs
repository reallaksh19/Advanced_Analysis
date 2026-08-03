#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_BUCKET_01_PROBE_STABLE_AXIS_PLAN_INPUT_SCHEMA,
  buildLafeaBucket01ProbeStableAxisPlan,
  validateLafeaBucket01ProbeStableAxisPlanEvidence,
} from '../src/workspace/lafea-bucket-01-probe-stable-axis-plan.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_PATH = path.join(
  ROOT,
  'validation/bucket-01/13-probe-stable-polar-mesh-design.json',
);
const PROBE_SPEC_PATH = path.join(
  ROOT,
  'validation/bucket-01/08-production-lug-fixed-probe-spec.json',
);
const design = JSON.parse(fs.readFileSync(DESIGN_PATH, 'utf8'));
const probeSpec = JSON.parse(fs.readFileSync(PROBE_SPEC_PATH, 'utf8'));

assert.equal(
  design.schema,
  'lafea-bucket-01-probe-stable-polar-design/v2',
);
assert.equal(design.designId, 'B01-PROBE-STABLE-POLAR-V2');
assert.equal(design.benchmarkId, probeSpec.benchmarkId);
assert.equal(design.sourceProbeSpecId, probeSpec.specId);
assert.equal(design.authority.frozenProbeCoordinatesChanged, false);
assert.equal(design.authority.stressTolerancesChanged, false);
assert.equal(design.authority.loadsChanged, false);
assert.equal(design.authority.solverCriteriaChanged, false);
assert.equal(design.authority.codeBasisBoundaryChanged, false);
assert.equal(design.authority.productionMeshAuthority, false);
assert.equal(design.authority.qualificationAuthority, false);
assert.equal(design.authority.bucketQualified, false);
assert.deepEqual(
  design.circumferentialAxis.protectedBreakpoints,
  [90, 180, 270],
);
assert.deepEqual(
  design.topologyPolicy.protectedFeatureLinesDegrees,
  [0, 90, 180, 270],
);
assert.equal(
  design.midsideGeometryPolicy.holeBoundaryCircumferentialEdges,
  'ANALYTIC_CIRCULAR_ARC',
);
assert.equal(
  design.midsideGeometryPolicy.outerBoundaryCircumferentialEdges,
  'ANALYTIC_CIRCULAR_ARC',
);
assert.equal(
  design.midsideGeometryPolicy.internalCircumferentialEdges,
  'STRAIGHT_CHORD',
);
assert.equal(design.midsideGeometryPolicy.radialEdges, 'STRAIGHT_CHORD');
assert.equal(design.midsideGeometryPolicy.diagonalEdges, 'STRAIGHT_CHORD');
assert.equal(
  design.midsideGeometryPolicy.physicalBoundaryGeometryPreserved,
  true,
);
assert.equal(
  design.midsideGeometryPolicy.internalCircularConstraintClaimed,
  false,
);
assert.equal(design.changeControl.previousDesignId, 'B01-PROBE-STABLE-POLAR-V1');
assert.equal(
  design.changeControl.trigger,
  'LEVEL_1_NON_POSITIVE_INTERNAL_CURVED_EDGE_JACOBIAN',
);
assert.equal(design.changeControl.controllingElement, 'E-R10-S18-B');
for (const key of [
  'axisCoordinatesChanged',
  'anchorWindowsChanged',
  'anchorPhasesChanged',
  'candidateElementCountsChanged',
  'frozenPhysicalCoordinatesChanged',
  'governedToleranceChanged',
  'productionAuthorityChanged',
]) {
  assert.equal(design.changeControl[key], false);
}

const frozenRadii = uniqueSorted([
  ...probeSpec.probes.map((row) => row.radius),
  ...probeSpec.paths.flatMap((row) =>
    row.stations.map((station) => station.radius)),
]);
const frozenAngles = uniqueSorted([
  ...probeSpec.probes.map((row) => row.angleDegrees),
  ...probeSpec.paths.map((row) => row.angleDegrees),
]);
assert.deepEqual(
  design.radialAxis.anchors.map((row) => row.value),
  frozenRadii,
);
assert.deepEqual(
  design.circumferentialAxis.anchors.map((row) => row.value),
  frozenAngles,
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

assert.equal(
  validateLafeaBucket01ProbeStableAxisPlanEvidence(radialPlan).ok,
  true,
);
assert.equal(
  validateLafeaBucket01ProbeStableAxisPlanEvidence(circumferentialPlan).ok,
  true,
);
assert.equal(radialPlan.status, 'DESIGN_READY_NOT_PRODUCTION');
assert.equal(circumferentialPlan.status, 'DESIGN_READY_NOT_PRODUCTION');
assert.equal(radialPlan.authority.anchorCellsSelfSimilarAcrossLevels, true);
assert.equal(circumferentialPlan.authority.anchorCellsSelfSimilarAcrossLevels, true);
assert.equal(radialPlan.authority.protectedFeatureBreakpointsPreserved, true);
assert.equal(
  circumferentialPlan.authority.protectedFeatureBreakpointsPreserved,
  true,
);
assert.equal(radialPlan.authority.transitionRemeshingRequired, true);
assert.equal(circumferentialPlan.authority.transitionRemeshingRequired, true);
assert.equal(radialPlan.authority.productionMeshAuthority, false);
assert.equal(circumferentialPlan.authority.productionMeshAuthority, false);

verifyAxisPlan(radialPlan, design.radialAxis.targetPhase);
verifyAxisPlan(circumferentialPlan, design.circumferentialAxis.targetPhase);

const phaseSeparation = Math.abs(
  design.radialAxis.targetPhase
    - design.circumferentialAxis.targetPhase,
);
assert.ok(
  phaseSeparation
    >= design.topologyPolicy.minimumParametricDiagonalSeparation,
);
assert.ok(Math.abs(
  phaseSeparation
    - design.topologyPolicy.minimumParametricDiagonalSeparation,
) <= 1e-12);

const candidateLevels = radialPlan.levels.map((radialLevel, index) => {
  const circumferentialLevel = circumferentialPlan.levels[index];
  return {
    ordinal: radialLevel.ordinal,
    radialCellCount: radialLevel.cellCount,
    circumferentialCellCount: circumferentialLevel.cellCount,
    candidateT6ElementCount:
      2 * radialLevel.cellCount * circumferentialLevel.cellCount,
    radialCoordinateHash: radialLevel.coordinateHash,
    circumferentialCoordinateHash: circumferentialLevel.coordinateHash,
  };
});
assert.equal(candidateLevels.length, design.levelCount);
assert.equal(candidateLevels.every((row, index) =>
  index === 0
    || row.candidateT6ElementCount
      > candidateLevels[index - 1].candidateT6ElementCount), true);
assert.deepEqual(
  candidateLevels.map((row) => ({
    ordinal: row.ordinal,
    radialCellCount: row.radialCellCount,
    circumferentialCellCount: row.circumferentialCellCount,
    candidateT6ElementCount: row.candidateT6ElementCount,
  })),
  [
    { ordinal: 1, radialCellCount: 12, circumferentialCellCount: 20, candidateT6ElementCount: 480 },
    { ordinal: 2, radialCellCount: 17, circumferentialCellCount: 35, candidateT6ElementCount: 1190 },
    { ordinal: 3, radialCellCount: 30, circumferentialCellCount: 68, candidateT6ElementCount: 4080 },
    { ordinal: 4, radialCellCount: 53, circumferentialCellCount: 132, candidateT6ElementCount: 13992 },
  ],
);

const tampered = JSON.parse(JSON.stringify(radialPlan));
tampered.levels[0].anchorCells[0].phase = 0.5;
assert.equal(
  validateLafeaBucket01ProbeStableAxisPlanEvidence(tampered).ok,
  false,
);

console.log(JSON.stringify({
  schema: 'lafea-bucket-01-probe-stable-mesh-design-check/v2',
  status: 'PASS',
  designId: design.designId,
  radialPlanHash: radialPlan.semanticHash,
  circumferentialPlanHash: circumferentialPlan.semanticHash,
  phaseSeparation,
  candidateLevels,
  midsideGeometryPolicy: design.midsideGeometryPolicy,
  authority: {
    designContractVerified: true,
    frozenCoordinatesPreserved: true,
    protectedFeatureLinesPreserved: true,
    stableInteriorAxisPhasesVerified: true,
    exactAnchorCellWidthContractionVerified: true,
    transitionCoordinatesDeterministic: true,
    physicalCircularBoundariesRemainAnalytic: true,
    internalCircumferentialEdgesRemainUnconstrained: true,
    productionMeshAuthority: false,
    qualificationAuthority: false,
    bucketQualified: false,
  },
}));

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

function verifyAxisPlan(plan, targetPhase) {
  for (const level of plan.levels) {
    assert.equal(level.status, 'DESIGN_READY');
    assert.ok(level.cellCount > level.anchorCellCount);
    assert.equal(level.anchorCellCount, plan.sourceInput.anchors.length);
    assert.equal(
      level.protectedBreakpointCount,
      plan.sourceInput.protectedBreakpoints.length,
    );
    assert.deepEqual(
      level.protectedBreakpoints,
      plan.sourceInput.protectedBreakpoints,
    );
    for (const breakpoint of plan.sourceInput.protectedBreakpoints) {
      assert.equal(level.coordinates.includes(breakpoint), true);
    }
    assert.ok(
      level.maximumBackgroundCellWidth
        <= level.targetBackgroundCellWidth * (1 + 1e-12),
    );
    assert.ok(level.anchorPhaseMaximumError <= 1e-12);
    assert.equal(level.coordinates[0], plan.sourceInput.domainStart);
    assert.equal(level.coordinates.at(-1), plan.sourceInput.domainEnd);
    assert.equal(level.coordinates.every((coordinate, index) =>
      index === 0 || coordinate > level.coordinates[index - 1]), true);
    for (const anchorCell of level.anchorCells) {
      assert.ok(anchorCell.left < anchorCell.anchorValue);
      assert.ok(anchorCell.anchorValue < anchorCell.right);
      assert.ok(Math.abs(anchorCell.phase - targetPhase) <= 1e-12);
      assert.notEqual(
        level.coordinates.includes(anchorCell.anchorValue),
        true,
      );
      assert.equal(level.coordinates[anchorCell.cellIndex], anchorCell.left);
      assert.equal(level.coordinates[anchorCell.cellIndex + 1], anchorCell.right);
    }
  }
  for (let index = 1; index < plan.levels.length; index += 1) {
    const coarse = plan.levels[index - 1];
    const fine = plan.levels[index];
    for (let anchorIndex = 0;
      anchorIndex < coarse.anchorCells.length;
      anchorIndex += 1) {
      const coarseAnchor = coarse.anchorCells[anchorIndex];
      const fineAnchor = fine.anchorCells[anchorIndex];
      assert.equal(fineAnchor.anchorId, coarseAnchor.anchorId);
      assert.equal(fineAnchor.anchorValue, coarseAnchor.anchorValue);
      assert.ok(Math.abs(
        coarseAnchor.width / fineAnchor.width
          - plan.sourceInput.refinementRatio,
      ) <= 1e-12);
      assert.equal(fineAnchor.parentCellId, coarseAnchor.cellId);
    }
  }
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}
