import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';
import { buildResolvedEngineeringGeometry } from './resolved-engineering-geometry.js';
import { buildViewportRenderModel } from './viewport-render-model.js';
import { ViewportRenderer } from './viewport-renderer.js';

export class ViewportPanel {
  constructor(rootElement, eventBus = EventBus, renderer = new ViewportRenderer()) {
    if (!rootElement) throw new TypeError('ViewportPanel requires a root element.');
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.renderer = renderer;
    this.unsubscribers = [];
    this.datasetReference = null;
    this.resolvedGeometry = null;
    this.renderModel = null;
    this.handleClick = this.handleClick.bind(this);
    this.handleSelectionRequest = this.handleSelectionRequest.bind(this);
  }

  init() {
    if (this.unsubscribers.length > 0) return;
    this.statusElement = this.requireElement('[data-role="viewport-status"]');
    this.selectionElement = this.requireElement('[data-role="viewport-selection"]');
    this.hostElement = this.requireElement('[data-role="viewport-render-host"]');
    this.renderer.setSelectionRequestHandler(this.handleSelectionRequest);
    this.renderer.mount(this.hostElement);

    this.unsubscribers = [
      this.eventBus.subscribe(
        EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED,
        ({ snapshot }) => this.renderSnapshot(snapshot),
      ),
      this.eventBus.subscribe(
        EVENT_TOPICS.DATASET_LOAD_FAILED,
        (payload) => this.renderImportFailure(payload.message),
      ),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_CLEARED, () => this.clear()),
      this.eventBus.subscribe(
        EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED,
        (payload) => this.renderSelection(payload.entityId),
      ),
    ];
    this.rootElement.addEventListener('click', this.handleClick);
  }

  requireElement(selector) {
    const element = this.rootElement.querySelector(selector);
    if (!element) throw new Error(`ViewportPanel element is missing: ${selector}`);
    return element;
  }

  renderSnapshot(snapshot) {
    if (snapshot.status !== 'ready' || !snapshot.dataset) return;

    if (snapshot.dataset !== this.datasetReference) {
      this.datasetReference = snapshot.dataset;
      this.resolvedGeometry = buildResolvedEngineeringGeometry(snapshot.dataset);
      this.renderModel = buildViewportRenderModel(this.resolvedGeometry);
      this.renderer.renderModel(this.renderModel);
      this.statusElement.textContent = statusText(
        snapshot.dataset.datasetId,
        this.renderer.backendName,
        this.renderModel.summary,
      );
    }
    this.renderSelection(snapshot.selectedEntityId);
  }

  renderSelection(entityId) {
    const selectedId = String(entityId || '');
    this.renderer.setSelection(selectedId);
    this.selectionElement.textContent = selectedId
      ? `Selection: ${selectedId}`
      : 'Selection: none';
  }

  renderImportFailure(message) {
    const retained = this.renderModel?.summary.renderableCount || 0;
    this.statusElement.textContent = retained
      ? `Import failed · retained ${retained} rendered · ${message}`
      : `Import failed: ${message}`;
  }

  handleSelectionRequest(entityId) {
    this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
      entityId,
      source: 'viewport',
    });
  }

  handleClick(event) {
    const trigger = event.target?.closest?.('[data-viewport-action]');
    if (!trigger || !this.rootElement.contains(trigger)) return;
    if (trigger.dataset.viewportAction === 'fit') this.renderer.fitView();
    if (trigger.dataset.viewportAction === 'reset') this.renderer.resetView();
  }

  clear() {
    this.datasetReference = null;
    this.resolvedGeometry = null;
    this.renderModel = null;
    this.renderer.clear();
    this.statusElement.textContent = 'No dataset loaded';
    this.selectionElement.textContent = 'Selection: none';
  }

  destroy() {
    this.rootElement.removeEventListener('click', this.handleClick);
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.datasetReference = null;
    this.resolvedGeometry = null;
    this.renderModel = null;
    this.renderer.setSelectionRequestHandler(null);
    this.renderer.destroy();
  }
}

function statusText(datasetId, backend, summary) {
  return [
    datasetId,
    backend,
    `${summary.renderableCount} rendered`,
    `${summary.resolvedCount || 0} resolved`,
    `${summary.fallbackCount || 0} fallback`,
    `${summary.skippedCount} skipped`,
  ].join(' · ');
}
