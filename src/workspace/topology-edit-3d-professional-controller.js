import {
  TopologyEdit3DViewController as InteractionController,
} from './topology-edit-3d-interaction-controller.js';
import {
  TopologyEditProfessionalOperationRuntime,
} from './viewport-productivity/topology-edit-professional-operation-runtime.js';
import {
  ensureTopologyEditProfessionalOperationStyles,
} from './viewport-productivity/topology-edit-professional-operation-styles.js';

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
    ensureTopologyEditProfessionalOperationStyles(this.hostElement?.ownerDocument);
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
    const receipt = this.professionalRuntime.transaction;
    if (receipt?.resultingCanonicalHash
      === this.session?.currentTopology()?.canonicalTopologyHash) {
      return this.professionalRuntime.undoOperation();
    }
    this.professionalRuntime.transaction = null;
    this.professionalRuntime.redoTransaction = null;
    return super.undo();
  }

  redo() {
    const receipt = this.professionalRuntime.redoTransaction;
    if (receipt?.priorCanonicalHash
      === this.session?.currentTopology()?.canonicalTopologyHash) {
      return this.professionalRuntime.redoOperation();
    }
    this.professionalRuntime.transaction = null;
    this.professionalRuntime.redoTransaction = null;
    return super.redo();
  }

  runCommandAction(actionId) {
    this.professionalRuntime.clear(false, true);
    return super.runCommandAction(actionId);
  }

  applyInteractionPreview() {
    this.professionalRuntime.clear(false, true);
    return super.applyInteractionPreview();
  }

  acceptAutofix() {
    this.professionalRuntime.clear(false, true);
    return super.acceptAutofix();
  }

  restoreDisplayState(viewState = {}) {
    super.restoreDisplayState(viewState);
    this.professionalRuntime.restoreViewState(viewState.professionalOperation);
  }
}

function selectionKey(selection) {
  return `${(selection?.nodeIds ?? []).join('|')}::${selection?.edgeId ?? ''}`;
}
