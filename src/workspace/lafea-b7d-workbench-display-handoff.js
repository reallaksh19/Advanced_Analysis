import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  validateLafeaB7dRecoveryRenderBridge,
} from './lafea-b7d-recovery-render-bridge.js';
import {
  evaluateLafeaRenderEvidenceIntake,
} from './lafea-render-evidence-intake.js';

export const LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_INTAKE_SCHEMA =
  'lafea-b7d-workbench-display-handoff-intake/v1';
export const LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_SCHEMA =
  'lafea-b7d-workbench-display-handoff/v1';
export const LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_PRODUCER_REVISION =
  'NB-T6E.1';

const STAGE_ID = 'LAFEA.3';
const INTAKE_KEYS = Object.freeze(['schema', 'controller', 'bridge']);
const CONTEXT_KEYS = Object.freeze([
  'schema', 'stageId', 'sceneRevision', 'sourceSemanticHash', 'mode', 'status',
]);
const LIFECYCLE_EXPORT_KEYS = Object.freeze([
  'schema', 'stageId', 'lifecycle', 'binding', 'readiness',
]);
const BINDING_KEYS = Object.freeze([
  'schema', 'stageId', 'sceneRevision', 'fieldId', 'status',
]);
const OUTPUT_KEYS = Object.freeze([
  'schema', 'producerRevision', 'stageId', 'bridgeHash', 'sourceHash',
  'analysisMeshHash', 'executionHash', 'recoveryHash', 'convergenceHash',
  'displayGeometryHash', 'renderProfileHash', 'sceneRevision', 'fieldId',
  'contextBefore', 'contextAfter', 'lifecycleBinding', 'renderIntake',
  'packetBinding', 'handoffHash', 'status', 'authority',
]);
const AUTHORITY = Object.freeze({
  packetBound: true,
  renderEvidenceReady: true,
  currentViewportMatched: true,
  displayProjectionOnly: true,
  engineeringEvidenceChanged: false,
  lifecycleArtifactsRegistered: false,
  solverExecuted: false,
  newEngineeringRecoveryComputed: false,
  assessmentReady: false,
  codeReady: false,
  reportAuthority: false,
  releaseQualified: false,
  generalT7dAuthorized: false,
  shellAuthorized: false,
  lafea6Enabled: false,
});

/**
 * Validate and bind one current NB-T6D B7D render packet through the existing
 * public workbench controller surface. Engineering evidence is read-only; this
 * handoff creates no lifecycle record and exposes no packet buffers.
 */
export function installLafeaB7dWorkbenchDisplay(intakeValue) {
  exactKeys(intakeValue, INTAKE_KEYS, 'B7D workbench display handoff intake');
  if (intakeValue.schema
    !== LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_INTAKE_SCHEMA) {
    throw handoffError('LAFEA_NB_T6E_INTAKE_SCHEMA_INVALID');
  }
  const controller = requireController(intakeValue.controller);
  const bridge = requireBridge(intakeValue.bridge);
  const contextBefore = requireContext(
    controller.getDisplayViewportContext(),
    bridge,
    'BEFORE',
  );
  const lifecycleExport = requireLifecycleExport(
    controller.exportLifecycle(),
    bridge,
  );
  const renderIntake = evaluateLafeaRenderEvidenceIntake({
    stageId: STAGE_ID,
    sceneRevision: bridge.sceneRevision,
    packet: bridge.renderPacket,
    lifecycle: lifecycleExport.lifecycle,
    lifecycleBinding: lifecycleExport.binding,
  });
  if (renderIntake.status !== 'READY'
    || renderIntake.renderEvidenceReady !== true
    || renderIntake.packet === null
    || renderIntake.blockingReasons.length !== 0) {
    throw handoffError('LAFEA_NB_T6E_RENDER_EVIDENCE_NOT_READY', {
      blockingReasons: renderIntake.blockingReasons ?? [],
    });
  }
  const packetBinding = requirePacketBinding(
    controller.setDisplayRenderPacket(renderIntake.packet),
    bridge,
  );
  const contextAfter = requireContext(
    controller.getDisplayViewportContext(),
    bridge,
    'AFTER',
  );
  if (JSON.stringify(contextIdentity(contextBefore))
    !== JSON.stringify(contextIdentity(contextAfter))) {
    throw handoffError('LAFEA_NB_T6E_VIEWPORT_CONTEXT_CHANGED_DURING_BIND');
  }
  const lifecycleBinding = bindingSummary(lifecycleExport.binding);
  const renderIntakeSummary = Object.freeze({
    schema: renderIntake.schema,
    status: renderIntake.status,
    renderEvidenceReady: renderIntake.renderEvidenceReady,
    blockingReasons: Object.freeze([...renderIntake.blockingReasons]),
  });
  const base = {
    schema: LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_SCHEMA,
    producerRevision: LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_PRODUCER_REVISION,
    stageId: STAGE_ID,
    bridgeHash: bridge.bridgeHash,
    sourceHash: bridge.sourceHash,
    analysisMeshHash: bridge.analysisMeshHash,
    executionHash: bridge.executionHash,
    recoveryHash: bridge.recoveryHash,
    convergenceHash: bridge.convergenceHash,
    displayGeometryHash: bridge.displayGeometryHash,
    renderProfileHash: bridge.renderProfileHash,
    sceneRevision: bridge.sceneRevision,
    fieldId: bridge.fieldRequest.fieldId,
    contextBefore,
    contextAfter,
    lifecycleBinding,
    renderIntake: renderIntakeSummary,
    packetBinding,
    status: 'DISPLAY_PACKET_BOUND',
    authority: AUTHORITY,
  };
  return deepFreeze({ ...base, handoffHash: handoffHash(base) });
}

