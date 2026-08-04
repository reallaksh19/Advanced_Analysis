import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { evaluateQ8Quality } from './q8-quality.js';
import { createCanonicalFlangeHubGeometry, FLANGE_HUB_MATERIAL_PROFILE } from './flange-hub-geometry.js';

export const FLANGE_HUB_MESH_SCHEMA = 'flange-hub-mesh-evidence/v1';
export const FLANGE_HUB_MESH_FAMILY_ID = 'BKT-B-FLANGE-Q8-MESH-FAMILY-V1';
export const FLANGE_HUB_MESH_LEVELS = deepFreeze([
  { levelId: 'M0', refinement: 1 },
  { levelId: 'M1', refinement: 2 },
  { levelId: 'M2', refinement: 4 },
  { levelId: 'M3', refinement: 8 },
]);

const Q = 1e-12;
const RT = 92.32274598504;
const STRIP_V = Object.freeze([0, 0.118, (60 - 50) / (RT - 50), (65 - 50) / (RT - 50), 0.5, 0.7, 0.85, 1]);
const RING_V = Object.freeze([0, (95 - RT) / (120 - RT), 0.125, 0.25, 0.5, 0.75, 1]);
const BLOCKS = Object.freeze([
  { id: 'FH-B00', kind: 'STRIP', segment: 'PIPE', nu: 16 },
  { id: 'FH-B01', kind: 'STRIP', segment: 'SMALL_ARC', nu: 4 },
  { id: 'FH-B02', kind: 'STRIP', segment: 'HUB_SMALL', nu: 4 },
  { id: 'FH-B03', kind: 'STRIP', segment: 'HUB_MID', nu: 4 },
  { id: 'FH-B04', kind: 'STRIP', segment: 'HUB_LARGE', nu: 4 },
  { id: 'FH-B05', kind: 'STRIP', segment: 'LARGE_ARC', nu: 4 },
  { id: 'FH-B06', kind: 'CORE', nu: 4 },
  { id: 'FH-B07', kind: 'RING', nu: 4 },
]);

