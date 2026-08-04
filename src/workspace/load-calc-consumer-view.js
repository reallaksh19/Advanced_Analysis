/**
 * Builds the empirical Load Calc workbench shell. Engineering values shown by
 * this module are read from immutable empirical result and receipt contracts.
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
  const authorization = state.authorizationState || {};
  const authority = authorization.packageSemanticHash
    ? 'AUTHORIZED_HANDOFF'
    : state.distribution ? 'UNAUTHORIZED_LEGACY_RESULT' : 'NOT_CALCULATED';
  const eligible = authorization.calculationEligible === true;
  const recalculate = authorization.state === 'EXECUTED_CURRENT';
  const disabledReason = authorizationReason(authorization);
  return `<header class="empirical-load-calc__header">
    <div><span class="panel-eyebrow">CHAINAGE_TRIBUTARY_SPAN_V2</span><h1>Empirical Support Loads</h1></div>
    <div class="empirical-load-calc__facts">
      <span>Assemblies: ${integer(supportSummary?.supportAssemblyCount)}</span>
      <span>Sites: ${integer(supportSummary?.physicalLocationCount)}</span>
      <span>Routes: ${integer(routeSummary?.routeCount)}</span>
      <span>Freshness: ${escapeHtml(freshness)}</span>
      <span>Authority: ${escapeHtml(authority)}</span>
      <span>Authorization: ${escapeHtml(authorization.state || 'NOT_CONFIGURED')}</span>
      <span>Authorization freshness: ${escapeHtml(authorization.authorizationFreshness || 'NOT_APPLICABLE')}</span>
      <span>Execution freshness: ${escapeHtml(authorization.executionFreshness || 'NOT_APPLICABLE')}</span>
    </div>
    <nav class="empirical-load-calc__tabs" aria-label="Load calculation views">
      ${tab('loads', 'Load Evaluation', state.activeTab)}${tab('preflight', 'Pre-flight', state.activeTab)}${tab('project-data', 'Project Data', state.activeTab)}${tab('masters', 'Masters', state.activeTab)}${tab('json-trace', 'JSON Trace', state.activeTab)}
    </nav>
    <div class="empirical-load-calc__actions">
      <button type="button" data-engineering-load-calculate ${eligible ? '' : 'disabled'} aria-disabled="${eligible ? 'false' : 'true'}" title="${escapeHtml(eligible ? 'Execute the current authorized empirical package.' : disabledReason)}">${recalculate ? 'Recalculate authorized loads' : 'Calculate authorized loads'}</button>
      <output data-engineering-load-status aria-live="polite">${escapeHtml(state.message || (!eligible ? disabledReason : ''))}</output>
    </div>
  </header>`;
}

function tab(id, label, activeTab) {
  const selected = id === activeTab;
  return `<button type="button" data-load-calc-tab="${id}" aria-selected="${selected}" class="${selected ? 'is-active' : ''}">${label}</button>`;
}

export function renderEngineeringLoadPane(
  container,
  distribution,
  supportSiteModel,
  routePartitionModel,
  authorizedExecution = null,
  authorizationState = null,
) {
  if (!container) return;
  container.innerHTML = `${contractSummary(
    distribution,
    supportSiteModel,
    routePartitionModel,
    authorizedExecution,
    authorizationState,
  )}${caseMarkup(distribution, supportSiteModel)}`;
}

function contractSummary(distribution, supportSiteModel, routePartitionModel, authorizedExecution, authorizationState) {
  const siteStatus = supportSiteModel?.status || 'NOT_AVAILABLE';
  const routeStatus = routePartitionModel?.status || 'NOT_AVAILABLE';
  const status = distribution?.status || 'NOT_CALCULATED';
  return `<section class="load-contract-summary"><h2>Calculation authority</h2>
    <dl><dt>Support sites</dt><dd>${escapeHtml(siteStatus)}</dd><dt>Route partitions</dt><dd>${escapeHtml(routeStatus)}</dd><dt>Distribution</dt><dd>${escapeHtml(status)}</dd><dt>Authorization</dt><dd>${escapeHtml(authorizationState?.state || 'NOT_CONFIGURED')}</dd><dt>Authorization freshness</dt><dd>${escapeHtml(authorizationState?.authorizationFreshness || 'NOT_APPLICABLE')}</dd><dt>Execution freshness</dt><dd>${escapeHtml(authorizationState?.executionFreshness || 'NOT_APPLICABLE')}</dd></dl>
    ${authorizationMarkup(authorizedExecution, distribution, authorizationState)}
    ${blockerMarkup(distribution?.blockers || [...(supportSiteModel?.blockers || []), ...(routePartitionModel?.blockers || [])])}
  </section>`;
}

function authorizationMarkup(execution, distribution, authorizationState) {
  if (!execution) {
    const authority = authorizationState?.packageSemanticHash
      ? 'AUTHORIZED_HANDOFF_NOT_EXECUTED'
      : distribution ? 'UNAUTHORIZED_LEGACY_RESULT' : 'NOT_CALCULATED';
    return `<p data-empirical-authority="${authority}">Authority: ${authority}. ${escapeHtml(authorizationReason(authorizationState))}</p>${authorizationDetails(authorizationState)}`;
  }
  return `<details open data-empirical-authority="AUTHORIZED_HANDOFF">
    <summary>Authorized execution receipt: ${escapeHtml(execution.executionId)}</summary>
    <dl>
      <dt>Authorization state</dt><dd>${escapeHtml(authorizationState?.state || 'UNKNOWN')}</dd>
      <dt>Freshness</dt><dd>${escapeHtml(distribution?.freshness?.status || 'UNKNOWN')}</dd>
      <dt>Status</dt><dd>${escapeHtml(execution.status)}</dd>
      <dt>Executed</dt><dd>${escapeHtml(execution.executedAt)}</dd>
      <dt>Project</dt><dd>${escapeHtml(execution.projectId)}</dd>
      <dt>Baseline</dt><dd><code>${escapeHtml(execution.baselineSemanticHash)}</code></dd>
      <dt>Handoff</dt><dd><code>${escapeHtml(execution.handoffSemanticHash)}</code></dd>
      <dt>Projection</dt><dd><code>${escapeHtml(execution.projectionPayloadSemanticHash)}</code></dd>
      <dt>Input</dt><dd><code>${escapeHtml(execution.authorizedInputSemanticHash)}</code></dd>
      <dt>Distribution</dt><dd><code>${escapeHtml(execution.distributionSemanticHash)}</code></dd>
      <dt>Receipt</dt><dd><code>${escapeHtml(execution.semanticHash)}</code></dd>
    </dl>
    ${authorizationDetails(authorizationState)}
  </details>`;
}

function authorizationDetails(state) {
  if (!state) return '';
  const details = state.details?.length ? `<pre>${escapeHtml(JSON.stringify(state.details, null, 2))}</pre>` : '';
  return `<details ${state.calculationEligible ? '' : 'open'} class="empirical-authorization-state"><summary>${escapeHtml(state.state)}${state.reasonCode ? ` — ${escapeHtml(state.reasonCode)}` : ''}</summary>${details}</details>`;
}

function caseMarkup(distribution, supportSiteModel) {
  if (!distribution?.loadCases?.length) return '<p class="panel-empty">A current authorized empirical package is required before calculation.</p>';
  const primaryBySite = new Map((supportSiteModel?.sites || []).map((site) => [site.siteId, site.primaryEntityId]));
  const current = distribution.freshness?.status === 'CURRENT';
  return distribution.loadCases.map((loadCase) => `<section class="load-case-evidence">
    <h2>${escapeHtml(loadCase.loadCaseId)} <span>${escapeHtml(loadCase.status)}${current ? '' : ' / STALE'}</span></h2>
    ${blockerMarkup(loadCase.blockers)}
    <table><thead><tr><th>Support site</th><th>Status</th><th>Vertical force (N, source Z-up)</th><th>Contributors</th></tr></thead>
    <tbody>${loadCase.supportResults.map((row) => `<tr><td><button type="button" data-load-support-entity-id="${escapeHtml(primaryBySite.get(row.supportSiteId) || '')}">${escapeHtml(row.supportSiteId)}</button></td><td>${escapeHtml(row.status)}${current ? '' : ' / STALE'}</td><td>${force(row.verticalForceN, current && loadCase.status === 'CALCULATED' && row.status === 'CALCULATED')}</td><td>${integer(row.contributorIds?.length)}</td></tr>`).join('')}</tbody></table>
    <details><summary>Contribution ledger (${integer(loadCase.contributionLedger?.length)})</summary><pre>${escapeHtml(JSON.stringify(loadCase.contributionLedger || [], null, 2))}</pre></details>
    <details><summary>Excluded inputs (${integer(loadCase.excludedInputs?.length)})</summary><pre>${escapeHtml(JSON.stringify(loadCase.excludedInputs || [], null, 2))}</pre></details>
  </section>`).join('');
}

function blockerMarkup(blockers) {
  if (!blockers?.length) return '';
  return `<details open class="load-blockers"><summary>Blocked inputs (${blockers.length})</summary><ul>${blockers.map((row) => `<li><strong>${escapeHtml(row.code || 'BLOCKED')}</strong> ${escapeHtml(row.path || row.routeId || '')} ${escapeHtml(row.message || '')}</li>`).join('')}</ul></details>`;
}

function authorizationReason(state) {
  if (!state) return 'Authorized empirical package is not configured.';
  const messages = {
    NO_ACTIVE_DATASET: 'An active normalized dataset is required.',
    EMPIRICAL_PACKAGE_REQUIRED: 'An explicitly authorized empirical package is required.',
    AUTHORIZATION_BINDINGS_CHANGED: 'The retained authorization is stale against current mechanical or authority inputs.',
    PROJECT_DATA_CHANGED: 'Project Data changed after authorization.',
    MASTER_DATA_CHANGED: 'Master data changed after authorization.',
    DATASET_EDITED: 'The active dataset changed after authorization.',
    DATASET_REBUILT: 'The active dataset model was rebuilt after authorization.',
    DATASET_REPLACED: 'A different dataset is active.',
  };
  return messages[state.reasonCode] || state.reasonCode || 'Authorized empirical calculation is available.';
}

function force(value, acceptedCurrent) {
  if (!acceptedCurrent) return Number.isFinite(value) ? `${value.toFixed(3)} (HISTORICAL)` : 'BLOCKED';
  return Number.isFinite(value) ? value.toFixed(3) : 'BLOCKED';
}
function integer(value) { return Number.isInteger(value) ? String(value) : '—'; }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' })[character]);
}
