import './topology-edit-productivity.css';
import {
  TopologyEdit3DViewController as ProfessionalController,
} from './topology-edit-3d-professional-controller.js';
import {
  TopologyEditCleanShellRuntime,
} from './viewport-productivity/topology-edit-clean-shell-runtime.js';

/** Adds presentation-only productivity behavior without acquiring topology authority. */
export class TopologyEdit3DViewController extends ProfessionalController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.cleanShellRuntime = new TopologyEditCleanShellRuntime(this);
    const getProfessionalViewState = this.lifecycle.getViewState;
    this.lifecycle.getViewState = () => ({
      ...getProfessionalViewState(),
      cleanShell: this.cleanShellRuntime.viewState(),
    });
  }

  buildShell() {
    super.buildShell();
    this.cleanShellRuntime.mount(this.hostElement);
  }

  deactivate() {
    this.cleanShellRuntime.destroy();
    super.deactivate();
  }

  handleHostClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (this.cleanShellRuntime.handleAction(action)) return;
    return super.handleHostClick(event);
  }

  restoreDisplayState(viewState = {}) {
    super.restoreDisplayState(viewState);
    this.cleanShellRuntime.restoreViewState(viewState.cleanShell);
  }

  handleUnifiedSelectionChanged(payload) {
    super.handleUnifiedSelectionChanged(payload);
    this.cleanShellRuntime.selectionChanged(payload);
  }

  renderCheckerPanel() {
    super.renderCheckerPanel();
    this.cleanShellRuntime.issuesChanged({
      issueCount: (this.issues?.length ?? 0) + (this.visualDiagnostics?.length ?? 0),
      suggestionCount: this.autofixSuggestions?.length ?? 0,
    });
  }

  updateLifecycleEvidence() {
    super.updateLifecycleEvidence();
    this.cleanShellRuntime?.updateDraftStatus();
  }

  updateActionButtons() {
    super.updateActionButtons();
    this.cleanShellRuntime?.updateAvailability();
  }
}
