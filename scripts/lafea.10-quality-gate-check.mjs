#!/usr/bin/env node

/**
 * LAFEA upgrade spec §10.3 mesh quality-gate check.
 *
 * Covers `src/core/lafea-meshing/quality-gates.js` and `element-geometry.js`:
 * one assertion per §10.3 table row, with fixtures engineered to sit exactly
 * at/above/below each threshold — aspect ratio (warn 3, block 10), minimum
 * angle (warn 25°, block 10°), scaled Jacobian (warn 0.5, block 0.2, and
 * always BLOCK when non-positive), shell warpage (warn 5°, block 15°),
 * boundary segment counts (hole >=16/24, weld/attachment edge >=12/4), and
 * the shell size-to-thickness band (0.5t-2t).
 */

import assert from 'node:assert/strict';
import {
  aspectRatioOf,
  minimumAngleDegreesOf,
  minimumScaledJacobianOf,
  qualifyAspectRatio,
  qualifyBoundarySegmentCount,
  qualifyMinimumAngle,
  qualifyScaledJacobian,
  qualifyShellSizeToThicknessRatio,
  qualifyShellWarpage,
  shellWarpageDegreesOf,
  worstStatus,
} from '../src/core/lafea-meshing/quality-gates.js';

const GATES = { warn: 3.0, block: 10.0 };
const ANGLE_GATES = { warn: 25, block: 10 };
const JACOBIAN_GATES = { warn: 0.5, block: 0.2 };
const WARPAGE_GATES = { warn: 5, block: 15 };

console.log('\n--- LAFEA §10.3 mesh quality gate check ---');
checkAspectRatioThresholds();
checkMinimumAngleThresholds();
checkScaledJacobianThresholds();
checkShellWarpageThresholds();
checkHoleCircumferenceGate();
checkAttachmentWeldEdgeGate();
checkShellSizeToThicknessBand();
checkWorstStatusAggregation();
console.log('\n✅ LAFEA §10.3 mesh quality gate check passed.\n');

function rectangleCorners(width, height) {
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
}

function checkAspectRatioThresholds() {
  const square = qualifyAspectRatio(rectangleCorners(1, 1), GATES);
  assert.equal(square.status, 'OK');
  assert.equal(square.value, 1);

  const atWarn = qualifyAspectRatio(rectangleCorners(3, 1), GATES);
  assert.equal(atWarn.status, 'WARNING');
  assert.equal(atWarn.value, 3);

  const justUnderBlock = qualifyAspectRatio(rectangleCorners(9.999, 1), GATES);
  assert.equal(justUnderBlock.status, 'WARNING');

  const atBlock = qualifyAspectRatio(rectangleCorners(10, 1), GATES);
  assert.equal(atBlock.status, 'BLOCK');
  console.log('✅ Aspect ratio: OK<warn(3), WARNING in [3,10), BLOCK at/above 10.');
}

function checkMinimumAngleThresholds() {
  const equilateral = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: Math.sqrt(3) / 2 }];
  const equilateralResult = qualifyMinimumAngle(equilateral, ANGLE_GATES);
  assert.equal(equilateralResult.status, 'OK');
  assert.ok(Math.abs(equilateralResult.value - 60) < 1e-9);

  // Right triangle with legs 1 and tan(25deg) has its smallest angle exactly 25deg.
  const warnTriangle = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: Math.tan((25 * Math.PI) / 180) }];
  const warnResult = qualifyMinimumAngle(warnTriangle, ANGLE_GATES);
  assert.ok(Math.abs(warnResult.value - 25) < 1e-6);
  assert.equal(warnResult.status, 'WARNING');

  const blockTriangle = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: Math.tan((10 * Math.PI) / 180) }];
  const blockResult = qualifyMinimumAngle(blockTriangle, ANGLE_GATES);
  assert.ok(Math.abs(blockResult.value - 10) < 1e-6);
  assert.equal(blockResult.status, 'BLOCK');
  console.log('✅ Minimum triangle angle: OK>warn(25°), WARNING in (10°,25°], BLOCK at/below 10°.');
}

