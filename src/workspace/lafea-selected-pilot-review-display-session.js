import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  validateLafeaB7dWorkbenchDisplayHandoff,
} from './lafea-b7d-workbench-display-handoff.js';
import {
  validateLafeaSelectedPilotReviewHandoff,
} from './lafea-selected-pilot-evidence-handoff.js';

export const LAFEA_SELECTED_PILOT_REVIEW_DISPLAY_SESSION_INTAKE_SCHEMA =
  'lafea-selected-pilot-review-display-session-intake/v1';
export const LAFEA_SELECTED_PILOT_REVIEW_DISPLAY_SESSION_SCHEMA =
  'lafea-selected-pilot-review-display-session/v1';
export const LAFEA_SELECTED_PILOT_REVIEW_DISPLAY_SESSION_PRODUCER_REVISION =
  'NB-T6F.1';

const STAGE_ID = 'LAFEA.3';
const TEMPLATE_ID = 'C2D-LUG-PINHOLE';
const STATUS = 'REVIEW_DISPLAY_SESSION_BOUND';
const INPUT_KEYS = Object.freeze([
  'schema', 'sessionId', 'exactHeadSha', 'reviewHandoff', 'workbenchHandoff',
]);
const OUTPUT_KEYS = Object.freeze([
  'schema', 'producerRevision', 'sessionId', 'exactHeadSha', 'stageId',
  'templateId', 'reviewHandoffHash', 'reviewPacketHash', 'auditReceiptHash',
  'workbenchHandoffHash', 'renderBridgeHash', 'sourceHash', 'analysisMeshHash',
  'executionHash', 'recoveryHash', 'convergenceHash', 'displayGeometryHash',
  'renderProfileHash', 'sceneRevision', 'fieldId', 'reviewSummary',
  'displaySummary', 'lineage', 'sessionHash', 'status', 'authority',
]);
const AUTHORITY = Object.freeze({
  reviewEvidenceBound: true,
  liveDisplayReceiptBound: true,
  sameRenderBridgeProven: true,
  sameEngineeringLineageProven: true,
  bufferFreeSessionReceipt: true,
  displayValuesAuthoritative: false,
  engineeringEvidenceChanged: false,
  lifecycleArtifactsRegistered: false,
  solverExecuted: false,
  newRecoveryProduced: false,
  newConvergenceProduced: false,
  newDisplayProjectionProduced: false,
  assessmentReady: false,
  codeReady: false,
  reportAuthority: false,
  releaseQualified: false,
  generalT7dAuthorized: false,
  shellAuthorized: false,
  lafea6Enabled: false,
});

/**
 * Bind one portable selected-pilot review handoff to the exact live-workbench
 * display receipt produced from the same NB-T6D render bridge. The resulting
 * receipt contains hashes and summaries only; it creates no engineering or
 * lifecycle evidence and exposes no render-packet buffers.
 */