export function validateLafeaB7dWorkbenchDisplayHandoff(value) {
  try {
    exactKeys(value, OUTPUT_KEYS, 'B7D workbench display handoff');
    if (value.schema !== LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_SCHEMA
      || value.producerRevision
        !== LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_PRODUCER_REVISION
      || value.stageId !== STAGE_ID
      || value.status !== 'DISPLAY_PACKET_BOUND') {
      throw handoffError('LAFEA_NB_T6E_HANDOFF_IDENTITY_INVALID');
    }
    for (const key of [
      'bridgeHash', 'sourceHash', 'analysisMeshHash', 'executionHash',
      'recoveryHash', 'convergenceHash', 'displayGeometryHash',
      'renderProfileHash', 'handoffHash',
    ]) sha256(value[key], key);
    nonNegativeInteger(value.sceneRevision, 'sceneRevision');
    text(value.fieldId, 'fieldId');
    requireStoredContext(value.contextBefore, value);
    requireStoredContext(value.contextAfter, value);
    if (JSON.stringify(contextIdentity(value.contextBefore))
      !== JSON.stringify(contextIdentity(value.contextAfter))) {
      throw handoffError('LAFEA_NB_T6E_STORED_CONTEXT_MISMATCH');
    }
    requireStoredLifecycleBinding(value.lifecycleBinding);
    requireStoredRenderIntake(value.renderIntake);
    requirePacketBinding(value.packetBinding, {
      sceneRevision: value.sceneRevision,
      fieldRequest: { fieldId: value.fieldId },
    });
    if (JSON.stringify(value.authority) !== JSON.stringify(AUTHORITY)) {
      throw handoffError('LAFEA_NB_T6E_AUTHORITY_INVALID');
    }
    const base = { ...value };
    delete base.handoffHash;
    if (handoffHash(base) !== value.handoffHash) {
      throw handoffError('LAFEA_NB_T6E_HANDOFF_HASH_INVALID');
    }
    return Object.freeze({ ok: true, errors: Object.freeze([]) });
  } catch (error) {
    return Object.freeze({
      ok: false,
      errors: Object.freeze([error?.code ?? 'LAFEA_NB_T6E_HANDOFF_INVALID']),
    });
  }
}

function requireController(value) {
  if (!value || typeof value !== 'object') {
    throw handoffError('LAFEA_NB_T6E_CONTROLLER_REQUIRED');
  }
  for (const method of [
    'getDisplayViewportContext', 'exportLifecycle', 'setDisplayRenderPacket',
  ]) {
    if (typeof value[method] !== 'function') {
      throw handoffError('LAFEA_NB_T6E_CONTROLLER_SURFACE_INVALID', { method });
    }
  }
  return value;
}

function requireBridge(value) {
  const validation = validateLafeaB7dRecoveryRenderBridge(value);
  if (!validation.ok || value.status !== 'DISPLAY_PACKET_READY'
    || value.stageId !== STAGE_ID
    || value.authority?.displayProjectionOnly !== true
    || value.authority?.engineeringEvidenceChanged === true
    || value.authority?.lifecycleArtifactsRegistered !== false
    || value.authority?.codeReady !== false
    || value.authority?.releaseQualified !== false) {
    throw handoffError('LAFEA_NB_T6E_BRIDGE_INVALID');
  }
  return value;
}

function requireContext(value, bridge, phase) {
  exactKeys(value, CONTEXT_KEYS, `workbench display context ${phase}`);
  if (value.schema !== 'lafea-workbench-display-context/v1'
    || value.stageId !== STAGE_ID
    || value.sceneRevision !== bridge.sceneRevision
    || value.sourceSemanticHash !== bridge.sourceHash) {
    throw handoffError(`LAFEA_NB_T6E_${phase}_VIEWPORT_CONTEXT_MISMATCH`);
  }
  text(value.mode, `${phase}.mode`);
  text(value.status, `${phase}.status`);
  return deepFreeze(structuredClone(value));
}

