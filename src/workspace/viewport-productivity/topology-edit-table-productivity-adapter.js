import { TopologyEditTableRuntime } from './topology-edit-table-runtime.js';
import { TopologyEditTableCanvasCoordinator } from './topology-edit-table-canvas-coordinator.js';

const TABLE_Z_INDEX = 90;
const MIN_VISIBLE_TITLE_PX = 44;
const TOOLBAR_CLEARANCE_PX = 50;

export class TopologyEditTableProductivityAdapter {
  constructor(controller) {
    this.controller = controller;
    this.runtime = new TopologyEditTableRuntime(controller);
    this.coordinator = new TopologyEditTableCanvasCoordinator(controller, this.runtime);
    this.runtime.setCoordinator(this.coordinator);
    this.details = null;
    this.summary = null;
    this.section = null;
    this.drag = null;
    this.suppressSummaryClick = false;
    this.onHostCaptureClick = (event) => this.handleHostCaptureClick(event);
    this.onSummaryPointerDown = (event) => this.beginDrag(event);
    this.onSummaryPointerMove = (event) => this.moveDrag(event);
    this.onSummaryPointerUp = (event) => this.endDrag(event);
    this.onSummaryClick = (event) => this.handleSummaryClick(event);
    this.onToggle = () => this.handleToggle();
  }

  mount() {
    const host = this.controller.hostElement;
    if (!host?.ownerDocument) {
      throw new Error('TopologyEditTableProductivityAdapter: 3D edit host is unavailable.');
    }
    this.destroyPanel();
    const panel = createTableWindow(host.ownerDocument);
    host.append(panel.details);
    this.details = panel.details;
    this.summary = panel.summary;
    this.section = panel.section;
    host.addEventListener('click', this.onHostCaptureClick, true);
    this.summary.addEventListener('pointerdown', this.onSummaryPointerDown);
    this.summary.addEventListener('pointermove', this.onSummaryPointerMove);
    this.summary.addEventListener('pointerup', this.onSummaryPointerUp);
    this.summary.addEventListener('pointercancel', this.onSummaryPointerUp);
    this.summary.addEventListener('click', this.onSummaryClick, true);
    this.details.addEventListener('toggle', this.onToggle);
    this.runtime.mount(this.section);
    const canonical = this.controller.session?.currentTopology?.();
    if (canonical) this.coordinator.canonicalChanged(canonical);
    this.coordinator.selectionChanged({
      selection: this.controller.editorStore?.getState?.().selection,
    });
    this.syncTriggerState();
    return this;
  }

  canonicalChanged(canonical) {
    this.coordinator.canonicalChanged(canonical);
    this.coordinator.selectionChanged({
      selection: this.controller.editorStore?.getState?.().selection,
    });
  }

  selectionChanged(payload) { this.coordinator.selectionChanged(payload); }

  showWindow() {
    if (!this.details) return false;
    this.details.open = true;
    this.details.style.zIndex = String(TABLE_Z_INDEX);
    this.details.dataset.tableWindowVisible = 'true';
    this.syncTriggerState();
    this.runtime.render();
    return true;
  }

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

  handleHostCaptureClick(event) {
    const trigger = event.target.closest?.('[data-action="open-engineering-table"]');
    if (!trigger || !this.controller.hostElement?.contains(trigger)) return;
    event.preventDefault();
    event.stopPropagation();
    this.showWindow();
  }

  handleToggle() {
    this.syncTriggerState();
    this.controller.cleanShellRuntime?.capturePanelState?.();
    if (this.details?.open) this.runtime.render();
  }

