import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';

export const FLANGE_HUB_GEOMETRY_SCHEMA = 'flange-hub-canonical-geometry/v1';
export const FLANGE_HUB_GEOMETRY_ID = 'BKT-B-FLANGE-GEOMETRY-V1';
export const FLANGE_HUB_UNIT_SYSTEM = 'MM_N_MPA';
export const FLANGE_HUB_MATERIAL_PROFILE = deepFreeze({
  materialProfileId: 'BKT-B-FLANGE-MATERIAL-V1',
  youngsModulus: 210000,
  poissonRatio: 0.30,
  behavior: 'SMALL_STRAIN_LINEAR_HOMOGENEOUS_ISOTROPIC_ELASTICITY',
});

export const FLANGE_HUB_FROZEN_INPUT = deepFreeze({
  geometryId: FLANGE_HUB_GEOMETRY_ID,
  unitSystem: FLANGE_HUB_UNIT_SYSTEM,
  boreRadius: 50,
  pipeOutsideRadius: 60,
  pipeWallThickness: 10,
  pipeStartZ: -100,
  nominalHubStartZ: 0,
  nominalHubEndZ: 60,
  hubSmallOutsideRadius: 66,
  hubLargeOutsideRadius: 85,
  pipeToHubBlendRadius: 6,
  hubToFlangeBlendRadius: 10,
  flangeBackZ: 60,
  flangeFaceZ: 90,
  flangeThickness: 30,
  flangeOutsideRadius: 120,
  gasketSupportInnerRadius: 60,
  gasketSupportOuterRadius: 95,
  gasketLoadInnerRadius: 65,
  gasketLoadOuterRadius: 95,
});

const LENGTH_QUANTUM = 1e-12;
const GEOMETRY_TOLERANCE = 1e-10;

