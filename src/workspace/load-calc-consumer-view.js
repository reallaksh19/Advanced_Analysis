/**
 * Builds the empirical Load Calc workbench shell. Engineering values shown by
 * this module are read from the immutable support-load-distribution/v3 result.
 */
export function renderLoadCalcConsumer(documentRef, state) {
  const section = documentRef.createElement('section');
  section.className = 'load-calc-consumer empirical-load-calc';
  section.dataset.role = 'load-calc-consumer';
  section.innerHTML = `${headerMarkup(state)}<div data-load-calc-pane class="empirical-load-calc__pane"></div>`;
  return section;
}

function headerMarkup(state) {
  const supportSummary = state.supportSiteModel?.summary;
  const routeSummary = state.routePartitionModel?.summary;
  const freshness = state.distribution?.freshness?.status || 'NOT_CALCULATED';
  return `<header class="empirical-load-calc__header">
    <div><span class="panel-eyebrow">CHAINAGE_TRIBUTARY_SPAN_V2</span><h1>Empirical Support Loads</h1></div>
    <div class="empirical-load-calc__facts">
      <span>Assemblies: ${integer(supportSummary?.supportAssemblyCount)}</span>
      <span>Sites: ${integer(supportSummary?.physicalLocationCount)}</span>
      <span>Routes: ${integer(routeSummary?.routeCount)}</span>
      <span>Freshness: ${escapeHtml(freshness)}</span>
    </div>
    <nav class="empirical-load-calc__tabs" aria-label="Load calculation views">
      ${tab('loads', 'Load Evaluation', state.activeTab)}${tab('preflight', 'Pre-flight', state.activeTab)}${tab('project-data', 'Project Data', state.activeTab)}${tab('masters', 'Masters', state.activeTab)}${tab('json-trace', 'JSON Trace', state.activeTab)}
    </nav>
    <div class="empirical-load-calc__actions">
      <button type="button" data-engineering-load-calculate>Calculate from approved data</button>
      <output data-engineering-load-status aria-live="polite">${escapeHtml(state.message || '')}</output>
    </div>
  </header>`;
}

function tab(id, label, activeTab) {
  const selected = id === activeTab;
  return `<button type="button" data-load-calc-tab="${id}" aria-selected="${selected}" class="${selected ? 'is-active' : ''}">${label}</button>`;
}

export function renderEngineeringLoadPane(container, distribution, supportSiteModel, routePartitionModel) {
  if (!container) return;
  container.innerHTML = `${contractSummary(distribution, supportSiteModel, routePartitionModel)}${caseMarkup(distribution, supportSiteModel)}`;
}

function contractSummary(distribution, supportSiteModel, routePartitionModel) {
  const siteStatus = supportSiteModel?.status || 'NOT_AVAILABLE';
  const routeStatus = routePartitionModel?.status || 'NOT_AVAILABLE';
  const status = distribution?.status || 'NOT_CALCULATED';
  return `<section class="load-contract-summary"><h2>Calculation authority</h2>
    <dl><dt>Support sites</dt><dd>${escapeHtml(siteStatus)}</dd><dt>Route partitions</dt><dd>${escapeHtml(routeStatus)}</dd><dt>Distribution</dt><dd>${escapeHtml(status)}</dd></dl>
    ${blockerMarkup(distribution?.blockers || [...(supportSiteModel?.blockers || []), ...(routePartitionModel?.blockers || [])])}
  </section>`;
}

function caseMarkup(distribution, supportSiteModel) {
  if (!distribution?.loadCases?.length) return '<p class="panel-empty">Run the calculation after importing and approving all required Project Data and masters.</p>';
  const primaryBySite = new Map((supportSiteModel?.sites || []).map((site) => [site.siteId, site.primaryEntityId]));
  return distribution.loadCases.map((loadCase) => `<section class="load-case-evidence">
    <h2>${escapeHtml(loadCase.loadCaseId)} <span>${escapeHtml(loadCase.status)}</span></h2>
    ${blockerMarkup(loadCase.blockers)}
    <table><thead><tr><th>Support site</th><th>Status</th><th>Vertical force (N, source Z-up)</th><th>Contributors</th></tr></thead>
    <tbody>${loadCase.supportResults.map((row) => `<tr><td><button type="button" data-load-support-entity-id="${escapeHtml(primaryBySite.get(row.supportSiteId) || '')}">${escapeHtml(row.supportSiteId)}</button></td><td>${escapeHtml(row.status)}</td><td>${force(row.verticalForceN)}</td><td>${integer(row.contributorIds?.length)}</td></tr>`).join('')}</tbody></table>
    <details><summary>Contribution ledger (${integer(loadCase.contributionLedger?.length)})</summary><pre>${escapeHtml(JSON.stringify(loadCase.contributionLedger || [], null, 2))}</pre></details>
    <details><summary>Excluded inputs (${integer(loadCase.excludedInputs?.length)})</summary><pre>${escapeHtml(JSON.stringify(loadCase.excludedInputs || [], null, 2))}</pre></details>
  </section>`).join('');
}

function blockerMarkup(blockers) {
  if (!blockers?.length) return '';
  return `<details open class="load-blockers"><summary>Blocked inputs (${blockers.length})</summary><ul>${blockers.map((row) => `<li><strong>${escapeHtml(row.code || 'BLOCKED')}</strong> ${escapeHtml(row.path || row.routeId || '')} ${escapeHtml(row.message || '')}</li>`).join('')}</ul></details>`;
}

function force(value) { return Number.isFinite(value) ? value.toFixed(3) : 'BLOCKED'; }
function integer(value) { return Number.isInteger(value) ? String(value) : '—'; }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
}