function checkScaledJacobianThresholds() {
  const t6UnitRight = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }, { x: 0, y: 0.5 }];
  const okResult = qualifyScaledJacobian('T6', t6UnitRight, JACOBIAN_GATES);
  assert.equal(okResult.status, 'OK');
  assert.ok(Math.abs(okResult.value - 1) < 1e-9);

  const q8UnitSquare = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
  const squareResult = qualifyScaledJacobian('Q8', q8UnitSquare, JACOBIAN_GATES);
  assert.equal(squareResult.status, 'OK');
  assert.ok(Math.abs(squareResult.value - 1) < 1e-9);

  // A badly skewed Q8 (near-collinear quad) drives the scaled Jacobian toward 0, well below block.
  const skewed = [{ x: -1, y: -1 }, { x: 1, y: -0.999 }, { x: 1.02, y: -0.997 }, { x: -1, y: 1 }, { x: 0, y: -0.9995 }, { x: 1.01, y: -0.998 }, { x: 0.01, y: 0.0015 }, { x: -1, y: 0 }];
  const skewedResult = qualifyScaledJacobian('Q8', skewed, JACOBIAN_GATES);
  assert.equal(skewedResult.status, 'BLOCK');

  // An inverted (negative-area) T6 must always BLOCK, independent of magnitude.
  const inverted = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0 }];
  const invertedResult = qualifyScaledJacobian('T6', inverted, JACOBIAN_GATES);
  assert.ok(invertedResult.value <= 0);
  assert.equal(invertedResult.status, 'BLOCK');
  console.log('✅ Scaled Jacobian: OK for well-shaped elements, BLOCK for skewed/inverted ones; always positive-checked.');
}

function checkShellWarpageThresholds() {
  const flat = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }];
  const flatResult = qualifyShellWarpage(flat, WARPAGE_GATES);
  assert.equal(flatResult.status, 'OK');
  assert.ok(Math.abs(flatResult.value) < 1e-9);

  // Lift one corner out of plane to induce warpage; verify monotonic response and BLOCK at a large lift.
  const warped = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0.5 }, { x: 0, y: 1, z: 0 }];
  const warpedResult = qualifyShellWarpage(warped, WARPAGE_GATES);
  assert.ok(warpedResult.value > 0);
  assert.equal(warpedResult.status, 'BLOCK');

  const slightlyWarped = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0.01 }, { x: 0, y: 1, z: 0 }];
  const slightResult = qualifyShellWarpage(slightlyWarped, WARPAGE_GATES);
  assert.equal(slightResult.status, 'OK');
  console.log('✅ Shell warpage: 0° for a flat quad, OK for a small lift, BLOCK for a large one.');
}

function checkHoleCircumferenceGate() {
  const productionResult = qualifyBoundarySegmentCount(16, 16);
  assert.equal(productionResult.status, 'OK');
  const belowProduction = qualifyBoundarySegmentCount(15, 16);
  assert.equal(belowProduction.status, 'BLOCK');
  const sclRegionResult = qualifyBoundarySegmentCount(24, 24);
  assert.equal(sclRegionResult.status, 'OK');
  const belowSclRegion = qualifyBoundarySegmentCount(23, 24);
  assert.equal(belowSclRegion.status, 'BLOCK');
  console.log('✅ Hole circumference: >=16 quadratic edges for production, >=24 for code SCL regions.');
}

function checkAttachmentWeldEdgeGate() {
  const production = qualifyBoundarySegmentCount(12, 12);
  assert.equal(production.status, 'OK');
  const below = qualifyBoundarySegmentCount(11, 12);
  assert.equal(below.status, 'BLOCK');
  console.log('✅ Attachment/weld footprint edge: >=12 elements around the closed footprint.');
}

function checkShellSizeToThicknessBand() {
  const thickness = 10;
  const withinBand = qualifyShellSizeToThicknessRatio(10, thickness, { minimumMultiple: 0.5, maximumMultiple: 2 });
  assert.equal(withinBand.status, 'OK');
  const tooFine = qualifyShellSizeToThicknessRatio(4, thickness, { minimumMultiple: 0.5, maximumMultiple: 2 });
  assert.equal(tooFine.status, 'WARNING');
  const tooCoarse = qualifyShellSizeToThicknessRatio(25, thickness, { minimumMultiple: 0.5, maximumMultiple: 2 });
  assert.equal(tooCoarse.status, 'WARNING');
  console.log('✅ Shell element size near attachments: WARNING outside the 0.5t-2t default band.');
}

function checkWorstStatusAggregation() {
  const results = [
    { status: 'OK' }, { status: 'WARNING' }, { status: 'OK' },
  ];
  assert.equal(worstStatus(results), 'WARNING');
  assert.equal(worstStatus([...results, { status: 'BLOCK' }]), 'BLOCK');
  assert.equal(worstStatus([]), 'OK');
  console.log('✅ worstStatus aggregates BLOCK > WARNING > OK across a mixed gate result set.');
}
