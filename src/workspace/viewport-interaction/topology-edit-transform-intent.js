import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  constrainTopologyEditTarget,
  normalizeTopologyEditTransformMode,
} from './topology-edit-drag-constraint.js';
import {
  finiteTopologyEditPoint,
  normalizeTopologyEditUnits,
  optionalTopologyEditText,
  requiredCanonicalNodeId,
  requiredTopologyEditText,
  topologyEditPointDistance,
} from './topology-edit-interaction-values.js';

export const TOPOLOGY_EDIT_TRANSFORM_INTENT_SCHEMA =
  'TopologyEditTransformIntent.v1';

export const TOPOLOGY_EDIT_INTENT_SOURCES = Object.freeze([
  'DRAG',
  'NUMERIC',
  'KEYBOARD',
]);

const SOURCE_SET = new Set(TOPOLOGY_EDIT_INTENT_SOURCES);

export function createTopologyEditTransformIntent(input = {}) {
  const nodeId = requiredCanonicalNodeId(input.nodeId);
  const basisHash = requiredTopologyEditText(input.basisHash, 'basisHash');
  const source = normalizeSource(input.source);
  const units = normalizeTopologyEditUnits(input.units);
  const mode = normalizeTopologyEditTransformMode(input.mode ?? 'FREE');
  const anchorPosition = finiteTopologyEditPoint(
    input.anchorPosition,
    'anchorPosition',
  );
  const constrained = constrainTopologyEditTarget({
    mode,
    anchorPosition,
    pointerTarget: input.targetPosition,
    units,
  });
  const material = {
    schema: TOPOLOGY_EDIT_TRANSFORM_INTENT_SCHEMA,
    nodeId,
    basisHash,
    source,
    mode,
    anchorPosition,
    targetPosition: constrained.targetPosition,
    delta: constrained.delta,
    units,
    snapResolutionHash: optionalTopologyEditText(input.snapResolutionHash),
    hasMovement:
      topologyEditPointDistance(anchorPosition, constrained.targetPosition) > 0,
  };
  return deepFreeze({
    ...material,
    intentHash: semanticHash(material),
  });
}

export function assertTopologyEditTransformIntent(value) {
  if (value?.schema !== TOPOLOGY_EDIT_TRANSFORM_INTENT_SCHEMA) {
    throw new TypeError('A valid topology-edit transform intent is required.');
  }
  const rebuilt = createTopologyEditTransformIntent(value);
  if (rebuilt.intentHash !== value.intentHash) {
    throw new RangeError(
      'Topology-edit transform intent differs from normalized authority.',
    );
  }
  return rebuilt;
}

export function compileTopologyEditMoveNodePayload(intent) {
  const normalized = assertTopologyEditTransformIntent(intent);
  return deepFreeze({
    nodeId: normalized.nodeId,
    position: normalized.targetPosition,
  });
}

function normalizeSource(value) {
  const source = requiredTopologyEditText(
    value ?? 'DRAG',
    'source',
  ).toUpperCase();
  if (!SOURCE_SET.has(source)) {
    throw new RangeError(`Unsupported topology-edit intent source ${source}.`);
  }
  return source;
}
