import {
  LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
  generateLafeaLugPinholeT6Mesh,
} from '../core/lafea-meshing/index.js';
import { normalizeLafeaStageDocument } from './lafea-workbench-model.js';
import { batchError, deepFreeze } from './lafea-lug-pinhole-physical-problem-contract.js';

const FEATURE_ROLES = Object.freeze([
  'HOLE_BOUNDARY', 'OUTER_BOUNDARY',
  'RADIAL_QUARTER_0', 'RADIAL_QUARTER_1',
  'RADIAL_QUARTER_2', 'RADIAL_QUARTER_3',
]);

export function buildProjectedLevels(input) {
  const provisional = input.levels.map((level) => ({
    level,
    meshPackage: generateLafeaLugPinholeT6Mesh({
      schema: LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
      meshIdentity: level.meshIdentity,
      center: input.geometry.center,
      holeRadius: input.geometry.holeRadius,
      outerRadius: input.geometry.outerRadius,
      radialDivisions: level.radialDivisions,
      circumferentialDivisions: level.circumferentialDivisions,
      startAngleDegrees: input.geometry.startAngleDegrees,
    }),
  }));
  const baseCounts = featureCounts(provisional[0].meshPackage.featureSets);
  return deepFreeze(provisional.map((row, index) => buildLevel({
    ordinal: index + 1,
    meshPackage: row.meshPackage,
    physicalProblem: input.physicalProblem,
    featureProjection: input.featureProjection,
    baseCounts,
    center: input.geometry.center,
  })));
}

export function assertDocumentMatchesMesh(document, meshEvidence) {
  const nodes = new Map(document.nodes.map((row) => [row.nodeId, row]));
  if (nodes.size !== meshEvidence.mesh.nodes.length) {
    throw batchError('LAFEA_NB_T6C_DOCUMENT_NODE_SET_MISMATCH');
  }
  for (const meshNode of meshEvidence.mesh.nodes) {
    const node = nodes.get(meshNode.nodeId);
    if (!node || node.x !== meshNode.x || node.y !== meshNode.y || meshNode.z !== 0) {
      throw batchError('LAFEA_NB_T6C_DOCUMENT_NODE_COORDINATE_MISMATCH');
    }
  }
  const elements = new Map(document.elements.map((row) => [row.elementId, row]));
  if (elements.size !== meshEvidence.mesh.elements.length) {
    throw batchError('LAFEA_NB_T6C_DOCUMENT_ELEMENT_SET_MISMATCH');
  }
  for (const meshElement of meshEvidence.mesh.elements) {
    const element = elements.get(meshElement.elementId);
    if (!element || element.elementType !== 'T6'
      || JSON.stringify(element.nodeIds) !== JSON.stringify(meshElement.nodeIds)) {
      throw batchError('LAFEA_NB_T6C_DOCUMENT_CONNECTIVITY_MISMATCH');
    }
  }
}

export function mappingDeclaration(level, physicalProblem, featureProjection, schema) {
  const loadCase = level.document.loadCases.find(
    (row) => row.loadCaseId === physicalProblem.loadCase.loadCaseId,
  );
  const boundary = new Set(level.boundaryEdges[0]);
  return {
    schema,
    templateId: 'C2D-LUG-PINHOLE',
    stageId: 'LAFEA.3',
    materialRegion: {
      materialId: physicalProblem.material.materialId,
      elementIds: level.document.elements.map((row) => row.elementId),
    },
    loadEdge: {
      featureId: featureProjection.loadFeature.featureId,
      loadCaseId: physicalProblem.loadCase.loadCaseId,
      edgeNodeIds: [...level.loadEdges[0]],
      loadIds: loadCase.nodalForces.map((row) => row.loadId).sort(),
      expectedResultant: [...physicalProblem.loadCase.resultant],
      tolerance: featureProjection.loadTolerance,
    },
    boundaryEdge: {
      featureId: featureProjection.boundaryFeature.featureId,
      edgeNodeIds: [...level.boundaryEdges[0]],
      constraintIds: level.document.constraints
        .filter((row) => boundary.has(row.nodeId))
        .map((row) => row.constraintId).sort(),
    },
  };
}

