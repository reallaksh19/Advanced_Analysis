import { EXPORT_FORMATS } from '../core/model-calculation-package/index.js';
import { EventBus } from './event-bus.js';
import { MODEL_CALCULATION_EVENTS } from './model-calculation-events.js';
import { renderModelCalculationSummary } from './model-calculation-view.js';

export class ModelCalculationPanel {
  constructor(rootElement, eventBus = EventBus) {
    this.rootElement = rootElement; this.eventBus = eventBus;
    this.snapshot = { ledger: null, activeReport: null, availability: {}, packageMode: null };
    this.status = {}; this.unsubscribeCallbacks = [];
  }
  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(MODEL_CALCULATION_EVENTS.CHANGED, (payload) => this.handleChanged(payload)),
      this.eventBus.subscribe(MODEL_CALCULATION_EVENTS.CREATE_FAILED, (payload) => this.handleFailure(payload)),
      this.eventBus.subscribe(MODEL_CALCULATION_EVENTS.SELECT_FAILED, (payload) => this.handleFailure(payload)),
      this.eventBus.subscribe(MODEL_CALCULATION_EVENTS.EXPORT_COMPLETED, ({ artifact }) => this.handleExport(artifact)),
      this.eventBus.subscribe(MODEL_CALCULATION_EVENTS.EXPORT_FAILED, (payload) => this.handleFailure(payload)),
    ];
    this.render();
  }
  handleChanged(payload) {
    this.snapshot = { ledger: payload.ledger || null, activeReport: payload.activeReport || null, availability: payload.availability || {}, packageMode: payload.packageMode || null };
    const active = this.snapshot.ledger?.entries.find((row) => row.entryId === this.snapshot.ledger.activeEntryId);
    this.status = payload.reason === 'package-created' ? { state: 'created', packageId: active?.packageId }
      : payload.reason === 'package-selected' ? { state: 'selected', packageId: active?.packageId }
        : payload.reason === 'history-cleared' ? { state: 'cleared' } : {};
    this.render();
  }
  handleFailure(payload) { this.status = { state: 'failed', message: payload.message }; this.render(); }
  handleExport(artifact) { this.status = { state: 'exported', filename: artifact.filename }; this.render(); }
  render() {
    if (!this.rootElement) return;
    const card = renderModelCalculationSummary(this.rootElement.ownerDocument, this.snapshot, this.status);
    this.rootElement.replaceChildren(card);
    const mode = card.querySelector('[data-model-calculation-control="mode"]');
    mode?.addEventListener('change', () => this.eventBus.publish(MODEL_CALCULATION_EVENTS.MODE_REQUESTED, { mode: mode.value }));
    bind(card, 'create', () => this.eventBus.publish(MODEL_CALCULATION_EVENTS.CREATE_REQUESTED, {}));
    bind(card, 'select', () => this.selectEntry(card));
    bind(card, 'json', () => this.export(EXPORT_FORMATS.JSON));
    bind(card, 'csv', () => this.export(EXPORT_FORMATS.CSV));
    bind(card, 'markdown', () => this.export(EXPORT_FORMATS.MARKDOWN));
    bind(card, 'clear', () => this.eventBus.publish(MODEL_CALCULATION_EVENTS.CLEAR_REQUESTED, {}));
  }
  selectEntry(card) {
    const entryId = card.querySelector('[data-model-calculation-control="entry"]')?.value;
    if (entryId) this.eventBus.publish(MODEL_CALCULATION_EVENTS.SELECT_REQUESTED, { entryId });
  }
  export(format) { this.eventBus.publish(MODEL_CALCULATION_EVENTS.EXPORT_REQUESTED, { format }); }
  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe()); this.unsubscribeCallbacks = [];
    this.snapshot = { ledger: null, activeReport: null, availability: {}, packageMode: null };
    this.status = {}; this.rootElement?.replaceChildren();
  }
}
function bind(card, action, handler) { card.querySelector(`[data-model-calculation-action="${action}"]`)?.addEventListener('click', handler); }
