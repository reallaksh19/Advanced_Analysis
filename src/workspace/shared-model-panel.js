import { EventBus } from './event-bus.js';
import { SHARED_MODEL_EVENTS } from './shared-model-events.js';
import { renderSharedModelSummary } from './shared-model-view.js';

export class SharedModelPanel {
  constructor(rootElement, eventBus = EventBus) {
    if (!rootElement) throw new TypeError('SharedModelPanel requires a root element.');
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.model = null;
    this.status = {};
    this.unsubscribeCallbacks = [];
    this.handleClick = this.handleClick.bind(this);
  }

  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.rootElement.addEventListener('click', this.handleClick);
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(SHARED_MODEL_EVENTS.CHANGED, ({ model }) => this.handleModel(model)),
      this.eventBus.subscribe(SHARED_MODEL_EVENTS.EXPORT_COMPLETED, ({ artifact }) => this.handleCompleted(artifact)),
      this.eventBus.subscribe(SHARED_MODEL_EVENTS.EXPORT_FAILED, (payload) => this.handleFailed(payload)),
    ];
    this.render();
  }

  handleModel(model) {
    this.model = model;
    this.status = {};
    this.render();
  }

  handleCompleted(artifact) {
    this.status = { state: 'completed', filename: artifact.filename, byteLength: artifact.byteLength };
    this.render();
  }

  handleFailed(payload) {
    this.status = { state: 'failed', message: payload.message };
    this.render();
  }

  handleClick(event) {
    const button = event.target?.closest?.('[data-shared-model-action="export"]');
    if (!button || !this.rootElement.contains(button) || !this.model) return;
    this.eventBus.publish(SHARED_MODEL_EVENTS.EXPORT_REQUESTED, {});
  }

  render() {
    this.rootElement.replaceChildren(renderSharedModelSummary(
      this.rootElement.ownerDocument,
      this.model,
      this.status,
    ));
  }

  destroy() {
    this.rootElement.removeEventListener('click', this.handleClick);
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.model = null;
    this.status = {};
    this.rootElement.replaceChildren();
  }
}
