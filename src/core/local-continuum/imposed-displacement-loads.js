/**
 * Per-load-case imposed displacement (spec §7.1 new load type). Unlike
 * `constraints` (model-level restraints, identical across every load case),
 * an `imposedDisplacement` is scoped to one load case only, letting
 * different load cases impose different prescribed motion on the same DOF
 * without changing the model's restraint set. `source-loads.js` already
 * rejects one at the same DOF as a model-level constraint
 * (`IMPOSED_DISPLACEMENT_CONFLICTS_WITH_MODEL_CONSTRAINT`) — this module
 * only resolves node/dof identities to global DOF indices for the solver's
 * partition.
 */
export function resolveImposedDisplacementIndices(imposedDisplacements, dofIndex) {
  return imposedDisplacements
    .map((row) => ({ index: dofIndex.get(`${row.nodeId}:${row.dof}`), value: row.value }))
    .sort((left, right) => left.index - right.index);
}
