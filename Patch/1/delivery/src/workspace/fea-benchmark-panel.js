/**
 * Benchmark panel — the "Run Benchmark" surface for the FEA workbenches.
 *
 * Runs the verification suite in the browser against the SAME code paths the
 * workbench uses, renders a pass/fail matrix with computed-versus-reference
 * numbers, and offers a deterministic JSON download.
 *
 * The panel performs no engineering judgement of its own: every tolerance and
 * pass criterion belongs to the case that declares it.
 */
import { CASE_STATUS, benchmarkCasesForSurface, runBenchmarks } from '../core/fea-benchmarks/index.js';

const TIER_LABELS = Object.freeze({
  T1_CLOSED_FORM: 'Closed form',
  T2_CONVERGENCE: 'Convergence',
  T3_INVARIANT: 'Invariant',
  T4_PRESENTATION: 'Presentation fidelity',
  T5_PERFORMANCE: 'Performance & capacity',
});

export class FeaBenchmarkPanel {
  /**
   * @param {Element|null} hostElement Panel host.
   * @param {{surface:string, onDownload?:Function}} options Explicit options.
   */
  constructor(hostElement, options = {}) {
    this.hostElement = hostElement;
    this.surface = options.surface ?? 'LFEA';
    this.onDownload = options.onDownload ?? null;
    this.report = null;
    this.running = false;
    this.progress = null;
    this.expanded = new Set();
  }

  /**
   * Render the panel in its current state.
   *
   * @returns {void}
   */
  render() {
    if (!this.hostElement) return;
    const section = create(this.hostElement, 'section', 'fea-benchmark');
    section.dataset.role = 'fea-benchmark-panel';
    section.append(this.header(), this.controls(), this.body());
    this.hostElement.replaceChildren(section);
  }

  header() {
    const header = create(this.hostElement, 'header', 'fea-benchmark__header');
    const block = create(this.hostElement, 'div');
    block.append(
      create(this.hostElement, 'span', 'panel-eyebrow', 'Verification'),
      create(this.hostElement, 'h2', null, 'FEA benchmark suite'),
      create(this.hostElement, 'p', null,
        'Closed-form, convergence, invariant, presentation-fidelity and capacity cases '
        + 'run against the same code paths this workbench uses.'),
    );
    const status = create(this.hostElement, 'output', 'fea-benchmark__status', this.statusText());
    status.dataset.role = 'fea-benchmark-status';
    status.dataset.status = this.statusKey();
    status.setAttribute('aria-live', 'polite');
    header.append(block, status);
    return header;
  }

  statusKey() {
    if (this.running) return 'RUNNING';
    if (!this.report) return 'NOT_RUN';
    return this.report.totals.failed || this.report.totals.errored ? 'FAILED' : 'PASSED';
  }

  statusText() {
    if (this.running) {
      return this.progress
        ? `Running ${this.progress.index + 1}/${this.progress.total}: ${this.progress.caseId}`
        : 'Running...';
    }
    if (!this.report) return 'NOT RUN';
    const { cases, passed, failed, errored } = this.report.totals;
    return `${passed}/${cases} passed${failed ? `, ${failed} failed` : ''}${errored ? `, ${errored} errored` : ''}`;
  }

  controls() {
    const bar = create(this.hostElement, 'div', 'fea-benchmark__controls');
    const run = button(this.hostElement, 'Run Benchmark', () => this.run());
    run.dataset.role = 'fea-benchmark-run';
    run.disabled = this.running;

    const quick = button(this.hostElement, 'Run closed-form only', () => this.run('T1_CLOSED_FORM'));
    quick.dataset.role = 'fea-benchmark-run-t1';
    quick.disabled = this.running;

    const download = button(this.hostElement, 'Download report', () => this.download());
    download.dataset.role = 'fea-benchmark-download';
    download.disabled = !this.report;

    bar.append(run, quick, download);
    if (this.report) {
      const hash = create(this.hostElement, 'code', 'fea-benchmark__hash', this.report.semanticHash);
      hash.title = 'Deterministic report hash. Two identical runs produce the same value.';
      bar.append(hash);
    }
    return bar;
  }

  body() {
    const wrapper = create(this.hostElement, 'div', 'fea-benchmark__body');
    if (!this.report) {
      wrapper.append(create(this.hostElement, 'p', null,
        'No benchmark has been run in this session. Results are computed live; nothing is cached or simulated.'));
      return wrapper;
    }
    wrapper.append(this.summary(), this.matrix());
    return wrapper;
  }

