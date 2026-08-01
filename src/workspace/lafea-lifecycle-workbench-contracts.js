import { lafeaDocumentDigest } from './lafea-edit-command.js';
import { lafeaLifecycleReadiness } from './lafea-lifecycle.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export const LAFEA_WORKBENCH_STATE_SCHEMA = 'lafea-workbench-state/v2';
export const LAFEA_LIFECYCLE_BINDING_SCHEMA = 'lafea-lifecycle-binding/v1';
export const LAFEA_LIFECYCLE_BINDING_NOT_CURRENT = 'LAFEA_LIFECYCLE_BINDING_NOT_CURRENT';
export const LAFEA_LIFECYCLE_BINDING_STATUSES = Object.freeze([
  'UNINITIALIZED',
  'CURRENT',
  'STALE_DOCUMENT_REVISION',
  'REVALIDATION_REQUIRED',
]);
export const SOURCE_CHANGE_CLASSES = Object.freeze(new Set([
  'MATERIAL_PROPERTY', 'GEOMETRY', 'LOAD_OR_BC', 'MODEL_METADATA',
]));
export const DISPLAY_CHANGE_CLASSES = Object.freeze(new Set([
  'DISPLAY_MESH_DENSITY', 'CONTOUR_PALETTE', 'REPORT_RENDER_PROFILE',
]));

export function initialLifecycleOverlay(document) {
  return freezeLifecycleValue({
    lifecycle: null,
    binding: uninitializedBinding(
      safeDocumentDigest(document),
      'NO_SOURCE_AUTHORITY',
    ),
    lastLifecycleAction: null,
  });
}

export function currentLifecycleBinding(document, originRef) {
  const digest = lafeaDocumentDigest(document);
  return freezeLifecycleValue({
    schema: LAFEA_LIFECYCLE_BINDING_SCHEMA,
    status: 'CURRENT',
    boundDocumentDigest: digest,
    currentDocumentDigest: digest,
    reason: null,
    originRef,
  });
}

export function transitionedLifecycleBinding(overlay, document, originRef) {
  const currentDocumentDigest = safeDocumentDigest(document);
  if (!overlay.lifecycle) {
    return uninitializedBinding(currentDocumentDigest, originRef);
  }
  const boundDocumentDigest = overlay.binding.boundDocumentDigest;
  const status = currentDocumentDigest === boundDocumentDigest
    ? 'REVALIDATION_REQUIRED'
    : 'STALE_DOCUMENT_REVISION';
  return freezeLifecycleValue({
    schema: LAFEA_LIFECYCLE_BINDING_SCHEMA,
    status,
    boundDocumentDigest,
    currentDocumentDigest,
    reason: transitionReason(status),
    originRef,
  });
}

export function projectedLifecycleReadiness(stageId, lifecycle, binding) {
  if (!lifecycle) return uninitializedReadiness(stageId, binding.status);
  const base = lafeaLifecycleReadiness(lifecycle);
  if (binding.status === 'CURRENT') {
    return freezeLifecycleValue({
      schema: 'lafea-workbench-lifecycle-readiness/v1',
      stageId,
      lifecycleInitialized: true,
      bindingStatus: binding.status,
      sourceCurrent: base.sourceCurrent,
      modelCurrent: base.modelCurrent,
      meshGenerated: base.meshGenerated,
      meshQualified: base.meshQualified,
      resultReady: base.resultReady,
      codeReady: base.codeReady,
      reportCurrent: base.reportCurrent,
      blockingReasons: [...base.blockingReasons],
    });
  }
  return staleReadiness(stageId, binding.status, base);
}

export function requireCurrentLifecycleBinding(binding) {
  if (binding.status === 'CURRENT') return;
  throw lifecycleStoreError(
    LAFEA_LIFECYCLE_BINDING_NOT_CURRENT,
    `Lifecycle source binding is ${binding.status}.`,
  );
}

export function requireLifecycleStageDocument(state, stageId) {
  requireLafeaStageRegistryEntry(stageId);
  const document = state.stages[stageId]?.document;
  if (!document) {
    throw lifecycleStoreError(
      'LAFEA_DOCUMENT_REQUIRED',
      `Import a ${stageId} document before lifecycle operations.`,
    );
  }
  return document;
}

export function safeDocumentDigest(document) {
  return document ? lafeaDocumentDigest(document) : null;
}

export function createLifecycleAction(sequence, action, originRef, referenceId) {
  return freezeLifecycleValue({
    schema: 'lafea-workbench-lifecycle-action/v1',
    sequence,
    action,
    originRef,
    referenceId,
  });
}

export function createLifecycleFailureDiagnostic(error, fallbackCode) {
  return freezeLifecycleValue({
    severity: 'ERROR',
    code: typeof error?.code === 'string' ? error.code : fallbackCode,
    path: typeof error?.path === 'string' ? error.path : 'lifecycle',
    entityId: typeof error?.entityId === 'string' ? error.entityId : null,
    message: error instanceof Error
      ? error.message
      : 'Unknown LAFEA lifecycle failure.',
  });
}

export function lifecycleStoreError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function freezeLifecycleValue(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach(freezeLifecycleValue);
  return Object.freeze(value);
}

function uninitializedBinding(currentDocumentDigest, originRef) {
  return freezeLifecycleValue({
    schema: LAFEA_LIFECYCLE_BINDING_SCHEMA,
    status: 'UNINITIALIZED',
    boundDocumentDigest: null,
    currentDocumentDigest,
    reason: 'OPAQUE_SOURCE_HASH_NOT_REGISTERED',
    originRef,
  });
}

function transitionReason(status) {
  return status === 'REVALIDATION_REQUIRED'
    ? 'EXACT_DOCUMENT_REVISION_RESTORED_REVALIDATION_REQUIRED'
    : 'DOCUMENT_REVISION_CHANGED_WITHOUT_SOURCE_HASH_EVENT';
}

function uninitializedReadiness(stageId, bindingStatus) {
  return freezeLifecycleValue({
    schema: 'lafea-workbench-lifecycle-readiness/v1',
    stageId,
    lifecycleInitialized: false,
    bindingStatus,
    sourceCurrent: false,
    modelCurrent: false,
    meshGenerated: false,
    meshQualified: false,
    resultReady: false,
    codeReady: false,
    reportCurrent: false,
    blockingReasons: ['LIFECYCLE_NOT_INITIALIZED'],
  });
}

function staleReadiness(stageId, bindingStatus, base) {
  return freezeLifecycleValue({
    schema: 'lafea-workbench-lifecycle-readiness/v1',
    stageId,
    lifecycleInitialized: true,
    bindingStatus,
    sourceCurrent: false,
    modelCurrent: false,
    meshGenerated: base.meshGenerated,
    meshQualified: false,
    resultReady: false,
    codeReady: false,
    reportCurrent: false,
    blockingReasons: [
      `LIFECYCLE_SOURCE_BINDING_${bindingStatus}`,
      ...base.blockingReasons,
    ],
  });
}
