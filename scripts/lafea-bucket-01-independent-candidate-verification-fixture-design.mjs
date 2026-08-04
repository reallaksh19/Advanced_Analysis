import assert from 'node:assert/strict';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

export function designFixture() {
  return {
    schema: 'lafea-bucket-01-probe-stable-polar-design/v3',
    designId: 'B01-PROBE-STABLE-POLAR-V3',
    benchmarkId: 'C2D-LUG-PINHOLE-01',
    sourceProbeSpecId: 'B01-PRODUCTION-LUG-FIXED-STRESS-01',
    geometry: { holeRadius: 20, outerRadius: 100, startAngleDegrees: 0, endAngleDegrees: 360 },
    refinementRatio: 2,
    levelCount: 4,
    radialAxis: {
      axisId: 'B01-PROBE-STABLE-RADIAL', axisKind: 'RADIAL_LENGTH',
      anchors: [27, 33, 47, 73, 87].map((value) => ({ anchorId: `R${value}`, value })),
      protectedBreakpoints: [60], targetPhase: 0.35,
      backgroundBaseDivisions: 6, windowClearanceFraction: 0.3,
    },
    circumferentialAxis: {
      axisId: 'B01-PROBE-STABLE-CIRCUMFERENTIAL', axisKind: 'POLAR_ANGLE_DEGREES',
      anchors: [17, 67, 83].map((value) => ({ anchorId: `THETA_${value}`, value })),
      protectedBreakpoints: [90, 180, 270], targetPhase: 0.65,
      backgroundBaseDivisions: 16, windowClearanceFraction: 0.3,
    },
    productionMappingPolicy: {
      loadFeatureRole: 'RADIAL_QUARTER_0',
      restraintFeatureRole: 'RADIAL_QUARTER_2',
      radialWindowStart: 20,
      radialWindowEnd: 60,
      windowEndpointsRequiredAtEveryLevel: true,
      edgeSelectionAuthority: 'EXACT_PHYSICAL_COORDINATE_WINDOW_NOT_INDEX_SCALING',
    },
    midsideGeometryPolicy: {
      holeBoundaryCircumferentialEdges: 'ANALYTIC_CIRCULAR_ARC',
      outerBoundaryCircumferentialEdges: 'ANALYTIC_CIRCULAR_ARC',
      internalCircumferentialEdges: 'STRAIGHT_CHORD',
      radialEdges: 'STRAIGHT_CHORD', diagonalEdges: 'STRAIGHT_CHORD',
      physicalBoundaryGeometryPreserved: true,
      internalCircularConstraintClaimed: false,
    },
    topologyPolicy: {
      elementFamily: 'ANNULAR_T6_TWO_TRIANGLE_CELL',
      triangleOrientation: 'COUNTER_CLOCKWISE_INVARIANT',
      radialAnchorPhase: 0.35, circumferentialAnchorPhase: 0.65,
      minimumParametricDiagonalSeparation: 0.3,
      anchorCellWidthContraction: 'EXACT_FACTOR_TWO_PER_LEVEL',
      transitionCellPolicy: 'DETERMINISTIC_BACKGROUND_GAP_PARTITION',
      protectedFeatureLinesDegrees: [0, 90, 180, 270],
      globalCoordinateNestingRequired: false,
      anchorCellSelfSimilarityRequired: true,
    },
    authority: {
      frozenProbeCoordinatesChanged: false,
      stressTolerancesChanged: false,
      loadsChanged: false,
      solverCriteriaChanged: false,
      codeBasisBoundaryChanged: false,
      productionMeshAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
}

export function probeSpecFixture() {
  const point = (radius, angleDegrees) => ({
    radius, angleDegrees,
    x: radius * Math.cos(angleDegrees * Math.PI / 180),
    y: radius * Math.sin(angleDegrees * Math.PI / 180),
  });
  return {
    schema: 'lafea-bucket-01-production-lug-probe-spec/v2',
    specId: 'B01-PRODUCTION-LUG-FIXED-STRESS-01',
    benchmarkId: 'C2D-LUG-PINHOLE-01',
    geometry: { center: { x: 0, y: 0 }, holeRadius: 20, outerRadius: 100 },
    probes: [
      { probeId: 'LUG_NEAR_HOLE_PMAX', ...point(27, 83) },
      { probeId: 'LUG_LOAD_SIDE_VM', ...point(33, 17) },
    ],
    paths: [{
      pathId: 'LUG_RADIAL_PATH_THETA_67', angleDegrees: 67,
      stations: [27, 33, 47, 73, 87].map((radius) => ({
        stationId: `R${radius}`,
        radius,
        x: radius * Math.cos(67 * Math.PI / 180),
        y: radius * Math.sin(67 * Math.PI / 180),
      })),
    }],
    tolerances: { mappingResidualMax: 1e-8, naturalCoordinateMarginMin: 0.0001 },
  };
}

export function productionSpecFixture() {
  return {
    schema: 'lafea-bucket-01-production-response-spec/v3',
    units: { length: 'mm' },
    geometry: { center: { x: 0, y: 0 }, holeRadius: 20, outerRadius: 100 },
    load: {
      featureRole: 'RADIAL_QUARTER_0', baseStartEdge: 0, baseEdgeCount: 1,
      selectedSegmentRadiusStart: 20, selectedSegmentRadiusEnd: 60,
    },
    restraint: { featureRole: 'RADIAL_QUARTER_2', baseStartEdge: 0, baseEdgeCount: 1 },
  };
}

export function axisPlan(axis, domainStart, domainEnd, designValue) {
  const input = { ...axis, domainStart, domainEnd };
  const windows = axis.anchors.map((anchor, index) => {
    const previous = index === 0 ? domainStart : axis.anchors[index - 1].value;
    const next = index === axis.anchors.length - 1 ? domainEnd : axis.anchors[index + 1].value;
    const width = Math.min(
      axis.windowClearanceFraction * (anchor.value - previous) / axis.targetPhase,
      axis.windowClearanceFraction * (next - anchor.value) / (1 - axis.targetPhase),
    );
    return {
      anchorId: anchor.anchorId,
      anchorValue: anchor.value,
      baseWidth: width,
    };
  });
  const levels = [];
  for (let ordinal = 1; ordinal <= designValue.levelCount; ordinal += 1) {
    const scale = designValue.refinementRatio ** (ordinal - 1);
    const target = (domainEnd - domainStart) / (axis.backgroundBaseDivisions * scale);
    const coordinates = [domainStart];
    const anchorCells = [];
    let cursor = domainStart;
    for (const window of windows) {
      const width = window.baseWidth / scale;
      const left = window.anchorValue - axis.targetPhase * width;
      const right = window.anchorValue + (1 - axis.targetPhase) * width;
      appendGap(coordinates, cursor, left, target, axis.protectedBreakpoints);
      const cellIndex = coordinates.length - 1;
      appendCoordinate(coordinates, right);
      anchorCells.push({
        anchorId: window.anchorId,
        anchorValue: window.anchorValue,
        cellIndex,
        left,
        right,
        width,
        phase: axis.targetPhase,
        distanceToLeft: window.anchorValue - left,
        distanceToRight: right - window.anchorValue,
        cellId: `${axis.axisId}:${window.anchorId}:L${ordinal}`,
        parentCellId: ordinal === 1 ? null : `${axis.axisId}:${window.anchorId}:L${ordinal - 1}`,
      });
      cursor = right;
    }
    appendGap(coordinates, cursor, domainEnd, target, axis.protectedBreakpoints);
    const coordinateHash = canonicalLafeaSha256({
      schema: 'lafea-bucket-01-probe-stable-axis-coordinates/v1',
      axisId: axis.axisId,
      ordinal,
      coordinates,
    });
    levels.push({
      ordinal,
      coordinates,
      coordinateHash,
      protectedBreakpoints: axis.protectedBreakpoints,
      anchorCells,
    });
  }
  return { input, levels };
}

export function appendGap(coordinates, start, end, target, breakpoints) {
  const contained = breakpoints.filter((row) => row > start + 1e-12 && row < end - 1e-12);
  let cursor = start;
  for (const endpoint of [...contained, end]) {
    const gap = endpoint - cursor;
    if (gap > 1e-12) {
      const count = Math.max(1, Math.ceil(gap / target));
      for (let index = 1; index <= count; index += 1) {
        appendCoordinate(coordinates, index === count ? endpoint : cursor + gap * index / count);
      }
    }
    cursor = endpoint;
  }
}
export function appendCoordinate(coordinates, value) {
  const cleanValue = Math.abs(value) < 1e-15 ? 0 : value;
  assert.ok(cleanValue > coordinates.at(-1) + 1e-12);
  coordinates.push(cleanValue);
}
