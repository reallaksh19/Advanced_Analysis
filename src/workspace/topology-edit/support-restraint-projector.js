/** Pure support/restraint projection into disposable viewport records. */
import { deepFreeze } from '../../core/shared-piping-model/index.js';
import { restraintColor } from './support-restraint-family.js';
import { addPoint, positiveNumber, scaleVector } from './topology-edit-geometry-math.js';

export function projectSupportGeometryToViewport(overlays, policy = {}) {
  const arrowLengthMm = positiveNumber(policy.arrowLengthMm) ?? 80;
  const arrowRadiusMm = positiveNumber(policy.arrowRadiusMm) ?? 5;
  const markerSizeMm = positiveNumber(policy.markerSizeMm) ?? 20;
  const elements = [];
  const segments = [];
  for (const overlay of overlays || []) {
    if (overlay.origin) elements.push(supportMarker(overlay, markerSizeMm));
    for (const restraint of overlay.restraints || []) {
      const segment = restraintSegment(overlay, restraint, arrowLengthMm, arrowRadiusMm);
      if (segment) segments.push(segment);
    }
  }
  return deepFreeze({ elements, segments });
}

function restraintSegment(overlay, restraint, arrowLengthMm, arrowRadiusMm) {
  if (!overlay.origin || !restraint.direction) return null;
  return {
    id: `${restraint.restraintId}:direction`,
    entityId: restraint.restraintId,
    type: 'RESTRAINT_DIRECTION',
    start: overlay.origin,
    end: addPoint(overlay.origin, scaleVector(restraint.direction, arrowLengthMm)),
    radiusMm: arrowRadiusMm,
    colorInt: restraintColor(restraint.family),
    pickTarget: restraintPick(overlay, restraint),
  };
}

function supportMarker(overlay, markerSizeMm) {
  return {
    id: overlay.supportId,
    entityId: overlay.supportId,
    type: 'SUPPORT',
    x: overlay.origin.x,
    y: overlay.origin.y,
    z: overlay.origin.z,
    sizeMm: markerSizeMm,
    pickTarget: {
      objectKind: 'support',
      objectId: overlay.supportId,
      supportId: overlay.supportId,
    },
  };
}

function restraintPick(overlay, restraint) {
  return {
    objectKind: 'restraint',
    objectId: restraint.restraintId,
    supportId: overlay.supportId,
    restraintId: restraint.restraintId,
    restraintFamily: restraint.family,
    sourcePaths: restraint.sourcePaths,
  };
}
