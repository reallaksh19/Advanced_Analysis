/** Multi-response display-review ledger and conflict matrix over Wave 9. */
import {
  TopologyEdit3DViewController as ReviewResponseController,
} from './topology-edit-3d-review-response-controller.js';
import {
  createTopologyEditReviewResponseLedger,
} from './viewport-productivity/topology-edit-review-response-ledger.js';
import {
  reconcileTopologyEditReviewResponseLedger,
} from './viewport-productivity/topology-edit-review-response-ledger-intake.js';
import {
  downloadTopologyEditReviewResponseLedger,
  readTopologyEditReviewResponseLedgerFile,
  topologyEditSafeReviewLedgerFileName,
} from './viewport-productivity/topology-edit-review-response-ledger-io.js';
import {
  renderTopologyEditReviewResponseLedgerPanel,
} from './viewport-productivity/topology-edit-review-response-ledger-panel.js';

export class TopologyEdit3DViewController extends ReviewResponseController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.reviewLedgerElement = null;
    this.reviewLedgerInputElement = null;
    this.reviewLedger = null;
    this.reviewLedgerIntake = null;
    this.reviewLedgerFileName = null;
    this.reviewLedgerError = null;
    this.selectedLedgerResponseHash = null;
    this.reviewLedgerFileHandler = (event) => this.handleReviewLedgerFile(event);
    this.reviewLedgerChangeHandler = (event) => this.handleReviewLedgerChange(event);
  }

  buildShell() {
    super.buildShell();
    const document = this.hostElement?.ownerDocument;
    const section = document?.createElement('section');
    const input = document?.createElement('input');
    if (!section || !input || !this.reviewResponseElement) {
      throw new Error('TopologyEditReviewLedgerController: ledger host is unavailable.');
    }
    section.dataset.role = 'topology-edit-review-ledger';
    section.className = 'topology-edit-review-ledger';
    section.setAttribute('aria-label', 'Multi-response topology review ledger');
    section.addEventListener('change', this.reviewLedgerChangeHandler);
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    input.dataset.role = 'topology-edit-review-ledger-file';
    input.addEventListener('change', this.reviewLedgerFileHandler);
    this.reviewResponseElement.after(section, input);
    this.reviewLedgerElement = section;
    this.reviewLedgerInputElement = input;
    this.renderReviewLedgerPanel();
  }

  deactivate() {
    this.reviewLedgerElement?.removeEventListener('change', this.reviewLedgerChangeHandler);
    this.reviewLedgerInputElement?.removeEventListener('change', this.reviewLedgerFileHandler);
    this.reviewLedgerInputElement?.remove();
    this.clearReviewLedger(false);
    this.reviewLedgerElement = null;
    this.reviewLedgerInputElement = null;
    super.deactivate();
  }

  clearReviewDossier(announce = false) {
    super.clearReviewDossier(announce);
    this.clearReviewLedger(false);
  }

  buildReviewDossier() {
    this.clearReviewLedger(false);
    super.buildReviewDossier();
    this.renderReviewLedgerPanel();
  }

  reconcileImportedDossier(dossier, fileName) {
    this.clearReviewLedger(false);
    const rendered = super.reconcileImportedDossier(dossier, fileName);
    this.renderReviewLedgerPanel();
    return rendered;
  }

  handleHostClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'add-review-ledger-response') this.addCurrentResponseToLedger();
    else if (action === 'remove-review-ledger-response') this.removeSelectedLedgerResponse();
    else if (action === 'choose-review-ledger') this.reviewLedgerInputElement?.click();
    else if (action === 'download-review-ledger') this.downloadReviewLedger();
    else if (action === 'focus-review-ledger-conflicts') this.focusReviewLedgerConflicts();
    else if (action === 'clear-review-ledger') this.clearReviewLedger(true);
    else return super.handleHostClick(event);
  }

  handleReviewLedgerChange(event) {
    const hash = event.target?.closest?.('[data-role="review-ledger-response"]')?.value;
    if (!hash) return;
    this.selectedLedgerResponseHash = hash;
    this.renderReviewLedgerPanel();
  }

  async handleReviewLedgerFile(event) {
    const file = event.target?.files?.[0] ?? null;
    if (!file) return;
    try { await this.importReviewLedgerFile(file); }
    finally { if (this.reviewLedgerInputElement) this.reviewLedgerInputElement.value = ''; }
  }

  addCurrentResponseToLedger() {
    const dossier = this.activeResponseDossier();
    const canonical = this.session?.currentTopology();
    if (!dossier || !canonical || !this.presentationState || !this.reviewResponse) {
      this.setStatus('Create or import a current response before adding it to the ledger.');
      return;
    }
    if (this.reviewLedgerIntake?.dossierStatus === 'MISMATCH') {
      this.setStatus('Clear the mismatched ledger before adding a current-dossier response.');
      return;
    }
    const responses = [
      ...(this.reviewLedger?.packages?.map((entry) => entry.response) ?? []),
      this.reviewResponse,
    ];
    try {
      const ledger = createTopologyEditReviewResponseLedger({
        dossier,
        currentBasis: this.presentationState.basis,
        canonicalTopology: canonical,
        responses,
      });
      this.acceptReviewLedger(ledger, null);
      this.selectedLedgerResponseHash = this.reviewResponse.responseHash;
      this.renderReviewLedgerPanel();
      this.setStatus(
        `Added response ${this.reviewResponse.responseHash.slice(0, 12)} to review ledger ${ledger.ledgerHash.slice(0, 12)}; no checker or workspace state changed.`,
      );
    } catch (error) {
      this.rejectReviewLedger(null, error instanceof Error ? error.message : String(error));
    }
  }

  removeSelectedLedgerResponse() {
    const dossier = this.activeResponseDossier();
    const canonical = this.session?.currentTopology();
    if (!this.reviewLedger || !dossier || !canonical || !this.presentationState) {
      this.setStatus('No current review ledger response is available to remove.');
      return;
    }
    if (this.reviewLedgerIntake?.dossierStatus === 'MISMATCH') {
      this.setStatus('Response removal is blocked until the exact source dossier is active.');
      return;
    }
    const hash = this.selectedLedgerResponseHash
      ?? this.reviewLedger.packages[0]?.response.responseHash
      ?? null;
    const responses = this.reviewLedger.packages
      .map((entry) => entry.response)
      .filter((response) => response.responseHash !== hash);
    if (responses.length === this.reviewLedger.packages.length) {
      this.setStatus('Selected response is not retained in the review ledger.');
      return;
    }
    if (!responses.length) {
      this.clearReviewLedger(true);
      return;
    }
    try {
      const ledger = createTopologyEditReviewResponseLedger({
        dossier,
        currentBasis: this.presentationState.basis,
        canonicalTopology: canonical,
        responses,
      });
      this.acceptReviewLedger(ledger, null);
      this.selectedLedgerResponseHash = ledger.packages[0]?.response.responseHash ?? null;
      this.renderReviewLedgerPanel();
      this.setStatus(`Removed response ${hash?.slice(0, 12)} from the display-review ledger.`);
    } catch (error) {
      this.rejectReviewLedger(null, error instanceof Error ? error.message : String(error));
    }
  }

  async importReviewLedgerFile(file) {
    if (!this.activeResponseDossier() || !this.session?.currentTopology() || !this.presentationState) {
      this.rejectReviewLedger(file?.name, 'Build or import a current dossier before ledger intake.');
      return;
    }
    try {
      const ledger = await readTopologyEditReviewResponseLedgerFile(file);
      const intake = this.acceptReviewLedger(
        ledger,
        topologyEditSafeReviewLedgerFileName(file.name),
      );
      this.selectedLedgerResponseHash = ledger.packages[0]?.response.responseHash ?? null;
      this.renderReviewLedgerPanel();
      this.setStatus(
        `Accepted review ledger ${ledger.ledgerHash.slice(0, 12)}: ${intake.dossierStatus}, ${intake.issueSetStatus}, ${intake.coverageStatus}.`,
      );
    } catch (error) {
      this.rejectReviewLedger(file?.name, error instanceof Error ? error.message : String(error));
    }
  }

  acceptReviewLedger(ledger, fileName) {
    const intake = reconcileTopologyEditReviewResponseLedger({
      ledger,
      dossier: this.activeResponseDossier(),
      currentBasis: this.presentationState.basis,
      canonicalTopology: this.session.currentTopology(),
    });
    this.reviewLedger = ledger;
    this.reviewLedgerIntake = intake;
    this.reviewLedgerFileName = fileName;
    this.reviewLedgerError = null;
    this.renderReviewLedgerPanel();
    return intake;
  }

  downloadReviewLedger() {
    if (!this.reviewLedger || !this.reviewLedgerElement) {
      this.setStatus('Create or import a review ledger before downloading.');
      return;
    }
    try {
      const filename = downloadTopologyEditReviewResponseLedger(
        this.reviewLedgerElement.ownerDocument,
        this.reviewLedger,
      );
      this.setStatus(`Downloaded display-review ledger ${filename}.`);
    } catch (error) {
      this.setStatus(`Review ledger download failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  focusReviewLedgerConflicts() {
    const ids = this.reviewLedgerIntake?.availableConflictCanonicalIds ?? [];
    if (!ids.length) {
      this.setStatus('Review ledger has no available exact conflicting coverage to focus.');
      return;
    }
    const result = this.focusCanonicalIds(ids);
    this.setStatus(result.status === 'FOCUSED'
      ? `Focused ${result.foundIds.length} exact object(s) with conflicting review dispositions.`
      : 'Conflicting ledger coverage is hidden or absent from the current visual projection.');
  }

  rejectReviewLedger(fileName, message) {
    this.reviewLedger = null;
    this.reviewLedgerIntake = null;
    this.reviewLedgerFileName = topologyEditSafeReviewLedgerFileName(fileName);
    this.reviewLedgerError = String(message || 'Review ledger intake failed.');
    this.selectedLedgerResponseHash = null;
    this.renderReviewLedgerPanel();
    this.setStatus(`Review ledger rejected: ${this.reviewLedgerError}`);
  }

  clearReviewLedger(announce = false) {
    this.reviewLedger = null;
    this.reviewLedgerIntake = null;
    this.reviewLedgerFileName = null;
    this.reviewLedgerError = null;
    this.selectedLedgerResponseHash = null;
    this.renderReviewLedgerPanel();
    if (announce) this.setStatus('Multi-response review ledger cleared.');
  }

  renderReviewResponsePanel() {
    super.renderReviewResponsePanel();
    this.renderReviewLedgerPanel();
  }

  renderReviewLedgerPanel() {
    if (!this.reviewLedgerElement) return;
    const ledgerMatches = !this.reviewLedgerIntake
      || this.reviewLedgerIntake.dossierStatus === 'MATCH';
    renderTopologyEditReviewResponseLedgerPanel(this.reviewLedgerElement, {
      ledger: this.reviewLedger,
      intake: this.reviewLedgerIntake,
      fileName: this.reviewLedgerFileName,
      error: this.reviewLedgerError,
      currentResponseHash: ledgerMatches ? this.reviewResponse?.responseHash : null,
      selectedResponseHash: this.selectedLedgerResponseHash,
    });
  }
}
