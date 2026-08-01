import { EventBus } from '../event-bus.js';
import { EVENT_TOPICS } from '../event-topics.js';
import { WorkspaceState } from '../workspace-state.js';
import { SequentialCommandGateway } from './sequential-command-gateway.js';
import { createSketcherAuthoringBridge } from './sketcher-authoring-bridge.js';
import { SequentialSketcherView } from './sequential-sketcher-view.js';

export class SequentialSketcherController {
  constructor(rootElement, eventBus = EventBus, workspaceState = WorkspaceState) {
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.workspaceState = workspaceState;
    this.gateway = new SequentialCommandGateway(workspaceState, eventBus);
    this.view = new SequentialSketcherView(rootElement, this.gateway);
    this.currentDataset = null;
    this.unsubscribeCallbacks = [];
    this.authoringBridge = createSketcherAuthoringBridge({
      gateway: this.gateway,
      workspaceState,
      eventTarget: rootElement,
      onSelectionChange: (selection) => this.handleSelection(selection.entityId),
    });
  }

  init() {
    if (this.unsubscribeCallbacks.length) return;

    this.view.onProjectionChange = (projection) => {
      if (this.currentDataset) {
        this.view.render(this.currentDataset, { projection });
      }
    };

    this.view.onSelectEntity = (entityId, entity) => {
      if (!entityId || typeof entityId !== 'string') {
        this.workspaceState.selectEntity(null);
        return;
      }
      this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
        entityId,
        entity,
        source: 'sequential-sketcher',
      });
    };

    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, ({ snapshot }) => this.handleSnapshot(snapshot)),
      this.eventBus.subscribe(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED, (payload) => this.handleSelection(payload.entityId)),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_CLEARED, () => this.handleClear()),
    ];

    const initialSnapshot = this.workspaceState.getSnapshot();
    if (initialSnapshot?.dataset) {
      this.handleSnapshot(initialSnapshot);
    } else {
      this.view.render(null);
    }
  }

  handleSnapshot(snapshot) {
    this.authoringBridge.handleWorkspaceSnapshot(snapshot);
    if (snapshot?.status === 'ready' && snapshot.dataset) {
      this.currentDataset = snapshot.dataset;
      const selectedId = snapshot.selectedEntityId || this.view.selectedEntity?.entityId;
      this.view.selectedEntity = this.currentDataset.entities.find((e) => e.entityId === selectedId)
        || this.currentDataset.entities[0]
        || null;
      this.view.render(this.currentDataset);
    } else {
      this.handleClear();
    }
  }

  handleSelection(entityId) {
    if (!this.currentDataset) return;
    const found = this.currentDataset.entities.find((e) => e.entityId === entityId);
    if (found) {
      this.view.selectedEntity = found;
      this.view.render(this.currentDataset);
    }
  }

  handleClear() {
    this.authoringBridge.handleWorkspaceSnapshot(this.workspaceState.getSnapshot());
    this.currentDataset = null;
    this.view.selectedEntity = null;
    this.view.render(null);
  }

  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.authoringBridge.destroy();
    this.currentDataset = null;
  }
}
