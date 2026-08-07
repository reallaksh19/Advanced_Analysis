import {
  createNonFeaEnrichmentImpactPreview,
  createNonFeaEnrichmentSidecar,
  resolveNonFeaEnrichment,
} from '../../core/non-fea-enrichment/index.js';
import { WorkspaceState } from '../workspace-state.js';
import { nonFeaEnrichmentStore } from './non-fea-enrichment-store.js';

/**
 * Prepares the current read-only enrichment status for Input Check.
 *
 * The only store interaction is source-currentness binding. It does not accept,
 * reject, edit or otherwise create enrichment authority.
 */
export function createCurrentNonFeaEnrichmentInputCheckState() {
  const workspace = WorkspaceState.getSnapshot();
  const sourceModel = workspace?.status === 'ready' ? workspace.dataset?.sharedModel || null : null;
  nonFeaEnrichmentStore.loadSource(sourceModel?.semanticHash || '');
  return deriveState(sourceModel, nonFeaEnrichmentStore.getSnapshot());
}

/** Backward-compatible DOM adapter for older callers. */
export function applyNonFeaEnrichmentInputCheckAdapter(container) {
  if (!container) throw new TypeError('Input Check enrichment adapter requires a container.');
  const state = createCurrentNonFeaEnrichmentInputCheckState();
  relabelHistoricalAuthority(container);
  updateGate(container, state);
  appendAuthorityPanel(container, state);
  return state;
}

function deriveState(sourceModel, snapshot) {
  if (!sourceModel) return viewState('BLOCKED', 'Load an active shared piping model.', snapshot, null, null);
  if (snapshot.migrationReport?.blockers?.length) {
    return viewState(
      'BLOCKED',
      `${snapshot.migrationReport.blockers.length} legacy migration decisions must be resolved before acceptance.`,
      snapshot,
      null,
      snapshot.migrationReport.blockers,
    );
  }
  if (snapshot.stale) {
    return viewState(
      'STALE',
      'Accepted common-enrichment records are bound to a different source semantic hash.',
      snapshot,
      null,
      [{ code: 'STALE_SIDECAR', message: 'Exact-match revalidation and explicit rebinding are required.' }],
    );
  }
  if (!snapshot.acceptedRecords.length) {
    const state = snapshot.proposals.length ? 'REVIEW_REQUIRED' : 'NOT_EVALUATED';
    const message = snapshot.proposals.length
      ? `${snapshot.proposals.length} exact enrichment proposals await acceptance or rejection.`
      : 'No accepted common-enrichment sidecar has been reviewed for the active source.';
    return viewState(state, message, snapshot, null, []);
  }
  try {
    const sidecar = createNonFeaEnrichmentSidecar({
      sourceSemanticHash: snapshot.boundSourceSemanticHash,
      records: snapshot.acceptedRecords,
    });
    const ledger = resolveNonFeaEnrichment({ sourceModel, sidecar });
    const impact = createNonFeaEnrichmentImpactPreview({ resolutionLedger: ledger });
    const message = ledger.status === 'READY'
      ? `${ledger.rows.length} entity-field resolutions are current; ${impact.affectedEntities.length} accepted enrichment effects are recorded.`
      : `${ledger.blockers.length} common-enrichment blockers prevent a current projection.`;
    return viewState(ledger.status, message, snapshot, { sidecar, ledger, impact }, ledger.blockers);
  } catch (error) {
    return viewState('BLOCKED', error instanceof Error ? error.message : String(error), snapshot, null, [{
      code: 'ENRICHMENT_ADAPTER_FAILED',
      message: error instanceof Error ? error.message : String(error),
    }]);
  }
}

function viewState(status, message, snapshot, contracts, blockers) {
  return Object.freeze({
    status,
    message,
    proposalCount: snapshot.proposals.length,
    acceptedCount: snapshot.acceptedRecords.length,
    sourceSemanticHash: snapshot.currentSourceSemanticHash || null,
    boundSourceSemanticHash: snapshot.boundSourceSemanticHash || null,
    sidecarSemanticHash: contracts?.sidecar?.semanticHash || null,
    resolutionLedgerSemanticHash: contracts?.ledger?.semanticHash || null,
    impactSemanticHash: contracts?.impact?.semanticHash || null,
    resolutionCount: contracts?.ledger?.rows?.length || 0,
    affectedEntityCount: contracts?.impact?.affectedEntities?.length || 0,
    blockers: Object.freeze([...(blockers || [])]),
  });
}