function buildLevel({
  ordinal, meshPackage, physicalProblem, featureProjection, baseCounts, center,
}) {
  const loadEdges = selectProjectedEdges(
    meshPackage.featureSets,
    featureProjection.loadFeature,
    baseCounts,
  );
  const boundaryEdges = selectProjectedEdges(
    meshPackage.featureSets,
    featureProjection.boundaryFeature,
    baseCounts,
  );
  const loadEdgeNodeIds = uniqueNodes(loadEdges);
  const boundaryEdgeNodeIds = uniqueNodes(boundaryEdges);
  if (sameSet(loadEdgeNodeIds, boundaryEdgeNodeIds)) {
    throw batchError('LAFEA_NB_T6C_LOAD_BOUNDARY_REGION_NOT_DISTINCT');
  }
  const nodalForces = distributeResultant(
    meshPackage.mesh,
    loadEdges,
    physicalProblem.loadCase,
  );
  const constraints = createConstraints(
    meshPackage.mesh,
    boundaryEdgeNodeIds,
    physicalProblem.kinematics,
    center,
  );
  const document = normalizeLafeaStageDocument('LAFEA.3', {
    schema: 'local-continuum-model/v1',
    modelIdentity: physicalProblem.modelIdentity,
    modelVersion: physicalProblem.modelVersion,
    sourceAncestry: physicalProblem.sourceAncestry,
    units: physicalProblem.units,
    formulation: 'PLANE_STRESS',
    materials: [physicalProblem.material],
    nodes: meshPackage.mesh.nodes.map((node) => ({
      nodeId: node.nodeId,
      x: node.x,
      y: node.y,
      sourceReference: `NODE#${node.nodeId}`,
    })),
    elements: meshPackage.mesh.elements.map((element) => ({
      elementId: element.elementId,
      elementType: 'T6',
      nodeIds: element.nodeIds,
      materialId: physicalProblem.material.materialId,
      thickness: physicalProblem.thickness,
      sourceReference: `ELEMENT#${element.elementId}`,
    })),
    elementTypePolicy: {
      allowT3Fallback: false,
      sourceReference: 'NB-T6C/T6-ONLY',
    },
    constraints,
    loadCases: [{
      loadCaseId: physicalProblem.loadCase.loadCaseId,
      nodalForces,
      edgeTractions: [], pressureLoads: [], bodyForces: [],
      temperatureLoads: [], imposedDisplacements: [],
      sourceReference: physicalProblem.loadCase.sourceReference,
    }],
    resultRequests: physicalProblem.resultRequests,
    qualificationProfile: physicalProblem.qualificationProfile,
    limitations: physicalProblem.limitations,
  });
  return deepFreeze({
    ordinal,
    meshPackage,
    document,
    loadEdges,
    boundaryEdges,
    loadEdgeNodeIds,
    boundaryEdgeNodeIds,
    loadResultant: sumForces(nodalForces),
  });
}

function selectProjectedEdges(featureSets, declaration, baseCounts) {
  const edges = featureEdges(featureSets, declaration.role);
  const baseTotal = baseCounts[declaration.role];
  const factor = edges.length / baseTotal;
  const start = declaration.baseStartEdge * factor;
  const count = declaration.baseEdgeCount * factor;
  if (!Number.isInteger(start) || !Number.isInteger(count) || count < 1
    || declaration.baseStartEdge >= baseTotal) {
    throw batchError('LAFEA_NB_T6C_FEATURE_REFINEMENT_NOT_INTEGRAL');
  }
  const circular = ['HOLE_BOUNDARY', 'OUTER_BOUNDARY'].includes(declaration.role);
  const selected = [];
  for (let offset = 0; offset < count; offset += 1) {
    const index = circular ? (start + offset) % edges.length : start + offset;
    if (!edges[index]) throw batchError('LAFEA_NB_T6C_FEATURE_WINDOW_OUT_OF_RANGE');
    selected.push([...edges[index]]);
  }
  return deepFreeze(selected);
}

