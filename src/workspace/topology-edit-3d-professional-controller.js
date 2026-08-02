import {
  TopologyEdit3DViewController as InteractionController,
} from './topology-edit-3d-interaction-controller.js';
import {
  TopologyEditProfessionalOperationRuntime,
} from './viewport-productivity/topology-edit-professional-operation-runtime.js';

export class TopologyEdit3DViewController extends InteractionController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.professionalElement = null;
    this.professionalRuntime = new TopologyEditProfessionalOperationRuntime(this);
    const getBaseViewState = this.lifecycle.getViewState;
    this.lifecycle.getViewState = () => ({
      ...getBaseViewState(),
      professionalOperation: this.professionalRuntime.viewState(),
    });
  }

  async activate() {
    await super.activate();
    await this.professionalRuntime.loadCatalogue();
  }

  buildShell() {
    super.buildShell();
    const section = this.hostElement?.ownerDocument.createElement('section');
    if (!section || !this.checkerElement) {
      throw new Error('TopologyEditProfessionalController: panel host is unavailable.');
    }
    section.dataset.role = 'topology-edit-professional-operation';
    section.className = 'topology-edit-professional-operation';
    section.setAttribute('aria-label', 'Professional engineering operation');
    this.checkerElement.before(section);
    this.professionalElement = section;
    this.professionalRuntime.mount(section);
  }

  deactivate() {
    this.professionalRuntime.destroy();
    this.professionalElement = null;
    super.deactivate();
  }

  refreshView(canonical) {
    super.refreshView(canonical);
    this.professionalRuntime.canonicalChanged(canonical);
  }

  handleCanvasPointer(event) {
    const before = selectionKey(this.selection);
    super.handleCanvasPointer(event);
    if (before !== selectionKey(this.selection)) {
      this.professionalRuntime.selectionChanged();
    }
  }

  handleHostClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (this.professionalRuntime.handleAction(action)) return;
    return super.handleHostClick(event);
  }

  undo() {
    if (this.professionalRuntime.transaction) {
      return this.professionalRuntime.undoOperation();
    }
    this.professionalRuntime.redoTransaction = null;
    return super.undo();
  }

  redo() {
    if (this.professionalRuntime.redoTransaction) {
      return this.professionalRuntime.redoOperation();
    }
    this.professionalRuntime.transaction = null;
    return super.redo();
  }

  runCommandAction(actionId) {
    this.professionalRuntime.clear(false, false);
    return super.runCommandAction(actionId);
  }

  acceptAutofix() {
    this.professionalRuntime.clear(false, false);
    return super.acceptAutofix();
  }

  commitDraft() {
    this.professionalRuntime.clear(false, true);
    return super.commitDraft();
  }

  restoreDisplayState(viewState = {}) {
    super.restoreDisplayState(viewState);
    this.professionalRuntime.restoreViewState(viewState.professionalOperation);
  }
}

function selectionKey(selection) {
  return `${(selection?.nodeIds ?? []).join('|')}::${selection?.edgeId ?? ''}`;
}