function relabelHistoricalAuthority(container) {
  const panel = [...container.querySelectorAll('.non-fea-panel')]
    .find((row) => row.textContent.includes('Existing empirical / First Cut authority'));
  if (!panel) return;
  const heading = panel.querySelector('h3');
  const paragraph = panel.querySelector('p');
  if (heading) heading.textContent = 'Historical legacy authority';
  if (paragraph) paragraph.textContent = 'Retained historical authorizations are evidence only. They cannot establish current common-checker readiness or execution authority.';
}

function updateGate(container, state) {
  const gate = [...container.querySelectorAll('.non-fea-gate')]
    .find((row) => row.querySelector('code')?.textContent === 'E_ENRICHMENT');
  if (!gate) throw new TypeError('Input Check Gate E was not found.');
  gate.classList.remove(
    'non-fea-gate--ready',
    'non-fea-gate--warning',
    'non-fea-gate--blocked',
    'non-fea-gate--stale',
  );
  gate.classList.add(`non-fea-gate--${statusClass(state.status)}`);
  const status = gate.querySelector('.non-fea-gate__heading span');
  const message = gate.querySelector('p');
  if (status) status.textContent = state.status;
  if (message) message.textContent = state.message;
  gate.dataset.enrichmentGateState = state.status;
}

function appendAuthorityPanel(container, state) {
  const aside = container.querySelector('.non-fea-input-check__layout aside');
  if (!aside) throw new TypeError('Input Check authority column was not found.');
  aside.querySelector('[data-role="non-fea-enrichment-authority"]')?.remove();
  const section = container.ownerDocument.createElement('section');
  section.className = 'non-fea-panel non-fea-side-panel';
  section.dataset.role = 'non-fea-enrichment-authority';
  section.dataset.status = state.status;
  section.innerHTML = `<header><div><span class="panel-eyebrow">COMMON ENRICHMENT AUTHORITY</span><h3>${escapeHtml(state.status)}</h3></div>
    <button type="button" data-load-calc-tab="enrichment">Review</button></header>
    <dl class="non-fea-facts">
      <dt>Proposals</dt><dd>${state.proposalCount}</dd>
      <dt>Accepted records</dt><dd>${state.acceptedCount}</dd>
      <dt>Resolutions</dt><dd>${state.resolutionCount}</dd>
      <dt>Affected entities</dt><dd>${state.affectedEntityCount}</dd>
      <dt>Source binding</dt><dd><code>${escapeHtml(compactHash(state.boundSourceSemanticHash))}</code></dd>
      <dt>Sidecar</dt><dd><code>${escapeHtml(compactHash(state.sidecarSemanticHash))}</code></dd>
      <dt>Resolution ledger</dt><dd><code>${escapeHtml(compactHash(state.resolutionLedgerSemanticHash))}</code></dd>
    </dl>
    <p class="non-fea-muted">${escapeHtml(state.message)}</p>
    ${state.blockers.length ? `<ul class="non-fea-blockers">${state.blockers.slice(0, 20).map((row) => `<li><div><strong>${escapeHtml(row.code || 'BLOCKED')}</strong><p>${escapeHtml(row.message || row.path || 'Enrichment authority is blocked.')}</p></div></li>`).join('')}</ul>` : ''}`;
  const historicalPanel = [...aside.querySelectorAll('.non-fea-panel')]
    .find((row) => row.textContent.includes('Historical legacy authority'));
  if (historicalPanel) aside.insertBefore(section, historicalPanel);
  else aside.append(section);
}

function statusClass(status) {
  if (status === 'READY') return 'ready';
  if (status === 'STALE') return 'stale';
  if (status === 'REVIEW_REQUIRED' || status === 'NOT_EVALUATED') return 'warning';
  return 'blocked';
}

function compactHash(value) {
  if (!value) return 'NOT_AVAILABLE';
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]);
}
