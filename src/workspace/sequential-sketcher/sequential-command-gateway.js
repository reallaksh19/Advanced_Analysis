/**
 * Applies explicit deterministic workspace edits, owns preview/commit state,
 * and preserves undo/redo datasets. No dataset or engineering value is made up.
 */
import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { rebuildWorkspaceDataset } from '../dataset-adapter.js';
import { EVENT_TOPICS } from '../event-topics.js';
import { prepareInlineComponentReplacement } from '../editing/inline-component-replacement-command.js';
import { freezeJsonValue } from './engineering-scene-contracts.js';

export const SEQUENTIAL_COMMAND_GATEWAY_SCHEMA = 'SequentialCommandGateway.v1';

export class SequentialCommandGateway {
  constructor(workspaceState, eventBus) {
    if (!workspaceState) throw new TypeError('Sequential command gateway requires WorkspaceState.');
    this.workspaceState = workspaceState;
    this.eventBus = eventBus;
    this.history = [];
    this.future = [];
    this.draft = null;
  }

  execute(command) {
    if (!command?.op) throw new TypeError('Sequential command requires op.');
    const dataset = this.requireDataset();
    let updatedDataset;
    try {
      updatedDataset = applyCommand(dataset, command);
    } catch (error) {
      return { status: 'rejected', reason: error instanceof Error ? error.message : String(error) };
    }
    this.commitWithHistory(command, dataset, updatedDataset);
    return { status: 'applied', op: command.op, revision: updatedDataset.version };
  }

  previewInlineReplacement(targetEntityId, profile, masterData) {
    const dataset = this.requireDataset();
    try {
      const prepared = prepareInlineComponentReplacement(dataset, targetEntityId, profile, masterData);
      this.draft = { previousDataset: dataset, ...prepared };
      return { status: 'preview', command: prepared.command, dataset: prepared.previewDataset };
    } catch (error) {
      this.draft = null;
      return { status: 'rejected', reason: error instanceof Error ? error.message : String(error), code: error?.code || 'PREVIEW_FAILED', details: error?.details || [] };
    }
  }

  commitPreview() {
    if (!this.draft) return { status: 'rejected', reason: 'NO_ACTIVE_PREVIEW' };
    const current = this.requireDataset();
    if (current !== this.draft.previousDataset) {
      this.draft = null;
      return { status: 'rejected', reason: 'DATASET_CHANGED_DURING_PREVIEW' };
    }
    const draft = this.draft;
    this.draft = null;
    this.commitWithHistory({ op: 'REPLACE_INLINE_ASSEMBLY', command: draft.command }, current, draft.previewDataset);
    return { status: 'applied', command: draft.command, revision: draft.previewDataset.version };
  }

  cancelPreview() { const existed = Boolean(this.draft); this.draft = null; return existed; }
  getDraft() { return this.draft; }

  commitWithHistory(command, previousDataset, dataset) {
    this.history.push({ command, previousDataset, dataset });
    this.future = [];
    this.commitDataset(dataset);
  }

  commitDataset(dataset) {
    const snapshot = this.workspaceState.loadDataset(dataset);
    this.eventBus?.publish(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, { snapshot });
  }

  undo() {
    if (!this.history.length) return false;
    const entry = this.history.pop();
    this.future.push(entry);
    this.draft = null;
    this.commitDataset(entry.previousDataset);
    return true;
  }

  redo() {
    if (!this.future.length) return false;
    const entry = this.future.pop();
    this.history.push(entry);
    this.draft = null;
    this.commitDataset(entry.dataset);
    return true;
  }

  requireDataset() {
    const dataset = this.workspaceState.getSnapshot()?.dataset;
    if (!dataset?.entities?.length) throw new Error('NO_DATASET_LOADED');
    return dataset;
  }
}

function applyCommand(dataset, command) {
  const handlers = {
    ADD_STRAIGHT: addStraight,
    SPLIT_PIPE: splitPipe,
    STRETCH_NODE: stretchNode,
    ROTATE_COMPONENT: rotateComponent,
    MOVE_SUPPORT: moveSupport,
    RETIRE_COMPONENT: retireComponent,
    UPDATE_PROPERTIES: updateProperties,
  };
  const handler = handlers[command.op];
  if (!handler) throw new Error(`UNSUPPORTED_OPERATION_${command.op}`);
  const entities = handler(dataset, command);
  return rebuildWorkspaceDataset(dataset, entities, commandAudit(dataset, command));
}

function addStraight(dataset, command) {
  requirePositive(command.lengthMm, 'lengthMm');
  const target = requireEntity(dataset, command.targetEntityId);
  if (!['X', 'Y', 'Z'].includes(command.direction)) throw new Error('ADD_STRAIGHT_DIRECTION_REQUIRED');
  const start = target.properties?.geometry?.end;
  if (!start) throw new Error('TARGET_END_POINT_REQUIRED');
  const end = { ...start, [command.direction.toLowerCase()]: start[command.direction.toLowerCase()] + command.lengthMm };
  const entityId = commandId(dataset, command);
  const entity = freezeJsonValue({
    ...target, entityId, sourceEntityId: entityId, componentReference: entityId,
    name: `PIPE ${entityId}`, entityType: 'PIPE', category: 'pipe',
    properties: { ...target.properties, identity: { ...target.properties?.identity, entityId, sourceEntityId: entityId, name: `PIPE ${entityId}`, entityType: 'PIPE' }, geometry: { start, end, center: midpoint(start, end) }, attributes: { ...target.properties?.attributes, TYPE: 'PIPE', CUTLENGTH: `${command.lengthMm}mm`, EDIT_COMMAND_ID: entityId } },
  });
  return [...dataset.entities, entity];
}

