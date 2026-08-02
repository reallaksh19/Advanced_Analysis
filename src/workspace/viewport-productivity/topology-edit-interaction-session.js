import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  createTopologyEditInteractionPreview,
} from '../viewport-interaction/topology-edit-interaction-preview.js';
import {
  createTopologyEditNumericEntry,
} from '../viewport-interaction/topology-edit-numeric-entry.js';
import {
  createTopologyEditTransformIntent,
} from '../viewport-interaction/topology-edit-transform-intent.js';
import {
  addTopologyEditPoints,
  finiteTopologyEditNumber,
  finiteTopologyEditPoint,
} from '../viewport-interaction/topology-edit-interaction-values.js';

export const TOPOLOGY_EDIT_INTERACTION_ACCEPTANCE_SCHEMA =
  'TopologyEditInteractionAcceptance.v1';

export function createTopologyEditNumericSessionPreview(input = {}) {
  const context = selectedNodeContext(input.topology, input.selection);
  const numericEntry = createTopologyEditNumericEntry({
    entryMode: input.entryMode,
    anchorPosition: context.anchorPosition,
    values: input.values,
    magnitudeMm: input.magnitudeMm,
    direction: input.direction,
    units: 'MM',
  });
  const intent = createTopologyEditTransformIntent({
    nodeId: context.nodeId,
    basisHash: context.basisHash,
    source: 'NUMERIC',
    mode: input.transformMode ?? 'FREE',
    anchorPosition: context.anchorPosition,
    targetPosition: numericEntry.targetPosition,
    units: 'MM',
  });
  return createTopologyEditInteractionPreview({ intent });
}

export function createTopologyEditNudgeSessionPreview(input = {}) {
  const context = selectedNodeContext(input.topology, input.selection);
  const currentTarget = input.preview?.targetPosition
    ? finiteTopologyEditPoint(input.preview.targetPosition, 'preview.targetPosition')
    : context.anchorPosition;
  const axis = normalizeAxis(input.axis);
  const incrementMm = positiveIncrement(input.incrementMm);
  const direction = Number(input.directionSign) < 0 ? -1 : 1;
  const delta = { x: 0, y: 0, z: 0 };
  delta[axis.toLowerCase()] = incrementMm * direction;
  const targetPosition = addTopologyEditPoints(currentTarget, delta);
  const intent = createTopologyEditTransformIntent({
    nodeId: context.nodeId,
    basisHash: context.basisHash,
    source: 'KEYBOARD',
    mode: `AXIS_${axis}`,
    anchorPosition: context.anchorPosition,
    targetPosition,
    units: 'MM',
  });
  return createTopologyEditInteractionPreview({ intent });
}

export function assertCurrentTopologyEditInteractionPreview({
  preview,
  topology,
  selection,
} = {}) {
  const context = selectedNodeContext(topology, selection);
  if (!preview || preview.basisHash !== context.basisHash) {
    throw new RangeError('Interaction preview is stale for the current topology basis.');
  }
  if (preview.nodeId !== context.nodeId) {
    throw new RangeError('Interaction preview targets a different selected node.');
  }
  if (!preview.canApply || preview.displayOnly !== true || preview.pickable !== false) {
    throw new RangeError('Interaction preview is not an applicable display-only preview.');
  }
  if (semanticHash(preview.movePayload) !== semanticHash({
    nodeId: context.nodeId,
    position: preview.targetPosition,
  })) {
    throw new RangeError('Interaction preview move payload differs from displayed target evidence.');
  }
  return preview;
}

export function verifyTopologyEditInteractionAcceptance({
  preview,
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
  if (semanticHash(entry.request?.payload) !== semanticHash(preview.movePayload)) {
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

export function selectedTopologyEditNodeContext(topology, selection) {
  return selectedNodeContext(topology, selection);
}

function selectedNodeContext(topology, selection) {
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

function normalizeAxis(value) {
  const axis = String(value ?? '').trim().toUpperCase();
  if (!['X', 'Y', 'Z'].includes(axis)) {
    throw new RangeError('Nudge axis must be X, Y or Z.');
  }
  return axis;
}
function positiveIncrement(value) {
  const number = finiteTopologyEditNumber(value, 'incrementMm');
  if (!(number > 0)) throw new RangeError('incrementMm must be positive.');
  return number;
}
