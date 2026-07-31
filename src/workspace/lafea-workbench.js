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
  LAFEA_WORKBENCH_DOCUMENT_SCHEMA,
  executeLafeaStage,
  lafeaCollectionPaths,
  lafeaStageExecutionSupported,
  normalizeLafeaStageEdit,
  normalizeLafeaStageDocument,
} from './lafea-workbench-model.js';
export { lafeaPreviewGeometry } from './lafea-stage-preview.js';
export { createLafeaWorkbenchStore } from './lafea-workbench-store.js';

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
