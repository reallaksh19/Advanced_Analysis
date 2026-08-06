/** Public lifecycle workbench store with atomic analysis-mesh custody. */
import { decorateLafeaAnalysisMeshWorkbenchStore } from './lafea-analysis-mesh-workbench-store.js';
import { createLafeaWorkbenchStoreCore } from './lafea-lifecycle-workbench-store-core.js';

export {
  LAFEA_CALCULATION_STATES,
  LAFEA_CODE_STATES,
  LAFEA_LIFECYCLE_BINDING_SCHEMA,
  LAFEA_LIFECYCLE_BINDING_STATUSES,
  LAFEA_RELEASE_STATES,
  LAFEA_RESULT_STATES,
  LAFEA_WORKBENCH_STATE_SCHEMA,
} from './lafea-lifecycle-workbench-store-core.js';
export {
  createLafeaAnalysisMeshCustodyController,
} from './lafea-analysis-mesh-custody-controller.js';
export {
  LAFEA_ANALYSIS_MESH_CUSTODY_PROJECTION_SCHEMA,
  buildAnalysisMeshCustodyProjection,
} from './lafea-analysis-mesh-custody-projection.js';
export {
  validateLafeaAnalysisMeshEvidence,
} from './lafea-analysis-mesh-evidence-validator.js';

export function createLafeaWorkbenchStore(options) {
  return decorateLafeaAnalysisMeshWorkbenchStore(
    createLafeaWorkbenchStoreCore(options),
  );
}
