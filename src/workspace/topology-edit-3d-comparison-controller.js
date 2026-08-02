/** Deterministic source-vs-draft comparison over the completed review controller. */
import {
  TopologyEdit3DViewController as InspectionController,
} from './topology-edit-3d-inspection-controller.js';
import {
  buildTopologyEditComparisonModel,
} from './viewport-productivity/topology-edit-comparison-model.js';
import {
  renderTopologyEditComparisonPanel,
} from './viewport-productivity/topology-edit-comparison-panel.js';
import {
  topologyEditPresentationActions,
} from './viewport-presentation/topology-edit-presentation-contract.js';

const PRESENTATION_ACTIONS = topologyEditPresentationActions();

export class TopologyEdit3DViewController extends InspectionController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.comparisonElement = null;
    this.comparisonModel = null;
  }

  buildShell() {
    super.buildShell();
    const element = this.hostElement?.ownerDocument.createElement('section');
    if (!element || !this.reviewElement) {
      throw new Error('TopologyEditComparisonController: comparison host is unavailable.');
    }
    element.dataset.role = 'topology-edit-comparison';
    element.className = 'topology-edit-comparison';
    element.setAttribute('aria-label', 'Source versus draft canonical comparison');
    this.reviewElement.before(element);
    this.comparisonElement = element;
  }

  deactivate() {
    this.comparisonElement = null;
    this.comparisonModel = null;
    super.deactivate();
  }

  refreshView(canonical) {
    super.refreshView(canonical);
    this.refreshComparison(canonical);
  }

  handleHostClick(event) {
    if (event.target.closest('[data-action="focus-comparison"]')) return this.focusComparison();
    if (event.target.closest('[data-action="isolate-comparison"]')) return this.isolateComparison();
    if (event.target.closest('[data-action="show-all-comparison"]')) return this.showAllComparison();
    return super.handleHostClick(event);
  }

  refreshComparison(draftTopology = this.session?.currentTopology()) {
    const sourceTopology = this.session?.baseCanonicalTopology;
    if (!sourceTopology || !draftTopology || !this.comparisonElement) return;
    try {
      this.comparisonModel = buildTopologyEditComparisonModel({ sourceTopology, draftTopology });
      renderTopologyEditComparisonPanel(this.comparisonElement, this.comparisonModel);
    } catch (error) {
      this.comparisonModel = null;
      this.comparisonElement.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  focusComparison() {
    const ids = this.comparisonModel?.changedCanonicalIds ?? [];
    if (!ids.length) return this.setStatus('Source and draft canonical topology are identical.');
    let result = this.focusCanonicalIds(ids);
    let visibilityReset = false;
    if (result.status !== 'FOCUSED') {
      this.applyPresentationAction({ type: PRESENTATION_ACTIONS.SHOW_ALL_IDS });
      visibilityReset = true;
      result = this.focusCanonicalIds(ids);
    }
    this.setStatus(result.status === 'FOCUSED'
      ? `${visibilityReset ? 'Presentation visibility reset; ' : ''}focused ${result.foundIds.length} changed canonical object(s).`
      : 'Changed canonical objects are absent from the current visual projection.');
  }

  isolateComparison() {
    const ids = this.comparisonModel?.changedCanonicalIds ?? [];
    if (!ids.length) return this.setStatus('No changed canonical objects are available to isolate.');
    this.applyPresentationAction({ type: PRESENTATION_ACTIONS.ISOLATE_IDS, canonicalIds: ids });
    this.setStatus(`Isolated ${ids.length} source-vs-draft changed canonical object(s).`);
  }

  showAllComparison() {
    this.applyPresentationAction({ type: PRESENTATION_ACTIONS.SHOW_ALL_IDS });
    this.setStatus('All canonical objects restored after source-vs-draft review.');
  }
}
