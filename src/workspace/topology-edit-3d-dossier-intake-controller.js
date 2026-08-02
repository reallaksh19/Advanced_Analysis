/** Fail-closed local dossier intake over the completed Wave 7 review workflow. */
import {
  TopologyEdit3DViewController as DossierController,
} from './topology-edit-3d-dossier-controller.js';
import {
  restoreTopologyEditCamera,
} from './viewport-productivity/topology-edit-review-bookmark.js';
import {
  parseTopologyEditReviewDossierJson,
  reconcileTopologyEditReviewDossier,
  TOPOLOGY_EDIT_REVIEW_DOSSIER_MAX_BYTES,
  topologyEditCurrentEvidenceHashes,
} from './viewport-productivity/topology-edit-review-dossier-intake.js';
import {
  renderTopologyEditReviewDossierIntakePanel,
} from './viewport-productivity/topology-edit-review-dossier-intake-panel.js';
import {
  topologyEditPresentationActions,
} from './viewport-presentation/topology-edit-presentation-contract.js';

const PRESENTATION_ACTIONS = topologyEditPresentationActions();

export class TopologyEdit3DViewController extends DossierController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.dossierIntakeElement = null;
    this.dossierInputElement = null;
    this.importedDossier = null;
    this.dossierIntake = null;
    this.dossierIntakeFileName = null;
    this.dossierIntakeError = null;
    this.dossierInputChangeHandler = (event) => this.handleDossierInputChange(event);
  }

  buildShell() {
    super.buildShell();
    const document = this.hostElement?.ownerDocument;
    const section = document?.createElement('section');
    const input = document?.createElement('input');
    if (!section || !input || !this.dossierElement) {
      throw new Error('TopologyEditDossierIntakeController: intake host is unavailable.');
    }
    section.dataset.role = 'topology-edit-review-dossier-intake';
    section.className = 'topology-edit-review-dossier-intake';
    section.setAttribute('aria-label', 'Imported topology review dossier reconciliation');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    input.dataset.role = 'topology-edit-review-dossier-file';
    input.addEventListener('change', this.dossierInputChangeHandler);
    this.dossierElement.before(section, input);
    this.dossierIntakeElement = section;
    this.dossierInputElement = input;
    this.renderDossierIntakePanel();
  }

  deactivate() {
    this.dossierInputElement?.removeEventListener(
      'change',
      this.dossierInputChangeHandler,
    );
    this.dossierInputElement?.remove();
    this.clearDossierIntake(false);
    this.dossierIntakeElement = null;
    this.dossierInputElement = null;
    super.deactivate();
  }

  clearReviewDossier(announce = false) {
    super.clearReviewDossier(announce);
    this.clearDossierIntake(false);
  }

  buildReviewDossier() {
    this.clearDossierIntake(false);
    super.buildReviewDossier();
  }

  handleHostClick(event) {
    if (event.target.closest('[data-action="choose-review-dossier"]')) {
      this.dossierInputElement?.click();
      return;
    }
    if (event.target.closest('[data-action="focus-dossier-intake"]')) {
      this.focusDossierIntake();
      return;
    }
    if (event.target.closest('[data-action="apply-dossier-viewpoint"]')) {
      this.applyDossierViewpoint();
      return;
    }
    if (event.target.closest('[data-action="clear-dossier-intake"]')) {
      this.clearDossierIntake(true);
      return;
    }
    return super.handleHostClick(event);
  }

  async handleDossierInputChange(event) {
    const file = event.target?.files?.[0] ?? null;
    if (!file) return;
    try {
      await this.importReviewDossierFile(file);
    } finally {
      if (this.dossierInputElement) this.dossierInputElement.value = '';
    }
  }

  async importReviewDossierFile(file) {
    if (!this.session?.currentTopology() || !this.presentationState) {
      this.rejectDossierIntake(
        file?.name,
        'A current certified review basis is required before dossier intake.',
      );
      return;
    }
    try {
      if (!file || typeof file.text !== 'function') {
        throw new TypeError('A readable local JSON file is required.');
      }
      const byteLength = Number(file.size);
      if (!Number.isInteger(byteLength) || byteLength < 0) {
        throw new TypeError('Review dossier file size is unavailable.');
      }
      if (byteLength > TOPOLOGY_EDIT_REVIEW_DOSSIER_MAX_BYTES) {
        throw new RangeError(
          `Review dossier exceeds the ${TOPOLOGY_EDIT_REVIEW_DOSSIER_MAX_BYTES}-byte intake limit.`,
        );
      }
      const dossier = parseTopologyEditReviewDossierJson(await file.text(), {
        byteLength,
      });
      super.clearReviewDossier(false);
      const rendered = this.reconcileImportedDossier(
        dossier,
        safeFileName(file.name),
      );
      this.setStatus(
        `Accepted review dossier ${dossier.dossierHash.slice(0, 12)}: ${this.dossierIntake.basisStatus}, ${this.dossierIntake.coverageStatus}; ${rendered} exact scene object(s) rendered.`,
      );
    } catch (error) {
      this.rejectDossierIntake(
        file?.name,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  reconcileImportedDossier(dossier, fileName = this.dossierIntakeFileName) {
    const canonical = this.session?.currentTopology();
    if (!canonical || !this.presentationState) {
      throw new Error('Current review basis is unavailable for dossier reconciliation.');
    }
    const intake = reconcileTopologyEditReviewDossier({
      dossier,
      currentBasis: this.presentationState.basis,
      canonicalTopology: canonical,
      currentEvidenceHashes: topologyEditCurrentEvidenceHashes({
        presentationState: this.presentationState,
        provenance: this.provenanceModel,
        comparison: this.comparisonModel,
        issueOverlay: this.issueOverlay,
        inspection: this.inspectionModel,
        routeTrace: this.routeTraceModel,
      }),
    });
    this.importedDossier = dossier;
    this.dossierIntake = intake;
    this.dossierIntakeFileName = safeFileName(fileName);
    this.dossierIntakeError = null;
    this.ensureDossierRenderer();
    const rendered = this.dossierRenderer.render(
      dossier,
      canonical,
      this.viewportBackend?.lastBounds,
    );
    this.renderDossierIntakePanel();
    return rendered;
  }

  focusDossierIntake() {
    const ids = this.dossierIntake?.availableCanonicalIds ?? [];
    if (!ids.length) {
      this.setStatus('Imported dossier has no available exact canonical coverage to focus.');
      return;
    }
    let result = this.focusCanonicalIds(ids);
    let visibilityReset = false;
    if (result.status !== 'FOCUSED') {
      const dossier = this.importedDossier;
      const fileName = this.dossierIntakeFileName;
      super.applyPresentationAction({ type: PRESENTATION_ACTIONS.SHOW_ALL_IDS });
      if (dossier) this.reconcileImportedDossier(dossier, fileName);
      visibilityReset = true;
      result = this.focusCanonicalIds(
        this.dossierIntake?.availableCanonicalIds ?? ids,
      );
    }
    this.setStatus(result.status === 'FOCUSED'
      ? `${visibilityReset ? 'Presentation visibility reset and intake recomputed; ' : ''}focused ${result.foundIds.length} imported dossier coverage object(s).`
      : 'Available imported dossier coverage is absent from the current visual projection.');
  }

  applyDossierViewpoint() {
    if (!this.importedDossier || !this.dossierIntake?.viewpointReplayEligible) {
      this.setStatus('Imported dossier viewpoint replay is blocked by basis or coverage reconciliation.');
      return;
    }
    const dossier = this.importedDossier;
    const fileName = this.dossierIntakeFileName;
    try {
      this.restoreDisplayState({
        presentationState: dossier.presentationState,
        selection: dossier.selection,
      });
      restoreTopologyEditCamera(
        this.viewportBackend?.activeCamera,
        dossier.camera,
      );
      this.routeTraceModel = null;
      this.routeTraceRenderer?.clear();
      this.renderRoutePanel();
      this.refreshInspection();
      this.refreshReview();
      this.refreshComparison();
      this.updateActionButtons();
      this.reconcileImportedDossier(dossier, fileName);
      this.setStatus(
        `Applied imported display-review viewpoint ${dossier.dossierHash.slice(0, 12)} and recomputed intake; topology and workspace state remain unchanged.`,
      );
    } catch (error) {
      this.setStatus(
        `Imported dossier viewpoint replay failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  rejectDossierIntake(fileName, message) {
    super.clearReviewDossier(false);
    this.importedDossier = null;
    this.dossierIntake = null;
    this.dossierIntakeFileName = safeFileName(fileName);
    this.dossierIntakeError = String(message || 'Review dossier intake failed.');
    this.dossierRenderer?.clear();
    this.renderDossierIntakePanel();
    this.setStatus(`Review dossier intake rejected: ${this.dossierIntakeError}`);
  }

  clearDossierIntake(announce = false) {
    this.importedDossier = null;
    this.dossierIntake = null;
    this.dossierIntakeFileName = null;
    this.dossierIntakeError = null;
    if (!this.reviewDossier) this.dossierRenderer?.clear();
    this.renderDossierIntakePanel();
    if (announce) this.setStatus('Imported review dossier reconciliation cleared.');
  }

  renderDossierIntakePanel() {
    if (!this.dossierIntakeElement) return;
    renderTopologyEditReviewDossierIntakePanel(this.dossierIntakeElement, {
      intake: this.dossierIntake,
      fileName: this.dossierIntakeFileName,
      error: this.dossierIntakeError,
    });
  }
}

function safeFileName(value) {
  const name = String(value ?? '').trim();
  return name ? name.slice(0, 160) : null;
}