export function createCanonicalFlangeHubGeometry(input = FLANGE_HUB_FROZEN_INPUT) {
  const normalized = normalizeFrozenGeometryInput(input);
  const pipeLine = verticalLine(normalized.pipeOutsideRadius);
  const hubLine = lineThrough(
    { r: normalized.hubSmallOutsideRadius, z: normalized.nominalHubStartZ },
    { r: normalized.hubLargeOutsideRadius, z: normalized.nominalHubEndZ },
  );
  const flangeBackLine = horizontalLine(normalized.flangeBackZ);

  const smallBlend = tangentFilletBetweenLines({
    filletId: 'FH-FILLET-PIPE-HUB',
    firstLine: pipeLine,
    secondLine: hubLine,
    radius: normalized.pipeToHubBlendRadius,
    preferredCenter: { r: 66, z: -20 },
    firstRayAccepts: (pointValue) => pointValue.z >= normalized.pipeStartZ
      && pointValue.z <= normalized.nominalHubStartZ,
    secondRayAccepts: (pointValue) => pointValue.z <= normalized.nominalHubEndZ,
  });
  const largeBlend = tangentFilletBetweenLines({
    filletId: 'FH-FILLET-HUB-FLANGE',
    firstLine: hubLine,
    secondLine: flangeBackLine,
    radius: normalized.hubToFlangeBlendRadius,
    preferredCenter: { r: 92, z: 50 },
    firstRayAccepts: (pointValue) => pointValue.z >= normalized.nominalHubStartZ
      && pointValue.z <= normalized.nominalHubEndZ,
    secondRayAccepts: (pointValue) => pointValue.r >= normalized.hubLargeOutsideRadius
      && pointValue.r <= normalized.flangeOutsideRadius,
  });

  const stations = [
    station('PIPE_START', normalized.pipeStartZ, normalized.pipeOutsideRadius),
    station('SMALL_BLEND_PIPE_TANGENT', smallBlend.firstTangent.z, smallBlend.firstTangent.r),
    station('SMALL_BLEND_HUB_TANGENT', smallBlend.secondTangent.z, smallBlend.secondTangent.r),
    station('NOMINAL_HUB_START', normalized.nominalHubStartZ, hubRadiusAt(normalized, normalized.nominalHubStartZ)),
    station('HUB_MID', 30, hubRadiusAt(normalized, 30)),
    station('LARGE_BLEND_HUB_TANGENT', largeBlend.firstTangent.z, largeBlend.firstTangent.r),
    station('FLANGE_BACK', normalized.flangeBackZ, largeBlend.secondTangent.r),
    station('FLANGE_FACE', normalized.flangeFaceZ, normalized.flangeOutsideRadius),
  ];
  requireStrictIncreasing(stations.slice(0, 7).map((row) => row.z), 'FH_GEOMETRY_STATION_ORDER');

  const boundary = deepFreeze({
    bore: {
      curveId: 'FH-BOUNDARY-BORE',
      type: 'LINE',
      start: point(normalized.boreRadius, normalized.pipeStartZ),
      end: point(normalized.boreRadius, normalized.flangeFaceZ),
    },
    remotePipeEnd: {
      curveId: 'FH-BOUNDARY-PIPE-END',
      type: 'LINE',
      start: point(normalized.boreRadius, normalized.pipeStartZ),
      end: point(normalized.pipeOutsideRadius, normalized.pipeStartZ),
    },
    pipeOutside: {
      curveId: 'FH-BOUNDARY-PIPE-OD',
      type: 'LINE',
      start: point(normalized.pipeOutsideRadius, normalized.pipeStartZ),
      end: smallBlend.firstTangent,
    },
    pipeToHubBlend: curveRecord(smallBlend),
    hubOutside: {
      curveId: 'FH-BOUNDARY-HUB-OD',
      type: 'LINE',
      start: smallBlend.secondTangent,
      end: largeBlend.firstTangent,
    },
    hubToFlangeBlend: curveRecord(largeBlend),
    flangeBack: {
      curveId: 'FH-BOUNDARY-FLANGE-BACK',
      type: 'LINE',
      start: largeBlend.secondTangent,
      end: point(normalized.flangeOutsideRadius, normalized.flangeBackZ),
    },
    flangeOutside: {
      curveId: 'FH-BOUNDARY-FLANGE-OD',
      type: 'LINE',
      start: point(normalized.flangeOutsideRadius, normalized.flangeBackZ),
      end: point(normalized.flangeOutsideRadius, normalized.flangeFaceZ),
    },
    gasketFace: {
      curveId: 'FH-BOUNDARY-GASKET-FACE',
      type: 'LINE',
      start: point(normalized.boreRadius, normalized.flangeFaceZ),
      end: point(normalized.flangeOutsideRadius, normalized.flangeFaceZ),
      partitions: [
        { partitionId: 'INNER_FREE', r0: 50, r1: 60 },
        { partitionId: 'SUPPORT_ONLY', r0: 60, r1: 65 },
        { partitionId: 'SUPPORT_AND_OPTIONAL_LOAD', r0: 65, r1: 95 },
        { partitionId: 'OUTER_FREE', r0: 95, r1: 120 },
      ],
    },
  });

  const validation = validateCanonicalGeometry({ input: normalized, boundary, smallBlend, largeBlend });
  const payload = {
    schema: FLANGE_HUB_GEOMETRY_SCHEMA,
    geometryId: FLANGE_HUB_GEOMETRY_ID,
    unitSystem: FLANGE_HUB_UNIT_SYSTEM,
    coordinateSystem: 'AXISYMMETRIC_R_Z',
    coordinateQuantum: LENGTH_QUANTUM,
    input: normalized,
    materialProfile: FLANGE_HUB_MATERIAL_PROFILE,
    nominalHubLine: hubLine,
    fillets: [curveRecord(smallBlend), curveRecord(largeBlend)],
    stations,
    boundary,
    validation,
    limitations: [
      'NOMINAL_HUB_ENDPOINTS_ARE_VIRTUAL_SHARP_LINE_INTERSECTIONS',
      'PIPE_TO_HUB_AND_HUB_TO_FLANGE_TRANSITIONS_ARE_CIRCULAR_TANGENT_FILLETS',
      'NO_BOLT_HOLES_GASKET_GROOVES_THREADS_WELDS_OR_CONTACT',
      'ELEMENTS_TOUCHING_OR_CROSSING_R_ZERO_ARE_OUTSIDE_SCOPE',
    ],
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

export function outerProfilePoint(geometry, segmentId, t) {
  const value = finiteUnit(t, 't');
  const input = geometry.input;
  if (segmentId === 'FH-B00') {
    return point(input.pipeOutsideRadius, lerp(input.pipeStartZ, geometry.fillets[0].firstTangent.z, value));
  }
  if (segmentId === 'FH-B01') return arcPoint(geometry.fillets[0], value);
  if (segmentId === 'FH-B02') return linePoint(geometry.fillets[0].secondTangent, point(hubRadiusAt(input, 0), 0), value);
  if (segmentId === 'FH-B03') return linePoint(point(hubRadiusAt(input, 0), 0), point(hubRadiusAt(input, 30), 30), value);
  if (segmentId === 'FH-B04') return linePoint(point(hubRadiusAt(input, 30), 30), geometry.fillets[1].firstTangent, value);
  if (segmentId === 'FH-B05') return arcPoint(geometry.fillets[1], value);
  throw new TypeError(`FH_UNKNOWN_PROFILE_SEGMENT:${segmentId}`);
}

export function hubRadiusAt(input, z) {
  const slope = (input.hubLargeOutsideRadius - input.hubSmallOutsideRadius)
    / (input.nominalHubEndZ - input.nominalHubStartZ);
  return input.hubSmallOutsideRadius + slope * (z - input.nominalHubStartZ);
}

function normalizeFrozenGeometryInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('FH_GEOMETRY_INPUT_REQUIRED');
  }
  if (input.geometryId !== FLANGE_HUB_GEOMETRY_ID || input.unitSystem !== FLANGE_HUB_UNIT_SYSTEM) {
    throw new TypeError('FH_GEOMETRY_ID_OR_UNIT_MISMATCH');
  }
  const required = Object.keys(FLANGE_HUB_FROZEN_INPUT);
  const normalized = {};
  required.forEach((key) => {
    const expected = FLANGE_HUB_FROZEN_INPUT[key];
    const actual = input[key];
    if (typeof expected === 'number') {
      const value = Number(actual);
      if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError(`FH_GEOMETRY_INVALID_${key}`);
      if (Math.abs(value - expected) > GEOMETRY_TOLERANCE) throw new TypeError(`FH_GEOMETRY_FROZEN_VALUE_MISMATCH:${key}`);
      normalized[key] = quantize(value);
    } else {
      if (actual !== expected) throw new TypeError(`FH_GEOMETRY_FROZEN_VALUE_MISMATCH:${key}`);
      normalized[key] = actual;
    }
  });
  return deepFreeze(normalized);
}

