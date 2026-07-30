/**
 * Sequential Sketcher Command Gateway & History Journal
 * Manages interactive editing operations on the WorkspaceState dataset.
 */
import { EventBus } from '../event-bus.js';
import { EVENT_TOPICS } from '../event-topics.js';
import { WorkspaceState } from '../workspace-state.js';
import { freezeJsonValue } from './engineering-scene-contracts.js';

export const SEQUENTIAL_COMMAND_GATEWAY_SCHEMA = 'SequentialCommandGateway.v1';

export class SequentialCommandGateway {
  constructor(workspaceState = WorkspaceState, eventBus = EventBus) {
    this.workspaceState = workspaceState;
    this.eventBus = eventBus;
    this.history = [];
    this.future = [];
  }

  execute(command) {
    if (!command || !command.op) {
      throw new TypeError('Sequential command requires a valid operation type (op).');
    }

    const currentSnapshot = this.workspaceState.getSnapshot();
    if (!currentSnapshot || !currentSnapshot.dataset) {
      return { status: 'rejected', reason: 'NO_DATASET_LOADED' };
    }

    const dataset = currentSnapshot.dataset;
    let updatedDataset = null;

    switch (command.op) {
      case 'ADD_STRAIGHT':
        updatedDataset = this.handleAddStraight(dataset, command);
        break;
      case 'ADD_FLANGE_SET':
        updatedDataset = this.handleAddFlangeSet(dataset, command);
        break;
      case 'ADD_VALVE':
        updatedDataset = this.handleAddValve(dataset, command);
        break;
      case 'SPLIT_PIPE':
        updatedDataset = this.handleSplitPipe(dataset, command);
        break;
      case 'STRETCH_NODE':
        updatedDataset = this.handleStretchNode(dataset, command);
        break;
      case 'ROTATE_COMPONENT':
        updatedDataset = this.handleRotateComponent(dataset, command);
        break;
      case 'MOVE_SUPPORT':
        updatedDataset = this.handleMoveSupport(dataset, command);
        break;
      case 'RETIRE_COMPONENT':
        updatedDataset = this.handleRetireComponent(dataset, command);
        break;
      case 'UPDATE_PROPERTIES':
        updatedDataset = this.handleUpdateProperties(dataset, command);
        break;
      default:
        return { status: 'rejected', reason: `UNSUPPORTED_OPERATION_${command.op}` };
    }

    if (updatedDataset) {
      this.history.push({ command, previousDataset: dataset });
      this.future = []; // Clear redo stack on new operation
      this.commitDataset(updatedDataset);
      return { status: 'applied', op: command.op, revision: updatedDataset.version || 'rev-next' };
    }

    return { status: 'rejected', reason: 'OPERATION_FAILED' };
  }

  commitDataset(dataset) {
    const snapshot = this.workspaceState.loadDataset(dataset);
    if (this.eventBus) {
      this.eventBus.publish(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, { snapshot });
    }
  }

  undo() {
    if (!this.history.length) return false;
    const entry = this.history.pop();
    const currentDataset = this.workspaceState.getSnapshot()?.dataset;
    this.future.push({ command: entry.command, dataset: currentDataset });
    this.commitDataset(entry.previousDataset);
    return true;
  }

  redo() {
    if (!this.future.length) return false;
    const entry = this.future.pop();
    const currentDataset = this.workspaceState.getSnapshot()?.dataset;
    this.history.push({ command: entry.command, previousDataset: currentDataset });
    this.commitDataset(entry.dataset);
    return true;
  }

  handleAddStraight(dataset, { lengthMm = 1000, direction = 'X', targetEntityId }) {
    const newId = `entity:pipe:ext-${Math.random().toString(36).slice(2, 9)}`;
    const target = dataset.entities.find((e) => e.entityId === targetEntityId) || dataset.entities[0];
    const basePos = target?.properties?.geometry?.end || target?.properties?.geometry?.start || { x: 0, y: 0, z: 0 };

    const offset = { x: 0, y: 0, z: 0 };
    if (direction === 'X') offset.x = lengthMm;
    else if (direction === 'Y') offset.y = lengthMm;
    else offset.z = lengthMm;

    const endPos = { x: basePos.x + offset.x, y: basePos.y + offset.y, z: basePos.z + offset.z };

    const newEntity = freezeJsonValue({
      entityId: newId,
      name: `PIPE EXTENSION ${lengthMm}mm`,
      entityType: 'PIPE',
      category: 'pipe',
      properties: {
        identity: { entityId: newId, name: `PIPE EXTENSION ${lengthMm}mm`, entityType: 'PIPE' },
        geometry: { start: basePos, end: endPos, center: { x: (basePos.x + endPos.x) / 2, y: (basePos.y + endPos.y) / 2, z: (basePos.z + endPos.z) / 2 } },
        attributes: { TYPE: 'PIPE', ABORE: '150mm', CUTLENGTH: `${lengthMm}mm` },
      },
    });

    return {
      ...dataset,
      entities: [...dataset.entities, newEntity],
      version: (dataset.version || 1) + 1,
    };
  }

