import { geometryError } from './errors.js';
import { qualification } from './numeric.js';
import { add, cross, dot, norm, scale, subtract } from './vector.js';

export function qualifyGeometry(shellTemplate, pipe, trunnion, footprintIds, profile) {
  const pipeAxis = axisEvidence(pipe.axisDirection, 'pipeGeometry.axisDirection', profile);
  const trunnionAxis = axisEvidence(trunnion.axisDirection, 'trunnionGeometry.axisDirection', profile);
  const nonParallelValue = norm(cross(pipe.axisDirection, trunnion.axisDirection));
  const nonParallel = lowerBoundQualification(nonParallelValue, 1, profile.axisNonParallel);
  if (!nonParallel.accepted) throw geometryError('DEGENERATE_AXES', 'trunnionGeometry.axisDirection', 'Initial support requires stable non-parallel pipe and trunnion axes.', nonParallel);
  const footprintSet = new Set(footprintIds);
  const nodeEvidence = shellTemplate.nodes.map((node) => qualifyNode(node, pipe, trunnion, footprintSet.has(node.nodeId), profile));
  return { pipeAxis, trunnionAxis, axisNonParallel: nonParallel, nodeEvidence };
}

function axisEvidence(direction, path, profile) {
  const length = norm(direction);
  const evidence = qualification(length - 1, 1, profile.axisUnitVector);
  if (!evidence.accepted) throw geometryError('AXIS_NOT_UNIT', path, `${path} must be unit length.`, evidence);
  return { direction: [...direction], length, qualification: evidence };
}
function qualifyNode(node, pipe, trunnion, footprint, profile) {
  const pipeRadial = radialEvidence(node.position, pipe.axisPoint, pipe.axisDirection, pipe.midsurfaceRadius, pipe.radialTolerance, profile.pipeRadialDistance);
  if (!pipeRadial.accepted) throw geometryError('PIPE_NODE_OFF_CYLINDER', `shellTemplate.nodes.${node.nodeId}`, `Node ${node.nodeId} is not on the pipe midsurface cylinder.`, pipeRadial);
  const alignmentResidual = 1 - dot(node.director, pipeRadial.outwardDirection);
  const directorAlignment = qualification(alignmentResidual, 1, profile.pipeDirectorAlignment);
  if (!directorAlignment.accepted) throw geometryError('PIPE_DIRECTOR_MISALIGNED', `shellTemplate.nodes.${node.nodeId}.director`, `Node ${node.nodeId} director is not outward radial.`, directorAlignment);
  const result = { nodeId: node.nodeId, pipeRadial, directorAlignment, footprintNode: footprint };
  if (footprint) {
    const intersection = radialEvidence(node.position, trunnion.axisPoint, trunnion.axisDirection, trunnion.outerRadius, trunnion.intersectionTolerance, profile.trunnionIntersection);
    if (!intersection.accepted) throw geometryError('FOOTPRINT_NODE_OFF_TRUNNION', `footprint.${node.nodeId}`, `Footprint node ${node.nodeId} is not on the trunnion cylinder.`, intersection);
    result.trunnionRadial = intersection;
  }
  return result;
}
function radialEvidence(point, axisPoint, axisDirection, radius, declaredTolerance, rule) {
  const relative = subtract(point, axisPoint);
  const axialCoordinate = dot(relative, axisDirection);
  const closestPoint = add(axisPoint, scale(axisDirection, axialCoordinate));
  const radialVector = subtract(point, closestPoint);
  const radialDistance = norm(radialVector);
  const residual = radialDistance - radius;
  const profileQualification = qualification(residual, Math.max(radius, radialDistance), rule);
  const declaredToleranceQualification = { actual: Math.abs(residual), scale: Math.max(radius, radialDistance), tolerance: declaredTolerance, accepted: Math.abs(residual) <= declaredTolerance };
  return {
    axialCoordinate, closestPoint, radialVector, radialDistance,
    outwardDirection: radialDistance > 0 ? scale(radialVector, 1 / radialDistance) : [0, 0, 0],
    residual, profileQualification, declaredToleranceQualification,
    accepted: profileQualification.accepted && declaredToleranceQualification.accepted,
  };
}
function lowerBoundQualification(value, scaleValue, rule) {
  const threshold = rule.absolute + rule.relative * Math.max(1, scaleValue);
  return { actual: value, scale: scaleValue, tolerance: threshold, accepted: value > threshold };
}