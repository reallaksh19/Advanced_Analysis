import { normalizeLafeaStageDocument } from './lafea-workbench-model.js';
import { batchError, deepFreeze } from './lafea-lug-pinhole-physical-problem-contract.js';

export function buildLafeaBucket01CandidateProjectedLevels(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !Array.isArray(input.meshPackages)
    || input.meshPackages.length !== 4) {
    throw batchError('LAFEA_B01_CANDIDATE_PROJECTOR_INPUT_INVALID');
  }
  return deepFreeze(input.meshPackages.map((meshPackage, index) => {
    const mappingWindow = meshPackage?.mappingWindow;
    if (!mappingWindow
      || mappingWindow.ordinal !== index + 1
      || mappingWindow.radialStart !== 20
      || mappingWindow.radialEnd !== 60
      || mappingWindow.exactEndpointNodes !== true
      || mappingWindow.physicalCoordinateSelection !== true
      || mappingWindow.indexScaledSelectionUsed !== false
      || mappingWindow.loadFeatureRole !== input.featureProjection.loadFeature.role
      || mappingWindow.restraintFeatureRole
        !== input.featureProjection.boundaryFeature.role) {
      throw batchError('LAFEA_B01_CANDIDATE_MAPPING_WINDOW_INVALID');
    }
    const loadEdges = edgesFromQuadraticPath(mappingWindow.loadNodeIds);
    const boundaryEdges = edgesFromQuadraticPath(
      mappingWindow.restraintNodeIds,
    );
    return buildLevel({
      ordinal: index + 1,
      meshPackage,
      physicalProblem: input.physicalProblem,
      center: input.center,
      loadEdges,
      boundaryEdges,
    });
  }));
}

export function assertLafeaBucket01CandidateDocumentMatchesMesh(
  document,
  meshEvidence,
) {
  const nodes = new Map(document.nodes.map((row) => [row.nodeId, row]));
  if (nodes.size !== meshEvidence.mesh.nodes.length) {
    throw batchError('LAFEA_B01_CANDIDATE_DOCUMENT_NODE_SET_MISMATCH');
  }
  for (const meshNode of meshEvidence.mesh.nodes) {
    const node = nodes.get(meshNode.nodeId);
    if (!node || node.x !== meshNode.x || node.y !== meshNode.y
      || meshNode.z !== 0) {
      throw batchError('LAFEA_B01_CANDIDATE_DOCUMENT_COORDINATE_MISMATCH');
    }
  }
  const elements = new Map(document.elements.map((row) => [row.elementId, row]));
  if (elements.size !== meshEvidence.mesh.elements.length) {
    throw batchError('LAFEA_B01_CANDIDATE_DOCUMENT_ELEMENT_SET_MISMATCH');
  }
  for (const meshElement of meshEvidence.mesh.elements) {
    const element = elements.get(meshElement.elementId);
    if (!element || element.elementType !== 'T6'
      || JSON.stringify(element.nodeIds)
        !== JSON.stringify(meshElement.nodeIds)) {
      throw batchError('LAFEA_B01_CANDIDATE_DOCUMENT_CONNECTIVITY_MISMATCH');
    }
  }
}

function buildLevel({
  ordinal,
  meshPackage,
  physicalProblem,
  center,
  loadEdges,
  boundaryEdges,
}) {
  const loadEdgeNodeIds = uniqueNodes(loadEdges);
  const boundaryEdgeNodeIds = uniqueNodes(boundaryEdges);
  if (sameSet(loadEdgeNodeIds, boundaryEdgeNodeIds)) {
    throw batchError('LAFEA_B01_CANDIDATE_LOAD_BOUNDARY_NOT_DISTINCT');
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
      sourceReference: 'B01-CANDIDATE/T6-ONLY',
    },
    constraints,
    loadCases: [{
      loadCaseId: physicalProblem.loadCase.loadCaseId,
      nodalForces,
      edgeTractions: [],
      pressureLoads: [],
      bodyForces: [],
      temperatureLoads: [],
      imposedDisplacements: [],
      sourceReference: physicalProblem.loadCase.sourceReference,
    }],
    resultRequests: physicalProblem.resultRequests,
    qualificationProfile: physicalProblem.qualificationProfile,
    limitations: [
      ...physicalProblem.limitations,
      'BUCKET_01_PROBE_STABLE_V3_CANDIDATE_ONLY',
    ],
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
    mappingAuthority: {
      schema: 'lafea-bucket-01-candidate-physical-window-mapping/v1',
      radialStart: meshPackage.mappingWindow.radialStart,
      radialEnd: meshPackage.mappingWindow.radialEnd,
      mappingWindowHash: meshPackage.mappingWindowHash,
      physicalCoordinateSelection: true,
      indexScaledSelectionUsed: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  });
}