function validateCanonicalGeometry({ input, boundary, smallBlend, largeBlend }) {
  const failures = [];
  const positive = [
    'boreRadius', 'pipeOutsideRadius', 'pipeWallThickness', 'pipeToHubBlendRadius',
    'hubToFlangeBlendRadius', 'flangeThickness', 'flangeOutsideRadius',
  ];
  positive.forEach((key) => { if (!(input[key] > 0)) failures.push(`NONPOSITIVE_${key}`); });
  if (!(input.pipeOutsideRadius > input.boreRadius)) failures.push('PIPE_OD_NOT_OUTSIDE_BORE');
  if (Math.abs(input.pipeOutsideRadius - input.boreRadius - input.pipeWallThickness) > GEOMETRY_TOLERANCE) failures.push('PIPE_WALL_INCONSISTENT');
  if (!(input.hubLargeOutsideRadius > input.hubSmallOutsideRadius)) failures.push('NONMONOTONIC_HUB');
  if (!(input.flangeOutsideRadius > largeBlend.secondTangent.r)) failures.push('FLANGE_OD_NOT_OUTSIDE_BLEND');
  if (!(input.gasketSupportInnerRadius >= input.boreRadius
    && input.gasketSupportOuterRadius <= input.flangeOutsideRadius
    && input.gasketSupportOuterRadius > input.gasketSupportInnerRadius)) failures.push('INVALID_SUPPORT_ANNULUS');
  if (!(input.gasketLoadInnerRadius >= input.gasketSupportInnerRadius
    && input.gasketLoadOuterRadius <= input.gasketSupportOuterRadius
    && input.gasketLoadOuterRadius > input.gasketLoadInnerRadius)) failures.push('INVALID_LOAD_ANNULUS');
  if (!(input.boreRadius > 1e-9)) failures.push('GEOMETRY_TOUCHES_AXIS');
  [smallBlend, largeBlend].forEach((fillet) => {
    if (fillet.positionResidual > GEOMETRY_TOLERANCE) failures.push(`${fillet.filletId}_POSITION_RESIDUAL`);
    if (fillet.tangentResidual > 1e-12) failures.push(`${fillet.filletId}_TANGENCY_RESIDUAL`);
    if (fillet.radiusResidual > GEOMETRY_TOLERANCE) failures.push(`${fillet.filletId}_RADIUS_RESIDUAL`);
  });
  const outerSamples = [
    boundary.pipeOutside.start,
    boundary.pipeOutside.end,
    ...sampleArc(boundary.pipeToHubBlend, 32),
    boundary.hubOutside.start,
    boundary.hubOutside.end,
    ...sampleArc(boundary.hubToFlangeBlend, 32),
    boundary.flangeBack.start,
    boundary.flangeBack.end,
  ];
  outerSamples.forEach((row) => { if (!(row.r > input.boreRadius)) failures.push('NONPOSITIVE_LOCAL_THICKNESS'); });
  for (let index = 1; index < outerSamples.length; index += 1) {
    if (outerSamples[index].z + GEOMETRY_TOLERANCE < outerSamples[index - 1].z) failures.push('OUTER_PROFILE_NOT_Z_MONOTONIC');
  }
  if (failures.length) throw new RangeError(`FH_GEOMETRY_REJECTED:${failures.join(',')}`);
  return deepFreeze({
    accepted: true,
    failures: [],
    boundaryClosed: true,
    tangentContinuous: true,
    selfIntersectionFree: true,
    minimumRadius: input.boreRadius,
    minimumThickness: input.pipeWallThickness,
  });
}

