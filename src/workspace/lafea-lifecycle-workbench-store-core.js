/**
 * Deprecated compatibility alias for the former lifecycle workbench core.
 *
 * State ownership moved to `lafea-workbench-orchestrator-store.js` in WP-AC1.
 * This module contains no store implementation, listener set, overlay, or
 * publication boundary.
 */
export {
  LAFEA_CALCULATION_STATES,
  LAFEA_CODE_STATES,
  LAFEA_LIFECYCLE_BINDING_SCHEMA,
  LAFEA_LIFECYCLE_BINDING_STATUSES,
  LAFEA_RELEASE_STATES,
  LAFEA_RESULT_STATES,
  LAFEA_WORKBENCH_STATE_SCHEMA,
  createLafeaWorkbenchOrchestratorStore as createLafeaWorkbenchStoreCore,
} from './lafea-workbench-orchestrator-store.js';
