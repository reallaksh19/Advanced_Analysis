import { LafeaLinearSolveError } from './errors.js';

/**
 * Entity-attributed mechanism diagnosis (spec §11: "Disconnected components,
 * unrestrained rigid-body modes, near-zero pivots and constraint conflicts
 * reported by entity."). Every diagnostic names the offending node/DOF/
 * constraint identity — never a generic "singular matrix".
 */

/**
 * Connected components of the DOF adjacency graph implied by the sparse
 * matrix's nonzero pattern (two DOFs are adjacent iff they share a nonzero
 * off-diagonal entry, i.e. they were coupled by some element/constraint).
 *
 * @param {Readonly<object>} matrix `assembleSparseSymmetric` output.
 * @param {readonly string[]} dofIdentities Caller-declared identity per DOF index.
 * @returns {readonly {componentId: number, dofIdentities: readonly string[]}[]}
 */
export function findDisconnectedComponents(matrix, dofIdentities) {
  const { size, rows } = matrix;
  const adjacency = Array.from({ length: size }, () => new Set());
  for (let row = 0; row < size; row += 1) {
    for (const [column] of rows[row]) {
      if (column === row) continue;
      adjacency[row].add(column);
      adjacency[column].add(row);
    }
  }
  const visited = new Array(size).fill(false);
  const components = [];
  for (let start = 0; start < size; start += 1) {
    if (visited[start]) continue;
    const stack = [start];
    const member = [];
    visited[start] = true;
    while (stack.length > 0) {
      const current = stack.pop();
      member.push(current);
      for (const neighbor of adjacency[current]) if (!visited[neighbor]) { visited[neighbor] = true; stack.push(neighbor); }
    }
    member.sort((a, b) => a - b);
    components.push(Object.freeze({ componentId: components.length, dofIndices: Object.freeze(member), dofIdentities: Object.freeze(member.map((index) => dofIdentities[index])) }));
  }
  return Object.freeze(components);
}

/**
 * Components that have no prescribed (constrained) DOF at all are
 * unrestrained — a rigid-body or floating mechanism by construction,
 * independent of any pivot value.
 */
export function findUnrestrainedComponents(components, prescribedIndexSet) {
  return Object.freeze(components.filter((component) => !component.dofIndices.some((index) => prescribedIndexSet.has(index))));
}

/**
 * Duplicate or directly conflicting prescribed-displacement declarations at
 * the same DOF (spec: "constraint conflicts reported by entity").
 *
 * @param {readonly {dofIdentity:string, value:number}[]} constraints
 */
export function findConstraintConflicts(constraints) {
  const byDof = new Map();
  for (const constraint of constraints) {
    if (!byDof.has(constraint.dofIdentity)) byDof.set(constraint.dofIdentity, []);
    byDof.get(constraint.dofIdentity).push(constraint.value);
  }
  const conflicts = [];
  for (const [dofIdentity, values] of byDof) {
    if (values.length < 2) continue;
    const distinct = new Set(values);
    conflicts.push(Object.freeze({ dofIdentity, declaredValues: Object.freeze([...values]), consistent: distinct.size === 1 }));
  }
  return Object.freeze(conflicts.filter((conflict) => !conflict.consistent));
}

/**
 * Report a near-zero (or negative, for an SPD-expected system) pivot by the
 * exact DOF identity it belongs to, from a factorization's pivot evidence.
 */
export function diagnoseNearZeroPivot(pivotValue, pivotTolerance, dofIndex, dofIdentities) {
  if (Math.abs(pivotValue) > pivotTolerance) return null;
  return Object.freeze({
    dofIndex,
    dofIdentity: dofIdentities[dofIndex],
    pivotValue,
    pivotTolerance,
    diagnosis: pivotValue <= 0 ? 'NON_POSITIVE_PIVOT' : 'NEAR_ZERO_PIVOT',
  });
}

/**
 * Full mechanism diagnosis, run before attempting a factorization that
 * would otherwise fail with a generic pivot error. Fails closed with every
 * offending entity named, never a bare "singular system".
 */
export function diagnoseMechanisms(matrix, dofIdentities, constraints, prescribedIndexSet) {
  const components = findDisconnectedComponents(matrix, dofIdentities);
  const unrestrained = findUnrestrainedComponents(components, prescribedIndexSet);
  const conflicts = findConstraintConflicts(constraints);
  const diagnostics = [];
  if (components.length > 1) {
    diagnostics.push(Object.freeze({ code: 'DISCONNECTED_COMPONENTS', componentCount: components.length, components }));
  }
  if (unrestrained.length > 0) {
    diagnostics.push(Object.freeze({ code: 'UNRESTRAINED_RIGID_BODY_COMPONENT', components: unrestrained }));
  }
  if (conflicts.length > 0) {
    diagnostics.push(Object.freeze({ code: 'CONFLICTING_PRESCRIBED_DISPLACEMENT', conflicts }));
  }
  return Object.freeze({ diagnostics: Object.freeze(diagnostics), mechanismFree: diagnostics.length === 0 });
}

export function requireMechanismFree(diagnosis) {
  if (!diagnosis.mechanismFree) {
    throw new LafeaLinearSolveError(
      `Mechanism diagnosis found ${diagnosis.diagnostics.length} issue(s): ${diagnosis.diagnostics.map((d) => d.code).join(', ')}`,
      'MECHANISM_DETECTED',
      diagnosis,
    );
  }
  return diagnosis;
}
