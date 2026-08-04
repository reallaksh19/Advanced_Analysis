import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  assertTopologyEditSnapResult,
} from './topology-edit-snap-contract.js';
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
  const legacyResolution = input.snapResolution
    ? assertTopologyEditSnapResolution(input.snapResolution)
    : null;
  const snapResult = input.snapResult
    ? assertTopologyEditSnapResult(input.snapResult)
    : null;
  if (legacyResolution && snapResult) {
    throw new TypeError('Interaction preview accepts one snap authority only.');
  }
  if (legacyResolution && legacyResolution.basisHash !== intent.basisHash) {
    throw new RangeError('Snap resolution basis does not match intent basis.');
  }
  if (snapResult && snapResult.basisHash !== intent.basisHash) {
    throw new RangeError('Snap result basis does not match intent basis.');
  }
  const deterministicSnapped = snapResult?.status === 'RESOLVED';
  const legacySnapped = legacyResolution?.status
    === TOPOLOGY_EDIT_SNAP_STATUSES.RESOLVED;
  const snapped = deterministicSnapped || legacySnapped;
  const blockedBySnap = Boolean(
    snapResult?.status === 'STALE'
    || (
      legacyResolution
      && ![
        TOPOLOGY_EDIT_SNAP_STATUSES.RESOLVED,
        TOPOLOGY_EDIT_SNAP_STATUSES.UNAVAILABLE,
      ].includes(legacyResolution.status)
    ),
  );
  const targetPosition = deterministicSnapped
    ? snapResult.snappedWorldPoint
    : legacySnapped
      ? legacyResolution.candidate.position
      : intent.targetPosition;
  const snapStatus = snapResult?.status
    ?? legacyResolution?.status
    ?? TOPOLOGY_EDIT_SNAP_STATUSES.UNAVAILABLE;
  const material = {
    schema: TOPOLOGY_EDIT_INTERACTION_PREVIEW_SCHEMA,
    basisHash: intent.basisHash,
    nodeId: intent.nodeId,
    intentHash: intent.intentHash,
    snapResolutionHash:
      snapResult?.resultHash
      ?? legacyResolution?.resolutionHash
      ?? null,
    snapResultHash: snapResult?.resultHash ?? null,
    snapStatus,
    snapEvidenceType: deterministicSnapped
      ? snapResult.kind
      : legacySnapped
        ? legacyResolution.candidate.evidenceType
        : null,
    snapTargetCanonicalId: deterministicSnapped
      ? snapResult.targetIds[0] ?? null
      : legacySnapped
        ? legacyResolution.candidate.targetCanonicalId
        : null,
    snapCandidateHash: deterministicSnapped
      ? snapResult.candidate.candidateHash
      : legacySnapped
        ? legacyResolution.candidate.candidateHash
        : null,
    snapCandidateCount: snapResult?.candidateCount
      ?? legacyResolution?.candidates?.length
      ?? 0,
    snapRetainedByHysteresis: Boolean(
      snapResult?.retainedByHysteresis,
    ),
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
