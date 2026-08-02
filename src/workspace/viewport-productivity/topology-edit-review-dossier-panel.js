import { TOPOLOGY_EDIT_REVIEW_DOSSIER_SCHEMA } from './topology-edit-review-dossier.js';

export function renderTopologyEditReviewDossierPanel(element, dossier = null) {
  if (!element) throw new TypeError('Review dossier panel element is required.');
  element.innerHTML = topologyEditReviewDossierMarkup(dossier);
}

export function topologyEditReviewDossierMarkup(dossier = null) {
  if (!dossier) {
    return shell(`
      <p>Build one deterministic display-review dossier from the current bookmarks, provenance, comparison, issues, inspection and route evidence.</p>
      <p><strong>Not governed audit export:</strong> the dossier does not modify or certify topology, calculations, workspace state or release status.</p>`, false);
  }
  if (dossier.schema !== TOPOLOGY_EDIT_REVIEW_DOSSIER_SCHEMA) {
    throw new TypeError(`Review dossier panel requires ${TOPOLOGY_EDIT_REVIEW_DOSSIER_SCHEMA}.`);
  }
  const summary = dossier.summary;
  return shell(`
    <dl class="topology-edit-review-dossier__summary">
      ${row('Bookmarks', summary.bookmarkCount)}
      ${row('Provenance entries', summary.provenanceEntryCount)}
      ${row('Comparison changes', summary.comparisonChangeCount)}
      ${row('Spatial issues', summary.issueCount)}
      ${row('Inspection', summary.inspectionStatus)}
      ${row('Route', summary.routeStatus)}
      ${row('Visual diagnostics', summary.visualDiagnosticCount)}
      ${row('Coverage IDs', summary.coverageCanonicalCount)}
    </dl>
    <p>Coverage: ${escapeHtml(dossier.coverageCanonicalIds.join(', ') || 'No canonical IDs')}</p>
    <p>Dossier hash: <code>${escapeHtml(dossier.dossierHash)}</code></p>
    <p>${escapeHtml(dossier.disclosure)}</p>`, true);
}

function shell(content, ready) {
  return `
    <header class="topology-edit-review-dossier__header">
      <strong>Review dossier handoff</strong>
      <div class="topology-edit-review-dossier__actions">
        <button type="button" data-action="build-review-dossier">Build dossier</button>
        <button type="button" data-action="focus-review-dossier"${ready ? '' : ' disabled'}>Focus coverage</button>
        <button type="button" data-action="download-review-dossier"${ready ? '' : ' disabled'}>Download JSON</button>
        <button type="button" data-action="clear-review-dossier"${ready ? '' : ' disabled'}>Clear dossier</button>
      </div>
    </header>
    <div class="topology-edit-review-dossier__body">${content}</div>`;
}
function row(label, value) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}
