import { createCurrentNonFeaWorkspaceStatusProjection } from './non-fea-analysis-plan-runtime.js';
import { nonFeaCommonInputStore } from './non-fea-common-input-store.js';
import { evaluateCurrentNonFeaCommonInput } from './non-fea-common-input-runtime.js';

/**
 * Evaluates the existing common checker and then composes the canonical read-only
 * workspace status projection. Evaluation remains separate from rendering.
 */
export function evaluateCurrentNonFeaInputCheckStatus() {
  evaluateCurrentNonFeaCommonInput();
  return Object.freeze({
    snapshot: nonFeaCommonInputStore.getSnapshot(),
    status: createCurrentNonFeaWorkspaceStatusProjection(),
  });
}

/** Backward-compatible DOM adapter for older callers. */
export function applyNonFeaCommonInputCheckAdapter(container) {
  if (!container) throw new TypeError('Common Input Check adapter requires a container.');
  const { snapshot, status } = evaluateCurrentNonFeaInputCheckStatus();
  status.gates.forEach((row) => updateGate(container, row.gateId, row));
  updateMethodRows(container, snapshot.report?.methodRows || []);
  updateStatusMetrics(container, status);
  appendActions(container);
  appendAuthorityPanel(container, snapshot, status);
  container.dataset.state = status.overallState;
  container.dataset.workspaceStatusSemanticHash = status.semanticHash;
  return snapshot;
}

function updateGate(container, gateId, state) {
  const gate = [...container.querySelectorAll('.non-fea-gate')]
    .find((row) => row.querySelector('code')?.textContent === gateId);
  if (!gate) throw new TypeError(`Input Check gate ${gateId} was not found.`);
  gate.classList.remove('non-fea-gate--ready', 'non-fea-gate--warning', 'non-fea-gate--blocked', 'non-fea-gate--stale');
  gate.classList.add(`non-fea-gate--${statusClass(state.state)}`);
  const status = gate.querySelector('.non-fea-gate__heading span');
  const message = gate.querySelector('p');
  if (status) status.textContent = state.state;
  if (message) message.textContent = state.message;
  gate.dataset.commonInputState = state.state;
}

function updateMethodRows(container, methodRows) {
  const byId = new Map(methodRows.map((row) => [row.methodId, row]));
  container.querySelectorAll('[data-method-id]').forEach((element) => {
    const row = byId.get(element.dataset.methodId);
    if (!row) return;
    const chip = element.querySelector('.non-fea-chip');
    const basis = element.querySelector('td:last-child');
    if (chip) {
      chip.textContent = row.state;
      chip.className = `non-fea-chip non-fea-chip--${statusClass(row.state)}`;
    }
    if (basis) {
      basis.textContent = row.state === 'READY'
        ? `${row.requirements.length} exact requirements are current on the common candidate.`
        : row.blockers.map((item) => item.code).join(', ');
    }
  });
}

function updateStatusMetrics(container, status) {
  updateMetric(container, 'Common package', status.overallState);
  updateMetric(container, 'Checker-ready methods', status.summary.checkerReadyMethodCount);
  updateMetric(container, 'Blockers', status.blockers.length);
}

function updateMetric(container, label, value) {
  const metric = [...container.querySelectorAll('.non-fea-metric')]
    .find((row) => row.querySelector('span')?.textContent === label);
  const element = metric?.querySelector('strong');
  if (element) element.textContent = String(value);
}

function appendActions(container) {
  const actions = container.querySelector('.non-fea-input-check__actions');
  if (!actions) return;
  if (!actions.querySelector('[data-load-calc-tab="method-basis"]')) {
    actions.insertAdjacentHTML('beforeend', '<button type="button" data-load-calc-tab="method-basis">Review Method Basis</button><button type="button" data-load-calc-tab="seal-export">Seal & Export</button>');
  }
}

function appendAuthorityPanel(container, snapshot, status) {
  const aside = container.querySelector('.non-fea-input-check__layout aside');
  if (!aside) throw new TypeError('Input Check authority column was not found.');
  aside.querySelector('[data-role="non-fea-common-input-authority"]')?.remove();
  const report = snapshot.report;
  const commonInput = snapshot.commonInput;
  const section = container.ownerDocument.createElement('section');
  section.className = 'non-fea-panel non-fea-side-panel';
  section.dataset.role = 'non-fea-common-input-authority';
  section.dataset.reportState = report?.packageState || 'NOT_EVALUATED';
  section.dataset.sealState = commonInput ? (snapshot.staleness?.stale ? 'STALE' : 'CURRENT') : 'NOT_SEALED';
  section.dataset.workspaceStatusSemanticHash = status.semanticHash;
  section.innerHTML = `<header><div><span class="panel-eyebrow">COMMON CHECKER & SEAL</span><h3>${escape(status.lifecycleState)}</h3></div><button type="button" data-load-calc-tab="method-basis">Review</button></header>
    <dl class="non-fea-facts">
      <dt>Overall</dt><dd>${escape(status.overallState)}</dd>
      <dt>Ready gates</dt><dd>${status.summary.readyGateCount}/8</dd>
      <dt>Ready methods</dt><dd>${status.summary.checkerReadyMethodCount}</dd>
      <dt>Blocked methods</dt><dd>${status.summary.checkerBlockedMethodCount}</dd>
      <dt>Candidate</dt><dd><code>${escape(compact(status.commonInput.candidateSemanticHash))}</code></dd>
      <dt>Seal</dt><dd>${commonInput ? (snapshot.staleness?.stale ? 'STALE' : 'CURRENT') : 'NOT_SEALED'}</dd>
      <dt>Common input</dt><dd><code>${escape(compact(status.commonInput.commonInputSemanticHash))}</code></dd>
      <dt>Implementations</dt><dd>${status.summary.qualifiedImplementationCount}/${status.summary.implementationCount} qualified</dd>
      <dt>Authorizations</dt><dd>${status.summary.authorizationReceiptCount}</dd>
      <dt>Executions</dt><dd>${status.summary.executionReceiptCount}</dd>
      <dt>Export</dt><dd>${status.commonInput.exportSemanticHash ? 'CREATED' : 'NOT_CREATED'}</dd>
      <dt>Status projection</dt><dd><code>${escape(compact(status.semanticHash))}</code></dd>
    </dl>
    ${snapshot.error ? `<p class="non-fea-muted">${escape(snapshot.error)}</p>` : ''}
    ${status.blockers.length ? `<details><summary>Current status blockers (${status.blockers.length})</summary><ul class="non-fea-blockers">${status.blockers.slice(0, 30).map((row) => `<li><div><strong>${escape(row.scope)} · ${escape(row.code)}</strong><p>${escape(row.message)}</p></div></li>`).join('')}</ul></details>` : ''}`;
  const sealPanel = [...aside.querySelectorAll('.non-fea-panel')]
    .find((row) => row.textContent.includes('Common seal not yet issued'));
  if (sealPanel) {
    sealPanel.replaceWith(section);
  } else {
    aside.append(section);
  }
}

function statusClass(value) {
  if (value === 'READY') return 'ready';
  if (value === 'PARTIALLY_READY' || value === 'NOT_EVALUATED' || value === 'NOT_SEALED') return 'warning';
  if (value === 'STALE') return 'stale';
  return 'blocked';
}
function compact(value) {
  if (!value) return 'NOT_AVAILABLE';
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}
function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}
