import {
  assertTopologyEditReviewResponseLedger,
} from './topology-edit-review-response-ledger.js';
import {
  assertTopologyEditReviewResponseLedgerIntake,
} from './topology-edit-review-response-ledger-intake.js';

export function renderTopologyEditReviewResponseLedgerPanel(
  element,
  options = {},
) {
  if (!element) throw new TypeError('Review ledger panel element is required.');
  element.innerHTML = topologyEditReviewResponseLedgerMarkup(options);
}

export function topologyEditReviewResponseLedgerMarkup({
  ledger = null,
  intake = null,
  fileName = null,
  error = null,
  currentResponseHash = null,
  selectedResponseHash = null,
} = {}) {
  if (ledger) assertTopologyEditReviewResponseLedger(ledger);
  if (intake) assertTopologyEditReviewResponseLedgerIntake(intake);
  const packageHashes = ledger?.packages?.map((entry) => entry.response.responseHash) ?? [];
  const selected = packageHashes.includes(selectedResponseHash)
    ? selectedResponseHash
    : packageHashes[0] ?? null;
  const currentAlreadyAdded = Boolean(currentResponseHash && packageHashes.includes(currentResponseHash));
  const canAdd = Boolean(currentResponseHash && !currentAlreadyAdded);
  const canDownload = Boolean(ledger?.packages?.length);
  const canRemove = Boolean(selected && (intake?.dossierStatus ?? 'MATCH') === 'MATCH');
  const canFocus = Boolean(intake?.conflictFocusEligible);
  const canClear = Boolean(ledger || error || fileName);
  return `
    <header class="topology-edit-review-ledger__header">
      <strong>Multi-response review ledger</strong>
      <span title="Display-review aggregation only; does not resolve findings or approve engineering.">ⓘ</span>
      <div class="topology-edit-review-ledger__actions">
        <button type="button" data-action="add-review-ledger-response"${canAdd ? '' : ' disabled'}>${currentAlreadyAdded ? 'Current response added' : 'Add current response'}</button>
        <button type="button" data-action="choose-review-ledger">Choose ledger JSON</button>
        <button type="button" data-action="download-review-ledger"${canDownload ? '' : ' disabled'}>Download ledger</button>
        <button type="button" data-action="focus-review-ledger-conflicts"${canFocus ? '' : ' disabled'}>Focus conflicts</button>
        <button type="button" data-action="clear-review-ledger"${canClear ? '' : ' disabled'}>Clear ledger</button>
      </div>
    </header>
    <div class="topology-edit-review-ledger__body">
      ${error ? `<p role="alert"><strong>Ledger rejected:</strong> ${escapeHtml(error)}</p>` : ''}
      ${ledger ? ledgerMarkup(ledger, intake, fileName, selected, canRemove) : idleMarkup(fileName)}
    </div>`;
}

function ledgerMarkup(ledger, intake, fileName, selected, canRemove) {
  return `
    <dl class="topology-edit-review-ledger__summary">
      ${summaryRow('File', fileName || 'Locally assembled')}
      ${summaryRow('Ledger hash', ledger.ledgerHash)}
      ${summaryRow('Source dossier', ledger.sourceDossierHash)}
      ${summaryRow('Packages', ledger.summary.packageCount)}
      ${summaryRow('Answered issues', `${ledger.summary.answeredIssueCount}/${ledger.summary.issueCount}`)}
      ${summaryRow('Conflicting issues', ledger.summary.conflictingIssueCount)}
      ${summaryRow('Dossier reconciliation', intake?.dossierStatus ?? 'LOCAL')}
      ${summaryRow('Issue evidence', intake?.issueSetStatus ?? 'LOCAL')}
      ${summaryRow('Coverage', intake?.coverageStatus ?? 'LOCAL')}
    </dl>
    ${packageControls(ledger, selected, canRemove, intake)}
    ${intakeAlerts(intake)}
    ${issueTable(ledger)}
    <p class="topology-edit-review-ledger__disclosure">${escapeHtml(ledger.disclosure)}</p>`;
}

function packageControls(ledger, selected, canRemove, currentIntake) {
  const currentByHash = new Map(
    (currentIntake?.packageComparisons ?? [])
      .map((row) => [row.responseHash, row]),
  );
  const options = ledger.packages.map(({ response, intake }) => {
    const current = currentByHash.get(response.responseHash);
    const basisStatus = current?.basisStatus ?? intake.basisStatus;
    return `
    <option value="${escapeHtml(response.responseHash)}"${response.responseHash === selected ? ' selected' : ''}>
      ${escapeHtml(`${response.responseHash.slice(0, 16)} — ${response.summary.responseCount} row(s) — ${basisStatus}`)}
    </option>`;
  }).join('');
  return `
    <div class="topology-edit-review-ledger__packages">
      <label>Ledger response
        <select data-role="review-ledger-response">${options}</select>
      </label>
      <button type="button" data-action="remove-review-ledger-response"${canRemove ? '' : ' disabled'}>Remove selected response</button>
    </div>`;
}

function intakeAlerts(intake) {
  if (!intake) return '';
  const alerts = [];
  if (intake.missingIssueIds.length) alerts.push(`Missing dossier issues: ${intake.missingIssueIds.join(', ')}`);
  if (intake.addedIssueIds.length) alerts.push(`New current issues: ${intake.addedIssueIds.join(', ')}`);
  if (intake.driftedIssueIds.length) alerts.push(`Issue evidence drift: ${intake.driftedIssueIds.join(', ')}`);
  if (intake.missingCanonicalIds.length) alerts.push(`Missing canonical IDs: ${intake.missingCanonicalIds.join(', ')}`);
  return alerts.map((message) => `<p role="alert">${escapeHtml(message)}</p>`).join('');
}

function issueTable(ledger) {
  const rows = ledger.issueMatrix.map((row) => `
    <tr data-ledger-issue="${escapeHtml(row.issueId)}" data-ledger-status="${escapeHtml(row.status)}">
      <td>${escapeHtml(row.issueId)}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(row.dispositions.join(', ') || '—')}</td>
      <td>${escapeHtml(row.responseCount)}</td>
      <td>${escapeHtml(row.canonicalIds.join(', ') || '—')}</td>
    </tr>`).join('');
  return `
    <table class="topology-edit-review-ledger__issues">
      <thead><tr><th>Issue</th><th>Status</th><th>Dispositions</th><th>Responses</th><th>Canonical IDs</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No dossier issues.</td></tr>'}</tbody>
    </table>`;
}

function idleMarkup(fileName) {
  return `<p>${fileName
    ? `No accepted review ledger is retained from ${escapeHtml(fileName)}.`
    : 'Create or import response packages, then add them to a deterministic review ledger.'}</p>`;
}
function summaryRow(label, value) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}
