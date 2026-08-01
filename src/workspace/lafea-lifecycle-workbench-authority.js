import {
  applyLafeaLifecycleEvent,
  createLafeaLifecycle,
  registerLafeaArtifact,
} from './lafea-lifecycle.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';
import {
  DISPLAY_CHANGE_CLASSES,
  SOURCE_CHANGE_CLASSES,
  createLifecycleAction,
  currentLifecycleBinding,
  freezeLifecycleValue,
  initialLifecycleOverlay,
  lifecycleStoreError,
  projectedLifecycleReadiness,
  requireCurrentLifecycleBinding,
  requireLifecycleStageDocument,
  safeDocumentDigest,
  transitionedLifecycleBinding,
} from './lafea-lifecycle-workbench-contracts.js';

export function createLifecycleWorkbenchAuthority(baseState, initialSourceHash) {
  return new LifecycleWorkbenchAuthority(baseState, initialSourceHash);
}

class LifecycleWorkbenchAuthority {
  constructor(baseState, initialSourceHash) {
    this.sequence = 0;
    this.byStage = Object.fromEntries(
      Object.entries(baseState.stages).map(([stageId, stage]) => [
        stageId,
        initialLifecycleOverlay(stage.document),
      ]),
    );
    this.initializeConfiguredSource(baseState, initialSourceHash);
  }

  initializeConfiguredSource(baseState, sourceHash) {
    if (typeof sourceHash !== 'string') return;
    const stageId = baseState.activeStageId;
    const document = requireLifecycleStageDocument(baseState, stageId);
    this.byStage[stageId] = this.initializedOverlay(
      stageId,
      document,
      sourceHash,
      'INITIAL_SOURCE_AUTHORITY',
    );
  }

  deriveStage(stageId, stage) {
    const overlay = this.byStage[stageId]
      ?? initialLifecycleOverlay(stage.document);
    return freezeLifecycleValue({
      ...stage,
      lifecycle: overlay.lifecycle,
      lifecycleBinding: overlay.binding,
      lifecycleReadiness: projectedLifecycleReadiness(
        stageId,
        overlay.lifecycle,
        overlay.binding,
      ),
      lastLifecycleAction: overlay.lastLifecycleAction,
    });
  }

  updateBindings(previous, next, originRef) {
    for (const stageId of Object.keys(next.stages)) {
      const before = previous.stages[stageId]?.document ?? null;
      const after = next.stages[stageId]?.document ?? null;
      if (safeDocumentDigest(before) === safeDocumentDigest(after)) continue;
      const overlay = this.byStage[stageId]
        ?? initialLifecycleOverlay(before);
      this.byStage[stageId] = freezeLifecycleValue({
        ...overlay,
        binding: transitionedLifecycleBinding(overlay, after, originRef),
        lastLifecycleAction: this.action(
          'DOCUMENT_TRANSITION',
          originRef,
          null,
        ),
      });
    }
  }

  bindImportedSource(baseState, sourceHash, originRef, eligible) {
    if (sourceHash === null || !eligible) return;
    const stageId = baseState.activeStageId;
    const document = requireLifecycleStageDocument(baseState, stageId);
    this.byStage[stageId] = this.initializedOverlay(
      stageId,
      document,
      sourceHash,
      originRef,
    );
  }

  initialize(baseState, sourceHash, originRef) {
    const stageId = baseState.activeStageId;
    const document = requireLifecycleStageDocument(baseState, stageId);
    this.byStage[stageId] = this.initializedOverlay(
      stageId,
      document,
      sourceHash,
      originRef,
    );
  }

  applyEvent(baseState, event) {
    const stageId = baseState.activeStageId;
    const overlay = this.requireOverlay(stageId);
    this.requireMatchingStage(stageId, event);
    if (!SOURCE_CHANGE_CLASSES.has(event.changeClass)
      && !DISPLAY_CHANGE_CLASSES.has(event.changeClass)) {
      requireCurrentLifecycleBinding(overlay.binding);
    }
    const lifecycle = applyLafeaLifecycleEvent(overlay.lifecycle, event);
    const binding = this.eventBinding(baseState, stageId, overlay, event);
    this.byStage[stageId] = freezeLifecycleValue({
      lifecycle,
      binding,
      lastLifecycleAction: this.action('EVENT', event.originRef, event.eventId),
    });
  }

