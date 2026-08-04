import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { evaluateQ8Quality } from './q8-quality.js';
import {
  createCanonicalFlangeHubGeometry,
  FLANGE_HUB_MATERIAL_PROFILE,
} from './flange-hub-geometry.js';

export const FLANGE_HUB_MESH_SCHEMA = 'flange-hub-mesh-evidence/v1';
export const FLANGE_HUB_MESH_FAMILY_ID = 'BKT-B-FLANGE-Q8-MESH-FAMILY-V1';
export const FLANGE_HUB_MESH_LEVELS = deepFreeze([
  { levelId: 'M0', refinement: 1 },
  { levelId: 'M1', refinement: 2 },
  { levelId: 'M2', refinement: 4 },
  { levelId: 'M3', refinement: 8 },
]);

const COORDINATE_QUANTUM = 1e-12;
const BASE_THROUGH_FRACTIONS = Object.freeze([
  0,
  0.118,
  (60 - 50) / (92.32274598504 - 50),
  (65 - 50) / (92.32274598504 - 50),
  0.5,
  0.7,
  0.85,
  1,
]);
const BASE_RING_FRACTIONS = Object.freeze([
  0,
  (95 - 92.32274598504) / (120 - 92.32274598504),
  0.125,
  0.25,
  0.5,
  0.75,
  1,
]);

const BLOCKS = Object.freeze([
  { blockId: 'FH-B00', kind: 'STRIP', profileSegmentId: 'FH-B00', longitudinalCount: 8 },
  { blockId: 'FH-B01', kind: 'STRIP', profileSegmentId: 'FH-B01', longitudinalCount: 4 },
  { blockId: 'FH-B02', kind: 'STRIP', profileSegmentId: 'FH-B02', longitudinalCount: 4 },
  { blockId: 'FH-B03', kind: 'STRIP', profileSegmentId: 'FH-B03', longitudinalCount: 4 },
  { blockId: 'FH-B04', kind: 'STRIP', profileSegmentId: 'FH-B04', longitudinalCount: 4 },
  { blockId: 'FH-B05', kind: 'STRIP', profileSegmentId: 'FH-B05', longitudinalCount: 4 },
  { blockId: 'FH-B06', kind: 'FLANGE_CORE', longitudinalCount: 4 },
  { blockId: 'FH-B07', kind: 'FLANGE_RING', longitudinalCount: 4 },
]);