function edgesFromQuadraticPath(nodeIds) {
  if (!Array.isArray(nodeIds) || nodeIds.length < 3
    || nodeIds.length % 2 !== 1) {
    throw batchError('LAFEA_B01_CANDIDATE_MAPPING_PATH_INVALID');
  }
  const edges = [];
  for (let index = 0; index + 2 < nodeIds.length; index += 2) {
    edges.push([nodeIds[index], nodeIds[index + 1], nodeIds[index + 2]]);
  }
  return deepFreeze(edges);
}

function distributeResultant(mesh, edges, loadCase) {
  const nodes = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  const weights = new Map();
  for (const edge of edges) {
    const points = edge.map((nodeId) => nodes.get(nodeId));
    if (points.some((point) => !point)) {
      throw batchError('LAFEA_B01_CANDIDATE_LOAD_EDGE_NODE_MISSING');
    }
    const length = distance(points[0], points[1])
      + distance(points[1], points[2]);
    edge.forEach((nodeId, index) => {
      const weight = [1 / 6, 4 / 6, 1 / 6][index] * length;
      weights.set(nodeId, (weights.get(nodeId) ?? 0) + weight);
    });
  }
  const rows = [...weights].sort(([a], [b]) => a.localeCompare(b));
  const total = rows.reduce((sum, [, weight]) => sum + weight, 0);
  if (!(total > 0)) {
    throw batchError('LAFEA_B01_CANDIDATE_LOAD_DISTRIBUTION_INVALID');
  }
  let assignedX = 0;
  let assignedY = 0;
  return rows.map(([nodeId, weight], index) => {
    const last = index === rows.length - 1;
    const fx = last
      ? loadCase.resultant[0] - assignedX
      : loadCase.resultant[0] * weight / total;
    const fy = last
      ? loadCase.resultant[1] - assignedY
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
    ? mesh.nodes.map((row) => row.nodeId)
    : boundaryNodeIds;
  const nodes = new Map(mesh.nodes.map((row) => [row.nodeId, row]));
  return [...new Set(selected)].sort().flatMap((nodeId) => {
    const node = nodes.get(nodeId);
    if (!node) {
      throw batchError('LAFEA_B01_CANDIDATE_BOUNDARY_NODE_MISSING');
    }
    return ['UX', 'UY'].map((dof) => ({
      constraintId: `C-${nodeId}-${dof}`,
      nodeId,
      dof,
      value: fieldValue(
        dof === 'UX' ? kinematics.ux : kinematics.uy,
        node,
        center,
      ),
      sourceReference: `CONSTRAINT#${nodeId}-${dof}`,
    }));
  });
}

function fieldValue(field, node, center) {
  return clean(field.xCoefficient * (node.x - center.x)
    + field.yCoefficient * (node.y - center.y)
    + field.constant);
}
function sumForces(loads) {
  return loads.reduce(
    (sum, row) => [sum[0] + row.fx, sum[1] + row.fy],
    [0, 0],
  ).map((number) => clean(number));
}
function uniqueNodes(edges) {
  return [...new Set(edges.flat())].sort();
}
function sameSet(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
function clean(value) {
  if (!Number.isFinite(value)) {
    throw batchError('LAFEA_B01_CANDIDATE_NONFINITE_NUMBER');
  }
  return Math.abs(value) < 1e-14 || Object.is(value, -0) ? 0 : value;
}
