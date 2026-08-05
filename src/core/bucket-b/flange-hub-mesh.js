import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { evaluateQ8Quality } from './q8-quality.js';
import {
  createCanonicalFlangeHubGeometry,
  FLANGE_HUB_MATERIAL_PROFILE,
  hubRadiusAt,
} from './flange-hub-geometry.js';

export const FLANGE_HUB_MESH_SCHEMA = 'flange-hub-mesh-evidence/v1';
export const FLANGE_HUB_MESH_FAMILY_ID = 'BKT-B-FLANGE-Q8-MESH-FAMILY-V1';
export const FLANGE_HUB_MESH_LEVELS = deepFreeze([
  { levelId: 'M0', refinement: 1 },
  { levelId: 'M1', refinement: 2 },
  { levelId: 'M2', refinement: 4 },
  { levelId: 'M3', refinement: 8 },
]);

const Q = 1e-12;
const TRANSITION_START_Z = 35;
const INTERNAL_INTERFACE_Z = 77;
const INTERNAL_INTERFACE_OUTER_R = 99;
const UPPER_FRACTIONS = Object.freeze([
  0,
  1 / 14,
  1 / 7,
  3 / 14,
  0.35,
  0.50,
  9 / 14,
  0.80,
  1,
]);
const COMPUTATIONAL_V = Object.freeze(Array.from({ length: 9 }, (_, index) => index / 8));
const BLOCKS = Object.freeze([
  { id: 'FH-B00', kind: 'STRIP', segment: 'PIPE', baseUCount: 16 },
  { id: 'FH-B01', kind: 'STRIP', segment: 'SMALL_ARC', baseUCount: 4 },
  { id: 'FH-B02', kind: 'STRIP', segment: 'HUB_SMALL', baseUCount: 4 },
  { id: 'FH-B03', kind: 'STRIP', segment: 'HUB_MID', baseUCount: 16 },
  { id: 'FH-B04', kind: 'GRADING_TRANSITION', baseUCount: 4 },
  { id: 'FH-B05', kind: 'HUB_FILLET_TRANSITION' },
  { id: 'FH-B06', kind: 'FLANGE' },
]);

