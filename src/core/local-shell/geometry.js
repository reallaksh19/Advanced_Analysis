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

/**
 * Planar-quad facet frame (spec §8: MITC4's 4-node quad). Unlike a
 * triangle's `canonicalFacet`, a quad's declared node order is meaningful
 * (it IS the polygon) and is never permuted — only the two whole-quad
 * orientations (as declared, or fully reversed) are candidates, mirroring
 * the triangle path's declared-order-then-director-alignment selection
 * without inventing a different rule.
 *
 * The normal is the standard quadrilateral-diagonal formula
 * `n = d1 x d2` (with `Area = |n|/2`, exact for any simple planar
 * quadrilateral via the diagonals, convex or not) rather than a single
 * triangle's cross product, since a diagonal-only normal is far less
 * sensitive to which corner happens to be listed first.
 *
 * `ex` is Gram-Schmidt orthogonalized against `ez` rather than taken
 * directly as the first edge direction: for a quad that is only
 * approximately planar, the raw first-edge direction is not exactly
 * orthogonal to the diagonal-derived normal, and silently using it
 * unorthogonalized would make the local frame itself slightly skew.
 */
export function rawQuadFacetFrame(nodes) {
  const diagonal1 = subtract(nodes[2].position, nodes[0].position);
  const diagonal2 = subtract(nodes[3].position, nodes[1].position);
  const areaVector = cross(diagonal1, diagonal2);
  const doubleArea = norm(areaVector);
  if (!(doubleArea > 0)) throw new ShellModelError('Quad facet has zero area');
  const ez = scale(areaVector, 1 / doubleArea);
  const rawEx = subtract(nodes[1].position, nodes[0].position);
  const ex = normalize(subtract(rawEx, scale(ez, dot(rawEx, ez))));
  const ey = cross(ez, ex);
  return {
    ex, ey, ez, area: doubleArea / 2, diagonal1, diagonal2,
  };
}

export function quadPlanarityResidual(nodes, frame) {
  const centroid = scale(nodes.reduce((total, node) => add(total, node.position), [0, 0, 0]), 1 / nodes.length);
  return maxAbs(nodes.map((node) => dot(subtract(node.position, centroid), frame.ez)));
}

export function canonicalQuadFacet(nodeIds, nodeMap, profile, elementId) {
  const reversed = [nodeIds[0], nodeIds[3], nodeIds[2], nodeIds[1]];
  const selected = selectQuadOrientation([nodeIds, reversed], nodeMap, profile, elementId);
  const nodes = selected.nodeIds.map((nodeId) => nodeMap.get(nodeId));
  const frame = rawQuadFacetFrame(nodes);
  const lengths = quadEdgeLengths(nodes);
  const geometryScale = Math.max(...lengths, norm(subtract(nodes[2].position, nodes[0].position)), norm(subtract(nodes[3].position, nodes[1].position)));
  const areaThreshold = profile.minimumFacetArea.absolute + profile.minimumFacetArea.relative * geometryScale ** 2;
  const areaQualification = { actual: frame.area, scale: geometryScale ** 2, tolerance: areaThreshold, accepted: frame.area > areaThreshold };
  if (!areaQualification.accepted) throw new ShellModelError(`Element ${elementId} facet area failed qualification`);
  const planarityResidual = quadPlanarityResidual(nodes, frame);
  const planarityQualification = qualification(planarityResidual, geometryScale, profile.quadPlanarity);
  if (!planarityQualification.accepted) throw new ShellModelError(`Element ${elementId} is not sufficiently planar for a flat-facet MITC4 formulation`);
  return {
    nodeIds: selected.nodeIds, frame, geometryScale, areaQualification, planarityQualification, alignments: selected.alignments,
  };
}

function selectQuadOrientation(candidates, nodeMap, profile, elementId) {
  const evaluated = candidates.map((nodeIds) => quadOrientationEvidence(nodeIds, nodeMap, profile));
  const accepted = evaluated.filter((item) => item.accepted);
  if (accepted.length !== 1) throw new ShellModelError(`Element ${elementId} has incoherent director alignment`);
  return accepted[0];
}

function quadOrientationEvidence(nodeIds, nodeMap, profile) {
  const nodes = nodeIds.map((nodeId) => nodeMap.get(nodeId));
  const frame = rawQuadFacetFrame(nodes);
  const alignments = nodes.map((node) => minimumQualification(dot(frame.ez, node.director), 1, profile.elementNormalDirectorAlignment));
  return { nodeIds, alignments, accepted: alignments.every((item) => item.accepted) };
}

function quadEdgeLengths(nodes) {
  return nodes.map((node, index) => norm(subtract(nodes[(index + 1) % nodes.length].position, node.position)));
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