function featureCounts(featureSets) {
  return Object.freeze(Object.fromEntries(
    FEATURE_ROLES.map((role) => [role, featureEdges(featureSets, role).length]),
  ));
}

function featureEdges(featureSets, role) {
  if (role === 'HOLE_BOUNDARY') return featureSets.holeBoundary.edgeNodeIds;
  if (role === 'OUTER_BOUNDARY') return featureSets.outerBoundary.edgeNodeIds;
  const line = featureSets.radialLines.find((row) => row.role === role);
  if (!line) throw batchError('LAFEA_NB_T6C_FEATURE_ROLE_MISSING');
  const edges = [];
  for (let index = 0; index + 2 < line.nodeIds.length; index += 2) {
    edges.push([line.nodeIds[index], line.nodeIds[index + 1], line.nodeIds[index + 2]]);
  }
  return edges;
}

function distributeResultant(mesh, edges, loadCase) {
  const nodes = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  const weights = new Map();
  for (const edge of edges) {
    const points = edge.map((nodeId) => nodes.get(nodeId));
    if (points.some((point) => !point)) throw batchError('LAFEA_NB_T6C_LOAD_EDGE_NODE_MISSING');
    const length = distance(points[0], points[1]) + distance(points[1], points[2]);
    edge.forEach((nodeId, index) => {
      const weight = [1 / 6, 4 / 6, 1 / 6][index] * length;
      weights.set(nodeId, (weights.get(nodeId) ?? 0) + weight);
    });
  }
  const rows = [...weights].sort(([a], [b]) => a.localeCompare(b));
  const total = rows.reduce((sum, [, weight]) => sum + weight, 0);
  if (!(total > 0)) throw batchError('LAFEA_NB_T6C_LOAD_DISTRIBUTION_INVALID');
  let assignedX = 0;
  let assignedY = 0;
  return rows.map(([nodeId, weight], index) => {
    const last = index === rows.length - 1;
    const fx = last ? loadCase.resultant[0] - assignedX
      : loadCase.resultant[0] * weight / total;
    const fy = last ? loadCase.resultant[1] - assignedY
      : loadCase.resultant[1] * weight / total;
    assignedX += fx;
    assignedY += fy;
    return {
      loadId: `${loadCase.loadIdPrefix}-${index + 1}`,
      nodeId,
      fx: clean(fx),
      fy: clean(fy),
      sourceReference: `${loadCase.sourceReference}#${nodeId}`,
    };
  });
}

function createConstraints(mesh, boundaryNodeIds, kinematics, center) {
  const selected = kinematics.mode === 'AFFINE_FULL_FIELD'
    ? mesh.nodes.map((row) => row.nodeId) : boundaryNodeIds;
  const nodes = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  return [...new Set(selected)].sort().flatMap((nodeId) => {
    const node = nodes.get(nodeId);
    if (!node) throw batchError('LAFEA_NB_T6C_BOUNDARY_NODE_MISSING');
    return ['UX', 'UY'].map((dof) => ({
      constraintId: `C-${nodeId}-${dof}`,
      nodeId,
      dof,
      value: fieldValue(dof === 'UX' ? kinematics.ux : kinematics.uy, node, center),
      sourceReference: `CONSTRAINT#${nodeId}-${dof}`,
    }));
  });
}

function fieldValue(field, node, center) {
  return clean(field.xCoefficient * (node.x - center.x)
    + field.yCoefficient * (node.y - center.y) + field.constant);
}
function sumForces(loads) {
  return loads.reduce((sum, row) => [sum[0] + row.fx, sum[1] + row.fy], [0, 0])
    .map((number) => clean(number));
}
function uniqueNodes(edges) { return [...new Set(edges.flat())].sort(); }
function sameSet(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clean(value) {
  if (!Number.isFinite(value)) throw batchError('LAFEA_NB_T6C_NONFINITE_NUMBER');
  return Math.abs(value) < 1e-14 || Object.is(value, -0) ? 0 : value;
}
