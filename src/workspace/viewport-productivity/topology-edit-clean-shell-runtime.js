/** Presentation-only productivity runtime for the professional 3D Edit shell. */
import {
  isTopologyEditTextControl,
} from './topology-edit-interaction-controller-runtime.js';

const DEFAULT_WIDTH_PX = 320;
const MIN_WIDTH_PX = 248;
const MAX_WIDTH_PX = 520;
const RESIZE_STEP_PX = 16;
const LARGE_RESIZE_STEP_PX = 48;
const NODE_ID_PATTERN = /^node:/;

export class TopologyEditCleanShellRuntime {
  constructor(controller) {
    if (!controller) throw new TypeError('TopologyEditCleanShellRuntime requires a controller.');
    this.controller = controller;
    this.host = null;
    this.workspace = null;
    this.sidecar = null;
    this.resizer = null;
    this.selectionOutput = null;
    this.draftOutput = null;
    this.shortcutPanel = null;
    this.panelListeners = new Map();
    this.state = normalizeTopologyEditCleanShellState();
    this.lastSelectionHash = null;
    this.openedIssuesOnce = false;
    this.resizeSession = null;
    this.keyHandler = (event) => this.handleKey(event);
    this.doubleClickHandler = (event) => this.handleDoubleClick(event);
    this.resizePointerDownHandler = (event) => this.beginResize(event);
    this.resizePointerMoveHandler = (event) => this.continueResize(event);
    this.resizePointerUpHandler = (event) => this.endResize(event);
    this.resizeKeyHandler = (event) => this.resizeWithKeyboard(event);
  }

  mount(host) {
    this.destroy(false);
    this.host = host;
    this.workspace = host?.querySelector('[data-role="topology-edit-workspace"]') ?? null;
    this.sidecar = host?.querySelector('[data-role="topology-edit-sidecar"]') ?? null;
    if (!this.host || !this.workspace || !this.sidecar) {
      throw new Error('TOPOLOGY_EDIT_CLEAN_SHELL_RUNTIME_PREREQUISITE_MISSING');
    }
    this.installToolbarMarkup();
    this.installResizeHandle();
    this.connectPanels();
    this.host.addEventListener('keydown', this.keyHandler);
    this.host.addEventListener('dblclick', this.doubleClickHandler);
    this.applyState();
    this.selectionChanged({ selection: this.currentSelection() }, { revealContext: false });
    this.issuesChanged({
      issueCount: this.currentIssueCount(),
      suggestionCount: this.controller.autofixSuggestions?.length ?? 0,
    });
    this.updateDraftStatus();
    this.updateAvailability();
  }

  destroy(resetState = false) {
    this.host?.removeEventListener('keydown', this.keyHandler);
    this.host?.removeEventListener('dblclick', this.doubleClickHandler);
    this.resizer?.removeEventListener('pointerdown', this.resizePointerDownHandler);
    this.resizer?.removeEventListener('pointermove', this.resizePointerMoveHandler);
    this.resizer?.removeEventListener('pointerup', this.resizePointerUpHandler);
    this.resizer?.removeEventListener('pointercancel', this.resizePointerUpHandler);
    this.resizer?.removeEventListener('keydown', this.resizeKeyHandler);
    this.disconnectPanels();
    this.resizeSession = null;
    this.host = null;
    this.workspace = null;
    this.sidecar = null;
    this.resizer = null;
    this.selectionOutput = null;
    this.draftOutput = null;
    this.shortcutPanel = null;
    this.lastSelectionHash = null;
    this.openedIssuesOnce = false;
    if (resetState) this.state = normalizeTopologyEditCleanShellState();
  }

