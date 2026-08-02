import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  validateLafeaB7dWorkbenchDisplayHandoff,
} from './lafea-b7d-workbench-display-handoff.js';
import {
  validateLafeaSelectedPilotReviewHandoff,
} from './lafea-selected-pilot-evidence-handoff.js';

export const LAFEA_SELECTED_PILOT_REVIEW_SESSION_SCHEMA =
  'lafea-selected-pilot-review-session/v1';
export const LAFEA_SELECTED_PILOT_REVIEW_SESSION_PRODUCER_REVISION =
  'NB-T6F.1';

const TEMPLATE_ID = 'C2D-LUG-PINHOLE';
const STAGE_ID = 'LAFEA.3';
const STATUS = 'READ_ONLY_SELECTED_PILOT_REVIEW_SESSION_READY';
const INPUT_KEYS = Object.freeze([
  'sessionId', 'exactHeadSha', 'reviewHandoff', 'displayHandoff',
]);
const SESSION_KEYS = Object.freeze([
  'schema', 'producerRevision', 'sessionId', 'exactHeadSha', 'templateId',
  'stageId', 'parentHashes', 'physicalProblem', 'levels', 'convergence',
  'finestResult', 'displayBinding', 'reviewSections', 'limitations',
  'authority', 'status', 'sessionHash',
]);
const AUTHORITY = deepFreeze({
  readOnlyReviewSessionReady: true,
  portableAuditLinked: true,
  liveDisplayBindingLinked: true,
  engineeringEvidenceChanged: false,
  solverExecuted: false,
  newEngineeringRecoveryProduced: false,
  newConvergenceProduced: false,
  newDisplayProjectionProduced: false,
  lifecycleArtifactsRegistered: false,
  displayValuesAuthoritative: false,
  generalT7dAuthorized: false,
  additionalContinuumTemplatesAuthorized: false,
  shellAuthorized: false,
  sclAuthorized: false,
  structuralStressAuthorized: false,
  assessmentReady: false,
  codeReady: false,
  reportAuthority: false,
  releaseQualified: false,
  lafea6Enabled: false,
});