export function createLafeaSelectedPilotReviewDisplaySession(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'review-display session intake');
  if (inputValue.schema
    !== LAFEA_SELECTED_PILOT_REVIEW_DISPLAY_SESSION_INTAKE_SCHEMA) {
    throw sessionError('LAFEA_NB_T6F_INTAKE_SCHEMA_INVALID');
  }
  const sessionId = text(inputValue.sessionId, 'sessionId');
  const exactHeadSha = gitSha(inputValue.exactHeadSha);
  const review = requireReviewHandoff(inputValue.reviewHandoff, exactHeadSha);
  const workbench = requireWorkbenchHandoff(inputValue.workbenchHandoff);
  const matched = requireSameSessionLineage(review, workbench);

  const reviewSummary = deepFreeze({
    schema: 'lafea-selected-pilot-review-session-summary/v1',
    handoffId: review.handoffId,
    levelCount: review.reviewPacket.levels.length,
    finestOrdinal: review.reviewPacket.finestLevel.ordinal,
    finestElementCount: review.reviewPacket.finestLevel.elementCount,
    reviewPacketReady: review.auditReceipt.reviewPacketReady,
    portableAuditHandoff: review.auditReceipt.portableAuditHandoff,
    existingRenderBridgeConsumed:
      review.auditReceipt.existingRenderBridgeConsumed,
    displayValuesIncluded: review.authority.displayValuesIncluded,
    displayValuesAuthoritative:
      review.authority.displayValuesAuthoritative,
  });
  const displaySummary = deepFreeze({
    schema: 'lafea-selected-pilot-live-display-session-summary/v1',
    packetBound: workbench.authority.packetBound,
    renderEvidenceReady: workbench.authority.renderEvidenceReady,
    currentViewportMatched: workbench.authority.currentViewportMatched,
    lifecycleBindingStatus: workbench.lifecycleBinding.status,
    renderIntakeStatus: workbench.renderIntake.status,
    packetBindingStatus: workbench.packetBinding.status,
    sceneRevision: workbench.sceneRevision,
    fieldId: workbench.fieldId,
    typedArraysExposed: false,
  });
  const lineage = deepFreeze({
    schema: 'lafea-selected-pilot-review-display-lineage/v1',
    renderBridgeHash: matched.renderBridgeHash,
    sourceHash: matched.sourceHash,
    analysisMeshHash: matched.analysisMeshHash,
    executionHash: matched.executionHash,
    recoveryHash: matched.recoveryHash,
    convergenceHash: matched.convergenceHash,
    displayGeometryHash: matched.displayGeometryHash,
    renderProfileHash: matched.renderProfileHash,
    sceneRevision: matched.sceneRevision,
    fieldId: matched.fieldId,
  });
  const base = {
    schema: LAFEA_SELECTED_PILOT_REVIEW_DISPLAY_SESSION_SCHEMA,
    producerRevision:
      LAFEA_SELECTED_PILOT_REVIEW_DISPLAY_SESSION_PRODUCER_REVISION,
    sessionId,
    exactHeadSha,
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    reviewHandoffHash: review.semanticHash,
    reviewPacketHash: review.reviewPacket.packetHash,
    auditReceiptHash: review.auditReceipt.evidenceHash,
    workbenchHandoffHash: workbench.handoffHash,
    renderBridgeHash: matched.renderBridgeHash,
    sourceHash: matched.sourceHash,
    analysisMeshHash: matched.analysisMeshHash,
    executionHash: matched.executionHash,
    recoveryHash: matched.recoveryHash,
    convergenceHash: matched.convergenceHash,
    displayGeometryHash: matched.displayGeometryHash,
    renderProfileHash: matched.renderProfileHash,
    sceneRevision: matched.sceneRevision,
    fieldId: matched.fieldId,
    reviewSummary,
    displaySummary,
    lineage,
    status: STATUS,
    authority: AUTHORITY,
  };
  return deepFreeze({
    ...base,
    sessionHash: canonicalLafeaSha256(base),
  });
}

