/** Canonical inspection, measurement, session review, and provenance composition. */
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
import {
  TopologyEditReviewStore,
  captureTopologyEditCamera,
  restoreTopologyEditCamera,
} from './viewport-productivity/topology-edit-review-bookmark.js';
import {
  buildTopologyEditProvenanceModel,
} from './viewport-productivity/topology-edit-provenance-model.js';
import {
  renderTopologyEditReviewPanel,
} from './viewport-productivity/topology-edit-review-panel.js';

const PRESENTATION_ACTIONS = topologyEditPresentationActions();

export class TopologyEdit3DViewController extends IssueReviewController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.inspectionElement = null;
    this.inspectionModel = null;
    this.reviewElement = null;
    this.reviewStore = new TopologyEditReviewStore();
    this.provenanceModel = null;
  }

  buildShell() {
    super.buildShell();
    const document = this.hostElement?.ownerDocument;
    const inspection = document?.createElement('section');
    const review = document?.createElement('section');
    if (!inspection || !review || !this.checkerElement) {
      throw new Error('TopologyEditInspectionController: review hosts are unavailable.');
    }
    inspection.dataset.role = 'topology-edit-inspection';
    inspection.className = 'topology-edit-inspection';
    inspection.setAttribute('aria-label', 'Canonical selection inspection');
    review.dataset.role = 'topology-edit-review';
    review.className = 'topology-edit-review';
    review.setAttribute('aria-label', 'Topology review bookmarks and provenance');
    this.checkerElement.before(review, inspection);
    this.inspectionElement = inspection;
    this.reviewElement = review;
  }

  deactivate() {
    this.viewportBackend?.clearInspection();
    this.reviewStore.clear();
    this.inspectionElement = null;
    this.inspectionModel = null;
    this.reviewElement = null;
    this.provenanceModel = null;
    super.deactivate();
  }

  refreshView(canonical) {
    super.refreshView(canonical);
    this.refreshInspection(canonical);
    this.refreshReview(canonical);
  }

  applyCanonicalPick(pick, additive) {
    super.applyCanonicalPick(pick, additive);
    this.refreshInspection();
    this.refreshReview();
  }

  activateSearchResult(result) {
    super.activateSearchResult(result);
    this.refreshInspection();
    this.refreshReview();
  }

  focusIssue(entry) {
    super.focusIssue(entry);
    this.refreshInspection();
    this.refreshReview();
  }

  handleHostClick(event) {
    const restore = event.target.closest('[data-action="restore-review-bookmark"]');
    if (restore) return this.restoreReviewBookmark(restore.dataset.reviewBookmarkId);
    const remove = event.target.closest('[data-action="delete-review-bookmark"]');
    if (remove) return this.deleteReviewBookmark(remove.dataset.reviewBookmarkId);
    if (event.target.closest('[data-action="save-review-bookmark"]')) return this.saveReviewBookmark();
    if (event.target.closest('[data-action="clear-inspection"]')) return this.clearInspectionSelection();
    if (event.target.closest('[data-action="focus-inspection"]')) return this.focusInspectionSelection();
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
      renderTopologyEditInspectionPanel(this.inspectionElement, this.inspectionModel);
    } catch (error) {
      this.inspectionModel = null;
      this.viewportBackend?.clearInspection();
      this.inspectionElement.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  refreshReview(canonical = this.session?.currentTopology()) {
    if (!canonical || !this.reviewElement) return;
    this.provenanceModel = buildTopologyEditProvenanceModel({
      canonicalTopology: canonical,
      selection: this.selection,
      diagnostics: this.visualDiagnostics,
    });
    renderTopologyEditReviewPanel(this.reviewElement, {
      records: this.reviewStore.list(),
      provenance: this.provenanceModel,
    });
  }

  saveReviewBookmark() {
    if (!this.session || !this.presentationState || !this.provenanceModel) return;
    try {
      const title = this.reviewElement?.querySelector('[data-review-title]')?.value;
      const note = this.reviewElement?.querySelector('[data-review-note]')?.value;
      const record = this.reviewStore.save({
        title,
        note,
        basis: this.presentationState.basis,
        camera: captureTopologyEditCamera(this.viewportBackend?.activeCamera),
        presentationState: this.presentationState,
        selection: this.selection,
        provenance: this.provenanceModel,
      });
      this.refreshReview();
      this.setStatus(`Saved session review bookmark ${record.sequence}: ${record.title}.`);
    } catch (error) {
      this.setStatus(`Review bookmark failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  restoreReviewBookmark(bookmarkId) {
    const resolved = this.reviewStore.resolve(bookmarkId, this.presentationState?.basis);
    if (resolved.status !== 'CURRENT') {
      this.setStatus(resolved.status === 'NOT_FOUND'
        ? 'Review bookmark is no longer available.'
        : `Review bookmark restore blocked: ${resolved.status}.`);
      return;
    }
    try {
      this.restoreDisplayState({
        presentationState: resolved.record.presentationState,
        selection: resolved.record.selection,
      });
      restoreTopologyEditCamera(this.viewportBackend?.activeCamera, resolved.record.camera);
      this.refreshInspection();
      this.refreshReview();
      this.updateActionButtons();
      this.setStatus(`Restored session review bookmark ${resolved.record.sequence}: ${resolved.record.title}.`);
    } catch (error) {
      this.setStatus(`Review bookmark restore failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  deleteReviewBookmark(bookmarkId) {
    const removed = this.reviewStore.remove(bookmarkId);
    this.refreshReview();
    this.setStatus(removed ? 'Session review bookmark deleted.' : 'Review bookmark is no longer available.');
  }

  clearInspectionSelection() {
    this.selection = createTopologyEditSelection();
    this.presentationToolbar?.update(this.presentationState);
    this.refreshInspection();
    this.refreshReview();
    this.updateActionButtons();
    this.setStatus('Canonical selection and measurement cleared.');
  }

  focusInspectionSelection() {
    if (this.inspectionModel?.status !== 'READY' || !this.inspectionModel.canonicalIds.length) {
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
      this.setStatus(`Selected canonical objects are absent from the current visual projection: ${this.inspectionModel.canonicalIds.join(', ')}.`);
      return;
    }
    this.setStatus(`${visibilityReset ? 'Presentation visibility reset; ' : ''}focused ${result.foundIds.length} selected canonical object(s).`);
  }
}