export function createFlangeHubMesh(levelId, geometry = createCanonicalFlangeHubGeometry()) {
  const level = FLANGE_HUB_MESH_LEVELS.find((row) => row.levelId === levelId);
  if (!level) throw new TypeError(`FH_UNKNOWN_MESH_LEVEL:${levelId}`);
  if (geometry?.schema !== 'flange-hub-canonical-geometry/v1') {
    throw new TypeError('FH_CANONICAL_GEOMETRY_REQUIRED');
  }
  const nodeCandidates = new Map();
  const elementCandidates = [];
  const edgeCandidates = [];
  const blockEvidence = [];

  for (const block of BLOCKS) {
    const uBreaks = uniformBreakpoints(block.longitudinalCount * level.refinement);
    const vBase = block.kind === 'FLANGE_RING'
      ? BASE_RING_FRACTIONS
      : BASE_THROUGH_FRACTIONS;
    const vBreaks = refineBreakpoints(vBase, level.refinement);
    const map = createBlockMap(block, geometry);
    const blockElements = [];

    for (let i = 0; i < uBreaks.length - 1; i += 1) {
      for (let j = 0; j < vBreaks.length - 1; j += 1) {
        const u0 = uBreaks[i];
        const u1 = uBreaks[i + 1];
        const v0 = vBreaks[j];
        const v1 = vBreaks[j + 1];
        const stations = [
          [u0, v0], [u0, v1], [u1, v1], [u1, v0],
          [(u0 + u1) / 2, v0], [u0, (v0 + v1) / 2],
          [(u0 + u1) / 2, v1], [u1, (v0 + v1) / 2],
        ];
        const nodeKeys = stations.map(([u, v]) => registerNode(nodeCandidates, map(u, v), {
          blockId: block.blockId,
          localU: u,
          localV: v,
        }));
        const elementId = `${levelId}-E-${block.blockId}-I${pad(i)}-J${pad(j)}`;
        const hotspot = block.kind === 'STRIP'
          && (block.blockId === 'FH-B01' || block.blockId === 'FH-B05'
            || (block.blockId === 'FH-B00' && i === uBreaks.length - 2)
            || (block.blockId === 'FH-B02' && i === 0)
            || (block.blockId === 'FH-B04' && i === uBreaks.length - 2));
        elementCandidates.push({
          elementId,
          blockId: block.blockId,
          localIndices: { i, j },
          nodeKeys,
          hotspot,
          bounds: { u0, u1, v0, v1 },
          map,
        });
        blockElements.push(elementId);
        registerBoundaryEdges(edgeCandidates, {
          block,
          geometry,
          levelId,
          i,
          j,
          uBreaks,
          vBreaks,
          nodeKeys,
        });
      }
    }
    blockEvidence.push({
      blockId: block.blockId,
      kind: block.kind,
      longitudinalElementCount: uBreaks.length - 1,
      transverseElementCount: vBreaks.length - 1,
      elementIds: blockElements,
    });
  }

  const sortedNodes = [...nodeCandidates.entries()]
    .map(([key, row]) => ({ key, ...row }))
    .sort((a, b) => a.z - b.z || a.r - b.r || a.key.localeCompare(b.key));
  const nodeIdByKey = new Map();
  const nodes = sortedNodes.map((row, index) => {
    const nodeId = `FH-${levelId}-N${String(index + 1).padStart(6, '0')}`;
    nodeIdByKey.set(row.key, nodeId);
    return deepFreeze({
      nodeId,
      r: row.r,
      z: row.z,
      ownership: deepFreeze([...row.ownership].sort()),
    });
  });
  const nodesById = new Map(nodes.map((row) => [row.nodeId, row]));
  const elements = elementCandidates.map((candidate) => deepFreeze({
    elementId: candidate.elementId,
    blockId: candidate.blockId,
    localIndices: candidate.localIndices,
    nodeIds: candidate.nodeKeys.map((key) => nodeIdByKey.get(key)),
    hotspot: candidate.hotspot,
  }));
  const elementById = new Map(elements.map((row) => [row.elementId, row]));

  const qualityRows = elementCandidates.map((candidate) => {
    const element = elementById.get(candidate.elementId);
    const physicalNodes = element.nodeIds.map((nodeId) => nodesById.get(nodeId));
    const quality = evaluateQ8Quality({
      elementId: element.elementId,
      nodes: physicalNodes.map((node) => ({ x: node.r, y: node.z })),
      hotspot: element.hotspot,
      boundaryMidsideTargets: {
        0: () => xy(candidate.map((candidate.bounds.u0), midpoint(candidate.bounds.v0, candidate.bounds.v1))),
        1: () => xy(candidate.map(midpoint(candidate.bounds.u0, candidate.bounds.u1), candidate.bounds.v1)),
        2: () => xy(candidate.map(candidate.bounds.u1, midpoint(candidate.bounds.v0, candidate.bounds.v1))),
        3: () => xy(candidate.map(midpoint(candidate.bounds.u0, candidate.bounds.u1), candidate.bounds.v0)),
      },
    });
    if (!quality.accepted) {
      throw new RangeError(`FH_MESH_QUALITY_REJECTED:${element.elementId}:${quality.failures.join(',')}`);
    }
    return quality;
  });

  const boundaryEdges = canonicalizeBoundaryEdges(edgeCandidates, nodeIdByKey);
  const duplicateInterfaceNodes = findDuplicateCoordinates(nodes);
  if (duplicateInterfaceNodes.length) throw new RangeError('FH_DUPLICATE_INTERFACE_NODE');
  requireConformingInterfaces(elements, nodesById);
  const quality = aggregateQuality(qualityRows);
  const meshPayload = {
    meshFamilyId: FLANGE_HUB_MESH_FAMILY_ID,
    levelId,
    nodes,
    elements,
    boundaryEdges,
    blocks: blockEvidence,
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
    blocks: blockEvidence,
    quality,
    duplicateInterfaceNodes,
    meshHash,
    canonicalModelHash,
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

export function createFlangeHubMeshFamily(geometry = createCanonicalFlangeHubGeometry()) {
  const levels = FLANGE_HUB_MESH_LEVELS.map((row) => createFlangeHubMesh(row.levelId, geometry));
  return deepFreeze({
    meshFamilyId: FLANGE_HUB_MESH_FAMILY_ID,
    geometryHash: geometry.semanticHash,
    levels,
    meshHashesByLevel: levels.map((row) => row.meshHash),
    canonicalModelHashesByLevel: levels.map((row) => row.canonicalModelHash),
    semanticHash: semanticHash({
      meshFamilyId: FLANGE_HUB_MESH_FAMILY_ID,
      geometryHash: geometry.semanticHash,
      levelHashes: levels.map((row) => row.semanticHash),
    }),
  });
}

function createBlockMap(block, geometry) {
  const outerTangent = geometry.fillets[1].secondTangent.r;
  if (block.kind === 'STRIP') {
    const outer = profileFunction(geometry, block.profileSegmentId);
    return (u, v) => {
      const outside = outer(u);
      return point(50 + v * (outside.r - 50), outside.z);
    };
  }
  if (block.kind === 'FLANGE_CORE') {
    return (u, v) => point(50 + v * (outerTangent - 50), 60 + 30 * u);
  }
  if (block.kind === 'FLANGE_RING') {
    return (u, v) => point(outerTangent + v * (120 - outerTangent), 60 + 30 * u);
  }
  throw new TypeError(`FH_UNKNOWN_BLOCK_KIND:${block.kind}`);
}

function profileFunction(geometry, segmentId) {
  const small = geometry.fillets[0];
  const large = geometry.fillets[1];
  const line = (a, b) => (u) => point(a.r + u * (b.r - a.r), a.z + u * (b.z - a.z));
  const arc = (value) => (u) => {
    const angle = value.startAngle + value.sweepAngle * u;
    return point(value.center.r + value.radius * Math.cos(angle), value.center.z + value.radius * Math.sin(angle));
  };
  if (segmentId === 'FH-B00') return line({ r: 60, z: -100 }, small.firstTangent);
  if (segmentId === 'FH-B01') return arc(small);
  if (segmentId === 'FH-B02') return line(small.secondTangent, { r: 66, z: 0 });
  if (segmentId === 'FH-B03') return line({ r: 66, z: 0 }, { r: 75.5, z: 30 });
  if (segmentId === 'FH-B04') return line({ r: 75.5, z: 30 }, large.firstTangent);
  if (segmentId === 'FH-B05') return arc(large);
  throw new TypeError(`FH_UNKNOWN_PROFILE_SEGMENT:${segmentId}`);
}

function registerNode(store, coordinate, ownership) {
  const key = coordinateKey(coordinate);
  const row = store.get(key);
  const owner = `${ownership.blockId}:${formatNumber(ownership.localU)}:${formatNumber(ownership.localV)}`;
  if (row) {
    if (Math.hypot(row.r - coordinate.r, row.z - coordinate.z) > COORDINATE_QUANTUM) {
      throw new RangeError('FH_NODE_QUANTIZATION_COLLISION');
    }
    row.ownership.add(owner);
  } else {
    store.set(key, { r: coordinate.r, z: coordinate.z, ownership: new Set([owner]) });
  }
  return key;
}

function registerBoundaryEdges(store, { block, levelId, i, j, uBreaks, vBreaks, nodeKeys }) {
  const lastU = uBreaks.length - 2;
  const lastV = vBreaks.length - 2;
  if (block.kind !== 'FLANGE_RING' && j === 0) {
    store.push(edge(`${levelId}-${block.blockId}-BORE-${pad(i)}`, 'FH-BOUNDARY-BORE', [nodeKeys[0], nodeKeys[7], nodeKeys[3]], [-1, 0]));
  }
  if (block.blockId === 'FH-B00' && i === 0) {
    store.push(edge(`${levelId}-PIPE-END-${pad(j)}`, 'FH-BOUNDARY-PIPE-END', [nodeKeys[0], nodeKeys[4], nodeKeys[1]], [0, -1]));
  }
  if ((block.kind === 'FLANGE_CORE' || block.kind === 'FLANGE_RING') && i === lastU) {
    const key = `${levelId}-GASKET-FACE-${block.blockId}-${pad(j)}`;
    store.push(edge(key, 'FH-BOUNDARY-GASKET-FACE', [nodeKeys[3], nodeKeys[6], nodeKeys[2]], [0, 1]));
  }
  if (block.kind === 'FLANGE_RING' && j === lastV) {
    store.push(edge(`${levelId}-FLANGE-OD-${pad(i)}`, 'FH-BOUNDARY-FLANGE-OD', [nodeKeys[1], nodeKeys[5], nodeKeys[2]], [1, 0]));
  }
  if (block.kind === 'STRIP' && j === lastV) {
    store.push(edge(`${levelId}-${block.blockId}-OUTER-${pad(i)}`, `FH-BOUNDARY-OUTER-${block.blockId}`, [nodeKeys[1], nodeKeys[5], nodeKeys[2]], null));
  }
}

function edge(edgeId, boundaryId, nodeKeys, outwardNormal) {
  return { edgeId, boundaryId, nodeKeys, outwardNormal };
}

function canonicalizeBoundaryEdges(rows, nodeIdByKey) {
  return rows.map((row) => deepFreeze({
    edgeId: row.edgeId,
    boundaryId: row.boundaryId,
    nodeIds: row.nodeKeys.map((key) => nodeIdByKey.get(key)),
    outwardNormal: row.outwardNormal,
  })).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
}

function requireConformingInterfaces(elements, nodesById) {
  const edgeOwners = new Map();
  const edgeDefinitions = [
    [0, 4, 1], [1, 5, 2], [3, 6, 2], [0, 7, 3],
  ];
  elements.forEach((element) => {
    edgeDefinitions.forEach(([a, m, b]) => {
      const ends = [element.nodeIds[a], element.nodeIds[b]].sort();
      const key = `${ends[0]}:${element.nodeIds[m]}:${ends[1]}`;
      const owners = edgeOwners.get(key) ?? [];
      owners.push(element.elementId);
      edgeOwners.set(key, owners);
    });
  });
  edgeOwners.forEach((owners, key) => {
    if (owners.length > 2) throw new RangeError(`FH_NONMANIFOLD_INTERFACE:${key}`);
  });
  elements.forEach((element) => element.nodeIds.forEach((nodeId) => {
    if (!nodesById.has(nodeId)) throw new RangeError(`FH_ORPHAN_CONNECTIVITY:${element.elementId}:${nodeId}`);
  }));
}

function aggregateQuality(rows) {
  return deepFreeze({
    qualityProfileId: rows[0]?.qualityProfileId ?? null,
    minimumDetJAtGaussPoints: Math.min(...rows.map((row) => row.minimumDetJAtGaussPoints)),
    minimumDetJAtControlPoints: Math.min(...rows.map((row) => row.minimumDetJAtControlPoints)),
    qJDeterminantRatio: Math.min(...rows.map((row) => row.qJDeterminantRatio)),
    minimumScaledJacobian: Math.min(...rows.map((row) => row.minimumScaledJacobian)),
    maximumAspectRatio: Math.max(...rows.map((row) => row.aspectRatio)),
    maximumHotspotAspectRatio: Math.max(...rows.filter((row) => row.limits.maximumAspectRatio === 5).map((row) => row.aspectRatio), 0),
    midsidePlacementResidual: Math.max(...rows.map((row) => row.midsidePlacementResidual)),
    accepted: rows.every((row) => row.accepted),
    elementQuality: rows,
  });
}

function findDuplicateCoordinates(nodes) {
  const byKey = new Map();
  const duplicates = [];
  nodes.forEach((node) => {
    const key = coordinateKey(node);
    const prior = byKey.get(key);
    if (prior && prior !== node.nodeId) duplicates.push({ leftNodeId: prior, rightNodeId: node.nodeId });
    else byKey.set(key, node.nodeId);
  });
  return duplicates;
}

function maximumCornerEdgeLength(elements, nodesById) {
  let maximum = 0;
  elements.forEach((element) => {
    const nodes = element.nodeIds.slice(0, 4).map((id) => nodesById.get(id));
    for (let i = 0; i < 4; i += 1) {
      maximum = Math.max(maximum, Math.hypot(nodes[i].r - nodes[(i + 1) % 4].r, nodes[i].z - nodes[(i + 1) % 4].z));
    }
  });
  return maximum;
}

function refineBreakpoints(base, factor) {
  const values = [];
  for (let index = 0; index < base.length - 1; index += 1) {
    for (let sub = 0; sub < factor; sub += 1) {
      values.push(base[index] + (base[index + 1] - base[index]) * sub / factor);
    }
  }
  values.push(base.at(-1));
  return values;
}
function uniformBreakpoints(count) { return Array.from({ length: count + 1 }, (_, index) => index / count); }
function point(r, z) { return { r: quantize(r), z: quantize(z) }; }
function xy(value) { return { x: value.r, y: value.z }; }
function quantize(value) { return Math.round(value / COORDINATE_QUANTUM) * COORDINATE_QUANTUM; }
function coordinateKey(value) { return `${Math.round(value.r / COORDINATE_QUANTUM)}:${Math.round(value.z / COORDINATE_QUANTUM)}`; }
function midpoint(a, b) { return (a + b) / 2; }
function pad(value) { return String(value).padStart(4, '0'); }
function formatNumber(value) { return Number(value).toPrecision(16); }
