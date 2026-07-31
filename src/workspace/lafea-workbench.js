/**
 * Public integration surface for the standalone LAFEA calculation workbench.
 */
import { LafeaWorkbenchController } from './lafea-workbench-controller.js';
import { LAFEA_WORKBENCH_STYLES, lafeaWorkbenchStyles } from './lafea-workbench-styles.js';

export { LafeaWorkbenchController };
export { LAFEA_WORKBENCH_STYLES, lafeaWorkbenchStyles };
export {
  LAFEA_ENGINE_STATES,
  LAFEA_PREVIEW_POLICIES,
  LAFEA_STAGE_CATEGORIES,
  LAFEA_STAGE_DEFINITIONS,
  LAFEA_STAGE_IDS,
  LAFEA_STAGE_REGISTRY,
  LAFEA_STAGE_REGISTRY_SCHEMA,
  lafeaRegisteredCollectionPaths,
  lafeaRegisteredExecutionSupported,
  lafeaRegisteredPreviewSource,
  requireLafeaStageRegistryEntry,
} from './lafea-stage-registry.js';
export {
  LAFEA_COLLECTION_IDENTITY_KEYS,
  LAFEA_INPUT_CONTROLS,
  LAFEA_INPUT_DESCRIPTOR_REVISION,
  LAFEA_INPUT_DESCRIPTOR_SCHEMA,
  LAFEA_INPUT_DOMAIN_TYPES,
  LAFEA_INVALIDATION_CLASSES,
  LAFEA_VALUE_STATES,
  lafeaCollectionIdentityKeys,
  lafeaStageInputDescriptors,
  requireLafeaInputDescriptor,
  resolveDescriptorEntity,
  resolveLafeaDescriptorSourceRef,
  resolveLafeaDescriptorUnit,
} from './lafea-stage-input-descriptors.js';
export {
  LAFEA_EDIT_COMMAND_SCHEMA,
  LAFEA_EDIT_OPERATIONS,
  LAFEA_EDIT_RESULT_SCHEMA,
  LAFEA_EDIT_STATUSES,
  allocateLafeaEntityIdentity,
  applyLafeaStageEditCommand,
  assertUniqueStageIdentities,
  classifyLafeaNumericInput,
  createLafeaAddEntityCommand,
  createLafeaDeleteEntityCommand,
  createLafeaDeleteFieldCommand,
  createLafeaReplaceDocumentCommand,
  createLafeaSetScalarCommand,
  lafeaDocumentDigest,
} from './lafea-edit-command.js';
export {
  LAFEA_ARTIFACT_KINDS,
  LAFEA_ARTIFACT_RECORD_SCHEMA,
  LAFEA_ARTIFACT_STATUSES,
  LAFEA_ARTIFACT_REGISTRATION_SCHEMA,
  LAFEA_LIFECYCLE_CHANGE_CLASSES,
  LAFEA_LIFECYCLE_EVENT_SCHEMA,
  LAFEA_LIFECYCLE_SCHEMA,
  LAFEA_QUALIFICATION_STATES,
  applyLafeaLifecycleEvent,
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  createLafeaLifecycleEvent,
  lafeaLifecycleReadiness,
  registerLafeaArtifact,
} from './lafea-lifecycle.js';
export {
  LAFEA_LIFECYCLE_BINDING_SCHEMA,
  LAFEA_LIFECYCLE_BINDING_STATUSES,
  LAFEA_WORKBENCH_STATE_SCHEMA,
  createLafeaWorkbenchStore,
} from './lafea-lifecycle-workbench-store.js';
export {
  LAFEA_SOURCE_PRIMITIVE_KINDS,
  LAFEA_SOURCE_PRIMITIVE_SCHEMA,
  LAFEA_SOURCE_RENDER_REQUEST_SCHEMA,
  createLafeaSourceEngineeringScene,
  createLafeaSourceRenderRequest,
  createLafeaSourceViewportState,
  validateSourceScene,
  validateSourceViewport,
} from './lafea-engineering-scene.js';
export {
  LAFEA_WORKBENCH_SOURCE_RENDER_POLICY,
  LAFEA_WORKBENCH_SOURCE_VIEWPORT_SCHEMA,
  createLafeaSourceWorkbenchViewportModel,
  mountLafeaSourceWorkbenchViewport,
} from './lafea-source-workbench-viewport.js';
export {
  LAFEA_RENDER_FIELD_SCHEMA,
  LAFEA_RENDER_LINEAGE_SCHEMA,
  LAFEA_RENDER_PACKET_V2_SCHEMA,
  LAFEA_RENDER_SOURCE_ELEMENT_TYPES,
  LAFEA_RENDER_VALUE_ROLES,
  LAFEA_SUPPORTED_COLOR_MAPS,
  requireRenderPacketV2,
  sealRenderPacketV2,
} from './lafea-canvas/render-packet-v2-contract.js';
export {
  LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
  LAFEA_RENDER_EVIDENCE_INTAKE_STATUSES,
  evaluateLafeaRenderEvidenceIntake,
} from './lafea-render-evidence-intake.js';
export {
  LAFEA_RESULT_RENDER_MODES,
  LAFEA_RESULT_RENDER_REQUEST_SCHEMA,
  createLafeaResultRenderRequest,
  requireLafeaResultRenderRequest,
} from './lafea-canvas/result-render-request.js';
export {
  LAFEA_THREE_RENDER_RESULT_SCHEMA,
  createThreeMeshRendererV2,
} from './lafea-canvas/three-mesh-renderer-v2.js';
export {
  LAFEA_HYBRID_RESULT_RENDER_POLICY,
  LAFEA_HYBRID_RESULT_VIEWPORT_SCHEMA,
  LAFEA_HYBRID_RESULT_VIEWPORT_STATUSES,
  createLafeaHybridResultViewportModel,
  mountLafeaHybridResultViewport,
} from './lafea-hybrid-result-viewport-public.js';
export {
  LAFEA_WORKBENCH_DOCUMENT_SCHEMA,
  executeLafeaStage,
  lafeaCollectionPaths,
  lafeaStageExecutionSupported,
  normalizeLafeaStageEdit,
  normalizeLafeaStageDocument,
} from './lafea-workbench-model.js';
export { lafeaPreviewGeometry } from './lafea-stage-preview.js';

/**
 * Mount and initialize a LAFEA workbench in an existing shell root.
 *
 * @param {Element} rootElement Workbench host.
 * @param {{initialStage?:string,initialDocument?:unknown}|undefined} options Explicit initial state.
 * @returns {LafeaWorkbenchController} Initialized controller.
 */
export function mountLafeaWorkbench(rootElement, options) {
  if (!rootElement) throw new TypeError('LAFEA workbench root is required.');
  return new LafeaWorkbenchController(rootElement, options).init();
}
