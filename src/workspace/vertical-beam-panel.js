import { EventBus } from './event-bus.js';
import { VERTICAL_BEAM_EVENTS } from './vertical-beam-events.js';
import { renderVerticalBeamSummary } from './vertical-beam-view.js';

export class VerticalBeamPanel {
  constructor(rootElement, eventBus = EventBus) {
    this.rootElement = rootElement; this.eventBus = eventBus;
    this.snapshot = { profile: null, flexuralProjection: null, beamModel: null, solution: null, audit: null };
    this.status = {}; this.unsubscribeCallbacks = [];
  }
  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(VERTICAL_BEAM_EVENTS.CHANGED, (payload) => this.handleChanged(payload)),
      this.eventBus.subscribe(VERTICAL_BEAM_EVENTS.REBUILD_FAILED, (payload) => this.handleFailure(payload)),
      this.eventBus.subscribe(VERTICAL_BEAM_EVENTS.SOLVE_FAILED, (payload) => this.handleFailure(payload)),
      this.eventBus.subscribe(VERTICAL_BEAM_EVENTS.EXPORT_COMPLETED, ({ artifact }) => this.handleExport(artifact)),
      this.eventBus.subscribe(VERTICAL_BEAM_EVENTS.EXPORT_FAILED, (payload) => this.handleFailure(payload)),
    ];
    this.render();
  }
  handleChanged(payload) {
    this.snapshot = {
      profile: payload.profile || null, flexuralProjection: payload.flexuralProjection || null,
      beamModel: payload.beamModel || null, solution: payload.solution || null, audit: payload.audit || null,
    };
    this.status = payload.reason === 'solved' ? { state: 'solved' }
      : payload.reason === 'explicit' ? { state: 'rebuilt' } : {};
    this.render();
  }
  handleFailure(payload) { this.status = { state: 'failed', message: payload.message }; this.render(); }
  handleExport(artifact) { this.status = { state: 'exported', filename: artifact.filename }; this.render(); }
  render() {
    if (!this.rootElement) return;
    const card = renderVerticalBeamSummary(this.rootElement.ownerDocument, this.snapshot, this.status);
    this.rootElement.replaceChildren(card);
    bind(card, 'rebuild', () => this.eventBus.publish(VERTICAL_BEAM_EVENTS.REBUILD_REQUESTED, {}));
    bind(card, 'solve', () => this.eventBus.publish(VERTICAL_BEAM_EVENTS.SOLVE_REQUESTED, {}));
    bind(card, 'export', () => this.eventBus.publish(VERTICAL_BEAM_EVENTS.EXPORT_REQUESTED, {}));
  }
  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.snapshot = { profile: null, flexuralProjection: null, beamModel: null, solution: null, audit: null };
    this.status = {}; this.rootElement?.replaceChildren();
  }
}
function bind(card, action, handler) { card.querySelector(`[data-vertical-beam-action="${action}"]`)?.addEventListener('click', handler); }
