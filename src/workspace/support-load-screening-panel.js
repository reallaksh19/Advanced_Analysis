import { EventBus } from './event-bus.js';
import { SUPPORT_LOAD_SCREENING_EVENTS } from './support-load-screening-events.js';
import { renderSupportLoadScreeningSummary } from './support-load-screening-view.js';

export class SupportLoadScreeningPanel {
  constructor(rootElement, eventBus = EventBus) {
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.snapshot = { profile: null, pathModel: null, screening: null, audit: null };
    this.status = {};
    this.unsubscribeCallbacks = [];
  }

  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.CHANGED, (payload) => this.handleChanged(payload)),
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.PATH_REBUILD_FAILED, (payload) => this.handleFailure(payload)),
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.RUN_FAILED, (payload) => this.handleFailure(payload)),
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.EXPORT_COMPLETED, ({ artifact }) => this.handleExport(artifact)),
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.EXPORT_FAILED, (payload) => this.handleFailure(payload)),
    ];
    this.render();
  }

  handleChanged(payload) {
    this.snapshot = {
      profile: payload.profile || null,
      pathModel: payload.pathModel || null,
      screening: payload.screening || null,
      audit: payload.audit || null,
    };
    this.status = payload.reason === 'screened'
      ? { state: 'screened' }
      : payload.reason === 'explicit' ? { state: 'paths' } : {};
    this.render();
  }

  handleFailure(payload) { this.status = { state: 'failed', message: payload.message }; this.render(); }
  handleExport(artifact) { this.status = { state: 'exported', filename: artifact.filename }; this.render(); }

  render() {
    if (!this.rootElement) return;
    const card = renderSupportLoadScreeningSummary(this.rootElement.ownerDocument, this.snapshot, this.status);
    this.rootElement.replaceChildren(card);
    card.querySelector('[data-support-load-screening-action="rebuild"]')?.addEventListener('click', () => {
      this.eventBus.publish(SUPPORT_LOAD_SCREENING_EVENTS.REBUILD_PATHS_REQUESTED, {});
    });
    card.querySelector('[data-support-load-screening-action="run"]')?.addEventListener('click', () => {
      this.eventBus.publish(SUPPORT_LOAD_SCREENING_EVENTS.RUN_REQUESTED, {});
    });
    card.querySelector('[data-support-load-screening-action="export"]')?.addEventListener('click', () => {
      this.eventBus.publish(SUPPORT_LOAD_SCREENING_EVENTS.EXPORT_REQUESTED, {});
    });
  }

  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.snapshot = { profile: null, pathModel: null, screening: null, audit: null };
    this.status = {};
    this.rootElement?.replaceChildren();
  }
}
