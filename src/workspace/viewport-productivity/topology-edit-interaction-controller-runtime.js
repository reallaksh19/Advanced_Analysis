import * as THREE from 'three';
import { semanticHash } from '../../core/shared-piping-model/index.js';
import {
  TopologyEditSnapStoreController,
} from '../topology-edit/editor-state/topology-edit-snap-store-controller.js';
import {
  createTopologyEditGizmoModel,
} from '../viewport-interaction/topology-edit-gizmo-model.js';
import {
  createTopologyEditSnapQuery,
} from '../viewport-interaction/topology-edit-snap-contract.js';
import {
  resolveTopologyEditDeterministicSnap,
} from '../viewport-interaction/topology-edit-deterministic-snap-engine.js';
import {
  resolveTopologyEditSceneSnap,
} from '../viewport-interaction/topology-edit-snap-collector.js';
import {
  createTopologyEditSnapSpatialIndex,
} from '../viewport-interaction/topology-edit-snap-spatial-index.js';
import {
  TopologyEditInteractionViewportAdapter,
} from '../viewport-interaction/topology-edit-interaction-viewport-adapter.js';
import {
  createTopologyEditDragSessionPreview,
  selectedTopologyEditNodeContext,
} from './topology-edit-interaction-session.js';

const KEYBOARD_NUDGES = Object.freeze({
  ArrowLeft: Object.freeze({ axis: 'X', directionSign: -1 }),
  ArrowRight: Object.freeze({ axis: 'X', directionSign: 1 }),
  ArrowDown: Object.freeze({ axis: 'Y', directionSign: -1 }),
  ArrowUp: Object.freeze({ axis: 'Y', directionSign: 1 }),
  PageDown: Object.freeze({ axis: 'Z', directionSign: -1 }),
  PageUp: Object.freeze({ axis: 'Z', directionSign: 1 }),
});

let nextSnapInteractionSequence = 1;

export class TopologyEditInteractionControllerRuntime {
  constructor(controller, options = {}) {
    if (!controller) throw new TypeError('Interaction controller runtime requires a controller.');
    this.controller = controller;
    this.snapToleranceMm = positive(options.snapToleranceMm ?? 25, 'snapToleranceMm');
    this.gridSizeMm = positive(options.gridSizeMm ?? 25, 'gridSizeMm');
    this.snapIndexCellSizeMm = positive(
      options.snapIndexCellSizeMm ?? 500,
      'snapIndexCellSizeMm',
    );
    this.deterministicSnapping = options.deterministicSnapping !== false;
    this.viewport = null;
    this.gizmo = null;
    this.activeMode = null;
    this.snapStore = null;
    this.snapIndex = null;
    this.snapIndexContextHash = null;
    this.snapResult = null;
    this.interactionId = null;
    this.querySequence = 0;
    this.lastDragEvidence = null;
  }

  mount() {
    this.destroy();
    const backend = this.controller.viewportBackend;
    if (!backend) throw new Error('Topology-edit viewport backend is unavailable.');
    this.ensureSnapStore();
    this.viewport = new TopologyEditInteractionViewportAdapter({
      backend,
      onDragStart: (evidence) => this.beginDrag(evidence),
      onDragMove: (evidence) => this.previewDrag(evidence, false),
      onDragEnd: (evidence) => this.endDrag(evidence),
      onCancel: ({ reason }) => this.cancelDrag(reason),
      onKey: (event) => this.handleKey(event),
    });
    this.viewport.mount();
    this.sync();
  }

