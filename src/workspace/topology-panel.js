import { EventBus } from './event-bus.js';
import { TOPOLOGY_EVENTS } from './topology-events.js';
import { renderTopologySummary } from './topology-view.js';

export class TopologyPanel {
  constructor(rootElement, eventBus = EventBus) {
    if (!rootElement) throw new TypeError('TopologyPanel requires a root element.');
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.graph = null;
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
      this.eventBus.subscribe(TOPOLOGY_EVENTS.CHANGED, (payload) => this.handleGraphChanged(payload)),
      this.eventBus.subscribe(TOPOLOGY_EVENTS.REBUILD_FAILED, (payload) => this.handleFailure(payload)),
      this.eventBus.subscribe(TOPOLOGY_EVENTS.EXPORT_COMPLETED, ({ artifact }) => this.handleExported(artifact)),
      this.eventBus.subscribe(TOPOLOGY_EVENTS.EXPORT_FAILED, (payload) => this.handleFailure(payload)),
    ];
    this.render();
  }

  handleGraphChanged({ graph, reason }) {
    this.graph = graph;
    this.status = graph && reason !== 'clear'
      ? { state: 'rebuilt', profileId: graph.profile.profileId }
      : {};
    if (!graph) this.toleranceValue = '';
    this.render();
  }

  handleFailure(payload) {
    this.status = { state: 'failed', message: payload.message };
    this.render();
  }

  handleExported(artifact) {
    this.status = { state: 'exported', filename: artifact.filename, byteLength: artifact.byteLength };
    this.render();
  }

  handleInput(event) {
    if (event.target?.matches?.('[data-role="topology-tolerance"]')) {
      this.toleranceValue = event.target.value;
    }
  }

  handleClick(event) {
    const button = event.target?.closest?.('[data-topology-action]');
    if (!button || !this.rootElement.contains(button) || !this.graph) return;
    const action = button.dataset.topologyAction;
    if (action === 'exact') this.eventBus.publish(TOPOLOGY_EVENTS.REBUILD_EXACT_REQUESTED, {});
    if (action === 'tolerance') this.eventBus.publish(TOPOLOGY_EVENTS.REBUILD_TOLERANCE_REQUESTED, { tolerance: this.toleranceValue });
    if (action === 'export') this.eventBus.publish(TOPOLOGY_EVENTS.EXPORT_REQUESTED, {});
  }

  render() {
    this.rootElement.replaceChildren(renderTopologySummary(
      this.rootElement.ownerDocument,
      this.graph,
      this.status,
      this.toleranceValue,
    ));
  }

  destroy() {
    this.rootElement.removeEventListener('click', this.handleClick);
    this.rootElement.removeEventListener('input', this.handleInput);
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.graph = null;
    this.status = {};
    this.toleranceValue = '';
    this.rootElement.replaceChildren();
  }
}
