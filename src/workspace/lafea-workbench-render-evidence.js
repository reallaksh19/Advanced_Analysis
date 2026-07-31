/**
 * Private producer-owned render-packet registry for the live LAFEA workbench.
 *
 * Packets are sealed on intake and retained per controller/stage. This module
 * does not create lifecycle evidence, derive fields, invoke an engine or expose
 * typed-array-bearing packets through the public controller surface.
 */
import { sealRenderPacketV2 } from './lafea-canvas/render-packet-v2-contract.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export const LAFEA_WORKBENCH_DISPLAY_PACKET_BINDING_SCHEMA =
  'lafea-workbench-display-packet-binding/v1';

const CONTROLLER_STATE = new WeakMap();

export function initializeLafeaWorkbenchRenderEvidence(controller, THREE = null) {
  requireController(controller);
  if (CONTROLLER_STATE.has(controller)) {
    throw renderEvidenceError('LAFEA_WORKBENCH_RENDER_EVIDENCE_ALREADY_INITIALIZED');
  }
  CONTROLLER_STATE.set(controller, {
    packets: new Map(),
    THREE: THREE ?? null,
  });
}

export function lafeaWorkbenchThreeNamespace(controller) {
  return requireState(controller).THREE;
}

export function lafeaWorkbenchDisplayRenderPacket(controller, stageId) {
  requireLafeaStageRegistryEntry(stageId);
  return requireState(controller).packets.get(stageId) ?? null;
}

export function bindLafeaWorkbenchDisplayRenderPacket(controller, packetValue) {
  const state = requireState(controller);
  const packet = sealRenderPacketV2(packetValue);
  requireLafeaStageRegistryEntry(packet.stageId);
  state.packets.set(packet.stageId, packet);
  return bindingSummary(packet.stageId, packet.sceneRevision, packet.field.fieldId, 'BOUND');
}

export function clearLafeaWorkbenchDisplayRenderPacket(controller, stageId) {
  requireLafeaStageRegistryEntry(stageId);
  const state = requireState(controller);
  const packet = state.packets.get(stageId) ?? null;
  state.packets.delete(stageId);
  return bindingSummary(
    stageId,
    packet?.sceneRevision ?? null,
    packet?.field?.fieldId ?? null,
    packet ? 'CLEARED' : 'NOT_BOUND',
  );
}

export function destroyLafeaWorkbenchRenderEvidence(controller) {
  const state = CONTROLLER_STATE.get(controller);
  if (!state) return;
  state.packets.clear();
  CONTROLLER_STATE.delete(controller);
}

function bindingSummary(stageId, sceneRevision, fieldId, status) {
  return Object.freeze({
    schema: LAFEA_WORKBENCH_DISPLAY_PACKET_BINDING_SCHEMA,
    stageId,
    sceneRevision,
    fieldId,
    status,
  });
}

function requireState(controller) {
  requireController(controller);
  const state = CONTROLLER_STATE.get(controller);
  if (!state) {
    throw renderEvidenceError('LAFEA_WORKBENCH_RENDER_EVIDENCE_NOT_INITIALIZED');
  }
  return state;
}

function requireController(value) {
  if (!value || typeof value !== 'object') {
    throw renderEvidenceError('LAFEA_WORKBENCH_RENDER_EVIDENCE_CONTROLLER_REQUIRED');
  }
}

function renderEvidenceError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}