export function createLafeaSelectedPilotReviewSession(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'NB-T6F review-session input');
  const sessionId = text(inputValue.sessionId, 'sessionId');
  const exactHeadSha = gitSha(inputValue.exactHeadSha);
  const review = requireReviewHandoff(inputValue.reviewHandoff, exactHeadSha);
  const display = requireDisplayHandoff(inputValue.displayHandoff);
  requireExactParentBinding(review, display);

  const packet = review.reviewPacket;
  const finest = packet.finestLevel;
  const parentHashes = deepFreeze({
    reviewHandoffHash: review.semanticHash,
    reviewPacketHash: packet.packetHash,
    auditReceiptHash: review.auditReceipt.evidenceHash,
    portablePayloadHash: review.portablePayloadHash,
    workbenchDisplayHandoffHash: display.handoffHash,
    renderBridgeHash: display.bridgeHash,
    sourceHash: display.sourceHash,
    analysisMeshHash: display.analysisMeshHash,
    executionHash: display.executionHash,
    recoveryHash: display.recoveryHash,
    convergenceHash: display.convergenceHash,
    displayGeometryHash: display.displayGeometryHash,
    renderProfileHash: display.renderProfileHash,
  });
  const levels = deepFreeze(packet.levels.map((row) => deepFreeze({
    ordinal: row.ordinal,
    meshHash: row.meshHash,
    meshProfileHash: row.meshProfileHash,
    nodeCount: row.nodeCount,
    elementCount: row.elementCount,
    projectedResultant: [...row.projectedResultant],
    reactionResultant: [...row.reactionResultant],
    equilibriumClosure: [...row.equilibriumClosure],
    freeDofCount: row.freeDofCount,
    constrainedDofCount: row.constrainedDofCount,
    solverMethod: row.solverMethod,
    maximumDisplacementMagnitude: row.maximumDisplacementMagnitude,
    maximumRetainedVonMises: row.maximumRetainedVonMises,
    resultHash: row.resultHash,
    recoveryHash: row.recoveryHash,
    retainedRecoveryAuthority: row.retainedRecoveryAuthority,
    status: row.status,
    semanticHash: row.semanticHash,
  })));
  const convergence = deepFreeze({
    displacementHash: packet.convergence.displacement.semanticHash,
    retainedStressHash: packet.convergence.retainedStress.semanticHash,
    controllerConvergenceHash: packet.convergence.controllerConvergenceHash,
    displacementStatus: packet.convergence.displacement.status,
    retainedStressStatus: packet.convergence.retainedStress.status,
    reinterpreted: false,
    newConvergenceProduced: false,
  });
  const finestResult = deepFreeze({
    ordinal: finest.ordinal,
    meshHash: finest.meshHash,
    meshArtifactHash: finest.meshArtifactHash,
    elementCount: finest.elementCount,
    executionHash: finest.executionHash,
    resultHash: finest.resultHash,
    recoveryHash: finest.recoveryHash,
    convergenceHash: finest.convergenceHash,
    integrationPointResultHash: finest.integrationPointResultHash,
    requestedQuantity: finest.requestedQuantity,
    requestedLocation: structuredClone(finest.requestedLocation),
    retainedSourceCount: finest.retainedSources.length,
    retainedResultAuthority: 'INTEGRATION_POINT_ENGINEERING_RESULT',
    displayProjectionAuthority: false,
    assessmentAuthority: false,
    crossElementSmoothingPerformed: false,
    nodalAveragingPerformed: false,
    semanticHash: finest.semanticHash,
  });
  const displayBinding = deepFreeze({
    sceneRevision: display.sceneRevision,
    fieldId: display.fieldId,
    status: display.status,
    renderIntakeStatus: display.renderIntake.status,
    renderEvidenceReady: display.renderIntake.renderEvidenceReady,
    packetBindingStatus: display.packetBinding.status,
    lifecycleBindingStatus: display.lifecycleBinding.status,
    viewportMode: display.contextAfter.mode,
    viewportStatus: display.contextAfter.status,
    sourceHash: display.sourceHash,
    analysisMeshHash: display.analysisMeshHash,
    executionHash: display.executionHash,
    recoveryHash: display.recoveryHash,
    convergenceHash: display.convergenceHash,
    displayGeometryHash: display.displayGeometryHash,
    renderProfileHash: display.renderProfileHash,
    packetBuffersIncluded: false,
    displayValuesAuthoritative: false,
  });
  const reviewSections = deepFreeze([
    { sectionId: 'BASIS', status: 'READY', authority: 'READ_ONLY' },
    { sectionId: 'LEVEL_EVIDENCE', status: 'READY', authority: 'READ_ONLY' },
    { sectionId: 'CONVERGENCE', status: 'READY', authority: 'READ_ONLY' },
    { sectionId: 'FINEST_RETAINED_RESULT', status: 'READY', authority: 'READ_ONLY' },
    { sectionId: 'LIVE_DISPLAY_BINDING', status: 'READY', authority: 'DISPLAY_ONLY' },
    { sectionId: 'LIMITATIONS', status: 'READY', authority: 'READ_ONLY' },
  ].map(deepFreeze));
  const limitations = deepFreeze([
    ...new Set([
      ...packet.limitations,
      'READ_ONLY_REVIEW_SESSION_ONLY',
      'PORTABLE_AUDIT_AND_LIVE_DISPLAY_IDENTITIES_MUST_MATCH',
      'NO_SOLVER_OR_CONTROLLER_COMMAND_EXECUTION',
      'NO_NEW_RECOVERY_CONVERGENCE_OR_DISPLAY_PROJECTION',
      'DISPLAY_VALUES_REMAIN_NON_AUTHORITATIVE',
      'NO_ASSESSMENT_CODE_REPORT_OR_RELEASE_AUTHORITY',
    ]),
  ].sort());
  const base = {
    schema: LAFEA_SELECTED_PILOT_REVIEW_SESSION_SCHEMA,
    producerRevision: LAFEA_SELECTED_PILOT_REVIEW_SESSION_PRODUCER_REVISION,
    sessionId,
    exactHeadSha,
    templateId: TEMPLATE_ID,
    stageId: STAGE_ID,
    parentHashes,
    physicalProblem: deepFreeze(structuredClone(packet.physicalProblem)),
    levels,
    convergence,
    finestResult,
    displayBinding,
    reviewSections,
    limitations,
    authority: AUTHORITY,
    status: STATUS,
  };
  return deepFreeze({ ...base, sessionHash: canonicalLafeaSha256(base) });
}

export function validateLafeaSelectedPilotReviewSession(value) {
  try {
    requireSession(value);
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_NB_T6F_SESSION_INVALID'],
    });
  }
}

