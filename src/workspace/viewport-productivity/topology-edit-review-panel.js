import { TOPOLOGY_EDIT_PROVENANCE_SCHEMA } from './topology-edit-provenance-model.js';

export function renderTopologyEditReviewPanel(element, { records = [], provenance } = {}) {
  if (!element) throw new TypeError('Review panel element is required.');
  element.innerHTML = topologyEditReviewMarkup({ records, provenance });
}

export function topologyEditReviewMarkup({ records = [], provenance } = {}) {
  const provenanceMarkup = provenance?.schema === TOPOLOGY_EDIT_PROVENANCE_SCHEMA
    ? currentProvenanceMarkup(provenance)
    : '<p>Provenance is unavailable.</p>';
  const bookmarks = records.length
    ? `<ol>${records.map(bookmarkMarkup).join('')}</ol>`
    : '<p>No session review bookmarks saved.</p>';
  return `
    <header class="topology-edit-review__header">
      <strong>Review bookmarks</strong>
      <span title="Session-only display artifact; not included in draft persistence, audit export, or workspace commit.">ⓘ</span>
    </header>
    <div class="topology-edit-review__capture">
      <label>Title <input type="text" data-review-title maxlength="80" value="Current review"></label>
      <label>Note <input type="text" data-review-note maxlength="240" placeholder="Optional review note"></label>
      <button type="button" data-action="save-review-bookmark">Save review</button>
    </div>
    <section class="topology-edit-review__bookmarks"><h4>Session-only viewpoints</h4>${bookmarks}</section>
    <section class="topology-edit-review__provenance"><h4>Current provenance</h4>${provenanceMarkup}</section>`;
}

function bookmarkMarkup(record) {
  return `<li data-review-bookmark="${escapeHtml(record.bookmarkId)}">
    <strong>${escapeHtml(record.title)}</strong>
    <span>#${escapeHtml(record.sequence)}</span>
    ${record.note ? `<p>${escapeHtml(record.note)}</p>` : ''}
    <button type="button" data-action="restore-review-bookmark" data-review-bookmark-id="${escapeHtml(record.bookmarkId)}">Restore</button>
    <button type="button" data-action="delete-review-bookmark" data-review-bookmark-id="${escapeHtml(record.bookmarkId)}">Delete</button>
  </li>`;
}

function currentProvenanceMarkup(model) {
  if (model.status === 'EMPTY') return '<p>Select a canonical node or edge to inspect source evidence.</p>';
  if (model.status === 'STALE_SELECTION') return `<p role="alert">Stale canonical IDs: ${escapeHtml(model.staleIds.join(', '))}.</p>`;
  return `<p>Evidence hash: <code>${escapeHtml(model.provenanceHash)}</code></p>${model.entries.map(entryMarkup).join('')}`;
}

function entryMarkup(entry) {
  const details = entry.objectKind === 'node'
    ? [row('Position', evidenceValue(entry.position)), row('Incident edges', entry.incidentEdgeIds.join(', ') || 'None'), row('Components', entry.componentKeys.join(', ') || 'UNAVAILABLE'), row('Supports', entry.supportIds.join(', ') || 'None'), row('Junctions', entry.junctionIds.join(', ') || 'None')]
    : [row('Endpoints', entry.endpointIds?.join(' → ') || 'UNAVAILABLE'), row('Component key', evidenceValue(entry.componentKey)), row('Component type', evidenceValue(entry.componentType)), row('Branch', evidenceValue(entry.branchId)), row('Line', evidenceValue(entry.lineId)), row('Bore', evidenceValue(entry.dimensions?.boreMm, ' mm')), row('Outside diameter', evidenceValue(entry.dimensions?.outsideDiameterMm, ' mm'))];
  details.push(row('Source paths', entry.sourcePaths?.join(', ') || 'UNAVAILABLE'));
  details.push(row('Workspace entities', entry.workspaceEntityIds?.join(', ') || 'UNAVAILABLE'));
  details.push(row('Diagnostics', entry.diagnostics?.map((item) => item.code).join(', ') || 'None'));
  return `<article data-provenance-id="${escapeHtml(entry.canonicalId)}"><h5>${escapeHtml(entry.objectKind)} ${escapeHtml(entry.canonicalId)}</h5><dl>${details.join('')}</dl></article>`;
}

function evidenceValue(value, suffix = '') {
  if (value?.status === 'AVAILABLE') return `${typeof value.value === 'object' ? JSON.stringify(value.value) : value.value}${suffix}`;
  if (value?.status === 'UNAVAILABLE') return value.code;
  if (value && Number.isFinite(value.x)) return `(${value.x}, ${value.y}, ${value.z})`;
  return 'UNAVAILABLE';
}
function row(label, value) { return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