  sync() {
    if (!this.viewport) return;
    this.ensureSnapStore();
    if (this.snapStore
      && !this.activeMode
      && !this.controller.interactionPreview
      && this.controller.editorStore.getState().interaction.mode !== 'IDLE') {
      this.clearSnapInteraction();
    }
    const context = this.selectedContext();
    if (!context) {
      this.gizmo = null;
      this.viewport.render(null);
      this.clearSnapInteraction();
      this.syncEvidence();
      return;
    }
    if (this.snapIndex?.basisHash !== context.basisHash) {
      this.snapIndex = null;
      this.snapIndexContextHash = null;
      this.snapResult = null;
    }
    const backend = this.controller.viewportBackend;
    const camera = backend?.activeCamera;
    const canvas = backend?.renderer?.domElement;
    if (!camera || !canvas) {
      this.gizmo = null;
      this.viewport.render(null);
      this.syncEvidence();
      return;
    }
    const anchor = new THREE.Vector3(
      context.anchorPosition.x,
      context.anchorPosition.y,
      context.anchorPosition.z,
    );
    const cameraDistanceMm = Math.max(camera.position.distanceTo(anchor), 0.001);
    this.gizmo = createTopologyEditGizmoModel({
      nodeId: context.nodeId,
      basisHash: context.basisHash,
      anchorPosition: context.anchorPosition,
      cameraDistanceMm,
      viewportHeightPx: canvas.clientHeight || 500,
      perspectiveFovDeg: camera.isPerspectiveCamera ? camera.fov : 45,
    });
    this.viewport.render(this.gizmo, this.controller.interactionPreview);
    this.syncEvidence();
  }

  beginDrag(input) {
    const evidence = normalizeDragEvidence(input);
    this.activeMode = evidence.mode;
    this.controller.interactionError = null;
    this.querySequence = 0;
    this.lastDragEvidence = null;
    this.snapResult = null;
    if (this.snapStore) {
      const identity = this.editorIdentity();
      this.interactionId = [
        'snap-interaction',
        identity.sessionVersion,
        identity.selectionRevision,
        nextSnapInteractionSequence++,
      ].join(':');
      this.snapStore.beginInteraction(this.interactionId);
    } else {
      this.interactionId = null;
    }
    this.controller.setStatus(`Dragging ${evidence.mode}; preview remains display-only.`);
    this.syncEvidence();
  }

  previewDrag(input, targetPositionOrAnnounce, legacyAnnounce = false) {
    const { evidence, announce } = normalizePreviewArguments(
      input,
      targetPositionOrAnnounce,
      legacyAnnounce,
    );
    try {
      if (this.canUseDeterministicSnap(evidence)) {
        return this.previewDeterministicDrag(evidence, announce);
      }
      return this.previewLegacyDrag(evidence, announce);
    } catch (error) {
      this.controller.rejectInteraction(error);
      return null;
    }
  }

  previewDeterministicDrag(evidence, announce) {
    if (!this.interactionId) this.beginDrag(evidence);
    const topology = this.controller.session?.currentTopology();
    const context = selectedTopologyEditNodeContext(
      topology,
      this.controller.selection,
    );
    const index = this.ensureSnapIndex(topology);
    const storeState = this.controller.editorStore.getState();
    const preferences = this.snapStore.preferences();
    this.querySequence += 1;
    const queryId = `${this.interactionId}:query:${this.querySequence}`;
    const activeResult = storeState.snapping.activeResult;
    const query = createTopologyEditSnapQuery({
      queryId,
      interactionId: this.interactionId,
      datasetSourceHash: requiredIdentityText(
        storeState.dataset.sourceHash,
        'dataset source hash',
      ),
      basisHash: context.basisHash,
      sessionVersion: storeState.dataset.sessionVersion,
      selectionRevision: storeState.selection.revision,
      querySequence: this.querySequence,
      pointerScreen: evidence.pointerScreen,
      rawWorldPoint: evidence.targetPosition,
      camera: evidence.cameraSnapshot,
      constraint: {
        mode: evidence.mode,
        anchorWorld: context.anchorPosition,
      },
      enabledKinds: preferences.enabledSnapKinds,
      priorityKinds: preferences.snapPriorityKinds,
      excludedCanonicalIds: storeState.selection.canonicalIds,
      hiddenCanonicalIds: canonicalArray(
        this.controller.snapHiddenCanonicalIds,
      ),
      lockedCanonicalIds: canonicalArray(
        this.controller.snapLockedCanonicalIds,
      ),
      acquireRadiusPx: preferences.snapAcquireRadiusPx,
      releaseRadiusPx: preferences.snapReleaseRadiusPx,
      gridSpacingMm: preferences.gridSpacingMm,
      activeCandidateId: activeResult?.candidateId ?? null,
      cycleIndex: storeState.snapping.cycleIndex,
    });
    const identity = this.currentSnapIdentity(queryId, this.querySequence);
    const queryDisposition = this.snapStore.beginQuery({
      interactionId: this.interactionId,
      queryId,
    });
    if (queryDisposition.disposition !== 'ACCEPTED') {
      throw new RangeError('Snap query interaction identity is stale.');
    }
    const result = resolveTopologyEditDeterministicSnap({
      query,
      index,
      expectedIdentity: identity,
    });
    this.snapResult = result;
    const application = this.snapStore.applyResult(
      result,
      this.currentSnapIdentity(queryId, this.querySequence),
    );
    if (result.status === 'STALE' || application.disposition === 'STALE') {
      this.syncEvidence();
      this.controller.setStatus(
        `Snap result rejected as stale: ${(result.staleFields ?? application.staleFields).join(', ')}.`,
      );
      return null;
    }
    const preview = createTopologyEditDragSessionPreview({
      topology,
      selection: this.controller.selection,
      transformMode: evidence.mode,
      targetPosition: evidence.targetPosition,
      snapResult: result,
    });
    this.lastDragEvidence = evidence;
    const snap = result.status === 'RESOLVED'
      ? `${result.kind} ${result.targetIds.join(',')}`.trim()
      : result.status;
    this.controller.retainInteractionPreview(
      preview,
      `${evidence.mode} gizmo preview updated; snap ${snap}`,
      announce,
    );
    return preview;
  }

