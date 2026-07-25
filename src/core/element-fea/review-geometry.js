import { deepFreeze } from '../shared-piping-model/immutable.js';
import { SCALED_GEOMETRY_AUTHORITY, compareIdentity } from './review-contract.js';

export function createGeometryReview(model, result, profile) {
  const displacement = displacementMap(result.nodalDisplacements);
  const nodes = model.nodes.map((node) => nodeRow(node, displacement, profile.deformationScale)).sort((a, b) => compareIdentity(a.nodeId, b.nodeId));
  const rawLocations = rawLocationMap(result);
  const elements = model.elements.map((element) => elementRow(element, model, rawLocations)).sort((a, b) => compareIdentity(a.elementId, b.elementId));
  const extents = geometryExtents(nodes, profile.deformationScale);
  return deepFreeze({ authority: SCALED_GEOMETRY_AUTHORITY, nodes, elements, extents });
}

function nodeRow(node, displacement, scale) {
  const ux = displacement.get(`${node.nodeId}:UX`) ?? 0;
  const uy = displacement.get(`${node.nodeId}:UY`) ?? 0;
  return {
    nodeId: node.nodeId,
    x: node.x,
    y: node.y,
    deformedX: node.x + scale * ux,
    deformedY: node.y + scale * uy,
    ux,
    uy,
    displacementMagnitude: Math.hypot(ux, uy),
    sourceSemanticHash: node.sourceSemanticHash,
    geometryAuthority: SCALED_GEOMETRY_AUTHORITY,
  };
}

function elementRow(element, model, rawLocations) {
  const planeStress = model.solverProfile.formulation === 'PLANE_STRESS';
  return {
    elementId: element.elementId,
    elementType: element.type,
    nodeIds: [...element.nodeIds],
    materialId: element.materialId,
    thickness: planeStress ? element.thickness : null,
    outOfPlaneScale: planeStress ? null : model.solverProfile.outOfPlaneScale,
    sourceSemanticHash: element.sourceSemanticHash,
    rawResultLocations: rawLocations.get(element.elementId) || [],
  };
}

function rawLocationMap(result) {
  const map = new Map();
  if (result.schema === 'fea-continuum-result/v1') {
    for (const row of result.elementStresses) map.set(row.elementId, ['T3_CONSTANT']);
    return map;
  }
  for (const row of result.integrationPointResults) map.set(row.elementId, [...(map.get(row.elementId) || []), row.integrationPointId].sort(compareIdentity));
  return map;
}

function geometryExtents(nodes, scale) {
  const governing = [...nodes].sort((a, b) => b.displacementMagnitude - a.displacementMagnitude || compareIdentity(a.nodeId, b.nodeId))[0];
  return {
    undeformed: bounds(nodes, 'x', 'y'),
    deformedReview: bounds(nodes, 'deformedX', 'deformedY'),
    maximumDisplacementMagnitude: governing?.displacementMagnitude || 0,
    governingNodeId: governing?.nodeId || null,
    deformationScale: scale,
    authority: SCALED_GEOMETRY_AUTHORITY,
  };
}

function bounds(rows, xKey, yKey) {
  const xs = rows.map((row) => row[xKey]);
  const ys = rows.map((row) => row[yKey]);
  return { minimumX: Math.min(...xs), maximumX: Math.max(...xs), minimumY: Math.min(...ys), maximumY: Math.max(...ys) };
}
function displacementMap(rows) {
  return new Map(rows.map((row) => [`${row.nodeId}:${row.component}`, row.value]));
}
