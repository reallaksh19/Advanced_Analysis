import { EventBus } from './event-bus.js';
import { SUPPORT_RESTRAINT_EVENTS } from './support-restraint-events.js';
import { renderSupportRestraintSummary } from './support-restraint-view.js';

export class SupportRestraintPanel {
  constructor(rootElement, eventBus = EventBus) {
    if (!rootElement) throw new TypeError('SupportRestraintPanel requires a root element.');
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.attachmentModel = null;
    this.restraintModel = null;
    this.status = {};
    this.toleranceValue = '';
    this.unsubscribeCallbacks = [];
    this.handleClick = this.handleClick.bind(this);
    this.handleInput = this.handleInput.bind(this);
  }

  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.rootElement.addEventListener('click', this.handleClick);
    this.rootElement.addEventListener('input', this.handleInput);
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(SUPPORT_RESTRAINT_EVENTS.CHANGED, (payload) => this.handleChanged(payload)),
      this.eventBus.subscribe(SUPPORT_RESTRAINT_EVENTS.REBUILD_FAILED, (payload) => this.handleFailure(payload)),
      this.eventBus.subscribe(SUPPORT_RESTRAINT_EVENTS.EXPORT_COMPLETED, ({ artifact }) => this.handleExported(artifact)),
      this.eventBus.subscribe(SUPPORT_RESTRAINT_EVENTS.EXPORT_FAILED, (payload) => this.handleFailure(payload)),
    ];
    this.render();
  }

  handleChanged({ attachmentModel, restraintModel, reason }) {
    this.attachmentModel = attachmentModel;
    this.restraintModel = restraintModel;
    this.status = attachmentModel && reason !== 'clear'
      ? { state: 'rebuilt', profileId: attachmentModel.profile.profileId }
      : {};
    if (!attachmentModel) this.toleranceValue = '';
    this.render();
  }

  handleFailure(payload) {
    this.status = { state: 'failed', message: payload.message };
    this.render();
  }

  handleExported(artifact) {
    this.status = {
      state: 'exported',
      filename: artifact.filename,
      byteLength: artifact.byteLength,
    };
    this.render();
  }

  handleInput(event) {
    if (event.target?.matches?.('[data-role="support-restraint-tolerance"]')) {
      this.toleranceValue = event.target.value;
    }
  }

  handleClick(event) {
    const button = event.target?.closest?.('[data-support-restraint-action]');
    if (!button || !this.rootElement.contains(button) || !this.attachmentModel) return;
    const action = button.dataset.supportRestraintAction;
    if (action === 'evidence') {
      this.eventBus.publish(SUPPORT_RESTRAINT_EVENTS.REBUILD_EVIDENCE_REQUESTED, {});
    }
    if (action === 'projection') {
      this.eventBus.publish(SUPPORT_RESTRAINT_EVENTS.REBUILD_PROJECTION_REQUESTED, {
        tolerance: this.toleranceValue,
      });
    }
    if (action === 'export') {
      this.eventBus.publish(SUPPORT_RESTRAINT_EVENTS.EXPORT_REQUESTED, {});
    }
  }

  render() {
    this.rootElement.replaceChildren(renderSupportRestraintSummary(
      this.rootElement.ownerDocument,
      this.attachmentModel,
      this.restraintModel,
      this.status,
      this.toleranceValue,
    ));
  }

  destroy() {
    this.rootElement.removeEventListener('click', this.handleClick);
    this.rootElement.removeEventListener('input', this.handleInput);
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.attachmentModel = null;
    this.restraintModel = null;
    this.status = {};
    this.toleranceValue = '';
    this.rootElement.replaceChildren();
  }
}
