import { edgeKey } from './lafea-bucket-01-mesh-math.js';

export function inspectBucket01MeshTopology(mesh, featureSets, nodeById) {
  const errors = [];
  if (nodeById.size !== mesh.nodes.length) errors.push('DUPLICATE_NODE_ID');
  const elementIds = new Set(mesh.elements.map((row) => row.elementId));
  if (elementIds.size !== mesh.elements.length) errors.push('DUPLICATE_ELEMENT_ID');
  const edgeMap = new Map();
  const nodeToElements = new Map();
  for (const element of mesh.elements) {
    if (element.elementType !== 'T6' || !Array.isArray(element.nodeIds)
      || element.nodeIds.length !== 6) {
      errors.push('NON_T6_OR_INVALID_CONNECTIVITY');
      continue;
    }
    if (element.nodeIds.some((nodeId) => !nodeById.has(nodeId))) {
      errors.push('ELEMENT_NODE_MISSING');
      continue;
    }
    for (const nodeId of element.nodeIds) {
      if (!nodeToElements.has(nodeId)) nodeToElements.set(nodeId, []);
      nodeToElements.get(nodeId).push(element.elementId);
    }
    for (const [aIndex, bIndex, midIndex] of [[0, 1, 3], [1, 2, 4], [2, 0, 5]]) {
      const key = edgeKey(element.nodeIds[aIndex], element.nodeIds[bIndex]);
      const entry = edgeMap.get(key) ?? { midsideIds: new Set(), elementIds: [] };
      entry.midsideIds.add(element.nodeIds[midIndex]);
      entry.elementIds.push(element.elementId);
      edgeMap.set(key, entry);
    }
  }
  if ([...edgeMap.values()].some((entry) => entry.midsideIds.size !== 1)) {
    errors.push('SHARED_EDGE_MIDSIDE_IDENTITY_MISMATCH');
  }
  if ([...edgeMap.values()].some((entry) => entry.elementIds.length > 2)) {
    errors.push('NON_MANIFOLD_EDGE');
  }
  const boundaryTriplets = [
    ...(featureSets.holeBoundary?.edgeNodeIds ?? []),
    ...(featureSets.outerBoundary?.edgeNodeIds ?? []),
  ];
  const boundaryKeys = new Set();
  for (const triplet of boundaryTriplets) {
    if (!Array.isArray(triplet) || triplet.length !== 3
      || triplet.some((nodeId) => !nodeById.has(nodeId))) {
      errors.push('BOUNDARY_FEATURE_EDGE_INVALID');
      continue;
    }
    const key = edgeKey(triplet[0], triplet[2]);
    boundaryKeys.add(key);
    const entry = edgeMap.get(key);
    if (!entry || entry.elementIds.length !== 1
      || !entry.midsideIds.has(triplet[1])) {
      errors.push('BOUNDARY_FEATURE_EDGE_NOT_MESH_BOUNDARY');
    }
  }
  for (const [key, entry] of edgeMap.entries()) {
    if (entry.elementIds.length !== (boundaryKeys.has(key) ? 1 : 2)) {
      errors.push('EDGE_INCIDENCE_INVALID');
      break;
    }
  }
  if ((featureSets.holeBoundary?.edgeNodeIds?.length ?? 0) === 0
    || (featureSets.outerBoundary?.edgeNodeIds?.length ?? 0) === 0
    || !Array.isArray(featureSets.radialLines)
    || featureSets.radialLines.length !== 4
    || featureSets.radialLines.some((row) => !Array.isArray(row.nodeIds)
      || row.nodeIds.length === 0
      || row.nodeIds.some((nodeId) => !nodeById.has(nodeId)))) {
    errors.push('FEATURE_SET_COMPLETENESS_FAILED');
  }
  const connectedComponentCount = componentCount(mesh.elements, nodeToElements);
  if (connectedComponentCount !== 1) errors.push('DISCONNECTED_ELEMENT_REGION');
  return Object.freeze({
    nodeCount: mesh.nodes.length,
    elementCount: mesh.elements.length,
    uniqueEdgeCount: edgeMap.size,
    boundaryEdgeCount: boundaryKeys.size,
    connectedComponentCount,
    sharedEdgeIdentityAccepted:
      !errors.includes('SHARED_EDGE_MIDSIDE_IDENTITY_MISMATCH'),
    featureSetsComplete: !errors.includes('FEATURE_SET_COMPLETENESS_FAILED'),
    errors: Object.freeze([...new Set(errors)].sort()),
  });
}

function componentCount(elements, nodeToElements) {
  if (!elements.length) return 0;
  const byId = new Map(elements.map((row) => [row.elementId, row]));
  const visited = new Set();
  let count = 0;
  for (const element of elements) {
    if (visited.has(element.elementId)) continue;
    count += 1;
    const queue = [element.elementId];
    visited.add(element.elementId);
    while (queue.length) {
      const current = byId.get(queue.shift());
      for (const nodeId of current.nodeIds) {
        for (const neighbour of nodeToElements.get(nodeId) ?? []) {
          if (!visited.has(neighbour)) {
            visited.add(neighbour);
            queue.push(neighbour);
          }
        }
      }
    }
  }
  return count;
}