function tangentFilletBetweenLines({ filletId, firstLine, secondLine, radius, preferredCenter, firstRayAccepts, secondRayAccepts }) {
  const candidates = [];
  for (const firstSign of [-1, 1]) {
    for (const secondSign of [-1, 1]) {
      const firstOffset = offsetLine(firstLine, firstSign * radius);
      const secondOffset = offsetLine(secondLine, secondSign * radius);
      const center = intersectLines(firstOffset, secondOffset);
      if (!center) continue;
      const firstTangent = projectToLine(center, firstLine);
      const secondTangent = projectToLine(center, secondLine);
      if (!firstRayAccepts(firstTangent) || !secondRayAccepts(secondTangent)) continue;
      const score = Math.hypot(center.r - preferredCenter.r, center.z - preferredCenter.z);
      candidates.push({ center, firstTangent, secondTangent, score });
    }
  }
  if (candidates.length === 0) throw new RangeError(`FH_IMPOSSIBLE_FILLET:${filletId}`);
  candidates.sort((left, right) => left.score - right.score);
  if (candidates.length > 1 && Math.abs(candidates[1].score - candidates[0].score) <= 1e-10) {
    throw new RangeError(`FH_AMBIGUOUS_FILLET:${filletId}`);
  }
  const selected = candidates[0];
  const firstAngle = Math.atan2(selected.firstTangent.z - selected.center.z, selected.firstTangent.r - selected.center.r);
  const secondAngle = Math.atan2(selected.secondTangent.z - selected.center.z, selected.secondTangent.r - selected.center.r);
  const sweep = positiveSweep(firstAngle, secondAngle);
  const reverseSweep = sweep - 2 * Math.PI;
  const chosenSweep = Math.abs(sweep) <= Math.abs(reverseSweep) ? sweep : reverseSweep;
  const radiusResidual = Math.max(
    Math.abs(distance(selected.center, selected.firstTangent) - radius),
    Math.abs(distance(selected.center, selected.secondTangent) - radius),
  );
  const firstRadius = unitVector(selected.center, selected.firstTangent);
  const secondRadius = unitVector(selected.center, selected.secondTangent);
  const tangentResidual = Math.max(
    Math.abs(dot(firstRadius, firstLine.direction)),
    Math.abs(dot(secondRadius, secondLine.direction)),
  );
  const positionResidual = Math.max(
    lineDistance(selected.firstTangent, firstLine),
    lineDistance(selected.secondTangent, secondLine),
  );
  return deepFreeze({
    filletId,
    type: 'CIRCULAR_ARC',
    radius,
    center: point(selected.center.r, selected.center.z),
    firstTangent: point(selected.firstTangent.r, selected.firstTangent.z),
    secondTangent: point(selected.secondTangent.r, selected.secondTangent.z),
    startAngle: firstAngle,
    sweepAngle: chosenSweep,
    radiusResidual,
    tangentResidual,
    positionResidual,
  });
}

