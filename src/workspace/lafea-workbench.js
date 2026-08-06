/** Public integration surface for the standalone LAFEA calculation workbench. */
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
  lafeaRegisteredComposition,
  lafeaRegisteredExecutionSupported,
  lafeaRegisteredPreviewSource,
  requireLafeaStageRegistryEntry,
} from './lafea-stage-registry.js';
export {
  LAFEA_BENCHMARK_BINDING_STATES,
  LAFEA_RELEASE_STATE_BINDINGS,
  LAFEA_STAGE_COMPOSITION_BINDINGS,
  LAFEA_STAGE_COMPOSITION_BINDING_SCHEMA,
  LAFEA_TECHNICAL_COMPONENT_IDS,
  LAFEA_TECHNICAL_COMPONENT_KINDS,
  requireLafeaStageCompositionBinding,
} from './lafea-stage-composition-bindings.js';
export {
  LAFEA_STAGE_COMPOSITION_SCHEMA,
  lafeaStageCompositionIdentity,
  requireLafeaStageComposition,
} from './lafea-stage-composition-root.js';
export {
  LAFEA_LIFECYCLE_PROFILE_IDS,
  LAFEA_LIFECYCLE_PROFILE_SCHEMA,
  LAFEA_LIFECYCLE_PROFILES,
  LAFEA_STAGE_LIFECYCLE_PROFILE_IDS,
  lafeaLifecycleArtifactKinds,
  requireLafeaLifecycleArtifactDefinition,
  requireLafeaLifecycleProfile,
  requireLafeaLifecycleProfileForStage,
} from './lafea-lifecycle-profiles.js';
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
  LAFEA_LEGACY_ARTIFACT_KINDS,
  LAFEA_LEGACY_ARTIFACT_RECORD_SCHEMA,
  LAFEA_LEGACY_ARTIFACT_REGISTRATION_SCHEMA,
  LAFEA_LEGACY_LIFECYCLE_SCHEMA,
  LAFEA_LIFECYCLE_CHANGE_CLASSES,
  LAFEA_LIFECYCLE_EVENT_SCHEMA,
  LAFEA_LIFECYCLE_SCHEMA,
  LAFEA_QUALIFICATION_STATES,
  applyLafeaLifecycleEvent,
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  createLafeaLifecycleEvent,
  lafeaLifecycleReadiness,
  migrateLafeaLifecycleV1,
  registerLafeaArtifact,
} from './lafea-lifecycle.js';
export {
  LAFEA_CALCULATION_STATES,
  LAFEA_CODE_STATES,
  LAFEA_LIFECYCLE_BINDING_SCHEMA,
  LAFEA_LIFECYCLE_BINDING_STATUSES,
  LAFEA_RELEASE_STATES,
  LAFEA_RESULT_STATES,
  LAFEA_WORKBENCH_STATE_SCHEMA,
  createLafeaWorkbenchStore,
} from './lafea-lifecycle-workbench-store.js';
export {
  LAFEA_CANONICAL_SHA256_PROFILE,
  canonicalLafeaJson,
  canonicalLafeaSha256,
} from './lafea-canonical-sha256.js';
export {
  LAFEA_SOURCE_AUTHORITY_EVENT_SCHEMA,
  LAFEA_SOURCE_AUTHORITY_ROLE,
  LAFEA_SOURCE_AUTHORITY_SCHEMA,
  createLafeaSourceAuthorityEvent,
  issueLafeaSourceAuthority,
  sourceAuthorityDocument,
  validateLafeaSourceAuthority,
  validateLafeaSourceAuthorityEvent,
} from './lafea-source-authority.js';
export {
  LAFEA_PRODUCER_BATCH_SCHEMA,
  LAFEA_PRODUCER_REVISION,
  createLafeaLifecycleProducerBatch,
  registerLafeaLifecycleProducerBatch,
} from './lafea-lifecycle-producers.js';
export {
  LAFEA_ANALYTICAL_PRODUCT_BATCH_SCHEMA,
  LAFEA_ANALYTICAL_PRODUCT_PRODUCER_REVISION,
  createLafeaAnalyticalProductBatch,
  registerLafeaAnalyticalProductBatch,
} from './lafea-analytical-product-producers.js';
export {
  LAFEA_ANALYSIS_MESH_AUTHORITY_ROLE,
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_AUTHORITY_STATUS,
  LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA,
  LAFEA_ANALYSIS_MESH_FEA_STAGES,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  LAFEA_ANALYSIS_MESH_PRODUCER_REVISION,
  LAFEA_ANALYSIS_MESH_QUALITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  lafeaAnalysisMeshContentHash,
  registerLafeaAnalysisMeshEvidence,
} from './lafea-analysis-mesh-evidence.js';
export {
  LAFEA_ANALYSIS_MESH_CUSTODY_SCHEMA,
  LAFEA_ANALYSIS_MESH_CUSTODY_STATES,
  selectLafeaAnalysisMeshCustody,
} from './lafea-analysis-mesh-custody.js';
export {
  LAFEA_ANALYSIS_MESH_CUSTODY_PROJECTION_SCHEMA,
  buildAnalysisMeshCustodyProjection,
} from './lafea-analysis-mesh-custody-projection.js';
export {
  validateLafeaAnalysisMeshEvidence,
} from './lafea-analysis-mesh-evidence-validator.js';
export {
  LAFEA_RECOVERY_RENDER_DISPLAY_FIELD_SCHEMA,
  LAFEA_RECOVERY_RENDER_FEA_STAGES,
  LAFEA_RECOVERY_RENDER_FIELD_REQUEST_SCHEMA,
  LAFEA_RECOVERY_RENDER_INTAKE_SCHEMA,
  LAFEA_RECOVERY_RENDER_LOCATION_KINDS,
  LAFEA_RECOVERY_RENDER_LOCATION_SCHEMA,
  LAFEA_RECOVERY_RENDER_PACKAGE_SCHEMA,
  LAFEA_RECOVERY_RENDER_PRODUCER_REVISION,
  LAFEA_RECOVERY_RENDER_QUANTITIES,
  LAFEA_RECOVERY_RENDER_SHELL_SURFACES,
  LAFEA_RECOVERY_RENDER_TESSELLATION_POLICY,
  createLafeaRecoveryRenderPackage,
  lafeaRecoveryRenderDisplayGeometryHash,
  lafeaRecoveryRenderPackageHash,
  lafeaRecoveryRenderProfileHash,
  registerLafeaRecoveryRenderPackage,
} from './lafea-recovery-render-producer.js';
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
  LAFEA_WORKBENCH_ACCESSORY_DIAGNOSTIC_SCHEMA,
  LAFEA_WORKBENCH_ACCESSORY_HOST_SCHEMA,
  LAFEA_WORKBENCH_ACCESSORY_PANEL_SCHEMA,
  validateLafeaAccessoryPanelDescriptor,
} from './lafea-workbench-accessory-panels.js';
export {
  LAFEA_WORKBENCH_DOCUMENT_SCHEMA,
  executeLafeaStage,
  lafeaCollectionPaths,
  lafeaStageExecutionSupported,
  normalizeLafeaStageEdit,
  normalizeLafeaStageDocument,
} from './lafea-workbench-model.js';
export {
  LAFEA_TEMPLATE_EXECUTION_CONTROLLER_RESULT_SCHEMA,
  LAFEA_TEMPLATE_EXECUTION_CONTROLLER_REVISION,
  executeControlledLafeaAnalyticalPilot,
} from './lafea-template-execution-public.js';
export {
  LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_RESULT_SCHEMA,
  LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_REVISION,
  LAFEA_CONTROLLED_CONTINUUM_STAGE_ID,
  LAFEA_CONTROLLED_CONTINUUM_STAGE_ROUTE_SCHEMA,
  executeControlledLafeaContinuumPilot,
} from './lafea-controlled-continuum-public.js';
export { lafeaPreviewGeometry } from './lafea-stage-preview.js';

