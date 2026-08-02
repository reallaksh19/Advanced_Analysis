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
    this.clickHandler = (event) => this.handleClick(event);
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
    this.resultsElement.addEventListener('click', this.clickHandler);
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
    this.resultsElement?.removeEventListener('click', this.clickHandler);
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

  handleClick(event) {
    const button = event.target.closest('[data-search-result-index]');
    if (!button) return;
    this.activate(Number(button.dataset.searchResultIndex));
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
      this.activate(this.activeIndex);
    } else if (event.key === 'Escape') {
      this.input.value = '';
      this.runQuery();
    }
  }

  activate(index) {
    const result = this.results[index];
    if (!result) return;
    this.activeIndex = index;
    this.renderResults();
    this.onActivate(result);
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
    this.statusElement.textContent = `${this.results.length} result(s).`;
    this.results.forEach((result, index) => {
      this.resultsElement.append(this.resultButton(result, index));
    });
  }

  resultButton(result, index) {
    const button = globalThis.document.createElement('button');
    button.type = 'button';
    button.dataset.searchResultIndex = String(index);
    button.role = 'option';
    button.ariaSelected = String(index === this.activeIndex);
    button.className = 'topology-edit-search__result';
    const hidden = !this.isCanonicalIdVisible(result.canonicalId);
    button.textContent = hidden ? `${result.label} · hidden (reveal and focus)` : result.label;
    button.title = resultDetails(result);
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