export function validateLafeaSelectedPilotReviewDisplaySession(value) {
  try {
    exactKeys(value, OUTPUT_KEYS, 'review-display session');
    if (value.schema !== LAFEA_SELECTED_PILOT_REVIEW_DISPLAY_SESSION_SCHEMA
      || value.producerRevision
        !== LAFEA_SELECTED_PILOT_REVIEW_DISPLAY_SESSION_PRODUCER_REVISION
      || value.stageId !== STAGE_ID || value.templateId !== TEMPLATE_ID
      || value.status !== STATUS) {
      throw sessionError('LAFEA_NB_T6F_SESSION_IDENTITY_INVALID');
    }
    text(value.sessionId, 'sessionId');
    gitSha(value.exactHeadSha);
    for (const key of [
      'reviewHandoffHash', 'reviewPacketHash', 'auditReceiptHash',
      'workbenchHandoffHash', 'renderBridgeHash', 'sourceHash',
      'analysisMeshHash', 'executionHash', 'recoveryHash', 'convergenceHash',
      'displayGeometryHash', 'renderProfileHash', 'sessionHash',
    ]) sha256(value[key], key);
    nonNegativeInteger(value.sceneRevision, 'sceneRevision');
    text(value.fieldId, 'fieldId');
    requireStoredReviewSummary(value.reviewSummary);
    requireStoredDisplaySummary(value.displaySummary, value);
    requireStoredLineage(value.lineage, value);
    if (JSON.stringify(value.authority) !== JSON.stringify(AUTHORITY)) {
      throw sessionError('LAFEA_NB_T6F_AUTHORITY_INVALID');
    }
    const base = { ...value };
    delete base.sessionHash;
    if (canonicalLafeaSha256(base) !== value.sessionHash) {
      throw sessionError('LAFEA_NB_T6F_SESSION_HASH_INVALID');
    }
    return Object.freeze({ ok: true, errors: Object.freeze([]) });
  } catch (error) {
    return Object.freeze({
      ok: false,
      errors: Object.freeze([error?.code ?? 'LAFEA_NB_T6F_SESSION_INVALID']),
    });
  }
}

function requireReviewHandoff(value, exactHeadSha) {
  const validation = validateLafeaSelectedPilotReviewHandoff(value);
  if (!validation.ok
    || value.exactHeadSha !== exactHeadSha
    || value.reviewPacket?.exactHeadSha !== exactHeadSha
    || value.auditReceipt?.exactHeadSha !== exactHeadSha
    || value.stageId !== STAGE_ID || value.templateId !== TEMPLATE_ID
    || value.status !== 'SELECTED_PILOT_REVIEW_EVIDENCE_READY'
    || value.auditReceipt?.reviewPacketReady !== true
    || value.auditReceipt?.portableAuditHandoff !== true
    || value.authority?.existingRenderBridgeConsumed !== true
    || value.authority?.displayValuesIncluded !== true
    || value.authority?.displayValuesAuthoritative !== false
    || value.authority?.solverExecuted !== false
    || value.authority?.newRecoveryProduced !== false
    || value.authority?.newConvergenceProduced !== false
    || value.authority?.newDisplayProjectionProduced !== false
    || value.authority?.codeReady !== false
    || value.authority?.reportAuthority !== false
    || value.authority?.releaseQualified !== false) {
    throw sessionError('LAFEA_NB_T6F_REVIEW_HANDOFF_INVALID');
  }
  return value;
}

function requireWorkbenchHandoff(value) {
  const validation = validateLafeaB7dWorkbenchDisplayHandoff(value);
  if (!validation.ok
    || value.stageId !== STAGE_ID
    || value.status !== 'DISPLAY_PACKET_BOUND'
    || value.authority?.packetBound !== true
    || value.authority?.renderEvidenceReady !== true
    || value.authority?.currentViewportMatched !== true
    || value.authority?.engineeringEvidenceChanged !== false
    || value.authority?.lifecycleArtifactsRegistered !== false
    || value.authority?.solverExecuted !== false
    || value.authority?.newEngineeringRecoveryComputed !== false
    || value.authority?.codeReady !== false
    || value.authority?.reportAuthority !== false
    || value.authority?.releaseQualified !== false) {
    throw sessionError('LAFEA_NB_T6F_WORKBENCH_HANDOFF_INVALID');
  }
  return value;
}