  previewLegacyDrag(evidence, announce) {
    const topology = this.controller.session?.currentTopology();
    const context = selectedTopologyEditNodeContext(
      topology,
      this.controller.selection,
    );
    const snapResolution = resolveTopologyEditSceneSnap({
      topology,
      basisHash: context.basisHash,
      nodeId: context.nodeId,
      anchorPosition: context.anchorPosition,
      pointerPoint: evidence.targetPosition,
      transformMode: evidence.mode,
      toleranceMm: this.snapToleranceMm,
      gridSizeMm: this.gridSizeMm,
    });
    const preview = createTopologyEditDragSessionPreview({
      topology,
      selection: this.controller.selection,
      transformMode: evidence.mode,
      targetPosition: evidence.targetPosition,
      snapResolution,
    });
    const snap = snapResolution.status === 'RESOLVED'
      ? `${snapResolution.candidate.evidenceType} ${snapResolution.candidate.targetCanonicalId ?? ''}`.trim()
      : snapResolution.status;
    this.controller.retainInteractionPreview(
      preview,
      `${evidence.mode} gizmo preview updated; snap ${snap}`,
      announce,
    );
    return preview;
  }

  endDrag(input, legacyTargetPosition) {
    const evidence = normalizeDragEvidence(input, legacyTargetPosition);
    this.activeMode = null;
    if (evidence.targetPosition) {
      this.previewDrag(evidence, true);
      this.snapStore?.endInteraction();
      this.interactionId = null;
      this.lastDragEvidence = null;
      this.syncEvidence();
      return;
    }
    this.controller.cancelInteractionPreview(false);
    this.clearSnapInteraction();
  }

  cancelDrag(reason) {
    this.activeMode = null;
    this.controller.cancelInteractionPreview(false);
    this.clearSnapInteraction();
    if (reason !== 'DESTROYED') {
      this.controller.setStatus(`Gizmo drag cancelled: ${reason}.`);
    }
  }

  handleKey(event) {
    if (event.key === 'Tab'
      && this.activeMode
      && this.snapStore
      && this.lastDragEvidence) {
      event.preventDefault();
      event.stopPropagation();
      this.snapStore.cycle(event.shiftKey ? -1 : 1);
      this.previewDrag(this.lastDragEvidence, true);
      return;
    }
    this.controller.handleInteractionKey(event);
  }