  registerArtifact(baseState, record, registrationId) {
    const stageId = baseState.activeStageId;
    const overlay = this.requireOverlay(stageId);
    requireCurrentLifecycleBinding(overlay.binding);
    this.byStage[stageId] = freezeLifecycleValue({
      lifecycle: registerLafeaArtifact(
        overlay.lifecycle,
        record,
        registrationId,
      ),
      binding: overlay.binding,
      lastLifecycleAction: this.action(
        'REGISTER_ARTIFACT',
        record?.producerRef ?? 'UNKNOWN_PRODUCER',
        registrationId,
      ),
    });
  }

  revalidate(baseState, sourceHash, originRef) {
    const stageId = baseState.activeStageId;
    const overlay = this.requireOverlay(stageId);
    const document = requireLifecycleStageDocument(baseState, stageId);
    this.requireMatchingSource(overlay, sourceHash);
    this.requireMatchingDocument(overlay, document);
    this.byStage[stageId] = freezeLifecycleValue({
      ...overlay,
      binding: currentLifecycleBinding(document, originRef),
      lastLifecycleAction: this.action(
        'REVALIDATE_BINDING',
        originRef,
        null,
      ),
    });
  }

  export(baseState) {
    const stageId = baseState.activeStageId;
    const overlay = this.byStage[stageId]
      ?? initialLifecycleOverlay(baseState.stages[stageId].document);
    return freezeLifecycleValue({
      schema: 'lafea-workbench-lifecycle-export/v1',
      stageId,
      lifecycle: overlay.lifecycle,
      binding: overlay.binding,
      readiness: projectedLifecycleReadiness(
        stageId,
        overlay.lifecycle,
        overlay.binding,
      ),
    });
  }

  initializedOverlay(stageId, document, sourceHash, originRef) {
    return freezeLifecycleValue({
      lifecycle: createLafeaLifecycle(stageId, sourceHash),
      binding: currentLifecycleBinding(document, originRef),
      lastLifecycleAction: this.action('INITIALIZE', originRef, null),
    });
  }

  eventBinding(baseState, stageId, overlay, event) {
    if (!SOURCE_CHANGE_CLASSES.has(event.changeClass)) return overlay.binding;
    return currentLifecycleBinding(
      requireLifecycleStageDocument(baseState, stageId),
      event.originRef,
    );
  }

  requireOverlay(stageId) {
    requireLafeaStageRegistryEntry(stageId);
    const overlay = this.byStage[stageId];
    if (overlay?.lifecycle) return overlay;
    throw lifecycleStoreError(
      'LAFEA_LIFECYCLE_NOT_INITIALIZED',
      'Initialize lifecycle with an opaque source hash before registering evidence.',
    );
  }

  requireMatchingStage(stageId, event) {
    if (event?.stageId === stageId) return;
    throw lifecycleStoreError(
      'LAFEA_LIFECYCLE_STAGE_MISMATCH',
      `Active stage ${stageId} cannot apply a ${event?.stageId ?? 'missing'} lifecycle event.`,
    );
  }

  requireMatchingSource(overlay, sourceHash) {
    if (overlay.lifecycle.source.sourceHash === sourceHash) return;
    throw lifecycleStoreError(
      'LAFEA_LIFECYCLE_SOURCE_HASH_MISMATCH',
      'Revalidation source hash does not match the retained lifecycle source.',
    );
  }

  requireMatchingDocument(overlay, document) {
    if (safeDocumentDigest(document) === overlay.binding.boundDocumentDigest) return;
    throw lifecycleStoreError(
      'LAFEA_LIFECYCLE_DOCUMENT_REVISION_MISMATCH',
      'The current document does not match the editor revision bound to this lifecycle.',
    );
  }

  action(action, originRef, referenceId) {
    this.sequence += 1;
    return createLifecycleAction(
      this.sequence,
      action,
      originRef,
      referenceId,
    );
  }
}