function splitPipe(dataset, command) {
  const target = requireEntity(dataset, command.targetEntityId);
  if (target.entityType !== 'PIPE') throw new Error('SPLIT_TARGET_MUST_BE_PIPE');
  const start = target.properties?.geometry?.start; const end = target.properties?.geometry?.end;
  if (!start || !end) throw new Error('SPLIT_TARGET_ENDPOINTS_REQUIRED');
  const center = midpoint(start, end); const base = commandId(dataset, command);
  const first = editGeometry(target, `${base}:1`, start, center);
  const second = editGeometry(target, `${base}:2`, center, end);
  const node = freezeJsonValue({ ...target, entityId: `${base}:node`, sourceEntityId: `${base}:node`, componentReference: `${base}:node`, name: `NODE ${base}`, entityType: 'TEE', category: 'component', properties: { ...target.properties, identity: { entityId: `${base}:node`, sourceEntityId: `${base}:node`, name: `NODE ${base}`, entityType: 'TEE' }, geometry: { start: center, end: center, center }, attributes: { TYPE: 'TEE', EDIT_COMMAND_ID: base } } });
  return replaceOne(dataset.entities, target.entityId, [first, node, second]);
}

function stretchNode(dataset, command) {
  requireVector(command.offset, 'offset');
  requireEntity(dataset, command.targetEntityId);
  return dataset.entities.map((entity) => entity.entityId === command.targetEntityId ? translateEntity(entity, command.offset) : entity);
}

function rotateComponent(dataset, command) {
  requireFinite(command.angleDeg, 'angleDeg'); requireEntity(dataset, command.targetEntityId);
  return dataset.entities.map((entity) => entity.entityId === command.targetEntityId ? freezeJsonValue({ ...entity, properties: { ...entity.properties, attributes: { ...entity.properties?.attributes, ANGL: `${command.angleDeg}degree` } } }) : entity);
}

function moveSupport(dataset, command) {
  requireVector(command.offset, 'offset');
  const target = requireEntity(dataset, command.targetEntityId);
  if (target.category !== 'support') throw new Error('MOVE_TARGET_MUST_BE_SUPPORT');
  return dataset.entities.map((entity) => entity.entityId === target.entityId ? translateEntity(entity, command.offset) : entity);
}

function retireComponent(dataset, command) { requireEntity(dataset, command.targetEntityId); return dataset.entities.filter((entity) => entity.entityId !== command.targetEntityId); }
function updateProperties(dataset, command) { requireEntity(dataset, command.targetEntityId); if (!command.attributes || typeof command.attributes !== 'object') throw new Error('ATTRIBUTES_REQUIRED'); return dataset.entities.map((entity) => entity.entityId === command.targetEntityId ? freezeJsonValue({ ...entity, properties: { ...entity.properties, attributes: { ...entity.properties?.attributes, ...command.attributes } } }) : entity); }
function translateEntity(entity, offset) { const geometry = entity.properties?.geometry || {}; const move = (point) => point ? ({ x: point.x + offset.x, y: point.y + offset.y, z: point.z + offset.z }) : null; return freezeJsonValue({ ...entity, properties: { ...entity.properties, geometry: { ...geometry, start: move(geometry.start), end: move(geometry.end), center: move(geometry.center) } } }); }
function editGeometry(entity, entityId, start, end) { return freezeJsonValue({ ...entity, entityId, sourceEntityId: entityId, componentReference: entityId, name: `PIPE ${entityId}`, properties: { ...entity.properties, identity: { ...entity.properties?.identity, entityId, sourceEntityId: entityId, name: `PIPE ${entityId}` }, geometry: { start, end, center: midpoint(start, end) }, attributes: { ...entity.properties?.attributes, EDIT_COMMAND_ID: entityId } } }); }
function commandAudit(dataset, command) { return { schema: 'workspace-explicit-edit/v1', command: freezeJsonValue(command), sourceDatasetHash: dataset.sourceSnapshot?.sourceSemanticHash, commandHash: semanticHash(command) }; }
function commandId(dataset, command) { return `edit:${semanticHash({ datasetId: dataset.datasetId, version: dataset.version || 0, command }).slice(0, 20)}`; }
function requireEntity(dataset, entityId) { if (!entityId) throw new Error('TARGET_ENTITY_ID_REQUIRED'); const entity = dataset.entities.find((row) => row.entityId === entityId); if (!entity) throw new Error(`TARGET_ENTITY_NOT_FOUND_${entityId}`); return entity; }
function requireVector(value, name) { if (!value || ['x', 'y', 'z'].some((axis) => !Number.isFinite(value[axis]))) throw new Error(`${name.toUpperCase()}_VECTOR_REQUIRED`); }
function requirePositive(value, name) { if (!Number.isFinite(value) || value <= 0) throw new Error(`${name.toUpperCase()}_MUST_BE_POSITIVE`); }
function requireFinite(value, name) { if (!Number.isFinite(value)) throw new Error(`${name.toUpperCase()}_MUST_BE_FINITE`); }
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }; }
function replaceOne(entities, entityId, replacements) { const index = entities.findIndex((entity) => entity.entityId === entityId); return [...entities.slice(0, index), ...replacements, ...entities.slice(index + 1)]; }
