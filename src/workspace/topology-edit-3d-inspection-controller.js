/** Canonical selection inspection and engineering measurement composition. */
import {
  TopologyEdit3DViewController as IssueReviewController,
} from './topology-edit-3d-issue-controller.js';
import {
  createTopologyEditSelection,
} from './topology-edit/topology-edit-command-ui.js';
import {
  buildTopologyEditInspectionModel,
} from './topology-edit/topology-edit-inspection-model.js';
import {
  renderTopologyEditInspectionPanel,
} from './topology-edit/topology-edit-inspection-panel.js';
import {
  topologyEditPresentationActions,
} from './viewport-presentation/topology-edit-presentation-contract.js';

const PRESENTATION_ACTIONS = topologyEditPresentationActions();

export class TopologyEdit3DViewController extends IssueReviewController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.inspectionElement = null;
    this.inspectionModel = null;
  }

  buildShell() {
    super.buildShell();
    const element = this.hostElement?.ownerDocument.createElement('section');
    if (!element || !this.checkerElement) {
      throw new Error('TopologyEditInspectionController: inspection host is unavailable.');
    }
    element.dataset.role = 'topology-edit-inspection';
    element.className = 'topology-edit-inspection';
    element.setAttribute('aria-label', 'Canonical selection inspection');
    this.checkerElement.before(element);
    this.inspectionElement = element;
  }

  deactivate() {
    this.viewportBackend?.clearInspection();
    this.inspectionElement = null;
    this.inspectionModel = null;
    super.deactivate();
  }

  refreshView(canonical) {
    super.refreshView(canonical);
    this.refreshInspection(canonical);
  }

  applyCanonicalPick(pick, additive) {
    super.applyCanonicalPick(pick, additive);
    this.refreshInspection();
  }

  activateSearchResult(result) {
    super.activateSearchResult(result);
    this.refreshInspection();
  }

  focusIssue(entry) {
    super.focusIssue(entry);
    this.refreshInspection();
  }

  handleHostClick(event) {
    if (event.target.closest('[data-action="clear-inspection"]')) {
      this.clearInspectionSelection();
      return;
    }
    if (event.target.closest('[data-action="focus-inspection"]')) {
      this.focusInspectionSelection();
      return;
    }
    return super.handleHostClick(event);
  }

  refreshInspection(canonical = this.session?.currentTopology()) {
    if (!canonical || !this.inspectionElement) {
      this.inspectionModel = null;
      this.viewportBackend?.clearInspection();
      return;
    }
    try {
      this.inspectionModel = buildTopologyEditInspectionModel({
        canonicalTopology: canonical,
        selection: this.selection,
      });
      this.viewportBackend?.renderInspection(this.inspectionModel);
      renderTopologyEditInspectionPanel(
        this.inspectionElement,
        this.inspectionModel,
      );
    } catch (error) {
      this.inspectionModel = null;
      this.viewportBackend?.clearInspection();
      this.inspectionElement.textContent = error instanceof Error
        ? error.message
        : String(error);
    }
  }

  clearInspectionSelection() {
    this.selection = createTopologyEditSelection();
    this.presentationToolbar?.update(this.presentationState);
    this.refreshInspection();
    this.updateActionButtons();
    this.setStatus('Canonical selection and measurement cleared.');
  }

  focusInspectionSelection() {
    if (this.inspectionModel?.status !== 'READY'
      || !this.inspectionModel.canonicalIds.length) {
      this.setStatus('No current canonical selection is available to focus.');
      return;
    }
    let result = this.focusCanonicalIds(this.inspectionModel.canonicalIds);
    let visibilityReset = false;
    if (result.status !== 'FOCUSED') {
      this.applyPresentationAction({ type: PRESENTATION_ACTIONS.SHOW_ALL_IDS });
      visibilityReset = true;
      result = this.focusCanonicalIds(this.inspectionModel.canonicalIds);
    }
    if (result.status !== 'FOCUSED') {
      this.setStatus(
        `Selected canonical objects are absent from the current visual projection: ${this.inspectionModel.canonicalIds.join(', ')}.`,
      );
      return;
    }
    this.setStatus(
      `${visibilityReset ? 'Presentation visibility reset; ' : ''}`
      + `focused ${result.foundIds.length} selected canonical object(s).`,
    );
  }
}
