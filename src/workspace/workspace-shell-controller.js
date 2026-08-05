import { WorkspaceState } from './workspace-state.js';
import { EventBus } from './event-bus.js';
import { APPLICATION_EVENTS, EVENT_TOPICS } from './event-topics.js';

const STORAGE_KEY = 'workspace-layout-prefs/v2';
const PANEL_MINIMUM_PX = 200;
const FOCUS_PANEL_WIDTH_PX = 48;

/** Owns layout, shared-view switching, and panel resizing only. */
export class WorkspaceShellController {
  constructor(rootElement) {
    if (!rootElement) throw new TypeError('WorkspaceShellController requires a root element.');
    this.rootElement = rootElement;
    this.shellElement = null;
    this.state = { leftPanelWidth: 300, rightPanelWidth: 350, activeViewportTab: 'webgl', treeCollapsed: false, propertiesCollapsed: false, topologyEdit3DActive: false };
    this.dragContext = null;
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
    this.shellElement.addEventListener('click', this.handleClick);
    this.rootElement.ownerDocument.addEventListener('keydown', this.handleKeyDown);
    this.unsubscribers = [
      EventBus.subscribe(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, ({ snapshot }) => this.updateDatasetLabel(snapshot)),
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

  /** Gives the ported Topology Edit Draft 3D canvas the full viewport-stack height, hiding the shared read-only SVG/WebGL stage while it's active. The Load Calc dock stays visible (compacted to just its header/sub-nav) so the sub-nav tabs remain reachable to leave the 3D sub-tab. */
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

  /** Single source of truth for viewport-stack visibility, reconciling the workbench view (Workspace/Load Calc) and the 3D-active flag. */
  applyViewportLayout() {
    if (!this.shellElement) return;
    const loadCalc = this.shellElement.dataset.workbenchView === 'load-calc';
    const topologyEdit3DActive = this.state.topologyEdit3DActive;
    const host = this.shellElement.querySelector('[data-role="topology-edit-render-host"]');
    const dock = this.shellElement.querySelector('[data-role="load-calc-consumer-root"]');
    const stage = this.shellElement.querySelector('[data-role="viewport-stage"]');
    if (host) host.hidden = !topologyEdit3DActive;
    if (dock) { dock.hidden = !loadCalc; dock.classList.toggle('load-calc-dock--compact', topologyEdit3DActive); }
    if (stage) {
      // `.viewport-stage{display:flex}` (an author rule) outranks the UA
      // `[hidden]{display:none}` rule, so the `hidden` attribute alone does
      // not actually hide this element — it must be set inline explicitly.
      stage.hidden = topologyEdit3DActive;
      stage.style.display = topologyEdit3DActive ? 'none' : 'flex';
      stage.style.flex = topologyEdit3DActive ? '0 0 0' : loadCalc ? '1 1 55%' : '1 1 100%';
    }
    globalThis.requestAnimationFrame?.(() => globalThis.dispatchEvent?.(new Event('resize')));
  }

  click(event) {
    const trigger = event.target.closest('[data-action]');
    if (!trigger || !this.shellElement.contains(trigger)) return;
    const action = trigger.dataset.action;
    if (action === 'switch-viewport-tab') this.switchViewportTab(trigger.dataset.tab);
    else if (action === 'toggle-viewport-table') this.toggleTable();
    else if (action === 'toggle-tree-collapse') this.togglePanel('treeCollapsed');
    else if (action === 'toggle-properties-collapse') this.togglePanel('propertiesCollapsed');
  }

  switchViewportTab(tab) {
    if (!['webgl', 'svg', 'split', 'topology-edit'].includes(tab)) throw new TypeError(`Unsupported viewport tab: ${tab}`);
    if (tab === 'topology-edit') {
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
    const dock = this.shellElement.querySelector('[data-role="viewport-table-dock"]');
    if (dock) dock.hidden = !dock.hidden;
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
    if (this.dragContext.action === 'resize-left') this.state.leftPanelWidth = clamp(this.dragContext.leftWidth + delta, PANEL_MINIMUM_PX, this.dragContext.maximumWidth);
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
    const left = treeCollapsed ? FOCUS_PANEL_WIDTH_PX : this.state.leftPanelWidth;
    const right = propertiesCollapsed ? FOCUS_PANEL_WIDTH_PX : this.state.rightPanelWidth;
    this.shellElement.style.gridTemplateColumns = `${left}px 4px minmax(360px,1fr) 4px ${right}px`;
    this.shellElement.dataset.topologyEditFocusLayout = String(focus);
    this.shellElement.dataset.topologyEditLeftPanelVisible = String(!treeCollapsed);
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
      if (Number.isFinite(saved.rightPanelWidth)) this.state.rightPanelWidth = saved.rightPanelWidth;
      if (['webgl', 'svg', 'split'].includes(saved.activeViewportTab)) this.state.activeViewportTab = saved.activeViewportTab;
    } catch { globalThis.localStorage?.removeItem(STORAGE_KEY); }
  }

  saveState() {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ leftPanelWidth: this.state.leftPanelWidth, rightPanelWidth: this.state.rightPanelWidth, activeViewportTab: this.state.activeViewportTab }));
  }

  destroy() {
    this.pointerUp();
    this.shellElement?.removeEventListener('pointerdown', this.handlePointerDown);
    this.shellElement?.removeEventListener('click', this.handleClick);
    this.rootElement.ownerDocument.removeEventListener('keydown', this.handleKeyDown);
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }
}

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(value, maximum)); }
