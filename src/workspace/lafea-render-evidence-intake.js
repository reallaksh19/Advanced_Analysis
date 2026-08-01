/**
 * Bind a producer-supplied V2 render packet to current U3 lifecycle evidence.
 *
 * This module validates intake eligibility only. It does not pack geometry,
 * recover fields, create evidence, select or invoke a graphics backend.
 */
import {
  LAFEA_LIFECYCLE_BINDING_SCHEMA,
  LAFEA_LIFECYCLE_BINDING_STATUSES,
} from './lafea-lifecycle-workbench-store.js';
import { lafeaLifecycleReadiness } from './lafea-lifecycle.js';
import { requireLafeaLifecycleProfileForStage } from './lafea-lifecycle-profiles.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';
import {
  sealRenderPacketV2,
} from './lafea-canvas/render-packet-v2-contract.js';

export const LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA = 'lafea-render-evidence-intake/v1';
export const LAFEA_RENDER_EVIDENCE_INTAKE_STATUSES = Object.freeze([
  'READY',
  'BLOCKED',
]);

const INPUT_KEYS = Object.freeze([
  'stageId',
  'sceneRevision',
  'packet',
  'lifecycle',
  'lifecycleBinding',
]);
const RESULT_KEYS = Object.freeze([
  'schema',
  'stageId',
  'sceneRevision',
  'status',
  'renderEvidenceReady',
  'packet',
  'blockingReasons',
]);
const BINDING_KEYS = Object.freeze([
  'schema',
  'status',
  'boundDocumentDigest',
  'currentDocumentDigest',
  'reason',
  'originRef',
]);
const ARTIFACT_BINDINGS = Object.freeze([
  Object.freeze(['topologyHash', 'ANALYSIS_GEOMETRY']),
  Object.freeze(['meshHash', 'ANALYSIS_MESH']),
  Object.freeze(['executionHash', 'EXECUTION']),
  Object.freeze(['recoveryHash', 'RECOVERY']),
]);

/** Return READY only when packet, profile, lifecycle, binding and display lineage agree. */
export function evaluateLafeaRenderEvidenceIntake(input) {
  exactKeys(input, INPUT_KEYS, 'LAFEA_RENDER_INTAKE_INPUT_KEYS_INVALID');
  const stage = requireLafeaStageRegistryEntry(input.stageId);
  const profile = requireLafeaLifecycleProfileForStage(input.stageId);
  requireRevision(input.sceneRevision);
  const reasons = [];
  const addReason = (code) => {
    if (!reasons.includes(code)) reasons.push(code);
  };

  let packet = null;
  if (input.packet === null) addReason('LAFEA_RENDER_PACKET_NOT_SUPPLIED');
  else packet = sealRenderPacketV2(input.packet);

  let lifecycle = null;
  let readiness = null;
  if (input.lifecycle === null) addReason('LAFEA_RENDER_LIFECYCLE_NOT_SUPPLIED');
  else {
    const lifecycleSnapshot = structuredClone(input.lifecycle);
    readiness = lafeaLifecycleReadiness(lifecycleSnapshot);
    lifecycle = deepFreeze(lifecycleSnapshot);
  }

  let binding = null;
  if (input.lifecycleBinding === null) {
    addReason('LAFEA_RENDER_LIFECYCLE_BINDING_NOT_SUPPLIED');
  } else binding = validateBinding(input.lifecycleBinding);

  if (stage.engineState === 'ENGINE_NOT_IMPLEMENTED') {
    addReason('LAFEA_RENDER_STAGE_ENGINE_NOT_IMPLEMENTED');
  }
  if (!profile.meshApplicable) {
    addReason('LAFEA_RENDER_PROFILE_NOT_MESH_RESULT_AUTHORIZED');
  }
  if (packet?.stageId !== undefined && packet.stageId !== stage.stageId) {
    addReason('LAFEA_RENDER_PACKET_STAGE_MISMATCH');
  }
  if (packet?.sceneRevision !== undefined
    && packet.sceneRevision !== input.sceneRevision) {
    addReason('LAFEA_RENDER_PACKET_SCENE_REVISION_MISMATCH');
  }
  if (lifecycle?.stageId !== undefined && lifecycle.stageId !== stage.stageId) {
    addReason('LAFEA_RENDER_LIFECYCLE_STAGE_MISMATCH');
  }
  if (lifecycle?.profileId !== undefined && lifecycle.profileId !== profile.profileId) {
    addReason('LAFEA_RENDER_LIFECYCLE_PROFILE_MISMATCH');
  }
  if (binding && binding.status !== 'CURRENT') {
    addReason(`LAFEA_RENDER_LIFECYCLE_BINDING_${binding.status}`);
  }

  if (profile.meshApplicable && packet && lifecycle && packet.stageId === lifecycle.stageId) {
    evaluateEngineeringLineage(packet, lifecycle, readiness, addReason);
    evaluateDisplayLineage(packet, lifecycle, addReason);
  }

  const status = reasons.length ? 'BLOCKED' : 'READY';
  const result = {
    schema: LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
    stageId: stage.stageId,
    sceneRevision: input.sceneRevision,
    status,
    renderEvidenceReady: status === 'READY',
    packet: status === 'READY' ? packet : null,
    blockingReasons: Object.freeze(reasons),
  };
  exactKeys(result, RESULT_KEYS, 'LAFEA_RENDER_INTAKE_RESULT_KEYS_INVALID');
  return deepFreeze(result);
}

