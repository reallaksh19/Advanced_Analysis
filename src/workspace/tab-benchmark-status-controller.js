import {
  createAdvancedTabBenchmarkRegistry,
  validateTabBenchmarkSuite,
} from '../core/tab-benchmarks/index.js';

/**
 * Loads deterministic qualification evidence and projects it into each tab.
 *
 * This controller never converts missing, stale, or invalid evidence into a
 * qualified state. Failures remain visible as Not Run with a diagnostic.
 */
export class TabBenchmarkStatusController {
  constructor(rootElement, reportUrl) {
    this.rootElement = rootElement;
    this.reportUrl = reportUrl;
    this.registry = createAdvancedTabBenchmarkRegistry();
    this.suite = null;
    this.destroyed = false;
  }

  init() {
    this.renderNotRun('Loading qualification evidence.');
    void this.load();
  }

  async load() {
    try {
      const response = await fetch(this.reportUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new TypeError(`Qualification report request failed with status ${response.status}.`);
      }
      const suite = await response.json();
      const validation = validateTabBenchmarkSuite(suite, this.registry);
      if (!validation.ok) throw new TypeError(validation.errors.join(' '));
      if (this.destroyed) return;
      this.suite = suite;
      this.renderSuite(suite);
    } catch (error) {
      if (this.destroyed) return;
      this.suite = null;
      this.renderNotRun(error instanceof Error ? error.message : String(error));
    }
  }

  renderSuite(suite) {
    const byTab = new Map(suite.qualifications.map((row) => [row.tabId, row]));
    this.elements().forEach((element) => {
      const row = byTab.get(element.dataset.benchmarkTab);
      if (!row) return this.renderElement(element, 'Not Run', 'No registered qualification evidence exists for this tab.');
      const summary = `${row.passedCaseCount}/${row.requiredCaseCount} required cases passed.`
        + (row.failedCaseIds.length ? ` Failed: ${row.failedCaseIds.join(', ')}.` : '')
        + (row.missingCaseIds.length ? ` Missing: ${row.missingCaseIds.join(', ')}.` : '');
      this.renderElement(element, row.status, summary);
    });
  }

  renderNotRun(message) {
    this.elements().forEach((element) => this.renderElement(element, 'Not Run', message));
  }

  renderElement(element, status, summary) {
    element.dataset.status = status;
    const value = element.querySelector('[data-role="tab-benchmark-value"]');
    const summaryElement = element.querySelector('[data-role="tab-benchmark-summary"]');
    if (value) value.textContent = status;
    if (summaryElement) summaryElement.textContent = summary;
  }

  elements() {
    return [...(this.rootElement?.querySelectorAll('[data-role="tab-benchmark-status"]') || [])];
  }

  getSuite() {
    return this.suite;
  }

  destroy() {
    this.destroyed = true;
    this.suite = null;
  }
}
