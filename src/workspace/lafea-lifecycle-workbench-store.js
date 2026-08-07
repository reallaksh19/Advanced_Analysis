/** Public lifecycle workbench store backed by one canonical orchestrator. */
import {
  createLafeaWorkbenchOrchestratorStore,
} from './lafea-workbench-orchestrator-store.js';

export {
  LAFEA_CALCULATION_STATES,
  LAFEA_CODE_STATES,
  LAFEA_LIFECYCLE_BINDING_SCHEMA,
  LAFEA_LIFECYCLE_BINDING_STATUSES,
  LAFEA_RELEASE_STATES,
  LAFEA_RESULT_STATES,
  LAFEA_WORKBENCH_STATE_SCHEMA,
} from './lafea-workbench-orchestrator-store.js';
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
export {
  LAFEA_STAGE_ANALYSIS_ADAPTER_SCHEMA,
  lafeaStageAnalysisAdapter,
  requireLafeaStageAnalysisAdapter,
} from './lafea-stage-analysis-adapter.js';
export {
  LAFEA_WORKBENCH_ORCHESTRATION_ORDER,
  LAFEA_WORKBENCH_ORCHESTRATION_SCHEMA,
  LAFEA_WORKBENCH_ORCHESTRATION_SECTION_SCHEMA,
  LAFEA_WORKBENCH_ORCHESTRATION_STATES,
  buildLafeaWorkbenchOrchestrationProjection,
} from './lafea-workbench-orchestration-projection.js';

export function createLafeaWorkbenchStore(options) {
  return createLafeaWorkbenchOrchestratorStore(options);
}
