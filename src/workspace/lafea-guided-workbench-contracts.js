/** Public pure contracts for guided discretization; no execution authority. */
export {
  LAFEA_DISCRETIZATION_MODES,
  LAFEA_DISCRETIZATION_VIEW_MODEL_SCHEMA,
  buildLafeaDiscretizationViewModel,
} from './lafea-discretization-view-model.js';
export {
  LAFEA_GUIDED_STEP_STATUSES,
  LAFEA_GUIDED_WORKFLOW_SCHEMA,
  buildLafeaGuidedWorkflow,
} from './lafea-guided-workflow.js';
export {
  LAFEA_MESH_CAPABILITIES_SCHEMA,
  lafeaMeshCapabilities,
} from './lafea-mesh-capabilities.js';
export {
  LAFEA_MESH_GENERATION_INTENT_SCHEMA,
  LAFEA_MESH_GENERATION_INTENT_STATUS,
  createLafeaMeshGenerationIntent,
} from './lafea-mesh-generation-intent.js';
export {
  LAFEA_MESH_REFINEMENT_COMMAND_SCHEMA,
  LAFEA_MESH_REFINEMENT_KINDS,
  createLafeaMeshRefinementCommand,
} from './lafea-mesh-refinement-command.js';
export {
  LAFEA_MESH_REQUEST_READINESS_SCHEMA,
  LAFEA_MESH_STAGE_ADAPTER_SCHEMA,
  lafeaMeshStageAdapter,
  projectLafeaMeshRequestReadiness,
} from './lafea-mesh-stage-adapter.js';
export {
  buildLafeaMeshGenerationIntentFromStage,
  buildLafeaMeshRefinementCommandFromStage,
} from './lafea-mesh-stage-request.js';