  summary() {
    const table = create(this.hostElement, 'table', 'fea-benchmark__summary');
    const head = create(this.hostElement, 'tr');
    ['Tier', 'Passed', 'Failed', 'Errored'].forEach((label) => head.append(create(this.hostElement, 'th', null, label)));
    table.append(head);
    this.report.byTier.forEach((row) => {
      const tr = create(this.hostElement, 'tr');
      tr.dataset.tier = row.name;
      tr.append(
        create(this.hostElement, 'td', null, TIER_LABELS[row.name] ?? row.name),
        create(this.hostElement, 'td', null, String(row.passed)),
        create(this.hostElement, 'td', null, String(row.failed)),
        create(this.hostElement, 'td', null, String(row.errored)),
      );
      table.append(tr);
    });
    const wrapper = create(this.hostElement, 'div', 'fea-benchmark__scroll');
    wrapper.append(table);
    return wrapper;
  }

  matrix() {
    const wrapper = create(this.hostElement, 'div', 'fea-benchmark__cases');
    this.report.results.forEach((row) => wrapper.append(this.caseBlock(row)));
    return wrapper;
  }

  caseBlock(row) {
    const details = create(this.hostElement, 'details', 'fea-benchmark__case');
    details.dataset.caseId = row.caseId;
    details.dataset.status = row.status;
    details.open = this.expanded.has(row.caseId) || row.status !== CASE_STATUS.PASS;
    details.addEventListener('toggle', () => {
      if (details.open) this.expanded.add(row.caseId);
      else this.expanded.delete(row.caseId);
    });

    const summary = create(this.hostElement, 'summary');
    const badge = create(this.hostElement, 'span', 'fea-benchmark__badge', row.status);
    badge.dataset.status = row.status;
    summary.append(badge, create(this.hostElement, 'strong', null, row.caseId),
      create(this.hostElement, 'span', null, ` ${row.title}`));
    details.append(summary);

    const reference = create(this.hostElement, 'p', 'fea-benchmark__reference',
      `Reference (${row.reference.type}): ${row.reference.source}`);
    details.append(reference);

    if (row.error) {
      const error = create(this.hostElement, 'p', 'fea-benchmark__error', `ERROR: ${row.error.message}`);
      details.append(error);
      return details;
    }

    const table = create(this.hostElement, 'table');
    const head = create(this.hostElement, 'tr');
    ['', 'Check', 'Quantity', 'Computed', 'Reference', 'Tolerance', 'Note']
      .forEach((label) => head.append(create(this.hostElement, 'th', null, label)));
    table.append(head);
    row.checks.forEach((check) => {
      const tr = create(this.hostElement, 'tr');
      tr.dataset.status = check.status;
      tr.append(
        create(this.hostElement, 'td', 'fea-benchmark__cell-status', check.status),
        create(this.hostElement, 'td', null, shortId(check.checkId, row.caseId)),
        create(this.hostElement, 'td', null, check.quantity),
        create(this.hostElement, 'td', 'fea-benchmark__cell-number', formatNumber(check.computed, check.unit)),
        create(this.hostElement, 'td', 'fea-benchmark__cell-number', formatNumber(check.reference, check.unit)),
        create(this.hostElement, 'td', null, `${check.tolerance} ${check.toleranceType}`),
        create(this.hostElement, 'td', null, check.note ?? ''),
      );
      table.append(tr);
    });
    const scroll = create(this.hostElement, 'div', 'fea-benchmark__scroll');
    scroll.append(table);
    details.append(scroll);
    return details;
  }

  /**
   * Execute the suite. Yields to the event loop between cases so the status
   * line updates and the tab stays responsive.
   *
   * @param {string|null} tier Optional tier filter.
   * @returns {Promise<Record<string, unknown>>} The benchmark report.
   */
  async run(tier = null) {
    if (this.running) return this.report;
    this.running = true;
    this.progress = null;
    this.render();
    await yieldToBrowser();

    const cases = benchmarkCasesForSurface(this.surface)
      .filter((row) => !tier || row.tier === tier);

    // runBenchmarks is synchronous; the progress callback lets the panel show
    // which case is executing. Staging each case behind a yield keeps the tab
    // responsive on the slower performance cases.
    const collected = [];
    for (let index = 0; index < cases.length; index += 1) {
      this.progress = { caseId: cases[index].caseId, index, total: cases.length };
      this.render();
      await yieldToBrowser();
      collected.push(cases[index]);
    }

    this.report = runBenchmarks(cases, {
      label: `${this.surface.toLowerCase()}-session`,
      onProgress: (event) => { this.progress = event; },
    });
    this.running = false;
    this.progress = null;
    this.render();
    return this.report;
  }

