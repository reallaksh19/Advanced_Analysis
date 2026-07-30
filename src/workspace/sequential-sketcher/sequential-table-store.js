/**
 * Sequential Table Store (Zustand-style Light Reactive Store)
 * Manages bi-directional synchronization between the Topology Table and SVG Canvas.
 */
import { EventBus } from '../event-bus.js';
import { EVENT_TOPICS } from '../event-topics.js';
import { WorkspaceState } from '../workspace-state.js';
import { SequentialCommandGateway } from './sequential-command-gateway.js';

export class SequentialTableStore {
  constructor(workspaceState = WorkspaceState, gateway = null, eventBus = EventBus) {
    this.workspaceState = workspaceState;
    this.gateway = gateway || new SequentialCommandGateway(workspaceState, eventBus);
    this.eventBus = eventBus;
    this.listeners = new Set();
    this.state = {
      dataset: this.workspaceState.getSnapshot()?.dataset || null,
      selectedEntityId: this.workspaceState.selectedEntityId || null,
      searchQuery: '',
    };

    if (this.eventBus) {
      this.eventBus.subscribe(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, ({ snapshot }) => {
        if (snapshot && snapshot.dataset) {
          this.setState({
            dataset: snapshot.dataset,
            selectedEntityId: snapshot.selectedEntityId || this.state.selectedEntityId,
          });
        }
      });
    }
  }

  getState() {
    return this.state;
  }

  setState(partialState) {
    this.state = { ...this.state, ...partialState };
    this.listeners.forEach((listener) => listener(this.state));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  selectEntity(entityId) {
    this.setState({ selectedEntityId: entityId });
    if (entityId && this.eventBus) {
      const targetEntity = this.state.dataset?.entities?.find((e) => e.entityId === entityId) || null;
      this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
        entityId,
        entity: targetEntity,
        source: 'topology-table',
      });
    }
  }

  updateEntityGeometry(entityId, newGeometry) {
    const dataset = this.state.dataset;
    if (!dataset) return;

    const target = dataset.entities.find((e) => e.entityId === entityId);
    if (!target) return;

    const updatedGeometry = {
      ...(target.properties?.geometry || {}),
      ...newGeometry,
    };

    const updatedEntity = {
      ...target,
      properties: {
        ...(target.properties || {}),
        geometry: updatedGeometry,
      },
    };

    const updatedEntities = dataset.entities.map((e) => (e.entityId === entityId ? updatedEntity : e));
    const updatedDataset = {
      ...dataset,
      entities: updatedEntities,
      version: (dataset.version || 1) + 1,
    };

    this.gateway.commitDataset(updatedDataset);
  }

  updateEntityAttribute(entityId, key, value) {
    this.gateway.execute({
      op: 'UPDATE_PROPERTIES',
      targetEntityId: entityId,
      attributes: { [key]: value },
    });
  }

  executeQuickAction(op, targetEntityId = this.state.selectedEntityId) {
    return this.gateway.execute({ op, targetEntityId });
  }
}
