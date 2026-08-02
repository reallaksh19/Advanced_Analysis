/** Review-only response package and round-trip reconciliation over Wave 8. */
import {
  TopologyEdit3DViewController as DossierIntakeController,
} from './topology-edit-3d-dossier-intake-controller.js';
import {
  createTopologyEditReviewResponse,
} from './viewport-productivity/topology-edit-review-response.js';
import {
  reconcileTopologyEditReviewResponse,
} from './viewport-productivity/topology-edit-review-response-intake.js';
import {
  downloadTopologyEditReviewResponse,
  readTopologyEditReviewResponseFile,
  topologyEditSafeReviewFileName,
} from './viewport-productivity/topology-edit-review-response-io.js';
import {
  renderTopologyEditReviewResponsePanel,
} from './viewport-productivity/topology-edit-review-response-panel.js';

export class TopologyEdit3DViewController extends DossierIntakeController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.reviewResponseElement = null;
    this.reviewResponseInputElement = null;
    this.reviewResponse = null;
    this.reviewResponseIntake = null;
    this.reviewResponseFileName = null;
    this.reviewResponseError = null;
    this.reviewResponseRows = new Map();
    this.selectedResponseIssueId = null;
    this.reviewResponseFileHandler = (event) => this.handleReviewResponseFile(event);
    this.reviewResponseChangeHandler = (event) => this.handleReviewResponseChange(event);
  }

  buildShell() {
    super.buildShell();
    const document = this.hostElement?.ownerDocument;
    const section = document?.createElement('section');
    const input = document?.createElement('input');
    if (!section || !input || !this.dossierElement) {
      throw new Error('TopologyEditReviewResponseController: response host is unavailable.');
    }
    section.dataset.role = 'topology-edit-review-response';
    section.className = 'topology-edit-review-response';
    section.setAttribute('aria-label', 'Topology review response round trip');
    section.addEventListener('change', this.reviewResponseChangeHandler);
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    input.dataset.role = 'topology-edit-review-response-file';
    input.addEventListener('change', this.reviewResponseFileHandler);
    this.dossierElement.after(section, input);
    this.reviewResponseElement = section;
    this.reviewResponseInputElement = input;
    this.renderReviewResponsePanel();
  }

  deactivate() {
    this.reviewResponseElement?.removeEventListener('change', this.reviewResponseChangeHandler);
    this.reviewResponseInputElement?.removeEventListener('change', this.reviewResponseFileHandler);
    this.reviewResponseInputElement?.remove();
    this.clearReviewResponse(false);
    this.reviewResponseElement = null;
    this.reviewResponseInputElement = null;
    super.deactivate();
  }

  clearDossierIntake(announce = false) {
    super.clearDossierIntake(announce);
    this.clearReviewResponse(false);
  }

  buildReviewDossier() {
    super.buildReviewDossier();
    this.renderReviewResponsePanel();
  }

  reconcileImportedDossier(dossier, fileName) {
    const rendered = super.reconcileImportedDossier(dossier, fileName);
    this.clearReviewResponse(false);
    this.renderReviewResponsePanel();
    return rendered;
  }

  handleHostClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'choose-review-response') this.reviewResponseInputElement?.click();
    else if (action === 'save-review-response') this.saveReviewResponseRow();
    else if (action === 'remove-review-response') this.removeReviewResponseRow();
    else if (action === 'download-review-response') this.downloadReviewResponse();
    else if (action === 'focus-review-response') this.focusReviewResponse();
    else if (action === 'clear-review-response') this.clearReviewResponse(true);
    else return super.handleHostClick(event);
  }

  handleReviewResponseChange(event) {
    const issueId = event.target?.closest?.('[data-role="review-response-issue"]')?.value;
    if (!issueId) return;
    this.selectedResponseIssueId = issueId;
    this.renderReviewResponsePanel();
  }

  async handleReviewResponseFile(event) {
    const file = event.target?.files?.[0] ?? null;
    if (!file) return;
    try { await this.importReviewResponseFile(file); }
    finally { if (this.reviewResponseInputElement) this.reviewResponseInputElement.value = ''; }
  }

  saveReviewResponseRow() {
    const dossier = this.activeResponseDossier();
    if (!dossier || !this.presentationState || !this.reviewResponseElement) {
      this.setStatus('Build or import a current review dossier before saving a response.');
      return;
    }
    const issueId = this.responseControl('review-response-issue')?.value;
    const disposition = this.responseControl('review-response-disposition')?.value;
    const note = this.responseControl('review-response-note')?.value ?? '';
    if (!issueId) {
      this.setStatus('Select an exact dossier issue before saving a response.');
      return;
    }
    this.selectedResponseIssueId = issueId;
    this.reviewResponseRows.set(issueId, { issueId, disposition, note });
    this.rebuildReviewResponse('Saved review-only response');
  }

  removeReviewResponseRow() {
    const issueId = this.responseControl('review-response-issue')?.value;
    if (!issueId || !this.reviewResponseRows.delete(issueId)) {
      this.setStatus('No retained response exists for the selected issue.');
      return;
    }
    this.selectedResponseIssueId = issueId;
    this.rebuildReviewResponse('Removed review-only response');
  }

  rebuildReviewResponse(prefix) {
    const dossier = this.activeResponseDossier();
    const canonical = this.session?.currentTopology();
    if (!dossier || !canonical || !this.presentationState) {
      this.clearReviewResponse(false);
      this.setStatus('Current dossier and review basis are required for response generation.');
      return;
    }
    if (!this.reviewResponseRows.size) {
      this.reviewResponse = null;
      this.reviewResponseIntake = null;
      this.reviewResponseFileName = null;
      this.reviewResponseError = null;
      this.renderReviewResponsePanel();
      this.setStatus(`${prefix}; no response rows remain.`);
      return;
    }
    try {
      const response = createTopologyEditReviewResponse({
        dossier,
        intake: this.importedDossier ? this.dossierIntake : null,
        responderBasis: this.presentationState.basis,
        responses: [...this.reviewResponseRows.values()],
      });
      this.acceptReviewResponse(response, null);
      this.setStatus(`${prefix} ${response.responseHash.slice(0, 12)}; checker and workspace state remain unchanged.`);
    } catch (error) {
      this.reviewResponseError = error instanceof Error ? error.message : String(error);
      this.renderReviewResponsePanel();
      this.setStatus(`Review response failed: ${this.reviewResponseError}`);
    }
  }

  async importReviewResponseFile(file) {
    if (!this.activeResponseDossier() || !this.session?.currentTopology() || !this.presentationState) {
      this.rejectReviewResponse(file?.name, 'Build or import a current dossier before response intake.');
      return;
    }
    try {
      const response = await readTopologyEditReviewResponseFile(file);
      const intake = this.acceptReviewResponse(response, topologyEditSafeReviewFileName(file.name));
      this.reviewResponseRows = intake.dossierStatus === 'MATCH'
        ? new Map(response.responses.map((row) => [row.issueId, {
          issueId: row.issueId, disposition: row.disposition, note: row.note,
        }]))
        : new Map();
      this.selectedResponseIssueId = response.responses[0]?.issueId ?? null;
      this.renderReviewResponsePanel();
      this.setStatus(`Accepted response ${response.responseHash.slice(0, 12)}: ${intake.dossierStatus}, ${intake.responseStatus}, ${intake.basisStatus}.`);
    } catch (error) {
      this.rejectReviewResponse(file?.name, error instanceof Error ? error.message : String(error));
    }
  }

  acceptReviewResponse(response, fileName) {
    const intake = reconcileTopologyEditReviewResponse({
      response,
      dossier: this.activeResponseDossier(),
      currentBasis: this.presentationState.basis,
      canonicalTopology: this.session.currentTopology(),
    });
    this.reviewResponse = response;
    this.reviewResponseIntake = intake;
    this.reviewResponseFileName = fileName;
    this.reviewResponseError = null;
    this.renderReviewResponsePanel();
    return intake;
  }

  downloadReviewResponse() {
    if (!this.reviewResponse || !this.reviewResponseElement) {
      this.setStatus('Create or import a review response before downloading.');
      return;
    }
    try {
      const filename = downloadTopologyEditReviewResponse(
        this.reviewResponseElement.ownerDocument,
        this.reviewResponse,
      );
      this.setStatus(`Downloaded display-review response ${filename}.`);
    } catch (error) {
      this.setStatus(`Review response download failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  focusReviewResponse() {
    const ids = this.reviewResponseIntake?.availableCanonicalIds ?? [];
    if (!ids.length) {
      this.setStatus('Review response has no available exact canonical coverage to focus.');
      return;
    }
    const result = this.focusCanonicalIds(ids);
    this.setStatus(result.status === 'FOCUSED'
      ? `Focused ${result.foundIds.length} exact review response object(s).`
      : 'Response coverage is hidden or absent from the current visual projection.');
  }

  rejectReviewResponse(fileName, message) {
    this.reviewResponse = null;
    this.reviewResponseIntake = null;
    this.reviewResponseRows.clear();
    this.reviewResponseFileName = topologyEditSafeReviewFileName(fileName);
    this.reviewResponseError = String(message || 'Review response intake failed.');
    this.renderReviewResponsePanel();
    this.setStatus(`Review response rejected: ${this.reviewResponseError}`);
  }

  clearReviewResponse(announce = false) {
    this.reviewResponse = null;
    this.reviewResponseIntake = null;
    this.reviewResponseFileName = null;
    this.reviewResponseError = null;
    this.reviewResponseRows.clear();
    this.selectedResponseIssueId = null;
    this.renderReviewResponsePanel();
    if (announce) this.setStatus('Review response package and reconciliation cleared.');
  }

  responseControl(role) {
    return this.reviewResponseElement?.querySelector(`[data-role="${role}"]`) ?? null;
  }

  activeResponseDossier() {
    return this.importedDossier ?? this.reviewDossier ?? null;
  }

  renderReviewResponsePanel() {
    if (!this.reviewResponseElement) return;
    renderTopologyEditReviewResponsePanel(this.reviewResponseElement, {
      dossier: this.activeResponseDossier(),
      response: this.reviewResponse,
      intake: this.reviewResponseIntake,
      fileName: this.reviewResponseFileName,
      error: this.reviewResponseError,
      selectedIssueId: this.selectedResponseIssueId,
    });
  }
}
