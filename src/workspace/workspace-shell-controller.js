import { showZoneDensitySelectorPopup } from './zone-density-selector-popup.js';
import { WorkspaceState } from './workspace-state.js';
import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';

const STORAGE_KEY = 'workspace-layout-prefs';
const MIN_WIDTH = 200;

export class WorkspaceShellController {
  constructor(rootElement) {
    if (!rootElement) throw new TypeError('WorkspaceShellController requires a root element.');
    this.rootElement = rootElement;
    this.shellElement = null;
    this.state = { leftPanelWidth: 300, rightPanelWidth: 350, webglHeight: 320, activeViewportTab: 'webgl', treeCollapsed: false, propertiesCollapsed: false };
    this.webglLoaded = false;
    this.dragContext = null;
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleClick = this.handleClick.bind(this);
  }

  init() {
    this.shellElement = this.rootElement.querySelector('.workspace-shell');
    if (!this.shellElement) return;
    this.loadState();
    this.applyState();
    this.shellElement.addEventListener('pointerdown', this.handlePointerDown);
    this.shellElement.addEventListener('click', this.handleClick);
    
    // Update dataset name in topbar
    this.unsubscribeCallbacks = [
      EventBus.subscribe(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, ({ snapshot }) => {
        const el = this.shellElement.querySelector('[data-role="topbar-dataset"]');
        if (el) el.textContent = snapshot?.dataset?.datasetId || 'None Loaded';
      })
    ];
  }

  loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) this.state = { ...this.state, ...JSON.parse(stored) };
    } catch { /* ignore fallback */ }
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Failed to save workspace layout preferences to localStorage.', e);
    }
  }

  applyState() {
    this.shellElement.style.setProperty('--left-panel', `${this.state.leftPanelWidth}px`);
    this.shellElement.style.setProperty('--right-panel', `${this.state.rightPanelWidth}px`);
    this.shellElement.classList.toggle('tree-collapsed', this.state.treeCollapsed);
    this.shellElement.classList.toggle('properties-collapsed', this.state.propertiesCollapsed);

    const activeTab = this.state.activeViewportTab || 'svg';
    const isSvg = activeTab === 'svg', isWebgl = activeTab === 'webgl', isSplit = activeTab === 'split';
    const webglStage = this.shellElement.querySelector('[data-webgl-host]');
    const resizer = this.shellElement.querySelector('[data-action="resize-viewport-vertical"]');
    const svgRoot = this.shellElement.querySelector('[data-role="sequential-sketcher-root"]');
    const prompt = this.shellElement.querySelector('[data-role="webgl-load-prompt"]');
    const tabBtns = this.shellElement.querySelectorAll('[data-action="switch-viewport-tab"]');

    tabBtns.forEach((btn) => {
      const isTab = btn.dataset.tab === activeTab;
      btn.style.background = isTab ? '#0284c7' : 'transparent';
      btn.style.color = isTab ? '#ffffff' : '#94a3b8';
    });

    if (webglStage) {
      if (isSvg) {
        webglStage.style.display = 'none';
        webglStage.style.height = '0px';
        webglStage.style.minHeight = '0px';
      } else {
        webglStage.style.display = 'block';
        webglStage.style.height = isWebgl ? '100%' : `${this.state.webglHeight || 320}px`;
        webglStage.style.minHeight = isWebgl ? '0px' : '100px';
      }
    }
    if (resizer) resizer.style.display = isSplit ? 'flex' : 'none';
    if (svgRoot) {
      if (isWebgl) {
        svgRoot.style.display = 'none';
        svgRoot.style.height = '0px';
      } else {
        svgRoot.style.display = 'flex';
        svgRoot.style.height = isSvg ? '100%' : 'flex-1';
      }
    }
    if (prompt) prompt.style.display = (!isSvg && !this.webglLoaded) ? 'flex' : 'none';
  }

  handleClick(event) {
    const popoutBtn = event.target?.closest?.('.accordion-popout-btn');
    if (popoutBtn && this.shellElement.contains(popoutBtn)) {
      event.stopPropagation();
      this.openPopup(popoutBtn.closest('.properties-accordion-section'));
      return;
    }

    const popupControl = event.target?.closest?.('[data-action^="popup-"]');
    if (popupControl && this.shellElement.contains(popupControl)) {
      const action = popupControl.dataset.action;
      const win = this.shellElement.querySelector('[data-role="panel-popup-overlay"]');
      if (action === 'popup-close' || action === 'popup-dock') {
        this.closePopup();
      } else if (action === 'popup-maximize' && win) {
        win.classList.toggle('is-maximized');
      } else if (action === 'popup-collapse' && win) {
        win.classList.toggle('is-collapsed');
        popupControl.textContent = win.classList.contains('is-collapsed') ? '▶' : '▼';
      }
      return;
    }

    const accordionHeader = event.target?.closest?.('.accordion-section-header');
    if (accordionHeader && this.shellElement.contains(accordionHeader)) {
      const section = accordionHeader.closest('.properties-accordion-section');
      if (section) {
        section.classList.toggle('accordion-collapsed');
        const icon = accordionHeader.querySelector('.accordion-toggle-icon');
        if (icon) icon.textContent = section.classList.contains('accordion-collapsed') ? '▶' : '▼';
      }
      return;
    }

    const trigger = event.target?.closest?.('[data-action]');
    if (!trigger || !this.shellElement.contains(trigger)) return;

    const action = trigger.dataset.action;
    if (action === 'toggle-tree-collapse') {
      this.state.treeCollapsed = !this.state.treeCollapsed;
    } else if (action === 'toggle-properties-collapse') {
      this.state.propertiesCollapsed = !this.state.propertiesCollapsed;
    } else if (action === 'switch-viewport-tab') {
      this.state.activeViewportTab = trigger.dataset.tab;
    } else if (action === 'load-webgl-geometry') {
      this.webglLoaded = true;
      const btn = this.shellElement.querySelector('.viewport-load-geo-btn');
      if (btn) {
        btn.innerHTML = '✅ 3D Loaded';
        btn.style.background = '#10b981';
      }
    } else if (action === 'toggle-viewport-table') {
      const dock = this.shellElement.querySelector('[data-role="viewport-table-dock"]');
      if (dock) {
        const isHidden = dock.style.display === 'none';
        dock.style.display = isHidden ? 'block' : 'none';
        const btn = this.shellElement.querySelector('.viewport-table-toggle-btn');
        if (btn) {
          btn.style.background = isHidden ? '#0284c7' : '#0f172a';
          btn.style.color = isHidden ? '#ffffff' : '#38bdf8';
        }
      }
    } else if (action === 'open-zone-selector') {
      showZoneDensitySelectorPopup(WorkspaceState.dataset, (selectedZones, qualities) => {
        window.dispatchEvent(new CustomEvent('workspace-zone-filter-changed', { detail: { selectedZones, qualities } }));
      });
    }
    this.applyState();
    this.saveState();
    if (['switch-viewport-tab', 'load-webgl-geometry', 'toggle-viewport-table'].includes(action)) {
      window.dispatchEvent(new Event('resize'));
    }
  }

  updateTopBar(context) {
    const el = this.shellElement.querySelector('[data-role="topbar-dataset"]');
    if (el) el.textContent = context?.datasetId || 'None Loaded';
  }

  openPopup(section) {
    if (!section) return;
    if (this.poppedSection) this.closePopup();
    const win = this.shellElement.querySelector('[data-role="panel-popup-overlay"]');
    const body = win?.querySelector('[data-role="panel-popup-body"]');
    if (!win || !body) return;

    this.poppedSection = section;
    section.classList.add('is-popped-out');
    win.classList.remove('is-collapsed', 'is-maximized');
    
    const titleEl = section.querySelector('.accordion-section-title');
    const title = win.querySelector('[data-role="panel-popup-title"]');
    if (title && titleEl) title.textContent = titleEl.textContent;

    const colBtn = win.querySelector('[data-action="popup-collapse"]');
    if (colBtn) colBtn.textContent = '▼';

    const sectionBody = section.querySelector('.accordion-section-body');
    if (sectionBody) {
      while (sectionBody.firstChild) body.append(sectionBody.firstChild);
    }
    win.style.display = 'flex';
    this._onEsc = (e) => { if (e.key === 'Escape') this.closePopup(); };
    document.addEventListener('keydown', this._onEsc);
  }

  closePopup() {
    if (!this.poppedSection) return;
    const win = this.shellElement.querySelector('[data-role="panel-popup-overlay"]');
    const body = win?.querySelector('[data-role="panel-popup-body"]');
    const sectionBody = this.poppedSection.querySelector('.accordion-section-body');

    if (body && sectionBody) {
      while (body.firstChild) sectionBody.append(body.firstChild);
    }
    this.poppedSection.classList.remove('is-popped-out');
    this.poppedSection = null;
    if (win) win.style.display = 'none';
    if (this._onEsc) {
      document.removeEventListener('keydown', this._onEsc);
      this._onEsc = null;
    }
  }

  handlePointerDown(event) {
    const dragHandle = event.target?.closest?.('[data-role="popup-drag-handle"]');
    if (dragHandle && !event.target.closest('button')) {
      event.preventDefault();
      const win = this.shellElement.querySelector('[data-role="panel-popup-overlay"]');
      const rect = win.getBoundingClientRect();
      const startX = event.clientX, startY = event.clientY, startLeft = rect.left, startTop = rect.top;
      win.style.left = `${startLeft}px`;
      win.style.top = `${startTop}px`;
      win.style.transform = 'none';

      this._winMove = (e) => {
        win.style.left = `${Math.max(0, Math.min(window.innerWidth - 100, startLeft + (e.clientX - startX)))}px`;
        win.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, startTop + (e.clientY - startY)))}px`;
      };
      this._winUp = () => {
        document.removeEventListener('pointermove', this._winMove);
        document.removeEventListener('pointerup', this._winUp);
      };
      document.addEventListener('pointermove', this._winMove, { passive: false });
      document.addEventListener('pointerup', this._winUp);
      return;
    }

    const resizer = event.target?.closest?.('.panel-resizer');
    if (!resizer) return;

    event.preventDefault();
    const action = resizer.dataset.action;
    const stage = this.shellElement.querySelector('[data-webgl-host]');
    
    this.dragContext = {
      action,
      startX: event.clientX,
      startY: event.clientY,
      startLeftWidth: this.state.leftPanelWidth,
      startRightWidth: this.state.rightPanelWidth,
      startWebglHeight: stage ? stage.offsetHeight : (this.state.webglHeight || 350),
      maxWidth: window.innerWidth * 0.5,
      pointerId: event.pointerId,
      resizer: resizer
    };

    resizer.setPointerCapture(event.pointerId);
    document.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    document.addEventListener('pointerup', this.handlePointerUp);
    this.shellElement.classList.add('is-resizing');
  }

  handlePointerMove(event) {
    if (!this.dragContext) return;
    event.preventDefault();

    const { action, startX, startLeftWidth, startRightWidth, maxWidth } = this.dragContext;
    const deltaX = event.clientX - startX;

    if (action === 'resize-left') {
      let newWidth = Math.max(MIN_WIDTH, Math.min(startLeftWidth + deltaX, maxWidth));
      this.state.leftPanelWidth = newWidth;
      this.shellElement.style.setProperty('--left-panel', `${newWidth}px`);
    } else if (action === 'resize-right') {
      let newWidth = Math.max(MIN_WIDTH, Math.min(startRightWidth - deltaX, maxWidth));
      this.state.rightPanelWidth = newWidth;
      this.shellElement.style.setProperty('--right-panel', `${newWidth}px`);
    } else if (action === 'resize-viewport-vertical') {
      const deltaY = event.clientY - this.dragContext.startY;
      let newHeight = Math.max(100, Math.min(this.dragContext.startWebglHeight + deltaY, window.innerHeight * 0.75));
      this.state.webglHeight = newHeight;
      const stage = this.shellElement.querySelector('[data-webgl-host]');
      if (stage) stage.style.height = `${newHeight}px`;
    }
  }

  handlePointerUp(event) {
    if (!this.dragContext) return;
    
    if (this.dragContext.resizer && this.dragContext.pointerId !== undefined) {
      this.dragContext.resizer.releasePointerCapture(this.dragContext.pointerId);
    }
    
    document.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('pointerup', this.handlePointerUp);
    this.dragContext = null;
    this.shellElement.classList.remove('is-resizing');
    this.saveState();
    window.dispatchEvent(new Event('resize'));
  }

  destroy() {
    this.closePopup();
    if (this.shellElement) {
      this.shellElement.removeEventListener('pointerdown', this.handlePointerDown);
      this.shellElement.removeEventListener('click', this.handleClick);
    }
    document.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('pointerup', this.handlePointerUp);
  }
}
