/** Portable deterministic review dossier over the completed C3D review stack. */
import {
  TopologyEdit3DViewController as RouteController,
} from './topology-edit-3d-route-controller.js';
import {
  captureTopologyEditCamera,
} from './viewport-productivity/topology-edit-review-bookmark.js';
import {
  createTopologyEditReviewDossier,
  topologyEditReviewDossierFilename,
  topologyEditReviewDossierJson,
} from './viewport-productivity/topology-edit-review-dossier.js';
import {
  renderTopologyEditReviewDossierPanel,
} from './viewport-productivity/topology-edit-review-dossier-panel.js';
import {
  TopologyEditReviewDossierRenderer,
} from './viewport-productivity/topology-edit-review-dossier-renderer.js';
import {
  topologyEditPresentationActions,
} from './viewport-presentation/topology-edit-presentation-contract.js';

const PRESENTATION_ACTIONS = topologyEditPresentationActions();

export class TopologyEdit3DViewController extends RouteController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.dossierElement = null;
    this.reviewDossier = null;
    this.dossierRenderer = null;
  }

  buildShell() {
    super.buildShell();
    const element = this.hostElement?.ownerDocument.createElement('section');
    if (!element || !this.checkerElement) {
      throw new Error('TopologyEditDossierController: dossier host is unavailable.');
    }
    element.dataset.role = 'topology-edit-review-dossier';
    element.className = 'topology-edit-review-dossier';
    element.setAttribute('aria-label', 'Portable topology review dossier');
    this.checkerElement.before(element);
    this.dossierElement = element;
    this.renderDossierPanel();
  }

  deactivate() {
    this.dossierRenderer?.destroy();
    this.dossierRenderer = null;
    this.dossierElement = null;
    this.reviewDossier = null;
    super.deactivate();
  }

  refreshView(canonical) {
    super.refreshView(canonical);
    this.clearReviewDossier(false);
  }

  applyCanonicalPick(pick, additive) {
    super.applyCanonicalPick(pick, additive);
    this.clearReviewDossier(false);
  }

  activateSearchResult(result) {
    super.activateSearchResult(result);
    this.clearReviewDossier(false);
  }

  focusIssue(entry) {
    super.focusIssue(entry);
    this.clearReviewDossier(false);
  }

  renderCheckerPanel() {
    super.renderCheckerPanel();
    this.clearReviewDossier(false);
  }

  clearInspectionSelection() {
    super.clearInspectionSelection();
    this.clearReviewDossier(false);
  }

  buildRouteTrace() {
    super.buildRouteTrace();
    this.clearReviewDossier(false);
  }

  clearRouteTrace(announce = false) {
    super.clearRouteTrace(announce);
    this.clearReviewDossier(false);
  }

  saveReviewBookmark() {
    super.saveReviewBookmark();
    this.clearReviewDossier(false);
  }

  restoreReviewBookmark(bookmarkId) {
    super.restoreReviewBookmark(bookmarkId);
    this.clearReviewDossier(false);
  }

  deleteReviewBookmark(bookmarkId) {
    super.deleteReviewBookmark(bookmarkId);
    this.clearReviewDossier(false);
  }

  applyPresentationAction(action) {
    const result = super.applyPresentationAction(action);
    this.clearReviewDossier(false);
    return result;
  }

  handleHostClick(event) {
    if (event.target.closest('[data-action="build-review-dossier"]')) {
      this.buildReviewDossier();
      return;
    }
    if (event.target.closest('[data-action="focus-review-dossier"]')) {
      this.focusReviewDossier();
      return;
    }
    if (event.target.closest('[data-action="download-review-dossier"]')) {
      this.downloadReviewDossier();
      return;
    }
    if (event.target.closest('[data-action="clear-review-dossier"]')) {
      this.clearReviewDossier(true);
      return;
    }
    return super.handleHostClick(event);
  }

  buildReviewDossier() {
    const canonical = this.session?.currentTopology();
    if (!canonical || !this.presentationState || !this.provenanceModel) {
      this.setStatus('Review dossier is unavailable without a current certified review basis.');
      return;
    }
    try {
      this.reviewDossier = createTopologyEditReviewDossier({
        basis: this.presentationState.basis,
        camera: captureTopologyEditCamera(this.viewportBackend?.activeCamera),
        presentationState: this.presentationState,
        selection: this.selection,
        bookmarks: this.reviewStore.list(),
        provenance: this.provenanceModel,
        comparison: this.comparisonModel,
        issueOverlay: this.issueOverlay,
        inspection: this.inspectionModel,
        routeTrace: this.routeTraceModel,
        visualDiagnostics: this.visualDiagnostics,
      });
      this.ensureDossierRenderer();
      const rendered = this.dossierRenderer.render(
        this.reviewDossier,
        canonical,
        this.viewportBackend?.lastBounds,
      );
      this.renderDossierPanel();
      this.setStatus(
        `Built review dossier ${this.reviewDossier.dossierHash.slice(0, 12)} with ${this.reviewDossier.summary.coverageCanonicalCount} coverage ID(s); ${rendered} exact scene object(s) rendered.`,
      );
    } catch (error) {
      this.reviewDossier = null;
      this.dossierRenderer?.clear();
      this.renderDossierPanel();
      this.setStatus(`Review dossier failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  focusReviewDossier() {
    const dossier = this.reviewDossier;
    const ids = dossier?.coverageCanonicalIds ?? [];
    if (!ids.length) {
      this.setStatus('No current review dossier coverage is available to focus.');
      return;
    }
    let result = this.focusCanonicalIds(ids);
    let visibilityReset = false;
    if (result.status !== 'FOCUSED') {
      this.applyPresentationAction({ type: PRESENTATION_ACTIONS.SHOW_ALL_IDS });
      visibilityReset = true;
      result = this.focusCanonicalIds(ids);
    }
    this.setStatus(result.status === 'FOCUSED'
      ? `${visibilityReset ? 'Presentation visibility reset; ' : ''}focused ${result.foundIds.length} dossier coverage object(s).`
      : 'Dossier coverage objects are absent from the current visual projection.');
  }

  downloadReviewDossier() {
    if (!this.reviewDossier || !this.dossierElement) {
      this.setStatus('Build a current review dossier before downloading.');
      return;
    }
    try {
      const document = this.dossierElement.ownerDocument;
      const view = document.defaultView;
      const BlobType = view?.Blob ?? globalThis.Blob;
      const URLApi = view?.URL ?? globalThis.URL;
      if (!BlobType || !URLApi?.createObjectURL) throw new Error('Browser download API is unavailable.');
      const blob = new BlobType([topologyEditReviewDossierJson(this.reviewDossier)], {
        type: 'application/json',
      });
      const url = URLApi.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = topologyEditReviewDossierFilename(this.reviewDossier);
      anchor.hidden = true;
      document.body?.append(anchor);
      anchor.click();
      anchor.remove();
      URLApi.revokeObjectURL(url);
      this.setStatus(`Downloaded display-review dossier ${anchor.download}.`);
    } catch (error) {
      this.setStatus(`Review dossier download failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  clearReviewDossier(announce = false) {
    this.reviewDossier = null;
    this.dossierRenderer?.clear();
    this.renderDossierPanel();
    if (announce) this.setStatus('Portable review dossier and coverage overlay cleared.');
  }

  ensureDossierRenderer() {
    if (this.dossierRenderer) return;
    const group = this.viewportBackend?.groups?.transientGroup;
    if (!group) throw new Error('Renderer-owned transientGroup is unavailable.');
    this.dossierRenderer = new TopologyEditReviewDossierRenderer(group);
  }

  renderDossierPanel() {
    if (!this.dossierElement) return;
    renderTopologyEditReviewDossierPanel(this.dossierElement, this.reviewDossier);
  }
}
