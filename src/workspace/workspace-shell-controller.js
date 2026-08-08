import { WorkspaceState } from './workspace-state.js';
import { EventBus } from './event-bus.js';
import { APPLICATION_EVENTS, EVENT_TOPICS } from './event-topics.js';

const STORAGE_KEY = 'workspace-layout-prefs/v2';
const PANEL_MINIMUM_PX = 200;
const FOCUS_PANEL_WIDTH_PX = 48;
const TOPOLOGY_EDIT_LEFT_PANEL_DEFAULT_PX = 260;

/** Owns layout, shared-view switching, and panel resizing only. */
export class WorkspaceShellController {
  constructor(rootElement) {
    if (!rootElement) throw new TypeError('WorkspaceShellController requires a root element.');
    this.rootElement = rootElement;
    this.shellElement = null;
    this.state = {
      leftPanelWidth: 300,
      topologyEditLeftPanelWidth: TOPOLOGY_EDIT_LEFT_PANEL_DEFAULT_PX,
      rightPanelWidth: 350,
      activeViewportTab: 'webgl',
      treeCollapsed: false,
      propertiesCollapsed: false,
      topologyEdit3DActive: false,
    };
    this.dragContext = null;
    this.nativeModelPending = false;
    this.unsubscribers = [];
    this.handlePointerDown = (event) => this.pointerDown(event);
    this.handlePointerMove = (event) => this.pointerMove(event);
    this.handlePointerUp = () => this.pointerUp();
    this.handleClick = (event) => this.click(event);
    this.handleKeyDown = (event) => this.keyDown(event);
  }

  init() {
    if (this.unsubscribers.length) return;
    this.shellElement = this.rootElement.querySelector('.workspace-shell');
    if (!this.shellElement) throw new Error('Workspace shell element is missing.');
    this.loadState();
    this.applyState();
    this.shellElement.addEventListener('pointerdown', this.handlePointerDown);
    this.rootElement.addEventListener('click', this.handleClick);
    this.rootElement.ownerDocument.addEventListener('keydown', this.handleKeyDown);
    this.unsubscribers = [
      EventBus.subscribe(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, ({ snapshot }) => this.updateDatasetLabel(snapshot)),
      EventBus.subscribe(EVENT_TOPICS.DATASET_LOADED, () => this.handleDatasetLoaded()),
      EventBus.subscribe(EVENT_TOPICS.DATASET_LOAD_FAILED, ({ message }) => this.handleDatasetLoadFailed(message)),
      EventBus.subscribe(APPLICATION_EVENTS.CHANGED, ({ state }) => this.switchWorkbenchView(state?.activeViewId)),
      EventBus.subscribe(EVENT_TOPICS.TOPOLOGY_EDIT_3D_MODE_CHANGED, ({ active }) => this.setTopologyEdit3DActive(active)),
    ];
  }

  switchWorkbenchView(viewId) {
    const loadCalc = viewId === 'LOAD_CALC';
    if (!loadCalc) this.setTopologyEdit3DActive(false);
    this.shellElement.dataset.workbenchView = loadCalc ? 'load-calc' : 'workspace';
    this.applyViewportLayout();
  }

  /** Gives 3D Edit sole ownership of the central workspace while its dedicated shell is active. */
  setTopologyEdit3DActive(active) {
    const next = Boolean(active);
    if (this.state.topologyEdit3DActive === next) return;
    this.state.topologyEdit3DActive = next;
    this.applyPanelLayout();
    this.updateViewportTabButtons();
    this.applyViewportLayout();
  }