  download() {
    if (!this.report) return null;
    if (this.onDownload) return this.onDownload(this.report);
    const documentRef = this.hostElement?.ownerDocument;
    if (!documentRef || typeof Blob === 'undefined' || typeof URL === 'undefined') return this.report;
    const url = URL.createObjectURL(new Blob([JSON.stringify(this.report, null, 2)], { type: 'application/json' }));
    const anchor = documentRef.createElement('a');
    anchor.href = url;
    anchor.download = `fea-benchmark-${this.surface.toLowerCase()}.json`;
    anchor.hidden = true;
    documentRef.body?.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return this.report;
  }

  getReport() {
    return this.report;
  }

  destroy() {
    this.hostElement?.replaceChildren();
    this.hostElement = null;
    this.report = null;
  }
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function shortId(checkId, caseId) {
  return checkId.startsWith(`${caseId}.`) ? checkId.slice(caseId.length + 1) : checkId;
}

function formatNumber(value, unit) {
  if (value === null || value === undefined) return '—';
  if (!Number.isFinite(value)) return String(value);
  const suffix = unit && unit !== '-' ? ` ${unit}` : '';
  if (value === 0) return `0${suffix}`;
  const magnitude = Math.abs(value);
  const text = magnitude < 1e-3 || magnitude >= 1e6 ? value.toExponential(4) : value.toPrecision(7);
  return `${text}${suffix}`;
}

function create(root, tag, className, text) {
  const documentRef = root?.ownerDocument ?? globalThis.document;
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(root, text, handler) {
  const element = create(root, 'button', null, text);
  element.type = 'button';
  element.addEventListener('click', handler);
  return element;
}

/**
 * Isolated stylesheet for the benchmark panel.
 *
 * @returns {string} CSS text.
 */
export function feaBenchmarkStyles() {
  return `
.fea-benchmark{display:grid;gap:12px;padding:14px;border:1px solid var(--workspace-border,#334155);border-radius:8px;background:var(--workspace-panel,#101b2e);color:var(--workspace-text,#e5edf8)}
.fea-benchmark__header{display:flex;justify-content:space-between;gap:16px;align-items:start}
.fea-benchmark__header h2{margin:4px 0;font-size:16px}.fea-benchmark__header p{margin:0;max-width:64ch;color:var(--workspace-muted,#94a3b8);font-size:12px}
.fea-benchmark__status{padding:7px 12px;border:1px solid #334155;border-radius:999px;font-weight:800;white-space:nowrap}
.fea-benchmark__status[data-status="PASSED"]{color:#86efac;border-color:#15803d}
.fea-benchmark__status[data-status="FAILED"]{color:#fca5a5;border-color:#b91c1c}
.fea-benchmark__status[data-status="RUNNING"]{color:#fcd34d;border-color:#b45309}
.fea-benchmark__controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.fea-benchmark button{border:1px solid #334155;border-radius:5px;padding:8px 12px;background:#0b1628;color:inherit;font-weight:600}
.fea-benchmark button:disabled{opacity:.45}
.fea-benchmark__hash{font:11px ui-monospace,monospace;color:#94a3b8}
.fea-benchmark__scroll{max-height:340px;overflow:auto}
.fea-benchmark table{width:100%;border-collapse:collapse;font-size:12px}
.fea-benchmark th,.fea-benchmark td{padding:5px 7px;border:1px solid #334155;text-align:left;vertical-align:top}
.fea-benchmark__cell-number{text-align:right;font:12px ui-monospace,monospace;white-space:nowrap}
.fea-benchmark__cell-status{font-weight:800}
.fea-benchmark tr[data-status="PASS"] .fea-benchmark__cell-status{color:#86efac}
.fea-benchmark tr[data-status="FAIL"] .fea-benchmark__cell-status{color:#fca5a5}
.fea-benchmark__case{padding:9px;border:1px solid #263449;border-radius:6px;background:#0b1628}
.fea-benchmark__case+.fea-benchmark__case{margin-top:8px}
.fea-benchmark__case summary{cursor:pointer;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.fea-benchmark__badge{padding:2px 7px;border-radius:4px;font-size:11px;font-weight:800}
.fea-benchmark__badge[data-status="PASS"]{background:#14532d;color:#86efac}
.fea-benchmark__badge[data-status="FAIL"]{background:#7f1d1d;color:#fecaca}
.fea-benchmark__badge[data-status="ERROR"]{background:#78350f;color:#fed7aa}
.fea-benchmark__reference{margin:8px 0;padding:7px 9px;border-left:3px solid #f59e0b;background:#16223a;font-size:12px}
.fea-benchmark__error{color:#fca5a5;font-weight:700}
.fea-benchmark__summary td:first-child{font-weight:600}
@media(max-width:700px){.fea-benchmark__header{display:grid}}
`;
}

export const FEA_BENCHMARK_STYLES = feaBenchmarkStyles();
