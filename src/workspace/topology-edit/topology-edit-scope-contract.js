/**
 * Topology Edit Draft — Phase 8 Scope & Large-Model Filtering Contract
 *
 * Provides branch-based scoping for large piping models (>500 components, >5 MiB):
 * - Maintains model-wide authority while filtering interactive WebGL scene rendering.
 * - Enforces target authorization checks so out-of-scope operations are rejected safely.
 */

export const TOPOLOGY_EDIT_SCOPE_CONTRACT = 'advanced-topology-edit-scope-contract/v1';

export function createTopologyEditScopeContract(input = {}) {
  const selectedBranchIds = new Set(input.selectedBranchIds || []);
  
  return Object.freeze({
    schema: TOPOLOGY_EDIT_SCOPE_CONTRACT,
    componentThreshold: input.componentThreshold || 500,
    byteThreshold: input.byteThreshold || 5 * 1024 * 1024,
    sourceHash: input.sourceHash || '',
    selectedBranchIds: Object.freeze([...selectedBranchIds].sort()),
    
    isBranchInScope(branchId) {
      if (selectedBranchIds.size === 0) return true; // Default: All branches in scope
      return selectedBranchIds.has(branchId);
    },

    filterEntitiesByScope(entities = []) {
      if (selectedBranchIds.size === 0) return entities;
      return entities.filter(e => !e.branchId || selectedBranchIds.has(e.branchId));
    },
  });
}