export function createFlangeHubMesh(levelId, geometry = createCanonicalFlangeHubGeometry()) {
  const level = FLANGE_HUB_MESH_LEVELS.find((row) => row.levelId === levelId);
  if (!level) throw new TypeError(`FH_UNKNOWN_MESH_LEVEL:${levelId}`);
  if (geometry?.schema !== 'flange-hub-canonical-geometry/v1') throw new TypeError('FH_CANONICAL_GEOMETRY_REQUIRED');
  const nodeCandidates = new Map();
  const provisionalElements = [];
  const provisionalEdges = [];
  const blockRows = [];

  BLOCKS.forEach((block) => {
    const us = uniform(block.nu * level.refinement);
    const vs = refine(block.kind === 'RING' ? RING_V : STRIP_V, level.refinement);
    const map = blockMap(block, geometry);
    const blockElementIds = [];
    for (let i = 0; i < us.length - 1; i += 1) for (let j = 0; j < vs.length - 1; j += 1) {
      const u0 = us[i]; const u1 = us[i + 1]; const v0 = vs[j]; const v1 = vs[j + 1];
      const um = (u0 + u1) / 2; const vm = (v0 + v1) / 2;
      const uv = [[u0, v0], [u0, v1], [u1, v1], [u1, v0], [u0, vm], [um, v1], [u1, vm], [um, v0]];
      const keys = uv.map(([u, v]) => registerNode(nodeCandidates, map(u, v), `${block.id}:${num(u)}:${num(v)}`));
      const elementId = `${levelId}-E-${block.id}-I${pad(i)}-J${pad(j)}`;
      const hotspot = block.id === 'FH-B01' || block.id === 'FH-B05'
        || (block.id === 'FH-B00' && i === us.length - 2)
        || (block.id === 'FH-B02' && i === 0)
        || (block.id === 'FH-B04' && i === us.length - 2);
      provisionalElements.push({ elementId, blockId: block.id, keys, hotspot, map, u0, u1, v0, v1, i, j });
      blockElementIds.push(elementId);
      registerEdges(provisionalEdges, { block, levelId, keys, i, j, lastU: us.length - 2, lastV: vs.length - 2 });
    }
    blockRows.push({ blockId: block.id, kind: block.kind, longitudinalElementCount: us.length - 1, transverseElementCount: vs.length - 1, elementIds: blockElementIds });
  });

  const sortedNodes = [...nodeCandidates.entries()].map(([key, row]) => ({ key, ...row }))
    .sort((a, b) => a.z - b.z || a.r - b.r || a.key.localeCompare(b.key));
  const idByKey = new Map();
  const nodes = sortedNodes.map((row, index) => {
    const nodeId = `FH-${levelId}-N${String(index + 1).padStart(6, '0')}`;
    idByKey.set(row.key, nodeId);
    return deepFreeze({ nodeId, r: row.r, z: row.z, ownership: [...row.owners].sort() });
  });
  const nodeById = new Map(nodes.map((row) => [row.nodeId, row]));
  const elements = provisionalElements.map((row) => deepFreeze({
    elementId: row.elementId,
    blockId: row.blockId,
    localIndices: { i: row.i, j: row.j },
    nodeIds: row.keys.map((key) => idByKey.get(key)),
    hotspot: row.hotspot,
  }));
  const qualityRows = provisionalElements.map((row, index) => {
    const element = elements[index];
    const elementNodes = element.nodeIds.map((id) => nodeById.get(id));
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
    if (!quality.accepted) throw new RangeError(`FH_MESH_QUALITY_REJECTED:${element.elementId}:${quality.failures.join(',')}`);
    return quality;
  });
  const boundaryEdges = provisionalEdges.map((row) => deepFreeze({
    edgeId: row.edgeId,
    boundaryId: row.boundaryId,
    nodeIds: row.keys.map((key) => idByKey.get(key)),
    outwardNormal: row.outwardNormal,
  })).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  assertNoDuplicateCoordinates(nodes);
  assertConnectivity(elements, nodeById);
  const quality = aggregateQuality(qualityRows);
  const meshPayload = { meshFamilyId: FLANGE_HUB_MESH_FAMILY_ID, levelId, nodes, elements, boundaryEdges, blocks: blockRows };
  const meshHash = semanticHash(meshPayload);
  const canonicalModelHash = semanticHash({
    moduleId: 'C2D-FLANGE-HUB', formulationProfile: 'AXISYMMETRIC', elementProfile: 'AXI_Q8_FULL_3X3',
    geometryHash: geometry.semanticHash, meshHash, materialProfile: FLANGE_HUB_MATERIAL_PROFILE,
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
    globalH: maxCornerEdge(elements, nodeById),
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

export function createFlangeHubMeshFamily(geometry = createCanonicalFlangeHubGeometry()) {
  const levels = FLANGE_HUB_MESH_LEVELS.map(({ levelId }) => createFlangeHubMesh(levelId, geometry));
  const payload = {
    meshFamilyId: FLANGE_HUB_MESH_FAMILY_ID,
    geometryHash: geometry.semanticHash,
    levels,
    meshHashesByLevel: levels.map((row) => row.meshHash),
    canonicalModelHashesByLevel: levels.map((row) => row.canonicalModelHash),
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function blockMap(block, geometry) {
  if (block.kind === 'CORE') return (u, v) => point(50 + v * (RT - 50), 60 + 30 * u);
  if (block.kind === 'RING') return (u, v) => point(RT + v * (120 - RT), 60 + 30 * u);
  const profile = profileFunction(block.segment, geometry);
  return (u, v) => { const outer = profile(u); return point(50 + v * (outer.r - 50), outer.z); };
}
function profileFunction(id, geometry) {
  const small = geometry.fillets[0]; const large = geometry.fillets[1];
  const line = (a, b) => (u) => point(a.r + u * (b.r - a.r), a.z + u * (b.z - a.z));
  const arc = (value) => (u) => { const angle = value.startAngle + value.sweepAngle * u; return point(value.center.r + value.radius * Math.cos(angle), value.center.z + value.radius * Math.sin(angle)); };
  if (id === 'PIPE') return line({ r: 60, z: -100 }, small.firstTangent);
  if (id === 'SMALL_ARC') return arc(small);
  if (id === 'HUB_SMALL') return line(small.secondTangent, { r: 66, z: 0 });
  if (id === 'HUB_MID') return line({ r: 66, z: 0 }, { r: 75.5, z: 30 });
  if (id === 'HUB_LARGE') return line({ r: 75.5, z: 30 }, large.firstTangent);
  if (id === 'LARGE_ARC') return arc(large);
  throw new TypeError(`FH_UNKNOWN_PROFILE:${id}`);
}
function registerNode(store, value, owner) {
  const key = keyOf(value);
  const prior = store.get(key);
  if (prior) prior.owners.add(owner);
  else store.set(key, { r: value.r, z: value.z, owners: new Set([owner]) });
  return key;
}
function registerEdges(rows, { block, levelId, keys, i, j, lastU, lastV }) {
  if (block.kind !== 'RING' && j === 0) rows.push(edge(`${levelId}-${block.id}-BORE-${pad(i)}`, 'FH-BOUNDARY-BORE', [keys[0], keys[7], keys[3]], [-1, 0]));
  if (block.id === 'FH-B00' && i === 0) rows.push(edge(`${levelId}-PIPE-END-${pad(j)}`, 'FH-BOUNDARY-PIPE-END', [keys[0], keys[4], keys[1]], [0, -1]));
  if ((block.kind === 'CORE' || block.kind === 'RING') && i === lastU) rows.push(edge(`${levelId}-GASKET-${block.id}-${pad(j)}`, 'FH-BOUNDARY-GASKET-FACE', [keys[3], keys[6], keys[2]], [0, 1]));
  if (block.kind === 'RING' && j === lastV) rows.push(edge(`${levelId}-FLANGE-OD-${pad(i)}`, 'FH-BOUNDARY-FLANGE-OD', [keys[1], keys[5], keys[2]], [1, 0]));
  if (block.kind === 'STRIP' && j === lastV) rows.push(edge(`${levelId}-${block.id}-OUTER-${pad(i)}`, `FH-BOUNDARY-OUTER-${block.id}`, [keys[1], keys[5], keys[2]], null));
}
function edge(edgeId, boundaryId, keys, outwardNormal) { return { edgeId, boundaryId, keys, outwardNormal }; }
function aggregateQuality(rows) {
  return deepFreeze({
    qualityProfileId: rows[0]?.qualityProfileId ?? null,
    minimumDetJAtGaussPoints: Math.min(...rows.map((row) => row.minimumDetJAtGaussPoints)),
    minimumDetJAtControlPoints: Math.min(...rows.map((row) => row.minimumDetJAtControlPoints)),
    qJDeterminantRatio: Math.min(...rows.map((row) => row.qJDeterminantRatio)),
    minimumScaledJacobian: Math.min(...rows.map((row) => row.minimumScaledJacobian)),
    maximumAspectRatio: Math.max(...rows.map((row) => row.aspectRatio)),
    maximumHotspotAspectRatio: Math.max(0, ...rows.filter((row) => row.limits.maximumAspectRatio === 5).map((row) => row.aspectRatio)),
    midsidePlacementResidual: Math.max(...rows.map((row) => row.midsidePlacementResidual)),
    accepted: rows.every((row) => row.accepted),
    elementQuality: rows,
  });
}
function assertNoDuplicateCoordinates(nodes) { const seen = new Set(); nodes.forEach((node) => { const key = keyOf(node); if (seen.has(key)) throw new RangeError('FH_DUPLICATE_INTERFACE_NODE'); seen.add(key); }); }
function assertConnectivity(elements, nodeById) { elements.forEach((element) => { if (new Set(element.nodeIds).size !== 8) throw new RangeError(`FH_DEGENERATE_ELEMENT:${element.elementId}`); element.nodeIds.forEach((id) => { if (!nodeById.has(id)) throw new RangeError(`FH_ORPHAN_NODE:${id}`); }); }); }
function maxCornerEdge(elements, nodeById) { let result = 0; elements.forEach((element) => { const n = element.nodeIds.slice(0, 4).map((id) => nodeById.get(id)); for (let i = 0; i < 4; i += 1) result = Math.max(result, Math.hypot(n[i].r - n[(i + 1) % 4].r, n[i].z - n[(i + 1) % 4].z)); }); return result; }
function refine(base, factor) { const result = []; for (let i = 0; i < base.length - 1; i += 1) for (let j = 0; j < factor; j += 1) result.push(base[i] + (base[i + 1] - base[i]) * j / factor); result.push(base.at(-1)); return result; }
function uniform(count) { return Array.from({ length: count + 1 }, (_, i) => i / count); }
function point(r, z) { return { r: quantize(r), z: quantize(z) }; }
function quantize(value) { return Math.round(value / Q) * Q; }
function keyOf(value) { return `${Math.round(value.r / Q)}:${Math.round(value.z / Q)}`; }
function xy(value) { return { x: value.r, y: value.z }; }
function num(value) { return Number(value).toPrecision(16); }
function pad(value) { return String(value).padStart(4, '0'); }