export function serializeLafeaSelectedPilotReviewSession(value) {
  requireSession(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function parseLafeaSelectedPilotReviewSession(textValue) {
  if (typeof textValue !== 'string' || !textValue.trim()) {
    throw sessionError('LAFEA_NB_T6F_SERIALIZED_TEXT_REQUIRED');
  }
  let parsed;
  try {
    parsed = JSON.parse(textValue);
  } catch {
    throw sessionError('LAFEA_NB_T6F_SERIALIZED_JSON_INVALID');
  }
  const frozen = deepFreeze(parsed);
  requireSession(frozen);
  return frozen;
}

function requireReviewHandoff(value, exactHeadSha) {
  const validation = validateLafeaSelectedPilotReviewHandoff(value);
  if (!validation.ok || value.status !== 'SELECTED_PILOT_REVIEW_EVIDENCE_READY'
    || value.templateId !== TEMPLATE_ID || value.stageId !== STAGE_ID) {
    throw sessionError('LAFEA_NB_T6F_REVIEW_HANDOFF_INVALID', {
      errors: validation.errors,
    });
  }
  if (value.exactHeadSha !== exactHeadSha
    || value.reviewPacket.exactHeadSha !== exactHeadSha
    || value.auditReceipt.exactHeadSha !== exactHeadSha) {
    throw sessionError('LAFEA_NB_T6F_EXACT_HEAD_PARENT_STALE');
  }
  if (value.authority?.solverExecuted !== false
    || value.authority?.newRecoveryProduced !== false
    || value.authority?.newConvergenceProduced !== false
    || value.authority?.newDisplayProjectionProduced !== false
    || value.authority?.displayValuesAuthoritative !== false
    || value.authority?.codeReady !== false
    || value.authority?.reportAuthority !== false
    || value.authority?.releaseQualified !== false) {
    throw sessionError('LAFEA_NB_T6F_REVIEW_AUTHORITY_INVALID');
  }
  return value;
}

function requireDisplayHandoff(value) {
  const validation = validateLafeaB7dWorkbenchDisplayHandoff(value);
  if (!validation.ok || value.status !== 'DISPLAY_PACKET_BOUND'
    || value.stageId !== STAGE_ID
    || value.renderIntake?.status !== 'READY'
    || value.renderIntake?.renderEvidenceReady !== true
    || value.packetBinding?.status !== 'BOUND'
    || value.lifecycleBinding?.status !== 'CURRENT'
    || value.authority?.packetBound !== true
    || value.authority?.engineeringEvidenceChanged !== false
    || value.authority?.lifecycleArtifactsRegistered !== false
    || value.authority?.solverExecuted !== false
    || value.authority?.newEngineeringRecoveryComputed !== false
    || value.authority?.codeReady !== false
    || value.authority?.reportAuthority !== false
    || value.authority?.releaseQualified !== false) {
    throw sessionError('LAFEA_NB_T6F_DISPLAY_HANDOFF_INVALID', {
      errors: validation.errors,
    });
  }
  return value;
}

function requireExactParentBinding(review, display) {
  const packet = review.reviewPacket;
  const finest = packet.finestLevel;
  const displayEvidence = packet.displayEvidence;
  const checks = [
    [packet.parentHashes.renderBridgeHash, display.bridgeHash,
      'LAFEA_NB_T6F_RENDER_BRIDGE_PARENT_MISMATCH'],
    [review.auditReceipt.renderBridgeHash, display.bridgeHash,
      'LAFEA_NB_T6F_AUDIT_BRIDGE_PARENT_MISMATCH'],
    [packet.parentHashes.exactSourceHash, display.sourceHash,
      'LAFEA_NB_T6F_SOURCE_PARENT_MISMATCH'],
    [finest.meshArtifactHash, display.analysisMeshHash,
      'LAFEA_NB_T6F_MESH_PARENT_MISMATCH'],
    [finest.executionHash, display.executionHash,
      'LAFEA_NB_T6F_EXECUTION_PARENT_MISMATCH'],
    [finest.recoveryHash, display.recoveryHash,
      'LAFEA_NB_T6F_RECOVERY_PARENT_MISMATCH'],
    [finest.convergenceHash, display.convergenceHash,
      'LAFEA_NB_T6F_CONVERGENCE_PARENT_MISMATCH'],
    [displayEvidence.displayGeometryHash, display.displayGeometryHash,
      'LAFEA_NB_T6F_DISPLAY_GEOMETRY_PARENT_MISMATCH'],
    [displayEvidence.renderProfileHash, display.renderProfileHash,
      'LAFEA_NB_T6F_RENDER_PROFILE_PARENT_MISMATCH'],
    [displayEvidence.sceneRevision, display.sceneRevision,
      'LAFEA_NB_T6F_SCENE_REVISION_PARENT_MISMATCH'],
    [displayEvidence.fieldRequest.fieldId, display.fieldId,
      'LAFEA_NB_T6F_FIELD_PARENT_MISMATCH'],
  ];
  for (const [actual, expected, code] of checks) {
    if (actual !== expected) throw sessionError(code, { actual, expected });
  }
  if (!Array.isArray(packet.levels) || packet.levels.length !== 3
    || packet.levels.some((row, index) => row.ordinal !== index + 1)
    || packet.levels.some((row, index) => index > 0
      && row.elementCount <= packet.levels[index - 1].elementCount)
    || packet.levels.some((row) => row.status !== 'PASS'
      || row.retainedRecoveryAuthority
        !== 'INTEGRATION_POINT_ENGINEERING_RESULT'
      || row.projectedDisplayProducedByController !== false)) {
    throw sessionError('LAFEA_NB_T6F_LEVEL_EVIDENCE_INVALID');
  }
  if (displayEvidence.valueRole !== 'PRODUCER_PROJECTED_DISPLAY_ONLY'
    || displayEvidence.displayValuesAuthoritative !== false
    || displayEvidence.newDisplayProjectionProduced !== false
    || displayEvidence.newEngineeringRecoveryProduced !== false
    || displayEvidence.lifecycleArtifactsRegistered !== false) {
    throw sessionError('LAFEA_NB_T6F_DISPLAY_AUTHORITY_INVALID');
  }
}

function requireSession(value) {
  exactKeys(value, SESSION_KEYS, 'NB-T6F review session');
  if (value.schema !== LAFEA_SELECTED_PILOT_REVIEW_SESSION_SCHEMA
    || value.producerRevision
      !== LAFEA_SELECTED_PILOT_REVIEW_SESSION_PRODUCER_REVISION
    || value.templateId !== TEMPLATE_ID || value.stageId !== STAGE_ID
    || value.status !== STATUS) {
    throw sessionError('LAFEA_NB_T6F_SESSION_IDENTITY_INVALID');
  }
  text(value.sessionId, 'sessionId');
  gitSha(value.exactHeadSha);
  if (!Array.isArray(value.levels) || value.levels.length !== 3
    || value.levels.some((row, index) => row.ordinal !== index + 1)
    || value.levels.some((row, index) => index > 0
      && row.elementCount <= value.levels[index - 1].elementCount)) {
    throw sessionError('LAFEA_NB_T6F_SESSION_LEVELS_INVALID');
  }
  if (!Array.isArray(value.reviewSections) || value.reviewSections.length !== 6
    || value.reviewSections.some((row) => row.status !== 'READY')) {
    throw sessionError('LAFEA_NB_T6F_REVIEW_SECTIONS_INVALID');
  }
  if (value.displayBinding?.status !== 'DISPLAY_PACKET_BOUND'
    || value.displayBinding?.renderEvidenceReady !== true
    || value.displayBinding?.packetBindingStatus !== 'BOUND'
    || value.displayBinding?.lifecycleBindingStatus !== 'CURRENT'
    || value.displayBinding?.packetBuffersIncluded !== false
    || value.displayBinding?.displayValuesAuthoritative !== false
    || value.finestResult?.retainedResultAuthority
      !== 'INTEGRATION_POINT_ENGINEERING_RESULT'
    || value.finestResult?.displayProjectionAuthority !== false
    || value.convergence?.reinterpreted !== false
    || value.convergence?.newConvergenceProduced !== false
    || JSON.stringify(value.authority) !== JSON.stringify(AUTHORITY)) {
    throw sessionError('LAFEA_NB_T6F_SESSION_AUTHORITY_INVALID');
  }
  sha256(value.sessionHash, 'sessionHash');
  const base = { ...value };
  delete base.sessionHash;
  if (canonicalLafeaSha256(base) !== value.sessionHash) {
    throw sessionError('LAFEA_NB_T6F_SESSION_HASH_TAMPERED');
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw sessionError('LAFEA_NB_T6F_RECORD_INVALID', { label });
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length
    || actual.some((key, index) => key !== required[index])) {
    throw sessionError('LAFEA_NB_T6F_EXACT_KEYS_INVALID', {
      label, actual, expected: required,
    });
  }
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw sessionError('LAFEA_NB_T6F_HASH_INVALID', { label });
  }
  return value;
}

function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw sessionError('LAFEA_NB_T6F_EXACT_HEAD_SHA_INVALID');
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw sessionError('LAFEA_NB_T6F_TEXT_REQUIRED', { label });
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