  handleAddFlangeSet(dataset, { targetEntityId }) {
    const target = dataset.entities.find((e) => e.entityId === targetEntityId) || dataset.entities[0];
    if (!target) return null;
    const basePos = target.properties?.geometry?.end || target.properties?.geometry?.start || { x: 0, y: 0, z: 0 };
    
    const flange1Id = `entity:flange:${Math.random().toString(36).slice(2, 9)}`;
    const flange2Id = `entity:flange:${Math.random().toString(36).slice(2, 9)}`;
    const gasketId = `entity:gasket:${Math.random().toString(36).slice(2, 9)}`;

    const createComponent = (id, type, name, pos) => freezeJsonValue({
      entityId: id,
      name,
      entityType: type,
      category: type.toLowerCase(),
      properties: {
        identity: { entityId: id, name, entityType: type },
        geometry: { start: pos, end: pos, center: pos },
        attributes: { TYPE: type },
      },
    });

    const flange1 = createComponent(flange1Id, 'FLAN', 'Flange 1', basePos);
    const gasket = createComponent(gasketId, 'GASK', 'Gasket', basePos);
    const flange2 = createComponent(flange2Id, 'FLAN', 'Flange 2', basePos);

    return {
      ...dataset,
      entities: [...dataset.entities, flange1, gasket, flange2],
      version: (dataset.version || 1) + 1,
    };
  }

  handleAddValve(dataset, { targetEntityId }) {
    const target = dataset.entities.find((e) => e.entityId === targetEntityId) || dataset.entities[0];
    if (!target) return null;
    const basePos = target.properties?.geometry?.end || target.properties?.geometry?.start || { x: 0, y: 0, z: 0 };
    
    const valveId = `entity:valve:${Math.random().toString(36).slice(2, 9)}`;
    const valve = freezeJsonValue({
      entityId: valveId,
      name: 'GATE VALVE 150#',
      entityType: 'VALV',
      category: 'component',
      properties: {
        identity: { entityId: valveId, name: 'GATE VALVE 150#', entityType: 'VALV' },
        geometry: { start: basePos, end: basePos, center: basePos },
        attributes: { TYPE: 'VALV', ABORE: '150mm', RATING: '150#' },
      },
    });

    return {
      ...dataset,
      entities: [...dataset.entities, valve],
      version: (dataset.version || 1) + 1,
    };
  }

  handleSplitPipe(dataset, { targetEntityId }) {
    const targetIndex = dataset.entities.findIndex((e) => e.entityId === targetEntityId);
    const target = targetIndex >= 0 ? dataset.entities[targetIndex] : dataset.entities.find((e) => e.entityType === 'PIPE');
    if (!target) return null;

    const geom = target.properties?.geometry || {};
    const startPt = geom.start || { x: 0, y: 0, z: 0 };
    const endPt = geom.end || { x: 1000, y: 0, z: 0 };

    const mid = {
      x: (startPt.x + endPt.x) / 2,
      y: (startPt.y + endPt.y) / 2,
      z: (startPt.z + endPt.z) / 2,
    };

    const pipe1 = freezeJsonValue({
      ...target,
      entityId: `${target.entityId}:seg1`,
      name: `${target.name} (SEG 1)`,
      properties: {
        ...target.properties,
        geometry: { ...geom, start: startPt, end: mid, center: { x: (startPt.x + mid.x) / 2, y: (startPt.y + mid.y) / 2, z: (startPt.z + mid.z) / 2 } },
      },
    });

    const nodeToken = Math.random().toString(36).slice(2, 9);
    const splitNode = freezeJsonValue({
      entityId: `entity:node:split-${nodeToken}`,
      name: `JUNCTION SPLIT NODE`,
      entityType: 'TEE',
      category: 'pipe',
      properties: {
        identity: { entityId: `entity:node:split-${nodeToken}`, name: `JUNCTION SPLIT NODE`, entityType: 'TEE' },
        geometry: { start: mid, end: mid, center: mid },
        attributes: { TYPE: 'TEE' },
      },
    });

    const pipe2 = freezeJsonValue({
      ...target,
      entityId: `${target.entityId}:seg2`,
      name: `${target.name} (SEG 2)`,
      properties: {
        ...target.properties,
        geometry: { ...geom, start: mid, end: endPt, center: { x: (mid.x + endPt.x) / 2, y: (mid.y + endPt.y) / 2, z: (mid.z + endPt.z) / 2 } },
      },
    });

    const indexToReplace = dataset.entities.indexOf(target);
    const updatedEntities = [...dataset.entities];
    updatedEntities.splice(indexToReplace, 1, pipe1, splitNode, pipe2);

    return {
      ...dataset,
      entities: updatedEntities,
      version: (dataset.version || 1) + 1,
    };
  }

