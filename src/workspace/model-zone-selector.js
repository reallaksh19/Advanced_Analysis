import { buildDatasetHierarchy } from './dataset-hierarchy.js';
import { EVENT_TOPICS } from './event-topics.js';
import { freezeDeep, stringValue } from './dataset-utils.js';

export const MODEL_ZONE_CATALOG_SCHEMA = 'model-zone-catalog/v1';
export const MODEL_ZONE_SELECTION_SCHEMA = 'model-zone-selection/v1';
export const MODEL_ZONE_PROJECTION_SCHEMA = 'model-zone-dataset-projection/v1';
export const MODEL_ZONE_EVENTS = Object.freeze({ CHANGED: 'modelZone:changed' });

export function buildModelZoneCatalog(dataset) {
  assertDataset(dataset);
  const groups = new Map();
  const allEntityIds = [];
  let unassignedEntityCount = 0;
  for (const entity of dataset.entities) {
    allEntityIds.push(entity.entityId);
    const zoneId = stringValue(entity.zoneId);
    if (!zoneId) { unassignedEntityCount += 1; continue; }
    const entityIds = groups.get(zoneId) ?? [];
    entityIds.push(entity.entityId);
    groups.set(zoneId, entityIds);
  }
  const zones = [...groups.entries()].map(([zoneId, entityIds]) => freezeDeep({
    zoneId,
    label: zoneId,
    entityCount: entityIds.length,
    entityIds: [...entityIds].sort(),
  })).sort((left, right) => compareZoneLabels(left.label, right.label));
  return freezeDeep({
    schema: MODEL_ZONE_CATALOG_SCHEMA,
    datasetId: dataset.datasetId,
    totalEntityCount: dataset.entities.length,
    unassignedEntityCount,
    allEntityIds: [...allEntityIds].sort(),
    zones,
  });
}

export function createModelZoneSelection(catalog, zoneId = '') {
  assertCatalog(catalog);
  const requested = stringValue(zoneId);
  const zone = requested ? catalog.zones.find((row) => row.zoneId === requested) : null;
  if (requested && !zone) throw new Error(`Unknown model zone: ${requested}.`);
  return freezeDeep({
    schema: MODEL_ZONE_SELECTION_SCHEMA,
    datasetId: catalog.datasetId,
    zoneId: zone?.zoneId ?? '',
    label: zone?.label ?? 'All zones',
    entityCount: zone?.entityCount ?? catalog.totalEntityCount,
    totalEntityCount: catalog.totalEntityCount,
    zoneCount: catalog.zones.length,
  });
}

export function reconcileModelZoneSelection(catalog, previousSelection = null) {
  assertCatalog(catalog);
  const sameDataset = previousSelection?.schema === MODEL_ZONE_SELECTION_SCHEMA
    && previousSelection.datasetId === catalog.datasetId;
  const retainedZoneId = sameDataset
    && catalog.zones.some((zone) => zone.zoneId === previousSelection.zoneId)
    ? previousSelection.zoneId
    : '';
  return createModelZoneSelection(catalog, retainedZoneId);
}

export function projectDatasetForModelZone(dataset, selection = null) {
  assertDataset(dataset);
  const zoneId = selectedZoneId(dataset, selection);
  const entities = zoneId
    ? dataset.entities.filter((entity) => stringValue(entity.zoneId) === zoneId)
    : dataset.entities;
  const summary = freezeDeep({
    ...dataset.summary,
    nodeCount: entities.length,
    pipes: entities.filter((entity) => entity.category === 'pipe').length,
    supports: entities.filter((entity) => entity.category === 'support').length,
    components: entities.filter((entity) => entity.category === 'component').length,
  });
  return Object.freeze({
    schema: MODEL_ZONE_PROJECTION_SCHEMA,
    datasetId: dataset.datasetId,
    zoneId,
    label: zoneId || 'All zones',
    totalEntityCount: dataset.entities.length,
    entities: Object.freeze([...entities]),
    entityIds: Object.freeze(entities.map((entity) => entity.entityId)),
    hierarchy: buildDatasetHierarchy(entities),
    summary,
  });
}

export class ModelZoneSelectorController {
  constructor(rootElement, eventBus) {
    if (!rootElement || !eventBus) throw new TypeError('ModelZoneSelectorController requires a root and event bus.');
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.catalog = null;
    this.selection = null;
    this.dataset = null;
    this.unsubscribers = [];
    this.handleChange = () => this.select(this.selectElement.value);
  }

