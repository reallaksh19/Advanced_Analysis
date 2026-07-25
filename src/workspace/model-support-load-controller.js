import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';
import {
  createModelSupportLoadReadinessEvent,
  MODEL_SUPPORT_LOAD_READINESS_TOPIC,
} from './model-support-load-contract.js';
import { assessModelSupportLoadReadiness } from './model-support-load-readiness.js';
import { WorkspaceState } from './workspace-state.js';

export class ModelSupportLoadController {
  constructor(eventBus = EventBus, workspaceState = WorkspaceState) {
    this.eventBus = eventBus;
    this.workspaceState = workspaceState;
    this.unsubscribeCallbacks = [];
  }

  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(
        EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED,
        ({ snapshot }) => this.publishReadiness(snapshot),
      ),
      this.eventBus.subscribe(
        EVENT_TOPICS.DATASET_CLEARED,
        () => this.publishEvent(null),
      ),
    ];
    this.publishReadiness(this.workspaceState.getSnapshot());
  }

  publishReadiness(snapshot) {
    if (snapshot?.status !== 'ready' || !snapshot.dataset) return;
    try {
      this.publishEvent(assessModelSupportLoadReadiness(snapshot.dataset));
    } catch (error) {
      this.publishEvent(null, error instanceof Error ? error.message : String(error));
    }
  }

  publishEvent(readiness, error = '') {
    this.eventBus.publish(
      MODEL_SUPPORT_LOAD_READINESS_TOPIC,
      createModelSupportLoadReadinessEvent(readiness, error),
    );
  }

  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
  }
}
