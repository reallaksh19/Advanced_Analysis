import { ShellModelError } from './errors.js';
import { qualification, minimumQualification, maxAbs } from './numeric.js';
import { add, cross, dot, norm, normalize, scale, subtract } from './vector.js';

export function nodeBasisEvidence(node, profile) {
  const vectors = [node.director, node.rotationBasis1, node.rotationBasis2];
  const unitResidual = Math.max(...vectors.map((vector) => Math.abs(norm(vector) - 1)));
  const orthogonalityResidual = Math.max(
    Math.abs(dot(node.rotationBasis1, node.director)),
    Math.abs(dot(node.rotationBasis2, node.director)),
    Math.abs(dot(node.rotationBasis1, node.rotationBasis2)),
  );
  const handednessResidual = norm(subtract(cross(node.rotationBasis1, node.rotationBasis2), node.director));
  const evidence = {
    nodeId: node.nodeId,
    unitLength: qualification(unitResidual, 1, profile.nodeBasisUnit),
    orthogonality: qualification(orthogonalityResidual, 1, profile.nodeBasisOrthogonality),
    handedness: qualification(handednessResidual, 1, profile.nodeBasisHandedness),
  };
  if (!evidence.unitLength.accepted || !evidence.orthogonality.accepted || !evidence.handedness.accepted) {
    throw new ShellModelError(`Node ${node.nodeId} basis failed qualification`);
  }
  return evidence;
}

export function rawFacetFrame(nodes) {
  const edge12 = subtract(nodes[1].position, nodes[0].position);
  const edge13 = subtract(nodes[2].position, nodes[0].position);
  const areaVector = cross(edge12, edge13);
  const doubleArea = norm(areaVector);
  if (!(doubleArea > 0)) throw new ShellModelError('Facet has zero area');
  const ex = normalize(edge12);
  const ez = scale(areaVector, 1 / doubleArea);
  const ey = cross(ez, ex);
  return { ex, ey, ez, area: doubleArea / 2, edge12, edge13 };
}

export function canonicalFacet(nodeIds, nodeMap, profile, elementId) {
  const sorted = [...nodeIds].sort();
  const first = [sorted[0], sorted[1], sorted[2]];
  const second = [sorted[0], sorted[2], sorted[1]];
  const selected = selectOrientation(first, second, nodeMap, profile, elementId);
  const nodes = selected.nodeIds.map((nodeId) => nodeMap.get(nodeId));
  const frame = rawFacetFrame(nodes);
  const lengths = edgeLengths(nodes);
  const geometryScale = Math.max(...lengths);
  const threshold = profile.minimumFacetArea.absolute + profile.minimumFacetArea.relative * geometryScale ** 2;
  const areaQualification = { actual: frame.area, scale: geometryScale ** 2, tolerance: threshold, accepted: frame.area > threshold };
  if (!areaQualification.accepted) throw new ShellModelError(`Element ${elementId} facet area failed qualification`);
  return { nodeIds: selected.nodeIds, frame, geometryScale, areaQualification, alignments: selected.alignments };
}

function selectOrientation(first, second, nodeMap, profile, elementId) {
  const candidates = [first, second].map((nodeIds) => orientationEvidence(nodeIds, nodeMap, profile));
  const accepted = candidates.filter((item) => item.accepted);
  if (accepted.length !== 1) throw new ShellModelError(`Element ${elementId} has incoherent director alignment`);
  return accepted[0];
}

function orientationEvidence(nodeIds, nodeMap, profile) {
  const nodes = nodeIds.map((nodeId) => nodeMap.get(nodeId));
  const frame = rawFacetFrame(nodes);
  const alignments = nodes.map((node) => minimumQualification(dot(frame.ez, node.director), 1, profile.elementNormalDirectorAlignment));
  return { nodeIds, alignments, accepted: alignments.every((item) => item.accepted) };
}

export function localCoordinates(nodes, frame) {
  return nodes.map((node) => {
    const offset = subtract(node.position, nodes[0].position);
    return [dot(offset, frame.ex), dot(offset, frame.ey)];
  });
}

export function edgeLengths(nodes) {
  return [
    norm(subtract(nodes[1].position, nodes[0].position)),
    norm(subtract(nodes[2].position, nodes[1].position)),
    norm(subtract(nodes[0].position, nodes[2].position)),
  ];
}

export function facetCentroid(nodes) {
  return scale(nodes.reduce((total, node) => add(total, node.position), [0, 0, 0]), 1 / 3);
}

export function frameResidual(frame) {
  return maxAbs([
    norm(frame.ex) - 1,
    norm(frame.ey) - 1,
    norm(frame.ez) - 1,
    dot(frame.ex, frame.ey),
    dot(frame.ex, frame.ez),
    dot(frame.ey, frame.ez),
    ...subtract(cross(frame.ex, frame.ey), frame.ez),
  ]);
}
