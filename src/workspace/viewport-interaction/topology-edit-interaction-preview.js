import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  assertTopologyEditSnapResolution,
  TOPOLOGY_EDIT_SNAP_STATUSES,
} from './topology-edit-snap-resolver.js';
import {
  assertTopologyEditTransformIntent,
} from './topology-edit-transform-intent.js';
import {
  subtractTopologyEditPoints,
  topologyEditPointDistance,
} from './topology-edit-interaction-values.js';

export const TOPOLOGY_EDIT_INTERACTION_PREVIEW_SCHEMA =
  'TopologyEditInteractionPreview.v1';

export function createTopologyEditInteractionPreview(input = {}) {
  const intent = assertTopologyEditTransformIntent(input.intent);
  const snapResolution = input.snapResolution
    ? assertTopologyEditSnapResolution(input.snapResolution)
    : null;
  if (snapResolution && snapResolution.basisHash !== intent.basisHash) {
    throw new RangeError('Snap resolution basis does not match intent basis.');
  }
  const snapped = snapResolution?.status
    === TOPOLOGY_EDIT_SNAP_STATUSES.RESOLVED;
  const blockedBySnap = Boolean(
    snapResolution
    && ![
      TOPOLOGY_EDIT_SNAP_STATUSES.RESOLVED,
      TOPOLOGY_EDIT_SNAP_STATUSES.UNAVAILABLE,
    ].includes(snapResolution.status),
  );
  const targetPosition = snapped
    ? snapResolution.candidate.position
    : intent.targetPosition;
  const material = {
    schema: TOPOLOGY_EDIT_INTERACTION_PREVIEW_SCHEMA,
    basisHash: intent.basisHash,
    nodeId: intent.nodeId,
    intentHash: intent.intentHash,
    snapResolutionHash: snapResolution?.resolutionHash ?? null,
    snapStatus:
      snapResolution?.status
      ?? TOPOLOGY_EDIT_SNAP_STATUSES.UNAVAILABLE,
    snapEvidenceType: snapped
      ? snapResolution.candidate.evidenceType
      : null,
    snapTargetCanonicalId: snapped
      ? snapResolution.candidate.targetCanonicalId
      : null,
    snapCandidateHash: snapped
      ? snapResolution.candidate.candidateHash
      : null,
    anchorPosition: intent.anchorPosition,
    targetPosition,
    delta: subtractTopologyEditPoints(
      targetPosition,
      intent.anchorPosition,
    ),
    movePayload: deepFreeze({
      nodeId: intent.nodeId,
      position: targetPosition,
    }),
    canApply:
      !blockedBySnap
      && topologyEditPointDistance(intent.anchorPosition, targetPosition) > 0,
    displayOnly: true,
    pickable: false,
    authority: 'DISPLAY_ONLY_PREVIEW',
  };
  return deepFreeze({
    ...material,
    previewHash: semanticHash(material),
  });
}