  beginDrag(event) {
    if (event.button !== 0 || !this.details || !this.summary) return;
    const hostRect = this.controller.hostElement?.getBoundingClientRect?.();
    const windowRect = this.details.getBoundingClientRect();
    if (!hostRect) return;
    this.details.style.right = 'auto';
    this.details.style.left = `${windowRect.left - hostRect.left}px`;
    this.details.style.top = `${windowRect.top - hostRect.top}px`;
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: windowRect.left - hostRect.left,
      top: windowRect.top - hostRect.top,
      width: windowRect.width,
      hostWidth: hostRect.width,
      hostHeight: hostRect.height,
      moved: false,
    };
    this.summary.setPointerCapture?.(event.pointerId);
    this.details.dataset.tableWindowDragging = 'true';
  }

  moveDrag(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId || !this.details) return;
    const dx = event.clientX - this.drag.startX;
    const dy = event.clientY - this.drag.startY;
    if (Math.hypot(dx, dy) > 3) this.drag.moved = true;
    if (!this.drag.moved) return;
    event.preventDefault();
    const maxLeft = Math.max(4, this.drag.hostWidth - Math.min(this.drag.width, MIN_VISIBLE_TITLE_PX));
    const maxTop = Math.max(TOOLBAR_CLEARANCE_PX, this.drag.hostHeight - MIN_VISIBLE_TITLE_PX);
    const left = clamp(this.drag.left + dx, 4, maxLeft);
    const top = clamp(this.drag.top + dy, TOOLBAR_CLEARANCE_PX, maxTop);
    this.details.style.left = `${left}px`;
    this.details.style.top = `${top}px`;
  }

  endDrag(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const moved = this.drag.moved;
    this.summary?.releasePointerCapture?.(event.pointerId);
    this.drag = null;
    if (this.details) delete this.details.dataset.tableWindowDragging;
    if (moved) this.suppressSummaryClick = true;
  }

  handleSummaryClick(event) {
    if (!this.suppressSummaryClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.suppressSummaryClick = false;
  }

  syncTriggerState() {
    const trigger = this.controller.hostElement?.querySelector('[data-action="open-engineering-table"]');
    trigger?.setAttribute('aria-expanded', String(Boolean(this.details?.open)));
    if (this.details) this.details.dataset.tableWindowCollapsed = String(!this.details.open);
  }

  destroy() {
    this.runtime.destroy();
    this.coordinator.reset();
    this.destroyPanel();
  }

  destroyPanel() {
    this.controller.hostElement?.removeEventListener('click', this.onHostCaptureClick, true);
    this.summary?.removeEventListener('pointerdown', this.onSummaryPointerDown);
    this.summary?.removeEventListener('pointermove', this.onSummaryPointerMove);
    this.summary?.removeEventListener('pointerup', this.onSummaryPointerUp);
    this.summary?.removeEventListener('pointercancel', this.onSummaryPointerUp);
    this.summary?.removeEventListener('click', this.onSummaryClick, true);
    this.details?.removeEventListener('toggle', this.onToggle);
    this.details?.remove();
    this.details = null;
    this.summary = null;
    this.section = null;
    this.drag = null;
    this.suppressSummaryClick = false;
  }
}

export function createTopologyEditTableProductivityAdapter(controller) {
  return new TopologyEditTableProductivityAdapter(controller);
}

function createTableWindow(documentRef) {
  const details = documentRef.createElement('details');
  details.className = 'topology-edit-table-window';
  details.dataset.panelKind = 'table';
  details.dataset.role = 'topology-edit-table-window';
  details.dataset.tableWindowVisible = 'true';
  details.style.zIndex = String(TABLE_Z_INDEX);
  const summary = documentRef.createElement('summary');
  summary.className = 'topology-edit-table-window__titlebar';
  summary.innerHTML = '<strong>Engineering Table</strong><span>Exact canonical projection · drag to move · click to collapse</span>';
  const body = documentRef.createElement('div');
  body.className = 'topology-edit-table-window__body';
  const section = documentRef.createElement('section');
  section.dataset.role = 'topology-edit-table';
  section.setAttribute('aria-label', 'Engineering table editor');
  body.append(section);
  details.append(summary, body);
  return { details, summary, section };
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
