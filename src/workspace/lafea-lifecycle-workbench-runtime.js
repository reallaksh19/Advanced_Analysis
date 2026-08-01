import {
  applyLafeaLifecycleEvent,
  createLafeaLifecycle,
  registerLafeaArtifact,
} from './lafea-lifecycle.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';
import {
  DISPLAY_CHANGE_CLASSES,
  LAFEA_WORKBENCH_STATE_SCHEMA,
  SOURCE_CHANGE_CLASSES,
  createLifecycleAction,
  createLifecycleFailureDiagnostic,
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

export function createLafeaLifecycleWorkbenchRuntime(input) {
  return new LafeaLifecycleWorkbenchRuntime(input).publicFacade();
}

class LafeaLifecycleWorkbenchRuntime {
  constructor({ base, configuration, canBindImportedSource }) {
    this.base = base;
    this.canBindImportedSource = canBindImportedSource;
    this.baseState = base.getState();
    this.overlayStatus = null;
    this.overlayDiagnostics = null;
    this.lifecycleSequence = 0;
    this.suppressBasePublish = false;
    this.listeners = new Set();
    this.lifecycleByStage = this.createInitialOverlays();
    this.initializeConfiguredSource(configuration.initialSourceHash);
    this.unsubscribeBase = base.subscribe((next) => this.onBasePublish(next));
  }

  createInitialOverlays() {
    return Object.fromEntries(
      Object.entries(this.baseState.stages).map(([stageId, stage]) => [
        stageId,
        initialLifecycleOverlay(stage.document),
      ]),
    );
  }

  initializeConfiguredSource(sourceHash) {
    if (typeof sourceHash !== 'string') return;
    const stageId = this.baseState.activeStageId;
    const document = requireLifecycleStageDocument(this.baseState, stageId);
    this.lifecycleByStage[stageId] = freezeLifecycleValue({
      lifecycle: createLafeaLifecycle(stageId, sourceHash),
      binding: currentLifecycleBinding(document, 'INITIAL_SOURCE_AUTHORITY'),
      lastLifecycleAction: this.action(
        'INITIALIZE',
        'INITIAL_SOURCE_AUTHORITY',
        null,
      ),
    });
  }

  onBasePublish(next) {
    this.baseState = next;
    if (!this.suppressBasePublish) this.publish();
  }

  publish() {
    const state = this.deriveState();
    this.listeners.forEach((listener) => listener(state));
    return state;
  }

  deriveState() {
    const stages = Object.fromEntries(
      Object.entries(this.baseState.stages).map(([stageId, stage]) => [
        stageId,
        this.deriveStage(stageId, stage),
      ]),
    );
    return freezeLifecycleValue({
      ...this.baseState,
      schema: LAFEA_WORKBENCH_STATE_SCHEMA,
      stages,
      status: this.overlayStatus ?? this.baseState.status,
      diagnostics: this.overlayDiagnostics ?? this.baseState.diagnostics,
    });
  }

  deriveStage(stageId, stage) {
    const overlay = this.lifecycleByStage[stageId]
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

  mutateBase(originRef, operation, sourceHash = null) {
    const previous = this.baseState;
    this.suppressBasePublish = true;
    try {
      this.baseState = operation();
    } finally {
      this.suppressBasePublish = false;
    }
    this.updateBindings(previous, this.baseState, originRef);
    this.bindImportedSource(sourceHash, originRef);
    this.clearOverlayMessage();
    return this.publish();
  }

  updateBindings(previous, next, originRef) {
    for (const stageId of Object.keys(next.stages)) {
      const before = previous.stages[stageId]?.document ?? null;
      const after = next.stages[stageId]?.document ?? null;
      if (safeDocumentDigest(before) === safeDocumentDigest(after)) continue;
      const overlay = this.lifecycleByStage[stageId]
        ?? initialLifecycleOverlay(before);
      this.lifecycleByStage[stageId] = freezeLifecycleValue({
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

  bindImportedSource(sourceHash, originRef) {
    if (sourceHash === null || !this.canBindImportedSource(this.baseState)) return;
    const stageId = this.baseState.activeStageId;
    const document = requireLifecycleStageDocument(this.baseState, stageId);
    this.lifecycleByStage[stageId] = freezeLifecycleValue({
      lifecycle: createLafeaLifecycle(stageId, sourceHash),
      binding: currentLifecycleBinding(document, originRef),
      lastLifecycleAction: this.action('INITIALIZE', originRef, null),
    });
  }

  requireOverlay(stageId) {
    requireLafeaStageRegistryEntry(stageId);
    const overlay = this.lifecycleByStage[stageId];
    if (overlay?.lifecycle) return overlay;
    throw lifecycleStoreError(
      'LAFEA_LIFECYCLE_NOT_INITIALIZED',
      'Initialize lifecycle with an opaque source hash before registering evidence.',
    );
  }

  initializeLifecycle(sourceHash, originRef = 'EXTERNAL_SOURCE_AUTHORITY') {
    return this.executeLifecycleAction(
      () => {
        const stageId = this.baseState.activeStageId;
        const document = requireLifecycleStageDocument(this.baseState, stageId);
        this.lifecycleByStage[stageId] = freezeLifecycleValue({
          lifecycle: createLafeaLifecycle(stageId, sourceHash),
          binding: currentLifecycleBinding(document, originRef),
          lastLifecycleAction: this.action('INITIALIZE', originRef, null),
        });
      },
      'LAFEA_LIFECYCLE_INITIALIZATION_REJECTED',
    );
  }

  applyLifecycleEvent(event) {
    return this.executeLifecycleAction(
      () => this.applyEvent(event),
      'LAFEA_LIFECYCLE_EVENT_REJECTED',
    );
  }

  applyEvent(event) {
    const stageId = this.baseState.activeStageId;
    const overlay = this.requireOverlay(stageId);
    if (event?.stageId !== stageId) {
      throw lifecycleStoreError(
        'LAFEA_LIFECYCLE_STAGE_MISMATCH',
        `Active stage ${stageId} cannot apply a ${event?.stageId ?? 'missing'} lifecycle event.`,
      );
    }
    if (!SOURCE_CHANGE_CLASSES.has(event.changeClass)
      && !DISPLAY_CHANGE_CLASSES.has(event.changeClass)) {
      requireCurrentLifecycleBinding(overlay.binding);
    }
    const lifecycle = applyLafeaLifecycleEvent(overlay.lifecycle, event);
    const binding = SOURCE_CHANGE_CLASSES.has(event.changeClass)
      ? currentLifecycleBinding(
        requireLifecycleStageDocument(this.baseState, stageId),
        event.originRef,
      )
      : overlay.binding;
    this.lifecycleByStage[stageId] = freezeLifecycleValue({
      lifecycle,
      binding,
      lastLifecycleAction: this.action('EVENT', event.originRef, event.eventId),
    });
  }

  registerLifecycleArtifact(record, registrationId) {
    return this.executeLifecycleAction(
      () => this.registerArtifact(record, registrationId),
      'LAFEA_LIFECYCLE_REGISTRATION_REJECTED',
    );
  }

  registerArtifact(record, registrationId) {
    const stageId = this.baseState.activeStageId;
    const overlay = this.requireOverlay(stageId);
    requireCurrentLifecycleBinding(overlay.binding);
    this.lifecycleByStage[stageId] = freezeLifecycleValue({
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

  revalidateLifecycleBinding(sourceHash, originRef = 'EXTERNAL_REVALIDATION') {
    return this.executeLifecycleAction(
      () => this.revalidateBinding(sourceHash, originRef),
      'LAFEA_LIFECYCLE_REVALIDATION_REJECTED',
    );
  }

  revalidateBinding(sourceHash, originRef) {
    const stageId = this.baseState.activeStageId;
    const overlay = this.requireOverlay(stageId);
    const document = requireLifecycleStageDocument(this.baseState, stageId);
    if (overlay.lifecycle.source.sourceHash !== sourceHash) {
      throw lifecycleStoreError(
        'LAFEA_LIFECYCLE_SOURCE_HASH_MISMATCH',
        'Revalidation source hash does not match the retained lifecycle source.',
      );
    }
    if (safeDocumentDigest(document) !== overlay.binding.boundDocumentDigest) {
      throw lifecycleStoreError(
        'LAFEA_LIFECYCLE_DOCUMENT_REVISION_MISMATCH',
        'The current document does not match the editor revision bound to this lifecycle.',
      );
    }
    this.lifecycleByStage[stageId] = freezeLifecycleValue({
      ...overlay,
      binding: currentLifecycleBinding(document, originRef),
      lastLifecycleAction: this.action(
        'REVALIDATE_BINDING',
        originRef,
        null,
      ),
    });
  }

  executeLifecycleAction(operation, fallbackCode) {
    try {
      operation();
      this.overlayStatus = 'READY';
      this.overlayDiagnostics = [];
    } catch (error) {
      this.overlayStatus = 'FAILED';
      this.overlayDiagnostics = [
        createLifecycleFailureDiagnostic(error, fallbackCode),
      ];
    }
    return this.publish();
  }

  exportLifecycle() {
    const stageId = this.baseState.activeStageId;
    const overlay = this.lifecycleByStage[stageId]
      ?? initialLifecycleOverlay(this.baseState.stages[stageId].document);
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

  action(actionName, originRef, referenceId) {
    this.lifecycleSequence += 1;
    return createLifecycleAction(
      this.lifecycleSequence,
      actionName,
      originRef,
      referenceId,
    );
  }

  clearOverlayMessage() {
    this.overlayStatus = null;
    this.overlayDiagnostics = null;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('LAFEA subscriber must be a function.');
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publicFacade() {
    return Object.freeze({
      selectStage: (stageId) => this.mutateBase(
        'SELECT_STAGE',
        () => this.base.selectStage(stageId),
      ),
      importDocument: (value, stageId, sourceHash = null) => this.mutateBase(
        'IMPORT_DOCUMENT',
        () => this.base.importDocument(value, stageId),
        sourceHash,
      ),
      applyEditCommand: (command) => this.mutateBase(
        command?.commandId ?? 'APPLY_EDIT_COMMAND',
        () => this.base.applyEditCommand(command),
      ),
      setScalar: (...args) => this.mutateBase(
        `SET_SCALAR:${args[0]}`,
        () => this.base.setScalar(...args),
      ),
      replaceDocument: (value, surface) => this.mutateBase(
        'REPLACE_DOCUMENT',
        () => this.base.replaceDocument(value, surface),
      ),
      moveNode: (...args) => this.mutateBase(
        `MOVE_NODE:${args[1]}`,
        () => this.base.moveNode(...args),
      ),
      reportEditError: (...args) => this.mutateBase(
        'REPORT_EDIT_ERROR',
        () => this.base.reportEditError(...args),
      ),
      run: () => this.mutateBase('RUN_CALCULATION', () => this.base.run()),
      undo: () => this.mutateBase('UNDO', () => this.base.undo()),
      redo: () => this.mutateBase('REDO', () => this.base.redo()),
      exportDocument: () => this.base.exportDocument(),
      initializeLifecycle: (...args) => this.initializeLifecycle(...args),
      applyLifecycleEvent: (event) => this.applyLifecycleEvent(event),
      registerLifecycleArtifact: (...args) => this.registerLifecycleArtifact(...args),
      revalidateLifecycleBinding: (...args) => this.revalidateLifecycleBinding(...args),
      exportLifecycle: () => this.exportLifecycle(),
      subscribe: (listener) => this.subscribe(listener),
      getState: () => this.deriveState(),
      destroy: () => this.destroy(),
    });
  }

  destroy() {
    this.unsubscribeBase();
    this.base.destroy();
    this.listeners.clear();
  }
}
