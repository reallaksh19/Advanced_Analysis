import { footprintError } from './errors.js';
import { codeUnitCompare, semanticHash } from './json.js';
import { norm, subtract } from './vector.js';

export function canonicalFootprint(source, shellTemplate, profile) {
  const ordered = [...source.orderedNodeIds];
  if (ordered.length < 3 || new Set(ordered).size !== ordered.length) throw footprintError('INVALID_FOOTPRINT_NODE_SET', 'footprint.orderedNodeIds', 'Footprint requires at least three unique nodes.');
  const nodeMap = new Map(shellTemplate.nodes.map((node) => [node.nodeId, node]));
  for (const nodeId of ordered) if (!nodeMap.has(nodeId)) throw footprintError('FOOTPRINT_NODE_MISSING', 'footprint.orderedNodeIds', `Footprint node ${nodeId} is missing from the shell template.`);
  const edgeSet = meshEdges(shellTemplate.elements);
  for (let index = 0; index < ordered.length; index += 1) {
    const next = ordered[(index + 1) % ordered.length];
    if (!edgeSet.has(edgeKey(ordered[index], next))) throw footprintError('FOOTPRINT_EDGE_MISSING', 'footprint.orderedNodeIds', `Footprint edge ${ordered[index]}-${next} is missing from the mesh.`);
  }
  const canonicalNodeIds = canonicalCycle(ordered);
  const edgeEvidence = edgeLengths(canonicalNodeIds, nodeMap, profile);
  const perimeter = edgeEvidence.reduce((sum, edge) => sum + edge.length, 0);
  const perimeterQualification = lowerBoundQualification(perimeter, perimeter, profile.footprintPerimeter);
  if (!perimeterQualification.accepted) throw footprintError('FOOTPRINT_PERIMETER_UNQUALIFIED', 'footprint', 'Footprint perimeter is numerically unqualified.', perimeterQualification);
  const tributaryWeights = canonicalNodeIds.map((nodeId, index) => {
    const previous = edgeEvidence[(index + edgeEvidence.length - 1) % edgeEvidence.length].length;
    const next = edgeEvidence[index].length;
    const tributaryLength = 0.5 * (previous + next);
    return { nodeId, previousEdgeLength: previous, nextEdgeLength: next, tributaryLength, normalizedWeight: tributaryLength / perimeter };
  });
  const body = {
    footprintIdentity: source.footprintIdentity,
    orderedNodeIds: canonicalNodeIds,
    referencePoint: [...source.referencePoint],
    sourceReference: source.sourceReference,
    edges: edgeEvidence,
    perimeter,
    perimeterQualification,
    tributaryWeights,
  };
  return { ...body, footprintGeometryHash: semanticHash(body) };
}

export function canonicalCycle(values) {
  const candidates = [];
  for (const sequence of [values, [...values].reverse()]) {
    for (let offset = 0; offset < sequence.length; offset += 1) candidates.push([...sequence.slice(offset), ...sequence.slice(0, offset)]);
  }
  candidates.sort((left, right) => codeUnitCompare(left.join('\u0000'), right.join('\u0000')));
  return candidates[0];
}
function edgeLengths(nodeIds, nodeMap, profile) {
  return nodeIds.map((nodeId, index) => {
    const nextNodeId = nodeIds[(index + 1) % nodeIds.length];
    const length = norm(subtract(nodeMap.get(nextNodeId).position, nodeMap.get(nodeId).position));
    const minimumLengthQualification = lowerBoundQualification(length, length, profile.footprintMinimumEdge);
    if (!minimumLengthQualification.accepted) throw footprintError('FOOTPRINT_EDGE_UNQUALIFIED', 'footprint', `Footprint edge ${nodeId}-${nextNodeId} is too short.`, minimumLengthQualification);
    return { edgeId: edgeKey(nodeId, nextNodeId), startNodeId: nodeId, endNodeId: nextNodeId, length, minimumLengthQualification };
  });
}
function meshEdges(elements) {
  const result = new Set();
  for (const element of elements) {
    const [a, b, c] = element.nodeIds;
    result.add(edgeKey(a, b)); result.add(edgeKey(b, c)); result.add(edgeKey(c, a));
  }
  return result;
}
function edgeKey(left, right) { return [left, right].sort(codeUnitCompare).join('\u0000'); }
function lowerBoundQualification(value, scaleValue, rule) {
  const threshold = rule.absolute + rule.relative * Math.max(1, scaleValue);
  return { actual: value, scale: scaleValue, tolerance: threshold, accepted: value > threshold };
}