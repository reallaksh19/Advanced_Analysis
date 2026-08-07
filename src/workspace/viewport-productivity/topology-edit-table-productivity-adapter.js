import { TopologyEditTableRuntime } from './topology-edit-table-runtime.js';
import { TopologyEditTableCanvasCoordinator } from './topology-edit-table-canvas-coordinator.js';

export class TopologyEditTableProductivityAdapter {
  constructor(controller) {
    this.controller = controller;
    this.runtime = new TopologyEditTableRuntime(controller);
    this.coordinator = new TopologyEditTableCanvasCoordinator(controller, this.runtime);
    this.runtime.setCoordinator(this.coordinator);
    this.details = null;
    this.section = null;
  }

  mount() {
    const sidecar = this.controller.hostElement?.querySelector('[data-role="topology-edit-sidecar"]');
    if (!sidecar) throw new Error('TopologyEditTableProductivityAdapter: sidecar is unavailable.');
    this.destroyPanel();
    const panel = createTablePanel(sidecar.ownerDocument);
    sidecar.prepend(panel.details);
    this.details = panel.details;
    this.section = panel.section;
    this.runtime.mount(this.section);
    const canonical = this.controller.session?.currentTopology?.();
    if (canonical) this.coordinator.canonicalChanged(canonical);
    this.coordinator.selectionChanged({
      selection: this.controller.editorStore?.getState?.().selection,
    });
    return this;
  }

  canonicalChanged(canonical) {
    this.coordinator.canonicalChanged(canonical);
    this.coordinator.selectionChanged({
      selection: this.controller.editorStore?.getState?.().selection,
    });
  }

  selectionChanged(payload) { this.coordinator.selectionChanged(payload); }

  undoIfCurrent() {
    const receipt = this.runtime.transaction;
    if (!receipt) return false;
    if (receipt.resultingCanonicalHash !== this.controller.session?.currentTopology()?.canonicalTopologyHash) {
      this.runtime.transaction = null;
      this.runtime.redoTransaction = null;
      return false;
    }
    return this.runtime.undoOperation();
  }

  redoIfCurrent() {
    const receipt = this.runtime.redoTransaction;
    if (!receipt) return false;
    if (receipt.priorCanonicalHash !== this.controller.session?.currentTopology()?.canonicalTopologyHash) {
      this.runtime.transaction = null;
      this.runtime.redoTransaction = null;
      return false;
    }
    return this.runtime.redoOperation();
  }

  clearCandidate() { this.runtime.clearCandidate(); }

  destroy() {
    this.runtime.destroy();
    this.coordinator.reset();
    this.destroyPanel();
  }

  destroyPanel() {
    this.details?.remove();
    this.details = null;
    this.section = null;
  }
}

export function createTopologyEditTableProductivityAdapter(controller) {
  return new TopologyEditTableProductivityAdapter(controller);
}

function createTablePanel(documentRef) {
  const details = documentRef.createElement('details');
  details.className = 'topology-edit-clean-shell__panel';
  details.dataset.panelKind = 'table';
  const summary = documentRef.createElement('summary');
  summary.textContent = 'Engineering table — exact canonical projection';
  const body = documentRef.createElement('div');
  body.className = 'topology-edit-clean-shell__panel-body';
  const section = documentRef.createElement('section');
  section.dataset.role = 'topology-edit-table';
  section.setAttribute('aria-label', 'Engineering table editor');
  body.append(section);
  details.append(summary, body);
  return { details, section };
}
