/** Canonical route tracing composition over comparison, inspection, issue review, and search. */
import {
  TopologyEdit3DViewController as ComparisonController,
} from './topology-edit-3d-comparison-controller.js';
import {
  buildTopologyEditRouteTrace,
} from './topology-edit/topology-edit-route-trace-model.js';
import {
  renderTopologyEditRouteTracePanel,
} from './topology-edit/topology-edit-route-trace-panel.js';
import {
  TopologyEditRouteTraceRenderer,
} from './topology-edit/topology-edit-route-trace-renderer.js';
import {
  topologyEditPresentationActions,
} from './viewport-presentation/topology-edit-presentation-contract.js';

const PRESENTATION_ACTIONS = topologyEditPresentationActions();

export class TopologyEdit3DViewController extends ComparisonController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.routeTraceElement = null;
    this.routeTraceModel = null;
    this.routeTraceRenderer = null;
  }

  buildShell() {
    super.buildShell();
    const element = this.hostElement?.ownerDocument.createElement('section');
    if (!element || !this.checkerElement) {
      throw new Error('TopologyEditRouteController: route trace host is unavailable.');
    }
    element.dataset.role = 'topology-edit-route-trace';
    element.className = 'topology-edit-route-trace';
    element.setAttribute('aria-label', 'Canonical route continuity');
    this.checkerElement.before(element);
    this.routeTraceElement = element;
    this.renderRoutePanel();
  }

  deactivate() {
    this.routeTraceRenderer?.destroy();
    this.routeTraceRenderer = null;
    this.routeTraceElement = null;
    this.routeTraceModel = null;
    super.deactivate();
  }

  refreshView(canonical) {
    super.refreshView(canonical);
    this.clearRouteTrace(false);
  }

  applyCanonicalPick(pick, additive) {
    super.applyCanonicalPick(pick, additive);
    this.clearRouteTrace(false);
  }

  activateSearchResult(result, options = {}) {
    super.activateSearchResult(result, options);
    this.clearRouteTrace(false);
  }

  focusIssue(entry) {
    super.focusIssue(entry);
    this.clearRouteTrace(false);
  }

  clearInspectionSelection() {
    super.clearInspectionSelection();
    this.clearRouteTrace(false);
  }

  handleHostClick(event) {
    if (event.target.closest('[data-action="build-route-trace"]')) {
      this.buildRouteTrace();
      return;
    }
    if (event.target.closest('[data-action="focus-route-trace"]')) {
      this.focusRouteTrace();
      return;
    }
    if (event.target.closest('[data-action="clear-route-trace"]')) {
      this.clearRouteTrace(true);
      return;
    }
    return super.handleHostClick(event);
  }

  buildRouteTrace() {
    const canonical = this.session?.currentTopology();
    if (!canonical) {
      this.setStatus('Canonical route trace is unavailable without a current edit session.');
      return;
    }
    try {
      this.routeTraceModel = buildTopologyEditRouteTrace({
        canonicalTopology: canonical,
        selection: this.selection,
      });
      this.ensureRouteRenderer();
      this.routeTraceRenderer.render(this.routeTraceModel, this.viewportBackend?.lastBounds);
      this.renderRoutePanel();
      this.setStatus(routeStatus(this.routeTraceModel));
    } catch (error) {
      this.routeTraceModel = null;
      this.routeTraceRenderer?.clear();
      this.renderRoutePanel();
      this.setStatus(`Route trace failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  focusRouteTrace() {
    if (this.routeTraceModel?.status !== 'READY'
      || !this.routeTraceModel.canonicalIds.length) {
      this.setStatus('No current canonical route trace is available to focus.');
      return;
    }
    let result = this.focusCanonicalIds(this.routeTraceModel.canonicalIds);
    let visibilityReset = false;
    if (result.status !== 'FOCUSED') {
      this.applyPresentationAction({ type: PRESENTATION_ACTIONS.SHOW_ALL_IDS });
      visibilityReset = true;
      result = this.focusCanonicalIds(this.routeTraceModel.canonicalIds);
    }
    if (result.status !== 'FOCUSED') {
      this.setStatus('Canonical route objects are absent from the current visual projection.');
      return;
    }
    this.setStatus(
      `${visibilityReset ? 'Presentation visibility reset; ' : ''}`
      + `focused ${result.foundIds.length} canonical route object(s).`,
    );
  }

  clearRouteTrace(announce = false) {
    this.routeTraceModel = null;
    this.routeTraceRenderer?.clear();
    this.renderRoutePanel();
    if (announce) this.setStatus('Canonical route trace cleared; selection remains unchanged.');
  }

  ensureRouteRenderer() {
    if (this.routeTraceRenderer) return;
    const group = this.viewportBackend?.groups?.connectorGroup;
    if (!group) throw new Error('Renderer-owned connectorGroup is unavailable.');
    this.routeTraceRenderer = new TopologyEditRouteTraceRenderer(group);
  }

  renderRoutePanel() {
    if (!this.routeTraceElement) return;
    renderTopologyEditRouteTracePanel(
      this.routeTraceElement,
      this.routeTraceModel,
      this.selection,
    );
  }
}

function routeStatus(model) {
  if (model.status !== 'READY') return `Route trace blocked: ${model.status}. ${model.message}`;
  const mode = model.mode === 'POINT_TO_POINT' ? 'route' : 'connected component';
  return `Canonical ${mode}: ${model.traceEdgeCount} edge(s), ${format(model.totalLengthMm)} mm total.`;
}
function format(value) {
  return Number(value).toLocaleString('en', { maximumFractionDigits: 3 });
}
