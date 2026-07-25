import { EventBus } from './event-bus.js';
import { MODEL_LOAD_EVENTS } from './model-load-events.js';
import { renderModelLoadSummary } from './model-load-view.js';

export class ModelLoadPanel {
  constructor(rootElement, eventBus = EventBus) {
    if (!rootElement) throw new TypeError('ModelLoadPanel requires a root element.');
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.foundation = null;
    this.status = {};
    this.unsubscribeCallbacks = [];
    this.handleClick = this.handleClick.bind(this);
  }

  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.rootElement.addEventListener('click', this.handleClick);
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(MODEL_LOAD_EVENTS.CHANGED, (payload) => this.handleChanged(payload)),
      this.eventBus.subscribe(MODEL_LOAD_EVENTS.REBUILD_FAILED, (payload) => this.handleFailure(payload)),
      this.eventBus.subscribe(MODEL_LOAD_EVENTS.EXPORT_COMPLETED, ({ artifact }) => this.handleExported(artifact)),
      this.eventBus.subscribe(MODEL_LOAD_EVENTS.EXPORT_FAILED, (payload) => this.handleFailure(payload)),
    ];
    this.render();
  }

  handleChanged({ foundation, reason }) {
    this.foundation = foundation;
    this.status = foundation && reason !== 'clear' ? { state: 'rebuilt' } : {};
    this.render();
  }

  handleFailure(payload) {
    this.status = { state: 'failed', message: payload.message };
    this.render();
  }

  handleExported(artifact) {
    this.status = { state: 'exported', filename: artifact.filename };
    this.render();
  }

  handleClick(event) {
    const button = event.target?.closest?.('[data-model-load-action]');
    if (!button || !this.rootElement.contains(button) || !this.foundation) return;
    if (button.dataset.modelLoadAction === 'rebuild') this.eventBus.publish(MODEL_LOAD_EVENTS.REBUILD_REQUESTED, {});
    if (button.dataset.modelLoadAction === 'export') this.eventBus.publish(MODEL_LOAD_EVENTS.EXPORT_REQUESTED, {});
  }

  render() {
    this.rootElement.replaceChildren(renderModelLoadSummary(
      this.rootElement.ownerDocument,
      this.foundation,
      this.status,
    ));
  }

  destroy() {
    this.rootElement.removeEventListener('click', this.handleClick);
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.foundation = null;
    this.status = {};
    this.rootElement.replaceChildren();
  }
}
