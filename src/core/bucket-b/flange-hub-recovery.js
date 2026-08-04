import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { recoverAxisymmetricAtPhysicalCoordinate } from './axisymmetric-recovery.js';
import { linearizeStressComponents } from './path-and-scl.js';

export const FLANGE_HUB_PATH_PROFILE_ID = 'BKT-B-FLANGE-HUB-FIXED-PHYSICAL-PATHS-V1';
export const FLANGE_HUB_PROBE_IDS = Object.freeze([
  'P-PIPE-REMOTE',
  'P-HUB-SMALL',
  'P-HUB-MID',
  'P-HUB-LARGE',
  'P-FLANGE-INNER',
  'P-FLANGE-MID',
  'P-FLANGE-OUTER',
]);
export const FLANGE_HUB_SCL_IDS = Object.freeze([
  'SCL-PIPE-REMOTE',
  'SCL-HUB-SMALL',
  'SCL-HUB-MID',
  'SCL-HUB-LARGE',
  'SCL-FLANGE-INNER',
  'SCL-FLANGE-MID',
]);

const PATH_STATION_COUNT = 33;
const HUB_DIRECTION = unit({ r: 19, z: 60 });

export function createFlangeHubPathDefinitions(geometry) {
  requireGeometry(geometry);
  const smallOuter = add(geometry.fillets[0].secondTangent, scale(HUB_DIRECTION, 3));
  const largeOuter = add(geometry.fillets[1].firstTangent, scale(HUB_DIRECTION, -5));
  const hubMidOuter = { r: 75.5, z: 30 };
  const paths = [
    radialPath('SCL-PIPE-REMOTE', -80, 50, 60, 'FH-B00'),
    hubNormalPath('SCL-HUB-SMALL', smallOuter, 'FH-B02'),
    hubNormalPath('SCL-HUB-MID', hubMidOuter, 'FH-B03'),
    hubNormalPath('SCL-HUB-LARGE', largeOuter, 'FH-B04'),
    axialPath('SCL-FLANGE-INNER', 100, 60, 90, 'FH-B07'),
    axialPath('SCL-FLANGE-MID', 110, 60, 90, 'FH-B07'),
  ];
  const probes = [
    probeFromPath('P-PIPE-REMOTE', paths[0]),
    probeFromPath('P-HUB-SMALL', paths[1]),
    probeFromPath('P-HUB-MID', paths[2]),
    probeFromPath('P-HUB-LARGE', paths[3]),
    { probeId: 'P-FLANGE-INNER', point: { r: 100, z: 75 }, expectedBlockId: 'FH-B07' },
    { probeId: 'P-FLANGE-MID', point: { r: 110, z: 75 }, expectedBlockId: 'FH-B07' },
    { probeId: 'P-FLANGE-OUTER', point: { r: 115, z: 75 }, expectedBlockId: 'FH-B07' },
  ];
  const payload = {
    pathDefinitionProfileId: FLANGE_HUB_PATH_PROFILE_ID,
    geometryHash: geometry.semanticHash,
    probes,
    paths,
    exclusions: [
      { exclusionId: 'SUPPORT_ENDPOINTS', locations: [{ r: 60, z: 90 }, { r: 95, z: 90 }], authority: 'DIAGNOSTIC_ONLY' },
      { exclusionId: 'GASKET_LOAD_ENDPOINTS', locations: [{ r: 65, z: 90 }, { r: 95, z: 90 }], authority: 'DIAGNOSTIC_ONLY' },
      { exclusionId: 'FREE_EDGE_CORNERS', locations: [{ r: 120, z: 60 }, { r: 120, z: 90 }], authority: 'DIAGNOSTIC_ONLY' },
      { exclusionId: 'FILLET_TANGENCY_POINTS', locations: geometry.fillets.flatMap((row) => [row.firstTangent, row.secondTangent]), authority: 'FINITE_OFFSET_PROBE_REQUIRED' },
    ],
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

export function recoverFlangeHubLevel({ mesh, result, geometry, pathDefinitions = createFlangeHubPathDefinitions(geometry) } = {}) {
  requireMeshAndResult(mesh, result);
  const nodesById = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  const displacementByNode = new Map(result.nodalDisplacements.map((row) => [row.nodeId, row]));
  const resultByElement = new Map(result.elementResults.map((row) => [row.elementId, row]));
  const elementRows = mesh.elements.map((element) => ({
    ...element,
    nodes: element.nodeIds.map((nodeId) => nodesById.get(nodeId)),
    result: resultByElement.get(element.elementId),
  }));

  const probes = pathDefinitions.probes.map((definition) => recoverPoint({
    definition,
    mesh,
    elementRows,
    displacementByNode,
    selectorDirection: null,
  }));
  const paths = pathDefinitions.paths.map((definition) => recoverPath({
    definition,
    mesh,
    elementRows,
    displacementByNode,
  }));
  const payload = {
    schema: 'flange-hub-recovery-evidence/v1',
    moduleId: 'C2D-FLANGE-HUB',
    levelId: mesh.levelId,
    loadCaseId: result.loadCaseId,
    geometryHash: geometry.semanticHash,
    meshHash: mesh.meshHash,
    resultHash: result.semanticHash,
    pathDefinitionHash: pathDefinitions.semanticHash,
    probes,
    paths,
    diagnosticMaxima: diagnosticGaussPointMaxima(result),
    authority: {
      rawGaussPointStressAuthoritative: true,
      fixedCoordinateRecoveryAuthoritative: true,
      nearestNodeSubstitutionUsed: false,
      displaySmoothedStressAuthoritative: false,
      diagnosticMaximaGrantQualification: false,
    },
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function recoverPath({ definition, mesh, elementRows, displacementByNode }) {
  const samples = definition.points.map((point, index) => recoverPoint({
    definition: {
      probeId: `${definition.pathId}:S${String(index + 1).padStart(2, '0')}`,
      point,
      expectedBlockId: definition.expectedBlockId,
    },
    mesh,
    elementRows,
    displacementByNode,
    selectorDirection: selectorDirection(definition, index),
  }));
  let position = 0;
  const sclSamples = samples.map((sample, index) => {
    if (index > 0) position += distance(samples[index - 1].physicalCoordinate, sample.physicalCoordinate);
    const local = rotateTensor(sample.recoveredTensor, definition.surfaceTangent, definition.throughWallDirection);
    return deepFreeze({
      position,
      authority: 'INTEGRATION_POINT_INTERPOLATED',
      stress: {
        sigmaX: local.sigmaSurface,
        sigmaY: local.sigmaThroughWall,
        sigmaZ: sample.recoveredTensor.sigmaTheta,
        tauXY: local.tauSurfaceThroughWall,
      },
    });
  });
  const scl = linearizeStressComponents(sclSamples, {
    lineIdentity: definition.pathId,
    pressureCorrection: null,
  });
  const section = integrateSection(samples, definition);
  const probeH = Math.max(...samples.map((row) => row.probeH));
  return deepFreeze({
    pathId: definition.pathId,
    expectedBlockId: definition.expectedBlockId,
    pathType: definition.pathType,
    fixedPhysicalPoints: definition.points,
    throughWallDirection: definition.throughWallDirection,
    surfaceTangent: definition.surfaceTangent,
    samples,
    probeH,
    scl,
    section,
  });
}

function recoverPoint({ definition, mesh, elementRows, displacementByNode, selectorDirection }) {
  const candidates = elementRows.filter((element) => inBoundingBox(definition.point, element.nodes));
  const recoveries = [];
  candidates.forEach((element) => {
    try {
      const recovered = recoverAxisymmetricAtPhysicalCoordinate({
        elementId: element.elementId,
        nodes: element.nodes,
        point: definition.point,
        gaussPointResults: element.result.gaussPointResults,
        nodalDisplacements: element.nodeIds.map((nodeId) => displacementByNode.get(nodeId)),
      });
      recoveries.push({ element, recovered });
    } catch (error) {
      if (!(error instanceof RangeError && /POINT_NOT_CONTAINED/.test(error.message))) throw error;
    }
  });
  if (recoveries.length === 0) throw new RangeError(`FH_NO_CONTAINING_ELEMENT:${definition.probeId}`);
  const expected = recoveries.filter((row) => row.element.blockId === definition.expectedBlockId);
  if (expected.length === 0) throw new RangeError(`FH_PROBE_BLOCK_OWNERSHIP_MISMATCH:${definition.probeId}`);
  const selected = selectRecovery(expected, definition.point, selectorDirection);
  const cornerNodes = selected.element.nodes.slice(0, 4);
  const probeH = Math.max(...cornerNodes.map((node, index) => distance(node, cornerNodes[(index + 1) % 4])));
  if (selected.recovered.mappingResidual > Math.max(1e-10, 1e-10 * probeH)) {
    throw new RangeError(`FH_MAPPING_RESIDUAL_EXCEEDED:${definition.probeId}`);
  }
  return deepFreeze({
    probeId: definition.probeId,
    physicalCoordinate: definition.point,
    candidateElementIds: recoveries.map((row) => row.element.elementId).sort(),
    candidateBlockIds: [...new Set(recoveries.map((row) => row.element.blockId))].sort(),
    selectedContainingElementId: selected.element.elementId,
    selectedBlockId: selected.element.blockId,
    naturalCoordinates: selected.recovered.naturalCoordinates,
    mappingResidual: selected.recovered.mappingResidual,
    minimumNaturalCoordinateMargin: selected.recovered.minimumNaturalCoordinateMargin,
    sourceGaussPointIds: selected.recovered.sourceGaussPointIds,
    sourceGaussPoints: selected.recovered.sourceGaussPoints,
    interpolationWeights: selected.recovered.interpolationWeights,
    displacement: selected.recovered.displacement,
    recoveredTensor: selected.recovered.recoveredTensor,
    probeH,
    ownershipRuleId: 'BB11_HALF_OPEN_PATH_DIRECTION_SELECTOR_V1',
  });
}

function selectRecovery(rows, point, direction) {
  if (rows.length === 1) return rows[0];
  if (direction) {
    const scored = rows.map((row) => {
      const centroid = centroidOf(row.element.nodes.slice(0, 4));
      return { row, score: (centroid.r - point.r) * direction.r + (centroid.z - point.z) * direction.z };
    }).filter((entry) => entry.score >= -1e-10)
      .sort((a, b) => b.score - a.score || a.row.element.elementId.localeCompare(b.row.element.elementId));
    if (scored.length) return scored[0].row;
  }
  return [...rows].sort((a, b) => (
    b.recovered.minimumNaturalCoordinateMargin - a.recovered.minimumNaturalCoordinateMargin
    || a.element.elementId.localeCompare(b.element.elementId)
  ))[0];
}

function radialPath(pathId, z, r0, r1, expectedBlockId) {
  const start = { r: r0, z };
  const end = { r: r1, z };
  return pathRecord(pathId, start, end, expectedBlockId, 'RADIAL_PIPE_WALL');
}
function hubNormalPath(pathId, outer, expectedBlockId) {
  const inward = { r: -HUB_DIRECTION.z, z: HUB_DIRECTION.r };
  const distanceToBore = (outer.r - 50) / (-inward.r);
  const inner = add(outer, scale(inward, distanceToBore));
  return pathRecord(pathId, inner, outer, expectedBlockId, 'NORMAL_TO_HUB_WALL');
}
function axialPath(pathId, r, z0, z1, expectedBlockId) {
  return pathRecord(pathId, { r, z: z0 }, { r, z: z1 }, expectedBlockId, 'AXIAL_FLANGE_THICKNESS');
}
function pathRecord(pathId, start, end, expectedBlockId, pathType) {
  const throughWallDirection = unit({ r: end.r - start.r, z: end.z - start.z });
  const surfaceTangent = { r: throughWallDirection.z, z: -throughWallDirection.r };
  const points = Array.from({ length: PATH_STATION_COUNT }, (_, index) => ({
    r: start.r + (end.r - start.r) * index / (PATH_STATION_COUNT - 1),
    z: start.z + (end.z - start.z) * index / (PATH_STATION_COUNT - 1),
  }));
  return deepFreeze({ pathId, pathType, expectedBlockId, start, end, points, throughWallDirection, surfaceTangent });
}
function probeFromPath(probeId, path) { return { probeId, point: path.points[(PATH_STATION_COUNT - 1) / 2], expectedBlockId: path.expectedBlockId }; }
function selectorDirection(definition, index) {
  if (index === definition.points.length - 1) return scale(definition.throughWallDirection, -1);
  return definition.throughWallDirection;
}

function rotateTensor(stress, surface, throughWall) {
  const sr = stress.sigmaR;
  const sz = stress.sigmaZ;
  const trz = stress.tauRZ;
  return {
    sigmaSurface: sr * surface.r ** 2 + 2 * trz * surface.r * surface.z + sz * surface.z ** 2,
    sigmaThroughWall: sr * throughWall.r ** 2 + 2 * trz * throughWall.r * throughWall.z + sz * throughWall.z ** 2,
    tauSurfaceThroughWall: sr * surface.r * throughWall.r
      + trz * (surface.r * throughWall.z + surface.z * throughWall.r)
      + sz * surface.z * throughWall.z,
  };
}

function integrateSection(samples, definition) {
  const positions = [0];
  for (let index = 1; index < samples.length; index += 1) {
    positions.push(positions[index - 1] + distance(samples[index - 1].physicalCoordinate, samples[index].physicalCoordinate));
  }
  const length = positions.at(-1);
  const centroid = integrateTrapezoid(positions, samples.map((row) => row.physicalCoordinate.r * 2 * Math.PI), (s) => s)
    / integrateTrapezoid(positions, samples.map((row) => row.physicalCoordinate.r * 2 * Math.PI));
  const tractions = samples.map((row) => {
    const local = rotateTensor(row.recoveredTensor, definition.surfaceTangent, definition.throughWallDirection);
    return local.sigmaSurface;
  });
  const forceValues = samples.map((row, index) => tractions[index] * 2 * Math.PI * row.physicalCoordinate.r);
  const force = integrateTrapezoid(positions, forceValues);
  const momentValues = forceValues.map((value, index) => value * (positions[index] - centroid));
  const bendingMoment = integrateTrapezoid(positions, momentValues);
  return deepFreeze({
    circumferenceMeasureAppliedExactlyOnce: true,
    lineLength: length,
    weightedCentroid: centroid,
    membraneForceResultant: force,
    bendingMomentResultant: bendingMoment,
  });
}

function integrateTrapezoid(x, y, transform = null) {
  let total = 0;
  for (let index = 1; index < x.length; index += 1) {
    const left = transform ? y[index - 1] * transform(x[index - 1]) : y[index - 1];
    const right = transform ? y[index] * transform(x[index]) : y[index];
    total += (x[index] - x[index - 1]) * (left + right) / 2;
  }
  return total;
}

function diagnosticGaussPointMaxima(result) {
  const maxima = { sigmaR: 0, sigmaZ: 0, sigmaTheta: 0, tauRZ: 0 };
  result.elementResults.forEach((element) => element.gaussPointResults.forEach((point) => {
    Object.keys(maxima).forEach((key) => { maxima[key] = Math.max(maxima[key], Math.abs(point.stress[key])); });
  }));
  return deepFreeze({ authority: 'DIAGNOSTIC_ONLY', absoluteComponentMaxima: maxima });
}
function centroidOf(nodes) { return { r: nodes.reduce((sum, row) => sum + row.r, 0) / nodes.length, z: nodes.reduce((sum, row) => sum + row.z, 0) / nodes.length }; }
function inBoundingBox(point, nodes) { const rs = nodes.map((row) => row.r); const zs = nodes.map((row) => row.z); const e = 1e-9; return point.r >= Math.min(...rs) - e && point.r <= Math.max(...rs) + e && point.z >= Math.min(...zs) - e && point.z <= Math.max(...zs) + e; }
function add(a, b) { return { r: a.r + b.r, z: a.z + b.z }; }
function scale(a, value) { return { r: a.r * value, z: a.z * value }; }
function unit(value) { const length = Math.hypot(value.r, value.z); if (!(length > 0)) throw new RangeError('FH_ZERO_DIRECTION'); return { r: value.r / length, z: value.z / length }; }
function distance(a, b) { return Math.hypot(a.r - b.r, a.z - b.z); }
function requireGeometry(value) { if (!value || value.schema !== 'flange-hub-canonical-geometry/v1') throw new TypeError('FH_CANONICAL_GEOMETRY_REQUIRED'); }
function requireMeshAndResult(mesh, result) { if (!mesh || mesh.schema !== 'flange-hub-mesh-evidence/v1') throw new TypeError('FH_MESH_REQUIRED'); if (!result || result.schema !== 'flange-hub-load-case-result/v1' || result.meshHash !== mesh.meshHash) throw new TypeError('FH_MATCHING_RESULT_REQUIRED'); }