  installToolbarMarkup() {
    const toolbar = this.host.querySelector(':scope > .topology-edit-3d-toolbar');
    const navigation = toolbar?.querySelector('.topology-edit-clean-shell__navigation');
    const history = toolbar?.querySelector('.topology-edit-clean-shell__history');
    const primaryActions = toolbar?.querySelector('.topology-edit-clean-shell__primary-actions');
    if (!toolbar || !navigation || !history || !primaryActions) {
      throw new Error('TOPOLOGY_EDIT_CLEAN_SHELL_TOOLBAR_PREREQUISITE_MISSING');
    }

    const documentRef = this.host.ownerDocument;
    const selection = element(documentRef, 'div', 'topology-edit-clean-shell__selection');
    selection.setAttribute('role', 'group');
    selection.setAttribute('aria-label', 'Canonical selection');
    selection.innerHTML = `
      <output data-role="topology-edit-selection-summary" title="No canonical selection">No selection</output>
      <button type="button" data-action="clear-selection" aria-keyshortcuts="Escape" disabled>Clear</button>`;
    toolbar.insertBefore(selection, history);
    this.selectionOutput = selection.querySelector('[data-role="topology-edit-selection-summary"]');

    const draft = documentRef.createElement('output');
    draft.className = 'topology-edit-clean-shell__draft-state';
    draft.dataset.role = 'topology-edit-draft-state';
    draft.setAttribute('aria-live', 'polite');
    toolbar.insertBefore(draft, primaryActions);
    this.draftOutput = draft;

    const utilities = element(documentRef, 'div', 'topology-edit-clean-shell__utilities');
    utilities.setAttribute('role', 'group');
    utilities.setAttribute('aria-label', 'Workspace controls');
    utilities.innerHTML = `
      <button type="button" data-action="toggle-inspector" aria-keyshortcuts="I" aria-pressed="true">Inspector</button>
      <button type="button" data-action="toggle-shortcuts" aria-keyshortcuts="?" aria-expanded="false">Shortcuts</button>`;
    toolbar.append(utilities);

    const shortcutPanel = element(documentRef, 'section', 'topology-edit-clean-shell__shortcuts');
    shortcutPanel.dataset.role = 'topology-edit-shortcuts';
    shortcutPanel.setAttribute('role', 'dialog');
    shortcutPanel.setAttribute('aria-label', '3D Edit keyboard shortcuts');
    shortcutPanel.hidden = true;
    shortcutPanel.innerHTML = `
      <header><strong>Keyboard shortcuts</strong><button type="button" data-action="toggle-shortcuts" aria-label="Close shortcuts">×</button></header>
      <dl>
        <dt>Q / O / P</dt><dd>Select, orbit, or pan</dd>
        <dt>F / Shift+F</dt><dd>Fit all or fit selection</dd>
        <dt>0 / 1 / 3 / 7</dt><dd>Iso, front, right, or top view</dd>
        <dt>Arrow keys</dt><dd>Nudge selected node; Shift = 10×</dd>
        <dt>Enter / Escape</dt><dd>Apply or cancel preview; Escape also clears selection</dd>
        <dt>I / ?</dt><dd>Toggle inspector or this shortcut guide</dd>
        <dt>Double-click</dt><dd>Fit the current canonical selection</dd>
      </dl>`;
    this.host.append(shortcutPanel);
    this.shortcutPanel = shortcutPanel;
  }

  installResizeHandle() {
    const documentRef = this.host.ownerDocument;
    const resizer = element(documentRef, 'div', 'topology-edit-clean-shell__resizer');
    resizer.dataset.role = 'topology-edit-sidecar-resizer';
    resizer.setAttribute('role', 'separator');
    resizer.setAttribute('aria-label', 'Resize 3D edit inspector');
    resizer.setAttribute('aria-orientation', 'vertical');
    resizer.tabIndex = 0;
    this.workspace.insertBefore(resizer, this.sidecar);
    this.resizer = resizer;
    resizer.addEventListener('pointerdown', this.resizePointerDownHandler);
    resizer.addEventListener('pointermove', this.resizePointerMoveHandler);
    resizer.addEventListener('pointerup', this.resizePointerUpHandler);
    resizer.addEventListener('pointercancel', this.resizePointerUpHandler);
    resizer.addEventListener('keydown', this.resizeKeyHandler);
  }

  connectPanels() {
    this.disconnectPanels();
    this.host.querySelectorAll('details[data-panel-kind]').forEach((panel) => {
      const listener = () => this.capturePanelState();
      panel.addEventListener('toggle', listener);
      this.panelListeners.set(panel, listener);
    });
  }