/**
 * Mount and initialize a LAFEA workbench in an existing shell root.
 *
 * `accessoryPanels` is an optional array of exact
 * `lafea-workbench-accessory-panel/v1` descriptors. Panels are UI composition
 * extensions only and receive a frozen facade containing `getState` and
 * `importDocument`.
 *
 * `THREE` is an optional injected Three.js namespace. It is used only after a
 * producer supplies a V2 render packet whose scene revision and complete U3
 * engineering/display lineage evaluate as current and qualified. Producers use
 * `getDisplayViewportContext()`, `setDisplayRenderPacket(packet)` and
 * `clearDisplayRenderPacket(stageId)` on the returned controller. These methods
 * do not register lifecycle evidence or expose retained packet buffers.
 *
 * @param {Element} rootElement Workbench host.
 * @param {{initialStage?:string,initialDocument?:unknown,initialSourceHash?:string,accessoryPanels?:unknown[],THREE?:unknown}|undefined} options Explicit initial state, optional accessory panels and optional Three.js dependency.
 * @returns {LafeaWorkbenchController} Initialized controller.
 */
export function mountLafeaWorkbench(rootElement, options) {
  if (!rootElement) throw new TypeError('LAFEA workbench root is required.');
  return new LafeaWorkbenchController(rootElement, options).init();
}
