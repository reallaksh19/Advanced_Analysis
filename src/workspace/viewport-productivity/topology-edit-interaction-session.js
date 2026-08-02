import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { finiteTopologyEditPoint } from '../viewport-interaction/topology-edit-interaction-values.js';

export const TOPOLOGY_EDIT_INTERACTION_ACCEPTANCE_SCHEMA =
  'TopologyEditInteractionAcceptance.v1';

export function selectedTopologyEditNodeContext(topology, selection) {
  if (!topology || !Array.isArray(topology.nodes)) {
    throw new TypeError('Current canonical topology is required.');
  }
  const basisHash = String(topology.canonicalTopologyHash ?? '').trim();
  if (!basisHash) throw new TypeError('Current canonical topology hash is required.');
  const nodeIds = Array.isArray(selection?.nodeIds) ? selection.nodeIds : [];
  if (nodeIds.length !== 1 || selection?.edgeId) {
    throw new RangeError('Exactly one canonical node must be selected.');
  }
  const nodeId = String(nodeIds[0] ?? '').trim();
  if (!nodeId.startsWith('node:')) {
    throw new RangeError('Selected node must use exact node identity.');
  }
  const matches = topology.nodes.filter((node) => node?.id === nodeId);
  if (matches.length !== 1) {
    throw new RangeError(`Selected node ${nodeId} resolved ${matches.length} records.`);
  }
  return deepFreeze({
    basisHash,
    nodeId,
    anchorPosition: finiteTopologyEditPoint(matches[0].position, `${nodeId}.position`),
  });
}

export function assertCurrentTopologyEditInteractionRuntime({
  runtimeState,
  topology,
  selection,
} = {}) {
  const context = selectedTopologyEditNodeContext(topology, selection);
  if (runtimeState?.status !== 'READY') {
    throw new TypeError('A ready interaction runtime is required.');
  }
  if (runtimeState.basisHash !== context.basisHash) {
    throw new RangeError('Interaction runtime is stale for the current topology basis.');
  }
  if (runtimeState.nodeId !== context.nodeId) {
    throw new RangeError('Interaction runtime targets a different selected node.');
  }
  if (semanticHash(runtimeState.anchorPosition) !== semanticHash(context.anchorPosition)) {
    throw new RangeError('Interaction runtime anchor differs from the selected node position.');
  }
  const preview = runtimeState.preview;
  if (!preview?.canApply || preview.displayOnly !== true || preview.pickable !== false) {
    throw new RangeError('A current applicable display-only preview is required.');
  }
  if (preview.basisHash !== runtimeState.basisHash
      || preview.nodeId !== runtimeState.nodeId) {
    throw new RangeError('Interaction preview is detached from runtime identity.');
  }
  return runtimeState;
}

export function verifyTopologyEditInteractionAcceptance({
  preview,
  payload,
  transition,
  priorSessionVersion,
} = {}) {
  if (transition?.disposition !== 'ACCEPTED') {
    throw new Error('Interaction acceptance requires an accepted certified transition.');
  }
  if (transition.certification?.commandType !== 'MOVE_NODE') {
    throw new Error('Interaction acceptance must certify MOVE_NODE.');
  }
  const expectedVersion = Number(priorSessionVersion) + 1;
  if (!Number.isInteger(expectedVersion)
      || transition.sessionVersion !== expectedVersion) {
    throw new RangeError('Interaction acceptance session version is not the exact next version.');
  }
  const entry = transition.journal?.history?.at?.(-1);
  if (!entry || entry.commandType !== 'MOVE_NODE') {
    throw new Error('Interaction acceptance is missing its exact MOVE_NODE journal entry.');
  }
  if (entry.request?.basis?.priorDraftHash !== preview.basisHash) {
    throw new RangeError('Accepted command prior draft basis differs from the preview basis.');
  }
  if (semanticHash(payload) !== semanticHash(preview.movePayload)
      || semanticHash(entry.request?.payload) !== semanticHash(payload)) {
    throw new RangeError('Accepted MOVE_NODE payload differs from the exact preview payload.');
  }
  const material = {
    schema: TOPOLOGY_EDIT_INTERACTION_ACCEPTANCE_SCHEMA,
    previewHash: preview.previewHash,
    intentHash: preview.intentHash,
    requestHash: entry.request.requestHash,
    certificationHash: transition.certification.certificationHash,
    candidateDraftHash: transition.certification.candidate.candidateDraftHash,
    canonicalTopologyHash: transition.activeCanonicalTopologyHash,
    journalHash: transition.journalHash,
    sessionVersion: transition.sessionVersion,
    commandId: entry.commandId,
    commandType: entry.commandType,
    authority: 'CERTIFIED_SESSION_DELEGATION',
    directMutation: false,
  };
  return deepFreeze({ ...material, acceptanceHash: semanticHash(material) });
}
