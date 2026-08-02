import {
  assertTopologyEditReviewResponse,
  TOPOLOGY_EDIT_REVIEW_RESPONSE_DISPOSITIONS,
  TOPOLOGY_EDIT_REVIEW_RESPONSE_NOTE_MAX_CHARS,
  topologyEditDossierIssueEntries,
} from './topology-edit-review-response.js';
import {
  assertTopologyEditReviewResponseIntake,
} from './topology-edit-review-response-intake.js';

export function renderTopologyEditReviewResponsePanel(
  element,
  {
    dossier = null,
    response = null,
    intake = null,
    fileName = null,
    error = null,
    selectedIssueId = null,
  } = {},
) {
  if (!element) throw new TypeError('Review response panel element is required.');
  element.innerHTML = topologyEditReviewResponseMarkup({
    dossier,
    response,
    intake,
    fileName,
    error,
    selectedIssueId,
  });
}

export function topologyEditReviewResponseMarkup({
  dossier = null,
  response = null,
  intake = null,
  fileName = null,
  error = null,
  selectedIssueId = null,
} = {}) {
  if (response) assertTopologyEditReviewResponse(response);
  if (intake) assertTopologyEditReviewResponseIntake(intake);
  const issues = dossier ? topologyEditDossierIssueEntries(dossier) : [];
  const selected = issues.find((row) => row.issueId === selectedIssueId) ?? issues[0] ?? null;
  const saved = response?.responses?.find((row) => row.issueId === selected?.issueId) ?? null;
  const canEdit = Boolean(selected);
  const canDownload = Boolean(response?.responses?.length);
  const canFocus = Boolean(intake?.focusEligible);
  const canClear = Boolean(response || intake || error || fileName);
  return `
    <header class="topology-edit-review-response__header">
      <strong>Review response round trip</strong>
      <span title="Display-review communication only; does not resolve checker findings or approve engineering.">ⓘ</span>
      <div class="topology-edit-review-response__actions">
        <button type="button" data-action="choose-review-response">Choose response JSON</button>
        <button type="button" data-action="download-review-response"${canDownload ? '' : ' disabled'}>Download response</button>
        <button type="button" data-action="focus-review-response"${canFocus ? '' : ' disabled'}>Focus response</button>
        <button type="button" data-action="clear-review-response"${canClear ? '' : ' disabled'}>Clear response</button>
      </div>
    </header>
    <div class="topology-edit-review-response__body">
      ${error ? `<p role="alert"><strong>Response rejected:</strong> ${escapeHtml(error)}</p>` : ''}
      ${dossier ? editorMarkup(issues, selected, saved) : '<p>Build or import a review dossier before creating or reconciling a response package.</p>'}
      ${response ? responseMarkup(response, intake, fileName) : idleMarkup(fileName)}
    </div>`;
}

function editorMarkup(issues, selected, saved) {
  if (!issues.length) return '<p>The active dossier contains no anchored issue entries to respond to.</p>';
  const issueOptions = issues.map((issue) => `
    <option value="${escapeHtml(issue.issueId)}"${issue.issueId === selected?.issueId ? ' selected' : ''}>
      ${escapeHtml(`${issue.issueId} — ${issue.severity} — ${issue.kind}`)}
    </option>`).join('');
  const dispositions = TOPOLOGY_EDIT_REVIEW_RESPONSE_DISPOSITIONS.map((value) => `
    <option value="${value}"${value === (saved?.disposition ?? 'ACKNOWLEDGED') ? ' selected' : ''}>${value}</option>`).join('');
  return `
    <div class="topology-edit-review-response__editor">
      <label>Issue
        <select data-role="review-response-issue">${issueOptions}</select>
      </label>
      <label>Response disposition
        <select data-role="review-response-disposition">${dispositions}</select>
      </label>
      <label>Review note
        <textarea data-role="review-response-note" maxlength="${TOPOLOGY_EDIT_REVIEW_RESPONSE_NOTE_MAX_CHARS}" rows="3">${escapeHtml(saved?.note ?? '')}</textarea>
      </label>
      <div>
        <button type="button" data-action="save-review-response"${selected ? '' : ' disabled'}>Save response</button>
        <button type="button" data-action="remove-review-response"${saved ? '' : ' disabled'}>Remove response</button>
      </div>
      <p>${escapeHtml(selected?.message ?? '')}</p>
    </div>`;
}

function responseMarkup(response, intake, fileName) {
  const rows = response.responses.map((row) => `
    <tr>
      <td>${escapeHtml(row.issueId)}</td>
      <td>${escapeHtml(row.disposition)}</td>
      <td>${escapeHtml(row.note || '—')}</td>
      <td>${escapeHtml(row.canonicalIds.join(', ') || '—')}</td>
    </tr>`).join('');
  return `
    <dl class="topology-edit-review-response__summary">
      ${summaryRow('File', fileName || 'Locally authored')}
      ${summaryRow('Response hash', response.responseHash)}
      ${summaryRow('Source dossier', response.sourceDossierHash)}
      ${summaryRow('Responses', response.summary.responseCount)}
      ${summaryRow('Dossier reconciliation', intake?.dossierStatus ?? 'LOCAL')}
      ${summaryRow('Issue reconciliation', intake?.responseStatus ?? 'LOCAL')}
      ${summaryRow('Basis', intake?.basisStatus ?? 'LOCAL')}
      ${summaryRow('Coverage', intake?.coverageStatus ?? 'LOCAL')}
    </dl>
    ${intake?.unknownIssueIds?.length ? `<p role="alert">Unknown exact issue IDs: ${escapeHtml(intake.unknownIssueIds.join(', '))}</p>` : ''}
    ${intake?.driftedIssueIds?.length ? `<p role="alert">Issue evidence drift: ${escapeHtml(intake.driftedIssueIds.join(', '))}</p>` : ''}
    ${intake?.missingCanonicalIds?.length ? `<p role="alert">Missing canonical IDs: ${escapeHtml(intake.missingCanonicalIds.join(', '))}</p>` : ''}
    <table class="topology-edit-review-response__rows">
      <thead><tr><th>Issue</th><th>Disposition</th><th>Note</th><th>Canonical IDs</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No response rows.</td></tr>'}</tbody>
    </table>
    <p class="topology-edit-review-response__disclosure">${escapeHtml(response.disclosure)}</p>`;
}

function idleMarkup(fileName) {
  return `<p>${fileName
    ? `No accepted response package is retained from ${escapeHtml(fileName)}.`
    : 'Select an exact dossier issue to create a response, or choose a response JSON file to reconcile.'}</p>`;
}
function summaryRow(label, value) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}