  handleStretchNode(dataset, { targetEntityId, offset = { x: 0, y: 0, z: 0 } }) {
    const updatedEntities = dataset.entities.map((e) => {
      if (targetEntityId && e.entityId !== targetEntityId) return e;
      const geom = e.properties?.geometry || {};
      const newStart = geom.start ? { x: geom.start.x + offset.x, y: geom.start.y + offset.y, z: geom.start.z + offset.z } : null;
      const newEnd = geom.end ? { x: geom.end.x + offset.x, y: geom.end.y + offset.y, z: geom.end.z + offset.z } : null;
      const newCenter = geom.center ? { x: geom.center.x + offset.x, y: geom.center.y + offset.y, z: geom.center.z + offset.z } : null;

      return freezeJsonValue({
        ...e,
        properties: {
          ...e.properties,
          geometry: { ...geom, start: newStart, end: newEnd, center: newCenter },
        },
      });
    });

    return {
      ...dataset,
      entities: updatedEntities,
      version: (dataset.version || 1) + 1,
    };
  }

  handleRotateComponent(dataset, { targetEntityId, angleDeg = 90 }) {
    const updatedEntities = dataset.entities.map((e) => {
      if (targetEntityId && e.entityId !== targetEntityId) return e;
      const attrs = e.properties?.attributes || {};
      return freezeJsonValue({
        ...e,
        properties: {
          ...e.properties,
          attributes: { ...attrs, ANGL: `${angleDeg}degree`, ROTATION: `${angleDeg}deg` },
        },
      });
    });

    return {
      ...dataset,
      entities: updatedEntities,
      version: (dataset.version || 1) + 1,
    };
  }

  handleMoveSupport(dataset, { targetEntityId, offsetMm = 100 }) {
    const updatedEntities = dataset.entities.map((e) => {
      if (targetEntityId && e.entityId !== targetEntityId) return e;
      const geom = e.properties?.geometry || {};
      const center = geom.center || geom.start;
      if (!center) return e;

      const newCenter = { x: center.x + offsetMm, y: center.y, z: center.z };
      return freezeJsonValue({
        ...e,
        properties: {
          ...e.properties,
          geometry: { ...geom, start: newCenter, end: newCenter, center: newCenter },
        },
      });
    });

    return {
      ...dataset,
      entities: updatedEntities,
      version: (dataset.version || 1) + 1,
    };
  }

  handleRetireComponent(dataset, { targetEntityId }) {
    const updatedEntities = dataset.entities.filter((e) => e.entityId !== targetEntityId);
    return {
      ...dataset,
      entities: updatedEntities,
      version: (dataset.version || 1) + 1,
    };
  }

  handleUpdateProperties(dataset, { targetEntityId, attributes = {} }) {
    const updatedEntities = dataset.entities.map((e) => {
      if (e.entityId !== targetEntityId) return e;
      const currentAttrs = e.properties?.attributes || {};
      return freezeJsonValue({
        ...e,
        properties: {
          ...e.properties,
          attributes: { ...currentAttrs, ...attributes },
        },
      });
    });

    return {
      ...dataset,
      entities: updatedEntities,
      version: (dataset.version || 1) + 1,
    };
  }
}