  disconnectPanels() {
    this.panelListeners.forEach((listener, panel) => panel.removeEventListener('toggle', listener));
    this.panelListeners.clear();
  }

  handleAction(action) {
    if (action === 'toggle-inspector') {
      this.setInspectorOpen(!this.state.inspectorOpen);
      return true;
    }
    if (action === 'toggle-shortcuts') {
      this.setShortcutPanelOpen(this.shortcutPanel?.hidden !== false);
      return true;
    }
    if (action === 'clear-selection') {
      this.clearSelection();
      return true;
    }
    return false;
  }

  handleKey(event) {
    if (event.defaultPrevented || isTopologyEditTextControl(event.target)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
      event.preventDefault();
      this.setShortcutPanelOpen(this.shortcutPanel?.hidden !== false);
      return;
    }
    if (event.key.toLowerCase() === 'i' && !event.shiftKey) {
      event.preventDefault();
      this.setInspectorOpen(!this.state.inspectorOpen);
      return;
    }
    if (event.key !== 'Escape') return;
    if (this.shortcutPanel?.hidden === false) {
      event.preventDefault();
      this.setShortcutPanelOpen(false);
      return;
    }
    if (this.controller.autofixPreview) {
      event.preventDefault();
      this.controller.cancelAutofix();
      return;
    }
    if (this.currentSelection().canonicalIds.length) {
      event.preventDefault();
      this.clearSelection();
    }
  }

  handleDoubleClick(event) {
    if (!event.target?.closest?.('canvas')) return;
    if (!this.currentSelection().canonicalIds.length) return;
    event.preventDefault();
    this.controller.runNavigationAction?.('fit-selection');
  }

  selectionChanged(payload, { revealContext = true } = {}) {
    const selection = payload?.selection ?? this.currentSelection();
    const canonicalIds = selection?.canonicalIds ?? [];
    const primaryId = selection?.primaryId ?? canonicalIds.at(-1) ?? null;
    const summary = selectionSummary(canonicalIds, primaryId);
    if (this.selectionOutput) {
      this.selectionOutput.textContent = summary.label;
      this.selectionOutput.title = summary.title;
    }
    if (this.host) {
      this.host.dataset.topologyEditSelectionCount = String(canonicalIds.length);
      this.host.dataset.topologyEditSelectionSummary = summary.label;
    }
    const selectionHash = selection?.selectionHash ?? canonicalIds.join('|');
    const changed = selectionHash !== this.lastSelectionHash;
    this.lastSelectionHash = selectionHash;
    if (revealContext && changed && canonicalIds.length) {
      this.openPanel('topology-edit-inspection');
      if (canonicalIds.some((id) => NODE_ID_PATTERN.test(id))) {
        this.openPanel('topology-edit-professional-interaction');
      }
    }
    this.updateAvailability();
  }

  issuesChanged({ issueCount = 0, suggestionCount = 0 } = {}) {
    const panel = this.panel('topology-edit-checker');
    updatePanelBadge(panel, issueCount, suggestionCount ? `${issueCount} · ${suggestionCount} fix` : String(issueCount));
    if (this.host) {
      this.host.dataset.topologyEditVisibleIssueCount = String(issueCount);
      this.host.dataset.topologyEditVisibleSuggestionCount = String(suggestionCount);
    }
    if (issueCount > 0 && !this.openedIssuesOnce) {
      panel?.setAttribute('open', '');
      this.openedIssuesOnce = true;
      this.capturePanelState();
    }
  }

  updateDraftStatus() {
    const summary = topologyEditCleanShellDraftSummary({
      activeCommandCount: this.controller.session?.journal?.activeCommandIds?.length ?? 0,
      hasPersistedHash: Boolean(this.controller.lastDraftPackageHash),
      hasPreview: Boolean(this.controller.autofixPreview || this.controller.interactionPreview),
      persistenceError: this.controller.lastPersistenceError,
      staleReason: this.controller.session?.staleReason,
    });
    if (this.draftOutput) {
      this.draftOutput.textContent = summary.label;
      this.draftOutput.title = summary.title;
      this.draftOutput.dataset.state = summary.state;
    }
    if (this.host) this.host.dataset.topologyEditDraftState = summary.state;
  }