  selectedContext() {
    try {
      return selectedTopologyEditNodeContext(
        this.controller.session?.currentTopology(),
        this.controller.selection,
      );
    } catch {
      return null;
    }
  }

  ensureSnapStore() {
    if (!this.deterministicSnapping || !this.controller.editorStore) {
      this.snapStore = null;
      return null;
    }
    if (this.snapStore?.store !== this.controller.editorStore) {
      this.snapStore = new TopologyEditSnapStoreController(
        this.controller.editorStore,
      );
    }
    return this.snapStore;
  }

  ensureSnapIndex(topology) {
    const context = {
      basisHash: topology?.canonicalTopologyHash,
      hiddenCanonicalIds: canonicalArray(
        this.controller.snapHiddenCanonicalIds,
      ),
      lockedCanonicalIds: canonicalArray(
        this.controller.snapLockedCanonicalIds,
      ),
      compatibilityByFeatureId:
        this.controller.snapCompatibilityByFeatureId ?? {},
      cellSizeMm: this.snapIndexCellSizeMm,
    };
    const contextHash = semanticHash(context);
    if (this.snapIndex && this.snapIndexContextHash === contextHash) {
      return this.snapIndex;
    }
    this.snapIndex = createTopologyEditSnapSpatialIndex({
      topology,
      basisHash: context.basisHash,
      cellSizeMm: context.cellSizeMm,
      hiddenCanonicalIds: context.hiddenCanonicalIds,
      lockedCanonicalIds: context.lockedCanonicalIds,
      compatibilityByFeatureId: context.compatibilityByFeatureId,
    });
    this.snapIndexContextHash = contextHash;
    return this.snapIndex;
  }

  editorIdentity() {
    const state = this.controller.editorStore?.getState?.();
    if (!state) throw new Error('Professional editor identity is unavailable.');
    const context = this.selectedContext();
    if (!context) throw new RangeError('Snap interaction requires one selected node.');
    if (state.dataset.canonicalHash
      && state.dataset.canonicalHash !== context.basisHash) {
      throw new RangeError('Snap dataset identity is stale for the current topology basis.');
    }
    return {
      datasetSourceHash: requiredIdentityText(
        state.dataset.sourceHash,
        'dataset source hash',
      ),
      basisHash: context.basisHash,
      sessionVersion: state.dataset.sessionVersion,
      selectionRevision: state.selection.revision,
    };
  }

  currentSnapIdentity(queryId, querySequence) {
    return {
      ...this.editorIdentity(),
      interactionId: this.interactionId,
      queryId,
      querySequence,
    };
  }

  canUseDeterministicSnap(evidence) {
    return Boolean(
      this.ensureSnapStore()
      && evidence.pointerScreen
      && evidence.cameraSnapshot,
    );
  }

  clearSnapInteraction() {
    this.snapStore?.clear();
    this.snapResult = null;
    this.interactionId = null;
    this.querySequence = 0;
    this.lastDragEvidence = null;
    this.syncEvidence();
  }