function evaluateEngineeringLineage(packet, lifecycle, readiness, addReason) {
  if (packet.lineage.sourceHash !== lifecycle.source.sourceHash) {
    addReason('LAFEA_RENDER_SOURCE_HASH_MISMATCH');
  }
  for (const [lineageKey, artifactKind] of ARTIFACT_BINDINGS) {
    const artifact = lifecycle.artifacts[artifactKind];
    if (!artifact || artifact.status !== 'CURRENT' || artifact.qualification !== 'PASS') {
      addReason(`LAFEA_RENDER_${artifactKind}_NOT_CURRENT_PASS`);
    } else if (artifact.artifactHash !== packet.lineage[lineageKey]) {
      addReason(`LAFEA_RENDER_${artifactKind}_HASH_MISMATCH`);
    }
  }
  if (!readiness.meshQualified) addReason('LAFEA_RENDER_LIFECYCLE_MESH_NOT_QUALIFIED');
  if (!readiness.resultReady) addReason('LAFEA_RENDER_LIFECYCLE_RESULT_NOT_READY');
}

function evaluateDisplayLineage(packet, lifecycle, addReason) {
  const displayGeometryHash = lifecycle.display.displayMeshDensityHash;
  const renderProfileHash = lifecycle.display.contourPaletteHash;
  if (displayGeometryHash === null) {
    addReason('LAFEA_RENDER_DISPLAY_GEOMETRY_PROFILE_MISSING');
  } else if (displayGeometryHash !== packet.lineage.displayGeometryHash) {
    addReason('LAFEA_RENDER_DISPLAY_GEOMETRY_HASH_MISMATCH');
  }
  if (renderProfileHash === null) {
    addReason('LAFEA_RENDER_PROFILE_MISSING');
  } else if (renderProfileHash !== packet.lineage.renderProfileHash) {
    addReason('LAFEA_RENDER_PROFILE_HASH_MISMATCH');
  }
}

function validateBinding(value) {
  exactKeys(value, BINDING_KEYS, 'LAFEA_RENDER_LIFECYCLE_BINDING_KEYS_INVALID');
  if (value.schema !== LAFEA_LIFECYCLE_BINDING_SCHEMA
    || !LAFEA_LIFECYCLE_BINDING_STATUSES.includes(value.status)) {
    throw intakeError('LAFEA_RENDER_LIFECYCLE_BINDING_INVALID');
  }
  requireText(value.originRef, 'lifecycleBinding.originRef');
  requireNullableText(value.boundDocumentDigest, 'lifecycleBinding.boundDocumentDigest');
  requireNullableText(value.currentDocumentDigest, 'lifecycleBinding.currentDocumentDigest');
  requireNullableText(value.reason, 'lifecycleBinding.reason');
  if (value.status === 'CURRENT') {
    if (value.boundDocumentDigest === null
      || value.boundDocumentDigest !== value.currentDocumentDigest
      || value.reason !== null) {
      throw intakeError('LAFEA_RENDER_CURRENT_BINDING_INVALID');
    }
  } else if (value.status === 'UNINITIALIZED') {
    if (value.boundDocumentDigest !== null || value.reason === null) {
      throw intakeError('LAFEA_RENDER_UNINITIALIZED_BINDING_INVALID');
    }
  } else if (value.status === 'STALE_DOCUMENT_REVISION') {
    if (value.boundDocumentDigest === null || value.currentDocumentDigest === null
      || value.boundDocumentDigest === value.currentDocumentDigest
      || value.reason === null) {
      throw intakeError('LAFEA_RENDER_STALE_BINDING_INVALID');
    }
  } else if (value.boundDocumentDigest === null
    || value.boundDocumentDigest !== value.currentDocumentDigest
    || value.reason === null) {
    throw intakeError('LAFEA_RENDER_REVALIDATION_BINDING_INVALID');
  }
  return value;
}

function requireRevision(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw intakeError('LAFEA_RENDER_INTAKE_SCENE_REVISION_INVALID');
  }
}

function requireNullableText(value, field) {
  if (value !== null) requireText(value, field);
}

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw intakeError('LAFEA_RENDER_INTAKE_TEXT_REQUIRED', { field });
  }
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw intakeError(code, { reason: 'NOT_A_RECORD' });
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw intakeError(code, { actual, expected });
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)
    || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function intakeError(code, evidence = {}) {
  const error = new TypeError(code);
  error.code = code;
  error.evidence = evidence;
  return error;
}