  updateAvailability() {
    const count = this.currentSelection().canonicalIds.length;
    const clearButton = this.host?.querySelector('[data-action="clear-selection"]');
    const fitSelection = this.host?.querySelector('[data-navigation-action="fit-selection"]');
    if (clearButton) clearButton.disabled = count === 0;
    if (fitSelection) fitSelection.disabled = count === 0;
    const inspectorButton = this.host?.querySelector('[data-action="toggle-inspector"]');
    if (inspectorButton) inspectorButton.setAttribute('aria-pressed', String(this.state.inspectorOpen));
    this.updateDraftStatus();
  }

  viewState() {
    this.capturePanelState();
    return normalizeTopologyEditCleanShellState(this.state);
  }

  restoreViewState(value) {
    this.state = normalizeTopologyEditCleanShellState(value);
    this.applyState();
  }

  applyState() {
    if (!this.host || !this.workspace) return;
    this.workspace.style.setProperty('--topology-edit-sidecar-width', `${this.state.inspectorWidthPx}px`);
    this.host.dataset.topologyEditInspectorOpen = String(this.state.inspectorOpen);
    this.host.dataset.topologyEditInspectorWidthPx = String(this.state.inspectorWidthPx);
    this.host.classList.toggle('topology-edit-clean-shell--inspector-closed', !this.state.inspectorOpen);
    this.sidecar?.setAttribute('aria-hidden', String(!this.state.inspectorOpen));
    this.resizer?.setAttribute('aria-hidden', String(!this.state.inspectorOpen));
    this.resizer?.setAttribute('aria-valuemin', String(MIN_WIDTH_PX));
    this.resizer?.setAttribute('aria-valuemax', String(MAX_WIDTH_PX));
    this.resizer?.setAttribute('aria-valuenow', String(this.state.inspectorWidthPx));
    const openKinds = new Set(this.state.openPanels);
    this.host.querySelectorAll('details[data-panel-kind]').forEach((panel) => {
      panel.open = openKinds.has(panel.dataset.panelKind);
    });
    this.updateAvailability();
  }

  setInspectorOpen(open) {
    this.state = normalizeTopologyEditCleanShellState({ ...this.state, inspectorOpen: open });
    this.applyState();
    if (open) this.sidecar?.focus?.({ preventScroll: true });
  }

  setShortcutPanelOpen(open) {
    if (!this.shortcutPanel) return;
    this.shortcutPanel.hidden = !open;
    const trigger = this.host?.querySelector('[data-action="toggle-shortcuts"]');
    trigger?.setAttribute('aria-expanded', String(open));
    if (open) this.shortcutPanel.querySelector('[data-action="toggle-shortcuts"]')?.focus();
    else trigger?.focus?.({ preventScroll: true });
  }

  clearSelection() {
    this.controller.selectionCoordinator?.requestCanonical('CLEAR', [], 'command');
    this.controller.setStatus?.('Selection cleared.');
  }

  openPanel(kind) {
    const panel = this.panel(kind);
    if (!panel) return;
    if (!this.state.inspectorOpen) this.setInspectorOpen(true);
    panel.open = true;
    this.capturePanelState();
  }

  panel(kind) {
    return this.host?.querySelector(`details[data-panel-kind="${kind}"]`) ?? null;
  }

  capturePanelState() {
    if (!this.host) return;
    const openPanels = [...this.host.querySelectorAll('details[data-panel-kind][open]')]
      .map((panel) => panel.dataset.panelKind)
      .filter(Boolean)
      .sort();
    this.state = normalizeTopologyEditCleanShellState({ ...this.state, openPanels });
    this.host.dataset.topologyEditOpenPanels = openPanels.join(',');
  }

