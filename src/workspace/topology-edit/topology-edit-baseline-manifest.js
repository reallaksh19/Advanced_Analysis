/**
 * Topology Edit Draft — Phase 0 Baseline Manifest & Anti-Drift Contract
 *
 * Source Baseline: reallaksh19/XML_Compare_Utilities@c20bb037566d52ba5b789712594b754a5fb94651
 * Target Baseline: reallaksh19/Advanced_Analysis@c085e96504ee3b16b4bc9cf6a3a4c5b48bac8cee
 */

export const TOPOLOGY_EDIT_BASELINE_MANIFEST = Object.freeze({
  schema: 'advanced-topology-edit-baseline-manifest/v1',
  sourceRepository: 'reallaksh19/XML_Compare_Utilities',
  sourceCommit: 'c20bb037566d52ba5b789712594b754a5fb94651',
  targetRepository: 'reallaksh19/Advanced_Analysis',
  targetCommit: 'c085e96504ee3b16b4bc9cf6a3a4c5b48bac8cee',
  isolationRules: Object.freeze([
    'WorkspaceState.dataset remains 100% immutable during active Edit Draft sessions.',
    'Rendered Three.js object IDs must never replace canonical engineering entity IDs.',
    'Draft edits are accumulated in a deterministic command journal before workspace commit.',
    'Downstream topology, load calculation, and FEA evidence invalidate strictly on workspace commit.',
  ]),
});

export function verifySourceImmutability(originalDatasetSnapshot, currentDatasetSnapshot) {
  if (!originalDatasetSnapshot || !currentDatasetSnapshot) return true;
  return originalDatasetSnapshot.datasetId === currentDatasetSnapshot.datasetId &&
         originalDatasetSnapshot.version === currentDatasetSnapshot.version;
}
