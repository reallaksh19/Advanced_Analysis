/**
 * Floating & Collapsible Reactive Topology Table View for Sequential Sketcher
 * Renders an editable data grid floating over the 2D SVG canvas with collapse/expand capability.
 */
import { buildTableHeader, buildTableBody } from './topology-table-row-view.js';

export class SequentialTopologyTableView {
  constructor(rootElement, tableStore) {
    this.rootElement = rootElement;
    this.store = tableStore;
    this.unsubscribe = null;
    this.isCollapsed = false;
  }

  mount() {
    if (this.store) {
      this.unsubscribe = this.store.subscribe(() => this.render());
    }
    this.render();
  }

  unmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  render() {
    if (!this.rootElement) return;

    const doc = this.rootElement.ownerDocument;
    const state = this.store.getState();
    const dataset = state.dataset;
    const selectedId = state.selectedEntityId;

    this.rootElement.replaceChildren();

    const container = doc.createElement('div');
    container.className = 'sequential-topology-table-container';
    container.style.position = 'absolute';
    container.style.bottom = '12px';
    container.style.left = '12px';
    container.style.right = '12px';
    container.style.zIndex = '100';
    container.style.background = '#091322f0';
    container.style.backdropFilter = 'blur(8px)';
    container.style.borderRadius = '8px';
    container.style.border = '1px solid #334155';
    container.style.boxShadow = '0 12px 36px rgba(0, 0, 0, 0.75)';
    container.style.padding = '10px';
    container.style.color = '#f8fafc';
    container.style.fontSize = '12px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.maxHeight = this.isCollapsed ? '44px' : '300px';
    container.style.overflow = 'hidden';
    container.style.transition = 'max-height 0.25s ease-in-out';

    // Header Toolbar
    const toolbar = doc.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.justifyContent = 'space-between';
    toolbar.style.alignItems = 'center';
    toolbar.style.borderBottom = this.isCollapsed ? 'none' : '1px solid #1e293b';
    toolbar.style.paddingBottom = this.isCollapsed ? '0' : '6px';
    toolbar.style.cursor = 'pointer';

    const titleGroup = doc.createElement('div');
    titleGroup.style.display = 'flex';
    titleGroup.style.alignItems = 'center';
    titleGroup.style.gap = '8px';

    const icon = doc.createElement('span');
    icon.textContent = '📊';

    const title = doc.createElement('strong');
    title.style.color = '#38bdf8';
    title.textContent = `Topology Edit Draft (${dataset?.entities?.length || 0} Entities)`;

    titleGroup.append(icon, title);

    const controlsGroup = doc.createElement('div');
    controlsGroup.style.display = 'flex';
    controlsGroup.style.alignItems = 'center';
    controlsGroup.style.gap = '8px';

    if (!this.isCollapsed) {
      const searchInput = doc.createElement('input');
      searchInput.type = 'search';
      searchInput.placeholder = 'Filter rows...';
      searchInput.value = state.searchQuery || '';
      searchInput.style.background = '#020617';
      searchInput.style.border = '1px solid #334155';
      searchInput.style.color = '#f8fafc';
      searchInput.style.borderRadius = '4px';
      searchInput.style.padding = '3px 8px';
      searchInput.style.fontSize = '11px';
      searchInput.addEventListener('click', (e) => e.stopPropagation());
      searchInput.addEventListener('input', (e) => {
        this.store.setState({ searchQuery: e.target.value });
      });
      controlsGroup.append(searchInput);
    }

    const toggleBtn = doc.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.textContent = this.isCollapsed ? '🔼 Expand Table' : '🔽 Collapse';
    toggleBtn.style.background = '#1e293b';
    toggleBtn.style.border = '1px solid #334155';
    toggleBtn.style.color = '#38bdf8';
    toggleBtn.style.borderRadius = '4px';
    toggleBtn.style.padding = '3px 8px';
    toggleBtn.style.fontSize = '11px';
    toggleBtn.style.fontWeight = 'bold';
    toggleBtn.style.cursor = 'pointer';

    const handleToggle = (e) => {
      e.stopPropagation();
      this.isCollapsed = !this.isCollapsed;
      this.render();
    };

    toggleBtn.addEventListener('click', handleToggle);
    toolbar.addEventListener('click', handleToggle);

    controlsGroup.append(toggleBtn);
    toolbar.append(titleGroup, controlsGroup);
    container.append(toolbar);

    if (this.isCollapsed) {
      this.rootElement.append(container);
      return;
    }

    if (!dataset || !Array.isArray(dataset.entities) || dataset.entities.length === 0) {
      const emptyMsg = doc.createElement('p');
      emptyMsg.style.color = '#94a3b8';
      emptyMsg.style.margin = '10px 0';
      emptyMsg.textContent = 'No topology entities available.';
      container.append(emptyMsg);
      this.rootElement.append(container);
      return;
    }

    // Scrollable Table Wrapper with custom vertical scrollbar
    const tableWrapper = doc.createElement('div');
    tableWrapper.style.overflowY = 'auto';
    tableWrapper.style.overflowX = 'auto';
    tableWrapper.style.maxHeight = '230px';
    tableWrapper.style.flex = '1';
    tableWrapper.style.scrollbarWidth = 'thin';
    tableWrapper.style.scrollbarColor = '#0284c7 #091322';

    // Table
    const table = doc.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontFamily = 'monospace';

    // Table Head & Body
    table.append(buildTableHeader(doc));
    table.append(buildTableBody(doc, dataset, state, this.store));
    tableWrapper.append(table);
    container.append(tableWrapper);
    this.rootElement.append(container);
  }
}
