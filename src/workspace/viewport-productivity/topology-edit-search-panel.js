import {
  assertTopologyEditSearchIndex,
  queryTopologyEditSearch,
} from './topology-edit-search-index.js';

export class TopologyEditSearchPanel {
  constructor({
    onActivate,
    isCanonicalIdVisible = () => true,
    resultLimit = 50,
  } = {}) {
    if (typeof onActivate !== 'function') {
      throw new TypeError('TopologyEditSearchPanel requires onActivate.');
    }
    this.onActivate = onActivate;
    this.isCanonicalIdVisible = isCanonicalIdVisible;
    this.resultLimit = resultLimit;
    this.host = null;
    this.input = null;
    this.resultsElement = null;
    this.index = null;
    this.results = Object.freeze([]);
    this.activeIndex = -1;
    this.inputHandler = () => this.runQuery();
    this.keyHandler = (event) => this.handleKey(event);
  }

  mount(host) {
    if (!host) throw new TypeError('TopologyEditSearchPanel requires a host element.');
    this.destroy();
    this.host = host;
    host.innerHTML = `
      <label class="topology-edit-search__label">
        Find canonical object
        <input type="search" data-role="topology-edit-search-input"
          placeholder="Canonical ID, entity ID, source path, family…"
          autocomplete="off" spellcheck="false" disabled>
      </label>
      <output data-role="topology-edit-search-status" aria-live="polite">
        Search unavailable until canonical data is current.
      </output>
      <div data-role="topology-edit-search-results"
        class="topology-edit-search__results" role="listbox"></div>`;
    this.input = host.querySelector('[data-role="topology-edit-search-input"]');
    this.resultsElement = host.querySelector('[data-role="topology-edit-search-results"]');
    this.statusElement = host.querySelector('[data-role="topology-edit-search-status"]');
    this.input.addEventListener('input', this.inputHandler);
    this.input.addEventListener('keydown', this.keyHandler);
  }

  updateIndex(indexInput) {
    this.index = assertTopologyEditSearchIndex(indexInput);
    if (this.input) this.input.disabled = false;
    this.runQuery();
  }

  refreshVisibility() {
    this.renderResults();
  }

  destroy() {
    this.input?.removeEventListener('input', this.inputHandler);
    this.input?.removeEventListener('keydown', this.keyHandler);
    this.host?.replaceChildren();
    this.host = null;
    this.input = null;
    this.resultsElement = null;
    this.statusElement = null;
    this.index = null;
    this.results = Object.freeze([]);
    this.activeIndex = -1;
  }

  runQuery() {
    if (!this.index || !this.input) return;
    this.results = queryTopologyEditSearch(
      this.index,
      this.input.value,
      { limit: this.resultLimit },
    );
    this.activeIndex = this.results.length ? 0 : -1;
    this.renderResults();
  }

  handleKey(event) {
    if (!this.results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex = (this.activeIndex + 1) % this.results.length;
      this.renderResults();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex = (this.activeIndex - 1 + this.results.length) % this.results.length;
      this.renderResults();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.activate(this.activeIndex, { additive: event.shiftKey });
    } else if (event.key === 'Escape') {
      this.input.value = '';
      this.runQuery();
    }
  }

  activate(index, options = {}) {
    const result = this.results[index];
    if (!result) return;
    this.activeIndex = index;
    this.renderResults();
    this.onActivate(result, { additive: Boolean(options.additive) });
  }

  renderResults() {
    if (!this.resultsElement || !this.statusElement) return;
    this.resultsElement.replaceChildren();
    if (!this.input?.value.trim()) {
      this.statusElement.textContent = this.index
        ? `${this.index.documentCount} canonical objects indexed.`
        : 'Search unavailable until canonical data is current.';
      return;
    }
    this.statusElement.textContent = `${this.results.length} result(s). Shift-activate a node to add it to the current selection.`;
    this.results.forEach((result, index) => {
      this.resultsElement.append(this.resultButton(result, index));
    });
  }

  resultButton(result, index) {
    const button = globalThis.document.createElement('button');
    button.type = 'button';
    button.dataset.searchResultIndex = String(index);
    button.dataset.searchCanonicalId = result.canonicalId;
    button.dataset.searchObjectKind = result.objectKind;
    button.role = 'option';
    button.ariaSelected = String(index === this.activeIndex);
    button.setAttribute('aria-keyshortcuts', 'Enter Shift+Enter');
    button.className = 'topology-edit-search__result';
    const hidden = !this.isCanonicalIdVisible(result.canonicalId);
    button.textContent = hidden ? `${result.label} · hidden (reveal and focus)` : result.label;
    button.title = `${resultDetails(result)}\nShift-activate to add this node or edge to the current selection.`;
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.activate(index, { additive: event.shiftKey });
    });
    button.addEventListener('click', (event) => {
      if (event.detail !== 0) return;
      this.activate(index, { additive: event.shiftKey });
    });
    return button;
  }
}

function resultDetails(result) {
  const details = [
    `Canonical ID: ${result.canonicalId}`,
    `Kind: ${result.objectKind}`,
  ];
  if (result.workspaceEntityIds.length) {
    details.push(`Workspace entities: ${result.workspaceEntityIds.join(', ')}`);
  }
  if (result.sourcePaths.length) details.push(`Source paths: ${result.sourcePaths.join(', ')}`);
  if (result.diagnosticCodes.length) {
    details.push(`Diagnostics: ${result.diagnosticCodes.join(', ')}`);
  }
  return details.join('\n');
}