function requireSameSessionLineage(review, workbench) {
  const packet = review.reviewPacket;
  const finest = packet.finestLevel;
  const display = packet.displayEvidence;
  const pairs = {
    renderBridgeHash: [
      packet.parentHashes.renderBridgeHash,
      display.renderBridgeHash,
      review.auditReceipt.renderBridgeHash,
      workbench.bridgeHash,
    ],
    sourceHash: [packet.parentHashes.exactSourceHash, workbench.sourceHash],
    analysisMeshHash: [finest.meshArtifactHash, workbench.analysisMeshHash],
    executionHash: [finest.executionHash, workbench.executionHash],
    recoveryHash: [finest.recoveryHash, workbench.recoveryHash],
    convergenceHash: [finest.convergenceHash, workbench.convergenceHash],
    displayGeometryHash: [display.displayGeometryHash,
      workbench.displayGeometryHash],
    renderProfileHash: [display.renderProfileHash, workbench.renderProfileHash],
    sceneRevision: [display.sceneRevision, workbench.sceneRevision],
    fieldId: [display.fieldRequest.fieldId, workbench.fieldId],
  };
  for (const [key, values] of Object.entries(pairs)) {
    if (values.some((value) => value !== values[0])) {
      throw sessionError('LAFEA_NB_T6F_CROSS_HANDOFF_LINEAGE_MISMATCH', {
        key,
      });
    }
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(pairs).map(([key, values]) => [key, values[0]]),
  ));
}

function requireStoredReviewSummary(value) {
  if (!value || value.schema
    !== 'lafea-selected-pilot-review-session-summary/v1'
    || !Number.isInteger(value.levelCount) || value.levelCount !== 3
    || value.finestOrdinal !== 3
    || !Number.isInteger(value.finestElementCount)
    || value.finestElementCount <= 0
    || value.reviewPacketReady !== true
    || value.portableAuditHandoff !== true
    || value.existingRenderBridgeConsumed !== true
    || value.displayValuesIncluded !== true
    || value.displayValuesAuthoritative !== false) {
    throw sessionError('LAFEA_NB_T6F_REVIEW_SUMMARY_INVALID');
  }
  text(value.handoffId, 'reviewSummary.handoffId');
}

function requireStoredDisplaySummary(value, session) {
  if (!value || value.schema
    !== 'lafea-selected-pilot-live-display-session-summary/v1'
    || value.packetBound !== true || value.renderEvidenceReady !== true
    || value.currentViewportMatched !== true
    || value.lifecycleBindingStatus !== 'CURRENT'
    || value.renderIntakeStatus !== 'READY'
    || value.packetBindingStatus !== 'BOUND'
    || value.sceneRevision !== session.sceneRevision
    || value.fieldId !== session.fieldId
    || value.typedArraysExposed !== false) {
    throw sessionError('LAFEA_NB_T6F_DISPLAY_SUMMARY_INVALID');
  }
}

function requireStoredLineage(value, session) {
  if (!value || value.schema
    !== 'lafea-selected-pilot-review-display-lineage/v1') {
    throw sessionError('LAFEA_NB_T6F_LINEAGE_INVALID');
  }
  for (const key of [
    'renderBridgeHash', 'sourceHash', 'analysisMeshHash', 'executionHash',
    'recoveryHash', 'convergenceHash', 'displayGeometryHash',
    'renderProfileHash', 'sceneRevision', 'fieldId',
  ]) {
    if (value[key] !== session[key]) {
      throw sessionError('LAFEA_NB_T6F_LINEAGE_INVALID', { key });
    }
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw sessionError('LAFEA_NB_T6F_RECORD_INVALID', { label });
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw sessionError('LAFEA_NB_T6F_EXACT_KEYS_INVALID', { label });
  }
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw sessionError('LAFEA_NB_T6F_TEXT_REQUIRED', { field });
  }
  return value;
}

function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw sessionError('LAFEA_NB_T6F_GIT_SHA_INVALID');
  }
  return value;
}

function sha256(value, field) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw sessionError('LAFEA_NB_T6F_HASH_INVALID', { field });
  }
  return value;
}

function nonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw sessionError('LAFEA_NB_T6F_INTEGER_INVALID', { field });
  }
  return value;
}

function sessionError(code, evidence = {}) {
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