  /** "3D Edit" is a peer of 3D WebGL/2D SVG/Split in the shared toolbar, reflecting topologyEdit3DActive rather than activeViewportTab. */
  updateViewportTabButtons() {
    const selected = this.state.topologyEdit3DActive ? 'topology-edit' : this.state.activeViewportTab;
    this.shellElement?.querySelectorAll('[data-action="switch-viewport-tab"]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.tab === selected)));
  }

  /** Single source of truth for viewport-stack visibility and pointer ownership. */
  applyViewportLayout() {
    if (!this.shellElement) return;
    const loadCalc = this.shellElement.dataset.workbenchView === 'load-calc';
    const topologyEdit3DActive = this.state.topologyEdit3DActive;
    const host = this.shellElement.querySelector('[data-role="topology-edit-render-host"]');
    const dock = this.shellElement.querySelector('[data-role="load-calc-consumer-root"]');
    const stage = this.shellElement.querySelector('[data-role="viewport-stage"]');
    const viewportPanel = this.shellElement.querySelector('[data-panel="viewport"]');

    if (host) {
      host.hidden = !topologyEdit3DActive;
      host.toggleAttribute('inert', !topologyEdit3DActive);
    }
    if (dock) {
      const showLoadCalcDock = loadCalc && !topologyEdit3DActive;
      dock.hidden = !showLoadCalcDock;
      dock.toggleAttribute('inert', !showLoadCalcDock);
      dock.classList.toggle('load-calc-dock--compact', topologyEdit3DActive);
    }
    if (stage) {
      // Load Calc owns the central viewport while active. Model / 3D activates
      // the dedicated topology-edit host, so retaining the shared read-only
      // workspace stage creates overlapping scroll/pointer authority.
      const hideSharedStage = loadCalc || topologyEdit3DActive;
      stage.hidden = hideSharedStage;
      stage.toggleAttribute('inert', hideSharedStage);
      stage.style.display = hideSharedStage ? 'none' : 'flex';
      stage.style.flex = hideSharedStage ? '0 0 0' : '1 1 100%';
    }

    // In ordinary Load Calc panes the read-only viewport toolbar/footer are not
    // part of the active interaction surface. Keeping them in the flex stack
    // previously allowed them (and the underlying workspace layer) to win hit
    // testing after nested pane scrolling. Model / 3D deliberately restores
    // the viewport chrome because that route owns the dedicated 3D host.
    viewportPanel?.classList.toggle(
      'viewport-panel--load-calc-owned',
      loadCalc && !topologyEdit3DActive,
    );
    viewportPanel?.classList.toggle(
      'viewport-panel--topology-edit-owned',
      topologyEdit3DActive,
    );

    globalThis.requestAnimationFrame?.(() => globalThis.dispatchEvent?.(new Event('resize')));
  }

  click(event) {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const nativeModelDialog = this.rootElement.querySelector('[data-role="native-model-dialog"]');
    const inControllerScope = this.shellElement.contains(trigger)
      || nativeModelDialog?.contains(trigger);
    if (!inControllerScope) return;
    const action = trigger.dataset.action;
    if (action === 'switch-viewport-tab') this.switchViewportTab(trigger.dataset.tab);
    else if (action === 'toggle-viewport-table') this.toggleTable();
    else if (action === 'open-native-model') this.openNativeModelDialog();
    else if (action === 'cancel-native-model') this.closeNativeModelDialog();
    else if (action === 'create-native-model') this.createNativeModel();
    else if (action === 'exit-topology-edit') this.exitTopologyEdit();
    else if (action === 'toggle-tree-collapse') this.togglePanel('treeCollapsed');
    else if (action === 'toggle-properties-collapse') this.togglePanel('propertiesCollapsed');
  }

  switchViewportTab(tab) {
    if (!['webgl', 'svg', 'split', 'topology-edit'].includes(tab)) throw new TypeError(`Unsupported viewport tab: ${tab}`);
    if (tab === 'topology-edit') {
      if (WorkspaceState.getSnapshot().status !== 'ready') {
        this.openNativeModelDialog();
        return;
      }
      if (this.shellElement.dataset.workbenchView !== 'load-calc') EventBus.publish(APPLICATION_EVENTS.CHANGE_REQUESTED, { viewId: 'LOAD_CALC', source: 'navigation' });
      EventBus.publish(EVENT_TOPICS.LOAD_CALC_SUBTAB_REQUESTED, { tab: '3d' });
      this.setTopologyEdit3DActive(true);
      return;
    }
    const wasTopologyEdit3D = this.state.topologyEdit3DActive;
    this.setTopologyEdit3DActive(false);
    if (wasTopologyEdit3D) EventBus.publish(EVENT_TOPICS.LOAD_CALC_SUBTAB_REQUESTED, { tab: 'loads' });
    this.state.activeViewportTab = tab;
    const webgl = this.shellElement.querySelector('[data-role="viewport-render-host"]');
    const svg = this.shellElement.querySelector('[data-role="sequential-sketcher-root"]');
    webgl.hidden = tab === 'svg';
    svg.hidden = tab === 'webgl';
    webgl.style.width = tab === 'split' ? '50%' : '100%';
    svg.style.width = tab === 'split' ? '50%' : '100%';
    this.updateViewportTabButtons();
    this.saveState();
    globalThis.requestAnimationFrame?.(() => globalThis.dispatchEvent?.(new Event('resize')));
  }

  toggleTable() {
    if (this.state.topologyEdit3DActive) {
      const panel = this.shellElement.querySelector('details[data-panel-kind="table"]');
      const inspector = this.shellElement.querySelector('[data-action="toggle-inspector"]');
      if (!panel) return;
      if (this.shellElement.querySelector('[data-role="topology-edit-render-host"]')?.dataset.topologyEditInspectorOpen === 'false') {
        inspector?.click();
      }
      panel.open = !panel.open;
      if (panel.open) panel.scrollIntoView({ block: 'nearest' });
      return;
    }
    const dock = this.shellElement.querySelector('[data-role="viewport-table-dock"]');
    if (dock) dock.hidden = !dock.hidden;
  }

  /** Opens the governed empty-model setup without entering an unavailable view. */
  openNativeModelDialog() {
    const dialog = this.rootElement.querySelector('[data-role="native-model-dialog"]');
    const error = dialog?.querySelector('[data-role="native-model-error"]');
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
    if (dialog && !dialog.open) dialog.showModal();
  }

  closeNativeModelDialog() {
    this.rootElement.querySelector('[data-role="native-model-dialog"]')?.close();
  }

  createNativeModel() {
    const form = this.rootElement.querySelector('[data-role="native-model-form"]');
    if (!form?.reportValidity()) return;
    const values = new FormData(form);
    this.nativeModelPending = true;
    EventBus.publish(EVENT_TOPICS.NATIVE_MODEL_CREATE_REQUESTED, {
      modelKey: String(values.get('modelKey')).trim(),
      documentId: String(values.get('documentId')).trim(),
      revision: String(values.get('revision')).trim(),
    });
  }

  handleDatasetLoaded() {
    if (!this.nativeModelPending) return;
    this.nativeModelPending = false;
    this.closeNativeModelDialog();
    globalThis.queueMicrotask?.(() => this.switchViewportTab('topology-edit'));
  }

  handleDatasetLoadFailed(message) {
    if (!this.nativeModelPending) return;
    this.nativeModelPending = false;
    const error = this.rootElement.querySelector('[data-role="native-model-error"]');
    if (error) {
      error.hidden = false;
      error.textContent = message;
    }
  }

  exitTopologyEdit() {
    this.switchViewportTab('webgl');
    EventBus.publish(APPLICATION_EVENTS.CHANGE_REQUESTED, {
      viewId: 'WORKSPACE',
      source: 'navigation',
    });
  }

  togglePanel(key) {
    this.state[key] = !this.state[key];
    this.applyPanelLayout();
    this.saveState();
  }

  keyDown(event) {
    if (event.key !== 'Escape') return;
    WorkspaceState.selectEntity(null);
  }

  pointerDown(event) {
    const resizer = event.target.closest('.panel-resizer');
    if (!resizer) return;
    const action = resizer.dataset.action;
    if (this.state.topologyEdit3DActive && action !== 'resize-left') return;
    const tree = this.shellElement.querySelector('.tree-panel');
    const properties = this.shellElement.querySelector('.properties-panel');
    this.dragContext = {
      action,
      topologyEdit3DActive: this.state.topologyEdit3DActive,
      startX: event.clientX,
      leftWidth: tree.getBoundingClientRect().width,
      rightWidth: properties.getBoundingClientRect().width,
      maximumWidth: this.shellElement.getBoundingClientRect().width / 2,
    };
    event.preventDefault();
    this.rootElement.ownerDocument.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    this.rootElement.ownerDocument.addEventListener('pointerup', this.handlePointerUp);
  }

  pointerMove(event) {
    if (!this.dragContext) return;
    event.preventDefault();
    const delta = event.clientX - this.dragContext.startX;
    if (this.dragContext.action === 'resize-left') {
      const key = this.dragContext.topologyEdit3DActive
        ? 'topologyEditLeftPanelWidth'
        : 'leftPanelWidth';
      this.state[key] = clamp(
        this.dragContext.leftWidth + delta,
        PANEL_MINIMUM_PX,
        this.dragContext.maximumWidth,
      );
    }
    if (this.dragContext.action === 'resize-right') this.state.rightPanelWidth = clamp(this.dragContext.rightWidth - delta, PANEL_MINIMUM_PX, this.dragContext.maximumWidth);
    this.applyPanelLayout();
  }

  pointerUp() {
    if (!this.dragContext) return;
    this.dragContext = null;
    this.rootElement.ownerDocument.removeEventListener('pointermove', this.handlePointerMove);
    this.rootElement.ownerDocument.removeEventListener('pointerup', this.handlePointerUp);
    this.saveState();
    globalThis.dispatchEvent?.(new Event('resize'));
  }

  applyPanelLayout() {
    if (!this.shellElement) return;
    const focus = this.state.topologyEdit3DActive;
    const treeCollapsed = this.state.treeCollapsed;
    const propertiesCollapsed = focus || this.state.propertiesCollapsed;
    const expandedLeft = focus
      ? this.state.topologyEditLeftPanelWidth
      : this.state.leftPanelWidth;
    const left = treeCollapsed ? FOCUS_PANEL_WIDTH_PX : expandedLeft;
    const right = propertiesCollapsed ? FOCUS_PANEL_WIDTH_PX : this.state.rightPanelWidth;
    const propertiesPanel = this.shellElement.querySelector('.properties-panel');
    const rightResizer = this.shellElement.querySelector('.panel-resizer--right');
    propertiesPanel.hidden = focus;
    propertiesPanel.toggleAttribute('inert', focus);
    rightResizer.hidden = focus;
    this.shellElement.style.gridTemplateColumns = focus
      ? `${left}px 4px minmax(360px,1fr)`
      : `${left}px 4px minmax(360px,1fr) 4px ${right}px`;
    this.shellElement.dataset.topologyEditFocusLayout = String(focus);
    this.shellElement.dataset.topologyEditLeftPanelVisible = String(!treeCollapsed);
    this.shellElement.dataset.topologyEditLeftPanelWidthPx = String(left);
    this.shellElement.querySelector('.tree-panel').classList.toggle('workspace-panel--collapsed', treeCollapsed);
    this.shellElement.querySelector('.properties-panel').classList.toggle('workspace-panel--collapsed', propertiesCollapsed);
  }

  applyState() {
    if (!this.shellElement) return;
    this.applyPanelLayout();
    this.switchViewportTab(this.state.activeViewportTab);
  }

  updateDatasetLabel(snapshot) {
    const label = this.rootElement.querySelector('[data-role="topbar-dataset"]');
    if (label) label.textContent = snapshot?.status === 'ready' ? snapshot.dataset?.datasetId || 'Unnamed' : 'None loaded';
  }

  loadState() {
    try {
      const saved = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || 'null');
      if (!saved) return;
      if (Number.isFinite(saved.leftPanelWidth)) this.state.leftPanelWidth = saved.leftPanelWidth;
      if (Number.isFinite(saved.topologyEditLeftPanelWidth)) {
        this.state.topologyEditLeftPanelWidth = saved.topologyEditLeftPanelWidth;
      }
      if (Number.isFinite(saved.rightPanelWidth)) this.state.rightPanelWidth = saved.rightPanelWidth;
      if (['webgl', 'svg', 'split'].includes(saved.activeViewportTab)) this.state.activeViewportTab = saved.activeViewportTab;
    } catch { globalThis.localStorage?.removeItem(STORAGE_KEY); }
  }

  saveState() {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({
      leftPanelWidth: this.state.leftPanelWidth,
      topologyEditLeftPanelWidth: this.state.topologyEditLeftPanelWidth,
      rightPanelWidth: this.state.rightPanelWidth,
      activeViewportTab: this.state.activeViewportTab,
    }));
  }

  destroy() {
    this.pointerUp();
    this.shellElement?.removeEventListener('pointerdown', this.handlePointerDown);
    this.rootElement.removeEventListener('click', this.handleClick);
    this.rootElement.ownerDocument.removeEventListener('keydown', this.handleKeyDown);
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }
}

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(value, maximum)); }