  syncEvidence() {
    this.controller.updateInteractionEvidence?.();
    const host = this.controller.hostElement;
    if (!host) return;
    const preview = this.controller.interactionPreview;
    const result = this.snapResult;
    const snapping = this.controller.editorStore?.getState?.().snapping;
    host.dataset.topologyEditGizmoHandleCount = String(
      this.gizmo?.handles?.length ?? 0,
    );
    host.dataset.topologyEditInteractionSnapStatus = preview?.snapStatus ?? '';
    host.dataset.topologyEditInteractionSnapEvidence = preview?.snapEvidenceType ?? '';
    host.dataset.topologyEditInteractionSnapTarget = preview?.snapTargetCanonicalId ?? '';
    host.dataset.topologyEditInteractionSnapCandidateHash = preview?.snapCandidateHash ?? '';
    host.dataset.topologyEditSnapEngine = this.snapStore
      ? 'DETERMINISTIC_PHASE_B'
      : 'LEGACY_WORLD_TOLERANCE';
    host.dataset.topologyEditSnapIndexHash = this.snapIndex?.indexHash ?? '';
    host.dataset.topologyEditSnapResultHash = result?.resultHash ?? '';
    host.dataset.topologyEditSnapQueryId = result?.queryId ?? '';
    host.dataset.topologyEditSnapQuerySequence = String(
      result?.querySequence ?? 0,
    );
    host.dataset.topologyEditSnapCandidateCount = String(
      result?.candidateCount ?? 0,
    );
    host.dataset.topologyEditSnapCandidateSetHash =
      result?.candidateSetHash ?? '';
    host.dataset.topologyEditSnapCycleIndex = String(
      snapping?.cycleIndex ?? result?.cycleIndex ?? 0,
    );
    host.dataset.topologyEditSnapRetainedByHysteresis = String(
      Boolean(result?.retainedByHysteresis),
    );
    host.dataset.topologyEditSnapPointCellsVisited = String(
      result?.queryStats?.pointCellsVisited ?? 0,
    );
    host.dataset.topologyEditSnapSegmentCellsVisited = String(
      result?.queryStats?.segmentCellsVisited ?? 0,
    );
    host.dataset.topologyEditSnapSourceFeaturesVisited = String(
      result?.queryStats?.sourceFeaturesVisited ?? 0,
    );
    host.dataset.topologyEditSnapCandidatesGenerated = String(
      result?.queryStats?.candidatesGenerated ?? 0,
    );
    host.dataset.topologyEditSnapStaleFields =
      result?.staleFields?.join(',') ?? '';
  }

  destroy() {
    const viewport = this.viewport;
    this.viewport = null;
    this.gizmo = null;
    this.activeMode = null;
    viewport?.destroy();
    this.snapStore?.clear();
    this.snapStore = null;
    this.snapIndex = null;
    this.snapIndexContextHash = null;
    this.snapResult = null;
    this.interactionId = null;
    this.querySequence = 0;
    this.lastDragEvidence = null;
    this.syncEvidence();
  }
}

export function axisDirection(axisInput) {
  const axis = String(axisInput ?? '').trim().toUpperCase();
  if (!['X', 'Y', 'Z'].includes(axis)) {
    throw new RangeError('Axis must be X, Y or Z.');
  }
  return {
    x: axis === 'X' ? 1 : 0,
    y: axis === 'Y' ? 1 : 0,
    z: axis === 'Z' ? 1 : 0,
  };
}

export function topologyEditKeyboardNudge(key) {
  return KEYBOARD_NUDGES[String(key ?? '')] ?? null;
}

export function isTopologyEditTextControl(target) {
  const name = String(target?.tagName ?? '').toUpperCase();
  return Boolean(
    target?.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(name),
  );
}

function normalizePreviewArguments(input, targetPositionOrAnnounce, legacyAnnounce) {
  if (input && typeof input === 'object') {
    return {
      evidence: normalizeDragEvidence(input),
      announce: typeof targetPositionOrAnnounce === 'boolean'
        ? targetPositionOrAnnounce
        : Boolean(legacyAnnounce),
    };
  }
  return {
    evidence: normalizeDragEvidence(input, targetPositionOrAnnounce),
    announce: Boolean(legacyAnnounce),
  };
}

function normalizeDragEvidence(input, legacyTargetPosition = null) {
  if (input && typeof input === 'object') {
    return {
      mode: String(input.mode ?? '').trim().toUpperCase(),
      pointerId: input.pointerId ?? null,
      targetPosition: input.targetPosition ?? null,
      pointerScreen: input.pointerScreen ?? null,
      cameraSnapshot: input.cameraSnapshot ?? null,
    };
  }
  return {
    mode: String(input ?? '').trim().toUpperCase(),
    pointerId: null,
    targetPosition: legacyTargetPosition,
    pointerScreen: null,
    cameraSnapshot: null,
  };
}

function canonicalArray(value) {
  return Array.isArray(value) ? [...new Set(value)].sort() : [];
}

function requiredIdentityText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} is required for deterministic snapping.`);
  return text;
}

function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${label} must be positive.`);
  }
  return number;
}
