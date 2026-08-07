/**
 * Deprecated compatibility surface for the former analysis-mesh store decorator.
 *
 * WP-AC1 moved mesh custody state into the canonical orchestrator through the
 * listener-free `createLafeaWorkbenchMeshState(...)` slice. This file retains
 * only discoverable compatibility metadata; it owns no state and publishes
 * nothing.
 */
export {
  createLafeaWorkbenchMeshState,
} from './lafea-workbench-mesh-state.js';

export const LAFEA_ANALYSIS_MESH_PUBLIC_STORE_APIS = Object.freeze([
  'registerAnalysisMeshEvidence',
  'recoverAnalysisMeshEvidence',
]);