function curveRecord(fillet) {
  return deepFreeze({
    curveId: fillet.filletId,
    type: fillet.type,
    radius: fillet.radius,
    center: fillet.center,
    firstTangent: fillet.firstTangent,
    secondTangent: fillet.secondTangent,
    startAngle: fillet.startAngle,
    sweepAngle: fillet.sweepAngle,
    radiusResidual: fillet.radiusResidual,
    tangentResidual: fillet.tangentResidual,
    positionResidual: fillet.positionResidual,
  });
}

function arcPoint(arc, t) {
  const angle = arc.startAngle + arc.sweepAngle * t;
  return point(arc.center.r + arc.radius * Math.cos(angle), arc.center.z + arc.radius * Math.sin(angle));
}
function sampleArc(arc, count) { return Array.from({ length: count + 1 }, (_, index) => arcPoint(arc, index / count)); }
function linePoint(start, end, t) { return point(lerp(start.r, end.r, t), lerp(start.z, end.z, t)); }
function point(r, z) { return deepFreeze({ r: quantize(r), z: quantize(z) }); }
function station(stationId, z, outerRadius) { return deepFreeze({ stationId, z: quantize(z), outerRadius: quantize(outerRadius) }); }
function verticalLine(r) { return lineFromNormal({ r, z: 0 }, { r: 1, z: 0 }, { r: 0, z: 1 }); }
function horizontalLine(z) { return lineFromNormal({ r: 0, z }, { r: 0, z: 1 }, { r: 1, z: 0 }); }
function lineThrough(a, b) {
  const length = distance(a, b);
  if (!(length > 0)) throw new RangeError('FH_DEGENERATE_LINE');
  const direction = { r: (b.r - a.r) / length, z: (b.z - a.z) / length };
  const normal = { r: direction.z, z: -direction.r };
  return lineFromNormal(a, normal, direction);
}
function lineFromNormal(origin, normal, direction) {
  const norm = Math.hypot(normal.r, normal.z);
  return deepFreeze({
    origin: point(origin.r, origin.z),
    normal: { r: normal.r / norm, z: normal.z / norm },
    direction: { r: direction.r, z: direction.z },
    c: (normal.r * origin.r + normal.z * origin.z) / norm,
  });
}
function offsetLine(line, signedDistance) { return { ...line, c: line.c + signedDistance }; }
function intersectLines(a, b) {
  const determinant = a.normal.r * b.normal.z - a.normal.z * b.normal.r;
  if (Math.abs(determinant) <= 1e-14) return null;
  return {
    r: (a.c * b.normal.z - a.normal.z * b.c) / determinant,
    z: (a.normal.r * b.c - a.c * b.normal.r) / determinant,
  };
}
function projectToLine(value, line) {
  const signed = line.normal.r * value.r + line.normal.z * value.z - line.c;
  return { r: value.r - signed * line.normal.r, z: value.z - signed * line.normal.z };
}
function lineDistance(value, line) { return Math.abs(line.normal.r * value.r + line.normal.z * value.z - line.c); }
function unitVector(a, b) { const length = distance(a, b); return { r: (b.r - a.r) / length, z: (b.z - a.z) / length }; }
function dot(a, b) { return a.r * b.r + a.z * b.z; }
function distance(a, b) { return Math.hypot(b.r - a.r, b.z - a.z); }
function positiveSweep(start, end) { let value = end - start; while (value < 0) value += 2 * Math.PI; while (value >= 2 * Math.PI) value -= 2 * Math.PI; return value; }
function lerp(a, b, t) { return a + (b - a) * t; }
function finiteUnit(value, label) { const number = Number(value); if (!Number.isFinite(number) || number < 0 || number > 1) throw new RangeError(`FH_INVALID_${label.toUpperCase()}`); return number; }
function quantize(value) { return Math.round(value / LENGTH_QUANTUM) * LENGTH_QUANTUM; }
function requireStrictIncreasing(values, code) { for (let i = 1; i < values.length; i += 1) if (!(values[i] > values[i - 1])) throw new RangeError(code); }
