import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { normalizeTopologyEditTransformMode } from './topology-edit-drag-constraint.js';
import { createTopologyEditInteractionPreview } from './topology-edit-interaction-preview.js';
import {
  addTopologyEditPoints,
  finiteTopologyEditPoint,
  positiveTopologyEditNumber,
  requiredCanonicalNodeId,
  requiredTopologyEditText,
} from './topology-edit-interaction-values.js';
import { createTopologyEditNumericEntry } from './topology-edit-numeric-entry.js';
import {
  compileTopologyEditMoveNodePayload,
  createTopologyEditTransformIntent,
} from './topology-edit-transform-intent.js';

export const TOPOLOGY_EDIT_INTERACTION_RUNTIME_SCHEMA =
  'TopologyEditInteractionRuntimeState.v1';

const AXIS_VECTORS = Object.freeze({
  X: Object.freeze({ x: 1, y: 0, z: 0 }),
  Y: Object.freeze({ x: 0, y: 1, z: 0 }),
  Z: Object.freeze({ x: 0, y: 0, z: 1 }),
});

export class TopologyEditInteractionRuntime {
  constructor() {
    this.state = idleState();
  }

  rebase(input = {}) {
    const material = {
      schema: TOPOLOGY_EDIT_INTERACTION_RUNTIME_SCHEMA,
      status: 'READY',
      nodeId: requiredCanonicalNodeId(input.nodeId),
      basisHash: requiredTopologyEditText(input.basisHash, 'basisHash'),
      anchorPosition: finiteTopologyEditPoint(
        input.anchorPosition,
        'anchorPosition',
      ),
      mode: normalizeTopologyEditTransformMode(input.mode ?? 'AXIS_X'),
      intent: null,
      preview: null,
      units: 'MM',
    };
    this.state = finalize(material);
    return this.state;
  }

  clear() {
    this.state = idleState();
    return this.state;
  }

  setMode(mode) {
    assertReady(this.state);
    this.state = finalize({
      ...runtimeMaterial(this.state),
      mode: normalizeTopologyEditTransformMode(mode),
      intent: null,
      preview: null,
    });
    return this.state;
  }

  previewTarget(input = {}) {
    assertReady(this.state);
    const snapResolution = input.snapResolution ?? null;
    const intent = createTopologyEditTransformIntent({
      nodeId: this.state.nodeId,
      basisHash: this.state.basisHash,
      source: input.source ?? 'DRAG',
      mode: input.mode ?? this.state.mode,
      anchorPosition: this.state.anchorPosition,
      targetPosition: input.targetPosition,
      snapResolutionHash: snapResolution?.resolutionHash ?? null,
      units: 'MM',
    });
    const preview = createTopologyEditInteractionPreview({
      intent,
      snapResolution,
    });
    this.state = finalize({
      ...runtimeMaterial(this.state),
      mode: intent.mode,
      intent,
      preview,
    });
    return this.state;
  }

  previewNumeric(input = {}) {
    assertReady(this.state);
    const entry = createTopologyEditNumericEntry({
      ...input,
      anchorPosition: this.state.anchorPosition,
      units: 'MM',
    });
    return this.previewTarget({
      source: 'NUMERIC',
      mode: input.mode ?? 'FREE',
      targetPosition: entry.targetPosition,
    });
  }

  nudge(input = {}) {
    assertReady(this.state);
    const axis = String(input.axis ?? '').trim().toUpperCase();
    if (!AXIS_VECTORS[axis]) throw new RangeError(`Unsupported nudge axis ${axis}.`);
    const direction = Number(input.direction);
    if (direction !== -1 && direction !== 1) {
      throw new RangeError('Nudge direction must be -1 or 1.');
    }
    const incrementMm = positiveTopologyEditNumber(
      input.incrementMm,
      'incrementMm',
    );
    const base = this.state.preview?.targetPosition
      ?? this.state.anchorPosition;
    const vector = AXIS_VECTORS[axis];
    return this.previewTarget({
      source: 'KEYBOARD',
      mode: `AXIS_${axis}`,
      targetPosition: addTopologyEditPoints(base, {
        x: vector.x * incrementMm * direction,
        y: vector.y * incrementMm * direction,
        z: vector.z * incrementMm * direction,
      }),
    });
  }

  cancel() {
    if (this.state.status !== 'READY') return this.state;
    this.state = finalize({
      ...runtimeMaterial(this.state),
      intent: null,
      preview: null,
    });
    return this.state;
  }

  compileApply() {
    assertReady(this.state);
    const intent = this.state.intent;
    const preview = this.state.preview;
    if (!intent?.hasMovement || !preview?.canApply) {
      throw new RangeError('A current moving interaction preview is required.');
    }
    if (intent.basisHash !== this.state.basisHash
      || preview.basisHash !== this.state.basisHash) {
      throw new RangeError('Interaction preview has a stale basis.');
    }
    return deepFreeze({
      runtimeHash: this.state.runtimeHash,
      intent,
      preview,
      payload: compileTopologyEditMoveNodePayload(intent),
    });
  }

  snapshot() {
    return this.state;
  }
}

function idleState() {
  return finalize({
    schema: TOPOLOGY_EDIT_INTERACTION_RUNTIME_SCHEMA,
    status: 'IDLE',
    nodeId: null,
    basisHash: null,
    anchorPosition: null,
    mode: 'AXIS_X',
    intent: null,
    preview: null,
    units: 'MM',
  });
}

function runtimeMaterial(state) {
  return {
    schema: state.schema,
    status: state.status,
    nodeId: state.nodeId,
    basisHash: state.basisHash,
    anchorPosition: state.anchorPosition,
    mode: state.mode,
    intent: state.intent,
    preview: state.preview,
    units: state.units,
  };
}

function finalize(material) {
  return deepFreeze({ ...material, runtimeHash: semanticHash(material) });
}

function assertReady(state) {
  if (state?.schema !== TOPOLOGY_EDIT_INTERACTION_RUNTIME_SCHEMA
    || state.status !== 'READY') {
    throw new TypeError('A ready topology-edit interaction runtime is required.');
  }
}
