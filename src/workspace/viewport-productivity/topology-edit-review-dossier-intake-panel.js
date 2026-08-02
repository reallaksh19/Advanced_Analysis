import {
  assertTopologyEditReviewDossierIntake,
} from './topology-edit-review-dossier-intake.js';

export function renderTopologyEditReviewDossierIntakePanel(
  element,
  { intake = null, fileName = null, error = null } = {},
) {
  if (!element) throw new TypeError('Review dossier intake panel element is required.');
  element.innerHTML = topologyEditReviewDossierIntakeMarkup({ intake, fileName, error });
}

export function topologyEditReviewDossierIntakeMarkup({
  intake = null,
  fileName = null,
  error = null,
} = {}) {
  if (intake) assertTopologyEditReviewDossierIntake(intake);
  const hasCoverage = Boolean(intake?.availableCanonicalIds?.length);
  const canReplay = Boolean(intake?.viewpointReplayEligible);
  const canClear = Boolean(intake || error || fileName);
  return `
    <header class="topology-edit-dossier-intake__header">
      <strong>Review dossier intake</strong>
      <span title="Local display-review reconciliation only; does not import topology, commands, persistence, audit, calculations, or release state.">ⓘ</span>
      <div class="topology-edit-dossier-intake__actions">
        <button type="button" data-action="choose-review-dossier">Choose JSON</button>
        <button type="button" data-action="focus-dossier-intake"${hasCoverage ? '' : ' disabled'}>Focus available</button>
        <button type="button" data-action="apply-dossier-viewpoint"${canReplay ? '' : ' disabled'}>Apply viewpoint</button>
        <button type="button" data-action="clear-dossier-intake"${canClear ? '' : ' disabled'}>Clear intake</button>
      </div>
    </header>
    <div class="topology-edit-dossier-intake__body">
      ${error ? `<p role="alert"><strong>Intake rejected:</strong> ${escapeHtml(error)}</p>` : ''}
      ${intake ? intakeMarkup(intake, fileName) : idleMarkup(fileName)}
    </div>`;
}

function idleMarkup(fileName) {
  return `<p>${fileName
    ? `No accepted dossier is retained from ${escapeHtml(fileName)}.`
    : 'Choose a Wave 7 review dossier JSON file to verify integrity and reconcile it with the current review basis.'}</p>`;
}

function intakeMarkup(intake, fileName) {
  const evidenceRows = intake.evidenceComparisons.map((row) => `
    <tr>
      <td>${escapeHtml(row.key)}</td>
      <td>${escapeHtml(row.status)}</td>
      <td><code>${escapeHtml(shortHash(row.savedHash))}</code></td>
      <td><code>${escapeHtml(shortHash(row.currentHash))}</code></td>
    </tr>`).join('');
  return `
    <dl class="topology-edit-dossier-intake__summary">
      ${row('File', fileName || 'Local JSON')}
      ${row('Dossier hash', intake.dossierHash)}
      ${row('Basis', intake.basisStatus)}
      ${row('Coverage', intake.coverageStatus)}
      ${row('Available IDs', intake.summary.availableCanonicalCount)}
      ${row('Missing IDs', intake.summary.missingCanonicalCount)}
      ${row('Viewpoint replay', intake.viewpointReplayEligible ? 'ELIGIBLE' : 'BLOCKED')}
      ${row('Intake hash', intake.intakeHash)}
    </dl>
    ${intake.missingCanonicalIds.length
      ? `<p role="alert">Missing exact canonical IDs: ${escapeHtml(intake.missingCanonicalIds.join(', '))}</p>`
      : '<p>All requested canonical coverage IDs exist in the current topology.</p>'}
    <table class="topology-edit-dossier-intake__evidence">
      <thead><tr><th>Evidence</th><th>Status</th><th>Saved</th><th>Current</th></tr></thead>
      <tbody>${evidenceRows}</tbody>
    </table>
    <p class="topology-edit-dossier-intake__disclosure">${escapeHtml(intake.disclosure)}</p>`;
}

function row(label, value) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}
function shortHash(value) {
  return value ? String(value).slice(0, 16) : '—';
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}
