import { deepFreeze, requireFiniteNumber } from './contracts.js';
import { EMPIRICAL_FAILURE_CODES, empiricalFailure } from './failure-codes.js';

export function buildPlanarMemberAxes(nodeI, nodeJ) {
  const xi = requireFiniteNumber(nodeI?.xM, 'nodeI.xM');
  const yi = requireFiniteNumber(nodeI?.yM, 'nodeI.yM');
  const xj = requireFiniteNumber(nodeJ?.xM, 'nodeJ.xM');
  const yj = requireFiniteNumber(nodeJ?.yM, 'nodeJ.yM');
  const dx = xj - xi;
  const dy = yj - yi;
  const lengthM = Math.hypot(dx, dy);
  if (!(lengthM > 0)) {
    throw empiricalFailure(
      EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
      'Planar member has zero length.',
      { nodeI, nodeJ },
    );
  }
  const c = dx / lengthM;
  const s = dy / lengthM;
  const transformGlobalToLocal = [
    [c, s, 0, 0, 0, 0],
    [-s, c, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0],
    [0, 0, 0, c, s, 0],
    [0, 0, 0, -s, c, 0],
    [0, 0, 0, 0, 0, 1],
  ];
  return deepFreeze({ lengthM, c, s, transformGlobalToLocal });
}

export function projectGlobalVectorToLocal(axes, vector) {
  const x = requireFiniteNumber(vector?.x, 'vector.x');
  const y = requireFiniteNumber(vector?.y, 'vector.y');
  return deepFreeze({
    x: (axes.c * x) + (axes.s * y),
    y: (-axes.s * x) + (axes.c * y),
  });
}

export function transformLocalVectorToGlobal(axes, vector) {
  const x = requireFiniteNumber(vector?.x, 'vector.x');
  const y = requireFiniteNumber(vector?.y, 'vector.y');
  return deepFreeze({
    x: (axes.c * x) - (axes.s * y),
    y: (axes.s * x) + (axes.c * y),
  });
}
