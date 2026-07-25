const STORAGE_KEY = 'workspace-layout-prefs';
const MIN_WIDTH = 200;

export class WorkspaceShellController {
  constructor(rootElement) {
    if (!rootElement) throw new TypeError('WorkspaceShellController requires a root element.');
    this.rootElement = rootElement;
    this.shellElement = null;
    
    this.state = {
      leftPanelWidth: 300,
      rightPanelWidth: 350,
      treeCollapsed: false,
      propertiesCollapsed: false
    };

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
  }

  loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state = { ...this.state, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to parse workspace layout preferences from localStorage.', e);
    }
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
  }

  handleClick(event) {
    const trigger = event.target?.closest?.('[data-action]');
    if (!trigger || !this.shellElement.contains(trigger)) return;

    const action = trigger.dataset.action;
    if (action === 'toggle-tree-collapse') {
      this.state.treeCollapsed = !this.state.treeCollapsed;
      this.applyState();
      this.saveState();
    } else if (action === 'toggle-properties-collapse') {
      this.state.propertiesCollapsed = !this.state.propertiesCollapsed;
      this.applyState();
      this.saveState();
    }
  }

  handlePointerDown(event) {
    const resizer = event.target?.closest?.('.panel-resizer');
    if (!resizer) return;

    event.preventDefault();
    const action = resizer.dataset.action; // 'resize-left' or 'resize-right'
    
    this.dragContext = {
      action,
      startX: event.clientX,
      startLeftWidth: this.state.leftPanelWidth,
      startRightWidth: this.state.rightPanelWidth,
      maxWidth: window.innerWidth * 0.5
    };

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
      let newWidth = startLeftWidth + deltaX;
      newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, maxWidth));
      this.state.leftPanelWidth = newWidth;
      this.shellElement.style.setProperty('--left-panel', `${newWidth}px`);
    } else if (action === 'resize-right') {
      let newWidth = startRightWidth - deltaX;
      newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, maxWidth));
      this.state.rightPanelWidth = newWidth;
      this.shellElement.style.setProperty('--right-panel', `${newWidth}px`);
    }
  }

  handlePointerUp() {
    if (!this.dragContext) return;
    
    document.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('pointerup', this.handlePointerUp);
    this.dragContext = null;
    this.shellElement.classList.remove('is-resizing');
    
    this.saveState();
  }

  destroy() {
    if (this.shellElement) {
      this.shellElement.removeEventListener('pointerdown', this.handlePointerDown);
      this.shellElement.removeEventListener('click', this.handleClick);
    }
    document.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('pointerup', this.handlePointerUp);
  }
}