function requireStoredContext(value, handoff) {
  exactKeys(value, CONTEXT_KEYS, 'stored workbench display context');
  if (value.schema !== 'lafea-workbench-display-context/v1'
    || value.stageId !== STAGE_ID
    || value.sceneRevision !== handoff.sceneRevision
    || value.sourceSemanticHash !== handoff.sourceHash) {
    throw handoffError('LAFEA_NB_T6E_STORED_VIEWPORT_CONTEXT_INVALID');
  }
  text(value.mode, 'context.mode');
  text(value.status, 'context.status');
}

function requireLifecycleExport(value, bridge) {
  exactKeys(value, LIFECYCLE_EXPORT_KEYS, 'workbench lifecycle export');
  if (value.schema !== 'lafea-workbench-lifecycle-export/v1'
    || value.stageId !== STAGE_ID
    || value.lifecycle?.stageId !== STAGE_ID
    || value.lifecycle?.source?.status !== 'CURRENT'
    || value.lifecycle?.source?.sourceHash !== bridge.sourceHash
    || value.binding?.status !== 'CURRENT'
    || value.readiness?.meshQualified !== true
    || value.readiness?.resultReady !== true
    || value.readiness?.convergenceReady !== true
    || value.readiness?.codeReady !== false) {
    throw handoffError('LAFEA_NB_T6E_LIFECYCLE_NOT_CURRENT_RESULT_READY');
  }
  return value;
}

function requirePacketBinding(value, bridge) {
  exactKeys(value, BINDING_KEYS, 'workbench display packet binding');
  if (value.schema !== 'lafea-workbench-display-packet-binding/v1'
    || value.status !== 'BOUND'
    || value.stageId !== STAGE_ID
    || value.sceneRevision !== bridge.sceneRevision
    || value.fieldId !== bridge.fieldRequest.fieldId) {
    throw handoffError('LAFEA_NB_T6E_PACKET_BINDING_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

function bindingSummary(value) {
  return deepFreeze({
    schema: value.schema,
    status: value.status,
    boundDocumentDigest: value.boundDocumentDigest,
    currentDocumentDigest: value.currentDocumentDigest,
    reason: value.reason,
    originRef: value.originRef,
  });
}

function requireStoredLifecycleBinding(value) {
  exactKeys(value, [
    'schema', 'status', 'boundDocumentDigest', 'currentDocumentDigest',
    'reason', 'originRef',
  ], 'stored lifecycle binding');
  if (value.schema !== 'lafea-lifecycle-binding/v1'
    || value.status !== 'CURRENT'
    || value.boundDocumentDigest !== value.currentDocumentDigest
    || value.boundDocumentDigest === null
    || value.reason !== null) {
    throw handoffError('LAFEA_NB_T6E_STORED_LIFECYCLE_BINDING_INVALID');
  }
  text(value.originRef, 'lifecycleBinding.originRef');
}

function requireStoredRenderIntake(value) {
  exactKeys(value, [
    'schema', 'status', 'renderEvidenceReady', 'blockingReasons',
  ], 'stored render intake');
  if (value.schema !== 'lafea-render-evidence-intake/v1'
    || value.status !== 'READY'
    || value.renderEvidenceReady !== true
    || !Array.isArray(value.blockingReasons)
    || value.blockingReasons.length !== 0) {
    throw handoffError('LAFEA_NB_T6E_STORED_RENDER_INTAKE_INVALID');
  }
}

function contextIdentity(value) {
  return {
    stageId: value.stageId,
    sceneRevision: value.sceneRevision,
    sourceSemanticHash: value.sourceSemanticHash,
  };
}

function handoffHash(value) {
  return canonicalLafeaSha256({
    schema: 'lafea-b7d-workbench-display-handoff-hash-input/v1',
    producerRevision: LAFEA_B7D_WORKBENCH_DISPLAY_HANDOFF_PRODUCER_REVISION,
    value,
  });
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw handoffError('LAFEA_NB_T6E_RECORD_INVALID', { label });
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length
    || actual.some((key, index) => key !== required[index])) {
    throw handoffError('LAFEA_NB_T6E_EXACT_KEYS_INVALID', {
      label, actual, expected: required,
    });
  }
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw handoffError('LAFEA_NB_T6E_HASH_INVALID', { label });
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw handoffError('LAFEA_NB_T6E_TEXT_REQUIRED', { label });
  }
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw handoffError('LAFEA_NB_T6E_INTEGER_INVALID', { label });
  }
  return value;
}

function handoffError(code, evidence = {}) {
  const error = new TypeError(code);
  error.code = code;
  error.evidence = evidence;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)
    || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
