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
const MAPPING_SOLVE_TOLERANCE = 1e-11;

export function createFlangeHubPathDefinitions(geometry) {
  requireGeometry(geometry);
  const smallOuter = add(geometry.fillets[0].secondTangent, scale(HUB_DIRECTION, 3));
  const hubMidOuter = { r: 75.5, z: 30 };
  const largeOuter = add(geometry.fillets[1].firstTangent, scale(HUB_DIRECTION, -5));
  const paths = [
    radialPath('SCL-PIPE-REMOTE', -80, 50, 60, ['FH-B00']),
    hubNormalPath('SCL-HUB-SMALL', smallOuter, ['FH-B02']),
    hubNormalPath('SCL-HUB-MID', hubMidOuter, ['FH-B04', 'FH-B05']),
    hubNormalPath('SCL-HUB-LARGE', largeOuter, ['FH-B05']),
    axialPath('SCL-FLANGE-INNER', 100, 60, 90, ['FH-B06']),
    axialPath('SCL-FLANGE-MID', 110, 60, 90, ['FH-B06']),
  ];
  const probes = [
    probeFromPath('P-PIPE-REMOTE', paths[0]),
    probeFromPath('P-HUB-SMALL', paths[1]),
    {
      probeId: 'P-HUB-MID',
      point: { r: 62.75, z: 30 },
      expectedBlockIds: ['FH-B04'],
      sideSelectorId: 'POSITIVE_Z_SIDE_OF_Z30_INTERFACE',
    },
    probeFromPath('P-HUB-LARGE', paths[3]),
    { probeId: 'P-FLANGE-INNER', point: { r: 100, z: 75 }, expectedBlockIds: ['FH-B06'] },
    { probeId: 'P-FLANGE-MID', point: { r: 110, z: 75 }, expectedBlockIds: ['FH-B06'] },
    { probeId: 'P-FLANGE-OUTER', point: { r: 115, z: 75 }, expectedBlockIds: ['FH-B06'] },
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
    elementRows,
    displacementByNode,
    selectorDirection: definition.sideSelectorId === 'POSITIVE_Z_SIDE_OF_Z30_INTERFACE'
      ? { r: 0, z: 1 }
      : null,
  }));
  const paths = pathDefinitions.paths.map((definition) => recoverPath({ definition, elementRows, displacementByNode }));
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
      mappingSolveTolerance: MAPPING_SOLVE_TOLERANCE,
      mappingAcceptanceRule: 'MAX_1E-10_OR_1E-10_TIMES_PROBE_H',
      nearestNodeSubstitutionUsed: false,
      displaySmoothedStressAuthoritative: false,
      diagnosticMaximaGrantQualification: false,
    },
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function recoverPath({ definition, elementRows, displacementByNode }) {
  const samples = definition.points.map((point, index) => recoverPoint({
    definition: {
      probeId: `${definition.pathId}:S${String(index + 1).padStart(2, '0')}`,
      point,
      expectedBlockIds: definition.expectedBlockIds,
    },
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
  const scl = linearizeStressComponents(sclSamples, { lineIdentity: definition.pathId, pressureCorrection: null });
  const section = integrateSection(samples, definition);
  const probeH = Math.max(...samples.map((row) => row.probeH));
  return deepFreeze({
    pathId: definition.pathId,
    expectedBlockIds: definition.expectedBlockIds,
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

function recoverPoint({ definition, elementRows, displacementByNode, selectorDirection }) {
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
        mappingTolerance: MAPPING_SOLVE_TOLERANCE,
      });
      recoveries.push({ element, recovered });
    } catch (error) {
      if (!(error instanceof RangeError && /POINT_NOT_CONTAINED/.test(error.message))) throw error;
    }
  });
  if (recoveries.length === 0) throw new RangeError(`FH_NO_CONTAINING_ELEMENT:${definition.probeId}`);
  const expectedBlockIds = normalizeExpectedBlocks(definition);
  const expected = recoveries.filter((row) => expectedBlockIds.includes(row.element.blockId));
  if (expected.length === 0) throw new RangeError(`FH_PROBE_BLOCK_OWNERSHIP_MISMATCH:${definition.probeId}`);
  const selected = selectRecovery(expected, definition.point, selectorDirection);
  const cornerNodes = selected.element.nodes.slice(0, 4);
  const probeH = Math.max(...cornerNodes.map((node, index) => distance(node, cornerNodes[(index + 1) % 4])));
  const mappingAcceptanceTolerance = Math.max(1e-10, 1e-10 * probeH);
  if (selected.recovered.mappingResidual > mappingAcceptanceTolerance) {
    throw new RangeError(`FH_MAPPING_RESIDUAL_EXCEEDED:${definition.probeId}`);
  }
  return deepFreeze({
    probeId: definition.probeId,
    physicalCoordinate: definition.point,
    expectedBlockIds,
    candidateElementIds: recoveries.map((row) => row.element.elementId).sort(),
    candidateBlockIds: [...new Set(recoveries.map((row) => row.element.blockId))].sort(),
    selectedContainingElementId: selected.element.elementId,
    selectedBlockId: selected.element.blockId,
    naturalCoordinates: selected.recovered.naturalCoordinates,
    mappingResidual: selected.recovered.mappingResidual,
    mappingSolveTolerance: MAPPING_SOLVE_TOLERANCE,
    mappingAcceptanceTolerance,
    minimumNaturalCoordinateMargin: selected.recovered.minimumNaturalCoordinateMargin,
    sourceGaussPointIds: selected.recovered.sourceGaussPointIds,
    sourceGaussPoints: selected.recovered.sourceGaussPoints,
    interpolationWeights: selected.recovered.interpolationWeights,
    displacement: selected.recovered.displacement,
    recoveredTensor: selected.recovered.recoveredTensor,
    probeH,
    ownershipRuleId: 'BB11_GOVERNED_BLOCK_SET_AND_DIRECTION_SELECTOR_V2',
  });
}

function selectRecovery(rows, point, direction) {
  if (rows.length === 1) return rows[0];
  if (direction) {
    const scored = rows.map((row) => {
      const centroid = centroidOf(row.element.nodes.slice(0, 4));
      return {
        row,
        score: (centroid.r - point.r) * direction.r + (centroid.z - point.z) * direction.z,
      };
    }).filter((entry) => entry.score >= -1e-10)
      .sort((left, right) => right.score - left.score || left.row.element.elementId.localeCompare(right.row.element.elementId));
    if (scored.length) return scored[0].row;
  }
  return [...rows].sort((left, right) => (
    right.recovered.minimumNaturalCoordinateMargin - left.recovered.minimumNaturalCoordinateMargin
    || left.element.elementId.localeCompare(right.element.elementId)
  ))[0];
}

function radialPath(pathId, z, r0, r1, expectedBlockIds) {
  return pathRecord(pathId, { r: r0, z }, { r: r1, z }, expectedBlockIds, 'RADIAL_PIPE_WALL');
}
function hubNormalPath(pathId, outer, expectedBlockIds) {
  const inward = { r: -HUB_DIRECTION.z, z: HUB_DIRECTION.r };
  const distanceToBore = (outer.r - 50) / (-inward.r);
  const inner = add(outer, scale(inward, distanceToBore));
  return pathRecord(pathId, inner, outer, expectedBlockIds, 'NORMAL_TO_HUB_WALL');
}
function axialPath(pathId, r, z0, z1, expectedBlockIds) {
  return pathRecord(pathId, { r, z: z0 }, { r, z: z1 }, expectedBlockIds, 'AXIAL_FLANGE_THICKNESS');
}
function pathRecord(pathId, start, end, expectedBlockIds, pathType) {
  const throughWallDirection = unit({ r: end.r - start.r, z: end.z - start.z });
  const surfaceTangent = { r: throughWallDirection.z, z: -throughWallDirection.r };
  const points = Array.from({ length: PATH_STATION_COUNT }, (_, index) => ({
    r: start.r + (end.r - start.r) * index / (PATH_STATION_COUNT - 1),
    z: start.z + (end.z - start.z) * index / (PATH_STATION_COUNT - 1),
  }));
  return deepFreeze({
    pathId,
    pathType,
    expectedBlockIds: [...expectedBlockIds],
    start,
    end,
    points,
    throughWallDirection,
    surfaceTangent,
  });
}
function probeFromPath(probeId, path) {
  return {
    probeId,
    point: path.points[(PATH_STATION_COUNT - 1) / 2],
    expectedBlockIds: path.expectedBlockIds,
  };
}
function selectorDirection(definition, index) {
  if (index === definition.points.length - 1) return scale(definition.throughWallDirection, -1);
  return definition.throughWallDirection;
}
function normalizeExpectedBlocks(definition) {
  const values = definition.expectedBlockIds ?? (definition.expectedBlockId ? [definition.expectedBlockId] : []);
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== 'string' || !value)) {
    throw new TypeError('FH_EXPECTED_BLOCK_CUSTODY_REQUIRED');
  }
  return [...new Set(values)].sort();
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
  const circumferenceWeights = samples.map((row) => row.physicalCoordinate.r * 2 * Math.PI);
  const centroid = integrateTrapezoid(positions, circumferenceWeights, (position) => position)
    / integrateTrapezoid(positions, circumferenceWeights);
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
    Object.keys(maxima).forEach((key) => {
      maxima[key] = Math.max(maxima[key], Math.abs(point.stress[key]));
    });
  }));
  return deepFreeze({ authority: 'DIAGNOSTIC_ONLY', absoluteComponentMaxima: maxima });
}
function centroidOf(nodes) {
  return {
    r: nodes.reduce((sum, row) => sum + row.r, 0) / nodes.length,
    z: nodes.reduce((sum, row) => sum + row.z, 0) / nodes.length,
  };
}
function inBoundingBox(point, nodes) {
  const radii = nodes.map((row) => row.r);
  const axial = nodes.map((row) => row.z);
  const tolerance = 1e-9;
  return point.r >= Math.min(...radii) - tolerance
    && point.r <= Math.max(...radii) + tolerance
    && point.z >= Math.min(...axial) - tolerance
    && point.z <= Math.max(...axial) + tolerance;
}
function add(left, right) { return { r: left.r + right.r, z: left.z + right.z }; }
function scale(value, factor) { return { r: value.r * factor, z: value.z * factor }; }
function unit(value) {
  const length = Math.hypot(value.r, value.z);
  if (!(length > 0)) throw new RangeError('FH_ZERO_DIRECTION');
  return { r: value.r / length, z: value.z / length };
}
function distance(left, right) { return Math.hypot(left.r - right.r, left.z - right.z); }
function requireGeometry(value) {
  if (!value || value.schema !== 'flange-hub-canonical-geometry/v1') throw new TypeError('FH_CANONICAL_GEOMETRY_REQUIRED');
}
function requireMeshAndResult(mesh, result) {
  if (!mesh || mesh.schema !== 'flange-hub-mesh-evidence/v1') throw new TypeError('FH_MESH_REQUIRED');
  if (!result || result.schema !== 'flange-hub-load-case-result/v1' || result.meshHash !== mesh.meshHash) {
    throw new TypeError('FH_MATCHING_RESULT_REQUIRED');
  }
}