export function createFlangeHubMesh(levelId, geometry = createCanonicalFlangeHubGeometry()) {
  const level = FLANGE_HUB_MESH_LEVELS.find((row) => row.levelId === levelId);
  if (!level) throw new TypeError(`FH_UNKNOWN_MESH_LEVEL:${levelId}`);
  if (geometry?.schema !== 'flange-hub-canonical-geometry/v1') {
    throw new TypeError('FH_CANONICAL_GEOMETRY_REQUIRED');
  }

  const nodeCandidates = new Map();
  const provisionalElements = [];
  const provisionalEdges = [];
  const blockRows = [];

  BLOCKS.forEach((block) => {
    const baseU = baseUBreakpoints(block, geometry);
    const us = refineBreakpoints(baseU, level.refinement);
    const vs = refineBreakpoints(COMPUTATIONAL_V, level.refinement);
    const map = blockMap(block, geometry);
    const blockElementIds = [];

    for (let i = 0; i < us.length - 1; i += 1) {
      for (let j = 0; j < vs.length - 1; j += 1) {
        const u0 = us[i];
        const u1 = us[i + 1];
        const v0 = vs[j];
        const v1 = vs[j + 1];
        const um = (u0 + u1) / 2;
        const vm = (v0 + v1) / 2;
        const uv = [
          [u0, v0],
          [u0, v1],
          [u1, v1],
          [u1, v0],
          [u0, vm],
          [um, v1],
          [u1, vm],
          [um, v0],
        ];
        const keys = uv.map(([u, v]) => registerNode(
          nodeCandidates,
          map(u, v),
          `${block.id}:${formatNumber(u)}:${formatNumber(v)}`,
        ));
        const elementId = `${levelId}-E-${block.id}-I${pad(i)}-J${pad(j)}`;
        const hotspot = isHotspotElement({
          block,
          i,
          j,
          lastU: us.length - 2,
          u0,
          u1,
          v0,
          v1,
          map,
        });
        provisionalElements.push({
          elementId,
          blockId: block.id,
          keys,
          hotspot,
          map,
          u0,
          u1,
          v0,
          v1,
          i,
          j,
        });
        blockElementIds.push(elementId);
        registerBoundaryEdges(provisionalEdges, {
          block,
          levelId,
          keys,
          i,
          j,
          lastU: us.length - 2,
          lastV: vs.length - 2,
          map,
          um,
        });
      }
    }

    blockRows.push({
      blockId: block.id,
      kind: block.kind,
      longitudinalElementCount: us.length - 1,
      transverseElementCount: vs.length - 1,
      elementIds: blockElementIds,
    });
  });

  const sortedNodes = [...nodeCandidates.entries()]
    .map(([key, row]) => ({ key, ...row }))
    .sort((left, right) => left.z - right.z
      || left.r - right.r
      || left.key.localeCompare(right.key));
  const nodeIdByKey = new Map();
  const nodes = sortedNodes.map((row, index) => {
    const nodeId = `FH-${levelId}-N${String(index + 1).padStart(6, '0')}`;
    nodeIdByKey.set(row.key, nodeId);
    return deepFreeze({
      nodeId,
      r: row.r,
      z: row.z,
      ownership: [...row.owners].sort(),
    });
  });
  const nodesById = new Map(nodes.map((row) => [row.nodeId, row]));
  const elements = provisionalElements.map((row) => deepFreeze({
    elementId: row.elementId,
    blockId: row.blockId,
    localIndices: { i: row.i, j: row.j },
    nodeIds: row.keys.map((key) => nodeIdByKey.get(key)),
    hotspot: row.hotspot,
  }));

  const qualityRows = provisionalElements.map((row, index) => {
    const element = elements[index];
    const elementNodes = element.nodeIds.map((nodeId) => nodesById.get(nodeId));
    const quality = evaluateQ8Quality({
      elementId: element.elementId,
      nodes: elementNodes.map((node) => ({ x: node.r, y: node.z })),
      hotspot: element.hotspot,
      boundaryMidsideTargets: {
        0: () => xy(row.map(row.u0, (row.v0 + row.v1) / 2)),
        1: () => xy(row.map((row.u0 + row.u1) / 2, row.v1)),
        2: () => xy(row.map(row.u1, (row.v0 + row.v1) / 2)),
        3: () => xy(row.map((row.u0 + row.u1) / 2, row.v0)),
      },
    });
    if (!quality.accepted) {
      throw new RangeError(
        `FH_MESH_QUALITY_REJECTED:${element.elementId}:${quality.failures.join(',')}`,
      );
    }
    return quality;
  });

  const boundaryEdges = provisionalEdges
    .map((row) => deepFreeze({
      edgeId: row.edgeId,
      boundaryId: row.boundaryId,
      nodeIds: row.keys.map((key) => nodeIdByKey.get(key)),
      outwardNormal: row.outwardNormal,
    }))
    .sort((left, right) => left.edgeId.localeCompare(right.edgeId));

  assertNoDuplicateCoordinates(nodes);
  assertConnectivity(elements, nodesById);
  const quality = aggregateQuality(qualityRows);
  const meshPayload = {
    meshFamilyId: FLANGE_HUB_MESH_FAMILY_ID,
    levelId,
    nodes,
    elements,
    boundaryEdges,
    blocks: blockRows,
  };
  const meshHash = semanticHash(meshPayload);
  const canonicalModelHash = semanticHash({
    moduleId: 'C2D-FLANGE-HUB',
    formulationProfile: 'AXISYMMETRIC',
    elementProfile: 'AXI_Q8_FULL_3X3',
    geometryHash: geometry.semanticHash,
    meshHash,
    materialProfile: FLANGE_HUB_MATERIAL_PROFILE,
  });
  const payload = {
    schema: FLANGE_HUB_MESH_SCHEMA,
    moduleId: 'C2D-FLANGE-HUB',
    meshFamilyId: FLANGE_HUB_MESH_FAMILY_ID,
    levelId,
    refinement: level.refinement,
    geometryHash: geometry.semanticHash,
    nodeCount: nodes.length,
    elementCount: elements.length,
    globalH: maximumCornerEdgeLength(elements, nodesById),
    nodes,
    elements,
    boundaryEdges,
    blocks: blockRows,
    quality,
    duplicateInterfaceNodes: [],
    meshHash,
    canonicalModelHash,
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

export function createFlangeHubMeshFamily(
  geometry = createCanonicalFlangeHubGeometry(),
) {
  const levels = FLANGE_HUB_MESH_LEVELS.map(({ levelId }) => (
    createFlangeHubMesh(levelId, geometry)
  ));
  const payload = {
    meshFamilyId: FLANGE_HUB_MESH_FAMILY_ID,
    geometryHash: geometry.semanticHash,
    levels,
    meshHashesByLevel: levels.map((row) => row.meshHash),
    canonicalModelHashesByLevel: levels.map((row) => row.canonicalModelHash),
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function baseUBreakpoints(block, geometry) {
  if (block.kind === 'HUB_FILLET_TRANSITION') {
    const largeFillet = geometry.fillets[1];
    const outerStart = point(
      hubRadiusAt(geometry.input, TRANSITION_START_Z),
      TRANSITION_START_Z,
    );
    const outerEnd = point(INTERNAL_INTERFACE_OUTER_R, 60);
    const segmentLengths = [
      distance(outerStart, largeFillet.firstTangent),
      Math.abs(largeFillet.sweepAngle) * largeFillet.radius,
      distance(largeFillet.secondTangent, outerEnd),
    ];
    return piecewiseBreakpoints(segmentLengths, [4, 6, 2]);
  }
  if (block.kind === 'FLANGE') {
    const horizontalLength = 120 - INTERNAL_INTERFACE_OUTER_R;
    const verticalLength = 90 - 60;
    return piecewiseBreakpoints([horizontalLength, verticalLength], [4, 6]);
  }
  return uniformBreakpoints(block.baseUCount);
}

function blockMap(block, geometry) {
  if (block.kind === 'GRADING_TRANSITION') {
    return gradingTransitionMap(geometry);
  }
  if (block.kind === 'HUB_FILLET_TRANSITION') {
    return hubFilletTransitionMap(geometry);
  }
  if (block.kind === 'FLANGE') {
    return flangeMap();
  }
  const profile = lowerProfile(block.segment, geometry);
  return (u, v) => {
    const outer = profile(u);
    return point(50 + v * (outer.r - 50), outer.z);
  };
}

function lowerProfile(segmentId, geometry) {
  const smallFillet = geometry.fillets[0];
  const line = (start, end) => (u) => interpolate(start, end, u);
  const arc = (value) => (u) => {
    const angle = value.startAngle + value.sweepAngle * u;
    return point(
      value.center.r + value.radius * Math.cos(angle),
      value.center.z + value.radius * Math.sin(angle),
    );
  };
  if (segmentId === 'PIPE') {
    return line(point(60, -100), smallFillet.firstTangent);
  }
  if (segmentId === 'SMALL_ARC') return arc(smallFillet);
  if (segmentId === 'HUB_SMALL') {
    return line(smallFillet.secondTangent, point(66, 0));
  }
  if (segmentId === 'HUB_MID') {
    return line(point(66, 0), point(hubRadiusAt(geometry.input, 30), 30));
  }
  throw new TypeError(`FH_UNKNOWN_LOWER_PROFILE:${segmentId}`);
}

function gradingTransitionMap(geometry) {
  return (u, v) => {
    const z = 30 + (TRANSITION_START_Z - 30) * u;
    const outsideRadius = hubRadiusAt(geometry.input, z);
    const upperFraction = upperFractionAt(v);
    const radialFraction = (1 - u) * v + u * upperFraction;
    return point(50 + radialFraction * (outsideRadius - 50), z);
  };
}

function hubFilletTransitionMap(geometry) {
  const largeFillet = geometry.fillets[1];
  const innerStart = point(50, TRANSITION_START_Z);
  const outerStart = point(
    hubRadiusAt(geometry.input, TRANSITION_START_Z),
    TRANSITION_START_Z,
  );
  const innerEnd = point(50, INTERNAL_INTERFACE_Z);
  const outerEnd = point(INTERNAL_INTERFACE_OUTER_R, 60);
  const segmentLengths = [
    distance(outerStart, largeFillet.firstTangent),
    Math.abs(largeFillet.sweepAngle) * largeFillet.radius,
    distance(largeFillet.secondTangent, outerEnd),
  ];
  const outer = physicalPathFunction({
    segmentLengths,
    segments: [
      (t) => interpolate(outerStart, largeFillet.firstTangent, t),
      (t) => {
        const angle = largeFillet.startAngle + largeFillet.sweepAngle * t;
        return point(
          largeFillet.center.r + largeFillet.radius * Math.cos(angle),
          largeFillet.center.z + largeFillet.radius * Math.sin(angle),
        );
      },
      (t) => interpolate(largeFillet.secondTangent, outerEnd, t),
    ],
  });
  const coons = coonsMap({
    inner: (u) => interpolate(innerStart, innerEnd, u),
    outer,
    start: (v) => interpolate(innerStart, outerStart, v),
    end: (v) => interpolate(innerEnd, outerEnd, v),
    innerStart,
    outerStart,
    innerEnd,
    outerEnd,
  });
  return (u, v) => coons(u, upperFractionAt(v));
}

function flangeMap() {
  const innerStart = point(50, INTERNAL_INTERFACE_Z);
  const outerStart = point(INTERNAL_INTERFACE_OUTER_R, 60);
  const innerEnd = point(50, 90);
  const outerEnd = point(120, 90);
  const outsideCorner = point(120, 60);
  const outer = physicalPathFunction({
    segmentLengths: [
      distance(outerStart, outsideCorner),
      distance(outsideCorner, outerEnd),
    ],
    segments: [
      (t) => interpolate(outerStart, outsideCorner, t),
      (t) => interpolate(outsideCorner, outerEnd, t),
    ],
  });
  const coons = coonsMap({
    inner: (u) => interpolate(innerStart, innerEnd, u),
    outer,
    start: (v) => interpolate(innerStart, outerStart, v),
    end: (v) => interpolate(innerEnd, outerEnd, v),
    innerStart,
    outerStart,
    innerEnd,
    outerEnd,
  });
  return (u, v) => coons(u, upperFractionAt(v));
}

function coonsMap({
  inner,
  outer,
  start,
  end,
  innerStart,
  outerStart,
  innerEnd,
  outerEnd,
}) {
  return (u, v) => {
    const d0 = inner(u);
    const d1 = outer(u);
    const c0 = start(v);
    const c1 = end(v);
    const bilinearR = (1 - u) * (1 - v) * innerStart.r
      + (1 - u) * v * outerStart.r
      + u * (1 - v) * innerEnd.r
      + u * v * outerEnd.r;
    const bilinearZ = (1 - u) * (1 - v) * innerStart.z
      + (1 - u) * v * outerStart.z
      + u * (1 - v) * innerEnd.z
      + u * v * outerEnd.z;
    return point(
      (1 - v) * d0.r + v * d1.r
        + (1 - u) * c0.r + u * c1.r - bilinearR,
      (1 - v) * d0.z + v * d1.z
        + (1 - u) * c0.z + u * c1.z - bilinearZ,
    );
  };
}

function physicalPathFunction({ segmentLengths, segments }) {
  const total = segmentLengths.reduce((sum, value) => sum + value, 0);
  const cumulative = [0];
  segmentLengths.forEach((length) => {
    cumulative.push(cumulative.at(-1) + length / total);
  });
  return (u) => {
    for (let index = 0; index < segments.length; index += 1) {
      const start = cumulative[index];
      const end = cumulative[index + 1];
      if (u <= end || index === segments.length - 1) {
        const local = end > start ? (u - start) / (end - start) : 0;
        return segments[index](Math.max(0, Math.min(1, local)));
      }
    }
    throw new RangeError('FH_PHYSICAL_PATH_PARAMETER_FAILURE');
  };
}

function upperFractionAt(v) {
  const value = Math.max(0, Math.min(1, Number(v)));
  if (value >= 1) return 1;
  const scaled = value * 8;
  const index = Math.min(7, Math.floor(scaled));
  const local = scaled - index;
  return UPPER_FRACTIONS[index]
    + local * (UPPER_FRACTIONS[index + 1] - UPPER_FRACTIONS[index]);
}

function isHotspotElement({ block, i, lastU, v0, v1, map }) {
  if (block.id === 'FH-B01' || block.id === 'FH-B05') return true;
  if (block.id === 'FH-B00' && i === lastU) return true;
  if (block.id === 'FH-B02' && i === 0) return true;
  if (block.id === 'FH-B06' && i === lastU) {
    const r0 = map(1, v0).r;
    const r1 = map(1, v1).r;
    return [60, 65, 95].some((radius) => (
      radius >= Math.min(r0, r1) - 1e-10
      && radius <= Math.max(r0, r1) + 1e-10
    ));
  }
  return false;
}

function registerNode(store, value, owner) {
  const key = coordinateKey(value);
  const prior = store.get(key);
  if (prior) prior.owners.add(owner);
  else store.set(key, { r: value.r, z: value.z, owners: new Set([owner]) });
  return key;
}

function registerBoundaryEdges(rows, {
  block,
  levelId,
  keys,
  i,
  j,
  lastU,
  lastV,
  map,
  um,
}) {
  if (j === 0) {
    rows.push(edge(
      `${levelId}-${block.id}-BORE-${pad(i)}`,
      'FH-BOUNDARY-BORE',
      [keys[0], keys[7], keys[3]],
      [-1, 0],
    ));
  }
  if (block.id === 'FH-B00' && i === 0) {
    rows.push(edge(
      `${levelId}-PIPE-END-${pad(j)}`,
      'FH-BOUNDARY-PIPE-END',
      [keys[0], keys[4], keys[1]],
      [0, -1],
    ));
  }
  if (block.id === 'FH-B06' && i === lastU) {
    rows.push(edge(
      `${levelId}-GASKET-${pad(j)}`,
      'FH-BOUNDARY-GASKET-FACE',
      [keys[3], keys[6], keys[2]],
      [0, 1],
    ));
  }
  if (j === lastV) {
    const midpoint = map(um, 1);
    let boundaryId = `FH-BOUNDARY-OUTER-${block.id}`;
    let outwardNormal = null;
    if (block.id === 'FH-B06' && midpoint.r >= 120 - 1e-9 && midpoint.z > 60) {
      boundaryId = 'FH-BOUNDARY-FLANGE-OD';
      outwardNormal = [1, 0];
    } else if (block.id === 'FH-B06' && Math.abs(midpoint.z - 60) <= 1e-9) {
      boundaryId = 'FH-BOUNDARY-FLANGE-BACK';
      outwardNormal = [0, -1];
    }
    rows.push(edge(
      `${levelId}-${block.id}-OUTER-${pad(i)}`,
      boundaryId,
      [keys[1], keys[5], keys[2]],
      outwardNormal,
    ));
  }
}

function edge(edgeId, boundaryId, keys, outwardNormal) {
  return { edgeId, boundaryId, keys, outwardNormal };
}

function aggregateQuality(rows) {
  return deepFreeze({
    qualityProfileId: rows[0]?.qualityProfileId ?? null,
    minimumDetJAtGaussPoints: Math.min(...rows.map((row) => row.minimumDetJAtGaussPoints)),
    minimumDetJAtControlPoints: Math.min(...rows.map((row) => row.minimumDetJAtControlPoints)),
    qJDeterminantRatio: Math.min(...rows.map((row) => row.qJDeterminantRatio)),
    minimumScaledJacobian: Math.min(...rows.map((row) => row.minimumScaledJacobian)),
    maximumAspectRatio: Math.max(...rows.map((row) => row.aspectRatio)),
    maximumHotspotAspectRatio: Math.max(
      0,
      ...rows.filter((row) => row.limits.maximumAspectRatio === 5).map((row) => row.aspectRatio),
    ),
    midsidePlacementResidual: Math.max(...rows.map((row) => row.midsidePlacementResidual)),
    accepted: rows.every((row) => row.accepted),
    elementQuality: rows,
  });
}

function assertNoDuplicateCoordinates(nodes) {
  const seen = new Set();
  nodes.forEach((node) => {
    const key = coordinateKey(node);
    if (seen.has(key)) throw new RangeError('FH_DUPLICATE_INTERFACE_NODE');
    seen.add(key);
  });
}

function assertConnectivity(elements, nodesById) {
  elements.forEach((element) => {
    if (new Set(element.nodeIds).size !== 8) {
      throw new RangeError(`FH_DEGENERATE_ELEMENT:${element.elementId}`);
    }
    element.nodeIds.forEach((nodeId) => {
      if (!nodesById.has(nodeId)) throw new RangeError(`FH_ORPHAN_NODE:${nodeId}`);
    });
  });
}

function maximumCornerEdgeLength(elements, nodesById) {
  let maximum = 0;
  elements.forEach((element) => {
    const corners = element.nodeIds.slice(0, 4).map((nodeId) => nodesById.get(nodeId));
    for (let index = 0; index < 4; index += 1) {
      maximum = Math.max(maximum, distance(corners[index], corners[(index + 1) % 4]));
    }
  });
  return maximum;
}

function piecewiseBreakpoints(segmentLengths, segmentCounts) {
  if (segmentLengths.length !== segmentCounts.length) {
    throw new TypeError('FH_PIECEWISE_BREAKPOINT_DEFINITION_INVALID');
  }
  const total = segmentLengths.reduce((sum, value) => sum + value, 0);
  const result = [];
  let consumed = 0;
  segmentLengths.forEach((length, index) => {
    const start = consumed / total;
    const end = (consumed + length) / total;
    const count = segmentCounts[index];
    for (let sub = 0; sub < count; sub += 1) {
      result.push(start + (end - start) * sub / count);
    }
    consumed += length;
  });
  result.push(1);
  return result;
}

function refineBreakpoints(base, factor) {
  const result = [];
  for (let index = 0; index < base.length - 1; index += 1) {
    for (let sub = 0; sub < factor; sub += 1) {
      result.push(base[index] + (base[index + 1] - base[index]) * sub / factor);
    }
  }
  result.push(base.at(-1));
  return result;
}

function uniformBreakpoints(count) {
  return Array.from({ length: count + 1 }, (_, index) => index / count);
}

function interpolate(start, end, parameter) {
  return point(
    start.r + (end.r - start.r) * parameter,
    start.z + (end.z - start.z) * parameter,
  );
}

function distance(left, right) {
  return Math.hypot(left.r - right.r, left.z - right.z);
}

function point(r, z) {
  return { r: quantize(r), z: quantize(z) };
}

function quantize(value) {
  return Math.round(value / Q) * Q;
}

function coordinateKey(value) {
  return `${Math.round(value.r / Q)}:${Math.round(value.z / Q)}`;
}

function xy(value) {
  return { x: value.r, y: value.z };
}

function formatNumber(value) {
  return Number(value).toPrecision(16);
}

function pad(value) {
  return String(value).padStart(4, '0');
}
