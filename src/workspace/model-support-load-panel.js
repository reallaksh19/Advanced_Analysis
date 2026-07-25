import { EventBus } from './event-bus.js';
import { MODEL_SUPPORT_LOAD_READINESS_TOPIC } from './model-support-load-contract.js';
import { renderModelSupportLoadReadiness } from './model-support-load-view.js';

export class ModelSupportLoadPanel {
  constructor(rootElement, eventBus = EventBus) {
    if (!rootElement) throw new TypeError('ModelSupportLoadPanel requires a root element.');
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.unsubscribe = null;
  }

  init() {
    if (this.unsubscribe) return;
    this.render(null, '');
    this.unsubscribe = this.eventBus.subscribe(
      MODEL_SUPPORT_LOAD_READINESS_TOPIC,
      ({ readiness, error = '' }) => this.render(readiness, error),
    );
  }

  render(readiness, error) {
    this.rootElement.replaceChildren(
      renderModelSupportLoadReadiness(this.rootElement.ownerDocument, readiness, error),
    );
  }

  destroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.rootElement.replaceChildren();
  }
}