  beginResize(event) {
    if (!this.state.inspectorOpen || event.button !== 0) return;
    event.preventDefault();
    this.resizeSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidthPx: this.state.inspectorWidthPx,
    };
    this.resizer.setPointerCapture?.(event.pointerId);
    this.host.classList.add('topology-edit-clean-shell--resizing');
  }

  continueResize(event) {
    if (!this.resizeSession || event.pointerId !== this.resizeSession.pointerId) return;
    const nextWidth = this.resizeSession.startWidthPx - (event.clientX - this.resizeSession.startX);
    this.setInspectorWidth(nextWidth);
  }

  endResize(event) {
    if (!this.resizeSession || event.pointerId !== this.resizeSession.pointerId) return;
    this.resizer.releasePointerCapture?.(event.pointerId);
    this.resizeSession = null;
    this.host?.classList.remove('topology-edit-clean-shell--resizing');
  }

  resizeWithKeyboard(event) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? LARGE_RESIZE_STEP_PX : RESIZE_STEP_PX;
    this.setInspectorWidth(this.state.inspectorWidthPx + (event.key === 'ArrowLeft' ? step : -step));
  }

  setInspectorWidth(value) {
    this.state = normalizeTopologyEditCleanShellState({
      ...this.state,
      inspectorOpen: true,
      inspectorWidthPx: value,
    });
    this.applyState();
  }

  currentSelection() {
    return this.controller.editorStore?.getState?.().selection ?? {
      canonicalIds: [], primaryId: null, selectionHash: '',
    };
  }

  currentIssueCount() {
    return (this.controller.issues?.length ?? 0) + (this.controller.visualDiagnostics?.length ?? 0);
  }
}

export function normalizeTopologyEditCleanShellState(value = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const width = Number(input.inspectorWidthPx);
  const openPanels = Array.isArray(input.openPanels)
    ? [...new Set(input.openPanels.map((row) => String(row ?? '').trim()).filter(Boolean))].sort()
    : [];
  return Object.freeze({
    schema: 'TopologyEditCleanShellState.v1',
    inspectorOpen: input.inspectorOpen !== false,
    inspectorWidthPx: clamp(
      Number.isFinite(width) ? width : DEFAULT_WIDTH_PX,
      MIN_WIDTH_PX,
      MAX_WIDTH_PX,
    ),
    openPanels: Object.freeze(openPanels),
  });
}

export function topologyEditCleanShellDraftSummary({
  activeCommandCount = 0,
  hasPersistedHash = false,
  hasPreview = false,
  persistenceError = null,
  staleReason = null,
} = {}) {
  const count = Math.max(0, Number.parseInt(activeCommandCount, 10) || 0);
  if (staleReason) return summary('blocked', 'Draft blocked', String(staleReason));
  if (persistenceError) return summary('error', 'Save failed', String(persistenceError));
  if (hasPreview) return summary('preview', `Preview · ${count} edit${count === 1 ? '' : 's'}`, 'A display-only preview is active and has not been journaled.');
  if (count === 0) return summary('clean', 'Clean · 0 edits', 'The certified draft matches its base topology.');
  if (hasPersistedHash) return summary('saved', `Saved · ${count} edit${count === 1 ? '' : 's'}`, 'The current certified journal has a persisted draft package.');
  return summary('dirty', `Unsaved · ${count} edit${count === 1 ? '' : 's'}`, 'The certified journal contains edits that have not been persisted.');
}

function selectionSummary(canonicalIds, primaryId) {
  if (!canonicalIds.length) return { label: 'No selection', title: 'No canonical selection' };
  if (canonicalIds.length === 1) return { label: compactId(primaryId), title: primaryId };
  return {
    label: `${canonicalIds.length} selected · ${compactId(primaryId)}`,
    title: canonicalIds.join('\n'),
  };
}

function compactId(value) {
  const text = String(value ?? 'Selection');
  return text.length > 28 ? `${text.slice(0, 25)}…` : text;
}

function updatePanelBadge(panel, count, label) {
  const summaryElement = panel?.querySelector(':scope > summary');
  if (!summaryElement) return;
  let badge = summaryElement.querySelector('[data-role="topology-edit-panel-badge"]');
  if (!badge) {
    badge = summaryElement.ownerDocument.createElement('span');
    badge.dataset.role = 'topology-edit-panel-badge';
    summaryElement.append(badge);
  }
  badge.textContent = count > 0 ? label : '';
  badge.hidden = count <= 0;
}

function summary(state, label, title) {
  return Object.freeze({ state, label, title });
}

function element(documentRef, tagName, className) {
  const value = documentRef.createElement(tagName);
  value.className = className;
  return value;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