  init() {
    if (this.unsubscribers.length) return;
    this.ensureElements();
    this.selectElement = this.requireElement('[data-role="model-zone-selector"]');
    this.statusElement = this.requireElement('[data-role="model-zone-status"]');
    this.selectElement.addEventListener('change', this.handleChange);
    this.unsubscribers = [
      this.eventBus.subscribe(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, ({ snapshot }) => this.renderSnapshot(snapshot)),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_LOADED, ({ datasetId }) => this.resetLoadedDataset(datasetId)),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_CLEARED, () => this.clear()),
    ];
    this.clear();
  }

  renderSnapshot(snapshot) {
    if (snapshot?.status !== 'ready' || !snapshot.dataset) return;
    if (this.dataset === snapshot.dataset) return;
    this.dataset = snapshot.dataset;
    this.catalog = buildModelZoneCatalog(snapshot.dataset);
    this.selection = reconcileModelZoneSelection(this.catalog, this.selection);
    this.renderOptions();
    this.publish();
  }

  resetLoadedDataset(datasetId) {
    if (this.catalog?.datasetId !== datasetId || !this.selection?.zoneId) return;
    this.selection = createModelZoneSelection(this.catalog);
    this.renderOptions();
    this.publish();
  }

  select(zoneId) {
    if (!this.catalog) return;
    this.selection = createModelZoneSelection(this.catalog, zoneId);
    this.renderStatus();
    this.publish();
  }

  renderOptions() {
    const options = [this.option('', `All zones (${this.catalog.totalEntityCount.toLocaleString()})`)];
    for (const zone of this.catalog.zones) {
      options.push(this.option(zone.zoneId, `${zone.label} (${zone.entityCount.toLocaleString()})`));
    }
    this.selectElement.replaceChildren(...options);
    this.selectElement.disabled = this.catalog.zones.length === 0;
    this.selectElement.value = this.selection.zoneId;
    this.renderStatus();
  }

  renderStatus() {
    if (!this.selection) { this.statusElement.textContent = 'No dataset loaded'; return; }
    this.statusElement.textContent = this.selection.zoneCount
      ? `${this.selection.label} · ${this.selection.entityCount.toLocaleString()} of ${this.selection.totalEntityCount.toLocaleString()} entities`
      : `All zones · ${this.selection.totalEntityCount.toLocaleString()} entities · no explicit ZONE evidence`;
  }

  publish() {
    this.eventBus.publish(MODEL_ZONE_EVENTS.CHANGED, Object.freeze({
      selection: this.selection,
      dataset: this.dataset,
    }));
  }

  clear() {
    this.dataset = null;
    this.catalog = null;
    this.selection = null;
    if (!this.selectElement) return;
    this.selectElement.replaceChildren(this.option('', 'All zones'));
    this.selectElement.disabled = true;
    this.statusElement.textContent = 'No dataset loaded';
  }

  ensureElements() {
    if (this.rootElement.querySelector('[data-role="model-zone-selector"]')) return;
    const toolbar = this.requireElement('.dataset-toolbar');
    const status = this.requireElement('[data-role="tree-status"]');
    const label = this.rootElement.ownerDocument.createElement('label');
    label.dataset.role = 'model-zone-selector-wrap';
    label.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;';
    const text = this.rootElement.ownerDocument.createElement('span');
    text.textContent = 'Zone';
    const select = this.rootElement.ownerDocument.createElement('select');
    select.dataset.role = 'model-zone-selector';
    select.style.cssText = 'min-width:160px;max-width:100%;';
    const output = this.rootElement.ownerDocument.createElement('output');
    output.dataset.role = 'model-zone-status';
    output.style.cssText = 'color:#94a3b8;font-size:11px;';
    label.append(text, select);
    toolbar.insertBefore(label, status);
    toolbar.insertBefore(output, status);
  }

  option(value, label) {
    const option = this.rootElement.ownerDocument.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }

  requireElement(selector) {
    const element = this.rootElement.querySelector(selector);
    if (!element) throw new Error(`Model zone selector element is missing: ${selector}`);
    return element;
  }

  destroy() {
    this.selectElement?.removeEventListener('change', this.handleChange);
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.clear();
  }
}

function selectedZoneId(dataset, selection) {
  if (!selection || selection.schema !== MODEL_ZONE_SELECTION_SCHEMA
    || selection.datasetId !== dataset.datasetId) return '';
  return stringValue(selection.zoneId);
}

function compareZoneLabels(left, right) {
  return String(left).localeCompare(String(right), 'en', { numeric: true, sensitivity: 'variant' });
}

function assertDataset(dataset) {
  if (!dataset?.datasetId || !Array.isArray(dataset.entities)) {
    throw new TypeError('Model zone selection requires a normalized workspace dataset.');
  }
}

function assertCatalog(catalog) {
  if (catalog?.schema !== MODEL_ZONE_CATALOG_SCHEMA || !Array.isArray(catalog.zones)) {
    throw new TypeError(`Model zone selection requires ${MODEL_ZONE_CATALOG_SCHEMA}.`);
  }
}
