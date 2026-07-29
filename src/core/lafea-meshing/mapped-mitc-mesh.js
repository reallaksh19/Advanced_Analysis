import { LafeaMeshingError } from './errors.js';

/**
 * Mapped structured meshing for a logically-4-sided region (spec §10.2:
 * "Mapped MITC4 where topology permits; triangular transition elements only
 * where required."). Q8 default here since spec §7/§10.2 default the
 * continuum/shell mesh to quadratic elements; the actual MITC4 *shell
 * stiffness formulation* is a later phase's concern (`local-shell`) — this
 * module only produces the mapped node grid and Q8 connectivity.
 *
 * Each of the four boundary chains must already be discretized at the same
 * quadratic-edge density as its opposite side (`bottom`/`top` both have
 * `2*columns+1` points; `left`/`right` both have `2*rows+1`) and must share
 * exact corner points. A mismatch is rejected with `MAPPED_MESH_TOPOLOGY_MISMATCH`
 * — the caller's declared, explicit fallback is triangular transition
 * meshing (the T6 generator in `constrained-delaunay-t6.js`), never a
 * silently degraded mapped mesh.
 *
 * Construction: bilinear transfinite (Coons-patch) blending of the four
 * boundaries onto a fine structured grid, exact at every boundary node
 * (including curved boundaries, since the caller supplies true analytic
 * boundary points) and smoothly interpolated at every interior node.
 */
export function mappedTransfiniteMesh(bottom, top, left, right) {
  validateChain(bottom, 'bottom');
  validateChain(top, 'top');
  validateChain(left, 'left');
  validateChain(right, 'right');
  if (bottom.length !== top.length) {
    throw new LafeaMeshingError('bottom and top boundary chains must have equal length', 'MAPPED_MESH_TOPOLOGY_MISMATCH');
  }
  if (left.length !== right.length) {
    throw new LafeaMeshingError('left and right boundary chains must have equal length', 'MAPPED_MESH_TOPOLOGY_MISMATCH');
  }
  if ((bottom.length - 1) % 2 !== 0 || (left.length - 1) % 2 !== 0) {
    throw new LafeaMeshingError('Boundary chains must have an odd point count (2*n+1) for quadratic density', 'MAPPED_MESH_TOPOLOGY_MISMATCH');
  }
  requireCoincident(bottom[0], left[0], 'bottom[0] and left[0] (corner 00)');
  requireCoincident(bottom[bottom.length - 1], right[0], 'bottom[last] and right[0] (corner 10)');
  requireCoincident(top[0], left[left.length - 1], 'top[0] and left[last] (corner 01)');
  requireCoincident(top[top.length - 1], right[right.length - 1], 'top[last] and right[last] (corner 11)');

  const nu = bottom.length - 1;
  const nv = left.length - 1;
  const c00 = bottom[0]; const c10 = bottom[nu]; const c01 = top[0]; const c11 = top[nu];

  const grid = [];
  for (let j = 0; j <= nv; j += 1) {
    const row = [];
    for (let i = 0; i <= nu; i += 1) {
      const u = i / nu; const v = j / nv;
      row.push(blend(bottom[i], top[i], left[j], right[j], c00, c10, c01, c11, u, v));
    }
    grid.push(row);
  }

  const columns = nu / 2; const rows = nv / 2;
  const elements = [];
  let elementIndex = 0;
  for (let J = 0; J < rows; J += 1) {
    for (let I = 0; I < columns; I += 1) {
      const gi = 2 * I; const gj = 2 * J;
      const corners = [grid[gj][gi], grid[gj][gi + 2], grid[gj + 2][gi + 2], grid[gj + 2][gi]];
      const midsides = [grid[gj][gi + 1], grid[gj + 1][gi + 2], grid[gj + 2][gi + 1], grid[gj + 1][gi]];
      elements.push(Object.freeze({ elementIndex, elementType: 'Q8', nodes: Object.freeze([...corners, ...midsides]) }));
      elementIndex += 1;
    }
  }
  return Object.freeze({ grid: Object.freeze(grid.map((row) => Object.freeze(row))), elements: Object.freeze(elements), columns, rows });
}

function blend(b, t, l, r, c00, c10, c01, c11, u, v) {
  const x = (1 - v) * b.x + v * t.x + (1 - u) * l.x + u * r.x
    - ((1 - u) * (1 - v) * c00.x + u * (1 - v) * c10.x + (1 - u) * v * c01.x + u * v * c11.x);
  const y = (1 - v) * b.y + v * t.y + (1 - u) * l.y + u * r.y
    - ((1 - u) * (1 - v) * c00.y + u * (1 - v) * c10.y + (1 - u) * v * c01.y + u * v * c11.y);
  return Object.freeze({ x, y });
}

function validateChain(chain, label) {
  if (!Array.isArray(chain) || chain.length < 3) {
    throw new LafeaMeshingError(`${label} boundary chain must have at least 3 points`, 'INVALID_BOUNDARY_CHAIN');
  }
}

function requireCoincident(a, b, label) {
  if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-9) {
    throw new LafeaMeshingError(`${label} do not coincide`, 'MAPPED_MESH_TOPOLOGY_MISMATCH');
  }
}
