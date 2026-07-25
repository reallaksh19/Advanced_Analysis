import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';
import { SHARED_MODEL_EVENTS } from './shared-model-events.js';
import { createSharedModelExportArtifact, triggerSharedModelDownload } from './shared-model-export.js';
import { WorkspaceState } from './workspace-state.js';

export class SharedModelController {
  constructor(eventBus = EventBus, workspaceState = WorkspaceState, documentRef = globalThis.document) {
    this.eventBus = eventBus;
    this.workspaceState = workspaceState;
    this.documentRef = documentRef;
    this.unsubscribeCallbacks = [];
  }

  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, ({ snapshot }) => this.publishModel(snapshot)),
      this.eventBus.subscribe(SHARED_MODEL_EVENTS.EXPORT_REQUESTED, () => this.exportCurrentModel()),
    ];
    this.publishModel(this.workspaceState.getSnapshot());
  }

  publishModel(snapshot) {
    const model = snapshot?.status === 'ready' ? snapshot.dataset?.sharedModel || null : null;
    this.eventBus.publish(SHARED_MODEL_EVENTS.CHANGED, { model });
  }

  exportCurrentModel() {
    try {
      const model = this.currentModel();
      if (!model) throw new Error('Import a dataset before exporting the shared model.');
      const artifact = createSharedModelExportArtifact(model);
      triggerSharedModelDownload(this.documentRef, artifact);
      this.eventBus.publish(SHARED_MODEL_EVENTS.EXPORT_COMPLETED, { artifact });
    } catch (error) {
      this.eventBus.publish(SHARED_MODEL_EVENTS.EXPORT_FAILED, {
        code: 'SHARED_MODEL_EXPORT_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  currentModel() {
    const snapshot = this.workspaceState.getSnapshot();
    return snapshot.status === 'ready' ? snapshot.dataset?.sharedModel || null : null;
  }

  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
  }
}
