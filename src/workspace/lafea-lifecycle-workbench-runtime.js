import {
  LAFEA_WORKBENCH_STATE_SCHEMA,
  createLifecycleFailureDiagnostic,
  freezeLifecycleValue,
} from './lafea-lifecycle-workbench-contracts.js';
import {
  createLifecycleWorkbenchAuthority,
} from './lafea-lifecycle-workbench-authority.js';

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
    this.suppressBasePublish = false;
    this.listeners = new Set();
    this.authority = createLifecycleWorkbenchAuthority(
      this.baseState,
      configuration.initialSourceHash,
    );
    this.unsubscribeBase = base.subscribe((next) => this.onBasePublish(next));
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
        this.authority.deriveStage(stageId, stage),
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

  mutateBase(originRef, operation, sourceHash = null) {
    const previous = this.baseState;
    this.suppressBasePublish = true;
    try {
      this.baseState = operation();
    } finally {
      this.suppressBasePublish = false;
    }
    this.authority.updateBindings(previous, this.baseState, originRef);
    this.authority.bindImportedSource(
      this.baseState,
      sourceHash,
      originRef,
      this.canBindImportedSource(this.baseState),
    );
    this.clearOverlayMessage();
    return this.publish();
  }

  initializeLifecycle(sourceHash, originRef = 'EXTERNAL_SOURCE_AUTHORITY') {
    return this.executeLifecycleAction(
      () => this.authority.initialize(
        this.baseState,
        sourceHash,
        originRef,
      ),
      'LAFEA_LIFECYCLE_INITIALIZATION_REJECTED',
    );
  }

  applyLifecycleEvent(event) {
    return this.executeLifecycleAction(
      () => this.authority.applyEvent(this.baseState, event),
      'LAFEA_LIFECYCLE_EVENT_REJECTED',
    );
  }

  registerLifecycleArtifact(record, registrationId) {
    return this.executeLifecycleAction(
      () => this.authority.registerArtifact(
        this.baseState,
        record,
        registrationId,
      ),
      'LAFEA_LIFECYCLE_REGISTRATION_REJECTED',
    );
  }

  revalidateLifecycleBinding(sourceHash, originRef = 'EXTERNAL_REVALIDATION') {
    return this.executeLifecycleAction(
      () => this.authority.revalidate(
        this.baseState,
        sourceHash,
        originRef,
      ),
      'LAFEA_LIFECYCLE_REVALIDATION_REJECTED',
    );
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
      exportLifecycle: () => this.authority.export(this.baseState),
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
